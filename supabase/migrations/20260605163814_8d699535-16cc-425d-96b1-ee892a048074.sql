-- Pkg423: notifications table missing PRIMARY KEY → Supabase Realtime
-- could not compute row identity → every INSERT delivered empty payload {}
-- with "Error 400: Bad Request, no primary key" + flooded console + the
-- useNotifications subscriber created ghost rows on every notification.
-- Adding PK on the existing uuid id column (no dupes, no NULLs verified)
-- and switching to REPLICA IDENTITY DEFAULT so realtime payloads carry full
-- row data instantly.
ALTER TABLE public.notifications ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);
ALTER TABLE public.notifications REPLICA IDENTITY DEFAULT;