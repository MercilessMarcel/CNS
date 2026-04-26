import { useState, useEffect } from 'react';
import { X, Save, Check, AlertCircle } from 'lucide-react';
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
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

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
