-- Create error logs table for system monitoring
CREATE TABLE IF NOT EXISTS public.system_error_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  error_type VARCHAR(50) NOT NULL DEFAULT 'error',
  error_message TEXT NOT NULL,
  error_stack TEXT,
  page_url TEXT,
  page_path TEXT,
  component_name TEXT,
  user_id UUID,
  user_agent TEXT,
  browser_info JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  resolution_notes TEXT
);

-- Enable RLS
ALTER TABLE public.system_error_logs ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Admins can view all errors" ON public.system_error_logs;
DROP POLICY IF EXISTS "Anyone can log errors" ON public.system_error_logs;
DROP POLICY IF EXISTS "Admins can update errors" ON public.system_error_logs;
DROP POLICY IF EXISTS "Admins can delete errors" ON public.system_error_logs;

-- Anyone can insert errors (for logging from frontend)
CREATE POLICY "Anyone can log errors"
ON public.system_error_logs
FOR INSERT
WITH CHECK (true);

-- Authenticated users can view errors (admin check in frontend)
CREATE POLICY "Authenticated can view errors"
ON public.system_error_logs
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Authenticated users can update errors
CREATE POLICY "Authenticated can update errors"
ON public.system_error_logs
FOR UPDATE
USING (auth.uid() IS NOT NULL);

-- Authenticated users can delete errors
CREATE POLICY "Authenticated can delete errors"
ON public.system_error_logs
FOR DELETE
USING (auth.uid() IS NOT NULL);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON public.system_error_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_page_path ON public.system_error_logs(page_path);
CREATE INDEX IF NOT EXISTS idx_error_logs_is_resolved ON public.system_error_logs(is_resolved);