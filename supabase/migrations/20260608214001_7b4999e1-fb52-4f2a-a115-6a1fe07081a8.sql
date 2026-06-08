CREATE TABLE IF NOT EXISTS public.pk_battle_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cue text NOT NULL UNIQUE,
  sound_url text,
  animation_url text,
  animation_type text,
  duration_ms integer,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pk_battle_assets_cue_chk CHECK (
    cue IN ('battle_start','countdown','time_up','victory','defeat','punishment_sticker')
  )
);

GRANT SELECT ON public.pk_battle_assets TO authenticated;
GRANT ALL    ON public.pk_battle_assets TO service_role;

ALTER TABLE public.pk_battle_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read active pk battle assets"
  ON public.pk_battle_assets
  FOR SELECT
  TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins manage pk battle assets"
  ON public.pk_battle_assets
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.pk_battle_assets_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pk_battle_assets_updated_at ON public.pk_battle_assets;
CREATE TRIGGER pk_battle_assets_updated_at
  BEFORE UPDATE ON public.pk_battle_assets
  FOR EACH ROW EXECUTE FUNCTION public.pk_battle_assets_set_updated_at();

INSERT INTO public.pk_battle_assets (cue, is_active, notes) VALUES
  ('battle_start',       true, 'Plays when PK status flips to active. Suggest 1-2s gong + full-screen VAP.'),
  ('countdown',          true, 'Plays at T-3s. Short countdown beeps.'),
  ('time_up',            true, 'Plays at T-0. Buzzer / horn.'),
  ('victory',            true, 'Plays for the winning host only. Full-screen victory VAP + fanfare.'),
  ('defeat',             true, 'Plays for the losing host only. Subtle defeat SFX.'),
  ('punishment_sticker', true, 'Optional sticker (PNG/VAP) overlaid on loser tile during punishment window.')
ON CONFLICT (cue) DO NOTHING;