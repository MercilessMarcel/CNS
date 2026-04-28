import { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Zap, Bug, Copy, Trash2 } from 'lucide-react';
import { fa } from '../lib/i18n';
import { github } from '../lib/github';
import { cn } from '../lib/utils';
import { clearDebugEntries, formatDebugEntries, logDebug } from '../lib/debug';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [token, setToken] = useState('');
  const [cookies, setCookies] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isAutoSetup, setIsAutoSetup] = useState(false);
  const [setupStep, setSetupStep] = useState<string>('');
  const [debugText, setDebugText] = useState('');
  const hasSavedConfig = !!github.getConfig();

  useEffect(() => {
    if (isOpen) {
      const config = github.getConfig();
      if (config) {
        setToken(config.token);
      }
      setError(null);
      setNotice(null);
      setDebugText(formatDebugEntries());
    }
  }, [isOpen]);

  const handleSave = () => {
    if (!token) {
      setError('توکن گیت‌هاب الزامی است');
      return;
    }

    setIsSaving(true);
    const config = github.getConfig();
    if (config) {
      github.setConfig({ token, owner: config.owner, repo: config.repo });
      setNotice('توکن جدید ذخیره شد');
    } else {
      setError('ابتدا راه‌اندازی خودکار را اجرا کنید تا مخزن ساخته شود');
    }
    setIsSaving(false);
  };

  const handleClear = () => {
    github.clearConfig();
    setToken('');
    setNotice('تنظیمات پاک شد');
  };

  const handleSaveCookies = async () => {
    if (!cookies.trim()) return;

    localStorage.setItem('cns_cookies', cookies.trim());
    setNotice(null);

    const config = github.getConfig();
    if (config) {
      try {
        await github.uploadCookies(cookies.trim());
        setNotice('کوکی‌ها ذخیره و در مخزن آپلود شدند');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'خطا در آپلود کوکی‌ها';
        logDebug('ui', 'save cookies failed', { message });
        setError(message);
        setDebugText(formatDebugEntries());
        return;
      }
    } else {
      setNotice('کوکی‌ها فقط به‌صورت محلی ذخیره شدند. پس از ساخت مخزن دوباره آپلود کنید.');
    }

    setCookies('');
    setDebugText(formatDebugEntries());
  };

  const handleAutoSetup = async () => {
    if (!token) {
      setError('توکن گیت‌هاب الزامی است');
      return;
    }

    setIsAutoSetup(true);
    setError(null);
    setSetupStep(fa.settings.creatingRepo);

    try {
      await github.autoSetup(token, 'cns-downloads');
      setSetupStep(fa.settings.addingWorkflow);
      setNotice('مخزن و workflow ساخته شدند');
      setDebugText(formatDebugEntries());
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در راه‌اندازی خودکار');
      setDebugText(formatDebugEntries());
    } finally {
      setIsAutoSetup(false);
      setSetupStep('');
    }
  };

  const handleCopyDebug = async () => {
    const text = formatDebugEntries();
    setDebugText(text);
    await navigator.clipboard.writeText(text);
    setNotice('لاگ دیباگ کپی شد');
  };

  const handleClearDebug = () => {
    clearDebugEntries();
    setDebugText('');
    setNotice('لاگ دیباگ پاک شد');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div className="modal-shell modal-popup relative w-full max-w-3xl cns-panel corner-accent bg-cns-bg" dir="ltr">
        <div className="panel-head border-b border-cns-deep/70 px-5 py-4">
          <div>
            <div className="section-label">
              <span className="text-cns-primary">{'>'}</span>
              {fa.settings.label}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("status-pill", hasSavedConfig ? "success" : "warning")}>
              {hasSavedConfig ? 'پیکربندی ذخیره شده' : 'بدون مخزن'}
            </span>
            <button
              onClick={onClose}
              className="system-btn px-3"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        <div className="grid gap-4 p-4 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:p-5">
          <section className="space-y-4">
            <div className={cn("summary-strip", hasSavedConfig ? "success" : "warning")}>
              <div className="space-y-1">
                <div className="text-xs text-cns-primary" dir="rtl">
                  {hasSavedConfig
                    ? 'این مخزن قبلا آماده شده است. در این بخش می‌توانید فقط توکن را به‌روزرسانی کنید.'
                    : 'برای نخستین استفاده، راه‌اندازی خودکار را اجرا کنید تا مخزن و workflow ساخته شوند.'}
                </div>
                <div className="helper-copy" dir="rtl">
                  ذخیره توکن بدون مخزن فعال، عملا کاربردی ندارد و رابط را آماده دانلود نمی‌کند.
                </div>
              </div>
            </div>

            <div className="hud-block">
              <div className="field-label" dir="rtl">{fa.settings.token}</div>
              <div className="helper-copy mt-2" dir="rtl">
                GitHub Personal Access Token با دسترسی <code dir="ltr" className="inline-block">repo</code>
              </div>
              <label className="terminal-field mt-3">
                <span className="terminal-prefix">TOKEN</span>
                <input
                  type="password"
                  dir="ltr"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxx"
                  className="terminal-input text-left"
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
            </div>

            <div className="hud-block">
              <div className="flex items-center gap-2 text-xs text-cns-primary">
                <Zap size={14} />
                <span dir="rtl">{fa.settings.autoSetup}</span>
              </div>
              <div className="helper-copy mt-2" dir="rtl">{fa.settings.autoSetupDesc}</div>
              <button
                onClick={handleAutoSetup}
                disabled={isAutoSetup || !token}
                className={cn(
                  "system-btn mt-3 w-full justify-center border-cns-primary",
                  isAutoSetup && "animate-flicker"
                )}
              >
                {isAutoSetup ? setupStep : fa.settings.autoSetup}
              </button>
            </div>

            {error && (
              <div className="summary-strip warning flex items-center gap-2 text-xs text-cns-warning">
                <AlertCircle size={14} />
                <span dir="rtl">{error}</span>
              </div>
            )}

            {notice && !error && (
              <div className="summary-strip success flex items-center gap-2 text-xs text-cns-highlight">
                <span dir="rtl">{notice}</span>
              </div>
            )}

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                onClick={handleSave}
                disabled={isSaving || !token || !hasSavedConfig}
                className="system-btn w-full justify-center"
              >
                <Save size={12} />
                <span dir="rtl">{fa.settings.save}</span>
              </button>

              {hasSavedConfig && (
                <button
                  onClick={handleClear}
                  className="system-btn w-full justify-center border-cns-warning text-cns-warning hover:bg-cns-warning/10"
                >
                  <span dir="rtl">پاک کردن تنظیمات</span>
                </button>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="hud-block">
              <div className="flex items-center gap-2 text-xs text-cns-warning">
                <AlertCircle size={14} />
                <span dir="rtl">{fa.settings.cookies}</span>
              </div>
              <div className="helper-copy mt-2" dir="rtl">{fa.settings.cookiesDesc}</div>
              <div className="helper-copy" dir="rtl">{fa.settings.cookiesWhy}</div>

              <div className="mt-3 text-[10px] text-cns-warning" dir="rtl">
                {fa.settings.bookmarkletWarn}
              </div>

              <textarea
                dir="ltr"
                value={cookies}
                onChange={(e) => setCookies(e.target.value)}
                placeholder={fa.settings.pasteCookies}
                className="terminal-textarea mt-3 text-left"
                spellCheck={false}
              />

              <button
                onClick={handleSaveCookies}
                disabled={!cookies.trim()}
                className="system-btn mt-3 w-full justify-center"
              >
                <span dir="rtl">{fa.settings.cookiesSaved}</span>
              </button>

              <a
                href="https://chrome.google.com/webstore/detail/get-cookiestxt-locally"
                target="_blank"
                rel="noopener noreferrer"
                className="system-btn mt-4 w-full justify-center border-cns-highlight text-cns-highlight no-underline py-4 text-sm"
              >
                {fa.settings.extensionLink}
              </a>
            </div>

            <div className="hud-block">
              <div className="flex items-center gap-2 text-xs text-cns-primary">
                <Bug size={14} />
                <span dir="rtl">دیباگ ارتباط گیت‌هاب</span>
              </div>
              <div className="helper-copy mt-2" dir="rtl">
                اگر ساخت مخزن، آپلود کوکی یا شروع دانلود شکست خورد، این لاگ را کپی کنید.
              </div>

              <textarea
                dir="ltr"
                value={debugText}
                readOnly
                className="terminal-textarea mt-3 text-left"
                placeholder="No debug logs yet."
                spellCheck={false}
              />

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={handleCopyDebug} className="system-btn w-full justify-center">
                  <Copy size={12} />
                  <span dir="rtl">کپی لاگ</span>
                </button>
                <button onClick={handleClearDebug} className="system-btn w-full justify-center border-cns-warning text-cns-warning hover:bg-cns-warning/10">
                  <Trash2 size={12} />
                  <span dir="rtl">پاک کردن لاگ</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
