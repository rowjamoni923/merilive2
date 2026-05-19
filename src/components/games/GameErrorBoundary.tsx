import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: React.ReactNode;
  /** Friendly name shown in the error card. */
  gameName?: string;
  /** Called when the user clicks "Try again" — typically resets parent state too. */
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  message?: string;
}

/**
 * Catches render-time crashes inside any game component so we NEVER show a
 * blank screen to the user. A "Try again" button remounts the subtree.
 */
export class GameErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(err: unknown): State {
    return {
      hasError: true,
      message: err instanceof Error ? err.message : String(err),
    };
  }

  componentDidCatch(error: unknown, info: unknown) {
    // eslint-disable-next-line no-console
    console.error('[GameErrorBoundary] crash', error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, message: undefined });
    this.props.onReset?.();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex min-h-[320px] w-full items-center justify-center p-6">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card/90 p-6 text-center shadow-xl backdrop-blur">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h3 className="mb-1 text-base font-semibold text-foreground">
            {this.props.gameName ? `${this.props.gameName} crashed` : 'Game crashed'}
          </h3>
          <p className="mb-4 text-xs text-muted-foreground">
            Something went wrong while loading the game. Tap retry to try again.
          </p>
          {this.state.message ? (
            <p className="mb-4 max-h-20 overflow-auto rounded-md bg-muted/60 p-2 text-left text-[10px] text-muted-foreground">
              {this.state.message}
            </p>
          ) : null}
          <Button onClick={this.handleRetry} variant="luxury" className="w-full" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" /> Try again
          </Button>
        </div>
      </div>
    );
  }
}

export default GameErrorBoundary;
