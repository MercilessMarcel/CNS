import { useMemo } from 'react';
import { AlertTriangle, Bug, Trash2, X } from 'lucide-react';
import { clearDebugEntries, getDebugEntries } from '../lib/debug';

interface DebugPanelProps {
  isOpen: boolean;
  onClose: () => void;
  refreshKey: number;
  onClear: () => void;
}

const LEVEL_STYLE = {
  info: 'text-cns-primary border-cns-primary/40',
  warn: 'text-cns-warning border-cns-warning/40',
  error: 'text-red-400 border-red-400/40',
} as const;

export function DebugPanel({ isOpen, onClose, refreshKey, onClear }: DebugPanelProps) {
  const entries = useMemo(() => getDebugEntries(), [refreshKey]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[11000] flex items-end justify-end bg-black/45 p-4">
      <div className="flex h-[70vh] w-full max-w-3xl flex-col rounded-lg border border-cns-primary/30 bg-cns-bg shadow-2xl">
        <div className="flex items-center justify-between border-b border-cns-primary/20 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-cns-highlight">
            <Bug size={16} />
            <span dir="ltr">CNS DEV DEBUG</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                clearDebugEntries();
                onClear();
              }}
              className="system-btn"
            >
              <Trash2 size={12} />
            </button>
            <button onClick={onClose} className="system-btn">
              <X size={12} />
            </button>
          </div>
        </div>

        <div className="border-b border-cns-primary/20 px-4 py-2 text-[11px] text-cns-deep" dir="ltr">
          F12 toggle | DEV only | {entries.length} entries
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {entries.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-cns-deep" dir="ltr">
              NO_DEBUG_EVENTS
            </div>
          ) : (
            <div className="space-y-3">
              {entries.slice().reverse().map((entry) => (
                <div key={entry.id} className={`rounded-md border p-3 text-xs ${LEVEL_STYLE[entry.level]}`}>
                  <div className="mb-1 flex items-center gap-2 font-mono" dir="ltr">
                    {entry.level !== 'info' && <AlertTriangle size={12} />}
                    <span>{entry.time}</span>
                    <span>{entry.scope}</span>
                  </div>
                  <div className="break-all text-left font-mono" dir="ltr">
                    {entry.message}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
