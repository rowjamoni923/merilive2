
-- Table to store admin-approved external links/domains
CREATE TABLE public.allowed_external_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url_pattern TEXT NOT NULL,
  link_type TEXT NOT NULL DEFAULT 'domain' CHECK (link_type IN ('domain', 'exact_url', 'prefix')),
  label TEXT NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  is_active BOOLEAN DEFAULT true,
  added_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.allowed_external_links ENABLE ROW LEVEL SECURITY;

-- Only admins can manage, but all authenticated users can read (for link guard)
CREATE POLICY "Anyone can read allowed links"
  ON public.allowed_external_links
  FOR SELECT
  USING (true);

CREATE POLICY "Only admins can insert allowed links"
  ON public.allowed_external_links
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Only admins can update allowed links"
  ON public.allowed_external_links
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Only admins can delete allowed links"
  ON public.allowed_external_links
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)
  );

-- Index for fast lookups
CREATE INDEX idx_allowed_external_links_active ON public.allowed_external_links(is_active) WHERE is_active = true;
CREATE INDEX idx_allowed_external_links_pattern ON public.allowed_external_links(url_pattern);

-- Trigger for updated_at
CREATE TRIGGER update_allowed_external_links_updated_at
  BEFORE UPDATE ON public.allowed_external_links
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default allowed links
INSERT INTO public.allowed_external_links (url_pattern, link_type, label, category, description) VALUES
  ('merilive.com', 'domain', 'MeriLive Website', 'internal', 'Our own domain - all pages allowed'),
  ('play.google.com', 'domain', 'Google Play Store', 'store', 'App download and updates'),
  ('bkash.com', 'domain', 'bKash Payment', 'payment', 'bKash payment gateway'),
  ('nagad.com.bd', 'domain', 'Nagad Payment', 'payment', 'Nagad payment gateway'),
  ('paypal.com', 'domain', 'PayPal', 'payment', 'PayPal payment gateway'),
  ('stripe.com', 'domain', 'Stripe', 'payment', 'Stripe payment gateway'),
  ('sslcommerz.com', 'domain', 'SSLCommerz', 'payment', 'SSLCommerz payment gateway');
