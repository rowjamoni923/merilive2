
-- =========================================================
-- F1: Server-side contact-leak enforcement (DB trigger)
-- =========================================================

-- 1) Detection helper: returns {detected, pattern, masked}
CREATE OR REPLACE FUNCTION public.detect_contact_in_text(p_text text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_norm      text;
  v_digitonly text;
  v_lower     text;
  v_pattern   text := NULL;
  v_masked    text;
  v_keyword_hit text;
BEGIN
  IF p_text IS NULL OR length(btrim(p_text)) = 0 THEN
    RETURN jsonb_build_object('detected', false);
  END IF;

  -- Normalize: fold Bangla / Devanagari / Eastern-Arabic / Urdu numerals -> ASCII digits
  v_norm := translate(
    p_text,
    '০১২৩৪৫৬৭৮৯' ||
    '०१२३४५६७८९' ||
    '٠١٢٣٤٥٦٧٨٩' ||
    '۰۱۲۳۴۵۶۷۸۹' ||
    '０１２３４５６７８９',
    '0123456789' ||
    '0123456789' ||
    '0123456789' ||
    '0123456789' ||
    '0123456789'
  );
  -- Strip zero-width / bidi / BOM chars used for obfuscation
  v_norm := regexp_replace(v_norm, '[\u200B\u200C\u200D\u200E\u200F\u202A\u202B\u202C\u202D\u202E\uFEFF]', '', 'g');

  -- Phone-number heuristic: contiguous run with >=7 digits allowing , . ( ) - space + as separators
  IF v_norm ~ '(\+?\d[\s().+\-]{0,2}){7,}' THEN
    v_digitonly := regexp_replace(v_norm, '\D', '', 'g');
    IF length(v_digitonly) >= 7 THEN
      v_pattern := 'phone_digits';
    END IF;
  END IF;

  -- Keyword heuristic (always check; covers "whatsapp 0 1 7..." styled bypass)
  IF v_pattern IS NULL THEN
    v_lower := lower(v_norm);
    FOR v_keyword_hit IN
      SELECT unnest(ARRAY[
        'whatsapp','whats app','wa.me','viber','telegram','t.me',
        'imo','snapchat','wechat','signal','skype','line id','kakao',
        'হোয়াটসঅ্যাপ','ইমো','নম্বর','ফোন','মোবাইল',
        'व्हाट्सएप','नंबर','फोन','मोबाइल',
        'واتساب','رقم','هاتف','اتصل',
        'نمبر','فون','موبائل'
      ])
    LOOP
      IF position(v_keyword_hit in v_lower) > 0 THEN
        v_pattern := 'contact_keyword';
        EXIT;
      END IF;
    END LOOP;
  END IF;

  IF v_pattern IS NULL THEN
    RETURN jsonb_build_object('detected', false);
  END IF;

  -- Mask digit runs (>=4) and detected keywords with ***
  v_masked := regexp_replace(p_text, '(\+?[\d০-৯०-९٠-٩۰-۹０-９][\s().+\-]?){4,}', '***', 'g');

  RETURN jsonb_build_object(
    'detected', true,
    'pattern',  v_pattern,
    'masked',   v_masked
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_contact_in_text(text) TO authenticated, service_role;


-- 2) Unified BEFORE INSERT trigger function
CREATE OR REPLACE FUNCTION public.tg_enforce_contact_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    v_content     := NEW.content;
    v_sender      := NEW.sender_id;
    v_source_type := 'private_message';
    v_source_id   := NEW.conversation_id::text;
  ELSIF TG_TABLE_NAME = 'party_room_messages' THEN
    -- Skip non-chat rows (gifts etc.)
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

  -- Mask content before persistence (everyone)
  IF TG_TABLE_NAME = 'stream_chat' THEN
    NEW.message := v_detection->>'masked';
  ELSE
    NEW.content := v_detection->>'masked';
  END IF;

  -- Host check
  SELECT COALESCE(is_host, false) INTO v_is_host
    FROM public.profiles WHERE id = v_sender;

  IF NOT COALESCE(v_is_host, false) THEN
    RETURN NEW;
  END IF;

  -- Run server-side penalty pipeline (logs + deducts + may auto-ban)
  BEGIN
    v_result := public.process_contact_violation(
      v_sender,
      left(v_content, 500),
      v_detection->>'pattern',
      v_source_type,
      v_source_id
    );

    -- If host got banned at this step, reject the message entirely
    IF COALESCE((v_result->>'is_banned')::boolean, false) THEN
      RAISE EXCEPTION 'Account banned for repeated contact-sharing violations'
        USING ERRCODE = 'P0001';
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLSTATE = 'P0001' THEN
        RAISE;
      END IF;
      -- Never let logging failures drop user messages
      RAISE WARNING 'tg_enforce_contact_guard: % / %', SQLSTATE, SQLERRM;
  END;

  RETURN NEW;
END;
$$;


-- 3) Wire triggers (idempotent)
DROP TRIGGER IF EXISTS tg_contact_guard_messages           ON public.messages;
DROP TRIGGER IF EXISTS tg_contact_guard_party_room_messages ON public.party_room_messages;
DROP TRIGGER IF EXISTS tg_contact_guard_stream_chat        ON public.stream_chat;

CREATE TRIGGER tg_contact_guard_messages
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_contact_guard();

CREATE TRIGGER tg_contact_guard_party_room_messages
  BEFORE INSERT ON public.party_room_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_contact_guard();

CREATE TRIGGER tg_contact_guard_stream_chat
  BEFORE INSERT ON public.stream_chat
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_contact_guard();
