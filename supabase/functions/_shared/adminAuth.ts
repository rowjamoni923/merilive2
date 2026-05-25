export type AdminSessionUser = {
  id: string;
  user_id: string | null;
  role: "owner" | "sub_admin" | string;
  is_active: boolean;
  email?: string | null;
};

type SupabaseLike = {
  from: (table: string) => any;
};

type Requirement = {
  ownerOnly?: boolean;
  sectionKey?: string;
  requireEdit?: boolean;
};

export async function requireAdminSession(
  req: Request,
  supabase: SupabaseLike,
  requirement: Requirement = {},
): Promise<{ ok: true; admin: AdminSessionUser } | { ok: false; status: number; error: string }> {
  const token = req.headers.get("x-admin-token") || "";
  if (token.length < 16) return { ok: false, status: 401, error: "Admin session required" };

  const { data: session, error: sessionError } = await supabase
    .from("admin_sessions")
    .select("admin_user_id, expires_at, device_fingerprint")
    .eq("session_token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (sessionError) return { ok: false, status: 500, error: "Admin session lookup failed" };
  if (!session?.admin_user_id) return { ok: false, status: 401, error: "Admin session expired" };

  const { data: admin, error: adminError } = await supabase
    .from("admin_users")
    .select("id, user_id, role, is_active, email")
    .eq("id", session.admin_user_id)
    .maybeSingle();

  if (adminError || !admin?.is_active) return { ok: false, status: 403, error: "Admin access required" };

  if (!session.device_fingerprint || session.device_fingerprint.length < 16) {
    return { ok: false, status: 403, error: "Approved admin device required" };
  }

  const { data: device, error: deviceError } = await supabase
    .from("admin_allowed_devices")
    .select("id")
    .eq("admin_user_id", admin.id)
    .eq("device_fingerprint", session.device_fingerprint)
    .eq("status", "approved")
    .maybeSingle();

  if (deviceError) return { ok: false, status: 500, error: "Admin device lookup failed" };
  if (!device?.id) return { ok: false, status: 403, error: "Approved admin device required" };

  if (requirement.ownerOnly && admin.role !== "owner") return { ok: false, status: 403, error: "Owner access required" };

  if (requirement.sectionKey && admin.role !== "owner") {
    const { data: section } = await supabase
      .from("admin_sections")
      .select("id")
      .eq("section_key", requirement.sectionKey)
      .eq("is_active", true)
      .maybeSingle();

    if (!section?.id) return { ok: false, status: 403, error: "Admin section access required" };

    const { data: permission } = await supabase
      .from("admin_section_permissions")
      .select("can_view, can_edit")
      .eq("admin_user_id", admin.id)
      .eq("section_id", section.id)
      .maybeSingle();

    const allowed = requirement.requireEdit ? permission?.can_edit === true : permission?.can_view === true;
    if (!allowed) return { ok: false, status: 403, error: "Insufficient admin section permission" };
  }

  return { ok: true, admin: admin as AdminSessionUser };
}