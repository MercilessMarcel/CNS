declare global {
  interface Window {
    __TAURI__?: any;
    __TAURI_INVOKE__?: (command: string, payload?: any) => Promise<any>;
  }
}

interface LogEntry {
  time: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  data?: string;
}

const STORAGE_KEY = 'cns_logs';
const MAX_LOGS = 50;

class Logger {
  private logs: LogEntry[] = [];
  private initialized = false;

  init() {
    if (this.initialized) return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.logs = JSON.parse(stored);
      }
    } catch {
      this.logs = [];
    }
    this.initialized = true;
    this.info('Logger initialized');
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
    } catch {
      console.warn('Failed to save logs');
    }
  }

  private add(level: LogEntry['level'], message: string, data?: unknown) {
    const entry: LogEntry = {
      time: new Date().toISOString(),
      level,
      message,
      data: data !== undefined ? JSON.stringify(data) : undefined,
    };

    this.logs.push(entry);
    while (this.logs.length > MAX_LOGS) {
      this.logs.shift();
    }

    this.save();

    const consoleMethod = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    consoleMethod(`[CNS ${level.toUpperCase()}]`, message, data !== undefined ? data : '');
  }

  info(message: string, data?: unknown) {
    this.add('info', message, data);
  }

  warn(message: string, data?: unknown) {
    this.add('warn', message, data);
  }

  error(message: string, data?: unknown) {
    this.add('error', message, data);
  }

  async exportToFile(): Promise<string> {
    const content = this.export();
    const invoke = typeof window.__TAURI__?.invoke === 'function'
      ? window.__TAURI__!.invoke
      : typeof window.__TAURI_INVOKE__ === 'function'
      ? window.__TAURI_INVOKE__
      : typeof window.__TAURI__?.tauri?.invoke === 'function'
      ? window.__TAURI__.tauri.invoke
      : undefined;

    if (typeof invoke !== 'function') {
      const error = new Error('Tauri invoke unavailable');
      this.error('Failed to export logs to file', error);
      throw error;
    }

    try {
      const result = await invoke('export_logs_to_file', { content });
      if (typeof result === 'string') {
        this.info('Logs exported to file', { path: result });
        return result;
      }
      throw new Error('Invalid response from export_logs_to_file');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.error('Failed to export logs to file', message);
      throw err;
    }
  }

  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  clear() {
    this.logs = [];
    this.save();
    this.info('Logs cleared');
  }

  export(): string {
    return JSON.stringify({
      exportedAt: new Date().toISOString(),
      appVersion: '1.0.0',
      logs: this.logs,
    }, null, 2);
  }
}

export const logger = new Logger();
