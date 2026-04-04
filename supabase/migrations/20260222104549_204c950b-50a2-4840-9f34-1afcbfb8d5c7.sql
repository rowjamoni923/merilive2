
ALTER TABLE public.popup_event_banners 
ADD COLUMN skip_delay_seconds integer NOT NULL DEFAULT 4,
ADD COLUMN auto_dismiss_seconds integer NOT NULL DEFAULT 7;
