import { useState, useEffect } from 'react';
import { X, Save, AlertCircle, Zap } from 'lucide-react';
import { fa } from '../lib/i18n';
import { github } from '../lib/github';
import { cn } from '../lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [token, setToken] = useState('');
  const [cookies, setCookies] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAutoSetup, setIsAutoSetup] = useState(false);
  const [setupStep, setSetupStep] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      const config = github.getConfig();
      if (config) {
        setToken(config.token);
      }
      setError(null);
    }
  }, [isOpen]);

  const handleSave = () => {
    if (!token) {
      setError('توکن گیت‌هاب الزامی است');
      return;
    }

    setIsSaving(true);
    // Save token only - owner/repo set by auto-setup
    const config = github.getConfig();
    if (config) {
      github.setConfig({ token, owner: config.owner, repo: config.repo });
    }
    setIsSaving(false);
    onClose();
  };

  const handleClear = () => {
    github.clearConfig();
    setToken('');
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
              onChange={(e) => setToken(e.target.value)}
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
              href="javascript:(function(){const cd=new Date();const e=Math.floor(cd.getTime()/1000)+86400*7;let o='# Netscape HTTP Cookie File\n# https://curl.se/rfc/cookie_spec.html\n# This is a generated file! Do not edit.\n\n';const c=document.cookie.split('; ');for(let i=0;i<c.length;i++){const p=c[i].indexOf('=');if(p>0){const n=c[i].substring(0,p);const v=c[i].substring(p+1);if(n&&v){o+='#HttpOnly_.youtube.com\tTRUE\t/\tTRUE\t'+e+'\t'+n+'\t'+encodeURIComponent(v)+'\n';}}}navigator.clipboard.writeText(o);alert('YouTube cookies copied! Now paste in CNS Settings.');})();"
              className="inline-block system-btn py-1 px-2 text-[10px] no-underline cursor-move"
              title="Drag to bookmarks bar"
            >
              {fa.settings.bookmarkletCode}
            </a>
            <div className="text-[9px] text-cns-warning">
              {fa.settings.bookmarkletWarn}
            </div>
            
            {/* Extension Method */}
            <div className="text-[10px] text-cns-deep pt-2">
              {fa.settings.extensionMethod}:
            </div>
            <a
              href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbllbjkjfnlpehkmcjnikdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block system-btn py-1 px-2 text-[10px] no-underline border-cns-highlight text-cns-highlight"
            >
              {fa.settings.extensionLink}
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

          {/* Error */}
          {error && (
            <div className="border border-cns-warning bg-cns-warning/5 p-2 text-xs text-cns-warning flex items-center gap-2">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          {/* Save Token Only */}
          <button
            onClick={handleSave}
            disabled={isSaving || !token}
            className="system-btn w-full py-2 text-xs flex items-center justify-center gap-1"
          >
            <Save size={12} />
            {fa.settings.save}
          </button>

          {github.getConfig() && (
            <button
              onClick={handleClear}
              className="system-btn w-full py-2 text-xs text-cns-warning border-cns-warning hover:bg-cns-warning/10"
            >
              پاک کردن تنظیمات ذخیره شده
            </button>
          )}

        </div>
      </div>
    </div>
  );
}
