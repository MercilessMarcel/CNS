import { useState } from 'react';
import { Play, Music, Video, Check } from 'lucide-react';
import { fa } from '../lib/i18n';
import { DownloadJob, github } from '../lib/github';
import { cn } from '../lib/utils';

interface InputNodeProps {
  onSubmit: (job: DownloadJob) => void;
  disabled?: boolean;
}

const QUALITY_OPTIONS = [
  { value: 'best', label: fa.quality.best },
  { value: '1080p', label: fa.quality['1080p'] },
  { value: '720p', label: fa.quality['720p'] },
  { value: '480p', label: fa.quality['480p'] },
  { value: 'audio', label: fa.quality.audio },
];

const FORMAT_OPTIONS = [
  { value: 'mp4', label: fa.format.mp4, icon: Video },
  { value: 'webm', label: fa.format.webm, icon: Video },
  { value: 'mp3', label: fa.format.mp3, icon: Music },
];

export function InputNode({ onSubmit, disabled }: InputNodeProps) {
  const [url, setUrl] = useState('');
  const [quality, setQuality] = useState('best');
  const [format, setFormat] = useState('mp4');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!url.trim()) {
      setError(fa.errors.invalidUrl);
      return;
    }

    const config = github.getConfig();
    if (!config) {
      setError(fa.errors.noToken);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Upload cookies if available
      const cookies = github.getCookies();
      if (cookies) {
        await github.uploadCookies(cookies);
      }
      
      await github.triggerWorkflow(url, quality, format);

      const job: DownloadJob = {
        id: crypto.randomUUID(),
        url: url.trim(),
        quality,
        format,
        status: 'pending',
        progress: 0,
        logs: [`[${new Date().toLocaleTimeString('fa-IR')}] ${fa.feed.connecting}`],
        createdAt: new Date().toISOString(),
      };

      onSubmit(job);
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : fa.errors.network);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-cns-deep">
          <span className="text-cns-primary">{'>'}</span>
          <span>URL_TARGET</span>
        </div>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={fa.input.placeholder}
          disabled={disabled || isLoading}
          className="terminal-input cursor-blink"
        />
        <div className="text-[10px] text-cns-deep">
          {fa.input.hint}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-cns-deep uppercase tracking-wider">
          {fa.quality.label}
        </div>
        <div className="flex flex-wrap gap-2">
          {QUALITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setQuality(opt.value)}
              disabled={disabled || isLoading}
              className={cn(
                "system-flag glitch-text",
                quality === opt.value && "active",
                disabled && "opacity-50 cursor-not-allowed"
              )}
              data-text={opt.label}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="text-xs text-cns-deep uppercase tracking-wider">
          {fa.format.label}
        </div>
        <div className="flex gap-2">
          {FORMAT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                disabled={disabled || isLoading}
                className={cn(
                  "system-btn flex-1 text-xs py-2 flex items-center justify-center gap-1",
                  format === opt.value && "bg-cns-dim border-cns-primary",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <Icon size={12} />
                {opt.label}
                {format === opt.value && (
                  <Check size={10} className="mr-1 text-cns-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="border border-cns-warning bg-cns-warning/5 p-2 text-xs text-cns-warning">
          [ERROR] {error}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={disabled || isLoading}
        className={cn(
          "system-btn w-full py-3 mt-4 glitch-text",
          isLoading && "animate-flicker",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        data-text={isLoading ? fa.actions.processing : fa.actions.download}
      >
        <Play size={14} className="inline ml-2" />
        {isLoading ? fa.actions.processing : fa.actions.download}
      </button>
    </div>
  );
}
