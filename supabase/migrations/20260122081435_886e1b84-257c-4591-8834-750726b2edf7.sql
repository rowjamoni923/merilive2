-- Create feature level requirements table
CREATE TABLE public.feature_level_requirements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feature_key TEXT NOT NULL UNIQUE,
  feature_name TEXT NOT NULL,
  feature_description TEXT,
  min_level_user INTEGER NOT NULL DEFAULT 1,
  min_level_host INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  icon_name TEXT,
  category TEXT DEFAULT 'general',
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.feature_level_requirements ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read (for checking requirements)
CREATE POLICY "Anyone can view feature requirements" 
ON public.feature_level_requirements 
FOR SELECT 
USING (true);

-- Allow authenticated users to modify (admin check done in frontend)
CREATE POLICY "Authenticated users can manage feature requirements" 
ON public.feature_level_requirements 
FOR ALL 
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

-- Insert default feature requirements
INSERT INTO public.feature_level_requirements (feature_key, feature_name, feature_description, min_level_user, min_level_host, icon_name, category, display_order) VALUES
('go_live', 'Go Live (লাইভ স্ট্রিম)', 'লাইভ স্ট্রিম শুরু করার জন্য প্রয়োজনীয় লেভেল', 6, 0, 'Video', 'streaming', 1),
('create_party', 'Create Party Room', 'নতুন পার্টি রুম তৈরি করার জন্য প্রয়োজনীয় লেভেল', 5, 0, 'Users', 'party', 2),
('join_party', 'Join Party Room', 'পার্টি রুমে জয়েন করার জন্য প্রয়োজনীয় লেভেল', 3, 0, 'UserPlus', 'party', 3),
('private_call', 'Private Call', 'প্রাইভেট কল করার জন্য প্রয়োজনীয় লেভেল', 2, 0, 'Phone', 'communication', 4),
('send_gift', 'Send Gifts', 'গিফট পাঠানোর জন্য প্রয়োজনীয় লেভেল', 1, 0, 'Gift', 'gifts', 5),
('chat_message', 'Chat in Live', 'লাইভ স্ট্রিমে চ্যাট করার জন্য প্রয়োজনীয় লেভেল', 1, 0, 'MessageCircle', 'communication', 6);

-- Create trigger for updated_at
CREATE TRIGGER update_feature_level_requirements_updated_at
BEFORE UPDATE ON public.feature_level_requirements
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();