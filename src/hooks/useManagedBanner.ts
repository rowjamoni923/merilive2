import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ManagedBannerBullet = {
  icon?: string;
  title: string;
  description?: string;
};

export type ManagedBanner = {
  id: string;
  slug: string;
  section: string;
  label: string;
  title: string | null;
  subtitle: string | null;
  body_md: string | null;
  image_url: string | null;
  cta_text: string | null;
  cta_url: string | null;
  theme: Record<string, any>;
  bullets: ManagedBannerBullet[];
  is_active: boolean;
  updated_at: string;
};

/**
 * Load an admin-managed banner by slug with realtime updates.
 * Returns the fallback (usually the hardcoded defaults) until DB row loads.
 * If the row is inactive, returns null so callers can hide the banner.
 */
export function useManagedBanner(
  slug: string,
  fallback?: Partial<ManagedBanner>,
): ManagedBanner | null {
  const [banner, setBanner] = useState<ManagedBanner | null>(
    fallback ? ({ slug, ...fallback } as ManagedBanner) : null,
  );

  useEffect(() => {
    let mounted = true;

    const apply = (row: any) => {
      if (!mounted) return;
      if (!row) return;
      if (row.is_active === false) {
        setBanner(null);
        return;
      }
      setBanner({
        ...(fallback as any),
        ...row,
        theme: row.theme ?? fallback?.theme ?? {},
        bullets: Array.isArray(row.bullets)
          ? row.bullets
          : (fallback?.bullets ?? []),
      } as ManagedBanner);
    };

    supabase
      .from("managed_banners")
      .select("*")
      .eq("slug", slug)
      .maybeSingle()
      .then(({ data }) => apply(data));

    const channel = supabase
      .channel(`managed_banner_${slug}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "managed_banners",
          filter: `slug=eq.${slug}`,
        },
        (payload) => apply(payload.new),
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  return banner;
}
