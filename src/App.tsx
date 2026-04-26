import { useState, useEffect, useCallback } from 'react';
import { Terminal, Radio, Archive, Settings, AlertTriangle } from 'lucide-react';
import { fa } from './lib/i18n';
import { github, DownloadJob } from './lib/github';
import { cn } from './lib/utils';
import { InputNode } from './components/InputNode';
import { SignalFeed } from './components/SignalFeed';
import { ArchivePanel } from './components/ArchivePanel';
import { SettingsModal } from './components/SettingsModal';

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
      // Refresh archive when job completes successfully
      if (job && updates.status === 'success' && job.status !== 'success') {
        setTimeout(() => setArchiveRefreshKey(k => k + 1), 1000);
      }
      return prev.map(j => j.id === jobId ? { ...j, ...updates } : j);
    });
  }, []);

  
  return (
    <div className="min-h-screen bg-cns-bg p-4 md:p-6">
      <div className="green-tint" />
      
      {/* Header */}
      <header className="cns-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="glitch-text rgb-shift" data-text={fa.app.title}>
              {fa.app.title}
            </h1>
            <div className="subtitle mt-1">{fa.app.subtitle}</div>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            className={cn(
              "system-btn corner-accent",
              !hasConfig && "animate-flicker border-cns-warning text-cns-warning"
            )}
          >
            <Settings size={14} className="inline ml-2" />
            {fa.actions.settings}
          </button>
        </div>
      </header>

      {/* Warning Banner */}
      <div className="alert-box mb-6 corner-accent">
        <div className="flex items-start gap-3">
          <AlertTriangle size={16} className="text-cns-warning flex-shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">
            <div className="text-cns-warning mb-1">[WARNING]</div>
            {fa.warnings.tos}
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="md:hidden flex gap-2 mb-4">
        {[
          { id: 'input', label: fa.input.label, icon: Terminal },
          { id: 'feed', label: fa.feed.label, icon: Radio },
          { id: 'archive', label: fa.archive.label, icon: Archive },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id as typeof activeTab)}
            className={cn(
              "system-btn flex-1 text-xs py-3",
              activeTab === id && "bg-cns-dim border-cns-primary"
            )}
          >
            <Icon size={14} className="inline ml-1" />
            {label}
          </button>
        ))}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Input Node */}
        <div className={cn(
          "md:col-span-4",
          activeTab !== 'input' && 'hidden md:block'
        )}>
          <div className="section-label">
            <Terminal size={12} />
            {fa.input.label}
          </div>
          <div className="cns-panel corner-accent p-4">
            <InputNode 
              onSubmit={handleJobSubmit}
              disabled={!hasConfig}
            />
          </div>
        </div>

        {/* Signal Feed */}
        <div className={cn(
          "md:col-span-5",
          activeTab !== 'feed' && 'hidden md:block'
        )}>
          <div className="section-label">
            <Radio size={12} className={jobs.some(j => j.status === 'running') ? 'animate-pulse-signal' : ''} />
            {fa.feed.label}
            {jobs.some(j => j.status === 'running') && (
              <span className="signal-active text-cns-highlight mr-2">
                {jobs.filter(j => j.status === 'running').length} ACTIVE
              </span>
            )}
          </div>
          <div className="cns-panel corner-accent p-4 min-h-[400px]">
            <SignalFeed 
              jobs={jobs}
              onUpdate={handleJobUpdate}
            />
          </div>
        </div>

        {/* Archive */}
        <div className={cn(
          "md:col-span-3",
          activeTab !== 'archive' && 'hidden md:block'
        )}>
          <div className="section-label">
            <Archive size={12} />
            {fa.archive.label}
          </div>
          <div className="cns-panel corner-accent p-4 min-h-[400px]">
            <ArchivePanel refreshKey={archiveRefreshKey} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-8 pt-4 border-t border-cns-deep text-xs text-cns-deep">
        <div className="flex items-center justify-between">
          <div>
            CNS v1.0.0 // SYSTEM READY
          </div>
          <div className="flex items-center gap-4">
            <span>{fa.warnings.rateLimit}</span>
            <span className={hasConfig ? 'text-cns-primary' : 'text-cns-warning'}>
              {hasConfig ? 'CONN: ESTABLISHED' : 'CONN: NONE'}
            </span>
          </div>
        </div>
      </footer>

      {/* Settings Modal */}
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
