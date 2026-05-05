import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeRepoContentsPath, github } from './github';
import { toPersianErrorMessage } from './errors';
import { logger } from './logger';
import { listSplitPartFiles } from './splitParts';

const GITHUB_API_BASE = 'https://api.github.com';

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
    original_url?: string;
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
    const rel = thumbPath.startsWith('downloads/') ? thumbPath : `downloads/${thumbPath}`;
    const apiUrl = `${GITHUB_API_BASE}/repos/${config.owner}/${config.repo}/contents/${encodeRepoContentsPath(rel)}`;
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
  const thumbCacheTimeRef = useRef<Map<string, number>>(new Map());
  const thumbInflightRef = useRef<Map<string, Promise<string | undefined>>>(new Map());
  const metaCacheRef = useRef<Map<string, { sha: string; metadata: ArchiveItem['metadata'] }>>(new Map());
  const metaCacheTimeRef = useRef<Map<string, number>>(new Map());
  const metaInflightRef = useRef<Map<string, Promise<ArchiveItem['metadata'] | undefined>>>(new Map());

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
        const cacheTs = metaCacheTimeRef.current.get(path) ?? 0;
        if (cacheHit && (!sha || cacheHit.sha === sha) && Date.now() - cacheTs < 25_000) {
          return cacheHit.metadata;
        }
        const inflight = metaInflightRef.current.get(path);
        if (inflight) return inflight;
        const load = (async () => {
          const metaContent = await github.getFileContent(path);
          if (!metaContent) return undefined;
          const parsed = JSON.parse(metaContent.content) as ArchiveItem['metadata'];
          if (parsed?.thumbnail && !/^https?:\/\//i.test(parsed.thumbnail)) {
            const key = `${parsed.thumbnail}::${path}`;
            const thumbCached = thumbCacheRef.current.get(key);
            const thumbTs = thumbCacheTimeRef.current.get(key) ?? 0;
            if (thumbCached && Date.now() - thumbTs < 30_000) {
              parsed.thumbnail = thumbCached;
            } else {
              const thumbInflight = thumbInflightRef.current.get(key);
              if (thumbInflight) {
                const hydrated = await thumbInflight;
                if (hydrated) parsed.thumbnail = hydrated;
              } else {
                const thumbLoad = hydrateThumbnail(parsed.thumbnail);
                thumbInflightRef.current.set(key, thumbLoad);
                const hydrated = await thumbLoad.finally(() => {
                  thumbInflightRef.current.delete(key);
                });
                if (hydrated) {
                  parsed.thumbnail = hydrated;
                  thumbCacheRef.current.set(key, hydrated);
                  thumbCacheTimeRef.current.set(key, Date.now());
                }
              }
            }
          }
          metaCacheRef.current.set(path, { sha: metaContent.sha, metadata: parsed });
          metaCacheTimeRef.current.set(path, Date.now());
          return parsed;
        })().finally(() => {
          metaInflightRef.current.delete(path);
        });
        metaInflightRef.current.set(path, load);
        return load;
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

      videoItems.sort((a, b) => {
        const aTime = a.committed_at ?? 0;
        const bTime = b.committed_at ?? 0;
        if (aTime || bTime) return bTime - aTime;
        return b.name.localeCompare(a.name);
      });
      setItems(videoItems);

      const needsCommit = videoItems.filter((it) => !it.committed_at).slice(0, 16);
      if (needsCommit.length > 0) {
        void runWithLimit(
          needsCommit.map((it) => async () => {
            const ct = await github.getFileCommitTime(it.path);
            const ts = new Date(ct ?? 0).getTime();
            return { path: it.path, ts: Number.isFinite(ts) ? ts : 0 };
          }),
          4
        ).then((results) => {
          if (!results.length) return;
          setItems((prev) => {
            const byPath = new Map(results.map((x) => [x.path, x.ts]));
            const next = prev.map((it) => {
              const ts = byPath.get(it.path);
              return ts && ts > 0 ? { ...it, committed_at: ts } : it;
            });
            next.sort((a, b) => {
              const aTime = a.committed_at ?? 0;
              const bTime = b.committed_at ?? 0;
              if (aTime || bTime) return bTime - aTime;
              return b.name.localeCompare(a.name);
            });
            return next;
          });
        });
      }
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
      const nested = /^downloads\/[^/]+\/.+$/.test(item.path);
      if (nested) {
        const folder = item.path.slice(0, item.path.indexOf('/', 'downloads/'.length));
        await github.deleteDirectorySingleCommit(folder);
        setItems((prev) => prev.filter((i) => i.path !== item.path && !i.path.startsWith(`${folder}/`)));
        github.invalidateDownloadsCache(folder);
      } else {
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
      }
      await loadItems();
    } catch (err) {
      logger.error('[Archive] remove failed', { error: err, path: item.path });
      window.alert(toPersianErrorMessage(err));
    } finally {
      setDeleting(null);
    }
  }, [loadItems]);

  const download = useCallback(
    async (item: ArchiveItem) => {
      if (downloading) return;
      setDownloading(item.path);
      try {
        const preflight = await github.preflightDownload(item.path);
        if (!preflight.ok) throw new Error(preflight.reason || 'Download preflight failed');
        const nativePath = await github.downloadFileViaNative(item.path, item.name);
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
            blob = await github.downloadFileAsBlob(item.sha, item.path);
            break;
          } catch (err) {
            lastErr = err;
            if (attempt < 2) {
              const jitter = 280 + Math.floor(Math.random() * 520);
              await new Promise((resolve) => setTimeout(resolve, jitter * (attempt + 1)));
            }
          }
        }
        if (!blob) throw (lastErr instanceof Error ? lastErr : new Error('Download failed'));
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
