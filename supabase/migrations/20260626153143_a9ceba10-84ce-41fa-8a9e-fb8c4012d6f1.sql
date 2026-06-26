
CREATE TABLE IF NOT EXISTS public.user_conversation_prefs (
  user_id UUID NOT NULL,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  is_muted BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  marked_unread BOOLEAN NOT NULL DEFAULT false,
  pinned_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_ucp_user_pinned ON public.user_conversation_prefs(user_id, is_pinned) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_ucp_user_archived ON public.user_conversation_prefs(user_id, is_archived) WHERE is_archived = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_conversation_prefs TO authenticated;
GRANT ALL ON public.user_conversation_prefs TO service_role;

ALTER TABLE public.user_conversation_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own conversation prefs"
  ON public.user_conversation_prefs
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_conversation_prefs;
