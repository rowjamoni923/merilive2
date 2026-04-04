-- Create optimized function to fetch conversations with last message and unread count in ONE query
-- This eliminates the N+1 query problem that was causing slow message loading

CREATE OR REPLACE FUNCTION get_conversations_with_details(p_user_id UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_agg(conv_data ORDER BY last_message_at DESC NULLS LAST)
  INTO result
  FROM (
    SELECT 
      c.id,
      c.participant_1,
      c.participant_2,
      c.last_message_at,
      c.created_at,
      -- Get the other user's profile
      json_build_object(
        'id', p.id,
        'display_name', p.display_name,
        'avatar_url', p.avatar_url,
        'is_online', p.is_online,
        'is_verified', p.is_verified,
        'is_host', p.is_host,
        'gender', p.gender,
        'user_level', p.user_level,
        'country_flag', p.country_flag,
        'country_name', p.country_name,
        'city', p.city,
        'last_seen_at', p.last_seen_at,
        'call_rate_per_minute', p.call_rate_per_minute
      ) AS other_user,
      -- Get last message content (subquery for efficiency)
      (
        SELECT m.content
        FROM messages m
        WHERE m.conversation_id = c.id
        ORDER BY m.created_at DESC
        LIMIT 1
      ) AS last_message,
      -- Get unread count (subquery for efficiency)
      (
        SELECT COUNT(*)::int
        FROM messages m
        WHERE m.conversation_id = c.id
          AND m.is_read = false
          AND m.sender_id != p_user_id
      ) AS unread_count
    FROM conversations c
    LEFT JOIN profiles p ON p.id = CASE 
      WHEN c.participant_1 = p_user_id THEN c.participant_2 
      ELSE c.participant_1 
    END
    WHERE c.participant_1 = p_user_id OR c.participant_2 = p_user_id
  ) conv_data;
  
  RETURN COALESCE(result, '[]'::json);
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_conversations_with_details(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_conversations_with_details(UUID) TO anon;