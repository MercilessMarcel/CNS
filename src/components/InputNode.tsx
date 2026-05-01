import { useMemo, useState, type KeyboardEvent } from 'react';
import { ClipboardPaste, Download } from 'lucide-react';
import { DownloadJob, github } from '../lib/github';
import { cn } from '../lib/utils';
import { toPersianErrorMessage } from '../lib/errors';
import { logger } from '../lib/logger';
import { fa } from '../lib/i18n';

interface InputNodeProps {
  onSubmit: (jobs: DownloadJob[]) => void;
  disabled?: boolean;
}

const FORMATS = [
  { value: 'mp4', label: 'MP4' },
  { value: 'mp3', label: 'MP3' },
] as const;

const QUALITIES = [
  { value: 'best', label: 'BEST' },
  { value: '1080p', label: '1080P' },
  { value: '720p', label: '720P' },
  { value: '480p', label: '480P' },
] as const;

function parseSingleUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t || /[\r\n]/.test(t)) return null;
  try {
    const u = new URL(t);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

async function fetchOembed(url: string): Promise<DownloadJob['meta']> {
  try {
    const resp = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    if (!resp.ok) return undefined;
    const data = await resp.json();
    if (data?.error) return undefined;
    return {
      title: data.title,
      channel: data.author_name,
      thumbnail: data.thumbnail_url,
    };
  } catch {
    return undefined;
  }
}

export function InputNode({ onSubmit, disabled }: InputNodeProps) {
  const [text, setText] = useState('');
  const [quality, setQuality] = useState<string>('best');
  const [format, setFormat] = useState<string>('mp4');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const url = useMemo(() => parseSingleUrl(text), [text]);
  const isMp3 = format === 'mp3';

  const handleSubmit = async () => {
    if (!url) {
      setError('یک لینک https معتبر وارد کنید (بدون چند لینک یا خط جدید)');
      return;
    }

    const config = github.getConfig();
    if (!config) {
      setError('توکن گیت‌هاب تنظیم نشده است');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      logger.info('[Download] Submit started', {
        format,
        quality,
      });
      const cookies = github.getCookies();
      if (cookies) {
        await github.uploadCookies(cookies);
      }

      const effectiveQuality = isMp3 ? 'audio' : quality;
      const effectiveFormat = isMp3 ? 'mp3' : 'mp4';

      const meta = await fetchOembed(url);

      try {
        await github.triggerWorkflow(url, effectiveQuality, effectiveFormat);
        logger.info('[Download] Workflow dispatched', {
          format: effectiveFormat,
          quality: effectiveQuality,
        });
        const job: DownloadJob = {
          id: crypto.randomUUID(),
          url,
          quality: effectiveQuality,
          format: effectiveFormat,
          status: 'pending',
          progress: 0,
          logs: [`[${new Date().toLocaleTimeString('fa-IR')}] صف شد`],
          createdAt: new Date().toISOString(),
          meta,
        };
        onSubmit([job]);
        setText('');
        logger.info('[Download] Submit finished', {
          format: effectiveFormat,
          quality: isMp3 ? 'audio' : quality,
        });
      } catch (err) {
        logger.error('[Download] Dispatch failed', {
          error: err,
          format: effectiveFormat,
          quality: effectiveQuality,
        });
        const message = toPersianErrorMessage(err);
        const failedJob: DownloadJob = {
          id: crypto.randomUUID(),
          url,
          quality: effectiveQuality,
          format: effectiveFormat,
          status: 'failed',
          progress: 0,
          logs: [`[${new Date().toLocaleTimeString('fa-IR')}] ${message}`],
          createdAt: new Date().toISOString(),
          meta,
        };
        onSubmit([failedJob]);
        setError(`${message}`);
      }
    } catch (err) {
      logger.error('[Download] Submit aborted', { error: err });
      setError(toPersianErrorMessage(err));
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

  const handlePasteFromClipboard = async () => {
    if (disabled || isLoading) return;
    try {
      const clip = await navigator.clipboard.readText();
      setText(clip.trim());
      setError(null);
    } catch {
      setError(fa.input.pasteFailed);
    }
  };

  return (
    <div className="fetch-shell">
      <div className="fetch-textarea-wrap">
        <div className="fetch-url-row">
          <input
            type="text"
            dir="ltr"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={fa.input.placeholder}
            disabled={disabled || isLoading}
            className="fetch-url-input"
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            aria-label={fa.input.label}
          />
          <button
            type="button"
            className="fetch-paste-btn"
            onClick={() => void handlePasteFromClipboard()}
            disabled={disabled || isLoading}
            aria-label={fa.input.paste}
            title={fa.input.paste}
          >
            <ClipboardPaste size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="fetch-hint" dir="rtl">
          {fa.input.hint}
        </div>
      </div>

      <div className="fetch-bar">
        <div className="format-pill" role="tablist" aria-label="format">
          {FORMATS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFormat(opt.value)}
              disabled={disabled || isLoading}
              className={cn('format-pill-btn', format === opt.value && 'active')}
              aria-pressed={format === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={disabled || isLoading || !url}
          className="fetch-button"
        >
          <Download size={16} />
          <span>{isLoading ? '...در حال دریافت' : 'دریافت'}</span>
        </button>

        <div
          className={cn('quality-rail', isMp3 && 'disabled')}
          role="tablist"
          aria-label="quality"
        >
          <span className="quality-label">کیفیت</span>
          {QUALITIES.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setQuality(opt.value)}
              disabled={disabled || isLoading || isMp3}
              className={cn(
                'quality-rail-btn',
                quality === opt.value && !isMp3 && 'active'
              )}
              aria-pressed={quality === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="fetch-error" dir="ltr">
          <span>خطا:</span> {error}
        </div>
      )}
    </div>
  );
}
