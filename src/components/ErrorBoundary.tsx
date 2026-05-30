import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import errorLoggingService from '@/services/ErrorLoggingService';
import { isChunkLoadError, scheduleChunkLoadRecovery, resetChunkRecoveryMarkers } from '@/utils/lazyRetry';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  componentName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  recovering: boolean;
}

/**
 * Global Error Boundary Component
 * Catches React render errors and logs them to the system
 */
class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      recovering: false
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (isChunkLoadError(error)) {
      this.setState({ recovering: true });
      // Stale-chunk recovery (post-deploy hash mismatch): clear SW + asset
      // caches, then do exactly ONE cache-busting reload per session so the
      // browser fetches a fresh index.html with the new chunk hashes.
      // Without this the user stares at "Updating MeriLive" forever.
      void (async () => {
        try { await scheduleChunkLoadRecovery(error, error.message); } catch { /* best-effort */ }
        try {
          const ONCE_KEY = 'meri_chunk_auto_reload_v1';
          const alreadyTried = sessionStorage.getItem(ONCE_KEY);
          // Zero-refresh policy: do NOT automatically reload the whole page.
          // Instead, we just let the ErrorBoundary show the "Try Again" UI.
          // This prevents the infinite reload loops the user complained about.
          if (!alreadyTried) {
            sessionStorage.setItem(ONCE_KEY, String(Date.now()));
            console.warn('[ErrorBoundary] Chunk load failure detected. User must manually Retry to avoid reload loop.');
          }
        } catch { /* best-effort */ }
      })();
    }

    // Log error to our tracking system
    errorLoggingService.logRenderError(error, this.props.componentName || 'Unknown Component');
    
    this.setState({ errorInfo });
    
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    // If the failure was a stale chunk (post-deploy hash mismatch), the only
    // reliable recovery is to wipe SW + asset caches AND do a hard reload so
    // the browser fetches a fresh index.html with the new chunk hashes.
    // The user explicitly asked for this to work — manual "Try Again" click
    // is NOT an "auto-refresh"; it's a user-initiated recovery.
    if (this.state.error && isChunkLoadError(this.state.error)) {
      resetChunkRecoveryMarkers();
      this.setState({ recovering: true });
      void (async () => {
        try {
          await scheduleChunkLoadRecovery(this.state.error!, this.state.error!.message);
        } catch { /* best-effort */ }
        try {
          // Cache-busting reload to current path (preserves admin secret URL).
          const url = new URL(window.location.href);
          url.searchParams.set('_r', String(Date.now()));
          window.location.replace(url.toString());
        } catch {
          window.location.reload();
        }
      })();
      return;
    }
    this.setState({ hasError: false, error: null, errorInfo: null, recovering: false });
  };


  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

        const isRecoveringChunk = this.state.recovering && this.state.error && isChunkLoadError(this.state.error);

        return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <Card className="max-w-md w-full bg-card border-destructive/20">
            <CardHeader className="text-center">
              <div className="mx-auto w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
                {isRecoveringChunk ? <RefreshCw className="w-8 h-8 text-destructive animate-spin" /> : <AlertTriangle className="w-8 h-8 text-destructive" />}
              </div>
              <CardTitle className="text-xl text-foreground">
                {isRecoveringChunk ? 'Updating MeriLive' : 'Something went wrong'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-muted-foreground text-center text-sm">
                {isRecoveringChunk ? 'Please wait while the app refreshes safely.' : "An error occurred on this page. We're working to fix it."}
              </p>
              
              {this.state.error && (
                <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 text-xs space-y-2 max-h-64 overflow-auto">
                  <p className="font-mono text-destructive break-all font-semibold">
                    {this.state.error.name}: {this.state.error.message}
                  </p>
                  {this.state.errorInfo?.componentStack && (
                    <pre className="font-mono text-[10px] text-muted-foreground whitespace-pre-wrap break-all">
                      {this.state.errorInfo.componentStack.split('\n').slice(0, 8).join('\n')}
                    </pre>
                  )}
                </div>
              )}

              <div className="flex gap-3">
                <Button
                  onClick={this.handleRetry}
                  variant="outline"
                  className="flex-1"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
                <Button
                  onClick={this.handleGoHome}
                  className="flex-1"
                >
                  <Home className="w-4 h-4 mr-2" />
                  Go Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
