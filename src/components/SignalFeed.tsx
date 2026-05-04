import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Download,
  Trash2,
  FileVideo,
  FileAudio,
  Package,
  AlertTriangle,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { fa } from '../lib/i18n';
import { CNSError, DownloadJob, github } from '../lib/github';
import { cn } from '../lib/utils';
import { ArchiveItem, formatSize } from '../lib/useArchive';
import { PartsModal } from './PartsModal';
import {
  toPersianErrorMessage,
  toPersianErrorMessageFromLogs,
  toPersianFailureHelp,
  youtubeCookieFailureFromLogs,
  PERSIAN_YOUTUBE_COOKIES_EXPIRED,
} from '../lib/errors';
import { logger } from '../lib/logger';
import { useBodyScrollLock } from '../lib/useBodyScrollLock';

interface ArchiveBundle {
  items: ArchiveItem[];
  isLoading: boolean;
  hasLoadedOnce: boolean;
  downloading: string | null;
  deleting: string | null;
  refresh: () => void;
  download: (item: ArchiveItem) => void;
  remove: (item: ArchiveItem) => void;
}

interface SignalFeedProps {
  jobs: DownloadJob[];
  onUpdate: (jobId: string, updates: Partial<DownloadJob>) => void;
  onRemoveJob: (jobId: string) => void;
  archive: ArchiveBundle;
}

const MAX_LOGS = 16;
const HEARTBEAT_INTERVAL_MS = 15000;
const POLL_FAST_MS = 2000;
const POLL_ACTIVE_MS = 5000;
const POLL_IDLE_MS = 10000;
const POLL_BACKOFF_MS = 20000;
const JOB_FETCH_CONCURRENCY = 4;

function isActiveJobStatus(s: DownloadJob['status']) {
  return s === 'pending' || s === 'running';
}

const RUN_MATCH_MAX_DELTA_MS = 15 * 60 * 1000;
const RUN_MATCH_SKEW_MS = 30_000;

type RunIndex = {
  byId: Map<number, any>;
  byMinute: Map<number, any[]>;
  all: any[];
};

function minuteBucket(ts: number): number {
  return Math.floor(ts / 60000);
}

function buildRunIndex(runs: any[]): RunIndex {
  const byId = new Map<number, any>();
  const byMinute = new Map<number, any[]>();
  const normalized = [...runs];
  for (const run of normalized) {
    if (typeof run?.id === 'number') byId.set(run.id, run);
    const runTime = new Date(run?.created_at ?? 0).getTime();
    if (!Number.isFinite(runTime)) continue;
    const b = minuteBucket(runTime);
    const list = byMinute.get(b);
    if (list) list.push(run);
    else byMinute.set(b, [run]);
  }
  return { byId, byMinute, all: normalized };
}

function candidateRunsForJob(index: RunIndex, jobTime: number): any[] {
  const base = minuteBucket(jobTime);
  const out: any[] = [];
  for (let i = -16; i <= 16; i += 1) {
    const list = index.byMinute.get(base + i);
    if (list) out.push(...list);
  }
  return out.length ? out : index.all;
}

function pickWorkflowRunForJob(job: DownloadJob, index: RunIndex): any | null {
  if (job.githubRunId != null) {
    return index.byId.get(job.githubRunId) ?? null;
  }
  const jobTime = new Date(job.createdAt).getTime();
  if (!Number.isFinite(jobTime)) return null;
  const runs = candidateRunsForJob(index, jobTime);
  if (job.runHint && Number.isFinite(job.runHint.afterTs)) {
    const hinted = runs
      .map((run: any) => {
        const runTime = new Date(run.created_at).getTime();
        if (!Number.isFinite(runTime)) return null;
        return { run, runTime };
      })
      .filter((x): x is { run: any; runTime: number } => x != null)
      .filter((x) => x.runTime >= job.runHint!.afterTs - 10000)
      .sort((a, b) => {
        const da = Math.abs(a.runTime - job.runHint!.afterTs);
        const db = Math.abs(b.runTime - job.runHint!.afterTs);
        if (da !== db) return da - db;
        return (b.run.id ?? 0) - (a.run.id ?? 0);
      });
    if (hinted.length > 0) return hinted[0].run;
  }

  const normalized = runs
    .map((run: any) => {
      const runTime = new Date(run.created_at).getTime();
      if (!Number.isFinite(runTime)) return null;
      return { run, runTime, after: runTime - jobTime };
    })
    .filter((x): x is { run: any; runTime: number; after: number } => x != null);

  const nearDispatch = normalized
    .filter((x) => x.after >= -RUN_MATCH_SKEW_MS && x.after <= RUN_MATCH_MAX_DELTA_MS)
    .sort((a, b) => {
      const aPos = a.after >= 0 ? 1 : 0;
      const bPos = b.after >= 0 ? 1 : 0;
      if (aPos !== bPos) return bPos - aPos;
      if (a.after >= 0 && b.after >= 0) {
        if (a.after !== b.after) return a.after - b.after;
      } else if (a.after < 0 && b.after < 0) {
        if (a.after !== b.after) return b.after - a.after;
      } else if (a.after !== b.after) {
        return a.after - b.after;
      }
      return (b.run.id ?? 0) - (a.run.id ?? 0);
    });

  if (nearDispatch.length > 0) {
    return nearDispatch[0].run;
  }

  const fallback = normalized
    .filter((x) => Math.abs(x.after) < RUN_MATCH_MAX_DELTA_MS)
    .sort((a, b) => {
      const alive = (r: any) => r.status !== 'completed';
      if (alive(a.run) !== alive(b.run)) return alive(a.run) ? -1 : 1;
      const da = Math.abs(a.after);
      const db = Math.abs(b.after);
      if (da !== db) return da - db;
      return (b.run.id ?? 0) - (a.run.id ?? 0);
    });

  return fallback[0]?.run ?? null;
}

async function runWithLimit<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  if (tasks.length === 0) return [];
  const out = new Array<T>(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= tasks.length) return;
      out[i] = await tasks[i]();
    }
  });
  await Promise.all(workers);
  return out;
}

function patchChanged(current: DownloadJob, patch: Partial<DownloadJob>): boolean {
  if (patch.status != null && patch.status !== current.status) return true;
  if (patch.progress != null && patch.progress !== current.progress) return true;
  if (patch.githubRunId != null && patch.githubRunId !== current.githubRunId) return true;
  if (Object.prototype.hasOwnProperty.call(patch, 'githubLiveStep') && patch.githubLiveStep !== current.githubLiveStep) return true;
  if (patch.logs) {
    if (patch.logs.length !== current.logs.length) return true;
    if (patch.logs[patch.logs.length - 1] !== current.logs[current.logs.length - 1]) return true;
  }
  return false;
}

function deriveGithubActionsProgress(
  liveJobs: any[],
  matchingRun: any
): { progress: number; stepName: string | null } {
  const rs = matchingRun?.status;
  if (rs === 'queued' || rs === 'waiting' || rs === 'requested' || rs === 'pending') {
    return { progress: 5, stepName: null };
  }
  if (!Array.isArray(liveJobs) || liveJobs.length === 0) {
    if (rs === 'in_progress') return { progress: 12, stepName: null };
    return { progress: 8, stepName: null };
  }

  const primary =
    liveJobs.find((j: any) => j.status === 'in_progress') ||
    liveJobs.find((j: any) => j.status === 'queued' || j.status === 'pending') ||
    liveJobs.find((j: any) => j.status !== 'completed') ||
    liveJobs[0];

  const steps: any[] = Array.isArray(primary?.steps) ? primary.steps : [];
  if (steps.length === 0) {
    const nm = typeof primary?.name === 'string' ? primary.name : null;
    if (primary?.status === 'completed' && primary?.conclusion === 'success') {
      return { progress: 98, stepName: nm };
    }
    if (primary?.status === 'completed' && primary?.conclusion === 'failure') {
      return { progress: 0, stepName: nm };
    }
    return {
      progress: primary?.status === 'queued' || primary?.status === 'pending' ? 9 : 18,
      stepName: nm,
    };
  }

  let i = 0;
  while (i < steps.length && steps[i]?.status === 'completed') {
    i++;
  }
  const total = Math.max(1, steps.length);
  if (i >= steps.length) {
    return { progress: 96, stepName: null };
  }
  const cur = steps[i];
  if (cur?.conclusion === 'failure' || cur?.conclusion === 'cancelled') {
    return { progress: 0, stepName: typeof cur?.name === 'string' ? cur.name : null };
  }
  const name =
    cur?.status === 'in_progress' || cur?.status === 'queued' || cur?.status === 'pending'
      ? typeof cur?.name === 'string'
        ? cur.name
        : null
      : null;

  let frac = i / total;
  if (cur?.status === 'in_progress') {
    frac += 0.52 / total;
  } else if (cur?.status === 'queued' || cur?.status === 'pending') {
    frac += 0.14 / total;
  }
  const pct = Math.round(Math.min(97, Math.max(3, frac * 100)));
  return { progress: pct, stepName: name || extractLiveStep(liveJobs) };
}

function appendLog(logs: string[], message: string) {
  if (logs[logs.length - 1] === message) return logs;
  return [...logs, message].slice(-MAX_LOGS);
}

function extractLiveStep(jobs: any[]): string | null {
  const activeJob =
    jobs.find((job) => job.status === 'in_progress') ||
    jobs.find((job) => job.status !== 'completed');
  if (!activeJob) return null;

  const activeStep =
    activeJob.steps?.find((step: any) => step.status === 'in_progress') ||
    activeJob.steps?.find((step: any) => step.status !== 'completed');

  if (activeStep?.name) return activeStep.name;
  if (activeJob.name) return activeJob.name;
  return null;
}

function extractFailedStep(jobs: any[]): string | null {
  for (const job of jobs) {
    const failedStep = job.steps?.find((step: any) => step.conclusion === 'failure');
    if (failedStep?.name) return failedStep.name;
    if (job.conclusion === 'failure' && job.name) return job.name;
  }
  return null;
}

function getFailureMessage(stepName: string | null) {
  if (!stepName) return fa.feed.error;
  if (/cookie/i.test(stepName)) {
    return toPersianErrorMessage('cookies.txt missing');
  }
  if (/download/i.test(stepName)) {
    return toPersianErrorMessage('youtube download failed');
  }
  return toPersianErrorMessage(stepName);
}

function persianStepLabel(stepName: string | null): string {
  if (!stepName) return 'دانلود در حال انجام است';
  const lower = stepName.toLowerCase();
  if (lower.includes('checkout')) return 'در حال آماده‌سازی مخزن';
  if (lower.includes('setup python')) return 'در حال آماده‌سازی پایتون';
  if (lower.includes('setup node')) return 'در حال آماده‌سازی ابزار دانلود';
  if (lower.includes('install')) return 'در حال نصب ابزارهای دانلود';
  if (lower.includes('cookies')) return 'در حال بررسی کوکی‌های یوتیوب';
  if (lower === 'download' || lower.includes('download video')) return 'در حال دانلود ویدیو';
  if (lower.includes('metadata')) return 'در حال خواندن نام و تصویر ویدیو';
  if (lower.includes('split')) return 'در حال بخش‌بندی فایل بزرگ';
  if (lower.includes('commit') || lower.includes('push')) return 'در حال ذخیره فایل در گیت‌هاب';
  if (lower.includes('cleanup')) return 'در حال پاک‌سازی فایل‌های قدیمی';
  return `در حال انجام مرحله: ${stepName}`;
}

function persianLogLine(log: string | undefined): string {
  const text = log?.replace(/^\[[^\]]+\]\s*/, '') ?? '';
  if (!text) return 'در حال دریافت وضعیت دانلود';
  if (/[\u0600-\u06ff]/.test(text)) return text;
  return persianStepLabel(text);
}

function computeProgress(job: DownloadJob): number {
  if (job.status === 'success') return 100;
  if (job.status === 'failed') return 0;
  if (typeof job.progress === 'number' && job.progress >= 0) {
    return Math.min(99, Math.max(2, job.progress));
  }
  return job.status === 'pending' ? 4 : 10;
}

interface UnifiedCard {
  key: string;
  job?: DownloadJob;
  archive?: ArchiveItem;
  sortAt: number;
}

function urlSlug(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split('/').filter(Boolean).pop() || u.hostname;
    return last.length > 48 ? `${last.slice(0, 48)}...` : last;
  } catch {
    return url.slice(0, 48);
  }
}

function resolveDir(value: string | undefined): 'rtl' | 'ltr' {
  return value && /[\u0600-\u06ff]/.test(value) ? 'rtl' : 'ltr';
}

function urlHostnameMatches(hostname: string, root: string): boolean {
  const h = hostname.toLowerCase();
  const r = root.toLowerCase();
  return h === r || h.endsWith(`.${r}`);
}

function sourceName(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (urlHostnameMatches(host, 'youtube.com') || urlHostnameMatches(host, 'youtu.be')) return 'یوتیوب';
    if (urlHostnameMatches(host, 'instagram.com')) return 'اینستاگرام';
    return host;
  } catch {
    return 'لینک وارد شده';
  }
}

function pickThumb(job?: DownloadJob, archive?: ArchiveItem): string | undefined {
  return archive?.metadata?.thumbnail || job?.meta?.thumbnail;
}

function pickTitle(job?: DownloadJob, archive?: ArchiveItem): string {
  if (!archive && job && !job.meta?.title) {
    if (job.status === 'pending' || job.status === 'running') {
      return 'در حال دریافت اطلاعات ویدیو';
    }
    if (job.status === 'failed') {
      return 'دانلود ناموفق شد';
    }
    return 'ویدیوی آماده‌سازی شده';
  }

  return (
    archive?.metadata?.title ||
    job?.meta?.title ||
    (archive ? archive.name : job ? urlSlug(job.url) : 'unknown')
  );
}

function pickChannel(job?: DownloadJob, archive?: ArchiveItem): string | undefined {
  return archive?.metadata?.uploader || job?.meta?.channel || (job ? sourceName(job.url) : undefined);
}

function pickDuration(job?: DownloadJob, archive?: ArchiveItem): string | undefined {
  return archive?.metadata?.duration || job?.meta?.duration;
}

export function SignalFeed({ jobs, onUpdate, onRemoveJob, archive }: SignalFeedProps) {
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const lastStepRef = useRef<Record<string, string>>({});
  const lastHeartbeatRef = useRef<Record<string, number>>({});
  const shownFailuresRef = useRef<Set<string>>(new Set());
  const [partsModal, setPartsModal] = useState<ArchiveItem | null>(null);
  const handleShowParts = useCallback((item: ArchiveItem) => {
    setPartsModal(item);
  }, []);

  const [failedJob, setFailedJob] = useState<DownloadJob | null>(null);
  const refreshArchive = archive.refresh;
  const failedLogFetchedRef = useRef<Set<string>>(new Set());
  const lastArchiveRefreshAtRef = useRef(0);

  useEffect(() => {
    const failed = jobs.find((job) => job.status === 'failed' && !shownFailuresRef.current.has(job.id));
    if (!failed) return;
    shownFailuresRef.current.add(failed.id);
    setFailedJob(failed);
  }, [jobs]);

  useEffect(() => {
    setFailedJob((cur) => (cur && !jobs.some((j) => j.id === cur.id) ? null : cur));
  }, [jobs]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | null = null;
    let unchangedPolls = 0;
    let fastLaneTicks = 0;
    let staleFallbackLeft = 0;
    let lastGoodRuns: any[] = [];
    const lastGoodRunJobs = new Map<number, any[]>();

    const scheduleNext = (ms: number) => {
      if (cancelled) return;
      timer = window.setTimeout(pollJobs, ms);
    };

    const pollJobs = async () => {
      const activeIds = jobsRef.current
        .filter((j) => isActiveJobStatus(j.status))
        .map((j) => j.id);
      if (activeIds.length === 0) {
        unchangedPolls = 0;
        fastLaneTicks = 0;
        scheduleNext(POLL_IDLE_MS);
        return;
      }

      try {
        const runs = await github.getWorkflowRuns();
        lastGoodRuns = runs;
        staleFallbackLeft = 2;
        const runIndex = buildRunIndex(runs);
        const matchedByJobId = new Map<string, any>();
        const uniqueRunIds = new Set<number>();
        for (const jobId of activeIds) {
          const current = jobsRef.current.find((j) => j.id === jobId);
          if (!current || !isActiveJobStatus(current.status)) continue;
          const matchingRun = pickWorkflowRunForJob(current, runIndex);
          if (!matchingRun) {
            const age = Date.now() - new Date(current.createdAt).getTime();
            if (Number.isFinite(age) && age < 45_000) {
              continue;
            }
          }
          if (!matchingRun) continue;
          matchedByJobId.set(jobId, matchingRun);
          if (typeof matchingRun.id === 'number') uniqueRunIds.add(matchingRun.id);
        }

        const uniqueIds = [...uniqueRunIds];
        const jobsResults = await runWithLimit(
          uniqueIds.map((runId) => async () => {
            const liveJobs = await github.getWorkflowRunJobs(runId).catch(() => []);
            return { runId, liveJobs };
          }),
          JOB_FETCH_CONCURRENCY
        );
        const jobsByRunId = new Map<number, any[]>();
        for (const { runId, liveJobs } of jobsResults) {
          jobsByRunId.set(runId, liveJobs);
          lastGoodRunJobs.set(runId, liveJobs);
        }

        const patchCountBefore = matchedByJobId.size;
        let patchCount = 0;
        const refreshSet = new Set<string>();
        let hadStateChange = false;

        for (const jobId of activeIds) {
          let current = jobsRef.current.find((j) => j.id === jobId);
          if (!current || !isActiveJobStatus(current.status)) continue;

          const matchingRun = matchedByJobId.get(jobId);
          if (!matchingRun) continue;

          current = jobsRef.current.find((j) => j.id === jobId);
          if (!current || !isActiveJobStatus(current.status)) continue;

          const status =
            matchingRun.status === 'completed'
              ? matchingRun.conclusion === 'success'
                ? 'success'
                : 'failed'
              : 'running';

          let logs = current.logs;
          let shouldUpdate = false;

          const liveJobs = jobsByRunId.get(matchingRun.id) ?? [];

          current = jobsRef.current.find((j) => j.id === jobId);
          if (!current || !isActiveJobStatus(current.status)) continue;

          const gh = deriveGithubActionsProgress(liveJobs, matchingRun);

          if (status === 'running') {
            const liveStep = gh.stepName || extractLiveStep(liveJobs);
            const now = Date.now();

            if (current.status === 'pending') {
              logs = appendLog(
                logs,
                `[${new Date().toLocaleTimeString('fa-IR')}] دانلود آغاز شد`
              );
              shouldUpdate = true;
            }

            if (liveStep && lastStepRef.current[jobId] !== liveStep) {
              logs = appendLog(
                logs,
                `[${new Date().toLocaleTimeString('fa-IR')}] ${persianStepLabel(liveStep)}`
              );
              lastStepRef.current[jobId] = liveStep;
              lastHeartbeatRef.current[jobId] = now;
              shouldUpdate = true;
            } else if (
              now - (lastHeartbeatRef.current[jobId] ?? 0) >=
              HEARTBEAT_INTERVAL_MS
            ) {
              const heartbeat = liveStep
                ? persianStepLabel(liveStep)
                : '...در حال دانلود';
              logs = appendLog(
                logs,
                `[${new Date().toLocaleTimeString('fa-IR')}] ${heartbeat}`
              );
              lastHeartbeatRef.current[jobId] = now;
              shouldUpdate = true;
            }
          } else {
            delete lastStepRef.current[jobId];
            delete lastHeartbeatRef.current[jobId];
          }

          if (status !== current.status) {
            hadStateChange = true;
            if (status === 'success') {
              logs = appendLog(
                logs,
                `[${new Date().toLocaleTimeString('fa-IR')}] ${fa.feed.complete}`
              );
              refreshSet.add(jobId);
            } else if (status === 'failed') {
              let failureLine = getFailureMessage(extractFailedStep(liveJobs));
              const failedRunJob = liveJobs.find((j: any) => j.conclusion === 'failure');
              const ghJobIdRaw = failedRunJob?.id;
              const ghJobIdNum =
                typeof ghJobIdRaw === 'number'
                  ? ghJobIdRaw
                  : typeof ghJobIdRaw === 'string' && /^\d+$/.test(ghJobIdRaw)
                    ? parseInt(ghJobIdRaw, 10)
                    : NaN;
              const failureSig = `${ghJobIdNum}:${String(failedRunJob?.completed_at || failedRunJob?.updated_at || '')}`;
              if (Number.isFinite(ghJobIdNum) && !failedLogFetchedRef.current.has(failureSig)) {
                failedLogFetchedRef.current.add(failureSig);
                const raw = await github.getJobLogsText(ghJobIdNum);
                current = jobsRef.current.find((j) => j.id === jobId);
                if (!current || !isActiveJobStatus(current.status)) continue;
                if (raw && youtubeCookieFailureFromLogs(raw.split(/\r?\n/))) {
                  failureLine = PERSIAN_YOUTUBE_COOKIES_EXPIRED;
                }
              }
              logs = appendLog(
                logs,
                `[${new Date().toLocaleTimeString('fa-IR')}] ${failureLine}`
              );
            }
            shouldUpdate = true;
          }

          current = jobsRef.current.find((j) => j.id === jobId);
          if (!current || !isActiveJobStatus(current.status)) continue;

          const patch: Partial<DownloadJob> = {};
          if (current.githubRunId == null) {
            patch.githubRunId = matchingRun.id;
            const attachLine = `[${new Date().toLocaleTimeString('fa-IR')}] اتصال به اجرای گیت‌هاب برقرار شد`;
            patch.logs = appendLog(logs, attachLine);
          }
          if (shouldUpdate) {
            patch.status = status;
            patch.logs = logs;
          }
          if (status === 'success') {
            patch.progress = 100;
            patch.githubLiveStep = undefined;
          } else if (status === 'failed') {
            patch.progress = 0;
            patch.githubLiveStep = undefined;
          } else {
            const nextStep = gh.stepName ?? undefined;
            if (
              gh.progress !== current.progress ||
              (current.githubLiveStep ?? undefined) !== nextStep
            ) {
              patch.progress = gh.progress;
              patch.githubLiveStep = nextStep;
            }
          }
          if (Object.keys(patch).length > 0 && patchChanged(current, patch)) {
            onUpdate(jobId, patch);
            patchCount += 1;
            if (patch.status != null || patch.progress != null || patch.githubLiveStep !== undefined) {
              hadStateChange = true;
            }
          }
        }
        if (refreshSet.size > 0) {
          const now = Date.now();
          if (now - lastArchiveRefreshAtRef.current > 1800) {
            lastArchiveRefreshAtRef.current = now;
            window.setTimeout(() => refreshArchive(), 900);
          }
        }
        const changed = patchCount > 0 || patchCountBefore === 0;
        unchangedPolls = changed ? 0 : Math.min(unchangedPolls + 1, 10);
        const hasFreshSubmit = jobsRef.current.some((j) => {
          if (!isActiveJobStatus(j.status)) return false;
          const age = Date.now() - new Date(j.createdAt).getTime();
          return Number.isFinite(age) && age < 20000;
        });
        if (hadStateChange) {
          fastLaneTicks = 2;
        } else if (hasFreshSubmit) {
          fastLaneTicks = Math.max(fastLaneTicks, 2);
        } else if (fastLaneTicks > 0) {
          fastLaneTicks -= 1;
        }
        const nextMs =
          fastLaneTicks > 0 ? POLL_FAST_MS : unchangedPolls >= 3 ? POLL_BACKOFF_MS : POLL_ACTIVE_MS;
        scheduleNext(nextMs);
      } catch (err) {
        logger.warn('[Poll] Workflow status poll failed', {
          error: err,
          runningJobIds: activeIds,
          runningCount: activeIds.length,
          ...(err instanceof CNSError
            ? { cnsErrorCode: err.code, cnsRetryable: err.retryable }
            : {}),
        });
        if (staleFallbackLeft > 0 && lastGoodRuns.length > 0) {
          staleFallbackLeft -= 1;
          const runIndex = buildRunIndex(lastGoodRuns);
          for (const jid of activeIds) {
            const latest = jobsRef.current.find((j) => j.id === jid);
            if (!latest || !isActiveJobStatus(latest.status)) continue;
            const run = pickWorkflowRunForJob(latest, runIndex);
            if (!run) continue;
            const liveJobs = lastGoodRunJobs.get(run.id) ?? [];
            const gh = deriveGithubActionsProgress(liveJobs, run);
            const nextStep = gh.stepName ?? undefined;
            const patch: Partial<DownloadJob> = {};
            if (gh.progress !== latest.progress) patch.progress = gh.progress;
            if ((latest.githubLiveStep ?? undefined) !== nextStep) patch.githubLiveStep = nextStep;
            if (Object.keys(patch).length > 0 && patchChanged(latest, patch)) {
              onUpdate(jid, patch);
            }
          }
        } else {
          for (const jid of activeIds) {
            const latest = jobsRef.current.find((j) => j.id === jid);
            if (!latest || !isActiveJobStatus(latest.status)) continue;
            onUpdate(jid, {
              logs: appendLog(latest.logs, `[${new Date().toLocaleTimeString('fa-IR')}] ${toPersianErrorMessage(err)}`),
              progress: latest.progress,
            });
          }
        }
        unchangedPolls = Math.min(unchangedPolls + 1, 10);
        scheduleNext(POLL_BACKOFF_MS);
      }
    };

    pollJobs();
    return () => {
      cancelled = true;
      if (timer != null) window.clearTimeout(timer);
    };
  }, [onUpdate, refreshArchive]);

  const cards: UnifiedCard[] = useMemo(() => {
    const usedArchivePaths = new Set<string>();
    const result: UnifiedCard[] = [];

    const sortedJobs = [...jobs].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    const sortedArchive = [...archive.items].sort(
      (a, b) => (a.committed_at ?? 0) - (b.committed_at ?? 0)
    );

    for (const job of sortedJobs) {
      let matchedArchive: ArchiveItem | undefined;
      if (job.status === 'success') {
        const jobTime = new Date(job.createdAt).getTime();
        const candidate = sortedArchive.find(
          (a) =>
            !usedArchivePaths.has(a.path) &&
            (a.committed_at ?? 0) >= jobTime - 5_000 &&
            (a.committed_at ?? 0) <= jobTime + 30 * 60_000
        );
        if (candidate) {
          usedArchivePaths.add(candidate.path);
          matchedArchive = candidate;
        }
      }
      result.push({
        key: `job:${job.id}`,
        job,
        archive: matchedArchive,
        sortAt:
          matchedArchive?.committed_at ??
          new Date(job.createdAt).getTime(),
      });
    }

    for (const item of archive.items) {
      if (usedArchivePaths.has(item.path)) continue;
      result.push({
        key: `arc:${item.path}`,
        archive: item,
        sortAt: item.committed_at ?? 0,
      });
    }

    result.sort((a, b) => {
      const aActive = a.job && (a.job.status === 'pending' || a.job.status === 'running');
      const bActive = b.job && (b.job.status === 'pending' || b.job.status === 'running');
      if (aActive && !bActive) return -1;
      if (bActive && !aActive) return 1;
      return b.sortAt - a.sortAt;
    });

    return result;
  }, [jobs, archive.items]);

  if (cards.length === 0) {
    if (archive.isLoading && !archive.hasLoadedOnce) {
      return (
        <div className="results-empty">
          <Loader2 size={20} className="animate-spin opacity-70" />
          <span dir="ltr" className="opacity-70">
            ...در حال بررسی
          </span>
        </div>
      );
    }
    return (
      <div className="results-empty">
        <span dir="ltr">لینک یوتیوب را وارد کنید و دکمه دریافت را بزنید</span>
        <span dir="ltr" className="opacity-50 text-[10px]">
          برای شروع، لینک را بالا وارد کنید
        </span>
      </div>
    );
  }

  return (
    <div className="results-list">
      {cards.map((card) => (
        <ResultCard
          key={card.key}
          card={card}
          archiveDownloading={archive.downloading}
          archiveDeleting={archive.deleting}
          onDownload={archive.download}
          onDelete={archive.remove}
          onRemoveJob={onRemoveJob}
          onShowParts={handleShowParts}
        />
      ))}

      {partsModal && (
        <PartsModal item={partsModal} onClose={() => setPartsModal(null)} />
      )}

      {failedJob && (
        <FailureModal
          job={failedJob}
          onClose={() => setFailedJob(null)}
          onRemoveFromList={() => {
            onRemoveJob(failedJob.id);
            setFailedJob(null);
          }}
        />
      )}
    </div>
  );
}

function FailureModal({
  job,
  onClose,
  onRemoveFromList,
}: {
  job: DownloadJob;
  onClose: () => void;
  onRemoveFromList: () => void;
}) {
  useBodyScrollLock(true);
  const title = pickTitle(job);
  const source = pickChannel(job);
  const reason = toPersianErrorMessageFromLogs(job.logs);
  const help = toPersianFailureHelp(reason);
  const thumb = pickThumb(job);

  return (
    <div className="failure-popup-wrap" onClick={onClose}>
      <div className="failure-popup" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="failure-popup-head">
          <AlertTriangle size={20} />
          <div>
            <strong>دانلود ناموفق شد</strong>
            <span>فایل دانلود نشد. دلیل زیر را بررسی کنید.</span>
          </div>
        </div>

        <div className="failure-popup-video">
          <div className="failure-popup-thumb">
            {thumb ? <img src={thumb} alt="" /> : <FileVideo size={22} />}
          </div>
          <div className="min-w-0">
            <div className="failure-popup-title" dir="auto">{title}</div>
            <div className="failure-popup-source" dir="auto">{source}</div>
            <div className="failure-popup-url" dir="auto">{job.url}</div>
          </div>
        </div>

        <div className="failure-popup-reason">
          <span>دلیل خطا:</span>
          <p>{reason}</p>
        </div>

        <div className="failure-popup-help">
          {help}
        </div>

        <div className="failure-popup-actions">
          <button type="button" className="failure-popup-btn failure-popup-btn-remove" onClick={onRemoveFromList}>
            {fa.feed.removeFailedFromList}
          </button>
          <button type="button" className="failure-popup-btn" onClick={onClose}>
            فهمیدم
          </button>
        </div>
      </div>
    </div>
  );
}

interface ResultCardProps {
  card: UnifiedCard;
  archiveDownloading: string | null;
  archiveDeleting: string | null;
  onDownload: (item: ArchiveItem) => void;
  onDelete: (item: ArchiveItem) => void;
  onRemoveJob: (jobId: string) => void;
  onShowParts: (item: ArchiveItem) => void;
}

const ResultCard = memo(function ResultCard({
  card,
  archiveDownloading,
  archiveDeleting,
  onDownload,
  onDelete,
  onRemoveJob,
  onShowParts,
}: ResultCardProps) {
  const { job, archive } = card;
  const title = pickTitle(job, archive);
  const channel = pickChannel(job, archive);
  const duration = pickDuration(job, archive);
  const thumb = pickThumb(job, archive);
  const titleDir = resolveDir(title);

  const isLive = job && (job.status === 'pending' || job.status === 'running');
  const isFailed = job && job.status === 'failed';
  const isSuccess = !job || job.status === 'success';
  const isAudio = archive?.type === 'audio' || job?.format === 'mp3';
  const Icon = isAudio ? FileAudio : FileVideo;

  const latestLog = job ? job.logs[job.logs.length - 1] : undefined;
  const readableLog = job?.githubLiveStep
    ? persianStepLabel(job.githubLiveStep)
    : persianLogLine(latestLog);
  const progress = job ? computeProgress(job) : 100;
  const liveStatus =
    job?.githubLiveStep != null && job.githubLiveStep !== ''
      ? persianStepLabel(job.githubLiveStep)
      : job?.status === 'pending'
        ? 'در صف اجرای گیت‌هاب'
        : job?.status === 'running'
          ? 'در حال اجرا در گیت‌هاب'
          : '';

  const split = archive?.metadata?.split;
  const partsCount = archive?.partFileCount ?? archive?.metadata?.parts ?? 0;
  const sizeBytes = archive?.metadata?.original_size || archive?.size || 0;

  return (
    <article
      className={cn(
        'result-card',
        isLive && 'is-live',
        isFailed && 'is-failed',
        isSuccess && 'is-success'
      )}
    >
      <div className="result-card-thumb">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="result-card-thumb-placeholder">
            <Icon size={22} />
          </div>
        )}
      </div>

      <div className="result-card-body">
        <div
          className="result-card-title"
          dir={titleDir}
          title={title}
        >
          <bdi>{title}</bdi>
        </div>

        <div className="result-card-meta" dir="auto">
          {channel && <span className="meta-channel" dir="auto">{channel}</span>}
          {channel && duration && <span className="meta-sep">·</span>}
          {duration && <span className="meta-duration">{duration}</span>}
          {!channel && !duration && job && (
            <span className="meta-channel opacity-60">{sourceName(job.url)}</span>
          )}
        </div>

        <div className="result-card-action">
          {isLive && (
            <div className="live-action">
              <div className="live-status-row" dir="rtl">
                <span className="live-status-label">وضعیت:</span>
                <span className="live-status-value">{liveStatus}</span>
                <span className="live-progress-text">{progress.toLocaleString('fa-IR')}٪</span>
              </div>
              <div className="progress-rail" data-progress={progress}>
                <div
                  className="progress-rail-fill"
                  style={{ width: `${progress}%` }}
                />
                <div
                  className="progress-rail-tail"
                  style={{ left: `${progress}%`, width: `${Math.max(0, 100 - progress)}%` }}
                >
                  <div className="progress-rail-shimmer" />
                </div>
              </div>
              {(job.githubLiveStep || latestLog) && (
                <div key={job.githubLiveStep || latestLog || 'live'} className="live-log-line" dir="auto">
                  <span>آخرین وضعیت:</span>
                  <bdi dir="auto">{readableLog}</bdi>
                </div>
              )}
            </div>
          )}

          {isFailed && job && (
            <div className="fail-block" dir="rtl">
              <div className="fail-action" dir="auto">
                <AlertTriangle size={12} />
                <span dir="auto">{toPersianErrorMessageFromLogs(job.logs)}</span>
              </div>
              <button type="button" className="fail-remove-btn" onClick={() => onRemoveJob(job.id)}>
                {fa.feed.removeFailedFromList}
              </button>
            </div>
          )}

          {isSuccess && archive && split && (
            <button
              type="button"
              onClick={() => onShowParts(archive)}
              className="card-btn primary"
            >
              <Package size={12} />
              <span dir="ltr">
                دانلود بخش‌ها ({partsCount.toLocaleString('fa-IR')})
              </span>
            </button>
          )}

          {isSuccess && archive && !split && (
            <button
              type="button"
              onClick={() => onDownload(archive)}
              disabled={archiveDownloading === archive.path}
              className="card-btn primary"
            >
              {archiveDownloading === archive.path ? (
                <RefreshCw size={12} className="animate-spin" />
              ) : (
                <Download size={12} />
              )}
              <span dir="auto">
                {archiveDownloading === archive.path ? '...در حال دانلود' : 'دانلود'}
              </span>
            </button>
          )}

          {isSuccess && !archive && job && (
            <div className="post-action" dir="auto">
              ...در حال آماده‌سازی فایل
            </div>
          )}

          {archive && (
            <div className="card-flags" dir="ltr">
              <span className="card-flag">{formatSize(sizeBytes)}</span>
              {split && (
                <span className="card-flag warn" dir="ltr">
                  <span className="part-count-label" dir="rtl">
                    <bdi>{partsCount.toLocaleString('fa-IR')}</bdi> بخش
                  </span>
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {archive && (
        <button
          type="button"
          onClick={() => onDelete(archive)}
          disabled={archiveDeleting === archive.path}
          className="card-trash"
          aria-label="delete"
          title={fa.archive.delete}
        >
          <Trash2 size={12} />
        </button>
      )}
    </article>
  );
});
