import { useEffect, useState } from "react";
import { resolveAdminStorageImageUrl, resolveAdminStorageObjectUrl, tryResolvePublicAdminStorageUrlSync } from "@/utils/adminStorageImages";

/**
 * Resolves a (possibly private) Supabase Storage URL/path into a signed URL
 * usable by the admin panel. Falls back to the raw value if the input is
 * already a public URL or signed URL that does not need rewriting.
 */
export function useAdminSignedUrl(
  value: string | null | undefined,
  bucket: string = "face-verification",
): string | null {
  const [url, setUrl] = useState<string | null>(() => tryResolvePublicAdminStorageUrlSync(value, bucket) || null);

  useEffect(() => {
    if (!value) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    const syncUrl = tryResolvePublicAdminStorageUrlSync(value, bucket);
    setUrl(syncUrl);
    (async () => {
      const resolver = bucket === "face-verification" || bucket === "host-verification"
        ? resolveAdminStorageObjectUrl
        : resolveAdminStorageImageUrl;
      const resolved = await resolver(value, bucket);
      if (!cancelled) setUrl(resolved || syncUrl || null);
    })();
    return () => {
      cancelled = true;
    };
  }, [value, bucket]);

  return url;
}

/**
 * Resolves an array of storage URLs/paths in parallel.
 */
export function useAdminSignedUrls(
  values: (string | null | undefined)[] | null | undefined,
  bucket: string = "face-verification",
): string[] {
  const key = (values || []).join("|");
  const [urls, setUrls] = useState<string[]>(() => (values || []).map((v) => tryResolvePublicAdminStorageUrlSync(v, bucket) || ""));

  useEffect(() => {
    const list = values || [];
    if (list.length === 0) {
      setUrls([]);
      return;
    }
    let cancelled = false;
    const syncUrls = list.map((v) => tryResolvePublicAdminStorageUrlSync(v, bucket) || "");
    setUrls(syncUrls);
    (async () => {
      const resolver = bucket === "face-verification" || bucket === "host-verification"
        ? resolveAdminStorageObjectUrl
        : resolveAdminStorageImageUrl;
      const resolved = await Promise.all(
        list.map((v) => resolver(v, bucket)),
      );
      if (!cancelled) setUrls(resolved.map((u, i) => u || syncUrls[i] || ""));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, bucket]);

  return urls;
}
