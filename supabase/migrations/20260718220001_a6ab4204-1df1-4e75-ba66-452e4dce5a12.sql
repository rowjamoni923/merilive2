-- Managed banners: centralized admin-editable content for hero cards, guideline banners, welcome popups
CREATE TABLE IF NOT EXISTS public.managed_banners (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  section TEXT NOT NULL DEFAULT 'general',
  label TEXT NOT NULL,
  title TEXT,
  subtitle TEXT,
  body_md TEXT,
  image_url TEXT,
  cta_text TEXT,
  cta_url TEXT,
  theme JSONB NOT NULL DEFAULT '{}'::jsonb,
  bullets JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.managed_banners TO anon;
GRANT SELECT ON public.managed_banners TO authenticated;
GRANT ALL ON public.managed_banners TO service_role;

ALTER TABLE public.managed_banners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read active banners"
ON public.managed_banners FOR SELECT
USING (true);

CREATE POLICY "Admins manage managed banners"
ON public.managed_banners FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.tg_managed_banners_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER managed_banners_updated_at
BEFORE UPDATE ON public.managed_banners
FOR EACH ROW EXECUTE FUNCTION public.tg_managed_banners_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.managed_banners;

-- Seed defaults
INSERT INTO public.managed_banners (slug, section, label, title, subtitle, body_md, cta_text, cta_url, theme, bullets) VALUES
('agency_dashboard_guideline', 'agency', 'Agency Dashboard — Guideline Helper',
 'Agency Guidelines',
 'Everything you need to grow your agency',
 'Follow our guidelines to activate hosts, keep commissions healthy, and unlock higher tiers.',
 'Read Full Policy', '/agency-policy',
 '{"accent":"amber","gradient":"from-amber-500/10 via-orange-500/10 to-red-500/10"}'::jsonb,
 '[{"icon":"CheckCircle2","title":"Activate 10 hosts","description":"Within 30 days of creation"},{"icon":"TrendingUp","title":"Grow weekly income","description":"Higher income = higher commission tier"},{"icon":"Shield","title":"Follow rules","description":"Keep hosts verified and compliant"}]'::jsonb),

('payroll_helper_welcome', 'agency', 'Payroll Helper — Welcome Popup',
 'Become a Payroll Helper',
 'Earn commission by processing transactions for our global user base!',
 'As a Payroll Helper you handle top-ups, withdrawals and diamond operations, earning commission on every processed transaction.',
 'Apply Now', NULL,
 '{"accent":"emerald","gradient":"from-warning-50 via-danger-50 to-transparent","badge":"💰 Exclusive Opportunity"}'::jsonb,
 '[{"icon":"Coins","title":"Process Top-ups","description":"Handle user diamond recharge requests"},{"icon":"Gift","title":"Manage Withdrawals","description":"Process agency withdrawal requests"},{"icon":"DollarSign","title":"Diamond Operations","description":"Manage diamond balance transactions"},{"icon":"TrendingUp","title":"Earn Commission","description":"Get % on every transaction you process"},{"icon":"Globe","title":"Global Network","description":"Serve users from multiple countries"},{"icon":"Star","title":"Level Up System","description":"Higher levels = Higher commission rates"}]'::jsonb),

('new_agency_popup', 'agency', 'New Agency — Welcome Popup',
 'Welcome to Your New Agency! 🎉',
 'Your agency is live — let''s get you activated.',
 'Recruit 10 active hosts within 30 days to permanently unlock your agency and start earning weekly commissions.',
 'Invite Hosts', '/agency/hosts',
 '{"accent":"emerald","gradient":"from-emerald-500/15 via-teal-500/15 to-cyan-500/15"}'::jsonb,
 '[{"icon":"Users","title":"Recruit hosts","description":"Send invites from the Hosts tab"},{"icon":"Clock","title":"30-day deadline","description":"Activate 10 hosts to keep your agency"},{"icon":"TrendingUp","title":"Weekly payouts","description":"Earn 3%–20% based on your tier"}]'::jsonb),

('agency_activation_warning', 'agency', 'Agency Activation — Warning Banner',
 'Activation Required',
 NULL,
 'Activate **{REQUIRED_HOSTS} hosts** within 30 days of creation, or the agency will be automatically closed.',
 NULL, NULL,
 '{"accent":"amber","gradient":"from-amber-500/10 via-orange-500/10 to-red-500/10","icon":"AlertTriangle"}'::jsonb,
 '[]'::jsonb),

('agency_closed_notice', 'agency', 'Agency Closed — Notice Banner',
 'Agency Closed',
 NULL,
 'This agency did not activate {REQUIRED_HOSTS} hosts within the 30-day window and has been automatically closed. Please contact support if you believe this is a mistake.',
 NULL, NULL,
 '{"accent":"red","gradient":"from-red-500/10 to-red-700/10","icon":"XCircle"}'::jsonb,
 '[]'::jsonb),

('agency_policy_hero', 'policy', 'Agency Policy — Hero',
 'Agency Policy & Guidelines',
 'Complete rules, commission tiers, and payout terms',
 'Read the full agency policy carefully. Commission rates auto-update from the admin panel.',
 NULL, NULL,
 '{"accent":"violet","gradient":"from-violet-500/10 via-purple-500/10 to-fuchsia-500/10"}'::jsonb,
 '[]'::jsonb),

('agency_commission_hero', 'landing', 'About / Landing — Agency Commission Hero',
 'Agency System',
 'Grow, earn, and lead — 3% to 20% weekly commission',
 'Build your host network and climb the tier ladder. Higher weekly income unlocks higher commission.',
 'Create Agency', '/create-agency',
 '{"accent":"violet","gradient":"from-violet-600 to-fuchsia-600"}'::jsonb,
 '[]'::jsonb),

('create_agency_intro', 'agency', 'Create Agency — Intro',
 'Start Your Agency',
 'Fill in your details to launch a new agency',
 'Once approved, you can invite hosts, track earnings, and receive weekly payouts.',
 NULL, NULL,
 '{"accent":"indigo","gradient":"from-indigo-500/10 to-blue-500/10"}'::jsonb,
 '[]'::jsonb),

('agency_signup_intro', 'agency', 'Agency Signup — Intro',
 'Join as a Sub-Agency',
 'Partner with an existing agency to grow together',
 'Sub-agencies earn commission on their own hosts while contributing to parent agency growth.',
 NULL, NULL,
 '{"accent":"cyan","gradient":"from-cyan-500/10 to-blue-500/10"}'::jsonb,
 '[]'::jsonb),

('payroll_helper_guide_hero', 'helper', 'Payroll Helper Guide — Hero',
 'Payroll Helper Guide',
 'Everything you need to process top-ups and withdrawals',
 'Follow this step-by-step guide to become a top-tier payroll helper.',
 NULL, NULL,
 '{"accent":"emerald","gradient":"from-emerald-500/10 to-teal-500/10"}'::jsonb,
 '[]'::jsonb),

('policy_intro', 'policy', 'Public Policies — Intro',
 'Platform Policies',
 'Read our full terms, guidelines, and community rules',
 'All platform policies are maintained here and update automatically when admins publish changes.',
 NULL, NULL,
 '{"accent":"slate","gradient":"from-slate-500/10 to-slate-700/10"}'::jsonb,
 '[]'::jsonb)
ON CONFLICT (slug) DO NOTHING;