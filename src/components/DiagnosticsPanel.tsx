import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, XCircle, Download, Trash2, RefreshCw } from 'lucide-react';
import { logger } from '../lib/logger';
import { github } from '../lib/github';
import { cn } from '../lib/utils';

interface DiagnosticsPanelProps {
  isOpen: boolean;
}

export function DiagnosticsPanel({ isOpen }: DiagnosticsPanelProps) {
  const [logs, setLogs] = useState<ReturnType<typeof logger.getLogs>>([]);
  const [configStatus, setConfigStatus] = useState<'checking' | 'valid' | 'corrupted' | 'missing'>('checking');
  const [appVersion] = useState('1.0.0');
  const [fileExportPath, setFileExportPath] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExportingFile, setIsExportingFile] = useState(false);

  const refresh = () => {
    setLogs(logger.getLogs());
    try {
      const stored = localStorage.getItem('cns_github_config');
      if (!stored) {
        setConfigStatus('missing');
      } else {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed.token === 'string' && typeof parsed.owner === 'string' && typeof parsed.repo === 'string') {
          setConfigStatus('valid');
        } else {
          setConfigStatus('corrupted');
        }
      }
    } catch {
      setConfigStatus('corrupted');
    }
  };

  useEffect(() => {
    if (isOpen) {
      refresh();
    }
  }, [isOpen]);

  const handleExport = () => {
    const blob = new Blob([logger.export()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cns-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportToFile = async () => {
    setIsExportingFile(true);
    setExportError(null);
    setFileExportPath(null);

    try {
      const path = await logger.exportToFile();
      setFileExportPath(path);
      window.alert(`Log export succeeded.\nPath: ${path}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      setExportError(reason);
      if (reason.includes('Tauri invoke unavailable')) {
        handleExport();
        window.alert(`Log export fallback used.\nReason: ${reason}\nResult: Browser download started.`);
      } else {
        window.alert(`Log export failed.\nReason: ${reason}`);
      }
    } finally {
      setIsExportingFile(false);
    }
  };

  const handleClearLogs = () => {
    logger.clear();
    refresh();
  };

  const handleClearConfig = () => {
    github.clearConfig();
    github.clearCookies();
    refresh();
    window.location.reload();
  };

  if (!isOpen) return null;

  return (
    <div className="space-y-4">
      <div className="hud-block">
        <div className="text-xs text-cns-primary mb-3" dir="rtl">وضعیت سیستم / System Status</div>
        <div className="grid gap-2 text-sm">
          <div className="flex items-center justify-between p-2 bg-black/20 rounded">
            <span className="text-cns-primary/70">App Version</span>
            <span className="text-cns-primary font-mono">{appVersion}</span>
          </div>
          <div className="flex items-center justify-between p-2 bg-black/20 rounded">
            <span className="text-cns-primary/70" dir="rtl">پیکربندی / Config</span>
            <div className="flex items-center gap-2">
              {configStatus === 'checking' && <span className="text-cns-primary/50">...</span>}
              {configStatus === 'valid' && (
                <>
                  <CheckCircle size={14} className="text-green-500" />
                  <span className="text-green-500">Valid</span>
                </>
              )}
              {configStatus === 'missing' && (
                <>
                  <XCircle size={14} className="text-cns-warning" />
                  <span className="text-cns-warning">Missing</span>
                </>
              )}
              {configStatus === 'corrupted' && (
                <>
                  <AlertCircle size={14} className="text-cns-warning" />
                  <span className="text-cns-warning">Corrupted</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between p-2 bg-black/20 rounded">
            <span className="text-cns-primary/70">localStorage</span>
            <span className={cn("text-cns-primary font-mono", !localStorage && "text-cns-warning")}>
              {typeof localStorage !== 'undefined' ? 'Available' : 'Unavailable'}
            </span>
          </div>
        </div>
      </div>

      <div className="hud-block">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-cns-primary" dir="rtl">لاگ‌های اخیر / Recent Logs</span>
          <button onClick={refresh} className="system-btn px-2 py-1 text-xs">
            <RefreshCw size={12} />
          </button>
        </div>
        <div className="bg-black/30 border border-cns-deep/50 rounded p-2 max-h-40 overflow-auto font-mono text-xs">
          {logs.length === 0 ? (
            <div className="text-cns-deep text-center py-4">No logs recorded</div>
          ) : (
            <div className="space-y-1">
              {logs.slice().reverse().map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className={cn(
                    "shrink-0",
                    log.level === 'error' && "text-cns-warning",
                    log.level === 'warn' && "text-yellow-500",
                    log.level === 'info' && "text-cns-primary/50"
                  )}>
                    {log.level.toUpperCase()}
                  </span>
                  <span className="text-cns-deep shrink-0">
                    {new Date(log.time).toLocaleTimeString()}
                  </span>
                  <span className="text-cns-primary/70 truncate">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {fileExportPath && (
        <div className="summary-strip success text-xs p-2" dir="ltr">
          Saved log file: <span className="font-mono break-all">{fileExportPath}</span>
        </div>
      )}
      {exportError && (
        <div className="summary-strip warning text-xs p-2" dir="ltr">
          Export failed: {exportError}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <button
          onClick={handleExport}
          className="system-btn justify-center text-xs"
        >
          <Download size={12} />
          <span dir="rtl">دانلود لاگ / Export JSON</span>
        </button>

        <button
          onClick={handleExportToFile}
          disabled={isExportingFile}
          className="system-btn justify-center text-xs border-cns-primary"
        >
          <Download size={12} />
          <span dir="rtl">Export logs to file</span>
        </button>

        <button
          onClick={handleClearLogs}
          className="system-btn justify-center text-xs border-cns-deep"
        >
          <Trash2 size={12} />
          <span dir="rtl">پاک کردن لاگ / Clear Logs</span>
        </button>

        <button
          onClick={handleClearConfig}
          className="system-btn justify-center text-xs border-cns-warning text-cns-warning hover:bg-cns-warning/10"
        >
          <Trash2 size={12} />
          <span dir="rtl">پاک کردن تنظیمات / Reset</span>
        </button>
      </div>
    </div>
  );
}
