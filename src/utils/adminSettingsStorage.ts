import { adminSupabase } from "@/integrations/supabase/adminClient";

type Primitive = string | number | boolean | null;
type SettingValue = Primitive | Record<string, unknown> | Array<unknown>;

const serializeSettingValue = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null) return "null";
  return JSON.stringify(value);
};

export const parseSettingValue = <T = unknown>(value: unknown): T | null => {
  if (value === null || value === undefined) return null;

  if (typeof value !== "string") {
    return value as T;
  }

  const trimmed = value.trim();
  if (!trimmed) return "" as T;

  if (trimmed === "true") return true as T;
  if (trimmed === "false") return false as T;
  if (trimmed === "null") return null;

  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      return value as T;
    }
  }

  return value as T;
};

export const loadAppSetting = async <T = unknown>(key: string): Promise<T | null> => {
  const { data, error } = await adminSupabase
    .from("app_settings")
    .select("setting_value")
    .eq("setting_key", key)
    .maybeSingle();

  if (error) throw error;

  return parseSettingValue<T>(data?.setting_value);
};

export const loadAppSettingsByPrefix = async <T = unknown>(prefix: string) => {
  const { data, error } = await adminSupabase
    .from("app_settings")
    .select("id, setting_key, setting_value, description, updated_at")
    .like("setting_key", `${prefix}%`);

  if (error) throw error;

  return (data ?? []).map((row) => ({
    ...row,
    parsed_value: parseSettingValue<T>(row.setting_value),
  }));
};

export const saveAppSetting = async (
  key: string,
  value: unknown,
  description?: string,
) => {
  const payload = {
    setting_key: key,
    setting_value: serializeSettingValue(value),
    description: description ?? `${key} settings`,
    updated_at: new Date().toISOString(),
  };

  const { error } = await adminSupabase
    .from("app_settings")
    .upsert(payload, { onConflict: "setting_key" });

  if (error) throw error;
};

export const saveBrandingSettings = async (value: Record<string, unknown>, id?: string) => {
  const payload = {
    setting_key: "default",
    setting_value: JSON.stringify(value),
    description: "Default branding settings",
    updated_at: new Date().toISOString(),
  };

  // Single round-trip upsert — instant save, no SELECT-then-UPDATE
  const { data, error } = await adminSupabase
    .from("branding_settings")
    .upsert(
      { ...(id ? { id } : {}), ...payload },
      { onConflict: "setting_key" }
    )
    .select("id")
    .single();

  if (error) throw error;
  return data?.id ?? null;
};