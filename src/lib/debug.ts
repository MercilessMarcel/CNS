const DEBUG_STORAGE_KEY = 'cns_debug_log';
const MAX_DEBUG_ENTRIES = 200;

export interface DebugEntry {
  time: string;
  scope: string;
  message: string;
  data?: unknown;
}

function readEntries(): DebugEntry[] {
  try {
    const raw = localStorage.getItem(DEBUG_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: DebugEntry[]) {
  localStorage.setItem(DEBUG_STORAGE_KEY, JSON.stringify(entries.slice(-MAX_DEBUG_ENTRIES)));
}

export function logDebug(scope: string, message: string, data?: unknown) {
  const entries = readEntries();
  entries.push({
    time: new Date().toISOString(),
    scope,
    message,
    data,
  });
  writeEntries(entries);
}

export function getDebugEntries(): DebugEntry[] {
  return readEntries();
}

export function clearDebugEntries() {
  localStorage.removeItem(DEBUG_STORAGE_KEY);
}

export function formatDebugEntries(): string {
  return readEntries()
    .map((entry) => {
      const prefix = `[${entry.time}] [${entry.scope}] ${entry.message}`;
      if (entry.data === undefined) return prefix;
      try {
        return `${prefix} ${JSON.stringify(entry.data)}`;
      } catch {
        return `${prefix} ${String(entry.data)}`;
      }
    })
    .join('\n');
}
