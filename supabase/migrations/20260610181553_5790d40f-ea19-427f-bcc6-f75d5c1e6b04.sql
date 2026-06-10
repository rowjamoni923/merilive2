
-- G7: Server-side gift combo window (additive only)
CREATE TABLE IF NOT EXISTS public.gift_combo_window (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL,
  gift_id UUID NOT NULL,
  context_key TEXT NOT NULL,
  combo_seq INTEGER NOT NULL DEFAULT 1,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  combo_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_gift_combo_window UNIQUE (sender_id, gift_id, context_key)
);

CREATE INDEX IF NOT EXISTS idx_gift_combo_window_last_sent
  ON public.gift_combo_window(last_sent_at);

GRANT SELECT ON public.gift_combo_window TO authenticated;
GRANT ALL ON public.gift_combo_window TO service_role;

ALTER TABLE public.gift_combo_window ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own combo records"
  ON public.gift_combo_window FOR SELECT
  TO authenticated
  USING (sender_id = auth.uid());

CREATE POLICY "Service role full access"
  ON public.gift_combo_window FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- RPC: record_gift_combo
-- Atomically returns the next combo sequence number for (sender, gift, context).
-- Context key is the caller-built room/stream/call/reel identifier so distinct
-- rooms don't share a combo counter.
CREATE OR REPLACE FUNCTION public.record_gift_combo(
  p_sender_id UUID,
  p_gift_id UUID,
  p_context_key TEXT,
  p_window_ms INTEGER DEFAULT 3000
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.gift_combo_window;
  v_now TIMESTAMPTZ := now();
  v_within_window BOOLEAN := false;
  v_seq INTEGER;
BEGIN
  IF p_sender_id IS NULL OR p_gift_id IS NULL OR p_context_key IS NULL OR length(p_context_key) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_input');
  END IF;

  -- Try to upsert. Lock the existing row if any.
  SELECT * INTO v_row
  FROM public.gift_combo_window
  WHERE sender_id = p_sender_id AND gift_id = p_gift_id AND context_key = p_context_key
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    INSERT INTO public.gift_combo_window(sender_id, gift_id, context_key, combo_seq, last_sent_at, combo_started_at)
    VALUES (p_sender_id, p_gift_id, p_context_key, 1, v_now, v_now);
    RETURN jsonb_build_object('success', true, 'combo_seq', 1, 'is_new_combo', true);
  END IF;

  v_within_window := EXTRACT(EPOCH FROM (v_now - v_row.last_sent_at)) * 1000 <= p_window_ms;

  IF v_within_window THEN
    v_seq := v_row.combo_seq + 1;
    UPDATE public.gift_combo_window
    SET combo_seq = v_seq, last_sent_at = v_now
    WHERE id = v_row.id;
    RETURN jsonb_build_object('success', true, 'combo_seq', v_seq, 'is_new_combo', false);
  ELSE
    UPDATE public.gift_combo_window
    SET combo_seq = 1, last_sent_at = v_now, combo_started_at = v_now
    WHERE id = v_row.id;
    RETURN jsonb_build_object('success', true, 'combo_seq', 1, 'is_new_combo', true);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_gift_combo(UUID, UUID, TEXT, INTEGER) TO authenticated, service_role;

-- Cleanup function for old combo rows (callable by cron)
CREATE OR REPLACE FUNCTION public.cleanup_old_gift_combos()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM public.gift_combo_window WHERE last_sent_at < now() - interval '1 day';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_old_gift_combos() TO service_role;
