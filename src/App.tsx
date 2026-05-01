import { useCallback, useEffect, useRef, useState } from 'react';
import { Settings, AlertCircle } from 'lucide-react';
import { fa } from './lib/i18n';
import { github, DownloadJob } from './lib/github';
import { logger } from './lib/logger';
import { cn } from './lib/utils';
import { InputNode } from './components/InputNode';
import { SignalFeed } from './components/SignalFeed';
import { SettingsModal } from './components/SettingsModal';
import { MatrixRain } from './components/MatrixRain';
import { AsciiLogo } from './components/AsciiLogo';
import { useArchive } from './lib/useArchive';
import { toPersianErrorMessage } from './lib/errors';

const JOBS_STORAGE_KEY = 'cns_download_jobs';
const MAX_STORED_JOBS = 30;
const MAX_STORED_JOB_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function loadStoredJobs(): DownloadJob[] {
  try {
    const raw = localStorage.getItem(JOBS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter((job): job is DownloadJob => {
        if (!job || typeof job !== 'object') return false;
        if (typeof job.id !== 'string' || typeof job.url !== 'string') return false;
        if (!['pending', 'running', 'success', 'failed'].includes(job.status)) return false;
        const createdAt = new Date(job.createdAt).getTime();
        return Number.isFinite(createdAt) && now - createdAt <= MAX_STORED_JOB_AGE_MS;
      })
      .slice(0, MAX_STORED_JOBS);
  } catch {
    return [];
  }
}

function saveStoredJobs(jobs: DownloadJob[]) {
  try {
    localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs.slice(0, MAX_STORED_JOBS)));
  } catch {
  }
}

function summarizeJobsForSupport(jobs: DownloadJob[]) {
  return jobs.slice(0, 25).map((j) => ({
    id: j.id,
    status: j.status,
    format: j.format,
    quality: j.quality,
    url: j.url,
    githubRunId: j.githubRunId ?? null,
    githubLiveStep: j.githubLiveStep ?? null,
    createdAt: j.createdAt,
    lastUserLog: j.logs.length ? j.logs[j.logs.length - 1].slice(0, 800) : null,
  }));
}

function App() {
  const [jobs, setJobs] = useState<DownloadJob[]>(loadStoredJobs);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const jobsRef = useRef(jobs);
  const persistTimerRef = useRef<number | null>(null);
  jobsRef.current = jobs;

  const archive = useArchive({ enabled: hasConfig });

  useEffect(() => {
    logger.registerSupportContext(() => ({
      github: github.getSupportSnapshot(),
      recentJobs: summarizeJobsForSupport(jobsRef.current),
    }));
  }, []);

  useEffect(() => {
    logger.info('App startup: config initialization start');
    let cancelled = false;
    const run = async () => {
      try {
        await github.hydrateSecureConfig();
        const config = github.getConfig();
        const configAvailable = !!config;
        if (cancelled) return;
        setHasConfig(configAvailable);
        logger.info('App startup: config initialization complete', {
          hasConfig: configAvailable,
          repositoryFullName: config ? `${config.owner}/${config.repo}` : null,
        });
      } catch (err) {
        const msg = toPersianErrorMessage(err);
        logger.error('App startup: config check failed', { error: msg });
        if (cancelled) return;
        setInitError(msg);
        setHasConfig(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (persistTimerRef.current != null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      saveStoredJobs(jobs);
    }, 300);
    return () => {
      if (persistTimerRef.current != null) {
        window.clearTimeout(persistTimerRef.current);
        persistTimerRef.current = null;
      }
    };
  }, [jobs]);

  const handleJobSubmit = useCallback((newJobs: DownloadJob[]) => {
    if (jobsRef.current.some((j) => j.status === 'pending' || j.status === 'running')) {
      return;
    }
    setJobs((prev) => [...newJobs, ...prev]);
    window.dispatchEvent(new CustomEvent('cns-matrix-burst'));
  }, []);

  const handleJobUpdate = useCallback(
    (jobId: string, updates: Partial<DownloadJob>) => {
      setJobs((prev) => {
        const job = prev.find((j) => j.id === jobId);
        if (job && (job.status === 'failed' || job.status === 'success')) {
          return prev;
        }
        if (
          job &&
          updates.status === 'success' &&
          job.status !== 'success'
        ) {
          setTimeout(() => archive.refresh(), 1000);
        }
        return prev.map((j) => (j.id === jobId ? { ...j, ...updates } : j));
      });
    },
    [archive]
  );

  const handleJobRemove = useCallback((jobId: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== jobId));
  }, []);

  const downloadBusy = jobs.some(
    (j) => j.status === 'pending' || j.status === 'running'
  );

  return (
    <div className="min-h-screen bg-cns-bg p-4 text-cns-primary md:p-6 pb-16" dir="ltr">
      <div className="green-tint" />
      <MatrixRain />
      <div className="shell-grid" />
      <div className="shell-glow" />

      <aside className="cookie-warning" dir="rtl">
        <AlertCircle size={15} />
        <div>
          <strong>یادآوری کوکی یوتیوب</strong>
          <p>
            یوتیوب هر چند ساعت کوکی‌ها را عوض می‌کند. اگر دانلود گیر کرد یا خطا داد،
            کوکی‌های جدید را از مرورگر بگیرید و دوباره در تنظیمات وارد کنید.
          </p>
        </div>
      </aside>

      <div className="relative z-10 mx-auto max-w-3xl">
        <header className="reclip-header">
          <AsciiLogo />
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className={cn('settings-cog', !hasConfig && 'warn')}
            aria-label={fa.actions.settings}
            title={fa.actions.settings}
          >
            <Settings size={16} />
            <span>تنظیمات</span>
          </button>
        </header>

        {initError && (
          <div className="mb-4 p-3 border border-cns-warning/50 bg-cns-warning/10 rounded-sm">
            <div className="flex items-center gap-2 text-cns-warning text-sm" dir="auto">
              <AlertCircle size={14} />
              <span>خطای راه‌اندازی: {initError}</span>
            </div>
          </div>
        )}

        {!hasConfig && !initError && (
          <div className="config-banner" dir="ltr">
            <AlertCircle size={14} />
            <span>توکن گیت‌هاب و کوکی‌های یوتیوب را در تنظیمات وارد کنید</span>
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="config-banner-btn"
            >
              <Settings size={12} />
              <span>{fa.actions.settings}</span>
            </button>
          </div>
        )}

        <InputNode onSubmit={handleJobSubmit} disabled={!hasConfig} downloadBusy={downloadBusy} />

        <SignalFeed
          jobs={jobs}
          onUpdate={handleJobUpdate}
          onRemoveJob={handleJobRemove}
          archive={archive}
        />
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false);
          setHasConfig(!!github.getConfig());
        }}
        onConfigChanged={() => setHasConfig(!!github.getConfig())}
      />
    </div>
  );
}

export default App;
