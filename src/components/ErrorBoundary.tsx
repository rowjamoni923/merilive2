import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import errorLoggingService from '@/services/ErrorLoggingService';
import { isChunkLoadError, scheduleChunkLoadRecovery } from '@/utils/lazyRetry';

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
      void scheduleChunkLoadRecovery(error, error.message);
    }

    // Log error to our tracking system
    errorLoggingService.logRenderError(error, this.props.componentName || 'Unknown Component');
    
    this.setState({ errorInfo });
    
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
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
