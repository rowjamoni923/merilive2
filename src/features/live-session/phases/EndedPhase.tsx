/**
 * EndedPhase — minimal placeholder for the post-stream summary.
 *
 * Real summary UI (viewers, gifts, earnings, share) will be migrated here in
 * a later step from LiveStream's end-of-stream sheet.
 */
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useLiveSession } from '../LiveSessionProvider';

export default function EndedPhase() {
  const navigate = useNavigate();
  const { setPhase } = useLiveSession();

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <h1 className="text-2xl font-semibold">Stream ended</h1>
      <p className="text-sm text-muted-foreground">
        Your live session has finished.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => setPhase('preview')}>
          Go live again
        </Button>
        <Button onClick={() => navigate('/', { replace: true })}>
          Back to home
        </Button>
      </div>
    </div>
  );
}
