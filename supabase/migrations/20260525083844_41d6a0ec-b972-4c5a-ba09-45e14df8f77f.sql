-- Fix group creator owner membership policy after group hardening
DROP POLICY IF EXISTS "group_members_join_active_groups" ON public.group_members;

CREATE POLICY "group_members_join_active_groups"
ON public.group_members
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.groups g
    WHERE g.id = group_id
      AND COALESCE(g.is_active, true) = true
  )
  AND (
    role = 'member'
    OR EXISTS (
      SELECT 1 FROM public.groups g
      WHERE g.id = group_id
        AND COALESCE(g.created_by, g.owner_id) = auth.uid()
        AND role IN ('owner', 'admin')
    )
    OR public.is_admin(auth.uid())
    OR public.is_active_admin_session()
  )
);