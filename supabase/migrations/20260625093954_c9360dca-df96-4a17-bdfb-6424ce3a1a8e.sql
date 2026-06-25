
-- Public invite preview RPC + URL-safe token migration

CREATE OR REPLACE FUNCTION public.get_group_invite_preview(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g RECORD;
BEGIN
  SELECT id, name, description, avatar_url, group_type, member_count, is_public,
         invite_expires_at, invite_max_uses, invite_used_count, is_active
    INTO g
  FROM public.groups
  WHERE invite_token = p_token
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status','not_found');
  END IF;

  IF g.is_active = false THEN
    RETURN jsonb_build_object('status','inactive');
  END IF;

  IF g.invite_expires_at IS NOT NULL AND g.invite_expires_at < now() THEN
    RETURN jsonb_build_object('status','expired');
  END IF;

  IF g.invite_max_uses IS NOT NULL AND g.invite_used_count >= g.invite_max_uses THEN
    RETURN jsonb_build_object('status','exhausted');
  END IF;

  RETURN jsonb_build_object(
    'status','ok',
    'id', g.id,
    'name', g.name,
    'description', g.description,
    'avatar_url', g.avatar_url,
    'group_type', g.group_type,
    'member_count', g.member_count,
    'is_public', g.is_public
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_group_invite_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_invite_preview(text) TO anon, authenticated;

-- Re-encode any URL-unsafe invite tokens (legacy base64 with / + =)
UPDATE public.groups
SET invite_token = encode(gen_random_bytes(12), 'hex')
WHERE invite_token ~ '[/+=]' OR invite_token IS NULL;
