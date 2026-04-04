-- =====================================================
-- FIX GROUP_MEMBERS INFINITE RECURSION - CORRECTED
-- =====================================================

-- Drop existing problematic policies on group_members
DROP POLICY IF EXISTS "Group members can view their group members" ON public.group_members;
DROP POLICY IF EXISTS "Group members can view" ON public.group_members;
DROP POLICY IF EXISTS "Members can view group members" ON public.group_members;
DROP POLICY IF EXISTS "Users can view group members" ON public.group_members;

-- Create secure helper function for group member check
CREATE OR REPLACE FUNCTION public.check_group_membership(p_user_id uuid, p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_members
    WHERE user_id = p_user_id
      AND group_id = p_group_id
  )
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.check_group_membership(uuid, uuid) TO authenticated;

-- Create new non-recursive policy for viewing group members
CREATE POLICY "group_members_select_policy" ON public.group_members
FOR SELECT
TO authenticated
USING (
  -- Users can see members of groups they belong to
  public.check_group_membership(auth.uid(), group_id)
  OR 
  -- Admins can see all
  public.is_admin()
);

-- Create policy for inserting group members (using groups table)
CREATE POLICY "group_members_insert_policy" ON public.group_members
FOR INSERT
TO authenticated
WITH CHECK (
  -- Only group owners/admins can add members
  EXISTS (
    SELECT 1 FROM public.groups 
    WHERE id = group_id AND owner_id = auth.uid()
  )
  OR public.is_admin()
);

-- Create policy for deleting group members
CREATE POLICY "group_members_delete_policy" ON public.group_members
FOR DELETE
TO authenticated
USING (
  -- Users can remove themselves
  user_id = auth.uid()
  OR 
  -- Group owners can remove anyone
  EXISTS (
    SELECT 1 FROM public.groups 
    WHERE id = group_id AND owner_id = auth.uid()
  )
  OR public.is_admin()
);