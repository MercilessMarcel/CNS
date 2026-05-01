import { useState, useEffect, useRef } from 'react';
import { Save, AlertCircle, Zap, Activity, Settings as SettingsIcon } from 'lucide-react';
import { fa } from '../lib/i18n';
import { github } from '../lib/github';
import { cn } from '../lib/utils';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { toPersianErrorMessage } from '../lib/errors';
import { useBodyScrollLock } from '../lib/useBodyScrollLock';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged?: () => void;
}

export function SettingsModal({ isOpen, onClose, onConfigChanged }: SettingsModalProps) {
  const [token, setToken] = useState('');
  const [repoName, setRepoName] = useState('cns-downloads');
  const [cookies, setCookies] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [setupSuccess, setSetupSuccess] = useState<string | null>(null);
  const [isAutoSetup, setIsAutoSetup] = useState(false);
  const [setupStep, setSetupStep] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'settings' | 'diagnostics'>('settings');
  const [mounted, setMounted] = useState(isOpen);
  const [closing, setClosing] = useState(false);
  const [cookiesUploadState, setCookiesUploadState] = useState<'idle' | 'busy' | 'ok'>('idle');
  const cookiesOkTimerRef = useRef<number | null>(null);
  const hasSavedConfig = !!github.getConfig();
  useBodyScrollLock(mounted);

  useEffect(() => {
    let closeTimer: number | null = null;
    if (isOpen) {
      setMounted(true);
      setClosing(false);
      const config = github.getConfig();
      if (config) {
        setToken(config.token);
        setRepoName(config.repo);
      }
      setError(null);
      setSetupSuccess(null);
      if (cookiesOkTimerRef.current != null) {
        window.clearTimeout(cookiesOkTimerRef.current);
        cookiesOkTimerRef.current = null;
      }
      setCookiesUploadState('idle');
    } else if (mounted) {
      setClosing(true);
      closeTimer = window.setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, 220);
    }
    return () => {
      if (closeTimer != null) window.clearTimeout(closeTimer);
      if (cookiesOkTimerRef.current != null) {
        window.clearTimeout(cookiesOkTimerRef.current);
        cookiesOkTimerRef.current = null;
      }
    };
  }, [isOpen, mounted]);

  const handleSave = async () => {
    if (!token) {
      setError('توکن گیت‌هاب الزامی است');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const nextRepo = repoName.trim() || 'cns-downloads';
      const config = github.getConfig();
      if (config) {
        const next = { token, owner: config.owner, repo: nextRepo };
        github.setConfig(next);
        await github.ensureWorkflow(token, next.owner, next.repo);
      } else {
        const attached = await github.connectExistingRepo(token, nextRepo);
        await github.ensureWorkflow(token, attached.owner, attached.repo);
      }
      onConfigChanged?.();
      onClose();
    } catch (err) {
      setError(toPersianErrorMessage(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = () => {
    github.clearConfig();
    setToken('');
    setRepoName('cns-downloads');
    onConfigChanged?.();
  };

  const canSaveCookies =
    !!cookies.trim() && (!!github.getConfig() || !!token.trim());

  const handleSaveCookies = async () => {
    const trimmed = cookies.trim();
    if (!trimmed) return;
    const cookieHealth = github.assessCookieText(trimmed);
    if (!cookieHealth.ok) {
      setCookiesUploadState('idle');
      setError(toPersianErrorMessage(cookieHealth.reason || 'COOKIE_EXPIRED_LOCAL'));
      return;
    }

    if (!github.getConfig() && !token.trim()) {
      setError('توکن گیت‌هاب الزامی است');
      return;
    }

    setError(null);
    setCookiesUploadState('busy');
    try {
      let config = github.getConfig();
      if (!config) {
        config = await github.connectExistingRepo(token.trim(), repoName.trim() || 'cns-downloads');
        await github.ensureWorkflow(token.trim(), config.owner, config.repo);
      }
      await github.uploadCookies(trimmed);
      try {
        localStorage.setItem('cns_cookies', trimmed);
      } catch {
      }
      onConfigChanged?.();
    } catch (err) {
      setCookiesUploadState('idle');
      setError(toPersianErrorMessage(err));
      return;
    }

    setCookies('');
    setCookiesUploadState('ok');
    if (cookiesOkTimerRef.current != null) window.clearTimeout(cookiesOkTimerRef.current);
    cookiesOkTimerRef.current = window.setTimeout(() => {
      cookiesOkTimerRef.current = null;
      setCookiesUploadState('idle');
    }, 2800);
  };

  const handleAutoSetup = async () => {
    if (!token) {
      setError('توکن گیت‌هاب الزامی است');
      return;
    }

    setIsAutoSetup(true);
    setError(null);
    setSetupSuccess(null);
    setSetupStep(fa.settings.creatingRepo);

    try {
      const result = await github.autoSetup(token, repoName.trim() || 'cns-downloads');
      setSetupSuccess(result.repoCreated ? fa.settings.setupDoneMessage : fa.settings.repoUpdatedMessage);
      onConfigChanged?.();
    } catch (err) {
      setError(toPersianErrorMessage(err));
    } finally {
      setIsAutoSetup(false);
      setSetupStep('');
    }
  };

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        className={cn('modal-backdrop absolute inset-0 bg-black/70 backdrop-blur-[2px]', closing && 'closing')}
        onClick={onClose}
      />

      <div
        className={cn(
          'settings-dialog modal-shell relative w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden',
          closing && 'closing'
        )}
        dir="ltr"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="settings-dialog-header">
          <div className="settings-dialog-header-main">
            <div className="settings-dialog-title">
              <SettingsIcon size={18} strokeWidth={2.2} />
              <span>تنظیمات دانلود</span>
            </div>
            <p className="settings-dialog-subtitle">
              برای دانلود، اول مخزن گیت‌هاب و کوکی‌های یوتیوب را تنظیم کنید.
            </p>
          </div>
          <button onClick={onClose} className="settings-close-btn" type="button">
            بستن
          </button>
        </header>

        <div className="settings-dialog-body">
          <div className="settings-top-row">
            <div className="settings-tabs">
              <button
                onClick={() => setActiveTab('settings')}
                className={cn('settings-tab', activeTab === 'settings' && 'active')}
                dir="ltr"
              >
                <SettingsIcon size={12} />
                <span>تنظیمات</span>
              </button>
              <button
                onClick={() => setActiveTab('diagnostics')}
                className={cn('settings-tab', activeTab === 'diagnostics' && 'active')}
              >
                <Activity size={12} />
                <span>عیب‌یابی</span>
              </button>
            </div>
            <span
              className={cn(
                'settings-config-status',
                hasSavedConfig ? 'settings-config-status--ok' : 'settings-config-status--warn'
              )}
              dir="ltr"
            >
              {hasSavedConfig ? 'پیکربندی ذخیره شده' : 'بدون مخزن'}
            </span>
          </div>

          <div className="settings-tab-panels">
            <div className={cn('settings-tab-panel', activeTab === 'settings' && 'active')} aria-hidden={activeTab !== 'settings'}>
              <div className="grid gap-3 md:grid-cols-2">
                <section className="settings-section">
              <div className="settings-section-head">
                <span className="settings-step">۱</span>
                <div>
                  <h3>اتصال به گیت‌هاب</h3>
                  <p>توکن را وارد کنید. مخزن پیش‌فرض برای فایل‌ها استفاده می‌شود.</p>
                </div>
              </div>
              <div className="settings-card space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="field-label text-xs" dir="ltr">{fa.settings.token}</span>
                    <span className="micro-label !text-[10px]" dir="ltr">GitHub token</span>
                  </div>
                  <label className="terminal-field mt-2 !py-2">
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
                <div>
                  <span className="field-label text-xs" dir="ltr">نام مخزن</span>
                  <label className="terminal-field mt-2 !py-2">
                    <span className="terminal-prefix">REPO</span>
                    <input
                      type="text"
                      dir="ltr"
                      value={repoName}
                      onChange={(e) => setRepoName(e.target.value)}
                      placeholder="cns-downloads"
                      className="terminal-input text-left"
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                </div>
              </div>

              <div className="settings-card">
                <div className="flex items-center gap-2 text-xs text-cns-primary">
                  <Zap size={13} />
                  <span dir="ltr">{fa.settings.autoSetup}</span>
                </div>
                <div className="helper-copy mt-1 !text-[11px]" dir="ltr">
                  اگر مخزن آماده ندارید، این گزینه مخزن و جریان‌کار دانلود را می‌سازد.
                </div>
                <button
                  onClick={handleAutoSetup}
                  disabled={isAutoSetup || !token}
                  className={cn(
                    'system-btn mt-2 w-full justify-center border-cns-primary',
                    isAutoSetup && 'animate-flicker'
                  )}
                >
                  {isAutoSetup ? setupStep : fa.settings.autoSetup}
                </button>
              </div>

              {error && (
                <div className="summary-strip warning flex items-center gap-2 text-xs text-cns-warning" dir="auto">
                  <AlertCircle size={14} />
                  <span dir="auto">{error}</span>
                </div>
              )}
              {setupSuccess && (
                <div className="summary-strip flex items-center gap-2 text-xs text-cns-primary" dir="auto">
                  <Zap size={14} />
                  <span dir="auto">{setupSuccess}</span>
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving || !token}
                  className="system-btn w-full justify-center"
                >
                  <Save size={12} />
                  <span dir="ltr">{fa.settings.save}</span>
                </button>

                {hasSavedConfig && (
                  <button
                    onClick={handleClear}
                    className="system-btn w-full justify-center border-cns-warning text-cns-warning hover:bg-cns-warning/10"
                  >
                    <span dir="ltr">پاک کردن</span>
                  </button>
                )}
              </div>
                </section>

                <section className="settings-section">
              <div className="settings-section-head">
                <span className="settings-step">۲</span>
                <div>
                  <h3>کوکی‌های یوتیوب</h3>
                  <p>برای جلوگیری از خطای ربات، محتوای cookies.txt را اینجا قرار دهید.</p>
                </div>
              </div>
              <div className="settings-card flex-1 flex flex-col">
                <div className="flex items-center gap-2 text-xs text-cns-warning">
                  <AlertCircle size={13} />
                  <span dir="ltr">{fa.settings.cookies}</span>
                </div>
                <div className="helper-copy mt-1 !text-[11px]" dir="ltr">{fa.settings.cookiesDesc}</div>
                <div className="mt-1 text-[10px] text-cns-warning/80" dir="ltr">{fa.settings.bookmarkletWarn}</div>

                <textarea
                  dir="ltr"
                  value={cookies}
                  onChange={(e) => setCookies(e.target.value)}
                  placeholder={fa.settings.pasteCookies}
                  className="terminal-textarea mt-2 text-left flex-1"
                  style={{ minHeight: '7rem' }}
                  spellCheck={false}
                />

                <button
                  onClick={() => void handleSaveCookies()}
                  disabled={!canSaveCookies || cookiesUploadState === 'busy'}
                  className="system-btn mt-2 w-full justify-center"
                >
                  <Save size={12} />
                  <span dir="ltr">
                    {cookiesUploadState === 'busy'
                      ? fa.settings.uploadingCookies
                      : cookiesUploadState === 'ok'
                        ? fa.settings.cookiesSaved
                        : fa.settings.uploadCookies}
                  </span>
                </button>
              </div>

              <a
                href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
                target="_blank"
                rel="noopener noreferrer"
                className="system-btn w-full justify-center border-cns-highlight text-cns-highlight no-underline py-2 text-xs"
              >
                {fa.settings.extensionLink}
              </a>
                </section>
              </div>
            </div>
            <div className={cn('settings-tab-panel', activeTab === 'diagnostics' && 'active')} aria-hidden={activeTab !== 'diagnostics'}>
              <DiagnosticsPanel isOpen={isOpen} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
