
CREATE OR REPLACE FUNCTION public.get_popular_gift_assets(_limit int DEFAULT 25)
RETURNS TABLE (
  gift_id uuid,
  svga_url text,
  lottie_url text,
  animation_url text,
  icon_url text,
  preview_url text,
  rank_score bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounded AS (
    SELECT GREATEST(1, LEAST(COALESCE(_limit, 25), 100)) AS n
  ),
  recent AS (
    SELECT gt.gift_id, COUNT(*)::bigint AS sends
    FROM public.gift_transactions gt
    WHERE gt.created_at > now() - interval '7 days'
      AND gt.gift_id IS NOT NULL
    GROUP BY gt.gift_id
  )
  SELECT
    g.id AS gift_id,
    g.svga_url,
    g.lottie_url,
    g.animation_url,
    g.icon_url,
    g.preview_url,
    COALESCE(r.sends, 0) AS rank_score
  FROM public.gifts g
  LEFT JOIN recent r ON r.gift_id = g.id
  WHERE g.is_active = true
  ORDER BY
    COALESCE(r.sends, 0) DESC,
    COALESCE(g.display_order, 2147483647) ASC,
    g.created_at DESC NULLS LAST
  LIMIT (SELECT n FROM bounded);
$$;

REVOKE ALL ON FUNCTION public.get_popular_gift_assets(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_popular_gift_assets(int) TO anon, authenticated, service_role;
