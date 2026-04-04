
-- Table for host conversion requests (when rejected users message admin to convert)
CREATE TABLE public.host_conversion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_response TEXT,
  admin_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.host_conversion_requests ENABLE ROW LEVEL SECURITY;

-- Users can create their own requests
CREATE POLICY "Users can create own requests"
  ON public.host_conversion_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own requests
CREATE POLICY "Users can view own requests"
  ON public.host_conversion_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admin policy via security definer function
CREATE POLICY "Admins can view all requests"
  ON public.host_conversion_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE POLICY "Admins can update requests"
  ON public.host_conversion_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid() AND is_active = true)
  );

CREATE INDEX idx_host_conversion_requests_status ON public.host_conversion_requests(status);
CREATE INDEX idx_host_conversion_requests_user_id ON public.host_conversion_requests(user_id);
