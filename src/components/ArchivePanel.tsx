import { useEffect, useState } from 'react';
import { Download, Trash2, FileVideo, FileAudio, FolderX, RefreshCw } from 'lucide-react';
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
  };
}

interface ArchivePanelProps {
  refreshKey?: number;
}

export function ArchivePanel({ refreshKey }: ArchivePanelProps) {
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadItems();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadItems, 30000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  const loadItems = async () => {
    setIsLoading(true);
    try {
      const downloads = await github.getDownloads();
      const videoItems: ArchiveItem[] = [];

      for (const item of downloads) {
        if (item.type === 'file') {
          const ext = item.name.split('.').pop()?.toLowerCase();
          const isVideo = ['mp4', 'webm', 'mkv', 'mov'].includes(ext || '');
          const isAudio = ['mp3', 'm4a', 'wav', 'ogg', 'flac'].includes(ext || '');

          if (isVideo || isAudio) {
            const metaPath = item.path.replace(/\.[^/.]+$/, '.json');
            let metadata;
            try {
              const metaContent = await github.getFileContent(metaPath);
              if (metaContent) {
                metadata = JSON.parse(metaContent.content);
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

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-cns-deep">
        <div className="animate-flicker text-xs">SCANNING...</div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-cns-deep">
        <div className="text-center">
          <FolderX size={32} className="mx-auto mb-2 opacity-50" />
          <div className="text-xs">{fa.archive.empty}</div>
          <div className="text-[10px] mt-1 opacity-50">NO_DATA</div>
        </div>
        <button
          onClick={loadItems}
          disabled={isLoading}
          className="system-btn mt-4 py-1 px-3 text-[10px] flex items-center gap-1"
        >
          <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? '...' : 'بررسی مجدد'}
        </button>
      </div>
    );
  }

  return (
    <div className="h-[400px] overflow-y-auto space-y-2 pr-1">
      <div className="flex justify-end mb-2">
        <button
          onClick={loadItems}
          disabled={isLoading}
          className="system-btn py-1 px-2 text-[10px] flex items-center gap-1"
        >
          <RefreshCw size={10} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? '...' : 'بروزرسانی'}
        </button>
      </div>
      {items.map((item) => {
        const Icon = item.type === 'video' ? FileVideo : FileAudio;
        
        return (
          <div 
            key={item.path}
            className="border border-cns-deep p-2 text-xs hover:border-cns-primary transition-colors"
          >
            {/* Thumbnail if available */}
            {item.metadata?.thumbnail && (
              <div className="mb-2 h-20 bg-cns-dim/30 overflow-hidden">
                <img 
                  src={item.metadata.thumbnail} 
                  alt=""
                  className="w-full h-full object-cover distort-img"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}

            {/* File Info */}
            <div className="flex items-start gap-2 mb-2">
              <Icon size={14} className="text-cns-primary flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-cns-highlight truncate font-mono text-[10px]">
                  {item.metadata?.title || item.name}
                </div>
                <div className="text-cns-deep text-[9px] mt-0.5">
                  {formatSize(item.size)} // {item.type === 'video' ? fa.archive.video : fa.archive.audio}
                </div>
                {item.metadata?.duration && (
                  <div className="text-cns-deep text-[9px]">
                    {fa.meta.duration}: {item.metadata.duration}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-1">
              {item.download_url && (
                <a
                  href={item.download_url}
                  download
                  className="system-btn flex-1 py-1 text-[10px] flex items-center justify-center gap-1"
                >
                  <Download size={10} />
                  {fa.archive.download}
                </a>
              )}
              <button
                onClick={() => handleDelete(item)}
                disabled={deleting === item.path}
                className="system-btn py-1 px-2 text-[10px] text-cns-warning border-cns-warning hover:bg-cns-warning/10"
              >
                <Trash2 size={10} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
