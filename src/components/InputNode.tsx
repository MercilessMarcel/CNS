import { useState, type KeyboardEvent } from 'react';
import { Play, Music, Video } from 'lucide-react';
import { fa } from '../lib/i18n';
import { DownloadJob, github } from '../lib/github';
import { cn } from '../lib/utils';

interface InputNodeProps {
  onSubmit: (job: DownloadJob) => void;
  disabled?: boolean;
}

const QUALITY_OPTIONS = [
  { value: 'best', label: fa.quality.best, badge: 'BEST' },
  { value: '1080p', label: fa.quality['1080p'], badge: '1080P' },
  { value: '720p', label: fa.quality['720p'], badge: '720P' },
  { value: '480p', label: fa.quality['480p'], badge: '480P' },
  { value: 'audio', label: fa.quality.audio, badge: 'AUDIO' },
];

const FORMAT_OPTIONS = [
  { value: 'mp3', label: fa.format.mp3, icon: Music },
  { value: 'mp4', label: fa.format.mp4, icon: Video },
  { value: 'webm', label: fa.format.webm, icon: Video },
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
      if (err instanceof Error) {
        const message = err.message;
        if (message.includes('cookies.txt')) {
          setError('کوکی‌های یوتیوب یافت نشد. ابتدا در تنظیمات کوکی‌ها را آپلود کنید.');
        } else if (message.includes('Invalid GitHub token')) {
          setError('توکن گیت‌هاب نامعتبر است. توکن را بررسی کنید.');
        } else if (message.includes('Workflow not found')) {
          setError('Workflow یافت نشد. راه‌اندازی خودکار را اجرا کنید.');
        } else if (message.includes('Rate limited')) {
          setError('محدودیت نرخ درخواست. چند دقیقه صبر کنید.');
        } else if (message.includes('Invalid URL')) {
          setError('آدرس ویدیو نامعتبر است.');
        } else {
          setError(message);
        }
      } else {
        setError(fa.errors.network);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div className="space-y-4">
      {disabled && (
        <div className="summary-strip warning text-xs" dir="rtl">
          ابتدا از بخش تنظیمات، توکن گیت‌هاب و کوکی‌های یوتیوب را ثبت کنید.
        </div>
      )}

      <div>
        <div className="flex items-center justify-between gap-3">
          <div className="field-label" dir="rtl">نشانی منبع</div>
          <div className="micro-label" dir="ltr">YouTube · Playlist · Channel</div>
        </div>
        <label className="terminal-field mt-2">
          <span className="terminal-prefix">TARGET</span>
          <input
            type="text"
            dir="ltr"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={fa.input.placeholder}
            disabled={disabled || isLoading}
            className="terminal-input text-left"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      </div>

      <div>
        <div className="field-label" dir="rtl">{fa.quality.label}</div>
        <div className="option-grid mt-2">
          {QUALITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setQuality(opt.value)}
              disabled={disabled || isLoading}
              className={cn(
                'option-chip',
                quality === opt.value && 'active',
                (disabled || isLoading) && 'cursor-not-allowed opacity-50'
              )}
              dir="rtl"
            >
              <span className="label">{opt.label}</span>
              <span className="badge" dir="ltr">{opt.badge}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="field-label" dir="rtl">{fa.format.label}</div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {FORMAT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                disabled={disabled || isLoading}
                className={cn(
                  'format-tile',
                  format === opt.value && 'active',
                  (disabled || isLoading) && 'cursor-not-allowed opacity-50'
                )}
              >
                <Icon size={15} />
                <span dir="ltr">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="summary-strip warning text-xs text-cns-warning" dir="ltr">
          <span>[ERROR]</span> <span>{error}</span>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={disabled || isLoading}
        className={cn(
          'system-btn submit-btn w-full justify-center',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <Play size={14} />
        <span dir="rtl">{isLoading ? fa.actions.processing : fa.actions.download}</span>
      </button>
    </div>
  );
}
