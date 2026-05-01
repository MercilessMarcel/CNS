import { useCallback, useEffect, useRef, useState } from 'react';
import { github } from './github';
import { toPersianErrorMessage } from './errors';
import { logger } from './logger';
import { listSplitPartFiles } from './splitParts';

export interface ArchiveItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  download_url: string | null;
  type: 'video' | 'audio';
  metadata?: {
    title: string;
    duration: string;
    uploader?: string;
    downloaded_at?: string;
    upload_date?: string;
    thumbnail?: string;
    split?: boolean;
    zip?: boolean;
    parts?: number;
    original_size?: number;
    ext?: string;
  };
  committed_at?: number;
  partFileCount?: number;
}

async function hydrateThumbnail(thumbnail: string | undefined): Promise<string | undefined> {
  if (!thumbnail) return thumbnail;

  let thumbPath = thumbnail;
  if (thumbPath.startsWith('downloads/')) {
    thumbPath = thumbPath.replace('downloads/', '');
  }

  if (/^https?:\/\//i.test(thumbPath)) return thumbnail;

  const config = github.getConfig();
  if (!config) return thumbnail;

  try {
    const apiUrl = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/downloads/${encodeURIComponent(thumbPath)}`;
    const response = await fetch(apiUrl, {
      headers: {
        Authorization: `token ${config.token}`,
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
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

interface UseArchiveOptions {
  refreshKey?: number;
  pollIntervalMs?: number;
  enabled?: boolean;
}

export function useArchive({ refreshKey = 0, pollIntervalMs = 30000, enabled = true }: UseArchiveOptions = {}) {
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);

  const loadItems = useCallback(async () => {
    if (!github.getConfig()) {
      setItems([]);
      setIsLoading(false);
      hasLoadedOnceRef.current = true;
      setHasLoadedOnce(true);
      return;
    }

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
        if (item.type !== 'file') continue;
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
          }

          videoItems.push({
            name: item.name,
            path: item.path,
            sha: item.sha,
            size: item.size,
            download_url: item.download_url,
            type: isVideo ? 'video' : 'audio',
            metadata,
            partFileCount: metadata?.split
              ? listSplitPartFiles(item.path, downloads).length
              : undefined,
          });
          processedBases.add(item.path.replace(/\.[^/.]+$/, ''));
        } else if (isJson) {
          try {
            const metaContent = await github.getFileContent(item.path);
            if (!metaContent) continue;

            const metadata = JSON.parse(metaContent.content);
            if (!metadata.split || !metadata.parts) continue;

            const base = item.path.replace(/\.json$/, '');
            if (processedBases.has(base)) continue;

            const originalExt = metadata.ext || 'mp4';
            const isV = ['mp4', 'webm', 'mkv', 'mov'].includes(originalExt);
            const isA = ['mp3', 'm4a', 'wav', 'ogg', 'flac'].includes(originalExt);

            if (metadata.thumbnail) {
              metadata.thumbnail = await hydrateThumbnail(metadata.thumbnail);
            }

            videoItems.push({
              name: `${base}.${originalExt}`,
              path: item.path,
              sha: item.sha,
              size: metadata.original_size || 0,
              download_url: null,
              type: isV ? 'video' : isA ? 'audio' : 'video',
              metadata,
              partFileCount: listSplitPartFiles(item.path, downloads).length,
            });
            processedBases.add(base);
          } catch {
          }
        }
      }

      const commitTimes = await Promise.all(
        videoItems.map((it) => github.getFileCommitTime(it.path))
      );
      videoItems.forEach((it, i) => {
        it.committed_at = new Date(commitTimes[i] ?? 0).getTime();
      });
      videoItems.sort((a, b) => {
        const aTime = a.committed_at ?? 0;
        const bTime = b.committed_at ?? 0;
        if (aTime || bTime) return bTime - aTime;
        return b.name.localeCompare(a.name);
      });
      setItems(videoItems);
    } catch (err) {
      logger.warn('[Archive] loadItems failed', {
        error: err,
        hadConfig: !!github.getConfig(),
      });
      if (!hasLoadedOnceRef.current) setItems([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      hasLoadedOnceRef.current = true;
      setHasLoadedOnce(true);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    loadItems();
    if (pollIntervalMs <= 0) return;
    const interval = setInterval(loadItems, pollIntervalMs);
    return () => clearInterval(interval);
  }, [refreshKey, enabled, pollIntervalMs, loadItems]);

  const remove = useCallback(async (item: ArchiveItem) => {
    setDeleting(item.path);
    try {
      await github.deleteFile(item.path, item.sha);

      if (item.metadata?.split) {
        const downloads = await github.getDownloads();
        for (const part of listSplitPartFiles(item.path, downloads)) {
          try {
            await github.deleteFile(part.path, part.sha);
          } catch {
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
      }

      setItems((prev) => prev.filter((i) => i.path !== item.path));
    } catch (err) {
      logger.error('[Archive] remove failed', { error: err, path: item.path });
      window.alert(toPersianErrorMessage(err));
    } finally {
      setDeleting(null);
    }
  }, []);

  const download = useCallback(
    async (item: ArchiveItem) => {
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
      } catch (err) {
        logger.error('[Archive] download blob failed', { error: err, path: item.path, name: item.name });
        window.alert(toPersianErrorMessage(err));
      } finally {
        setDownloading(null);
      }
    },
    [downloading]
  );

  return {
    items,
    isLoading,
    hasLoadedOnce,
    isRefreshing,
    deleting,
    downloading,
    refresh: loadItems,
    remove,
    download,
  };
}
