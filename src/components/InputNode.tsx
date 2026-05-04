import { useMemo, useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { ClipboardPaste, Download, SlidersHorizontal } from 'lucide-react';
import {
  DownloadJob,
  github,
  DEFAULT_DOWNLOAD_ADVANCED,
  type DownloadAdvancedOptions,
} from '../lib/github';
import { cn } from '../lib/utils';
import { toPersianErrorMessage } from '../lib/errors';
import { logger } from '../lib/logger';
import { fa } from '../lib/i18n';

interface InputNodeProps {
  onAddPending: (job: DownloadJob) => void;
  onPatchJob: (jobId: string, updates: Partial<DownloadJob>) => void;
  hasActiveJob: boolean;
  disabled?: boolean;
  downloadBusy?: boolean;
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
const COOKIE_HASH_KEY = 'cns_cookie_hash_v1';
const ADVANCED_STORAGE_KEY = 'cns_advanced_download_v1';

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

async function sha1Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function normalizeAdvanced(raw: unknown): DownloadAdvancedOptions {
  const d = DEFAULT_DOWNLOAD_ADVANCED;
  if (!raw || typeof raw !== 'object') return { ...d };
  const o = raw as Record<string, unknown>;
  const cd = o.codec;
  const br = o.bitrate;
  const codec = cd === 'copy' || cd === 'h264' || cd === 'vp9' ? cd : d.codec;
  const bitrate =
    br === 'auto' || br === '1M' || br === '3M' || br === '5M' || br === '8M' ? br : d.bitrate;
  const embedMetadata =
    typeof o.embedMetadata === 'boolean' ? o.embedMetadata : d.embedMetadata;
  const embedThumbnail =
    typeof o.embedThumbnail === 'boolean' ? o.embedThumbnail : d.embedThumbnail;
  return { codec, bitrate, embedMetadata, embedThumbnail };
}

function loadAdvancedFromStorage(): DownloadAdvancedOptions {
  try {
    const raw = localStorage.getItem(ADVANCED_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_DOWNLOAD_ADVANCED };
    return normalizeAdvanced(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_DOWNLOAD_ADVANCED };
  }
}

function saveAdvancedToStorage(a: DownloadAdvancedOptions) {
  try {
    localStorage.setItem(ADVANCED_STORAGE_KEY, JSON.stringify(a));
  } catch {
  }
}

function advancedSubmitKey(a: DownloadAdvancedOptions): string {
  return `${a.codec}|${a.bitrate}|${a.embedMetadata ? 1 : 0}|${a.embedThumbnail ? 1 : 0}`;
}

export function InputNode({ onAddPending, onPatchJob, hasActiveJob, disabled, downloadBusy }: InputNodeProps) {
  const [text, setText] = useState('');
  const [quality, setQuality] = useState<string>('best');
  const [format, setFormat] = useState<string>('mp4');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRef = useState(() => new Set<string>())[0];
  const [advanced, setAdvanced] = useState<DownloadAdvancedOptions>(() => loadAdvancedFromStorage());
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const advancedWrapRef = useRef<HTMLDivElement | null>(null);

  const url = useMemo(() => parseSingleUrl(text), [text]);
  const isMp3 = format === 'mp3';

  useEffect(() => {
    saveAdvancedToStorage(advanced);
  }, [advanced]);

  useEffect(() => {
    if (!advancedOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = advancedWrapRef.current;
      if (!el || !(e.target instanceof Node) || el.contains(e.target)) return;
      setAdvancedOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [advancedOpen]);

  const dispatchAdvanced = useMemo((): DownloadAdvancedOptions => {
    if (isMp3) {
      return {
        ...advanced,
        codec: 'copy',
        bitrate: 'auto',
      };
    }
    return advanced;
  }, [advanced, isMp3]);

  const handleSubmit = async () => {
    if (downloadBusy || hasActiveJob) return;
    if (!url) {
      setError('یک لینک https معتبر وارد کنید (بدون چند لینک یا خط جدید)');
      return;
    }

    const config = github.getConfig();
    if (!config) {
      setError('توکن گیت‌هاب تنظیم نشده است');
      return;
    }

    const effectiveQuality = isMp3 ? 'audio' : quality;
    const effectiveFormat = isMp3 ? 'mp3' : 'mp4';
    const adv = dispatchAdvanced;
    const submitKey = `${url}|${effectiveQuality}|${effectiveFormat}|${advancedSubmitKey(adv)}`;
    if (inFlightRef.has(submitKey)) return;
    setIsLoading(true);
    setError(null);

    try {
      logger.info('[Download] Submit started', {
        format,
        quality,
        advanced: adv,
      });
      const cookieHealth = github.assessStoredCookies();
      if (!cookieHealth.ok) {
        throw new Error(cookieHealth.reason || 'COOKIE_EXPIRED_LOCAL');
      }
      const cookies = github.getCookies();
      if (cookies) {
        const cookieHash = await sha1Hex(cookies);
        const uploadedHash = sessionStorage.getItem(COOKIE_HASH_KEY);
        if (uploadedHash !== cookieHash) {
          await github.uploadCookies(cookies);
          sessionStorage.setItem(COOKIE_HASH_KEY, cookieHash);
        }
      }

      inFlightRef.add(submitKey);
      const nowIso = new Date().toISOString();
      const jobId = crypto.randomUUID();
      const baseJob: DownloadJob = {
        id: jobId,
        url,
        quality: effectiveQuality,
        format: effectiveFormat,
        advanced: { ...adv },
        status: 'pending',
        progress: 0,
        logs: [`[${new Date().toLocaleTimeString('fa-IR')}] صف شد`],
        createdAt: nowIso,
        submitKey,
      };
      onAddPending(baseJob);
      const metaTask = fetchOembed(url);

      try {
        const dispatch = await github.triggerWorkflowFast(url, effectiveQuality, effectiveFormat, adv);
        const fetchedMeta = await metaTask;
        const logs = [`[${new Date().toLocaleTimeString('fa-IR')}] صف شد`, `[${new Date().toLocaleTimeString('fa-IR')}] ارسال به گیت‌هاب انجام شد`];
        onPatchJob(jobId, {
          dispatchAt: dispatch.dispatchAt,
          runHint: dispatch.runHint,
          logs,
          meta: fetchedMeta,
        });
        logger.info('[Download] Workflow dispatched', {
          format: effectiveFormat,
          quality: effectiveQuality,
          advanced: adv,
        });
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
        const fetchedMeta = await metaTask.catch(() => undefined);
        onPatchJob(jobId, {
          status: 'failed',
          progress: 0,
          logs: [`[${new Date().toLocaleTimeString('fa-IR')}] صف شد`, `[${new Date().toLocaleTimeString('fa-IR')}] ${message}`],
          meta: fetchedMeta,
        });
        setError(`${message}`);
      } finally {
        inFlightRef.delete(submitKey);
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

  const formLocked = disabled || isLoading || downloadBusy;

  const handlePasteFromClipboard = async () => {
    if (formLocked) return;
    try {
      const clip = await navigator.clipboard.readText();
      setText(clip.trim());
      setError(null);
    } catch {
      setError(fa.input.pasteFailed);
    }
  };

  const videoAdvancedLocked = formLocked || isMp3;

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
            disabled={formLocked}
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
            disabled={formLocked}
            aria-label={fa.input.paste}
            title={fa.input.paste}
          >
            <ClipboardPaste size={18} strokeWidth={2} />
          </button>
        </div>
        <div className="fetch-hint" dir="rtl">
          {downloadBusy ? fa.input.waitActiveDownload : fa.input.hint}
        </div>
      </div>

      <div className="fetch-bar">
        <div className="format-pill" role="tablist" aria-label="format">
          {FORMATS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setFormat(opt.value)}
              disabled={formLocked}
              className={cn('format-pill-btn', format === opt.value && 'active')}
              aria-pressed={format === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="advanced-control-wrap" ref={advancedWrapRef}>
          <button
            type="button"
            className={cn('fetch-advanced-btn', advancedOpen && 'active')}
            onClick={() => setAdvancedOpen((o) => !o)}
            disabled={formLocked}
            aria-expanded={advancedOpen}
            aria-label={fa.input.advancedBtn}
            title={fa.input.advancedBtn}
          >
            <SlidersHorizontal size={18} strokeWidth={2} />
          </button>
          {advancedOpen && (
            <div className="advanced-popover" dir="rtl" role="dialog" aria-label={fa.input.advancedTitle}>
              <div className="advanced-popover-title">{fa.input.advancedTitle}</div>
              <div className="advanced-popover-row">
                <label htmlFor="cns-adv-codec">{fa.input.advancedCodec}</label>
                <select
                  id="cns-adv-codec"
                  value={advanced.codec}
                  onChange={(e) =>
                    setAdvanced((a) => ({
                      ...a,
                      codec: e.target.value as DownloadAdvancedOptions['codec'],
                    }))
                  }
                  disabled={videoAdvancedLocked}
                >
                  <option value="copy">{fa.input.advancedOptCopy}</option>
                  <option value="h264">{fa.input.advancedOptH264}</option>
                  <option value="vp9">{fa.input.advancedOptVp9}</option>
                </select>
              </div>
              <div className="advanced-popover-row">
                <label htmlFor="cns-adv-bitrate">{fa.input.advancedBitrate}</label>
                <select
                  id="cns-adv-bitrate"
                  value={advanced.bitrate}
                  onChange={(e) =>
                    setAdvanced((a) => ({
                      ...a,
                      bitrate: e.target.value as DownloadAdvancedOptions['bitrate'],
                    }))
                  }
                  disabled={videoAdvancedLocked || advanced.codec === 'copy'}
                >
                  <option value="auto">{fa.input.advancedOptAutoBr}</option>
                  <option value="1M">1M</option>
                  <option value="3M">3M</option>
                  <option value="5M">5M</option>
                  <option value="8M">8M</option>
                </select>
              </div>
              <div className="advanced-popover-row">
                <button
                  type="button"
                  className={cn('advanced-toggle', advanced.embedMetadata && 'on')}
                  onClick={() =>
                    setAdvanced((a) => ({ ...a, embedMetadata: !a.embedMetadata }))
                  }
                  disabled={formLocked}
                >
                  <span>{fa.input.advancedEmbedMeta}</span>
                  <span className="advanced-toggle-knob" aria-hidden />
                </button>
              </div>
              <div className="advanced-popover-row">
                <button
                  type="button"
                  className={cn('advanced-toggle', advanced.embedThumbnail && 'on')}
                  onClick={() =>
                    setAdvanced((a) => ({ ...a, embedThumbnail: !a.embedThumbnail }))
                  }
                  disabled={formLocked}
                >
                  <span>{fa.input.advancedEmbedThumb}</span>
                  <span className="advanced-toggle-knob" aria-hidden />
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          disabled={formLocked || !url}
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
              disabled={formLocked || isMp3}
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
        <div className="fetch-error" dir="auto">
          <span>خطا:</span> {error}
        </div>
      )}
    </div>
  );
}
