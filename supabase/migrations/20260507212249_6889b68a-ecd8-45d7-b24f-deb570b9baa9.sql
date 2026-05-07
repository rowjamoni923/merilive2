CREATE TABLE IF NOT EXISTS public.support_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  label text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.help_articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_slug text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  is_published boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_help_articles_category ON public.help_articles (category_slug);
CREATE INDEX IF NOT EXISTS idx_help_articles_published ON public.help_articles (is_published) WHERE is_published = true;

ALTER TABLE public.support_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active support categories" ON public.support_categories;
CREATE POLICY "Anyone can read active support categories"
  ON public.support_categories FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS "Anyone can read published help articles" ON public.help_articles;
CREATE POLICY "Anyone can read published help articles"
  ON public.help_articles FOR SELECT TO authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS "Admins manage support categories" ON public.support_categories;
CREATE POLICY "Admins manage support categories"
  ON public.support_categories FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins manage help articles" ON public.help_articles;
CREATE POLICY "Admins manage help articles"
  ON public.help_articles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

GRANT SELECT ON public.support_categories TO authenticated;
GRANT SELECT ON public.help_articles TO authenticated;

INSERT INTO public.support_categories (slug, label, display_order, is_active)
VALUES
  ('account', 'Account', 10, true),
  ('recharge', 'Recharge', 20, true),
  ('calls', 'Calls', 30, true),
  ('agency', 'Agency', 40, true),
  ('withdraw', 'Withdraw', 50, true),
  ('other', 'Other', 90, true)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.help_articles (category_slug, title, body, is_published, display_order)
SELECT 'account', 'Reset password', 'Open Settings → Change password. You need a verified email on your account.', true, 1
WHERE NOT EXISTS (SELECT 1 FROM public.help_articles WHERE title = 'Reset password' LIMIT 1);

INSERT INTO public.help_articles (category_slug, title, body, is_published, display_order)
SELECT 'recharge', 'Diamond recharge failed', 'Check your payment method and try again from the Recharge screen. Keep your receipt.', true, 2
WHERE NOT EXISTS (SELECT 1 FROM public.help_articles WHERE title = 'Diamond recharge failed' LIMIT 1);

INSERT INTO public.help_articles (category_slug, title, body, is_published, display_order)
SELECT 'calls', 'Call drops or poor quality', 'Ensure a stable network, close background apps, and retry the call. Priority agents can help with refunds when eligible.', true, 3
WHERE NOT EXISTS (SELECT 1 FROM public.help_articles WHERE title = 'Call drops or poor quality' LIMIT 1);