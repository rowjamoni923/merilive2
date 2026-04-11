import { supabase } from "@/integrations/supabase/client";

type Primitive = string | number | boolean | null;
type SettingValue = Primitive | Record<string, unknown> | Array<unknown>;

const serializeSettingValue = (value: SettingValue): string => {
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

export const saveAppSetting = async (
  key: string,
  value: SettingValue,
  description?: string,
) => {
  const payload = {
    setting_key: key,
    setting_value: serializeSettingValue(value),
    description: description ?? `${key} settings`,
    updated_at: new Date().toISOString(),
  };

  const { data: existing, error: checkError } = await supabase
    .from("app_settings")
    .select("id")
    .eq("setting_key", key)
    .maybeSingle();

  if (checkError) throw checkError;

  if (existing) {
    const { error } = await supabase
      .from("app_settings")
      .update({
        setting_value: payload.setting_value,
        description: payload.description,
        updated_at: payload.updated_at,
      })
      .eq("setting_key", key);

    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("app_settings")
    .insert({
      setting_key: payload.setting_key,
      setting_value: payload.setting_value,
      description: payload.description,
    });

  if (error) throw error;
};

export const saveBrandingSettings = async (value: Record<string, unknown>, id?: string) => {
  const { data: existing, error: checkError } = await supabase
    .from("branding_settings")
    .select("id")
    .eq("setting_key", "default")
    .maybeSingle();

  if (checkError) throw checkError;

  const payload = {
    setting_key: "default",
    setting_value: JSON.stringify(value),
    description: "Default branding settings",
    updated_at: new Date().toISOString(),
  };

  if (existing) {
    const { error } = await supabase
      .from("branding_settings")
      .update({
        setting_value: payload.setting_value,
        description: payload.description,
        updated_at: payload.updated_at,
      })
      .eq("id", existing.id);

    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await supabase
    .from("branding_settings")
    .insert({
      ...(id ? { id } : {}),
      setting_key: payload.setting_key,
      setting_value: payload.setting_value,
      description: payload.description,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data?.id ?? null;
};