import { useState, useEffect, useCallback } from 'react';
import {
  Terminal,
  Radio,
  Archive,
  Settings,
  AlertCircle,
} from 'lucide-react';
import { fa } from './lib/i18n';
import { github, DownloadJob } from './lib/github';
import { logger } from './lib/logger';
import { cn } from './lib/utils';
import { InputNode } from './components/InputNode';
import { SignalFeed } from './components/SignalFeed';
import { ArchivePanel } from './components/ArchivePanel';
import { SettingsModal } from './components/SettingsModal';
import { MatrixRain } from './components/MatrixRain';
import { AsciiLogo } from './components/AsciiLogo';

function WindowControls() {
  return (
    <span className="window-controls" aria-hidden="true">
      <span className="window-dot" data-glyph="_" />
      <span className="window-dot" data-glyph="□" />
      <span className="window-dot close" data-glyph="×" />
    </span>
  );
}

function App() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'feed' | 'archive'>('input');
  const [archiveRefreshKey, setArchiveRefreshKey] = useState(0);
  const [initError, setInitError] = useState<string | null>(null);

  useEffect(() => {
    logger.info('App startup: config initialization start');
    try {
      const config = github.getConfig();
      const configAvailable = !!config;
      setHasConfig(configAvailable);
      logger.info('App startup: config initialization complete', { hasConfig: configAvailable });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      logger.error('App startup: config check failed', { error: msg });
      setInitError(msg);
      setHasConfig(false);
    }
  }, []);

  const handleJobSubmit = useCallback((job: DownloadJob) => {
    setJobs(prev => [job, ...prev]);
    setActiveTab('feed');
    window.dispatchEvent(new CustomEvent('cns-matrix-burst'));
  }, []);

  const handleJobUpdate = useCallback((jobId: string, updates: Partial<DownloadJob>) => {
    setJobs(prev => {
      const job = prev.find(j => j.id === jobId);
      if (job && updates.status === 'success' && job.status !== 'success') {
        setTimeout(() => setArchiveRefreshKey(k => k + 1), 1000);
      }

      return prev.map(j => j.id === jobId ? { ...j, ...updates } : j);
    });
  }, []);

  const activeJobs = jobs.filter(job => job.status === 'pending' || job.status === 'running').length;
  const completedJobs = jobs.filter(job => job.status === 'success').length;
  const syncLabel = initError ? 'ERROR' : hasConfig ? 'ONLINE' : 'OFFLINE';
  const syncWarn = !!initError || !hasConfig;

  const tabs: Array<{ id: typeof activeTab; label: string; icon: typeof Terminal }> = [
    { id: 'input', label: 'INPUT', icon: Terminal },
    { id: 'feed', label: 'FEED', icon: Radio },
    { id: 'archive', label: 'ARCHIVE', icon: Archive },
  ];

  return (
    <div className="min-h-screen bg-cns-bg p-4 text-cns-primary md:p-6 pb-20">
      <div className="green-tint" />
      <MatrixRain />
      <div className="shell-grid" />
      <div className="shell-glow" />

      <div className="relative z-10 mx-auto max-w-7xl">
        {initError && (
          <div className="mb-4 p-3 border border-cns-warning/50 bg-cns-warning/10 rounded-sm">
            <div className="flex items-center gap-2 text-cns-warning text-sm" dir="rtl">
              <AlertCircle size={14} />
              <span>خطای راه‌اندازی: {initError}</span>
            </div>
          </div>
        )}

        <section className="hero-mark">
          <AsciiLogo />
          <div className="hero-metrics">
            <span className="hero-metric">
              LIVE <strong>{activeJobs.toString().padStart(2, '0')}</strong>
            </span>
            <span className="hero-metric">
              DONE <strong>{completedJobs.toString().padStart(2, '0')}</strong>
            </span>
            <span className={cn('hero-metric', syncWarn && 'warn')}>
              SYNC <strong>{syncLabel}</strong>
            </span>
          </div>
        </section>

        <nav className="mb-4 grid grid-cols-3 gap-2 md:hidden" aria-label="panels">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={cn('nav-tab', activeTab === t.id && 'active')}
              >
                <Icon size={12} />
                <span dir="ltr">{t.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <section
            className={cn(
              'window md:col-span-4',
              activeTab !== 'input' && 'hidden md:flex'
            )}
          >
            <header className="window-titlebar">
              <span className="window-name">
                <Terminal size={12} />
                INPUT.EXE
              </span>
              <WindowControls />
            </header>
            <div className="window-body">
              <InputNode
                onSubmit={handleJobSubmit}
                disabled={!hasConfig}
              />
            </div>
          </section>

          <section
            className={cn(
              'window md:col-span-5 md:min-h-[620px]',
              activeTab !== 'feed' && 'hidden md:flex'
            )}
          >
            <header className="window-titlebar">
              <span className="window-name">
                <Radio
                  size={12}
                  className={activeJobs > 0 ? 'animate-pulse-signal' : ''}
                />
                FEED.EXE
                {activeJobs > 0 && (
                  <span className="ms-2 text-cns-highlight" dir="ltr">
                    [{activeJobs.toLocaleString('en-US')}]
                  </span>
                )}
              </span>
              <WindowControls />
            </header>
            <div className="window-body">
              <SignalFeed
                jobs={jobs}
                onUpdate={handleJobUpdate}
              />
            </div>
          </section>

          <section
            className={cn(
              'window md:col-span-3 md:min-h-[620px]',
              activeTab !== 'archive' && 'hidden md:flex'
            )}
          >
            <header className="window-titlebar">
              <span className="window-name">
                <Archive size={12} />
                ARCHIVE.EXE
              </span>
              <WindowControls />
            </header>
            <div className="window-body">
              <ArchivePanel refreshKey={archiveRefreshKey} />
            </div>
          </section>
        </div>

        <footer className="status-bar" dir="ltr">
          <span className="left">
            <span>&gt; SYSTEM STATUS:</span>
            <strong>{syncLabel}</strong>
            <span className="sep">//</span>
            <span>GITHUB LINK:</span>
            <strong>{hasConfig ? 'STABLE' : 'IDLE'}</strong>
          </span>
          <span className="right caret">
            <span>JOBS</span>
            <strong>{completedJobs.toString().padStart(2, '0')}/{(jobs.length).toString().padStart(2, '0')}</strong>
          </span>
        </footer>
      </div>

      <aside className="utility-dock" aria-label="utilities">
        <button
          type="button"
          onClick={() => setIsSettingsOpen(true)}
          className={cn('utility-btn', !hasConfig && 'warn')}
          aria-label="settings"
          title={fa.actions.settings}
        >
          <Settings size={14} />
        </button>
        <span className="utility-version">v1.1.1</span>
      </aside>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => {
          setIsSettingsOpen(false);
          setHasConfig(!!github.getConfig());
        }}
      />
    </div>
  );
}

export default App;
