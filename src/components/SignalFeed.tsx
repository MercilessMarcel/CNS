import { useEffect, useRef } from 'react';
import { Terminal, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { fa } from '../lib/i18n';
import { DownloadJob, github } from '../lib/github';
import { cn } from '../lib/utils';

interface SignalFeedProps {
  jobs: DownloadJob[];
  onUpdate: (jobId: string, updates: Partial<DownloadJob>) => void;
}

const STATUS_ICONS = {
  pending: Terminal,
  running: Loader2,
  success: CheckCircle,
  failed: XCircle,
};

const STATUS_COLORS = {
  pending: 'text-cns-deep',
  running: 'text-cns-primary animate-pulse-signal',
  success: 'text-cns-highlight',
  failed: 'text-cns-warning',
};

const MAX_LOGS = 16;
const HEARTBEAT_INTERVAL_MS = 15000;

function appendLog(logs: string[], message: string) {
  if (logs[logs.length - 1] === message) return logs;
  return [...logs, message].slice(-MAX_LOGS);
}

function extractLiveStep(jobs: any[]): string | null {
  const activeJob = jobs.find((job) => job.status === 'in_progress') || jobs.find((job) => job.status !== 'completed');
  if (!activeJob) return null;

  const activeStep = activeJob.steps?.find((step: any) => step.status === 'in_progress')
    || activeJob.steps?.find((step: any) => step.status !== 'completed');

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
    return 'کوکی‌های یوتیوب پیدا نشد. از تنظیمات، cookies.txt جدید را وارد و دوباره ذخیره کنید.';
  }
  if (/download/i.test(stepName)) {
    return 'یوتیوب دانلود را به دلیل کوکی منقضی یا تأیید بات مسدود کرد. از مرورگری که داخل یوتیوب لاگین است cookies.txt جدید بگیرید و در تنظیمات ذخیره کنید.';
  }
  return `خطا در مرحله: ${stepName}`;
}

export function SignalFeed({ jobs, onUpdate }: SignalFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const logRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const lastStepRef = useRef<Record<string, string>>({});
  const lastHeartbeatRef = useRef<Record<string, number>>({});

  const formatTime = (value: string) =>
    new Date(value).toLocaleTimeString('fa-IR', {
      hour: '2-digit',
      minute: '2-digit',
    });

  useEffect(() => {
    const latestActive = jobs.find(job => job.status === 'pending' || job.status === 'running') ?? jobs[0];
    if (!latestActive) return;

    requestAnimationFrame(() => {
      logRefs.current[latestActive.id]?.scrollTo({
        top: logRefs.current[latestActive.id]?.scrollHeight ?? 0,
        behavior: 'smooth',
      });
      scrollRef.current?.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    });
  }, [jobs]);

  useEffect(() => {
    const pollJobs = async () => {
      const runningJobs = jobs.filter(j => j.status === 'pending' || j.status === 'running');

      if (runningJobs.length === 0) return;

      try {
        const runs = await github.getWorkflowRuns();

        for (const job of runningJobs) {
          const matchingRun = runs.find((run: any) => {
            const runTime = new Date(run.created_at).getTime();
            const jobTime = new Date(job.createdAt).getTime();
            return Math.abs(runTime - jobTime) < 60000;
          });

          if (matchingRun) {
            const status = matchingRun.status === 'completed'
              ? (matchingRun.conclusion === 'success' ? 'success' : 'failed')
              : 'running';
            let logs = job.logs;
            let shouldUpdate = false;

            const liveJobs = await github.getWorkflowRunJobs(matchingRun.id).catch(() => []);

            if (status === 'running') {
              const liveStep = extractLiveStep(liveJobs);
              const now = Date.now();
              const formatLabel = job.format.toUpperCase();
              const qualityLabel = job.quality === 'audio' ? 'فقط صدا' : `${job.quality}P`;

              if (job.status === 'pending') {
                logs = appendLog(
                  logs,
                  `[${new Date().toLocaleTimeString('fa-IR')}] دانلود ${qualityLabel} (${formatLabel}) آغاز شد`
                );
                shouldUpdate = true;
              }

              if (liveStep && lastStepRef.current[job.id] !== liveStep) {
                logs = appendLog(logs, `[${new Date().toLocaleTimeString('fa-IR')}] ${liveStep}`);
                lastStepRef.current[job.id] = liveStep;
                lastHeartbeatRef.current[job.id] = now;
                shouldUpdate = true;
              } else if (now - (lastHeartbeatRef.current[job.id] ?? 0) >= HEARTBEAT_INTERVAL_MS) {
                const heartbeatText = liveStep
                  ? `در حال اجرا: ${liveStep}`
                  : 'در حال دانلود...';
                logs = appendLog(logs, `[${new Date().toLocaleTimeString('fa-IR')}] ${heartbeatText}`);
                lastHeartbeatRef.current[job.id] = now;
                shouldUpdate = true;
              }
            } else {
              delete lastStepRef.current[job.id];
              delete lastHeartbeatRef.current[job.id];
            }

            if (status !== job.status) {
              if (status === 'success') {
                logs = appendLog(logs, `[${new Date().toLocaleTimeString('fa-IR')}] ${fa.feed.complete}`);
              } else if (status === 'failed') {
                const failedStep = extractFailedStep(liveJobs);
                logs = appendLog(logs, `[${new Date().toLocaleTimeString('fa-IR')}] ${getFailureMessage(failedStep)}`);
              }
              shouldUpdate = true;
            }

            if (shouldUpdate) {
              onUpdate(job.id, {
                status,
                logs,
                progress: status === 'success' ? 100 : job.progress,
              });
            }
          }
        }
      } catch {
        // Silently handle polling errors
      }
    };

    const interval = setInterval(pollJobs, 5000);
    pollJobs();

    return () => clearInterval(interval);
  }, [jobs, onUpdate]);

  if (jobs.length === 0) {
    return (
      <div className="empty-tile">
        <span className="glyph">
          <Terminal size={20} />
        </span>
        <div className="text-sm text-cns-primary" dir="rtl">{fa.feed.waiting}</div>
        <div className="text-[10px] opacity-60" dir="ltr">SYSTEM_STANDBY</div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full max-h-[560px] overflow-y-auto space-y-3 pr-1">
      {jobs.map((job) => {
        const StatusIcon = STATUS_ICONS[job.status];
        const compactUrl = job.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
        const displayUrl = compactUrl.length > 42 ? `${compactUrl.slice(0, 42)}...` : compactUrl;
        const showMeter = job.status === 'pending' || job.status === 'running' || job.status === 'success';

        return (
          <article
            key={job.id}
            className={cn(
              "signal-card",
              job.status === 'running' && "running",
              job.status === 'failed' && "failed",
              job.status === 'success' && "success"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-2 text-[10px] text-cns-deep">
                  <StatusIcon
                    size={14}
                    className={cn(
                      STATUS_COLORS[job.status],
                      job.status === 'running' && 'animate-spin'
                    )}
                  />
                  <span dir="rtl">{formatTime(job.createdAt)}</span>
                </div>
                <div
                  dir="ltr"
                  className="truncate text-left font-mono text-[11px] text-cns-highlight"
                >
                  {displayUrl}
                </div>
              </div>
              <span className={cn(
                "system-flag whitespace-nowrap",
                job.status === 'success' && 'border-cns-highlight text-cns-highlight',
                job.status === 'failed' && 'border-cns-warning text-cns-warning'
              )} dir="rtl">
                {fa.status[job.status]}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-cns-deep">
              <span className="system-flag" dir="ltr">{job.quality}</span>
              <span className="system-flag" dir="ltr">{job.format.toUpperCase()}</span>
            </div>

            {showMeter && (
              <div className={cn(
                "capacity-meter mt-3",
                (job.status === 'pending' || job.status === 'running') && "active",
                job.status === 'success' && "complete"
              )}>
                <div className="fill" />
              </div>
            )}

            <div
              ref={(node) => {
                logRefs.current[job.id] = node;
              }}
              className="log-surface mt-3"
            >
              {job.logs.map((log, i) => (
                <div
                  key={i}
                  className={cn(
                    "log-entry",
                    log.includes('ERROR') && 'error',
                    log.includes('موفق') && 'success'
                  )}
                >
                  {log}
                </div>
              ))}
              {job.status === 'running' && (
                <div className="log-entry cursor-blink text-cns-primary" dir="ltr">stream active</div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
