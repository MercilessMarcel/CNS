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
  { value: 'audio', label: fa.quality.audio },
  { value: 'best', label: fa.quality.best },
  { value: '1080p', label: fa.quality['1080p'] },
  { value: '720p', label: fa.quality['720p'] },
  { value: '480p', label: fa.quality['480p'] },
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
    <div className="space-y-5">
      <div className={cn("summary-strip", disabled ? "muted" : "success")}>
        <div className="space-y-1">
          <div className="text-xs text-cns-primary" dir="rtl">
            {disabled ? 'ارتباط گیت‌هاب هنوز کامل نشده است.' : 'سامانه آماده ارسال فرمان دریافت است.'}
          </div>
          <div className="helper-copy" dir="rtl">
            {disabled
              ? 'ابتدا از بخش تنظیمات، راه‌اندازی خودکار و سپس کوکی‌های یوتیوب را ثبت کنید.'
              : 'پس از ثبت لینک، dispatch workflow بلافاصله به مخزن شما ارسال می‌شود.'}
          </div>
        </div>
      </div>

      <div className="hud-block">
        <div className="flex items-center justify-between gap-3">
          <div className="field-label" dir="rtl">نشانی منبع</div>
          <div className="micro-label" dir="ltr">YouTube / Playlist / Channel</div>
        </div>
        <label className="terminal-field mt-3">
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
        <div className="helper-copy mt-3" dir="rtl">{fa.input.hint}</div>
      </div>

      <div className="hud-block">
        <div className="field-label" dir="rtl">{fa.quality.label}</div>
        <div className="option-grid mt-3">
          {QUALITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setQuality(opt.value)}
              disabled={disabled || isLoading}
              className={cn(
                "option-chip",
                quality === opt.value && "active",
                (disabled || isLoading) && "cursor-not-allowed opacity-50"
              )}
            >
              <span className="min-w-0 flex-1 text-left" dir="ltr">{opt.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="hud-block">
        <div className="field-label" dir="rtl">{fa.format.label}</div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {FORMAT_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value)}
                disabled={disabled || isLoading}
                className={cn(
                  "format-tile",
                  format === opt.value && "active",
                  (disabled || isLoading) && "cursor-not-allowed opacity-50"
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
        <div className="summary-strip warning text-xs text-cns-warning">
          <span dir="ltr">[ERROR]</span> <span dir="ltr">{error}</span>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={disabled || isLoading}
        className={cn(
          "system-btn submit-btn w-full justify-center",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <Play size={14} className="ml-2" />
        <span dir="rtl">{isLoading ? fa.actions.processing : fa.actions.download}</span>
      </button>
    </div>
  );
}
