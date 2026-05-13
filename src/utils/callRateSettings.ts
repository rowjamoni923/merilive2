import { parseSettingValue } from "@/utils/adminSettingsStorage";

export interface CallRateLevel {
  level: number;
  rate: number;
}

export interface ParsedCallRateSettings {
  default_rate: number;
  min_rate: number;
  max_rate: number;
  host_commission_percent: number;
  call_timeout_seconds: number;
  free_call_duration_seconds: number;
  allow_video_calls: boolean;
  allow_audio_calls: boolean;
  auto_disconnect_on_low_balance: boolean;
  low_balance_warning_threshold: number;
  level_rates: CallRateLevel[];
  min_level_for_custom_rate: number;
  first_minute_grace_seconds: number;
  per_minute_rate?: number;
}

const DEFAULT_CALL_RATE_SETTINGS: ParsedCallRateSettings = {
  default_rate: 0,
  min_rate: 0,
  max_rate: 0,
  host_commission_percent: 0,
  call_timeout_seconds: 60,
  free_call_duration_seconds: 0,
  allow_video_calls: true,
  allow_audio_calls: true,
  auto_disconnect_on_low_balance: true,
  low_balance_warning_threshold: 0,
  level_rates: [],
  min_level_for_custom_rate: 6,
  first_minute_grace_seconds: 21,
};

export const getEffectiveHostLevel = (hostLevel: number | null | undefined) =>
  Math.max(hostLevel ?? 0, 0);

export const parseCallRateSettings = (value: unknown): ParsedCallRateSettings => {
  const parsed = parseSettingValue<Record<string, unknown>>(value) ?? {};
  const levelRates = Array.isArray(parsed.level_rates)
    ? parsed.level_rates
        .map((entry) => {
          const item = entry as Record<string, unknown>;
          const level = Number(item.level ?? 0);
          const rate = Number(item.rate ?? 0);

          if (!Number.isFinite(level) || !Number.isFinite(rate) || rate <= 0) {
            return null;
          }

          return { level, rate };
        })
        .filter((entry): entry is CallRateLevel => entry !== null)
        .sort((a, b) => a.level - b.level)
    : [];

  return {
    default_rate: Number(parsed.default_rate ?? parsed.per_minute_rate ?? DEFAULT_CALL_RATE_SETTINGS.default_rate),
    min_rate: Number(parsed.min_rate ?? DEFAULT_CALL_RATE_SETTINGS.min_rate),
    max_rate: Number(parsed.max_rate ?? DEFAULT_CALL_RATE_SETTINGS.max_rate),
    host_commission_percent: Number(parsed.host_commission_percent ?? DEFAULT_CALL_RATE_SETTINGS.host_commission_percent),
    call_timeout_seconds: Number(parsed.call_timeout_seconds ?? DEFAULT_CALL_RATE_SETTINGS.call_timeout_seconds),
    free_call_duration_seconds: Number(parsed.free_call_duration_seconds ?? DEFAULT_CALL_RATE_SETTINGS.free_call_duration_seconds),
    allow_video_calls: Boolean(parsed.allow_video_calls ?? DEFAULT_CALL_RATE_SETTINGS.allow_video_calls),
    allow_audio_calls: Boolean(parsed.allow_audio_calls ?? DEFAULT_CALL_RATE_SETTINGS.allow_audio_calls),
    auto_disconnect_on_low_balance: Boolean(
      parsed.auto_disconnect_on_low_balance ?? DEFAULT_CALL_RATE_SETTINGS.auto_disconnect_on_low_balance,
    ),
    low_balance_warning_threshold: Number(
      parsed.low_balance_warning_threshold ?? DEFAULT_CALL_RATE_SETTINGS.low_balance_warning_threshold,
    ),
    level_rates: levelRates,
    min_level_for_custom_rate: Number(
      parsed.min_level_for_custom_rate ?? DEFAULT_CALL_RATE_SETTINGS.min_level_for_custom_rate,
    ),
    first_minute_grace_seconds: Number(
      parsed.first_minute_grace_seconds ?? DEFAULT_CALL_RATE_SETTINGS.first_minute_grace_seconds,
    ),
    per_minute_rate: Number(parsed.per_minute_rate ?? parsed.default_rate ?? DEFAULT_CALL_RATE_SETTINGS.default_rate),
  };
};

export const resolveEffectiveCallRate = ({
  settings,
  hostLevel,
  customRate,
}: {
  settings: ParsedCallRateSettings;
  hostLevel: number | null | undefined;
  customRate?: number | null;
}) => {
  const effectiveHostLevel = getEffectiveHostLevel(hostLevel);
  const levelRate = settings.level_rates.find((entry) => entry.level === effectiveHostLevel)?.rate;
  const adminRate = levelRate ?? settings.default_rate ?? settings.per_minute_rate ?? 0;
  const normalizedCustomRate = Number(customRate ?? 0);
  const canUseCustomRate =
    normalizedCustomRate > 0 && effectiveHostLevel >= (settings.min_level_for_custom_rate || DEFAULT_CALL_RATE_SETTINGS.min_level_for_custom_rate);

  return canUseCustomRate ? normalizedCustomRate : adminRate;
};