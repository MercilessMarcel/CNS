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
  const [appVersion] = useState('1.1.1');
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

  const configBadge =
    configStatus === 'valid'
      ? { Icon: CheckCircle, color: 'text-cns-highlight', label: 'Valid' }
      : configStatus === 'missing'
      ? { Icon: XCircle, color: 'text-cns-warning', label: 'Missing' }
      : configStatus === 'corrupted'
      ? { Icon: AlertCircle, color: 'text-cns-warning', label: 'Corrupted' }
      : { Icon: AlertCircle, color: 'text-cns-deep', label: '...' };

  return (
    <div className="space-y-3">
      <div className="hud-block !p-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex flex-col gap-1 p-2 bg-black/40 border border-cns-deep/40">
            <span className="text-[10px] uppercase tracking-wider text-cns-muted">Version</span>
            <span className="font-mono text-cns-text-bright">{appVersion}</span>
          </div>
          <div className="flex flex-col gap-1 p-2 bg-black/40 border border-cns-deep/40">
            <span className="text-[10px] uppercase tracking-wider text-cns-muted">Config</span>
            <span className={cn('flex items-center gap-1 font-mono', configBadge.color)}>
              <configBadge.Icon size={12} />
              {configBadge.label}
            </span>
          </div>
          <div className="flex flex-col gap-1 p-2 bg-black/40 border border-cns-deep/40">
            <span className="text-[10px] uppercase tracking-wider text-cns-muted">Storage</span>
            <span className={cn('font-mono', !localStorage && 'text-cns-warning')}>
              {typeof localStorage !== 'undefined' ? 'OK' : 'N/A'}
            </span>
          </div>
        </div>
      </div>

      <div className="hud-block !p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-cns-primary" dir="rtl">لاگ‌های اخیر</span>
          <button onClick={refresh} className="system-btn !px-2 !py-1">
            <RefreshCw size={11} />
          </button>
        </div>
        <div className="bg-black/40 border border-cns-deep/40 p-2 max-h-32 overflow-auto font-mono text-[11px]">
          {logs.length === 0 ? (
            <div className="text-cns-deep text-center py-3">No logs recorded</div>
          ) : (
            <div className="space-y-0.5">
              {logs.slice().reverse().map((log, i) => (
                <div key={i} className="flex gap-2">
                  <span className={cn(
                    'shrink-0 w-10',
                    log.level === 'error' && 'text-cns-warning',
                    log.level === 'warn' && 'text-yellow-500',
                    log.level === 'info' && 'text-cns-primary/60'
                  )}>
                    {log.level.toUpperCase()}
                  </span>
                  <span className="text-cns-deep shrink-0">
                    {new Date(log.time).toLocaleTimeString()}
                  </span>
                  <span className="text-cns-primary/80 truncate">{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {fileExportPath && (
        <div className="summary-strip success text-[11px] !p-2" dir="ltr">
          Saved: <span className="font-mono break-all">{fileExportPath}</span>
        </div>
      )}
      {exportError && (
        <div className="summary-strip warning text-[11px] !p-2" dir="ltr">
          Export failed: {exportError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handleExport}
          className="system-btn justify-center text-[11px]"
        >
          <Download size={11} />
          <span dir="rtl">دانلود JSON</span>
        </button>

        <button
          onClick={handleExportToFile}
          disabled={isExportingFile}
          className="system-btn justify-center text-[11px] border-cns-primary"
        >
          <Download size={11} />
          <span dir="rtl">ذخیره فایل</span>
        </button>

        <button
          onClick={handleClearLogs}
          className="system-btn justify-center text-[11px] border-cns-deep"
        >
          <Trash2 size={11} />
          <span dir="rtl">پاک کردن لاگ</span>
        </button>

        <button
          onClick={handleClearConfig}
          className="system-btn justify-center text-[11px] border-cns-warning text-cns-warning hover:bg-cns-warning/10"
        >
          <Trash2 size={11} />
          <span dir="rtl">ریست کامل</span>
        </button>
      </div>
    </div>
  );
}
