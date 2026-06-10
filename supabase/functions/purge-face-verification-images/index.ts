/**
 * purge-face-verification-images
 *
 * R2-H10 (R2-Phase E Wave-2). Daily cron-only purge job.
 *
 * Industry rule (EDPB 2024 + Onfido / Persona TOS): once a biometric
 * verification decision is FINAL, the raw face images must be deleted
 * within 7 days. We keep the row + ai_analysis for audit, but we
 * (a) delete every storage object under the `face-verification` bucket
 *     that belongs to a submission older than 7 days with a terminal
 *     status (`approved`, `rejected`, `expired`), and
 * (b) NULL the *_url columns on those rows + stamp `images_purged_at` so
 *     admin tooling can tell the difference between "never uploaded"
 *     and "deleted by retention policy".
 *
 * Invoked by a server-side cron with the shared CRON_SECRET header. No
 * user JWT, no CORS — server-to-server only.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PURGE_AFTER_DAYS = 7;
const BUCKET = "face-verification";
const FINAL_STATUSES = ["approved", "rejected", "expired"] as const;
const URL_COLS = [
  "front_url",
  "left_url",
  "right_url",
  "selfie_url",
  "face_image_url",
  "profile_photo_url",
  "video_url",
] as const;

function parseStoragePath(url: string): string | null {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^\/]+)\/(.+)$/);
    if (!m) return null;
    if (decodeURIComponent(m[1]) !== BUCKET) return null;
    return decodeURIComponent(m[2]);
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method !== "POST" && req.method !== "GET") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }

  const ENV_CRON_SECRET = Deno.env.get("CRON_SECRET");
  const header = req.headers.get("x-cron-secret") || req.headers.get("x-internal-secret");
  if (!ENV_CRON_SECRET || header !== ENV_CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const cutoff = new Date(Date.now() - PURGE_AFTER_DAYS * 86_400_000).toISOString();
  const selectCols = ["id", "user_id", "status", "created_at", "updated_at", ...URL_COLS].join(",");

  // Page through in batches of 200 — face_verification_submissions can grow
  // large and we don't want to hold a 30-day backlog in memory.
  const PAGE = 200;
  let processed = 0;
  let storageDeleted = 0;
  let rowsCleared = 0;
  const errors: string[] = [];

  for (let offset = 0; offset < 20_000; offset += PAGE) {
    const { data: rows, error } = await admin
      .from("face_verification_submissions")
      .select(selectCols)
      .in("status", FINAL_STATUSES as unknown as string[])
      .is("images_purged_at", null)
      .lt("updated_at", cutoff)
      .order("updated_at", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) {
      errors.push(`select_failed:${error.message}`);
      break;
    }
    if (!rows || rows.length === 0) break;

    for (const row of rows as Record<string, unknown>[]) {
      processed += 1;
      const objectPaths: string[] = [];
      for (const col of URL_COLS) {
        const v = row[col];
        if (typeof v === "string" && v) {
          const p = parseStoragePath(v);
          if (p) objectPaths.push(p);
        }
      }

      if (objectPaths.length > 0) {
        const { error: delErr } = await admin.storage.from(BUCKET).remove(objectPaths);
        if (delErr) {
          errors.push(`storage_remove_failed:${row.id}:${delErr.message}`);
          // Don't NULL the URL columns if storage delete failed — we want
          // the next cron run to retry.
          continue;
        }
        storageDeleted += objectPaths.length;
      }

      const patch: Record<string, unknown> = { images_purged_at: new Date().toISOString() };
      for (const col of URL_COLS) {
        if (col === "selfie_url") continue; // NOT NULL column — leave intact
        patch[col] = null;
      }
      const { error: updErr } = await admin
        .from("face_verification_submissions")
        .update(patch)
        .eq("id", row.id as string);
      if (updErr) {
        errors.push(`row_update_failed:${row.id}:${updErr.message}`);
      } else {
        rowsCleared += 1;
      }
    }

    if (rows.length < PAGE) break;
  }

  return new Response(
    JSON.stringify({
      ok: errors.length === 0,
      cutoff,
      processed,
      storageDeleted,
      rowsCleared,
      errors: errors.slice(0, 20),
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
