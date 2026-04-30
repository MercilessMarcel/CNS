import { useState, useEffect } from 'react';
import { Save, AlertCircle, Zap, Activity, Settings as SettingsIcon } from 'lucide-react';
import { fa } from '../lib/i18n';
import { github } from '../lib/github';
import { cn } from '../lib/utils';
import { DiagnosticsPanel } from './DiagnosticsPanel';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [token, setToken] = useState('');
  const [repoName, setRepoName] = useState('cns-downloads');
  const [cookies, setCookies] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoSetup, setIsAutoSetup] = useState(false);
  const [setupStep, setSetupStep] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'settings' | 'diagnostics'>('settings');
  const [mounted, setMounted] = useState(isOpen);
  const [closing, setClosing] = useState(false);
  const hasSavedConfig = !!github.getConfig();

  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setClosing(false);
      const config = github.getConfig();
      if (config) {
        setToken(config.token);
        setRepoName(config.repo);
      }
      setError(null);
    } else if (mounted) {
      setClosing(true);
      const t = window.setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, 220);
      return () => window.clearTimeout(t);
    }
  }, [isOpen, mounted]);

  const handleSave = async () => {
    if (!token) {
      setError('توکن گیت‌هاب الزامی است');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const config = github.getConfig();
      if (config) {
        github.setConfig({ token, owner: config.owner, repo: repoName.trim() || config.repo });
      } else {
        const attached = await github.connectExistingRepo(token, repoName.trim() || 'cns-downloads');
        await github.ensureWorkflow(token, attached.owner, attached.repo);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در اتصال به مخزن موجود');
    }
    setIsSaving(false);
  };

  const handleClear = () => {
    github.clearConfig();
    setToken('');
  };

  const handleSaveCookies = async () => {
    if (!cookies.trim()) return;

    localStorage.setItem('cns_cookies', cookies.trim());

    try {
      let config = github.getConfig();
      if (!config) {
        if (!token) {
          setError('توکن گیت‌هاب الزامی است');
          return;
        }
        config = await github.connectExistingRepo(token, repoName.trim() || 'cns-downloads');
        await github.ensureWorkflow(token, config.owner, config.repo);
      }
      await github.uploadCookies(cookies.trim());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در آپلود کوکی‌ها');
      return;
    }

    setCookies('');
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
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در راه‌اندازی خودکار');
    } finally {
      setIsAutoSetup(false);
      setSetupStep('');
    }
  };

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      <div
        className={cn('modal-backdrop absolute inset-0 bg-black/55 backdrop-blur-[2px]', closing && 'closing')}
        onClick={onClose}
      />

      <div className={cn('window modal-shell relative w-full max-w-2xl', closing && 'closing')} dir="ltr">
        <header className="window-titlebar">
          <span className="window-name">
            <SettingsIcon size={12} />
            SETTINGS.EXE
          </span>
          <span className="window-controls">
            <span className="window-dot" data-glyph="_" />
            <span className="window-dot" data-glyph="□" />
            <button onClick={onClose} className="window-dot close" aria-label="close" type="button">×</button>
          </span>
        </header>

        <div className="window-body" style={{ paddingTop: '0.85rem', paddingBottom: '0.85rem' }}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('settings')}
                className={cn('nav-tab', activeTab === 'settings' && 'active')}
                dir="rtl"
              >
                <SettingsIcon size={12} />
                <span>تنظیمات</span>
              </button>
              <button
                onClick={() => setActiveTab('diagnostics')}
                className={cn('nav-tab', activeTab === 'diagnostics' && 'active')}
              >
                <Activity size={12} />
                <span>Diagnostics</span>
              </button>
            </div>
            <span className={cn('status-pill', hasSavedConfig ? 'success' : 'warning')} dir="rtl">
              {hasSavedConfig ? 'پیکربندی ذخیره شده' : 'بدون مخزن'}
            </span>
          </div>

          {activeTab === 'diagnostics' ? (
            <DiagnosticsPanel isOpen={isOpen} />
          ) : (
          <div className="grid gap-3 md:grid-cols-2">
            <section className="space-y-3">
              <div className="hud-block !p-3 space-y-3">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="field-label text-xs" dir="rtl">{fa.settings.token}</span>
                    <span className="micro-label !text-[10px]" dir="ltr">repo · workflow</span>
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
                  <span className="field-label text-xs" dir="rtl">نام مخزن</span>
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

              <div className="hud-block !p-3">
                <div className="flex items-center gap-2 text-xs text-cns-primary">
                  <Zap size={13} />
                  <span dir="rtl">{fa.settings.autoSetup}</span>
                </div>
                <div className="helper-copy mt-1 !text-[11px]" dir="rtl">{fa.settings.autoSetupDesc}</div>
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
                <div className="summary-strip warning flex items-center gap-2 text-xs text-cns-warning">
                  <AlertCircle size={14} />
                  <span dir="rtl">{error}</span>
                </div>
              )}

              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  onClick={handleSave}
                  disabled={isSaving || !token}
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
                    <span dir="rtl">پاک کردن</span>
                  </button>
                )}
              </div>
            </section>

            <section className="space-y-3 flex flex-col">
              <div className="hud-block !p-3 flex-1 flex flex-col">
                <div className="flex items-center gap-2 text-xs text-cns-warning">
                  <AlertCircle size={13} />
                  <span dir="rtl">{fa.settings.cookies}</span>
                </div>
                <div className="helper-copy mt-1 !text-[11px]" dir="rtl">{fa.settings.cookiesDesc}</div>
                <div className="mt-1 text-[10px] text-cns-warning/80" dir="rtl">{fa.settings.bookmarkletWarn}</div>

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
                  onClick={handleSaveCookies}
                  disabled={!cookies.trim()}
                  className="system-btn mt-2 w-full justify-center"
                >
                  <Save size={12} />
                  <span dir="rtl">{fa.settings.cookiesSaved}</span>
                </button>
              </div>

              <a
                href="https://chrome.google.com/webstore/detail/get-cookiestxt-locally"
                target="_blank"
                rel="noopener noreferrer"
                className="system-btn w-full justify-center border-cns-highlight text-cns-highlight no-underline py-2 text-xs"
              >
                {fa.settings.extensionLink}
              </a>
            </section>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
