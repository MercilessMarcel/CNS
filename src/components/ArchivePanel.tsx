import { useEffect, useState, useCallback, useRef } from 'react';
import { Download, Trash2, FileVideo, FileAudio, FolderX, RefreshCw, Package, X } from 'lucide-react';
import { fa } from '../lib/i18n';
import { github } from '../lib/github';
import { cn } from '../lib/utils';

interface ArchiveItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  download_url: string | null;
  type: 'video' | 'audio';
  metadata?: {
    title: string;
    duration: string;
    downloaded_at?: string;
    upload_date?: string;
    thumbnail?: string;
    split?: boolean;
    zip?: boolean;
    parts?: number;
    original_size?: number;
    ext?: string;
  };
}

interface ArchivePanelProps {
  refreshKey?: number;
}

export function ArchivePanel({ refreshKey }: ArchivePanelProps) {
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [showPartsModal, setShowPartsModal] = useState<ArchiveItem | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const resolveTextDir = (value: string) =>
    /[\u0600-\u06ff]/.test(value) ? 'rtl' : 'ltr';

  const textAlignForDir = (dir: 'rtl' | 'ltr') =>
    dir === 'rtl' ? 'text-right' : 'text-left';

  const stripDownloadsPrefix = (value: string) =>
    value.replace(/^downloads[\\/]/, '');

  useEffect(() => {
    loadItems();
    const interval = setInterval(loadItems, 30000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  const hydrateThumbnail = async (thumbnail: string | undefined) => {
    if (!thumbnail) return thumbnail;

    let thumbPath = thumbnail;
    if (thumbPath.startsWith('downloads/')) {
      thumbPath = thumbPath.replace('downloads/', '');
    }

    const config = github.getConfig();
    if (!config) return thumbnail;

    try {
      const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/downloads/${encodeURIComponent(thumbPath)}`;
      const response = await fetch(apiUrl, {
        headers: {
          'Authorization': `token ${config.token}`,
        },
      });
      if (!response.ok) return thumbnail;

      const data = await response.json();
      if (!data.content) return thumbnail;

      const base64Content = data.content.replace(/\s/g, '');
      return `data:image/jpeg;base64,${base64Content}`;
    } catch {
      return thumbnail;
    }
  };

  const loadItems = async () => {
    if (hasLoadedOnceRef.current) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    try {
      const downloads = await github.getDownloads();
      const videoItems: ArchiveItem[] = [];
      const processedBases = new Set<string>();

      for (const item of downloads) {
        if (item.type === 'file') {
          // Skip .z* files (they are split zip parts)
          if (item.name.match(/\.z[0-9]+$/)) continue;

          const ext = item.name.split('.').pop()?.toLowerCase();
          const isVideo = ['mp4', 'webm', 'mkv', 'mov'].includes(ext || '');
          const isAudio = ['mp3', 'm4a', 'wav', 'ogg', 'flac'].includes(ext || '');
          const isJson = ext === 'json';

          if (isVideo || isAudio) {
            const metaPath = item.path.replace(/\.[^/.]+$/, '.json');
            let metadata;
            try {
              const metaContent = await github.getFileContent(metaPath);
              if (metaContent) {
                metadata = JSON.parse(metaContent.content);
                if (metadata.thumbnail) {
                  metadata.thumbnail = await hydrateThumbnail(metadata.thumbnail);
                }
              }
            } catch {
              // Ignore invalid metadata
            }

            videoItems.push({
              name: item.name,
              path: item.path,
              sha: item.sha,
              size: item.size,
              download_url: item.download_url,
              type: isVideo ? 'video' : 'audio',
              metadata,
            });
            processedBases.add(item.path.replace(/\.[^/.]+$/, ''));
          } else if (isJson) {
            // Check if this JSON is for a split file (original file was deleted)
            try {
              const metaContent = await github.getFileContent(item.path);
              if (metaContent) {
                const metadata = JSON.parse(metaContent.content);
                if (metadata.split && metadata.parts) {
                  const base = item.path.replace(/\.json$/, '');
                  // Only add if we haven't already processed this base
                  if (!processedBases.has(base)) {
                    // Determine original extension from metadata or default to mp4
                    const originalExt = metadata.ext || 'mp4';
                    const isVideo = ['mp4', 'webm', 'mkv', 'mov'].includes(originalExt);
                    const isAudio = ['mp3', 'm4a', 'wav', 'ogg', 'flac'].includes(originalExt);
                    
                    if (metadata.thumbnail) {
                      metadata.thumbnail = await hydrateThumbnail(metadata.thumbnail);
                    }
                    
                    videoItems.push({
                      name: `${base}.${originalExt}`,
                      path: item.path,
                      sha: item.sha,
                      size: metadata.original_size || 0,
                      download_url: null,
                      type: isVideo ? 'video' : (isAudio ? 'audio' : 'video'),
                      metadata,
                    });
                    processedBases.add(base);
                  }
                }
              }
            } catch {
              // Not a valid metadata file
            }
          }
        }
      }

      const commitTimes = await Promise.all(
        videoItems.map(item => github.getFileCommitTime(item.path))
      );
      const timeMap = new Map<string, number>();
      videoItems.forEach((item, i) => {
        timeMap.set(item.path, new Date(commitTimes[i] ?? 0).getTime());
      });
      videoItems.sort((a, b) => {
        const aTime = timeMap.get(a.path) ?? 0;
        const bTime = timeMap.get(b.path) ?? 0;
        if (aTime || bTime) return bTime - aTime;
        return b.name.localeCompare(a.name);
      });
      setItems(videoItems);
    } catch {
      if (!hasLoadedOnceRef.current) setItems([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      hasLoadedOnceRef.current = true;
      setHasLoadedOnce(true);
    }
  };

  const handleDelete = async (item: ArchiveItem) => {
    if (!window.confirm(`حذف ${item.name}؟`)) return;

    setDeleting(item.path);
    try {
      await github.deleteFile(item.path, item.sha);

      // If file is split, delete all zip parts
      if (item.metadata?.split) {
        const base = item.path.replace(/\.[^/.]+$/, '');
        const downloads = await github.getDownloads();
        for (const part of downloads) {
          if (part.type === 'file' && (part.name === `${base.split('/').pop()}.zip` || part.name.match(new RegExp(`^${base.split('/').pop()}\\.z[0-9]+$`)))) {
            try {
              await github.deleteFile(part.path, part.sha);
            } catch {
              // Ignore errors deleting parts
            }
          }
        }
      }

      const metaPath = item.path.replace(/\.[^/.]+$/, '.json');
      try {
        const metaContent = await github.getFileContent(metaPath);
        if (metaContent) {
          await github.deleteFile(metaPath, metaContent.sha);
        }
      } catch {
        // Meta may not exist
      }

      setItems(prev => prev.filter(i => i.path !== item.path));
    } finally {
      setDeleting(null);
    }
  };

  const handleShowParts = (item: ArchiveItem) => {
    setShowPartsModal(item);
  };

  const handleDownload = useCallback(async (item: ArchiveItem) => {
    if (downloading) return;
    setDownloading(item.path);
    try {
      const blob = await github.downloadFileAsBlob(item.sha);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore
    } finally {
      setDownloading(null);
    }
  }, [downloading]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  if (isLoading && !hasLoadedOnce) {
    return (
      <div className="empty-tile">
        <span className="glyph animate-pulse-signal">
          <RefreshCw size={18} className="animate-spin" />
        </span>
        <div className="animate-flicker text-xs" dir="ltr">SCANNING...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="empty-tile">
        <span className="glyph">
          <FolderX size={20} />
        </span>
        <div className="text-sm text-cns-primary" dir="rtl">{fa.archive.empty}</div>
        <div className="text-[10px] opacity-60" dir="ltr">NO_DATA</div>
        <button
          onClick={loadItems}
          disabled={isRefreshing}
          className="system-btn mt-2"
        >
          <RefreshCw size={10} className={isRefreshing ? 'animate-spin' : ''} />
          <span dir="rtl">{isRefreshing ? 'در حال بارگذاری' : 'بررسی مجدد'}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="h-full max-h-[560px] overflow-y-auto pr-1">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-[11px] text-cns-deep" dir="rtl">
          {items.length.toLocaleString('fa-IR')} فایل آماده
        </div>
        <button
          onClick={loadItems}
          disabled={isRefreshing}
          className="system-btn"
        >
          <RefreshCw size={10} className={isRefreshing ? 'animate-spin' : ''} />
          <span dir="rtl">{isRefreshing ? 'در حال بارگذاری' : 'بروزرسانی'}</span>
        </button>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const Icon = item.type === 'video' ? FileVideo : FileAudio;
          const title = item.metadata?.title || item.name;
          const titleDir = resolveTextDir(title);

          return (
            <article key={item.path} className="archive-card">
              {item.metadata?.thumbnail ? (
                <div className="thumb-frame mb-3">
                  <img
                    src={item.metadata.thumbnail}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                </div>
              ) : (
                <div className="thumb-frame placeholder mb-3">
                  <Icon size={18} />
                  <span dir="ltr">{item.type === 'video' ? 'VIDEO_BUFFER' : 'AUDIO_BUFFER'}</span>
                </div>
              )}

              <div className="flex items-start gap-2">
                <Icon size={14} className="mt-0.5 flex-shrink-0 text-cns-primary" />
                <div className="min-w-0 flex-1">
                  <div
                    className={`truncate text-[11px] text-cns-highlight ${textAlignForDir(titleDir)}`}
                    dir={titleDir}
                  >
                    {title}
                  </div>
                  <div className="helper-copy mt-1 break-all text-left" dir="ltr">
                    {stripDownloadsPrefix(item.name)}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                <span className="system-flag" dir="ltr">{formatSize(item.metadata?.original_size || item.size)}</span>
                <span className="system-flag" dir="rtl">{item.type === 'video' ? fa.archive.video : fa.archive.audio}</span>
                {item.metadata?.duration && <span className="system-flag" dir="ltr">{item.metadata.duration}</span>}
                {item.metadata?.split && <span className="system-flag border-cns-warning text-cns-warning" dir="rtl">{(item.metadata.parts || 0).toLocaleString('fa-IR')} بخش</span>}
              </div>

              <div className="mt-3 flex gap-2">
                {item.metadata?.split ? (
                  <button
                    onClick={() => handleShowParts(item)}
                    className="system-btn flex-1 justify-center"
                  >
                    <Package size={10} />
                    <span dir="rtl">{(item.metadata.parts || 0).toLocaleString('fa-IR')} بخش - دانلود</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleDownload(item)}
                    disabled={downloading === item.path}
                    className="system-btn flex-1 justify-center"
                  >
                    <Download size={10} />
                    <span className={downloading === item.path ? 'animate-pulse' : ''} dir="rtl">
                      {downloading === item.path ? 'در حال دریافت...' : fa.archive.download}
                    </span>
                  </button>
                )}
                <button
                  onClick={() => handleDelete(item)}
                  disabled={deleting === item.path}
                  className="system-btn border-cns-warning text-cns-warning hover:bg-cns-warning/10"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {showPartsModal && (
        <PartsModal
          item={showPartsModal}
          onClose={() => setShowPartsModal(null)}
        />
      )}
    </div>
  );
}

function PartsModal({ item, onClose }: { item: ArchiveItem; onClose: () => void }) {
  const [parts, setParts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [downloadingPart, setDownloadingPart] = useState<string | null>(null);

  const handlePartDownload = async (part: any) => {
    if (downloadingPart) return;
    setDownloadingPart(part.path);
    try {
      const blob = await github.downloadFileAsBlob(part.sha);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = part.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      // silently ignore
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
        const base = item.path.replace(/\.json$/, '').replace(/\.[^/.]+$/, '');
        const baseName = base.split('/').pop() || base;
        const downloads = await github.getDownloads();
        const partFiles = downloads
          .filter(d => d.type === 'file' && (d.name === `${baseName}.zip` || d.name.match(new RegExp(`^${baseName}\\.z[0-9]+$`))))
          .sort((a, b) => a.name.localeCompare(b.name));
        setParts(partFiles);
      } catch {
        setParts([]);
      } finally {
        setLoading(false);
      }
    };
    loadParts();
  }, [item]);

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" onClick={handleClose}>
      <div className={cn('modal-backdrop absolute inset-0 bg-black/70 backdrop-blur-[2px]', closing && 'closing')} />
      <div className={cn('window modal-shell relative w-full max-w-2xl max-h-[85vh] overflow-hidden', closing && 'closing')} dir="ltr" onClick={(e) => e.stopPropagation()}>
        <header className="window-titlebar">
          <span className="window-name">
            <Package size={12} />
            PARTS.EXE
          </span>
          <span className="window-controls">
            <span className="window-dot" data-glyph="_" />
            <span className="window-dot" data-glyph="□" />
            <button onClick={handleClose} className="window-dot close" aria-label="close" type="button">×</button>
          </span>
        </header>
        <div className="window-body overflow-y-auto" style={{ maxHeight: 'calc(85vh - 48px)' }}>
          <div className="mb-3">
            <h3 className="text-sm font-mono text-cns-highlight truncate" dir="ltr">{item.name}</h3>
            <p className="text-xs text-cns-primary mt-1" dir="rtl">{parts.length.toLocaleString('fa-IR')} بخش برای دانلود</p>
          </div>

          {loading ? (
            <div className="text-center text-xs text-cns-primary py-6" dir="rtl">در حال بارگذاری...</div>
          ) : parts.length === 0 ? (
            <div className="text-center text-xs text-cns-primary py-6" dir="rtl">هیچ بخشی یافت نشد</div>
          ) : (
            <>
              <div className="hud-block mb-3 text-xs">
                <p className="text-cns-highlight mb-2" dir="rtl">نحوه ترکیب فایل‌ها:</p>
                <p className="text-cns-deep mb-1" dir="rtl">۱. همه بخش‌ها را دانلود کنید (.zip, .z01, .z02, ...)</p>
                <p className="text-cns-deep mb-1" dir="rtl">۲. در ترمینال اجرا کنید:</p>
                <code className="block mt-2 p-2 bg-black/40 text-cns-primary font-mono text-[10px]" dir="ltr">
                  zip -s 0 filename.zip --out complete.zip
                </code>
                <p className="text-cns-deep mt-2" dir="rtl">۳. فایل complete.zip را اکسترکت کنید</p>
              </div>
              <div className="space-y-2">
                {parts.map((part) => (
                  <div key={part.path} className="flex items-center justify-between gap-2 p-2 border border-cns-deep/40 bg-black/20">
                    <span className="text-xs font-mono text-cns-deep flex-1 truncate" dir="ltr">{part.name}</span>
                    <span className="text-xs text-cns-primary" dir="ltr">{(part.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button
                      onClick={() => handlePartDownload(part)}
                      disabled={downloadingPart === part.path}
                      className="system-btn"
                    >
                      {downloadingPart === part.path ? (
                        <RefreshCw size={10} className="animate-spin" />
                      ) : (
                        <Download size={10} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          <button onClick={handleClose} className="system-btn mt-4 w-full justify-center">
            <X size={12} />
            <span dir="rtl">بستن</span>
          </button>
        </div>
      </div>
    </div>
  );
}
