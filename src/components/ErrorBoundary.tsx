import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import errorLoggingService from '@/services/ErrorLoggingService';
import { isChunkLoadError, scheduleChunkLoadRecovery, resetChunkRecoveryMarkers, hardReloadForChunkRecovery } from '@/utils/lazyRetry';

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
      // Zero-refresh policy: cleared stale runtime caches best-effort.
      // After a short delay to show the "Updating" UI, we trigger a reload 
      // if it's a persistent chunk failure, as that's the only way to fetch 
      // the new manifest/assets from the server.
      void (async () => {
        try {
          await scheduleChunkLoadRecovery(error, error.message);
          // Wait briefly so user sees the professional "Updating" state
          await new Promise(r => setTimeout(r, 1200));
        } catch { /* best-effort */ }
        hardReloadForChunkRecovery();
      })();
    }

    // Log error to our tracking system
    errorLoggingService.logRenderError(error, this.props.componentName || 'Unknown Component');
    
    this.setState({ errorInfo });
    
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    // The user explicitly asked for no automatic refreshes.
    // Manual "Try Again" is the only way to recover from a hard failure.
    if (this.state.error && isChunkLoadError(this.state.error)) {
      resetChunkRecoveryMarkers();
      this.setState({ recovering: true });
      void (async () => {
        try {
          await scheduleChunkLoadRecovery(this.state.error!, this.state.error!.message);
        } catch { /* best-effort */ }
        try {
          // One final attempt to clear caches before we give up
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
          }
        } catch {}
        // After manual click, force a cache-busting hard reload.
        hardReloadForChunkRecovery();
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
      // Custom fallback UI — respect explicit `null` (caller wants silent failure)
      if ('fallback' in this.props) {
        return this.props.fallback ?? null;
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
