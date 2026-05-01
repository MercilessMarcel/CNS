declare global {
  interface Window {
    __TAURI__?: any;
    __TAURI_INVOKE__?: (command: string, payload?: any) => Promise<any>;
  }
}

import { APP_VERSION } from './version';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  id: string;
  time: string;
  level: LogLevel;
  category: string;
  message: string;
  context?: Record<string, unknown>;
}

export interface LogExportDocument {
  schemaVersion: 2;
  exportedAt: string;
  appVersion: string;
  sessionId: string;
  instructionsForMaintainer: string;
  environment: {
    userAgent: string;
    language: string;
    platform: string;
    href: string;
    timezone: string;
  };
  supportBundle: Record<string, unknown>;
  logStats: {
    total: number;
    byLevel: Record<LogLevel, number>;
    categories: Record<string, number>;
  };
  logs: LogEntry[];
}

const STORAGE_KEY = 'cns_logs';
const MAX_LOGS = 400;

const SENSITIVE_KEYS = new Set([
  'token',
  'authorization',
  'password',
  'secret',
  'cookies',
  'cookiescontent',
  'cookie',
  'set-cookie',
  'gh_token',
  'bearer',
  'x-github-token',
]);

let seq = 0;

function secureRandomSuffix(length = 6): string {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyz';
  const bytes = new Uint8Array(length);
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[bytes[i] % 36];
  }
  return out;
}

function nextId(): string {
  return `${Date.now().toString(36)}-${(++seq).toString(36)}-${secureRandomSuffix(6)}`;
}

function inferCategory(message: string): string {
  const m = message.match(/^\[([^\]]+)\]/);
  if (m) return m[1].toLowerCase().replace(/\s+/g, '_');
  return 'app';
}

function looksSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  if (SENSITIVE_KEYS.has(k)) return true;
  if (k.endsWith('_token') || k === 'accesstoken' || k === 'refreshtoken') return true;
  if (k.includes('password')) return true;
  if (k.includes('secret')) return true;
  return false;
}

function safeCloneForStorage(value: unknown, depth: number, seen: WeakMap<object, string>): unknown {
  if (depth > 10) return '[MaxDepth]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (/^ghp_[a-zA-Z0-9]{20,}$/.test(value) || /^github_pat_[a-zA-Z0-9_]+$/.test(value)) {
      return '[REDACTED_TOKEN]';
    }
    if (value.length > 12000) return `${value.slice(0, 6000)}…[truncated ${value.length} chars]`;
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (value instanceof Error) {
    const o: Record<string, unknown> = {
      type: 'Error',
      name: value.name,
      message: value.message,
    };
    if (value.stack) o.stack = value.stack;
    const anyErr = value as Error & { code?: string; retryable?: boolean };
    if (typeof anyErr.code === 'string') o.code = anyErr.code;
    if (typeof anyErr.retryable === 'boolean') o.retryable = anyErr.retryable;
    return o;
  }
  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]';
    if (Array.isArray(value)) {
      seen.set(value as object, '[Circular]');
      const cap = 80;
      const out = value.slice(0, cap).map((v) => safeCloneForStorage(v, depth + 1, seen));
      if (value.length > cap) out.push(`…[${value.length - cap} more items]`);
      return out;
    }
    seen.set(value as object, '[Circular]');
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (looksSensitiveKey(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = safeCloneForStorage(v, depth + 1, seen);
      }
    }
    return out;
  }
  if (typeof value === 'function') return '[Function]';
  return String(value);
}

function prepareContext(data: unknown): Record<string, unknown> | undefined {
  if (data === undefined) return undefined;
  const cloned = safeCloneForStorage(data, 0, new WeakMap()) as unknown;
  if (cloned === undefined) return undefined;
  if (cloned !== null && typeof cloned === 'object' && !Array.isArray(cloned)) {
    return cloned as Record<string, unknown>;
  }
  return { value: cloned };
}

function migrateEntry(raw: unknown, index: number): LogEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (typeof e.time !== 'string' || typeof e.message !== 'string') return null;
  const levelRaw = e.level;
  const level: LogLevel =
    levelRaw === 'warn' || levelRaw === 'error' || levelRaw === 'info' ? levelRaw : 'info';
  let context: Record<string, unknown> | undefined;
  if (e.context && typeof e.context === 'object' && !Array.isArray(e.context)) {
    context = e.context as Record<string, unknown>;
  } else if (typeof e.data === 'string') {
    try {
      const parsed = JSON.parse(e.data);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        context = parsed as Record<string, unknown>;
      } else {
        context = { legacy: parsed };
      }
    } catch {
      context = { legacy: e.data };
    }
  }
  const category =
    typeof e.category === 'string' ? e.category : inferCategory(String(e.message));
  const id = typeof e.id === 'string' ? e.id : `legacy:${index}:${e.time}`;
  return { id, time: e.time, level, category, message: String(e.message), context };
}

const MAINTAINER_EXPORT_GUIDE =
  'CNS support export: no raw tokens or cookie contents. Use supportBundle for repo identity and client hints. Search logs for [GitHub API] and last error entries. x-github-request-id on API lines ties to GitHub Support. For workflow failures compare owner/repo/workflow download.yml and Actions tab run id from job logs.';

export function getClientRuntimeInfo(): Record<string, unknown> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { context: 'non-browser' };
  }
  let hrefPage = '';
  try {
    hrefPage = window.location.href.split('?')[0].split('#')[0];
  } catch {
    hrefPage = '';
  }
  let lsKeys: string[] = [];
  try {
    lsKeys = Object.keys(window.localStorage).filter((k) => k.startsWith('cns_'));
  } catch {
    lsKeys = [];
  }
  return {
    hrefPage,
    viewport: {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    navigator: {
      language: navigator.language,
      languages: navigator.languages ? [...navigator.languages].slice(0, 8) : undefined,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
    },
    localStorageKeysCns: lsKeys,
  };
}

class Logger {
  private logs: LogEntry[] = [];
  private initialized = false;
  private listeners = new Set<() => void>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly sessionId: string;
  private supportContextFn: (() => Record<string, unknown>) | null = null;

  constructor() {
    if (typeof sessionStorage !== 'undefined') {
      let sid = sessionStorage.getItem('cns_log_session');
      if (!sid) {
        sid = nextId();
        sessionStorage.setItem('cns_log_session', sid);
      }
      this.sessionId = sid;
    } else {
      this.sessionId = nextId();
    }
  }

  init() {
    if (this.initialized) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          this.logs = parsed
            .map((x, i) => migrateEntry(x, i))
            .filter((x): x is LogEntry => x !== null);
        } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { logs?: unknown }).logs)) {
          this.logs = ((parsed as { logs: unknown[] }).logs || [])
            .map((x, i) => migrateEntry(x, i))
            .filter((x): x is LogEntry => x !== null);
        }
      }
    } catch {
      this.logs = [];
    }
    this.initialized = true;
    const entry: LogEntry = {
      id: nextId(),
      time: new Date().toISOString(),
      level: 'info',
      category: 'diagnostics',
      message: '[Diagnostics] Logger initialized',
      context: prepareContext({
        restoredCount: this.logs.length,
        sessionId: this.sessionId,
      }),
    };
    this.logs.push(entry);
    while (this.logs.length > MAX_LOGS) {
      this.logs.shift();
    }
    this.flushSave();
    this.notify();
    console.info('[CNS INFO][diagnostics]', entry.message, entry.context);
  }

  registerSupportContext(fn: () => Record<string, unknown>) {
    this.supportContextFn = fn;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
      }
    });
  }

  private flushSave() {
    this.saveTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
    } catch {
    }
  }

  private saveSoon() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flushSave(), 200);
  }

  private add(level: LogLevel, message: string, data?: unknown, categoryOverride?: string) {
    if (!this.initialized) this.init();
    const category = categoryOverride ?? inferCategory(message);
    const context = prepareContext(data);
    const entry: LogEntry = {
      id: nextId(),
      time: new Date().toISOString(),
      level,
      category,
      message,
      context,
    };

    this.logs.push(entry);
    while (this.logs.length > MAX_LOGS) {
      this.logs.shift();
    }

    this.saveSoon();
    this.notify();

    const consoleMethod =
      level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
    if (context && Object.keys(context).length) {
      consoleMethod(`[CNS ${level.toUpperCase()}][${category}]`, message, context);
    } else {
      consoleMethod(`[CNS ${level.toUpperCase()}][${category}]`, message);
    }
  }

  info(message: string, data?: unknown, categoryOverride?: string) {
    this.add('info', message, data, categoryOverride);
  }

  warn(message: string, data?: unknown, categoryOverride?: string) {
    this.add('warn', message, data, categoryOverride);
  }

  error(message: string, data?: unknown, categoryOverride?: string) {
    this.add('error', message, data, categoryOverride);
  }

  getAppVersion() {
    return APP_VERSION;
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  buildExportDocument(): LogExportDocument {
    const byLevel: Record<LogLevel, number> = { info: 0, warn: 0, error: 0 };
    const categories: Record<string, number> = {};
    for (const e of this.logs) {
      byLevel[e.level]++;
      categories[e.category] = (categories[e.category] ?? 0) + 1;
    }
    const env =
      typeof navigator !== 'undefined'
        ? {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            href: typeof location !== 'undefined' ? location.href.split('?')[0] : '',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }
        : {
            userAgent: '',
            language: '',
            platform: '',
            href: '',
            timezone: '',
          };
    let integration: unknown = { note: 'registerSupportContext not set' };
    if (this.supportContextFn) {
      try {
        integration = this.supportContextFn();
      } catch (err) {
        integration = { supportContextError: err };
      }
    }
    const supportBundle =
      (prepareContext({
        clientRuntime: getClientRuntimeInfo(),
        integration,
      }) as Record<string, unknown> | undefined) ?? {};
    return {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      sessionId: this.sessionId,
      instructionsForMaintainer: MAINTAINER_EXPORT_GUIDE,
      environment: env,
      supportBundle,
      logStats: { total: this.logs.length, byLevel, categories },
      logs: this.logs.map((e) => ({ ...e })),
    };
  }

  export(): string {
    return JSON.stringify(this.buildExportDocument(), null, 2);
  }

  exportText(): string {
    const doc = this.buildExportDocument();
    const lines: string[] = [
      '════════════════════════════════════════',
      'CNS diagnostic log export (schema v2)',
      doc.instructionsForMaintainer,
      '════════════════════════════════════════',
      `App version: ${doc.appVersion}`,
      `Exported (UTC): ${doc.exportedAt}`,
      `Session id: ${doc.sessionId}`,
      `Entries: ${doc.logStats.total}`,
      `By level: info=${doc.logStats.byLevel.info} warn=${doc.logStats.byLevel.warn} error=${doc.logStats.byLevel.error}`,
      '════════════════════════════════════════',
      '',
      '--- supportBundle (sanitized) ---',
      JSON.stringify(doc.supportBundle, null, 2),
      '',
      '--- Environment ---',
      JSON.stringify(doc.environment, null, 2),
      '',
      '--- Categories ---',
      JSON.stringify(doc.logStats.categories, null, 2),
      '',
      '--- Log lines ---',
      '',
    ];
    for (const e of doc.logs) {
      lines.push(`${e.time} [${e.level.toUpperCase()}] [${e.category}] ${e.message}`);
      if (e.context && Object.keys(e.context).length) {
        lines.push(JSON.stringify(e.context, null, 2));
        lines.push('');
      }
    }
    return lines.join('\n');
  }

  clear() {
    this.logs = [];
    this.flushSave();
    this.add('info', '[Diagnostics] Logs cleared', undefined, 'diagnostics');
  }

  async exportToFile(): Promise<string> {
    const content = this.export();
    const invoke =
      typeof window.__TAURI__?.invoke === 'function'
        ? window.__TAURI__!.invoke
        : typeof window.__TAURI_INVOKE__ === 'function'
          ? window.__TAURI_INVOKE__
          : typeof window.__TAURI__?.tauri?.invoke === 'function'
            ? window.__TAURI__.tauri.invoke
            : undefined;

    if (typeof invoke !== 'function') {
      const error = new Error('Tauri invoke unavailable');
      this.error('[Diagnostics] export_logs_to_file unavailable', { error: error.message });
      throw error;
    }

    try {
      const result = await invoke('export_logs_to_file', { content });
      if (typeof result === 'string') {
        this.info('[Diagnostics] Logs exported to disk', { path: result });
        return result;
      }
      throw new Error('Invalid response from export_logs_to_file');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.error('[Diagnostics] export_logs_to_file failed', { error: message });
      throw err;
    }
  }
}

export const logger = new Logger();
