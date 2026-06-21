/**
 * EndedPhase (party) — post-room summary surface.
 *
 * Same visual language as the Live ended phase so the two flows feel
 * like one product. "Start another party" resets the Provider state
 * to phase=create without unmounting, so the user lands on the create
 * form with the native plugin context still alive.
 */
import { useNavigate } from 'react-router-dom';
import { Sparkles, Home, Repeat } from 'lucide-react';
import { usePartySession } from '../PartySessionProvider';

export default function EndedPhase() {
  const navigate = useNavigate();
  const { setPhase, setRoomId } = usePartySession();

  const handleStartAnother = () => {
    setRoomId(null);
    setPhase('create');
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center px-6 text-center"
      style={{
        background:
          'radial-gradient(140% 90% at 50% 0%, #2A0A4A 0%, #150428 45%, #07020F 100%)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(circle, #FF3DAF 0%, transparent 70%)' }}
      />

      <div className="relative z-10 flex flex-col items-center gap-6">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 backdrop-blur-md ring-1 ring-white/15">
          <Sparkles className="h-9 w-9 text-pink-300" aria-hidden />
        </div>

        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Party ended
          </h1>
          <p className="text-base text-white/70">
            Thanks for hosting. The room is closed.
          </p>
        </div>

        <div className="mt-2 flex w-full max-w-xs flex-col gap-3 sm:flex-row sm:max-w-md">
          <button
            type="button"
            onClick={handleStartAnother}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full border border-white/25 bg-white/5 px-5 py-3 text-sm font-medium text-white backdrop-blur-md transition hover:bg-white/10 active:scale-[0.98]"
          >
            <Repeat className="h-4 w-4" aria-hidden />
            Start another party
          </button>
          <button
            type="button"
            onClick={() => navigate('/party-rooms', { replace: true })}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-pink-500/30 transition active:scale-[0.98]"
            style={{
              background: 'linear-gradient(135deg, #9B2BFF 0%, #FF3DAF 100%)',
            }}
          >
            <Home className="h-4 w-4" aria-hidden />
            Back to lobby
          </button>
        </div>
      </div>
    </div>
  );
}
