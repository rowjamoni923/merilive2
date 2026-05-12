-- Pkg34: Support live chat realtime — admin panel uses custom token (not Supabase auth),
-- so postgres_changes RLS evaluation as anon blocks events. Use Realtime broadcast (RLS-free)
-- on a public channel so BOTH sides receive events instantly.

CREATE OR REPLACE FUNCTION public.broadcast_support_event()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  v_payload := jsonb_build_object(
    'op', TG_OP,
    'table', TG_TABLE_NAME,
    'ticket_id', COALESCE((to_jsonb(NEW)->>'ticket_id')::uuid, (to_jsonb(NEW)->>'id')::uuid),
    'record', to_jsonb(NEW),
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END
  );

  -- Public broadcast — no RLS, both anon (admin client) and authenticated (user) receive it
  PERFORM realtime.send(
    v_payload,
    'support_event',
    'support_realtime',
    false
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block the write if broadcast fails
  RAISE WARNING 'broadcast_support_event failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_messages_broadcast_trg ON public.support_messages;
CREATE TRIGGER support_messages_broadcast_trg
AFTER INSERT OR UPDATE ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION public.broadcast_support_event();

DROP TRIGGER IF EXISTS support_tickets_broadcast_trg ON public.support_tickets;
CREATE TRIGGER support_tickets_broadcast_trg
AFTER INSERT OR UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.broadcast_support_event();