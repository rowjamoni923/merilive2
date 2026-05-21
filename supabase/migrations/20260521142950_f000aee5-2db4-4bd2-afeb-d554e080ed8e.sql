UPDATE public.live_streams
SET status = 'ended',
    is_active = false,
    ended_at = now()
WHERE id = 'f184607b-bc0f-487d-90ef-20bdc7763460'
  AND (status <> 'ended' OR is_active = true);