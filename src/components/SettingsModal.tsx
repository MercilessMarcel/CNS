import { useState, useEffect } from 'react';
import { X, Save, Check, AlertCircle, Zap } from 'lucide-react';
import { fa } from '../lib/i18n';
import { github } from '../lib/github';
import { cn } from '../lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [token, setToken] = useState('');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [cookies, setCookies] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAutoSetup, setIsAutoSetup] = useState(false);
  const [setupStep, setSetupStep] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const config = github.getConfig();
      if (config) {
        setToken(config.token);
        setOwner(config.owner);
        setRepo(config.repo);
      }
      setTestResult(null);
      setError(null);
    }
  }, [isOpen]);

  const handleTest = async () => {
    if (!token || !owner || !repo) {
      setError('تمام فیلدها الزامی هستند');
      return;
    }

    setIsTesting(true);
    setError(null);
    setTestResult(null);

    try {
      github.setConfig({ token, owner, repo });
      const valid = await github.validateRepo();
      setTestResult(valid);
      if (!valid) {
        setError('ارتباط برقرار نشد. توکن یا مخزن نامعتبر است.');
      }
    } catch (err) {
      setTestResult(false);
      setError(err instanceof Error ? err.message : 'خطای نامشخص');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = () => {
    if (!token || !owner || !repo) {
      setError('تمام فیلدها الزامی هستند');
      return;
    }

    setIsSaving(true);
    github.setConfig({ token, owner, repo });
    setIsSaving(false);
    onClose();
  };

  const handleClear = () => {
    github.clearConfig();
    setToken('');
    setOwner('');
    setRepo('');
    setTestResult(null);
  };

  const handleSaveCookies = async () => {
    if (!cookies.trim()) return;
    
    localStorage.setItem('cns_cookies', cookies.trim());
    
    // Upload to GitHub if config exists
    const config = github.getConfig();
    if (config) {
      try {
        await github.uploadCookies(cookies.trim());
      } catch {
        // Silent fail - will retry on next download
      }
    }
    
    setCookies('');
    setTestResult(true);
    setTimeout(() => setTestResult(null), 2000);
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
      const config = await github.autoSetup(token, 'cns-downloads');
      setOwner(config.owner);
      setRepo(config.repo);
      setSetupStep(fa.settings.addingWorkflow);
      setTestResult(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در راه‌اندازی خودکار');
      setTestResult(false);
    } finally {
      setIsAutoSetup(false);
      setSetupStep('');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md cns-panel corner-accent bg-cns-bg">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-cns-deep">
          <div className="flex items-center gap-2">
            <span className="text-cns-primary">{'>'}</span>
            <span className="text-sm">{fa.settings.label}</span>
          </div>
          <button 
            onClick={onClose}
            className="text-cns-deep hover:text-cns-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Token */}
          <div className="space-y-1">
            <label className="text-xs text-cns-deep uppercase tracking-wider">
              {fa.settings.token}
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setTestResult(null);
              }}
              placeholder="ghp_xxxxxxxxxxxx"
              className="terminal-input"
            />
            <div className="text-[10px] text-cns-deep">
              GitHub Personal Access Token با دسترسی repo
            </div>
          </div>

          {/* Auto Setup Button */}
          <div className="border border-cns-primary/30 bg-cns-primary/5 p-3 space-y-2">
            <div className="text-xs text-cns-primary flex items-center gap-2">
              <Zap size={14} />
              {fa.settings.autoSetup}
            </div>
            <div className="text-[10px] text-cns-deep">
              {fa.settings.autoSetupDesc}
            </div>
            <button
              onClick={handleAutoSetup}
              disabled={isAutoSetup || !token}
              className={cn(
                "system-btn w-full py-2 text-xs border-cns-primary",
                isAutoSetup && "animate-flicker"
              )}
            >
              {isAutoSetup ? setupStep : fa.settings.autoSetup}
            </button>
          </div>

          <div className="border-t border-cns-deep my-2" />

          {/* Manual Setup Label */}
          <div className="text-xs text-cns-deep uppercase tracking-wider text-center">
            {fa.settings.manualSetup}
          </div>

          {/* Cookies Section */}
          <div className="border border-cns-warning/30 bg-cns-warning/5 p-3 space-y-2">
            <div className="text-xs text-cns-warning flex items-center gap-2">
              <AlertCircle size={14} />
              {fa.settings.cookies}
            </div>
            <div className="text-[10px] text-cns-deep">
              {fa.settings.cookiesDesc}
            </div>
            <div className="text-[10px] text-cns-deep">
              {fa.settings.cookiesWhy}
            </div>
            
            {/* Bookmarklet */}
            <div className="text-[10px] text-cns-deep pt-1">
              {fa.settings.bookmarklet}:
            </div>
            <a
              href="javascript:(function(){const cd=new Date();const e=Math.floor(cd.getTime()/1000)+86400*7;let o='# Netscape HTTP Cookie File\\n# https://curl.se/rfc/cookie_spec.html\\n# This is a generated file! Do not edit.\\n\\n';const c=document.cookie.split('; ');for(let i=0;i<c.length;i++){const p=c[i].indexOf('=');if(p>0){const n=c[i].substring(0,p);const v=c[i].substring(p+1);if(n&&v){o+='#HttpOnly_.youtube.com\\tTRUE\\t/\\tTRUE\\t'+e+'\\t'+n+'\\t'+encodeURIComponent(v)+'\\n';}}}navigator.clipboard.writeText(o);alert('YouTube cookies copied! Now paste in CNS Settings.');})();"
              className="inline-block system-btn py-1 px-2 text-[10px] no-underline cursor-move"
              title="Drag to bookmarks bar"
            >
              {fa.settings.bookmarkletCode}
            </a>
            
            {/* Cookies textarea */}
            <textarea
              value={cookies}
              onChange={(e) => setCookies(e.target.value)}
              placeholder={fa.settings.pasteCookies}
              className="terminal-input font-mono text-[10px] h-20 resize-none"
              spellCheck={false}
            />
            
            <button
              onClick={handleSaveCookies}
              disabled={!cookies.trim()}
              className="system-btn w-full py-1 text-[10px]"
            >
              {fa.settings.cookiesSaved}
            </button>
          </div>

          {/* Owner */}
          <div className="space-y-1">
            <label className="text-xs text-cns-deep uppercase tracking-wider">
              {fa.settings.repo} (مالک)
            </label>
            <input
              type="text"
              value={owner}
              onChange={(e) => {
                setOwner(e.target.value);
                setTestResult(null);
              }}
              placeholder="username"
              className="terminal-input"
            />
          </div>

          {/* Repo */}
          <div className="space-y-1">
            <label className="text-xs text-cns-deep uppercase tracking-wider">
              {fa.settings.repo} (نام)
            </label>
            <input
              type="text"
              value={repo}
              onChange={(e) => {
                setRepo(e.target.value);
                setTestResult(null);
              }}
              placeholder="youtube-downloads"
              className="terminal-input"
            />
          </div>

          {/* Test Result */}
          {testResult !== null && (
            <div className={cn(
              "border p-2 text-xs flex items-center gap-2",
              testResult 
                ? "border-cns-highlight bg-cns-highlight/5 text-cns-highlight" 
                : "border-cns-warning bg-cns-warning/5 text-cns-warning"
            )}>
              {testResult ? <Check size={14} /> : <AlertCircle size={14} />}
              {testResult ? 'ارتباط موفق' : 'خطا در ارتباط'}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="border border-cns-warning bg-cns-warning/5 p-2 text-xs text-cns-warning flex items-center gap-2">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleTest}
              disabled={isTesting || !token || !owner || !repo}
              className={cn(
                "system-btn flex-1 py-2 text-xs",
                isTesting && "animate-flicker"
              )}
            >
              {isTesting ? '...' : 'تست ارتباط'}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !token || !owner || !repo}
              className={cn(
                "system-btn flex-1 py-2 text-xs flex items-center justify-center gap-1",
                testResult === true && "border-cns-highlight"
              )}
            >
              <Save size={12} />
              {fa.settings.save}
            </button>
          </div>

          {github.getConfig() && (
            <button
              onClick={handleClear}
              className="system-btn w-full py-2 text-xs text-cns-warning border-cns-warning hover:bg-cns-warning/10"
            >
              پاک کردن تنظیمات ذخیره شده
            </button>
          )}

          {/* Instructions */}
          <div className="border border-cns-deep bg-cns-dim/30 p-3 text-[10px] text-cns-deep space-y-1">
            <div className="text-cns-primary mb-2">[SETUP_GUIDE]</div>
            <div>1. مخزن گیت‌هاب بسازید</div>
            <div>2. workflow فایل را در .github/workflows/download.yml کپی کنید</div>
            <div>3. از GitHub Settings {'>'} Developer settings {'>'} Personal access tokens توکن بسازید</div>
            <div>4. دسترسی repo را فعال کنید</div>
          </div>
        </div>
      </div>
    </div>
  );
}
