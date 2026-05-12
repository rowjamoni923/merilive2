import { supabase } from "@/integrations/supabase/client";

export type ResolvedLevelType = "user" | "host";

export interface ResolvableProfile {
  id: string;
  gender?: string | null;
  is_host?: boolean | null;
  user_level?: number | null;
  host_level?: number | null;
  max_user_level?: number | null;
  total_recharged?: number | null;
  total_earnings?: number | null;
  weekly_earnings?: number | null;
}

export interface ResolvedLevelTier {
  level_number: number;
  level_name?: string | null;
  min_topup_amount?: number | null;
  min_earning_amount?: number | null;
  level_icon?: string | null;
  icon_url?: string | null;
  animation_url?: string | null;
}

export interface ResolvedLevelResult {
  isFemaleHost: boolean;
  levelType: ResolvedLevelType;
  level: number;
  totalPoints: number;
  currentXP: number;
  nextLevelNumber: number;
  progress: number;
  tiers: ResolvedLevelTier[];
}

const PAGE_SIZE = 1000;

export const isFemaleHostProfile = (profile: Pick<ResolvableProfile, "gender" | "is_host"> | null | undefined): boolean => {
  return Boolean(profile?.is_host) && String(profile?.gender ?? "").toLowerCase() === "female";
};

const sumPaginated = async (
  fetchPage: (from: number, to: number) => Promise<{ data: any[] | null; error: any }>,
  valueSelector: (row: any) => number,
): Promise<number> => {
  let total = 0;
  let page = 0;
  let hasMore = true;

  while (hasMore) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);

    if (error) throw error;
    if (!data || data.length === 0) break;

    total += data.reduce((sum, row) => sum + valueSelector(row), 0);
    hasMore = data.length === PAGE_SIZE;
    page += 1;
  }

  return total;
};

export const fetchActiveLevelTiers = async (levelType: ResolvedLevelType): Promise<ResolvedLevelTier[]> => {
  const { data, error } = await supabase
    .from("user_level_tiers")
    .select("level_number, level_name, min_topup_amount, min_earning_amount, level_icon, icon_url, animation_url")
    .eq("tier_type", levelType)
    .eq("is_active", true)
    .order("level_number", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ResolvedLevelTier[];
};

export const resolveEffectiveUserRechargeTotal = async (
  userId: string,
  profileTotalRecharged: number,
): Promise<number> => {
  try {
    const [totalCoinRecharge, totalPaymentRecharge] = await Promise.all([
      sumPaginated(
        async (from, to) =>
          await supabase
            .from("coin_transactions")
            .select("coins_amount")
            .eq("user_id", userId)
            .eq("status", "completed")
            .in("transaction_type", ["recharge", "self_recharge"])
            .range(from, to),
        (row) => Number(row?.coins_amount ?? 0),
      ),
      sumPaginated(
        async (from, to) =>
          await supabase
            .from("payment_transactions")
            .select("diamonds_amount")
            .eq("user_id", userId)
            .eq("status", "completed")
            .range(from, to),
        (row) => Number(row?.diamonds_amount ?? 0),
      ),
    ]);

    return Math.max(profileTotalRecharged, totalCoinRecharge, totalPaymentRecharge);
  } catch (error) {
    console.warn("[levelResolver] Failed to resolve effective user recharge total:", error);
    return profileTotalRecharged;
  }
};

export const resolveEffectiveHostEarnings = async (
  userId: string,
  profileTotalEarnings: number,
  weeklyEarnings: number,
): Promise<number> => {
  try {
    const totalGiftEarnings = await sumPaginated(
      async (from, to) =>
        await supabase
          .from("gift_transactions")
          .select("receiver_beans")
          .eq("receiver_id", userId)
          .range(from, to),
      (row) => Number(row?.receiver_beans ?? 0),
    );

    return Math.max(profileTotalEarnings, weeklyEarnings, totalGiftEarnings);
  } catch (error) {
    console.warn("[levelResolver] Failed to resolve effective host earnings:", error);
    return Math.max(profileTotalEarnings, weeklyEarnings);
  }
};

export const resolveLevelFromTiers = async (
  profile: ResolvableProfile,
  providedTiers?: ResolvedLevelTier[],
): Promise<ResolvedLevelResult> => {
  const isFemaleHost = isFemaleHostProfile(profile);
  const levelType: ResolvedLevelType = isFemaleHost ? "host" : "user";
  const tiers = providedTiers ?? (await fetchActiveLevelTiers(levelType));

  const profileTotalRecharged = Number(profile.total_recharged ?? 0);
  const profileTotalEarnings = Number(profile.total_earnings ?? 0);
  const weeklyEarnings = Number(profile.weekly_earnings ?? 0);

  const totalPoints = isFemaleHost
    ? await resolveEffectiveHostEarnings(profile.id, profileTotalEarnings, weeklyEarnings)
    : await resolveEffectiveUserRechargeTotal(profile.id, profileTotalRecharged);

  const derivedLevel = tiers.reduce((highest, tier) => {
    const threshold = Number(
      isFemaleHost
        ? (tier.min_earning_amount ?? tier.min_topup_amount ?? 0)
        : (tier.min_topup_amount ?? tier.min_earning_amount ?? 0),
    );
    return totalPoints >= threshold ? Math.max(highest, Number(tier.level_number ?? 0)) : highest;
  }, 0);

  const storedLevel = Number(isFemaleHost ? (profile.host_level ?? 0) : (profile.user_level ?? 0));
  const maxUserLevel = Number(profile.max_user_level ?? 0);
  const resolvedLevel = isFemaleHost
    ? Math.max(storedLevel, derivedLevel, 0)
    : Math.max(storedLevel, maxUserLevel, derivedLevel, 1);

  if (!isFemaleHost && profile.id && (totalPoints > profileTotalRecharged || derivedLevel > Math.max(storedLevel, maxUserLevel))) {
    void supabase.rpc("recalculate_user_level", { _user_id: profile.id }).then(({ error }) => {
      if (error) {
        console.warn("[levelResolver] Failed to self-heal user level:", error);
      }
    });
  }

  const currentXP = isFemaleHost ? weeklyEarnings : totalPoints;
  const nextTier = tiers.find((tier) => Number(tier.level_number) > resolvedLevel);
  const currentTier = tiers.find((tier) => Number(tier.level_number) === resolvedLevel);
  const nextLevelNumber = nextTier ? Number(nextTier.level_number) : resolvedLevel + 1;

  let progress = 100;
  if (currentTier && nextTier && Number(currentTier.level_number) !== Number(nextTier.level_number)) {
    const currentMin = Number(isFemaleHost ? (currentTier.min_earning_amount ?? currentTier.min_topup_amount ?? 0) : (currentTier.min_topup_amount ?? currentTier.min_earning_amount ?? 0));
    const nextMin = Number(isFemaleHost ? (nextTier.min_earning_amount ?? nextTier.min_topup_amount ?? 0) : (nextTier.min_topup_amount ?? nextTier.min_earning_amount ?? 0));
    const range = nextMin - currentMin;
    const progressInRange = currentXP - currentMin;
    progress = range > 0 ? (progressInRange / range) * 100 : 0;
  } else if (!currentTier && nextTier) {
    const nextMin = Number(isFemaleHost ? (nextTier.min_earning_amount ?? nextTier.min_topup_amount ?? 0) : (nextTier.min_topup_amount ?? nextTier.min_earning_amount ?? 0));
    progress = nextMin > 0 ? (currentXP / nextMin) * 100 : 0;
  }

  return {
    isFemaleHost,
    levelType,
    level: resolvedLevel,
    totalPoints,
    currentXP,
    nextLevelNumber,
    progress: Math.min(Math.max(progress, 0), 100),
    tiers,
  };
};