import { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertCircle, CheckCircle, XCircle, Download, Trash2, RefreshCw, Copy, ChevronDown, ChevronRight } from 'lucide-react';
import { logger, type LogEntry } from '../lib/logger';
import { github } from '../lib/github';
import { cn } from '../lib/utils';
import { toPersianErrorMessage } from '../lib/errors';
import { APP_VERSION } from '../lib/version';

interface DiagnosticsPanelProps {
  isOpen: boolean;
}

type LogFilter = 'all' | 'warn' | 'error';

function formatContextJson(ctx: Record<string, unknown> | undefined): string {
  if (!ctx || !Object.keys(ctx).length) return '';
  try {
    return JSON.stringify(ctx, null, 2);
  } catch {
    return String(ctx);
  }
}

export function DiagnosticsPanel({ isOpen }: DiagnosticsPanelProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [configStatus, setConfigStatus] = useState<'checking' | 'valid' | 'corrupted' | 'missing'>('checking');
  const [fileExportPath, setFileExportPath] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [isExportingFile, setIsExportingFile] = useState(false);
  const [logFilter, setLogFilter] = useState<LogFilter>('all');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [clipHint, setClipHint] = useState<string | null>(null);

  const refresh = useCallback(() => {
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
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    refresh();
    return logger.subscribe(refresh);
  }, [isOpen, refresh]);

  useEffect(() => {
    if (!clipHint) return;
    const t = setTimeout(() => setClipHint(null), 2200);
    return () => clearTimeout(t);
  }, [clipHint]);

  const stats = useMemo(() => {
    let info = 0;
    let warn = 0;
    let error = 0;
    for (const e of logs) {
      if (e.level === 'info') info++;
      else if (e.level === 'warn') warn++;
      else error++;
    }
    return { total: logs.length, info, warn, error };
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const r = [...logs].reverse();
    if (logFilter === 'warn') return r.filter((e) => e.level === 'warn' || e.level === 'error');
    if (logFilter === 'error') return r.filter((e) => e.level === 'error');
    return r;
  }, [logs, logFilter]);

  const handleExportJson = () => {
    const slug = new Date().toISOString().replace(/[:]/g, '-').slice(0, 19);
    const blob = new Blob([logger.export()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cns-logs-${slug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportText = () => {
    const slug = new Date().toISOString().replace(/[:]/g, '-').slice(0, 19);
    const blob = new Blob([logger.exportText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cns-logs-${slug}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(logger.exportText());
      setClipHint('متن کامل لاگ در کلیپبورد کپی شد');
    } catch {
      setClipHint('کپی ناموفق بود؛ مرورگر اجازه نداد');
    }
  };

  const handleExportToFile = async () => {
    setIsExportingFile(true);
    setExportError(null);
    setFileExportPath(null);

    try {
      const path = await logger.exportToFile();
      setFileExportPath(path);
      window.alert(`خروجی لاگ ذخیره شد.\nمسیر: ${path}`);
    } catch (err) {
      const reason = toPersianErrorMessage(err);
      setExportError(reason);
      if (String(err).includes('Tauri invoke unavailable')) {
        handleExportJson();
        window.alert(`دانلود مرورگر شروع شد.\nدلیل: ${reason}`);
      } else {
        window.alert(`خروجی لاگ ناموفق بود.\nدلیل: ${reason}`);
      }
    } finally {
      setIsExportingFile(false);
    }
  };

  const handleClearLogs = () => {
    logger.clear();
    refresh();
    setExpandedIds(new Set());
  };

  const handleClearConfig = () => {
    github.clearConfig();
    github.clearCookies();
    refresh();
    window.location.reload();
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!isOpen) return null;

  const configBadge =
    configStatus === 'valid'
      ? { Icon: CheckCircle, color: 'text-cns-highlight', label: 'معتبر' }
      : configStatus === 'missing'
      ? { Icon: XCircle, color: 'text-cns-warning', label: 'ناموجود' }
      : configStatus === 'corrupted'
      ? { Icon: AlertCircle, color: 'text-cns-warning', label: 'خراب' }
      : { Icon: AlertCircle, color: 'text-cns-deep', label: '...' };

  return (
    <div className="space-y-3">
      <div className="hud-block !p-3">
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="flex flex-col gap-1 p-2 bg-black/40 border border-cns-deep/40">
            <span className="text-[10px] tracking-wider text-cns-muted">نسخه</span>
            <span className="font-mono text-cns-text-bright">{APP_VERSION}</span>
          </div>
          <div className="flex flex-col gap-1 p-2 bg-black/40 border border-cns-deep/40">
            <span className="text-[10px] tracking-wider text-cns-muted">پیکربندی</span>
            <span className={cn('flex items-center gap-1 font-mono', configBadge.color)}>
              <configBadge.Icon size={12} />
              {configBadge.label}
            </span>
          </div>
          <div className="flex flex-col gap-1 p-2 bg-black/40 border border-cns-deep/40">
            <span className="text-[10px] tracking-wider text-cns-muted">ذخیره‌سازی</span>
            <span className={cn('font-mono', !localStorage && 'text-cns-warning')}>
              {typeof localStorage !== 'undefined' ? 'فعال' : 'ناموجود'}
            </span>
          </div>
        </div>
      </div>

      <div className="hud-block !p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="flex flex-wrap items-center gap-2" dir="rtl">
            <span className="text-xs text-cns-primary">لاگ‌ها</span>
            <span className="text-[10px] text-cns-muted font-mono" dir="ltr">
              {stats.total} · info {stats.info} · warn {stats.warn} · err {stats.error}
            </span>
          </div>
          <button type="button" onClick={refresh} className="system-btn !px-2 !py-1 shrink-0" title="به‌روزرسانی">
            <RefreshCw size={11} />
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-2" dir="rtl">
          {(
            [
              { id: 'all' as const, label: 'همه' },
              { id: 'warn' as const, label: 'هشدار و خطا' },
              { id: 'error' as const, label: 'فقط خطا' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setLogFilter(opt.id)}
              className={cn(
                'px-2 py-0.5 text-[10px] border rounded-sm transition-colors',
                logFilter === opt.id
                  ? 'border-cns-primary bg-cns-primary/15 text-cns-text-bright'
                  : 'border-cns-deep/50 text-cns-muted hover:border-cns-line'
              )}
            >
              {opt.label}
            </button>
          ))}
          <button
            type="button"
            onClick={handleCopyText}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] border border-cns-deep/50 rounded-sm text-cns-muted hover:border-cns-line"
            dir="rtl"
          >
            <Copy size={10} />
            کپی متن
          </button>
        </div>

        {clipHint && (
          <div className="text-[10px] text-cns-primary mb-2" dir="rtl">
            {clipHint}
          </div>
        )}

        <div className="bg-black/40 border border-cns-deep/40 p-2 max-h-56 overflow-auto text-[11px] leading-snug">
          {filteredLogs.length === 0 ? (
            <div className="text-cns-deep text-center py-4">موردی برای این فیلتر نیست</div>
          ) : (
            <div className="space-y-1.5">
              {filteredLogs.map((log) => {
                const hasCtx = log.context && Object.keys(log.context).length > 0;
                const open = expandedIds.has(log.id);
                return (
                  <div
                    key={log.id}
                    className="border-b border-cns-deep/25 pb-1.5 last:border-0 last:pb-0"
                  >
                    <div className="flex gap-2 items-start">
                      {hasCtx ? (
                        <button
                          type="button"
                          onClick={() => toggleExpand(log.id)}
                          className="shrink-0 mt-0.5 text-cns-muted hover:text-cns-primary p-0 border-0 bg-transparent cursor-pointer"
                          aria-expanded={open}
                        >
                          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        </button>
                      ) : (
                        <span className="shrink-0 w-3" />
                      )}
                      <span
                        className={cn(
                          'shrink-0 w-[3.2rem] font-mono text-[9px] uppercase tracking-tight',
                          log.level === 'error' && 'text-cns-warning',
                          log.level === 'warn' && 'text-yellow-500',
                          log.level === 'info' && 'text-cns-primary/55'
                        )}
                      >
                        {log.level}
                      </span>
                      <span className="text-cns-deep shrink-0 font-mono text-[9px] whitespace-nowrap" dir="ltr">
                        {log.time.replace('T', ' ').replace(/\.\d{3}Z$/, 'Z')}
                      </span>
                      <span className="text-cns-muted shrink-0 font-mono text-[9px] px-1 py-px border border-cns-deep/40 rounded" dir="ltr">
                        {log.category}
                      </span>
                    </div>
                    <div className="pl-5 pr-1 text-cns-primary/90 break-words whitespace-pre-wrap" dir="auto">
                      {log.message}
                    </div>
                    {hasCtx && open && (
                      <pre className="mt-1 ml-5 mr-1 p-2 bg-black/55 border border-cns-deep/35 rounded text-[10px] text-cns-muted overflow-x-auto font-mono whitespace-pre-wrap break-all" dir="ltr">
                        {formatContextJson(log.context)}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {fileExportPath && (
        <div className="summary-strip success text-[11px] !p-2" dir="ltr">
          ذخیره شد: <span className="font-mono break-all">{fileExportPath}</span>
        </div>
      )}
      {exportError && (
        <div className="summary-strip warning text-[11px] !p-2" dir="ltr">
          خروجی ناموفق بود: {exportError}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={handleExportJson} className="system-btn justify-center text-[11px]">
          <Download size={11} />
          <span dir="ltr">دانلود JSON</span>
        </button>

        <button type="button" onClick={handleExportText} className="system-btn justify-center text-[11px]">
          <Download size={11} />
          <span dir="ltr">دانلود متن</span>
        </button>

        <button
          type="button"
          onClick={handleExportToFile}
          disabled={isExportingFile}
          className="system-btn justify-center text-[11px] border-cns-primary"
        >
          <Download size={11} />
          <span dir="ltr">ذخیره فایل</span>
        </button>

        <button type="button" onClick={handleClearLogs} className="system-btn justify-center text-[11px] border-cns-deep">
          <Trash2 size={11} />
          <span dir="ltr">پاک کردن لاگ</span>
        </button>

        <button
          type="button"
          onClick={handleClearConfig}
          className="system-btn justify-center text-[11px] border-cns-warning text-cns-warning hover:bg-cns-warning/10 col-span-2"
        >
          <Trash2 size={11} />
          <span dir="ltr">ریست کامل</span>
        </button>
      </div>
    </div>
  );
}
