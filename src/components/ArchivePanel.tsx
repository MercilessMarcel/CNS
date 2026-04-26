import { useEffect, useState } from 'react';
import { Download, Trash2, FileVideo, FileAudio, FolderX, RefreshCw, Package, X } from 'lucide-react';
import { fa } from '../lib/i18n';
import { github } from '../lib/github';

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
  const [deleting, setDeleting] = useState<string | null>(null);
  const [showPartsModal, setShowPartsModal] = useState<ArchiveItem | null>(null);

  useEffect(() => {
    loadItems();
    const interval = setInterval(loadItems, 30000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  const loadItems = async () => {
    setIsLoading(true);
    try {
      const downloads = await github.getDownloads();
      const videoItems: ArchiveItem[] = [];
      const processedBases = new Set<string>();

      for (const item of downloads) {
        if (item.type === 'file') {
          // Skip .part files (they are chunks of split files)
          if (item.name.includes('.part')) continue;

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
                console.log('Metadata for', item.name, ':', metadata);
                // Convert local thumbnail path to GitHub URL
                if (metadata.thumbnail) {
                  let thumbPath = metadata.thumbnail;
                  console.log('Original thumbnail path:', thumbPath);
                  // Remove 'downloads/' prefix if present
                  if (thumbPath.startsWith('downloads/')) {
                    thumbPath = thumbPath.replace('downloads/', '');
                  }
                  console.log('Cleaned thumbnail path:', thumbPath);
                  // Try to find matching file in downloads
                  const thumbFile = downloads.find(d => d.path === thumbPath || d.name === thumbPath);
                  console.log('Found thumbnail file:', thumbFile);
                  if (thumbFile && thumbFile.download_url) {
                    metadata.thumbnail = thumbFile.download_url;
                    console.log('Using download_url:', metadata.thumbnail);
                  } else {
                    // Fallback: construct GitHub raw URL
                    const config = github.getConfig();
                    if (config) {
                      metadata.thumbnail = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/main/downloads/${thumbPath}`;
                      console.log('Using fallback URL:', metadata.thumbnail);
                    }
                  }
                } else {
                  console.log('No thumbnail in metadata for', item.name);
                }
              } else {
                console.log('No metadata content for', item.name);
              }
            } catch (e) {
              console.log('Error loading metadata for', item.name, ':', e);
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
                    
                    // Convert local thumbnail path to GitHub URL
                    if (metadata.thumbnail) {
                      let thumbPath = metadata.thumbnail;
                      // Remove 'downloads/' prefix if present
                      if (thumbPath.startsWith('downloads/')) {
                        thumbPath = thumbPath.replace('downloads/', '');
                      }
                      // Try to find matching file in downloads
                      const thumbFile = downloads.find(d => d.path === thumbPath || d.name === thumbPath);
                      if (thumbFile && thumbFile.download_url) {
                        metadata.thumbnail = thumbFile.download_url;
                      } else {
                        // Fallback: construct GitHub raw URL
                        const config = github.getConfig();
                        if (config) {
                          metadata.thumbnail = `https://raw.githubusercontent.com/${config.owner}/${config.repo}/main/downloads/${thumbPath}`;
                        }
                      }
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

      setItems(videoItems);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (item: ArchiveItem) => {
    if (!window.confirm(`حذف ${item.name}؟`)) return;

    setDeleting(item.path);
    try {
      await github.deleteFile(item.path, item.sha);

      // If file is split, delete all parts
      if (item.metadata?.split) {
        const base = item.path.replace(/\.[^/.]+$/, '');
        const downloads = await github.getDownloads();
        for (const part of downloads) {
          if (part.type === 'file' && part.name.includes('.part') && part.name.startsWith(base)) {
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

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  if (isLoading) {
    return (
      <div className="empty-state h-full">
        <div className="animate-flicker text-xs" dir="ltr">SCANNING...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="empty-state h-full flex-col">
        <div className="text-center">
          <FolderX size={32} className="mx-auto mb-2 opacity-50" />
          <div className="text-sm text-cns-primary" dir="rtl">{fa.archive.empty}</div>
          <div className="helper-copy mt-2" dir="rtl">فایل‌های دریافت‌شده پس از پایان عملیات اینجا آرشیو می‌شوند.</div>
          <div className="mt-3 text-[10px] opacity-50" dir="ltr">NO_DATA</div>
        </div>
        <button
          onClick={loadItems}
          disabled={isLoading}
          className="system-btn mt-4"
        >
          <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} />
          <span dir="rtl">{isLoading ? '...' : 'بررسی مجدد'}</span>
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
          disabled={isLoading}
          className="system-btn"
        >
          <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} />
          <span dir="rtl">{isLoading ? '...' : 'بروزرسانی'}</span>
        </button>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const Icon = item.type === 'video' ? FileVideo : FileAudio;

          return (
            <article key={item.path} className="archive-card">
              {item.metadata?.thumbnail ? (
                <div className="thumb-frame mb-3">
                  <img
                    src={item.metadata.thumbnail}
                    alt=""
                    className="h-full w-full object-cover distort-img"
                    onLoad={() => console.log('Thumbnail loaded for', item.name)}
                    onError={(e) => {
                      console.error('Thumbnail failed to load for', item.name, ':', item.metadata?.thumbnail);
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
                  <div className="truncate font-mono text-[11px] text-cns-highlight" dir="ltr">
                    {item.metadata?.title || item.name}
                  </div>
                  <div className="helper-copy mt-1 break-all" dir="ltr">{item.name}</div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2 text-[10px]">
                <span className="system-flag" dir="ltr">{formatSize(item.metadata?.original_size || item.size)}</span>
                <span className="system-flag" dir="rtl">{item.type === 'video' ? fa.archive.video : fa.archive.audio}</span>
                {item.metadata?.duration && <span className="system-flag" dir="ltr">{item.metadata.duration}</span>}
                {item.metadata?.split && <span className="system-flag border-cns-warning text-cns-warning" dir="rtl">{item.metadata.parts} بخش</span>}
              </div>

              <div className="mt-3 flex gap-2">
                {item.metadata?.split ? (
                  <button
                    onClick={() => handleShowParts(item)}
                    className="system-btn flex-1 justify-center"
                  >
                    <Package size={10} />
                    <span dir="rtl">{item.metadata.parts} بخش - دانلود</span>
                  </button>
                ) : item.download_url && (
                  <a
                    href={item.download_url}
                    download
                    className="system-btn flex-1 justify-center"
                  >
                    <Download size={10} />
                    <span dir="rtl">{fa.archive.download}</span>
                  </a>
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

  useEffect(() => {
    const loadParts = async () => {
      setLoading(true);
      try {
        const base = item.path.replace(/\.json$/, '').replace(/\.[^/.]+$/, '');
        const baseName = base.split('/').pop() || base;
        const downloads = await github.getDownloads();
        const partFiles = downloads
          .filter(d => d.type === 'file' && d.name.includes('part') && d.name.endsWith('.zip') && d.name.startsWith(baseName))
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
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-cns-bg border border-cns-primary/30 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="p-4 border-b border-cns-primary/30 flex items-center justify-between">
          <div>
            <h3 className="text-sm text-cns-highlight font-mono" dir="ltr">{item.name}</h3>
            <p className="text-xs text-cns-primary mt-1" dir="rtl">{parts.length} بخش برای دانلود</p>
          </div>
          <button onClick={onClose} className="system-btn">
            <X size={14} />
          </button>
        </div>
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {loading ? (
            <div className="text-center text-xs text-cns-primary" dir="rtl">در حال بارگذاری...</div>
          ) : parts.length === 0 ? (
            <div className="text-center text-xs text-cns-primary" dir="rtl">هیچ بخشی یافت نشد</div>
          ) : (
            <>
              <div className="mb-4 p-3 bg-cns-bg/50 rounded border border-cns-primary/20 text-xs">
                <p className="text-cns-highlight mb-2" dir="rtl">نحوه ترکیب فایل‌ها:</p>
                <p className="text-cns-deep mb-1" dir="rtl">1. همه بخش‌ها را دانلود کنید</p>
                <p className="text-cns-deep mb-1" dir="rtl">2. همه فایل‌های zip را اکسترکت کنید</p>
                <p className="text-cns-deep mb-1" dir="rtl">3. در ترمینال اجرا کنید:</p>
                <code className="block mt-2 p-2 bg-black/30 rounded text-cns-primary font-mono text-[10px]" dir="ltr">
                  copy /b part01+part02+part03+... filename.mp4
                </code>
              </div>
              <div className="space-y-2">
                {parts.map((part) => (
                  <div key={part.path} className="flex items-center justify-between p-2 bg-cns-bg/50 rounded border border-cns-primary/20">
                    <span className="text-xs font-mono text-cns-deep flex-1" dir="ltr">{part.name}</span>
                    <span className="text-xs text-cns-primary ml-2" dir="ltr">{(part.size / 1024 / 1024).toFixed(1)} MB</span>
                    {part.download_url && (
                      <a
                        href={part.download_url}
                        download={part.name}
                        className="system-btn ml-2"
                      >
                        <Download size={10} />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="p-4 border-t border-cns-primary/30 flex gap-2">
          <button onClick={onClose} className="system-btn flex-1">
            <span dir="rtl">بستن</span>
          </button>
        </div>
      </div>
    </div>
  );
}
