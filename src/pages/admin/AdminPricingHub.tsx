import { useEffect, useState, useCallback } from "react";
import {
  Save,
  Phone,
  Gift,
  Building2,
  Wallet,
  ArrowRightLeft,
  Percent,
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
        ]);
      if (error) throw error;

      const map: Record<string, any> = {};
      data?.forEach((row) => {
        map[row.setting_key] = parseSettingValue(row.setting_value);
      });

      setCallRates(map.call_rates ?? null);
      setGiftCommission({
        host_percent: map.gift_commission?.host_percent ?? "",
        company_percent: map.gift_commission?.company_percent ?? "",
      });
      setAgencyCommission(map.agency_commission ?? null);
      setWithdrawal(map.withdrawal_settings ?? null);

      // Fee settings can be stored as numeric or {rate: x}
      const aw = map.agency_withdrawal_fee;
      setAgencyWithdrawalFee(typeof aw === "number" ? aw : aw?.rate ?? aw?.percent ?? "");

      const hd = map.helper_diamond_commission;
      setHelperDiamondCommission(typeof hd === "number" ? hd : hd?.rate ?? hd?.percent ?? "");

      setHelperFeeSettings({
        platform_fee_percent: map.helper_fee_settings?.platform_fee_percent ?? "",
        helper_receives_percent: map.helper_fee_settings?.helper_receives_percent ?? "",
      });

      setCoinExchange(map.coin_exchange ?? null);

      // Load agency_level_tiers
      const { data: tierData, error: tierErr } = await supabase
        .from("agency_level_tiers")
        .select("*")
        .order("display_order", { ascending: true });
      if (tierErr) throw tierErr;
      setTiers((tierData as AgencyLevelTier[]) ?? []);
    } catch (e: any) {
      console.error(e);
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
              {!callRates ? (
                <p className="text-sm text-muted-foreground">Not configured.</p>
              ) : (
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
                    <Field label="Host commission %" hint="Company gets the remainder. Strict 21s rule applies on settlement.">
                      <Input
                        type="number"
                        value={NUM(callRates.host_commission_percent)}
                        onChange={(e) =>
                          setCallRates({ ...callRates, host_commission_percent: inputNumber(e.target.value) })
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
                    <Label className="text-sm font-semibold">Per-Level Rates (diamonds/min)</Label>
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
              )}
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
                <Field label="Company keeps %">
                  <Input
                    type="number"
                    value={NUM(giftCommission.company_percent)}
                    onChange={(e) =>
                      setGiftCommission({ ...giftCommission, company_percent: inputNumber(e.target.value) })
                    }
                  />
                </Field>
              </div>
              <Button
                onClick={() =>
                  saveSection(
                    "gift_commission",
                    {
                      host_percent: giftCommission.host_percent,
                      company_percent: giftCommission.company_percent,
                      description: `Company takes ${giftCommission.company_percent}%, Host receives ${giftCommission.host_percent}%`,
                    },
                    "Gift commission"
                  )
                }
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
              <CardTitle className="text-base">Withdrawal & Helper Fees</CardTitle>
              <CardDescription>
                Percentage fees applied during withdrawal processing. Treated as 0 if blank.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Agency withdrawal fee %" hint="Deducted from withdrawal beans before USD conversion">
                  <Input
                    type="number"
                    step="0.1"
                    value={NUM(agencyWithdrawalFee)}
                    onChange={(e) => setAgencyWithdrawalFee(e.target.value === "" ? "" : Number(e.target.value))}
                  />
                </Field>
                <Field label="Helper diamond commission %">
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
              <div className="flex gap-2">
                <Button
                  onClick={() =>
                    saveSection(
                      "agency_withdrawal_fee",
                      { rate: agencyWithdrawalFee },
                      "Agency withdrawal fee"
                    )
                  }
                  disabled={saving === "agency_withdrawal_fee"}
                  variant="outline"
                  size="sm"
                >
                  <Save className="h-3 w-3 mr-1" />
                  Save Withdrawal Fee
                </Button>
                <Button
                  onClick={() =>
                    saveSection(
                      "helper_diamond_commission",
                      { rate: helperDiamondCommission },
                      "Helper diamond commission"
                    )
                  }
                  disabled={saving === "helper_diamond_commission"}
                  variant="outline"
                  size="sm"
                >
                  <Save className="h-3 w-3 mr-1" />
                  Save Helper Commission
                </Button>
              </div>
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
                <Crown className="h-4 w-4 text-primary" /> Helper / Agency-Recharge Fee Split
              </CardTitle>
              <CardDescription>
                Used when an agency helper tops-up a host's diamond balance via the Helper Recharge
                flow (`helper_fee_settings`).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Platform fee %">
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
                <Field label="Helper receives %">
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
