-- Pkg351b restore screenshot owner admin link as the active owner override
INSERT INTO public.admin_token_overrides (kind, token, rotated_by, rotated_at, rotated_year)
VALUES ('owner', 'gala-royal-velvet-2026-aurora-200a52bd', NULL, now(), 2026)
ON CONFLICT (kind) DO UPDATE
SET token = EXCLUDED.token,
    rotated_by = EXCLUDED.rotated_by,
    rotated_at = EXCLUDED.rotated_at,
    rotated_year = EXCLUDED.rotated_year
WHERE public.admin_token_overrides.kind = 'owner';