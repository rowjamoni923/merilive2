import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";

export interface TopupHistoryEntry {
  id: string;
  created_at: string;
  action_type: string;
  target_type: string | null;
  target_id: string | null;
  /** What was credited: diamonds / coins / beans / wallet_balance / ... */
  field: string;
  /** Positive = credit, negative = debit. Always populated. */
  delta: number;
  old_balance: number | null;
  new_balance: number | null;
  reason: string | null;
  /** Human label for the recipient ("User", "Helper", "Agency"). */
  target_label: string;
  /** Resolved recipient profile (best-effort). */
  user: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    app_uid: string | null;
  } | null;
  /** Extra fallback name when the recipient is a helper / agency. */
  recipient_name: string | null;
}

/**
 * Load every kind of "manual topup" admin action and resolve the recipient.
 *
 * Covers:
 *  - admin_adjust_balance      → action_type='balance_add' / 'balance_deduct'
 *  - AdminHelperDiamondTopup   → action_type='helper_diamond_topup' (target=topup_helper)
 *  - agency balance restore    → action_type='balance_restore' (target=agency)
 */
export async function loadAdminTopupHistory(opts?: {
  /** Restrict to a single field (e.g. 'diamonds'). Default: all. */
  field?: string;
  /** Max rows to return (after filtering). Default 30. */
  limit?: number;
  /** If true, only credits (delta>0). Default true. */
  creditsOnly?: boolean;
}): Promise<TopupHistoryEntry[]> {
  const field = opts?.field;
  const limit = opts?.limit ?? 30;
  const creditsOnly = opts?.creditsOnly ?? true;

  // Fetch a generous slice; we filter client-side because details->>'field'
  // varies and not every action_type writes a 'field' key.
  const { data: rows, error } = await supabase
    .from("admin_logs")
    .select("id, created_at, action_type, target_type, target_id, details")
    .in("action_type", [
      "balance_add",
      "balance_deduct",
      "helper_diamond_topup",
      "balance_restore",
    ])
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !rows) return [];

  const normalized: TopupHistoryEntry[] = [];
  for (const r of rows as any[]) {
    const d = (r.details ?? {}) as Record<string, any>;
    const rawDelta =
      typeof d.delta === "number"
        ? d.delta
        : typeof d.amount === "number"
          ? d.amount
          : Number(d.delta ?? d.amount ?? 0);

    // helper_diamond_topup writes "amount" (always positive credit).
    // balance_restore writes "amount" (positive credit).
    // balance_add/balance_deduct write "delta" (signed).
    let delta: number;
    if (r.action_type === "balance_deduct") {
      delta = -Math.abs(rawDelta);
    } else {
      delta = Math.abs(rawDelta);
    }

    // Resolve the field this action touched.
    let fld: string =
      typeof d.field === "string" && d.field
        ? d.field
        : r.action_type === "helper_diamond_topup"
          ? "wallet_balance"
          : "diamonds";

    if (field && fld !== field) continue;
    if (creditsOnly && delta <= 0) continue;

    const target_label =
      r.target_type === "agency"
        ? "Agency"
        : r.target_type === "topup_helper" || r.target_type === "helper"
          ? "Helper"
          : "User";

    normalized.push({
      id: String(r.id),
      created_at: String(r.created_at),
      action_type: String(r.action_type),
      target_type: r.target_type ?? null,
      target_id: r.target_id ?? null,
      field: fld,
      delta,
      old_balance:
        typeof d.old_balance === "number"
          ? d.old_balance
          : typeof d.previous_balance === "number"
            ? d.previous_balance
            : null,
      new_balance:
        typeof d.new_balance === "number" ? d.new_balance : null,
      reason:
        (typeof d.reason === "string" && d.reason) ||
        (typeof d.note === "string" && d.note) ||
        null,
      target_label,
      user: null,
      recipient_name:
        typeof d.helper_name === "string"
          ? d.helper_name
          : typeof d.agency_name === "string"
            ? d.agency_name
            : null,
    });

    if (normalized.length >= limit) break;
  }

  // Resolve recipient profiles.
  // - profile target_id → profiles row directly
  // - topup_helper target_id → topup_helpers.user_id (or helper_user_id in details)
  // - helper target_id → helper itself (older logs may use this)
  // - agency target_id → agencies.owner_id
  const profileIds = new Set<string>();
  const helperIds = new Set<string>();
  const agencyIds = new Set<string>();
  const helperUserIdFromDetails = new Map<string, string>(); // entry.id -> uid

  for (const e of normalized) {
    if (!e.target_id) continue;
    if (e.target_type === "profile") profileIds.add(e.target_id);
    else if (
      e.target_type === "topup_helper" ||
      e.target_type === "helper"
    ) {
      helperIds.add(e.target_id);
      // helper_diamond_topup also embeds the helper's user_id in details — use it as a fast-path.
      const raw = rows.find((r: any) => String(r.id) === e.id);
      const huid = (raw?.details as any)?.helper_user_id;
      if (typeof huid === "string") {
        helperUserIdFromDetails.set(e.id, huid);
        profileIds.add(huid);
      }
    } else if (e.target_type === "agency") agencyIds.add(e.target_id);
  }

  // Resolve helper.user_id for any helpers without inline details.
  const helperToUser = new Map<string, string>();
  const remainingHelpers = [...helperIds].filter(
    (h) =>
      ![...helperUserIdFromDetails.values()].some(
        (_v) => false /* set lookup below */,
      ),
  );
  if (remainingHelpers.length > 0) {
    const { data: hrows } = await supabase
      .from("topup_helpers")
      .select("id, user_id")
      .in("id", remainingHelpers);
    for (const h of (hrows ?? []) as any[]) {
      if (h?.id && h?.user_id) {
        helperToUser.set(h.id, h.user_id);
        profileIds.add(h.user_id);
      }
    }
  }

  // Resolve agency.owner_id
  const agencyToOwner = new Map<string, string>();
  const agencyMeta = new Map<string, { name: string | null }>();
  if (agencyIds.size > 0) {
    const { data: arows } = await supabase
      .from("agencies")
      .select("id, owner_id, name")
      .in("id", [...agencyIds]);
    for (const a of (arows ?? []) as any[]) {
      if (a?.id) {
        if (a.owner_id) {
          agencyToOwner.set(a.id, a.owner_id);
          profileIds.add(a.owner_id);
        }
        agencyMeta.set(a.id, { name: a?.name ?? null });
      }
    }
  }

  const profileMap = new Map<string, any>();
  if (profileIds.size > 0) {
    const { data: prows } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, app_uid")
      .in("id", [...profileIds]);
    for (const p of (prows ?? []) as any[]) {
      if (p?.id) profileMap.set(p.id, p);
    }
  }

  for (const e of normalized) {
    if (!e.target_id) continue;
    let uid: string | null = null;
    if (e.target_type === "profile") uid = e.target_id;
    else if (
      e.target_type === "topup_helper" ||
      e.target_type === "helper"
    ) {
      uid =
        helperUserIdFromDetails.get(e.id) ??
        helperToUser.get(e.target_id) ??
        null;
    } else if (e.target_type === "agency") {
      uid = agencyToOwner.get(e.target_id) ?? null;
      if (!e.recipient_name) {
        e.recipient_name = agencyMeta.get(e.target_id)?.name ?? null;
      }
    }
    if (uid) {
      const p = profileMap.get(uid);
      if (p) {
        e.user = {
          id: p.id,
          display_name: p.display_name ?? null,
          avatar_url: p.avatar_url ?? null,
          app_uid: p.app_uid ?? null,
        };
      }
    }
  }

  return normalized;
}

export function formatTopupFieldLabel(field: string): string {
  switch (field) {
    case "diamonds":
      return "💎";
    case "diamonds":
      return "🪙";
    case "beans":
      return "🫘";
    case "beans_balance":
      return "🫘";
    case "diamond_balance":
      return "💎";
    case "wallet_balance":
      return "💼";
    default:
      return "";
  }
}
