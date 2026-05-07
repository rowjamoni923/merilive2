import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = 'https://ayjdlvuurscxucatbbah.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc';

type State = 'loading' | 'valid' | 'already' | 'invalid' | 'submitting' | 'success' | 'error';

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState<State>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setState('invalid'); return; }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON_KEY } }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setState('invalid'); setError(data?.error || 'Invalid link'); return; }
        if (data?.reason === 'already_unsubscribed' || data?.alreadyUnsubscribed || data?.used) { setState('already'); return; }
        setState('valid');
      } catch (e: any) {
        setState('invalid');
        setError(e?.message || 'Network error');
      }
    })();
  }, [token]);

  const onConfirm = async () => {
    setState('submitting');
    try {
      const { data, error } = await supabase.functions.invoke('handle-email-unsubscribe', {
        body: { token },
      });
      if (error || data?.error) {
        setError(data?.error || error?.message || 'Failed to unsubscribe');
        setState('error');
        return;
      }
      setState('success');
    } catch (e: any) {
      setError(e?.message || 'Network error');
      setState('error');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg text-center">
        <h1 className="text-2xl font-bold text-foreground mb-2">Email Preferences</h1>
        <p className="text-sm text-muted-foreground mb-6">MeriLive notifications</p>

        {state === 'loading' && <p className="text-foreground">Validating link…</p>}

        {state === 'valid' && (
          <>
            <p className="text-foreground mb-6">Click the button below to confirm and stop receiving these emails.</p>
            <button
              onClick={onConfirm}
              className="w-full rounded-lg bg-primary text-primary-foreground py-3 font-semibold hover:opacity-90 transition"
            >
              Confirm Unsubscribe
            </button>
          </>
        )}

        {state === 'submitting' && <p className="text-foreground">Processing…</p>}

        {state === 'success' && (
          <p className="text-foreground">You have been unsubscribed. You will no longer receive app emails from MeriLive.</p>
        )}

        {state === 'already' && (
          <p className="text-foreground">You're already unsubscribed. No further action is needed.</p>
        )}

        {(state === 'invalid' || state === 'error') && (
          <>
            <p className="text-destructive font-medium mb-2">Unable to process this request</p>
            {error && <p className="text-xs text-muted-foreground">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
