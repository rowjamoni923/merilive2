
-- Create host_contact_violations table for Contact Sharing tab
CREATE TABLE public.host_contact_violations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  host_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  violation_number INTEGER NOT NULL DEFAULT 1,
  violation_type TEXT NOT NULL DEFAULT 'contact_sharing',
  detected_content TEXT NOT NULL DEFAULT '',
  detected_pattern TEXT NOT NULL DEFAULT 'phone_number',
  source_type TEXT NOT NULL DEFAULT 'chat',
  source_id TEXT,
  beans_deducted INTEGER NOT NULL DEFAULT 0,
  is_auto_detected BOOLEAN NOT NULL DEFAULT true,
  is_reviewed BOOLEAN NOT NULL DEFAULT false,
  reviewed_by UUID REFERENCES public.profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.host_contact_violations ENABLE ROW LEVEL SECURITY;

-- Admin access policy (admin_users check)
CREATE POLICY "Admins can manage contact violations"
  ON public.host_contact_violations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

-- Index for fast lookups
CREATE INDEX idx_host_contact_violations_host_id ON public.host_contact_violations(host_id);
CREATE INDEX idx_host_contact_violations_created_at ON public.host_contact_violations(created_at DESC);
