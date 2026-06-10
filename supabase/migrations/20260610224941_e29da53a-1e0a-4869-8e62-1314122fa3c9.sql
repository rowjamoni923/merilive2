CREATE OR REPLACE FUNCTION public.tg_enforce_contact_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_content     text;
  v_sender      uuid;
  v_source_type text;
  v_source_id   text;
  v_detection   jsonb;
  v_is_host     boolean := false;
  v_result      jsonb;
BEGIN
  -- Per-table field mapping
  IF TG_TABLE_NAME = 'messages' THEN
    -- Skip non-text rows (gifts, images, videos, audio, voice, system etc.)
    -- Their content is structured payload (URLs, [Gift: ...]) and must NOT
    -- have digits replaced with *** by the contact guard.
    IF NEW.message_type IS DISTINCT FROM 'chat' AND NEW.message_type IS DISTINCT FROM 'text' THEN
      RETURN NEW;
    END IF;
    v_content     := NEW.content;
    v_sender      := NEW.sender_id;
    v_source_type := 'private_message';
    v_source_id   := NEW.conversation_id::text;
  ELSIF TG_TABLE_NAME = 'party_room_messages' THEN
    IF NEW.message_type IS DISTINCT FROM 'chat' AND NEW.message_type IS DISTINCT FROM 'text' THEN
      RETURN NEW;
    END IF;
    v_content     := NEW.content;
    v_sender      := NEW.user_id;
    v_source_type := 'party_chat';
    v_source_id   := NEW.room_id::text;
  ELSIF TG_TABLE_NAME = 'stream_chat' THEN
    IF NEW.message_type IS DISTINCT FROM 'chat' AND NEW.message_type IS DISTINCT FROM 'text' THEN
      RETURN NEW;
    END IF;
    v_content     := NEW.message;
    v_sender      := NEW.user_id;
    v_source_type := 'live_stream';
    v_source_id   := NEW.stream_id::text;
  ELSE
    RETURN NEW;
  END IF;

  IF v_content IS NULL OR v_sender IS NULL THEN
    RETURN NEW;
  END IF;

  v_detection := public.detect_contact_in_text(v_content);
  IF NOT COALESCE((v_detection->>'detected')::boolean, false) THEN
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'stream_chat' THEN
    NEW.message := v_detection->>'masked';
  ELSE
    NEW.content := v_detection->>'masked';
  END IF;

  SELECT COALESCE(is_host, false) INTO v_is_host
    FROM public.profiles WHERE id = v_sender;

  IF NOT COALESCE(v_is_host, false) THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_result := public.process_contact_violation(
      v_sender,
      left(v_content, 500),
      v_detection->>'pattern',
      v_source_type,
      v_source_id
    );

    IF COALESCE((v_result->>'is_banned')::boolean, false) THEN
      RAISE EXCEPTION 'Account banned for repeated contact-sharing violations'
        USING ERRCODE = 'P0001';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE = 'P0001' THEN
        RAISE;
      END IF;
      RAISE WARNING 'tg_enforce_contact_guard: % / %', SQLSTATE, SQLERRM;
  END;

  RETURN NEW;
END;
$function$;