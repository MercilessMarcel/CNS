import { Component, ReactNode, ErrorInfo } from 'react';
import { AlertCircle, RefreshCw, Trash2, Download } from 'lucide-react';
import { cn } from '../lib/utils';
import { logger } from '../lib/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  exportMessage: string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null, exportMessage: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null, exportMessage: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('CNS Error Boundary caught', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
    this.setState({ error, errorInfo });
  }

  handleRetry = () => {
    window.location.reload();
  };

  handleExportLogFile = async () => {
    try {
      this.setState({ exportMessage: 'Exporting log file...' });
      const path = await logger.exportToFile();
      this.setState({ exportMessage: `Saved log file: ${path}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.setState({ exportMessage: `Export failed: ${message}` });
    }
  };

  handleClearConfig = () => {
    try {
      localStorage.removeItem('cns_github_config');
      localStorage.removeItem('cns_cookies');
      logger.info('Config cleared by user from ErrorBoundary');
    } catch (e) {
      logger.error('Failed to clear config from ErrorBoundary', e);
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-cns-bg p-4 text-cns-primary flex items-center justify-center">
          <div className="w-full max-w-lg border border-cns-warning/50 bg-cns-bg p-6 rounded-lg">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="text-cns-warning" size={28} />
              <h1 className="text-lg font-mono text-cns-warning" dir="rtl">
                خطای راه‌اندازی / Startup Error
              </h1>
            </div>

            <div className="space-y-4 text-sm">
              <p className="text-cns-primary/80" dir="rtl">
                اپلیکیشن با خطا مواجه شد. جزئیات در کنسول ثبت شده است.
              </p>
              <p className="text-cns-primary/60 text-xs" dir="ltr">
                The application encountered an error. Details logged to console.
              </p>

              {this.state.error && (
                <div className="bg-black/30 p-3 rounded border border-cns-deep/50 font-mono text-xs">
                  <div className="text-cns-warning mb-1">{this.state.error.name}:</div>
                  <div className="text-cns-primary/70 whitespace-pre-wrap">{this.state.error.message}</div>
                  {this.state.errorInfo && (
                    <div className="mt-2 text-cns-deep pt-2 border-t border-cns-deep/30">
                      {this.state.errorInfo.componentStack?.split('\n').slice(0, 5).join('\n')}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-2">
                <button
                  onClick={this.handleRetry}
                  className={cn(
                    "system-btn flex items-center gap-2",
                    "border-cns-primary hover:bg-cns-primary/10"
                  )}
                >
                  <RefreshCw size={14} />
                  <span dir="rtl">تلاش مجدد / Retry</span>
                </button>

                <button
                  onClick={this.handleExportLogFile}
                  className={cn(
                    "system-btn flex items-center gap-2",
                    "border-cns-primary text-cns-primary hover:bg-cns-primary/10"
                  )}
                >
                  <Download size={14} />
                  <span dir="rtl">Export log file</span>
                </button>

                <button
                  onClick={this.handleClearConfig}
                  className={cn(
                    "system-btn flex items-center gap-2",
                    "border-cns-warning text-cns-warning hover:bg-cns-warning/10"
                  )}
                >
                  <Trash2 size={14} />
                  <span dir="rtl">پاک کردن تنظیمات / Clear Config</span>
                </button>
              </div>
              {this.state.exportMessage && (
                <div className="mt-3 rounded border border-cns-primary/40 bg-black/10 p-3 text-xs font-mono" dir="ltr">
                  {this.state.exportMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
