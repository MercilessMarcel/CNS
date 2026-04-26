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

export function SignalFeed({ jobs, onUpdate }: SignalFeedProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
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
            
            if (status !== job.status) {
              const logs = [...job.logs];
              if (status === 'running' && job.status === 'pending') {
                logs.push(`[${new Date().toLocaleTimeString('fa-IR')}] ${fa.feed.downloading}`);
              } else if (status === 'success') {
                logs.push(`[${new Date().toLocaleTimeString('fa-IR')}] ${fa.feed.complete}`);
              } else if (status === 'failed') {
                logs.push(`[${new Date().toLocaleTimeString('fa-IR')}] ${fa.feed.error}`);
              }

              onUpdate(job.id, { 
                status, 
                logs,
                progress: status === 'success' ? 100 : job.progress 
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
      <div className="h-full flex items-center justify-center text-cns-deep">
        <div className="text-center">
          <Terminal size={32} className="mx-auto mb-2 opacity-50" />
          <div className="text-xs">{fa.feed.waiting}</div>
          <div className="text-[10px] mt-1 opacity-50">SYSTEM_STANDBY</div>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-[400px] overflow-y-auto space-y-3 pr-1">
      {jobs.map((job) => {
        const StatusIcon = STATUS_ICONS[job.status];
        
        return (
          <div 
            key={job.id}
            className={cn(
              "border border-cns-deep p-3 text-xs",
              job.status === 'running' && "border-cns-primary animate-jitter"
            )}
          >
            {/* Job Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <StatusIcon 
                  size={14} 
                  className={cn(
                    STATUS_COLORS[job.status],
                    job.status === 'running' && 'animate-spin'
                  )} 
                />
                <span className="text-cns-primary truncate max-w-[150px]">
                  {job.url.replace(/^https?:\/\/(www\.)?/, '').substring(0, 30)}...
                </span>
              </div>
              <span className={cn(
                "system-flag text-[10px]",
                job.status === 'success' && 'border-cns-highlight text-cns-highlight',
                job.status === 'failed' && 'border-cns-warning text-cns-warning'
              )}>
                {fa.status[job.status]}
              </span>
            </div>

            {/* Job Params */}
            <div className="flex gap-2 mb-2 text-[10px] text-cns-deep">
              <span className="system-flag">{job.quality}</span>
              <span className="system-flag">{job.format}</span>
            </div>

            {/* Progress Bar */}
            {job.status !== 'success' && job.status !== 'failed' && (
              <div className="capacity-meter mb-2">
                <div 
                  className="fill"
                  style={{ width: `${job.progress}%` }}
                />
              </div>
            )}

            {/* Logs */}
            <div className="space-y-0.5 font-mono text-[10px] leading-relaxed bg-cns-dim/30 p-2 max-h-[80px] overflow-y-auto">
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
                <div className="log-entry cursor-blink">_</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
