-- Pkg314 pass-2: chat media privacy + storage MIME hardening

-- 1) Private DM/group media: stop CDN-wide public access.
UPDATE storage.buckets
SET public = false,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm'
    ]::text[]
WHERE id = 'chat-media';

-- 2) Keep existing public asset buckets from accepting generic arbitrary binaries.
--    Buckets that legitimately store SVGA/binary animations are excluded.
UPDATE storage.buckets
SET allowed_mime_types = array_remove(allowed_mime_types, 'application/octet-stream')
WHERE public = true
  AND allowed_mime_types IS NOT NULL
  AND id NOT IN ('animations', 'gifts', 'entry-banners', 'entry-bars', 'chat_bubbles', 'chat-bubbles', 'avatar_frames', 'vehicle-entrances');

-- content-media was public with no MIME/size guard; give it an explicit media-only envelope.
UPDATE storage.buckets
SET file_size_limit = COALESCE(file_size_limit, 52428800),
    allowed_mime_types = ARRAY[
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif',
      'video/mp4', 'video/webm', 'video/quicktime', 'video/x-m4v'
    ]::text[]
WHERE id = 'content-media';

CREATE OR REPLACE FUNCTION public.can_read_chat_media_object(_object_name text, _object_owner uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _public_url_fragment text;
  _storage_path text;
BEGIN
  IF _uid IS NULL OR _object_name IS NULL OR _object_name = '' OR position('..' in _object_name) > 0 THEN
    RETURN false;
  END IF;

  -- Uploader/owner can always read their own chat media.
  IF _object_owner = _uid OR split_part(_object_name, '/', 1) = _uid::text THEN
    RETURN true;
  END IF;

  _storage_path := 'chat-media/' || _object_name;
  _public_url_fragment := '/storage/v1/object/public/chat-media/' || _object_name;

  -- Direct-message recipient can read only when the uploader/owner sent this object
  -- in a conversation that includes the current user.
  IF EXISTS (
    SELECT 1
    FROM public.messages m
    JOIN public.conversations c ON c.id = m.conversation_id
    WHERE m.sender_id = _object_owner
      AND (_uid = c.participant1_id OR _uid = c.participant2_id)
      AND (
        m.content = _object_name
        OR m.content = _storage_path
        OR m.content LIKE '%' || _public_url_fragment || '%'
        OR m.content LIKE '%/storage/v1/object/sign/chat-media/' || _object_name || '%'
      )
  ) THEN
    RETURN true;
  END IF;

  -- Group members can read only when the uploader/owner sent this object to that group.
  IF EXISTS (
    SELECT 1
    FROM public.group_messages gm
    JOIN public.group_members gmem ON gmem.group_id = gm.group_id
    WHERE gm.sender_id = _object_owner
      AND gmem.user_id = _uid
      AND (
        gm.content = _object_name
        OR gm.content = _storage_path
        OR gm.content LIKE '%' || _public_url_fragment || '%'
        OR gm.content LIKE '%/storage/v1/object/sign/chat-media/' || _object_name || '%'
      )
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_read_chat_media_object(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_chat_media_object(text, uuid) TO authenticated;

-- Replace legacy public-read behavior for chat-media with participant-aware signed-read behavior.
DROP POLICY IF EXISTS "Users can view chat media" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view chat media" ON storage.objects;
DROP POLICY IF EXISTS "Public can view chat media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload chat media" ON storage.objects;

DROP POLICY IF EXISTS "chat_media_private_participant_read" ON storage.objects;
CREATE POLICY "chat_media_private_participant_read"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'chat-media'
  AND public.can_read_chat_media_object(name, owner)
);

-- Keep upload strictly scoped to auth.uid()/... and expected media MIME types.
DROP POLICY IF EXISTS "owner_upload_chat-media" ON storage.objects;
CREATE POLICY "owner_upload_chat-media"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "owner_update_chat-media" ON storage.objects;
CREATE POLICY "owner_update_chat-media"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "owner_delete_chat-media" ON storage.objects;
CREATE POLICY "owner_delete_chat-media"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[1] = auth.uid()::text
);