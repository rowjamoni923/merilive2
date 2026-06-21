/**
 * LiveSessionPage
 * ---------------
 * Single route handler for the entire Go Live flow. Renders one
 * LiveSessionProvider that survives every phase transition; the active
 * phase determines which UI subtree mounts.
 *
 * Query params (optional, used for backward-compat redirects):
 *   ?phase=preview|broadcast|ended
 *   ?stream=<stream-id>            (when entering directly into broadcast)
 */
import { useSearchParams } from 'react-router-dom';
import {
  LiveSessionProvider,
  useLiveSession,
  PreviewPhase,
  BroadcastPhase,
  EndedPhase,
  type LiveSessionPhase,
} from '@/features/live-session';

function PhaseSwitch() {
  const { phase } = useLiveSession();
  switch (phase) {
    case 'broadcast':
      return <BroadcastPhase />;
    case 'ended':
      return <EndedPhase />;
    case 'preview':
    default:
      return <PreviewPhase />;
  }
}

export default function LiveSessionPage() {
  const [params] = useSearchParams();
  const phaseParam = params.get('phase') as LiveSessionPhase | null;
  const streamParam = params.get('stream');

  const initialPhase: LiveSessionPhase =
    phaseParam === 'broadcast' || phaseParam === 'ended' || phaseParam === 'preview'
      ? phaseParam
      : 'preview';

  return (
    <LiveSessionProvider
      initialPhase={initialPhase}
      initialStreamId={streamParam}
    >
      <PhaseSwitch />
    </LiveSessionProvider>
  );
}
