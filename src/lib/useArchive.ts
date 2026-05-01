import { useCallback, useEffect, useRef, useState } from 'react';
import { github } from './github';
import { toPersianErrorMessage } from './errors';
import { logger } from './logger';
import { listSplitPartFiles } from './splitParts';

const GITHUB_API_BASE =
  typeof window !== 'undefined' && window.location.origin.startsWith('http://localhost:')
    ? '/github-api'
    : 'https://api.github.com';

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
    const apiUrl = `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/contents/downloads/${encodeURIComponent(thumbPath)}`;
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

async function runWithLimit<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const out: T[] = new Array(tasks.length);
  let idx = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= tasks.length) break;
      out[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return out;
}

export function useArchive({ refreshKey = 0, pollIntervalMs = 30000, enabled = true }: UseArchiveOptions = {}) {
  const [items, setItems] = useState<ArchiveItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const hasLoadedOnceRef = useRef(false);
  const loadInFlightRef = useRef(false);
  const queuedLoadRef = useRef(false);
  const thumbCacheRef = useRef<Map<string, string>>(new Map());
  const metaCacheRef = useRef<Map<string, { sha: string; metadata: ArchiveItem['metadata'] }>>(new Map());

  const loadItems = useCallback(async () => {
    if (loadInFlightRef.current) {
      queuedLoadRef.current = true;
      return;
    }
    loadInFlightRef.current = true;
    if (!github.getConfig()) {
      setItems([]);
      setIsLoading(false);
      hasLoadedOnceRef.current = true;
      setHasLoadedOnce(true);
      loadInFlightRef.current = false;
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
      const downloadsByPath = new Map<string, any>();
      for (const item of downloads) {
        if (item?.path) downloadsByPath.set(item.path, item);
      }

      const videoSourceItems = downloads.filter((item) => {
        if (item.type !== 'file') return false;
        if (item.name.match(/\.z[0-9]+$/)) return false;
        const ext = item.name.split('.').pop()?.toLowerCase();
        return ['mp4', 'webm', 'mkv', 'mov', 'mp3', 'm4a', 'wav', 'ogg', 'flac'].includes(ext || '');
      });

      const splitMetaItems = downloads.filter((item) => {
        if (item.type !== 'file') return false;
        const ext = item.name.split('.').pop()?.toLowerCase();
        return ext === 'json';
      });

      const loadMetadataForPath = async (path: string, sha?: string) => {
        if (!path) return undefined;
        const cacheHit = metaCacheRef.current.get(path);
        if (cacheHit && (!sha || cacheHit.sha === sha)) {
          return cacheHit.metadata;
        }
        const metaContent = await github.getFileContent(path);
        if (!metaContent) return undefined;
        const parsed = JSON.parse(metaContent.content) as ArchiveItem['metadata'];
        if (parsed?.thumbnail && !/^https?:\/\//i.test(parsed.thumbnail)) {
          const key = `${parsed.thumbnail}::${path}`;
          const thumbCached = thumbCacheRef.current.get(key);
          if (thumbCached) {
            parsed.thumbnail = thumbCached;
          } else {
            const hydrated = await hydrateThumbnail(parsed.thumbnail);
            if (hydrated) {
              parsed.thumbnail = hydrated;
              thumbCacheRef.current.set(key, hydrated);
            }
          }
        }
        metaCacheRef.current.set(path, { sha: metaContent.sha, metadata: parsed });
        return parsed;
      };

      const videoTasks = videoSourceItems.map((item) => async () => {
        const ext = item.name.split('.').pop()?.toLowerCase();
        const isVideo = ['mp4', 'webm', 'mkv', 'mov'].includes(ext || '');
        const metaPath = item.path.replace(/\.[^/.]+$/, '.json');
        let metadata: ArchiveItem['metadata'] | undefined;
        try {
          const metaSha = downloadsByPath.get(metaPath)?.sha;
          metadata = await loadMetadataForPath(metaPath, metaSha);
        } catch {
        }
        return {
          name: item.name,
          path: item.path,
          sha: item.sha,
          size: item.size,
          download_url: item.download_url,
          type: isVideo ? 'video' as const : 'audio' as const,
          metadata,
          partFileCount: metadata?.split ? listSplitPartFiles(item.path, downloads).length : undefined,
          committed_at: item?.git_commit?.committer?.date
            ? new Date(item.git_commit.committer.date).getTime()
            : undefined,
        } as ArchiveItem;
      });
      const loadedVideos = await runWithLimit(videoTasks, 4);
      loadedVideos.forEach((v) => {
        videoItems.push(v);
        processedBases.add(v.path.replace(/\.[^/.]+$/, ''));
      });

      const splitTasks = splitMetaItems.map((item) => async () => {
        try {
          const metadata = await loadMetadataForPath(item.path, item.sha);
          if (!metadata?.split || !metadata.parts) return null;
          const base = item.path.replace(/\.json$/, '');
          if (processedBases.has(base)) return null;
          const originalExt = metadata.ext || 'mp4';
          const isV = ['mp4', 'webm', 'mkv', 'mov'].includes(originalExt);
          const isA = ['mp3', 'm4a', 'wav', 'ogg', 'flac'].includes(originalExt);
          return {
            name: `${base}.${originalExt}`,
            path: item.path,
            sha: item.sha,
            size: metadata.original_size || 0,
            download_url: null,
            type: isV ? 'video' as const : isA ? 'audio' as const : 'video' as const,
            metadata,
            partFileCount: listSplitPartFiles(item.path, downloads).length,
            committed_at: item?.git_commit?.committer?.date
              ? new Date(item.git_commit.committer.date).getTime()
              : undefined,
          } as ArchiveItem;
        } catch {
          return null;
        }
      });
      const loadedSplits = await runWithLimit(splitTasks, 4);
      loadedSplits.forEach((item) => {
        if (!item) return;
        const base = item.path.replace(/\.json$/, '');
        if (processedBases.has(base)) return;
        videoItems.push(item);
        processedBases.add(base);
      });

      const needsCommit = videoItems.filter((it) => !it.committed_at).slice(0, 12);
      const commitTimes = await runWithLimit(
        needsCommit.map((it) => async () => github.getFileCommitTime(it.path)),
        4
      );
      needsCommit.forEach((it, i) => {
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
      loadInFlightRef.current = false;
      if (queuedLoadRef.current) {
        queuedLoadRef.current = false;
        void loadItems();
      }
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
        const nativeOk = await github.downloadFileViaNative(item.path, item.name);
        if (nativeOk) return;
        const blob = await github.downloadFileAsBlob(item.sha, item.path);
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
