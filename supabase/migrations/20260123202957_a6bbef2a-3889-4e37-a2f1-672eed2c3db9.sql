-- Create role frames table to store frames for different roles
CREATE TABLE public.role_frames (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  role_type TEXT NOT NULL CHECK (role_type IN ('admin', 'agency_owner', 'helper', 'payroll', 'moderator', 'vip')),
  frame_name TEXT NOT NULL,
  frame_url TEXT NOT NULL,
  animation_type TEXT DEFAULT 'svga',
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- Auto-assign to new users of this role
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create user role frames assignment table
CREATE TABLE public.user_role_frames (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  frame_id UUID NOT NULL REFERENCES public.role_frames(id) ON DELETE CASCADE,
  role_type TEXT NOT NULL,
  assigned_by UUID REFERENCES public.profiles(id),
  assigned_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_equipped BOOLEAN DEFAULT false,
  notes TEXT,
  UNIQUE(user_id, frame_id)
);

-- Enable RLS
ALTER TABLE public.role_frames ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_role_frames ENABLE ROW LEVEL SECURITY;

-- RLS Policies for role_frames (admins can manage, authenticated can view active)
CREATE POLICY "Admins can manage role frames"
ON public.role_frames
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view active role frames"
ON public.role_frames
FOR SELECT
USING (is_active = true);

-- RLS Policies for user_role_frames
CREATE POLICY "Users can view their own role frames"
ON public.user_role_frames
FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all role frame assignments"
ON public.user_role_frames
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Function to auto-assign default role frames when a user gets a role
CREATE OR REPLACE FUNCTION public.auto_assign_role_frame()
RETURNS TRIGGER AS $$
DECLARE
  default_frame_id UUID;
  v_role_type TEXT;
BEGIN
  -- Determine role type based on context
  IF TG_TABLE_NAME = 'agencies' THEN
    v_role_type := 'agency_owner';
    -- Assign default agency frame to owner
    SELECT id INTO default_frame_id FROM public.role_frames 
    WHERE role_type = 'agency_owner' AND is_default = true AND is_active = true
    LIMIT 1;
    
    IF default_frame_id IS NOT NULL AND NEW.owner_id IS NOT NULL THEN
      INSERT INTO public.user_role_frames (user_id, frame_id, role_type, notes)
      VALUES (NEW.owner_id, default_frame_id, 'agency_owner', 'Auto-assigned on agency creation')
      ON CONFLICT (user_id, frame_id) DO NOTHING;
    END IF;
    
  ELSIF TG_TABLE_NAME = 'topup_helpers' THEN
    v_role_type := 'helper';
    -- Assign default helper frame
    SELECT id INTO default_frame_id FROM public.role_frames 
    WHERE role_type = 'helper' AND is_default = true AND is_active = true
    LIMIT 1;
    
    IF default_frame_id IS NOT NULL AND NEW.user_id IS NOT NULL THEN
      INSERT INTO public.user_role_frames (user_id, frame_id, role_type, notes)
      VALUES (NEW.user_id, default_frame_id, 'helper', 'Auto-assigned as topup helper')
      ON CONFLICT (user_id, frame_id) DO NOTHING;
    END IF;
    
  ELSIF TG_TABLE_NAME = 'user_roles' THEN
    -- Assign admin frame to admins
    IF NEW.role = 'admin' THEN
      SELECT id INTO default_frame_id FROM public.role_frames 
      WHERE role_type = 'admin' AND is_default = true AND is_active = true
      LIMIT 1;
      
      IF default_frame_id IS NOT NULL THEN
        INSERT INTO public.user_role_frames (user_id, frame_id, role_type, notes)
        VALUES (NEW.user_id, default_frame_id, 'admin', 'Auto-assigned as admin')
        ON CONFLICT (user_id, frame_id) DO NOTHING;
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Triggers for auto-assignment
CREATE TRIGGER trigger_auto_assign_agency_frame
  AFTER INSERT ON public.agencies
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_role_frame();

CREATE TRIGGER trigger_auto_assign_helper_frame
  AFTER INSERT ON public.topup_helpers
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_role_frame();

CREATE TRIGGER trigger_auto_assign_admin_frame
  AFTER INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_assign_role_frame();

-- Create indexes for performance
CREATE INDEX idx_role_frames_role_type ON public.role_frames(role_type);
CREATE INDEX idx_role_frames_active ON public.role_frames(is_active);
CREATE INDEX idx_user_role_frames_user ON public.user_role_frames(user_id);
CREATE INDEX idx_user_role_frames_frame ON public.user_role_frames(frame_id);
CREATE INDEX idx_user_role_frames_equipped ON public.user_role_frames(is_equipped);

-- Updated at trigger
CREATE TRIGGER update_role_frames_updated_at
  BEFORE UPDATE ON public.role_frames
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();