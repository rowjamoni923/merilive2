import { useEffect, useState, useCallback } from "react";
import {
  Save,
  Phone,
  Gift,
  Building2,
  Wallet,
  ArrowRightLeft,
  Percent,
  Plus,
  Trash2,
  Crown,
  RefreshCw,
  Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { parseSettingValue, saveAppSetting } from "@/utils/adminSettingsStorage";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { recordAdminError } from "@/utils/adminErrorLog";

/**
 * Pkg30 — UNIFIED Commission & Pricing Hub
 * SINGLE source of truth for all percentages, rates, and minimums in one page.
 * Replaces overlapping editors in AdminCommissions, AdminCommissionCalculator,
 * AdminCallSettings, and the commission-tier section of AdminAgencyPolicy.
 */

interface AgencyLevelTier {
  id: string;
  level_code: string;
  level_name: string;
  min_weekly_income: number | "";
  max_weekly_income: number | "";
  commission_rate: number | "";
  display_order: number;
  is_active: boolean;
}

interface LevelRate {
  level: number | "";
  rate: number | "";
}

const NUM = (v: any): number | "" =>
  v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? "" : Number(v);

const inputNumber = (value: string): number | "" => (value === "" ? "" : Number(value));

const Field = ({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) => (
  <div className="space-y-1.5">
    <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
    {children}
    {hint && <p className="text-[11px] text-muted-foreground/70">{hint}</p>}
  </div>
);

export default function AdminPricingHub() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Call rates (app_settings.call_rates)
  const [callRates, setCallRates] = useState<any>(null);

  // Gift commission (app_settings.gift_commission)
  const [giftCommission, setGiftCommission] = useState<{ host_percent: number | ""; company_percent: number | "" }>({
    host_percent: "",
    company_percent: "",
  });

  // Agency commission (app_settings.agency_commission) — global config
  const [agencyCommission, setAgencyCommission] = useState<any>(null);

  // Agency level tiers (agency_level_tiers table) — per-level commission rates
  const [tiers, setTiers] = useState<AgencyLevelTier[]>([]);

  // Withdrawal settings (app_settings.withdrawal_settings)
  const [withdrawal, setWithdrawal] = useState<any>(null);

  // Helper / withdrawal fee % (app_settings.agency_withdrawal_fee, helper_diamond_commission, helper_fee_settings)
  const [agencyWithdrawalFee, setAgencyWithdrawalFee] = useState<number | "">("");
  const [helperDiamondCommission, setHelperDiamondCommission] = useState<number | "">("");
  const [helperFeeSettings, setHelperFeeSettings] = useState<{ platform_fee_percent: number | ""; helper_receives_percent: number | "" }>({
    platform_fee_percent: "",
    helper_receives_percent: "",
  });
  const [traderWalletTopupRate, setTraderWalletTopupRate] = useState<number | "">("");
  // Pkg70 — per-level minimum wallet balance to be visible as Verified Trader on /recharge
  const [traderTierMin, setTraderTierMin] = useState<Record<1|2|3|4|5, number | "">>({
    1: "", 2: "", 3: "", 4: "", 5: "",
  });

  // Auto Withdrawal Fee (app_settings.auto_withdrawal_fee) — flat USD + percent for ePay/USDT/Binance/Crypto auto methods (foreign agencies)
  const [autoWithdrawalFee, setAutoWithdrawalFee] = useState<{ flat_usd: number | ""; percent: number | ""; enabled: boolean }>({
    flat_usd: "",
    percent: "",
    enabled: true,
  });

  // Beans → Diamonds exchange (app_settings.coin_exchange)
  const [coinExchange, setCoinExchange] = useState<any>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value")
        .in("setting_key", [
          "call_rates",
          "gift_commission",
          "agency_commission",
          "withdrawal_settings",
          "agency_withdrawal_fee",
          "helper_diamond_commission",
          "helper_fee_settings",
          "coin_exchange",
          "trader_wallet_topup_rate",
          "auto_withdrawal_fee",
        ]);
      if (error) throw error;

      const map: Record<string, any> = {};
      data?.forEach((row) => {
        map[row.setting_key] = parseSettingValue(row.setting_value);
      });

      setCallRates(map.call_rates ?? {});
      setGiftCommission({
        host_percent: map.gift_commission?.host_percent ?? "",
        company_percent: map.gift_commission?.company_percent ?? "",
      });
      setAgencyCommission(map.agency_commission ?? {});
      setWithdrawal(map.withdrawal_settings ?? {});

      // Fee settings can be stored as numeric or {rate: x}
      const aw = map.agency_withdrawal_fee;
      setAgencyWithdrawalFee(typeof aw === "number" ? aw : aw?.rate ?? aw?.percent ?? "");

      const hd = map.helper_diamond_commission;
      setHelperDiamondCommission(typeof hd === "number" ? hd : hd?.rate ?? hd?.percent ?? "");

      setHelperFeeSettings({
        platform_fee_percent: map.helper_fee_settings?.platform_fee_percent ?? "",
        helper_receives_percent: map.helper_fee_settings?.helper_receives_percent ?? "",
      });

      setCoinExchange(map.coin_exchange ?? {});

      const tw = map.trader_wallet_topup_rate;
      setTraderWalletTopupRate(
        typeof tw === "number"
          ? tw
          : tw?.usd_per_100k_diamonds ?? ""
      );

      // Auto Withdrawal Fee (flat USD + percent for ePay/USDT/Binance/Crypto auto methods)
      const awf = map.auto_withdrawal_fee;
      setAutoWithdrawalFee({
        flat_usd: typeof awf?.flat_usd === "number" ? awf.flat_usd : (typeof awf === "number" ? awf : ""),
        percent: typeof awf?.percent === "number" ? awf.percent : "",
        enabled: awf?.enabled !== false,
      });



      // Load agency_level_tiers
      const { data: tierData, error: tierErr } = await supabase
        .from("agency_level_tiers")
        .select("*")
        .order("display_order", { ascending: true });
      if (tierErr) throw tierErr;
      setTiers((tierData as AgencyLevelTier[]) ?? []);
    } catch (e: any) {
      console.error(e);
      recordAdminError({ kind: "rpc", label: "AdminPricingHub.hd", message: e });
      toast.error(e?.message ?? "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useAdminRealtime(["app_settings", "agency_level_tiers"], loadAll, "admin-pricing-hub-rt");

  const saveSection = async (key: string, value: any, label: string) => {
    setSaving(key);
    try {
      await saveAppSetting(key, value, `${label} (Pricing Hub)`);
      toast.success(`${label} saved`);
    } catch (e: any) {
      toast.error(`Failed to save ${label}: ${e?.message ?? "unknown"}`);
    } finally {
      setSaving(null);
    }
  };

  const saveTiers = async () => {
    setSaving("tiers");
    try {
      for (const t of tiers) {
        if (t.min_weekly_income === "" || t.max_weekly_income === "" || t.commission_rate === "") {
          throw new Error("Agency tier weekly range and commission fields must be configured before saving.");
        }
        const { error } = await supabase
          .from("agency_level_tiers")
          .update({
            level_code: t.level_code,
            level_name: t.level_name,
            min_weekly_income: Number(t.min_weekly_income),
            max_weekly_income: Number(t.max_weekly_income),
            commission_rate: Number(t.commission_rate),
            is_active: t.is_active,
            updated_at: new Date().toISOString(),
          })
          .eq("id", t.id);
        if (error) throw error;
      }
      toast.success("Agency level tiers saved");
    } catch (e: any) {
      toast.error(`Failed to save tiers: ${e?.message ?? "unknown"}`);
    } finally {
      setSaving(null);
    }
  };

  const updateTier = (id: string, field: keyof AgencyLevelTier, value: any) => {
    setTiers((prev) => prev.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  };

  const updateLevelRate = (idx: number, field: "level" | "rate", value: number | "") => {
    if (!callRates) return;
    const arr: LevelRate[] = [...(callRates.level_rates ?? [])];
    arr[idx] = { ...arr[idx], [field]: value };
    setCallRates({ ...callRates, level_rates: arr });
  };

  const addLevelRate = () => {
    const arr: LevelRate[] = [...(callRates?.level_rates ?? [])];
    const nextLevel = arr.length ? Math.max(...arr.map((lr) => Number(lr.level) || 0)) + 1 : 0;
    setCallRates({ ...(callRates ?? {}), level_rates: [...arr, { level: nextLevel, rate: "" }] });
  };

  const removeLevelRate = (idx: number) => {
    const arr: LevelRate[] = [...(callRates?.level_rates ?? [])];
    arr.splice(idx, 1);
    setCallRates({ ...(callRates ?? {}), level_rates: arr });
  };

  if (loading) {
    return (
      <div className="admin-content p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-muted rounded" />
          <div className="h-96 bg-muted rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="admin-content p-4 md:p-6 space-y-6">
      <AdminPageHeader
        title="Commission & Pricing Hub"
        subtitle="SINGLE source of truth for every percentage, rate, and minimum across the app. No defaults — everything you set here drives the live app instantly."
        icon={Percent}
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          This page is the <strong>only</strong> place where commissions and pricing are configured.
          The old Commissions, Commission Calculator, and Call Settings pages are deprecated — all
          their values now live here. Changes apply to web + native Android instantly.
        </AlertDescription>
      </Alert>

      {/* Fee Summary — at-a-glance overview of every active fee/commission */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Percent className="h-4 w-4 text-primary" /> Fee & Commission Summary
          </CardTitle>
          <CardDescription className="text-xs">Live values currently driving the app. Edit any below to update instantly.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="rounded border border-border/40 p-2">
            <div className="text-muted-foreground">Call → Host</div>
            <div className="text-base font-bold text-primary">{callRates?.host_commission_percent ?? "—"}%</div>
            <div className="text-[10px] text-muted-foreground">Company keeps {callRates?.host_commission_percent != null && callRates?.host_commission_percent !== "" ? Math.max(0, 100 - Number(callRates.host_commission_percent)) : "—"}%</div>
          </div>
          <div className="rounded border border-border/40 p-2">
            <div className="text-muted-foreground">Gift → Host</div>
            <div className="text-base font-bold text-primary">{giftCommission.host_percent || "—"}%</div>
            <div className="text-[10px] text-muted-foreground">Company keeps {giftCommission.host_percent !== "" ? Math.max(0, 100 - Number(giftCommission.host_percent)) : "—"}%</div>
          </div>
          <div className="rounded border border-border/40 p-2">
            <div className="text-muted-foreground">Agency Withdrawal Fee</div>
            <div className="text-base font-bold text-primary">{agencyWithdrawalFee !== "" ? `${agencyWithdrawalFee}%` : "—"}</div>
            <div className="text-[10px] text-muted-foreground">Deducted before payout</div>
          </div>
          <div className="rounded border border-border/40 p-2">
            <div className="text-muted-foreground">Helper Diamond %</div>
            <div className="text-base font-bold text-primary">{helperDiamondCommission !== "" ? `${helperDiamondCommission}%` : "—"}</div>
            <div className="text-[10px] text-muted-foreground">Helper top-up commission</div>
          </div>
          <div className="rounded border border-border/40 p-2">
            <div className="text-muted-foreground">Level-5 Helper Fee</div>
            <div className="text-base font-bold text-primary">{helperFeeSettings.platform_fee_percent !== "" ? `${helperFeeSettings.platform_fee_percent}%` : "—"}</div>
            <div className="text-[10px] text-muted-foreground">Helper gets {helperFeeSettings.helper_receives_percent !== "" ? `${helperFeeSettings.helper_receives_percent}%` : "—"}</div>
          </div>
          <div className="rounded border border-border/40 p-2">
            <div className="text-muted-foreground">Beans → USD</div>
            <div className="text-base font-bold text-primary">{withdrawal?.coins_to_dollar_rate || "—"}</div>
            <div className="text-[10px] text-muted-foreground">beans per $1</div>
          </div>
          <div className="rounded border border-border/40 p-2">
            <div className="text-muted-foreground">Exchange Fee</div>
            <div className="text-base font-bold text-primary">{coinExchange?.exchange_fee_percent != null ? `${coinExchange.exchange_fee_percent}%` : "—"}</div>
            <div className="text-[10px] text-muted-foreground">Beans → Diamonds</div>
          </div>
          <div className="rounded border border-border/40 p-2">
            <div className="text-muted-foreground">Agency Tiers</div>
            <div className="text-base font-bold text-primary">{tiers.filter((t) => t.is_active).length}</div>
            <div className="text-[10px] text-muted-foreground">active levels</div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="call" className="w-full">
        <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
          <TabsTrigger value="call"><Phone className="h-4 w-4 mr-1" />Call</TabsTrigger>
          <TabsTrigger value="gift"><Gift className="h-4 w-4 mr-1" />Gift</TabsTrigger>
          <TabsTrigger value="agency"><Building2 className="h-4 w-4 mr-1" />Agency</TabsTrigger>
          <TabsTrigger value="withdrawal"><Wallet className="h-4 w-4 mr-1" />Withdrawal</TabsTrigger>
          <TabsTrigger value="exchange"><ArrowRightLeft className="h-4 w-4 mr-1" />Exchange</TabsTrigger>
          <TabsTrigger value="helper"><Crown className="h-4 w-4 mr-1" />Helper</TabsTrigger>
        </TabsList>

        {/* ============== CALL ============== */}
        <TabsContent value="call" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Phone className="h-4 w-4 text-primary" /> Private Call Pricing
              </CardTitle>
              <CardDescription>
                Per-minute diamond rates, host commission %, and grace period. Drives `private_calls` settlement.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Field label="Default rate (diamonds/min)">
                      <Input
                        type="number"
                        value={NUM(callRates.default_rate)}
                        onChange={(e) => setCallRates({ ...callRates, default_rate: inputNumber(e.target.value) })}
                      />
                    </Field>
                    <Field label="Min rate">
                      <Input
                        type="number"
                        value={NUM(callRates.min_rate)}
                        onChange={(e) => setCallRates({ ...callRates, min_rate: inputNumber(e.target.value) })}
                      />
                    </Field>
                    <Field label="Max rate">
                      <Input
                        type="number"
                        value={NUM(callRates.max_rate)}
                        onChange={(e) => setCallRates({ ...callRates, max_rate: inputNumber(e.target.value) })}
                      />
                    </Field>
                    <Field label="Host receives %" hint="Beans credited = floor(charge × host_% / 100). Strict 21s rule applies.">
                      <Input
                        type="number"
                        value={NUM(callRates.host_commission_percent)}
                        onChange={(e) =>
                          setCallRates({ ...callRates, host_commission_percent: inputNumber(e.target.value) })
                        }
                      />
                    </Field>
                    <Field label="Company keeps %" hint="Auto = 100 − host %. Read-only.">
                      <Input
                        type="number"
                        readOnly
                        className="bg-muted/40"
                        value={
                          callRates.host_commission_percent === "" || callRates.host_commission_percent == null
                            ? ""
                            : Math.max(0, 100 - Number(callRates.host_commission_percent))
                        }
                      />
                    </Field>
                    <Field label="First-minute grace seconds" hint="Below this, host earns 0; company keeps full charge.">
                      <Input
                        type="number"
                        value={NUM(callRates.first_minute_grace_seconds)}
                        onChange={(e) =>
                          setCallRates({ ...callRates, first_minute_grace_seconds: inputNumber(e.target.value) })
                        }
                      />
                    </Field>
                    <Field label="Min level for custom rate">
                      <Input
                        type="number"
                        value={NUM(callRates.min_level_for_custom_rate)}
                        onChange={(e) =>
                          setCallRates({ ...callRates, min_level_for_custom_rate: inputNumber(e.target.value) })
                        }
                      />
                    </Field>
                  </div>

                  {callRates.host_commission_percent !== "" && callRates.default_rate !== "" && Number(callRates.default_rate) > 0 && (
                    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
                      <div className="font-semibold text-primary">Live Calculation Preview (5-minute call)</div>
                      <div>• Charged to caller: <strong>{Number(callRates.default_rate) * 5} diamonds</strong></div>
                      <div>• Host earns: <strong>{Math.floor(Number(callRates.default_rate) * 5 * Number(callRates.host_commission_percent) / 100)} beans</strong> ({callRates.host_commission_percent}%)</div>
                      <div>• Company keeps: <strong>{Math.max(0, 100 - Number(callRates.host_commission_percent))}%</strong> = {Number(callRates.default_rate) * 5 - Math.floor(Number(callRates.default_rate) * 5 * Number(callRates.host_commission_percent) / 100)} diamonds</div>
                      <div className="text-muted-foreground">If call &lt; {callRates.first_minute_grace_seconds || 21}s → host earns 0, company keeps full coins_per_minute.</div>
                    </div>
                  )}

                  <Separator />

                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!!callRates.allow_video_calls}
                        onCheckedChange={(v) => setCallRates({ ...callRates, allow_video_calls: v })}
                      />
                      <Label className="text-xs">Video calls</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!!callRates.allow_audio_calls}
                        onCheckedChange={(v) => setCallRates({ ...callRates, allow_audio_calls: v })}
                      />
                      <Label className="text-xs">Audio calls</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={!!callRates.auto_disconnect_on_low_balance}
                        onCheckedChange={(v) =>
                          setCallRates({ ...callRates, auto_disconnect_on_low_balance: v })
                        }
                      />
                      <Label className="text-xs">Auto-disconnect on low balance</Label>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-sm font-semibold">Per-Level Rates (diamonds/min)</Label>
                      <Button type="button" variant="outline" size="sm" onClick={addLevelRate}>
                        <Plus className="h-3 w-3 mr-1" /> Add Level
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                      {(callRates.level_rates ?? []).map((lr: LevelRate, idx: number) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Badge variant="outline" className="w-14 justify-center">L{lr.level}</Badge>
                          <Input
                            type="number"
                            value={NUM(lr.rate)}
                            onChange={(e) => updateLevelRate(idx, "rate", inputNumber(e.target.value))}
                            className="h-8"
                          />
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeLevelRate(idx)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Button
                    onClick={() => saveSection("call_rates", callRates, "Call rates")}
                    disabled={saving === "call_rates"}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saving === "call_rates" ? "Saving..." : "Save Call Settings"}
                  </Button>
                </>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============== GIFT ============== */}
        <TabsContent value="gift" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Gift className="h-4 w-4 text-primary" /> Gift Commission Split
              </CardTitle>
              <CardDescription>
                When a user sends a gift to a host, this defines how the diamond value is split.
                Host % is converted to beans on the host's profile; the rest is company revenue.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Host receives %" hint="Beans credited to host = floor(gift_value × host_% / 100)">
                  <Input
                    type="number"
                    value={NUM(giftCommission.host_percent)}
                    onChange={(e) =>
                      setGiftCommission({ ...giftCommission, host_percent: inputNumber(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Company keeps %" hint="Auto = 100 − host %. Read-only.">
                  <Input
                    type="number"
                    readOnly
                    className="bg-muted/40"
                    value={
                      giftCommission.host_percent === "" || giftCommission.host_percent == null
                        ? ""
                        : Math.max(0, 100 - Number(giftCommission.host_percent))
                    }
                  />
                </Field>
              </div>

              {giftCommission.host_percent !== "" && (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
                  <div className="font-semibold text-primary">Live Calculation Preview</div>
                  <div>Example: 1,000-diamond gift sent to a host</div>
                  <div>• Host earns: <strong>{Math.floor(1000 * Number(giftCommission.host_percent) / 100)} beans</strong> ({giftCommission.host_percent}%)</div>
                  <div>• Company keeps: <strong>{1000 - Math.floor(1000 * Number(giftCommission.host_percent) / 100)} diamonds</strong> ({Math.max(0, 100 - Number(giftCommission.host_percent))}%)</div>
                </div>
              )}
              <Button
                onClick={() => {
                  const hp = giftCommission.host_percent;
                  const cp = hp === "" || hp == null ? "" : Math.max(0, 100 - Number(hp));
                  saveSection(
                    "gift_commission",
                    {
                      host_percent: hp,
                      company_percent: cp,
                      description: `Company takes ${cp}%, Host receives ${hp}%`,
                    },
                    "Gift commission"
                  );
                }}
                disabled={saving === "gift_commission"}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving === "gift_commission" ? "Saving..." : "Save Gift Split"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============== AGENCY ============== */}
        <TabsContent value="agency" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" /> Agency Level Tiers (Commission %)
              </CardTitle>
              <CardDescription>
                Per-level commission % paid by the company to the agency owner on every host gift /
                call earning. Upper-agency referral bonus = upper_rate − sub_rate (only when upper level &gt; sub level).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {tiers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tiers configured.</p>
              ) : (
                <div className="space-y-2">
                  {tiers.map((t) => (
                    <div
                      key={t.id}
                      className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end p-3 rounded-md border border-border/40 bg-muted/20"
                    >
                      <Field label="Code">
                        <Input
                          value={t.level_code ?? ""}
                          onChange={(e) => updateTier(t.id, "level_code", e.target.value)}
                          className="h-8"
                        />
                      </Field>
                      <Field label="Name">
                        <Input
                          value={t.level_name ?? ""}
                          onChange={(e) => updateTier(t.id, "level_name", e.target.value)}
                          className="h-8"
                        />
                      </Field>
                      <Field label="Min weekly beans">
                        <Input
                          type="number"
                          value={NUM(t.min_weekly_income)}
                          onChange={(e) => updateTier(t.id, "min_weekly_income", inputNumber(e.target.value))}
                          className="h-8"
                        />
                      </Field>
                      <Field label="Max weekly beans">
                        <Input
                          type="number"
                          value={NUM(t.max_weekly_income)}
                          onChange={(e) => updateTier(t.id, "max_weekly_income", inputNumber(e.target.value))}
                          className="h-8"
                        />
                      </Field>
                      <Field label="Commission %">
                        <Input
                          type="number"
                          step="0.1"
                          value={NUM(t.commission_rate)}
                          onChange={(e) => updateTier(t.id, "commission_rate", inputNumber(e.target.value))}
                          className="h-8"
                        />
                      </Field>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={t.is_active}
                          onCheckedChange={(v) => updateTier(t.id, "is_active", v)}
                        />
                        <Label className="text-xs">Active</Label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Button onClick={saveTiers} disabled={saving === "tiers"}>
                <Save className="h-4 w-4 mr-2" />
                {saving === "tiers" ? "Saving..." : "Save All Tiers"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============== WITHDRAWAL ============== */}
        <TabsContent value="withdrawal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" /> Agency Withdrawal Rules
              </CardTitle>
              <CardDescription>
                Hard floors enforced by `request_agency_withdrawal` RPC. Both beans and net-USD
                minimums must pass; missing config = explicit error (no silent defaults).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Min withdrawal (beans)" hint="withdrawal_settings.min_withdrawal">
                  <Input
                    type="number"
                    value={NUM(withdrawal?.min_withdrawal)}
                    onChange={(e) => setWithdrawal({ ...(withdrawal ?? {}), min_withdrawal: inputNumber(e.target.value) })}
                  />
                </Field>
                <Field label="Beans → USD rate" hint="9000 means 9000 beans = $1">
                  <Input
                    type="number"
                    value={NUM(withdrawal?.coins_to_dollar_rate)}
                    onChange={(e) =>
                      setWithdrawal({ ...(withdrawal ?? {}), coins_to_dollar_rate: inputNumber(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Free withdrawal limit (beans)" hint="No fee under this amount">
                  <Input
                    type="number"
                    value={NUM(withdrawal?.free_withdrawal_limit)}
                    onChange={(e) =>
                      setWithdrawal({ ...(withdrawal ?? {}), free_withdrawal_limit: inputNumber(e.target.value) })
                    }
                  />
                </Field>
              </div>
              <Button
                onClick={() => saveSection("withdrawal_settings", withdrawal, "Withdrawal settings")}
                disabled={saving === "withdrawal_settings"}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving === "withdrawal_settings" ? "Saving..." : "Save Withdrawal Settings"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agency-Wide Floors (used by withdrawal RPC)</CardTitle>
              <CardDescription>
                These three values are required by `request_agency_withdrawal`. Leaving any blank
                will cause withdrawals to fail with a config error.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="min_payout (beans)">
                  <Input
                    type="number"
                    value={NUM(agencyCommission?.min_payout)}
                    onChange={(e) =>
                      setAgencyCommission({ ...agencyCommission, min_payout: inputNumber(e.target.value) })
                    }
                  />
                </Field>
                <Field label="min_usd ($)">
                  <Input
                    type="number"
                    value={NUM(agencyCommission?.min_usd)}
                    onChange={(e) =>
                      setAgencyCommission({ ...agencyCommission, min_usd: inputNumber(e.target.value) })
                    }
                  />
                </Field>
                <Field label="coins_to_dollar_rate" hint="Same as withdrawal_settings — keep in sync">
                  <Input
                    type="number"
                    value={NUM(agencyCommission?.coins_to_dollar_rate)}
                    onChange={(e) =>
                      setAgencyCommission({
                        ...agencyCommission,
                        coins_to_dollar_rate: inputNumber(e.target.value),
                      })
                    }
                  />
                </Field>
              </div>
              <Button
                onClick={() => saveSection("agency_commission", agencyCommission, "Agency commission floors")}
                disabled={saving === "agency_commission"}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving === "agency_commission" ? "Saving..." : "Save Agency Floors"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agency Withdrawal Fee</CardTitle>
              <CardDescription>
                Percentage deducted from withdrawal beans before USD conversion. Treated as 0 if blank.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Agency withdrawal fee %" hint="e.g. 5 = 5% of beans deducted on withdrawal">
                  <Input
                    type="number"
                    step="0.1"
                    value={NUM(agencyWithdrawalFee)}
                    onChange={(e) => setAgencyWithdrawalFee(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </Field>
              </div>
              {agencyWithdrawalFee !== "" && Number(agencyWithdrawalFee) > 0 && (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
                  <div className="font-semibold text-primary">Live Calculation Preview</div>
                  <div>Example: 100,000 beans withdrawal request</div>
                  <div>• Fee deducted: <strong>{Math.floor(100000 * Number(agencyWithdrawalFee) / 100).toLocaleString()} beans</strong> ({agencyWithdrawalFee}%)</div>
                  <div>• Net beans paid out: <strong>{(100000 - Math.floor(100000 * Number(agencyWithdrawalFee) / 100)).toLocaleString()} beans</strong></div>
                </div>
              )}
              <Button
                onClick={() =>
                  saveSection("agency_withdrawal_fee", { rate: agencyWithdrawalFee }, "Agency withdrawal fee")
                }
                disabled={saving === "agency_withdrawal_fee"}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving === "agency_withdrawal_fee" ? "Saving..." : "Save Withdrawal Fee"}
              </Button>
            </CardContent>
          </Card>

          <Card className="border-amber-500/40">
            <CardHeader>
              <CardTitle className="text-base">Auto Withdrawal Fee (Foreign Agencies)</CardTitle>
              <CardDescription>
                Fee applied when an agency withdraws via an Auto Payment Method —
                <strong> ePay (Global), USDT, Binance, or the Custom Crypto Gateway</strong>.
                Final fee = <strong>Flat USD + (Withdrawal USD × Percent%)</strong>. Set either or both.
                Overrides the tiered Withdrawal Fee above for these methods only.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Flat fee (USD)" hint="e.g. 2 = $2 deducted per auto withdrawal">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={NUM(autoWithdrawalFee.flat_usd)}
                    onChange={(e) =>
                      setAutoWithdrawalFee({
                        ...autoWithdrawalFee,
                        flat_usd: e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Percent fee (%)" hint="e.g. 1.5 = 1.5% of withdrawal USD">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={NUM(autoWithdrawalFee.percent)}
                    onChange={(e) =>
                      setAutoWithdrawalFee({
                        ...autoWithdrawalFee,
                        percent: e.target.value === "" ? "" : Number(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Enabled" hint="If off, tiered fee above is used for auto methods too">
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={autoWithdrawalFee.enabled ? "yes" : "no"}
                    onChange={(e) =>
                      setAutoWithdrawalFee({ ...autoWithdrawalFee, enabled: e.target.value === "yes" })
                    }
                  >
                    <option value="yes">Enabled</option>
                    <option value="no">Disabled</option>
                  </select>
                </Field>
              </div>
              {autoWithdrawalFee.enabled && (autoWithdrawalFee.flat_usd !== "" || autoWithdrawalFee.percent !== "") && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
                  <div className="font-semibold text-amber-700 dark:text-amber-400">Live Preview</div>
                  {(() => {
                    const flat = Number(autoWithdrawalFee.flat_usd) || 0;
                    const pct = Number(autoWithdrawalFee.percent) || 0;
                    const sample = 50;
                    const fee = flat + (sample * pct) / 100;
                    return (
                      <div>
                        Example: ${sample} auto withdrawal → fee <strong>${fee.toFixed(2)}</strong>
                        {pct > 0 && <> (${flat.toFixed(2)} flat + {pct}% = ${((sample * pct) / 100).toFixed(2)})</>}
                        {' '}→ net <strong>${(sample - fee).toFixed(2)}</strong> credited instantly
                      </div>
                    );
                  })()}
                  <div className="text-muted-foreground">Applies to: ePay, USDT, Binance, Crypto Gateway</div>
                </div>
              )}
              <Button
                onClick={() =>
                  saveSection(
                    "auto_withdrawal_fee",
                    {
                      flat_usd: autoWithdrawalFee.flat_usd === "" ? 0 : Number(autoWithdrawalFee.flat_usd),
                      percent: autoWithdrawalFee.percent === "" ? 0 : Number(autoWithdrawalFee.percent),
                      enabled: autoWithdrawalFee.enabled,
                      methods: ["epay", "usdt", "binance", "crypto_auto"],
                    },
                    "Auto withdrawal fee"
                  )
                }
                disabled={saving === "auto_withdrawal_fee"}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving === "auto_withdrawal_fee" ? "Saving..." : "Save Auto Withdrawal Fee"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>


        {/* ============== EXCHANGE ============== */}
        <TabsContent value="exchange" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ArrowRightLeft className="h-4 w-4 text-primary" /> Beans → Diamonds Exchange
              </CardTitle>
              <CardDescription>
                Used when an agency owner converts host beans into diamonds for personal use.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Beans → Diamonds rate" hint="1 bean = X diamonds">
                  <Input
                    type="number"
                    step="0.01"
                    value={NUM(coinExchange?.beans_to_diamonds_rate)}
                    onChange={(e) =>
                      setCoinExchange({ ...(coinExchange ?? {}), beans_to_diamonds_rate: inputNumber(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Exchange fee %">
                  <Input
                    type="number"
                    step="0.1"
                    value={NUM(coinExchange?.exchange_fee_percent)}
                    onChange={(e) =>
                      setCoinExchange({ ...(coinExchange ?? {}), exchange_fee_percent: inputNumber(e.target.value) })
                    }
                  />
                </Field>
                <Field label="Min exchange amount (beans)">
                  <Input
                    type="number"
                    value={NUM(coinExchange?.min_exchange_amount)}
                    onChange={(e) =>
                      setCoinExchange({ ...(coinExchange ?? {}), min_exchange_amount: inputNumber(e.target.value) })
                    }
                  />
                </Field>
              </div>
              <Button
                onClick={() => saveSection("coin_exchange", coinExchange, "Beans→Diamonds exchange")}
                disabled={saving === "coin_exchange"}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving === "coin_exchange" ? "Saving..." : "Save Exchange"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============== HELPER ============== */}
        <TabsContent value="helper" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Crown className="h-4 w-4 text-primary" /> Level-5 Helper Recharge Fee Split
              </CardTitle>
              <CardDescription>
                Used when an agency Level-5 helper tops-up a host's diamond balance via the Helper
                Recharge flow (`helper_fee_settings`).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Platform fee %" hint="Company keeps this % of recharge value">
                  <Input
                    type="number"
                    step="0.1"
                    value={NUM(helperFeeSettings.platform_fee_percent)}
                    onChange={(e) =>
                      setHelperFeeSettings({
                        ...helperFeeSettings,
                        platform_fee_percent: inputNumber(e.target.value),
                      })
                    }
                  />
                </Field>
                <Field label="Helper receives %" hint="Helper earns this % as commission">
                  <Input
                    type="number"
                    step="0.1"
                    value={NUM(helperFeeSettings.helper_receives_percent)}
                    onChange={(e) =>
                      setHelperFeeSettings({
                        ...helperFeeSettings,
                        helper_receives_percent: inputNumber(e.target.value),
                      })
                    }
                  />
                </Field>
              </div>
              {helperFeeSettings.platform_fee_percent !== "" && helperFeeSettings.helper_receives_percent !== "" && (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
                  <div className="font-semibold text-primary">Live Calculation Preview</div>
                  <div>Example: 10,000-diamond helper recharge</div>
                  <div>• Platform fee: <strong>{Math.floor(10000 * Number(helperFeeSettings.platform_fee_percent) / 100).toLocaleString()} diamonds</strong> ({helperFeeSettings.platform_fee_percent}%)</div>
                  <div>• Helper earns: <strong>{Math.floor(10000 * Number(helperFeeSettings.helper_receives_percent) / 100).toLocaleString()} diamonds</strong> ({helperFeeSettings.helper_receives_percent}%)</div>
                </div>
              )}
              <Button
                onClick={() =>
                  saveSection(
                    "helper_fee_settings",
                    {
                      platform_fee_percent: helperFeeSettings.platform_fee_percent,
                      helper_receives_percent: helperFeeSettings.helper_receives_percent,
                    },
                    "Helper fee split"
                  )
                }
                disabled={saving === "helper_fee_settings"}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving === "helper_fee_settings" ? "Saving..." : "Save Helper Fee"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Helper Diamond Commission</CardTitle>
              <CardDescription>
                Percentage commission the helper earns on every diamond top-up they fulfil.
                Treated as 0 if blank.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Helper diamond commission %" hint="e.g. 3 = helper earns 3% on every diamond sold">
                  <Input
                    type="number"
                    step="0.1"
                    value={NUM(helperDiamondCommission)}
                    onChange={(e) =>
                      setHelperDiamondCommission(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </Field>
              </div>
              <Button
                onClick={() =>
                  saveSection(
                    "helper_diamond_commission",
                    { rate: helperDiamondCommission },
                    "Helper diamond commission"
                  )
                }
                disabled={saving === "helper_diamond_commission"}
              >
                <Save className="h-4 w-4 mr-2" />
                {saving === "helper_diamond_commission" ? "Saving..." : "Save Helper Commission"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Crown className="h-4 w-4 text-primary" /> Trader Wallet Top-up Rate
              </CardTitle>
              <CardDescription>
                USD price per 100,000 diamonds when an admin approves a helper Trader Wallet
                top-up request. Read by <code>get_trader_wallet_topup_rate()</code> and the
                admin approve modal (`app_settings.trader_wallet_topup_rate.usd_per_100k_diamonds`).
                Blank = no rate configured (approval will be blocked).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label="USD per 100,000 💎"
                  hint="e.g. 100 = $100 buys 100,000 diamonds for the helper's Trader Wallet"
                >
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={NUM(traderWalletTopupRate)}
                    onChange={(e) =>
                      setTraderWalletTopupRate(
                        e.target.value === "" ? "" : Number(e.target.value)
                      )
                    }
                  />
                </Field>
              </div>
              {traderWalletTopupRate !== "" && Number(traderWalletTopupRate) > 0 && (
                <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
                  <div className="font-semibold text-primary">Live Calculation Preview</div>
                  <div>
                    • $10 USD →{" "}
                    <strong>
                      {Math.floor((10 / Number(traderWalletTopupRate)) * 100000).toLocaleString()} 💎
                    </strong>
                  </div>
                  <div>
                    • $100 USD →{" "}
                    <strong>
                      {Math.floor((100 / Number(traderWalletTopupRate)) * 100000).toLocaleString()} 💎
                    </strong>
                  </div>
                </div>
              )}
              <Button
                onClick={() =>
                  saveSection(
                    "trader_wallet_topup_rate",
                    { usd_per_100k_diamonds: traderWalletTopupRate },
                    "Trader Wallet top-up rate"
                  )
                }
                disabled={
                  saving === "trader_wallet_topup_rate" ||
                  traderWalletTopupRate === "" ||
                  Number(traderWalletTopupRate) <= 0
                }
              >
                <Save className="h-4 w-4 mr-2" />
                {saving === "trader_wallet_topup_rate" ? "Saving..." : "Save Top-up Rate"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card className="border-dashed">
        <CardContent className="pt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>All values pulled live from `app_settings` + `agency_level_tiers`. No hardcoded defaults.</span>
          <Button size="sm" variant="ghost" onClick={loadAll}>
            <RefreshCw className="h-3 w-3 mr-1" /> Reload
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
