import { useState, useEffect, useCallback } from 'react';
import { Terminal, Radio, Archive, Settings } from 'lucide-react';
import { fa } from './lib/i18n';
import { github, DownloadJob } from './lib/github';
import { cn } from './lib/utils';
import { InputNode } from './components/InputNode';
import { SignalFeed } from './components/SignalFeed';
import { ArchivePanel } from './components/ArchivePanel';
import { SettingsModal } from './components/SettingsModal';

const MATRIX_COLUMNS = [
  '101001011001',
  'CNS-STREAM',
  '010110100111',
  'WORKFLOW',
  '110010101001',
  'SIGNAL-FEED',
  '001011011010',
  'ARCHIVE-NODE',
  '010011100101',
  'DOWNLOAD',
  '100110101010',
  'GITHUB-ACT',
] as const;

function App() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [hasConfig, setHasConfig] = useState(false);
  const [activeTab, setActiveTab] = useState<'input' | 'feed' | 'archive'>('input');
  const [archiveRefreshKey, setArchiveRefreshKey] = useState(0);

  useEffect(() => {
    setHasConfig(!!github.getConfig());
  }, []);

  const handleJobSubmit = useCallback((job: DownloadJob) => {
    setJobs(prev => [job, ...prev]);
    setActiveTab('feed');
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
  const heroMetrics = [
    { label: 'LIVE', value: String(activeJobs) },
    { label: 'DONE', value: String(completedJobs) },
    { label: 'SYNC', value: hasConfig ? 'ONLINE' : 'OFFLINE' },
  ];

  return (
    <div className="min-h-screen bg-cns-bg p-4 text-cns-primary md:p-6">
      <div className="green-tint" />
      <div className="matrix-rain" aria-hidden="true">
        {MATRIX_COLUMNS.map((column, index) => (
          <span
            key={`${column}-${index}`}
            className="matrix-column"
            style={{
              right: `${4 + index * 8}%`,
              animationDelay: `${(index % 6) * -3.2}s`,
              animationDuration: `${16 + (index % 5) * 3}s`,
            }}
          >
            {column}
          </span>
        ))}
      </div>
      <div className="shell-grid" />
      <div className="shell-glow" />

      <div className="relative mx-auto max-w-7xl">
        <header className="flex items-center justify-between mb-6 p-4 border border-cns-primary/30 rounded-lg bg-cns-bg">
          <h1 className="text-lg font-mono text-cns-highlight" dir="rtl">{fa.app.title}</h1>
          <div className="flex items-center gap-2">
            {heroMetrics.map((metric) => (
              <div key={metric.label} className="console-tile" dir="ltr">
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
            <div
              onClick={() => setIsSettingsOpen(true)}
              className={cn(
                "console-tile cursor-pointer",
                !hasConfig && "border-cns-warning text-cns-warning"
              )}
              dir="ltr"
            >
              <Settings size={28} />
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <section
            className={cn(
              "panel-shell flex flex-col md:col-span-4",
              activeTab !== 'input' && 'hidden md:flex'
            )}
          >
            <div className="panel-head">
              <div>
                <div className="section-label">
                  <Terminal size={12} />
                </div>
                <p className="panel-subtitle" dir="rtl">
                  لینک را وارد کنید، کیفیت را مشخص کنید و فرمان دریافت را به workflow بفرستید.
                </p>
              </div>
              <span className="panel-index" dir="ltr">01</span>
            </div>
            <div className="panel-body p-4 md:p-5">
              <InputNode
                onSubmit={handleJobSubmit}
                disabled={!hasConfig}
              />
            </div>
          </section>

          <section
            className={cn(
              "panel-shell flex flex-col md:col-span-5 md:min-h-[620px]",
              activeTab !== 'feed' && 'hidden md:flex'
            )}
          >
            <div className="panel-head">
              <div>
                <div className="section-label">
                  <Radio size={12} className={activeJobs > 0 ? 'animate-pulse-signal' : ''} />
                  {activeJobs > 0 && (
                    <span className="signal-active mr-2 text-cns-highlight">
                      <span dir="ltr">{activeJobs.toLocaleString('fa-IR')} LIVE</span>
                    </span>
                  )}
                </div>
                <p className="panel-subtitle" dir="rtl">
                  {activeJobs > 0
                    ? `${activeJobs.toLocaleString('fa-IR')} عملیات در حال پیگیری است و لاگ‌ها به صورت خودکار تازه می‌شوند.`
                    : 'به محض ثبت اولین لینک، لاگ‌های اجرای workflow در این بخش ظاهر می‌شوند.'}
                </p>
              </div>
              <span className="panel-index" dir="ltr">02</span>
            </div>
            <div className="panel-body p-4 md:p-5">
              <SignalFeed
                jobs={jobs}
                onUpdate={handleJobUpdate}
              />
            </div>
          </section>

          <section
            className={cn(
              "panel-shell flex flex-col md:col-span-3 md:min-h-[620px]",
              activeTab !== 'archive' && 'hidden md:flex'
            )}
          >
            <div className="panel-head">
              <div>
                <div className="section-label">
                  <Archive size={12} />
                </div>
                <p className="panel-subtitle" dir="rtl">
                  خروجی‌های ذخیره‌شده، تصویر بندانگشتی و عملیات دانلود یا حذف در همین ستون.
                </p>
              </div>
              <span className="panel-index" dir="ltr">03</span>
            </div>
            <div className="panel-body p-4 md:p-5">
              <ArchivePanel refreshKey={archiveRefreshKey} />
            </div>
          </section>
        </div>

        <footer className="system-footer mt-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span dir="ltr">CNS v1.0.0</span>
              <span className="footer-divider" />
              <span dir="rtl">{fa.warnings.rateLimit}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn("status-pill", hasConfig ? "success" : "muted")} dir="rtl">
                {hasConfig ? 'اتصال آماده' : 'نیاز به تنظیمات'}
              </span>
              <span className="status-pill" dir="rtl">
                {completedJobs.toLocaleString('fa-IR')} دریافت موفق
              </span>
            </div>
          </div>
        </footer>
      </div>

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
