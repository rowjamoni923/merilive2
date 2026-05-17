import { useEffect, useState } from "react";
import { resolveAdminStorageImageUrl, resolveAdminStorageObjectUrl } from "@/utils/adminStorageImages";

/**
 * Resolves a (possibly private) Supabase Storage URL/path into a signed URL
 * usable by the admin panel. Falls back to the raw value if the input is
 * already a public URL or signed URL that does not need rewriting.
 */
export function useAdminSignedUrl(
  value: string | null | undefined,
  bucket: string = "face-verification",
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    setUrl(null);
    (async () => {
      const resolver = bucket === "face-verification" || bucket === "host-verification"
        ? resolveAdminStorageObjectUrl
        : resolveAdminStorageImageUrl;
      const resolved = await resolver(value, bucket);
      if (!cancelled) setUrl(resolved);
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
  const [urls, setUrls] = useState<string[]>([]);

  useEffect(() => {
    const list = values || [];
    if (list.length === 0) {
      setUrls([]);
      return;
    }
    let cancelled = false;
    setUrls([]);
    (async () => {
      const resolver = bucket === "face-verification" || bucket === "host-verification"
        ? resolveAdminStorageObjectUrl
        : resolveAdminStorageImageUrl;
      const resolved = await Promise.all(
        list.map((v) => resolver(v, bucket)),
      );
      if (!cancelled) setUrls(resolved.map((u) => u || ""));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, bucket]);

  return urls;
}
