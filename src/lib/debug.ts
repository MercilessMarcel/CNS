const DEBUG_KEY = 'cns_debug_entries';
const MAX_ENTRIES = 250;

export interface DebugEntry {
  id: string;
  time: string;
  level: 'info' | 'warn' | 'error';
  scope: string;
  message: string;
}

function readEntries(): DebugEntry[] {
  try {
    const raw = localStorage.getItem(DEBUG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: DebugEntry[]) {
  localStorage.setItem(DEBUG_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
}

export function pushDebugEntry(level: DebugEntry['level'], scope: string, message: string) {
  const entries = readEntries();
  entries.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    time: new Date().toISOString(),
    level,
    scope,
    message,
  });
  writeEntries(entries);
}

export function getDebugEntries() {
  return readEntries();
}

export function clearDebugEntries() {
  localStorage.removeItem(DEBUG_KEY);
}

export function installDebugHooks() {
  if (!import.meta.env.DEV) return () => {};
  const w = window as Window & { __CNS_DEBUG_HOOKS__?: boolean };
  if (w.__CNS_DEBUG_HOOKS__) return () => {};
  w.__CNS_DEBUG_HOOKS__ = true;

  const onError = (event: ErrorEvent) => {
    pushDebugEntry('error', 'window.error', event.message || 'Unknown runtime error');
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
    pushDebugEntry('error', 'window.rejection', reason);
  };

  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = (...args: unknown[]) => {
    pushDebugEntry('error', 'console.error', args.map(String).join(' '));
    originalError(...args);
  };

  console.warn = (...args: unknown[]) => {
    pushDebugEntry('warn', 'console.warn', args.map(String).join(' '));
    originalWarn(...args);
  };

  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  pushDebugEntry('info', 'debug', 'F12 debug hooks active');

  return () => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
    console.error = originalError;
    console.warn = originalWarn;
    w.__CNS_DEBUG_HOOKS__ = false;
  };
}
