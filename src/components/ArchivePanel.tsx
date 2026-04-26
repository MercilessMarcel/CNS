import { useEffect, useState } from 'react';
import { Download, Trash2, FileVideo, FileAudio, FolderX, RefreshCw, Package } from 'lucide-react';
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
    parts?: number;
    original_size?: number;
  };
}

interface ArchivePanelProps {
  refreshKey?: number;
}

export function ArchivePanel({ refreshKey }: ArchivePanelProps) {
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [combining, setCombining] = useState<string | null>(null);

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
                // Convert local thumbnail path to GitHub URL
                if (metadata.thumbnail && metadata.thumbnail.startsWith('downloads/')) {
                  const thumbPath = metadata.thumbnail.replace('downloads/', '');
                  const thumbFile = downloads.find(d => d.path === thumbPath);
                  if (thumbFile && thumbFile.download_url) {
                    metadata.thumbnail = thumbFile.download_url;
                  }
                }
              }
            } catch {
              // No metadata
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
                    if (metadata.thumbnail && metadata.thumbnail.startsWith('downloads/')) {
                      const thumbPath = metadata.thumbnail.replace('downloads/', '');
                      const thumbFile = downloads.find(d => d.path === thumbPath);
                      if (thumbFile && thumbFile.download_url) {
                        metadata.thumbnail = thumbFile.download_url;
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

  const handleCombine = async (item: ArchiveItem) => {
    setCombining(item.path);
    try {
      // Extract base name from item (could be JSON path or file path)
      const base = item.path.replace(/\.json$/, '').replace(/\.[^/.]+$/, '');
      const baseName = base.split('/').pop() || base;
      const downloads = await github.getDownloads();
      const parts = downloads
        .filter(d => d.type === 'file' && d.name.includes('.part') && d.name.startsWith(baseName))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (parts.length === 0) {
        alert('هیچ بخشی یافت نشد');
        return;
      }

      const chunks: ArrayBuffer[] = [];
      for (const part of parts) {
        if (part.download_url) {
          const response = await fetch(part.download_url);
          const buffer = await response.arrayBuffer();
          chunks.push(buffer);
        }
      }

      const combined = new Blob(chunks, { type: 'application/octet-stream' });
      const url = URL.createObjectURL(combined);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('خطا در ترکیب بخش‌ها');
    } finally {
      setCombining(null);
    }
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
                    onClick={() => handleCombine(item)}
                    disabled={combining === item.path}
                    className="system-btn flex-1 justify-center"
                  >
                    <Package size={10} className={combining === item.path ? 'animate-spin' : ''} />
                    <span dir="rtl">{combining === item.path ? 'در حال ترکیب...' : 'ترکیب و دانلود'}</span>
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
    </div>
  );
}
