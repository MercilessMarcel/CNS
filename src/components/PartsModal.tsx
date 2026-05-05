import { useEffect, useMemo, useState } from 'react';
import { Package, Download, RefreshCw } from 'lucide-react';
import { github } from '../lib/github';
import { cn } from '../lib/utils';
import { toPersianErrorMessage } from '../lib/errors';
import { listSplitPartFiles, type SplitPartDownload } from '../lib/splitParts';
import { fa } from '../lib/i18n';
import { formatSize } from '../lib/useArchive';
import { useBodyScrollLock } from '../lib/useBodyScrollLock';
import { logger } from '../lib/logger';

function stripRepoPath(s: string) {
  return s.replace(/^downloads\//i, '').replace(/\\/g, '/');
}

export interface PartsModalItem {
  name: string;
  path: string;
}

interface PartsModalProps {
  item: PartsModalItem;
  onClose: () => void;
}

export function PartsModal({ item, onClose }: PartsModalProps) {
  const [parts, setParts] = useState<SplitPartDownload[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [downloadingPart, setDownloadingPart] = useState<string | null>(null);
  useBodyScrollLock(true);

  const displayTitle = useMemo(() => stripRepoPath(item.name), [item.name]);

  const totalBytes = useMemo(
    () =>
      parts.reduce(
        (acc, p) => acc + (typeof p.size === 'number' && Number.isFinite(p.size) ? p.size : 0),
        0
      ),
    [parts]
  );

  const handlePartDownload = async (part: SplitPartDownload) => {
    if (downloadingPart) return;
    setDownloadingPart(part.path);
    try {
      const preflight = await github.preflightDownload(part.path);
      if (!preflight.ok) throw new Error(preflight.reason || 'Download preflight failed');
      const nativePath = await github.downloadFileViaNative(part.path, part.name);
      if (nativePath) {
        try {
          const slash = Math.max(nativePath.lastIndexOf('/'), nativePath.lastIndexOf('\\'));
          const dir = slash >= 0 ? nativePath.slice(0, slash) : nativePath;
          localStorage.setItem('cns_last_download_dir', dir);
        } catch {
        }
        return;
      }
      let blob: Blob | null = null;
      let lastErr: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          blob = await github.downloadFileAsBlob(part.sha, part.path);
          break;
        } catch (err) {
          lastErr = err;
          if (attempt < 2) {
            const jitter = 280 + Math.floor(Math.random() * 520);
            await new Promise((resolve) => setTimeout(resolve, jitter * (attempt + 1)));
          }
        }
      }
      if (!blob) throw lastErr instanceof Error ? lastErr : new Error('Download failed');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = part.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      logger.error('[PartsModal] part download failed', { error: err, path: part.path, name: part.name });
      window.alert(toPersianErrorMessage(err));
    } finally {
      setDownloadingPart(null);
    }
  };

  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 220);
  };

  useEffect(() => {
    const loadParts = async () => {
      setLoading(true);
      try {
        const downloads = await github.getDownloads(true);
        setParts(listSplitPartFiles(item.path, downloads));
      } catch {
        setParts([]);
      } finally {
        setLoading(false);
      }
    };
    loadParts();
  }, [item]);

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className={cn(
          'modal-backdrop absolute inset-0 bg-black/70 backdrop-blur-[2px]',
          closing && 'closing'
        )}
      />
      <div
        className={cn(
          'parts-dialog modal-shell relative w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col',
          closing && 'closing'
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="parts-dialog-header">
          <div className="parts-dialog-header-main">
            <div className="parts-dialog-title">
              <Package size={18} strokeWidth={2.2} />
              <span>{fa.parts.title}</span>
            </div>
            <p className="parts-dialog-subtitle">{fa.parts.blurb}</p>
          </div>
          <button onClick={handleClose} className="settings-close-btn" type="button">
            {fa.parts.close}
          </button>
        </header>

        <div className="parts-dialog-body">
          <div className="parts-hero">
            <div className="parts-hero-icon" aria-hidden>
              <Package size={22} strokeWidth={2} />
            </div>
            <div className="parts-hero-main">
              <p className="parts-hero-kicker">{fa.parts.fileLabel}</p>
              <h2 className="parts-hero-title" dir="auto" title={displayTitle}>
                {displayTitle}
              </h2>
            </div>
          </div>

          <div className="parts-callout" dir="rtl">
            <p className="parts-callout-title">{fa.parts.howTitle}</p>
            <ol className="parts-steps">
              <li>{fa.parts.step1}</li>
              <li>{fa.parts.step2}</li>
              <li>{fa.parts.step3}</li>
            </ol>
          </div>

          {loading ? (
            <div className="parts-state parts-state-muted">{fa.parts.loading}</div>
          ) : parts.length === 0 ? (
            <div className="parts-state parts-state-warn">{fa.parts.empty}</div>
          ) : (
            <>
              <div className="parts-toolbar" dir="rtl">
                <span className="parts-pill">
                  <bdi>{parts.length.toLocaleString('fa-IR')}</bdi>
                  <span> {fa.parts.partWord}</span>
                </span>
                <span className="parts-pill parts-pill-mono">
                  <span className="parts-pill-label">{fa.parts.approxTotal}</span>
                  <bdi dir="ltr">{formatSize(totalBytes)}</bdi>
                </span>
              </div>

              <div className="parts-list-scroll">
                <div className="parts-list-head" aria-hidden="true">
                  <span>{fa.parts.colIndex}</span>
                  <span>{fa.parts.colFile}</span>
                  <span>{fa.parts.colSize}</span>
                  <span className="parts-list-head-action" />
                </div>
                <div className="parts-list">
                  {parts.map((part, idx) => (
                    <div key={part.path} className="parts-row">
                      <span className="parts-row-index">
                        <bdi>{String(idx + 1).padStart(2, '0')}</bdi>
                      </span>
                      <span className="parts-row-name" dir="auto" title={stripRepoPath(part.name)}>
                        {stripRepoPath(part.name)}
                      </span>
                      <span className="parts-row-size">
                        <bdi dir="ltr">
                          {((part.size ?? 0) / 1024 / 1024).toFixed(1)} MB
                        </bdi>
                      </span>
                      <button
                        type="button"
                        onClick={() => void handlePartDownload(part)}
                        disabled={downloadingPart === part.path}
                        className="parts-download-btn"
                      >
                        {downloadingPart === part.path ? (
                          <RefreshCw size={12} className="animate-spin" strokeWidth={2.5} />
                        ) : (
                          <Download size={12} strokeWidth={2.5} />
                        )}
                        <span>{fa.parts.download}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
