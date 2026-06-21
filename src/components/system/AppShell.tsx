/**
 * AppShell — Layer 3 of the app-wide reliability stack.
 *
 * A thin wrapper that combines:
 *   - the existing ErrorBoundary (so we never regress)
 *   - the global ConnectionStatus banner
 *
 * New pages / sections can opt-in by wrapping themselves in <AppShell>.
 * The root App.tsx already has ErrorBoundary in place; we only mount the
 * ConnectionStatus indicator at the root in main.tsx-adjacent wiring.
 */
import type { ReactNode } from 'react';
import ErrorBoundary from '@/components/ErrorBoundary';
import ConnectionStatus from './ConnectionStatus';

interface Props {
  children: ReactNode;
  /** Logical name for error-reporting (e.g. "ProfilePage"). */
  name?: string;
  /** Render the connectivity banner. Only enable once at the root. */
  withConnectionStatus?: boolean;
}

export default function AppShell({ children, name = 'AppShell', withConnectionStatus }: Props) {
  return (
    <ErrorBoundary componentName={name}>
      {withConnectionStatus ? <ConnectionStatus /> : null}
      {children}
    </ErrorBoundary>
  );
}
