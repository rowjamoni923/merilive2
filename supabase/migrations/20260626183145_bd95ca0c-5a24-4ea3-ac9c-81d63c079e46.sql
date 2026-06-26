ALTER TABLE public.group_members DISABLE TRIGGER ALL;

INSERT INTO public.group_members (group_id, user_id, role)
SELECT g.id, COALESCE(g.owner_id, g.created_by), 'owner'
FROM public.groups g
WHERE COALESCE(g.is_active, true) = true
  AND COALESCE(g.owner_id, g.created_by) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.group_members gm
    WHERE gm.group_id = g.id
      AND gm.user_id = COALESCE(g.owner_id, g.created_by)
  )
ON CONFLICT DO NOTHING;

ALTER TABLE public.group_members ENABLE TRIGGER ALL;