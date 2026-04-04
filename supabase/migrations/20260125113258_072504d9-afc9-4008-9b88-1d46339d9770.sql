-- Update the trigger function to handle returning viewers
CREATE OR REPLACE FUNCTION public.update_stream_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment viewer count for new viewer
    UPDATE public.live_streams
    SET viewer_count = COALESCE(viewer_count, 0) + 1
    WHERE id = NEW.stream_id;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.left_at IS NOT NULL AND OLD.left_at IS NULL THEN
      -- Decrement viewer count when viewer leaves
      UPDATE public.live_streams
      SET viewer_count = GREATEST(COALESCE(viewer_count, 0) - 1, 0)
      WHERE id = NEW.stream_id;
    ELSIF NEW.left_at IS NULL AND OLD.left_at IS NOT NULL THEN
      -- Increment viewer count when viewer returns (left_at was set, now null)
      UPDATE public.live_streams
      SET viewer_count = COALESCE(viewer_count, 0) + 1
      WHERE id = NEW.stream_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;