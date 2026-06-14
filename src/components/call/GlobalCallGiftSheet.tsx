/**
 * Pkg500 Phase G — GlobalCallGiftSheet
 *
 * Mounted globally inside `CallProvider`. Listens for the
 * `open-call-gift-sheet` window event (fired by the native
 * PrivateCallActivity's in-call Gift button, routed via
 * `useNativeCallBillingSync`) and opens the canonical
 * `GiftPanel` (same one used by Live/Party/Call/DM) over the
 * WebView while the native call surface auto-shrinks into PIP.
 *
 * On close OR gift sent we ask the native side to expand the
 * call activity back to fullscreen via `resumeInCallActivity()`.
 * Web / iOS / older APKs simply close the sheet — the resume
 * call is a no-op there.
 */
import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { sendGift, GiftPanel, type GiftData } from '@/features/shared/gifting';
import { NativeCall, isNativeCallAvailable } from '@/plugins/NativeCall';
import { toast } from 'sonner';

interface OpenDetail {
  peerId: string;
  callId: string;
  source?: string;
}

async function resumeNativeCall() {
  if (!isNativeCallAvailable()) return;
  try {
    // Method is declared on the plugin; older APKs without it throw silently.
    await (NativeCall as unknown as { resumeInCallActivity?: () => Promise<unknown> })
      .resumeInCallActivity?.();
  } catch {
    /* no-op */
  }
}

export function GlobalCallGiftSheet() {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<OpenDetail | null>(null);
  const [senderId, setSenderId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data }) => {
      if (mounted) setSenderId(data.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSenderId(session?.user?.id ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const onOpen = (ev: Event) => {
      const detail = (ev as CustomEvent<OpenDetail>).detail;
      if (!detail?.peerId || !detail?.callId) return;
      setTarget(detail);
      setOpen(true);
    };
    window.addEventListener('open-call-gift-sheet', onOpen as EventListener);
    return () => window.removeEventListener('open-call-gift-sheet', onOpen as EventListener);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setTarget(null);
    void resumeNativeCall();
    try {
      window.dispatchEvent(new CustomEvent('close-call-gift-sheet'));
    } catch {
      /* no-op */
    }
  }, []);

  const handleSendGift = useCallback(
    async (gift: GiftData, count: number) => {
      if (!target || !senderId) {
        toast.error('Please sign in to send a gift');
        handleClose();
        return;
      }
      try {
        const result = await sendGift({
          giftId: gift.id,
          gift,
          senderId,
          receiverId: target.peerId,
          quantity: count,
          context: 'call',
          callId: target.callId,
        });
        if (!result.success) {
          toast.error(result.error || 'Failed to send gift');
        }
      } catch (e) {
        toast.error('Failed to send gift');
        // eslint-disable-next-line no-console
        console.error('[Pkg500/G] sendGift', e);
      } finally {
        handleClose();
      }
    },
    [target, senderId, handleClose],
  );

  if (!open || !target) return null;

  return (
    <GiftPanel isOpen={open} onClose={handleClose} onSendGift={handleSendGift} />
  );
}
