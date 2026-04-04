-- Create groups table
CREATE TABLE public.groups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  avatar_url TEXT,
  group_type TEXT NOT NULL DEFAULT 'basic', -- 'basic' or 'family'
  group_code TEXT NOT NULL UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  owner_id UUID NOT NULL REFERENCES public.profiles(id),
  member_count INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create group members table
CREATE TABLE public.group_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id),
  role TEXT DEFAULT 'member', -- 'owner', 'admin', 'member'
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Create group messages table
CREATE TABLE public.group_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id),
  content TEXT NOT NULL,
  message_type TEXT DEFAULT 'text',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

-- Groups policies
CREATE POLICY "Anyone can view active groups"
ON public.groups FOR SELECT
USING (is_active = true);

CREATE POLICY "Authenticated users can create groups"
ON public.groups FOR INSERT
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners can update their groups"
ON public.groups FOR UPDATE
USING (auth.uid() = owner_id);

CREATE POLICY "Owners can delete their groups"
ON public.groups FOR DELETE
USING (auth.uid() = owner_id);

-- Group members policies
CREATE POLICY "Members can view group members"
ON public.group_members FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.group_members gm 
  WHERE gm.group_id = group_members.group_id 
  AND gm.user_id = auth.uid()
));

CREATE POLICY "Users can join groups"
ON public.group_members FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave groups"
ON public.group_members FOR DELETE
USING (auth.uid() = user_id OR EXISTS (
  SELECT 1 FROM public.groups g 
  WHERE g.id = group_members.group_id 
  AND g.owner_id = auth.uid()
));

-- Group messages policies
CREATE POLICY "Members can view group messages"
ON public.group_messages FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.group_members gm 
  WHERE gm.group_id = group_messages.group_id 
  AND gm.user_id = auth.uid()
));

CREATE POLICY "Members can send messages"
ON public.group_messages FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.group_members gm 
  WHERE gm.group_id = group_messages.group_id 
  AND gm.user_id = auth.uid()
) AND auth.uid() = sender_id);

-- Function to update member count
CREATE OR REPLACE FUNCTION public.update_group_member_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.groups SET member_count = member_count + 1 WHERE id = NEW.group_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.groups SET member_count = GREATEST(member_count - 1, 0) WHERE id = OLD.group_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Trigger for member count
CREATE TRIGGER update_group_member_count_trigger
AFTER INSERT OR DELETE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.update_group_member_count();

-- Function to search groups by code
CREATE OR REPLACE FUNCTION public.search_group_by_code(_group_code TEXT)
RETURNS TABLE(id UUID, name TEXT, avatar_url TEXT, member_count INTEGER, group_type TEXT, owner_name TEXT, owner_avatar TEXT)
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT 
    g.id,
    g.name,
    g.avatar_url,
    g.member_count,
    g.group_type,
    p.display_name as owner_name,
    p.avatar_url as owner_avatar
  FROM public.groups g
  LEFT JOIN public.profiles p ON g.owner_id = p.id
  WHERE g.group_code ILIKE '%' || _group_code || '%'
  AND g.is_active = true
  LIMIT 10;
$$;