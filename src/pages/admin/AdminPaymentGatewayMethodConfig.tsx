import { useState, useEffect, useCallback } from "react";
import { CreditCard, Save, RefreshCw, Plus, Trash2, Wand2, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { loadAppSetting, saveAppSetting } from "@/utils/adminSettingsStorage";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";
import { recordAdminError } from "@/utils/adminErrorLog";

const SETTING_KEY = "payment_gateway_method_config";

type RouteType = "manual" | "auto";
type WebhookVerification = "required" | "optional" | "none";

interface GatewayEntry {
  method_name: string;
  route_type: RouteType;
  gateway_type: string;
  logo_url: string;
  enabled: boolean;
  webhook_verification?: WebhookVerification;
}

interface CountryEntry {
  currency: string;
  gateways: GatewayEntry[];
}

interface FraudControls {
  require_unique_gateway_txn_id: boolean;
  require_signed_webhook_for_auto_verify: boolean;
  block_credit_without_provider_verify: boolean;
  max_failed_verify_attempts: number;
}

interface Defaults {
  min_methods_per_country: number;
  max_methods_per_country: number;
  enforce_admin_allowlist: boolean;
  require_logo_for_recommended: boolean;
  allow_manual_fallback_on_auto: boolean;
  fraud_controls: FraudControls;
}

interface AutoCreditPolicy {
  credit_after: string;
  reject_on_verify_timeout_seconds: number;
  notify_admin_on_risk: boolean;
  notify_helper_on_auto_credit: boolean;
}

interface DiamondStoreRecommended {
  logo_source_priority: string[];
  hide_methods_without_logo: boolean;
}

interface PaymentGatewayMethodConfig {
  version: number;
  setting_key: string;
  description: string;
  defaults: Defaults;
  countries: Record<string, CountryEntry>;
  auto_credit_policy: AutoCreditPolicy;
  diamond_store_recommended: DiamondStoreRecommended;
}

const DEFAULT_CONFIG: PaymentGatewayMethodConfig = {
  version: 1,
  setting_key: "payment_gateway_method_config",
  description:
    "Admin AI preset for L5 helper country payment methods, auto/manual routing, and logo-safe availability.",
  defaults: {
    min_methods_per_country: 3,
    max_methods_per_country: 4,
    enforce_admin_allowlist: true,
    require_logo_for_recommended: true,
    allow_manual_fallback_on_auto: true,
    fraud_controls: {
      require_unique_gateway_txn_id: true,
      require_signed_webhook_for_auto_verify: true,
      block_credit_without_provider_verify: true,
      max_failed_verify_attempts: 3,
    },
  },
  countries: {
    BD: {
      currency: "BDT",
      gateways: [
        { method_name: "bKash", route_type: "manual", gateway_type: "manual", logo_url: "https://cdn.example.com/payments/bkash.png", enabled: true },
        { method_name: "Nagad", route_type: "manual", gateway_type: "manual", logo_url: "https://cdn.example.com/payments/nagad.png", enabled: true },
        { method_name: "Rocket", route_type: "manual", gateway_type: "manual", logo_url: "https://cdn.example.com/payments/rocket.png", enabled: true },
        { method_name: "bKash", route_type: "auto", gateway_type: "zinipay", logo_url: "https://cdn.example.com/payments/zinipay.png", enabled: true, webhook_verification: "required" },
      ],
    },
    IN: {
      currency: "INR",
      gateways: [
        { method_name: "UPI", route_type: "manual", gateway_type: "manual", logo_url: "https://cdn.example.com/payments/upi.png", enabled: true },
        { method_name: "PhonePe", route_type: "manual", gateway_type: "manual", logo_url: "https://cdn.example.com/payments/phonepe.png", enabled: true },
        { method_name: "Paytm", route_type: "manual", gateway_type: "manual", logo_url: "https://cdn.example.com/payments/paytm.png", enabled: true },
        { method_name: "UPI", route_type: "auto", gateway_type: "razorpay", logo_url: "https://cdn.example.com/payments/razorpay.png", enabled: true, webhook_verification: "required" },
      ],
    },
  },
  auto_credit_policy: {
    credit_after: "provider_verified",
    reject_on_verify_timeout_seconds: 600,
    notify_admin_on_risk: true,
    notify_helper_on_auto_credit: true,
  },
  diamond_store_recommended: {
    logo_source_priority: [
      "helper_country_payment_methods.logo_url",
      "topup_payment_methods.icon_url",
      "payment_gateways.logo_url",
    ],
    hide_methods_without_logo: true,
  },
};

const cloneDefault = (): PaymentGatewayMethodConfig =>
  JSON.parse(JSON.stringify(DEFAULT_CONFIG));

const AdminPaymentGatewayMethodConfig = () => {
  const [config, setConfig] = useState<PaymentGatewayMethodConfig>(cloneDefault());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newCountryCode, setNewCountryCode] = useState("");
  const [newCountryCurrency, setNewCountryCurrency] = useState("");
  const [logoPriorityText, setLogoPriorityText] = useState(
    DEFAULT_CONFIG.diamond_store_recommended.logo_source_priority.join("\n"),
  );

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await loadAppSetting<PaymentGatewayMethodConfig | null>(SETTING_KEY);
      if (data && typeof data === "object") {
        const merged: PaymentGatewayMethodConfig = {
          ...cloneDefault(),
          ...data,
          defaults: { ...DEFAULT_CONFIG.defaults, ...(data as any).defaults, fraud_controls: { ...DEFAULT_CONFIG.defaults.fraud_controls, ...((data as any).defaults?.fraud_controls || {}) } },
          countries: (data as any).countries || {},
          auto_credit_policy: { ...DEFAULT_CONFIG.auto_credit_policy, ...(data as any).auto_credit_policy },
          diamond_store_recommended: { ...DEFAULT_CONFIG.diamond_store_recommended, ...(data as any).diamond_store_recommended },
        };
        setConfig(merged);
        setLogoPriorityText((merged.diamond_store_recommended.logo_source_priority || []).join("\n"));
      }
    } catch (error) {
      recordAdminError({
        kind: "other",
        label: "AdminPaymentGatewayMethodConfig.fetchConfig",
        message: error instanceof Error ? error.message : "Failed to load",
      });
      toast.error("Failed to load payment gateway method config");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  useAdminRealtime(["app_settings"], () => fetchConfig());

  const handleSave = async () => {
    const finalConfig: PaymentGatewayMethodConfig = {
      ...config,
      diamond_store_recommended: {
        ...config.diamond_store_recommended,
        logo_source_priority: logoPriorityText
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
      },
    };
    setSaving(true);
    try {
      await saveAppSetting(SETTING_KEY, finalConfig, "L5 helper payment gateway method config");
      setConfig(finalConfig);
      toast.success("Payment gateway method config saved");
    } catch (error) {
      recordAdminError({
        kind: "other",
        label: "AdminPaymentGatewayMethodConfig.save",
        message: error instanceof Error ? error.message : "Failed to save",
      });
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const loadPreset = () => {
    setConfig(cloneDefault());
    setLogoPriorityText(DEFAULT_CONFIG.diamond_store_recommended.logo_source_priority.join("\n"));
    toast.success("Default preset loaded — click Save to apply.");
  };

  const addCountry = () => {
    const code = newCountryCode.trim().toUpperCase();
    const currency = newCountryCurrency.trim().toUpperCase();
    if (!code || !currency) {
      toast.error("Country code and currency are required");
      return;
    }
    if (config.countries[code]) {
      toast.error(`Country ${code} already exists`);
      return;
    }
    setConfig((prev) => ({
      ...prev,
      countries: { ...prev.countries, [code]: { currency, gateways: [] } },
    }));
    setNewCountryCode("");
    setNewCountryCurrency("");
  };

  const removeCountry = (code: string) => {
    setConfig((prev) => {
      const next = { ...prev.countries };
      delete next[code];
      return { ...prev, countries: next };
    });
  };

  const updateCountryCurrency = (code: string, currency: string) => {
    setConfig((prev) => ({
      ...prev,
      countries: { ...prev.countries, [code]: { ...prev.countries[code], currency } },
    }));
  };

  const addGateway = (code: string) => {
    setConfig((prev) => ({
      ...prev,
      countries: {
        ...prev.countries,
        [code]: {
          ...prev.countries[code],
          gateways: [
            ...prev.countries[code].gateways,
            { method_name: "", route_type: "manual", gateway_type: "manual", logo_url: "", enabled: true },
          ],
        },
      },
    }));
  };

  const updateGateway = (code: string, idx: number, patch: Partial<GatewayEntry>) => {
    setConfig((prev) => {
      const list = [...prev.countries[code].gateways];
      list[idx] = { ...list[idx], ...patch };
      return {
        ...prev,
        countries: { ...prev.countries, [code]: { ...prev.countries[code], gateways: list } },
      };
    });
  };

  const removeGateway = (code: string, idx: number) => {
    setConfig((prev) => {
      const list = prev.countries[code].gateways.filter((_, i) => i !== idx);
      return {
        ...prev,
        countries: { ...prev.countries, [code]: { ...prev.countries[code], gateways: list } },
      };
    });
  };

  return (
    <div className="space-y-6 admin-content">
      <AdminPageHeader
        title="Payment Gateway Method Config"
        subtitle="Admin-controlled L5 helper country payment methods, auto/manual routing, fraud controls and logo policy"
        icon={CreditCard}
        onRefresh={fetchConfig}
        isRefreshing={loading}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Preset
          </CardTitle>
          <CardDescription>
            Load the canonical Android-team JSON preset (BD + IN, manual + auto). Then fine-tune below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={loadPreset} disabled={loading}>
            Load Default Preset
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Defaults</CardTitle>
          <CardDescription>Per-country method limits and recommendation policy.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Min methods per country</Label>
            <Input
              type="number"
              value={config.defaults.min_methods_per_country}
              onChange={(e) =>
                setConfig((p) => ({ ...p, defaults: { ...p.defaults, min_methods_per_country: Number(e.target.value) } }))
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>Max methods per country</Label>
            <Input
              type="number"
              value={config.defaults.max_methods_per_country}
              onChange={(e) =>
                setConfig((p) => ({ ...p, defaults: { ...p.defaults, max_methods_per_country: Number(e.target.value) } }))
              }
            />
          </div>
          {[
            { key: "enforce_admin_allowlist", label: "Enforce admin allowlist", desc: "Only admin-approved methods are exposed to users." },
            { key: "require_logo_for_recommended", label: "Require logo for recommended", desc: "Hide recommended methods that have no logo." },
            { key: "allow_manual_fallback_on_auto", label: "Allow manual fallback on auto", desc: "If auto provider fails, fall back to manual flow." },
          ].map((row) => (
            <div key={row.key} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 md:col-span-2">
              <div>
                <div className="text-sm font-medium">{row.label}</div>
                <div className="text-xs text-muted-foreground">{row.desc}</div>
              </div>
              <Switch
                checked={(config.defaults as any)[row.key]}
                onCheckedChange={(v) => setConfig((p) => ({ ...p, defaults: { ...p.defaults, [row.key]: v } }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fraud Controls</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            { key: "require_unique_gateway_txn_id", label: "Require unique gateway txn id" },
            { key: "require_signed_webhook_for_auto_verify", label: "Require signed webhook for auto verify" },
            { key: "block_credit_without_provider_verify", label: "Block credit without provider verify" },
          ].map((row) => (
            <div key={row.key} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
              <div className="text-sm font-medium">{row.label}</div>
              <Switch
                checked={(config.defaults.fraud_controls as any)[row.key]}
                onCheckedChange={(v) =>
                  setConfig((p) => ({
                    ...p,
                    defaults: { ...p.defaults, fraud_controls: { ...p.defaults.fraud_controls, [row.key]: v } },
                  }))
                }
              />
            </div>
          ))}
          <div className="space-y-1.5">
            <Label>Max failed verify attempts</Label>
            <Input
              type="number"
              value={config.defaults.fraud_controls.max_failed_verify_attempts}
              onChange={(e) =>
                setConfig((p) => ({
                  ...p,
                  defaults: { ...p.defaults, fraud_controls: { ...p.defaults.fraud_controls, max_failed_verify_attempts: Number(e.target.value) } },
                }))
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Countries & Gateways
          </CardTitle>
          <CardDescription>Add ISO country codes and configure manual/auto gateway methods.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed border-border p-3">
            <div className="space-y-1">
              <Label className="text-xs">Country code (ISO-2)</Label>
              <Input value={newCountryCode} onChange={(e) => setNewCountryCode(e.target.value)} placeholder="BD" className="w-28" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Currency</Label>
              <Input value={newCountryCurrency} onChange={(e) => setNewCountryCurrency(e.target.value)} placeholder="BDT" className="w-28" />
            </div>
            <Button onClick={addCountry} size="sm">
              <Plus className="mr-1 h-4 w-4" /> Add country
            </Button>
          </div>

          {Object.entries(config.countries).map(([code, country]) => (
            <Card key={code} className="border border-border">
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-base">{code}</Badge>
                  <Input
                    value={country.currency}
                    onChange={(e) => updateCountryCurrency(code, e.target.value.toUpperCase())}
                    className="w-24"
                  />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => addGateway(code)}>
                    <Plus className="mr-1 h-4 w-4" /> Gateway
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => removeCountry(code)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {country.gateways.length === 0 && (
                  <div className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
                    No gateways yet — click "Gateway" to add one.
                  </div>
                )}
                {country.gateways.map((g, idx) => (
                  <div key={idx} className="grid grid-cols-1 gap-2 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-12">
                    <div className="md:col-span-2 space-y-1">
                      <Label className="text-xs">Method name</Label>
                      <Input value={g.method_name} onChange={(e) => updateGateway(code, idx, { method_name: e.target.value })} placeholder="bKash" />
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <Label className="text-xs">Route</Label>
                      <Select value={g.route_type} onValueChange={(v) => updateGateway(code, idx, { route_type: v as RouteType })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="manual">manual</SelectItem>
                          <SelectItem value="auto">auto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <Label className="text-xs">Gateway type</Label>
                      <Input value={g.gateway_type} onChange={(e) => updateGateway(code, idx, { gateway_type: e.target.value })} placeholder="manual / zinipay / razorpay" />
                    </div>
                    <div className="md:col-span-3 space-y-1">
                      <Label className="text-xs">Logo URL</Label>
                      <Input value={g.logo_url} onChange={(e) => updateGateway(code, idx, { logo_url: e.target.value })} placeholder="https://..." />
                    </div>
                    <div className="md:col-span-2 space-y-1">
                      <Label className="text-xs">Webhook verify</Label>
                      <Select
                        value={g.webhook_verification || "none"}
                        onValueChange={(v) => updateGateway(code, idx, { webhook_verification: v === "none" ? undefined : (v as WebhookVerification) })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">none</SelectItem>
                          <SelectItem value="optional">optional</SelectItem>
                          <SelectItem value="required">required</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center justify-between md:col-span-1">
                      <Switch checked={g.enabled} onCheckedChange={(v) => updateGateway(code, idx, { enabled: v })} />
                      <Button size="sm" variant="ghost" onClick={() => removeGateway(code, idx)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    {g.logo_url && (
                      <div className="md:col-span-12 flex items-center gap-2 text-xs text-muted-foreground">
                        <img src={g.logo_url} alt={g.method_name} className="h-6 w-6 rounded bg-white object-contain" onError={(e) => ((e.currentTarget.style.display = "none"))} />
                        <span className="truncate">{g.logo_url}</span>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auto Credit Policy</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Credit after</Label>
            <Input
              value={config.auto_credit_policy.credit_after}
              onChange={(e) => setConfig((p) => ({ ...p, auto_credit_policy: { ...p.auto_credit_policy, credit_after: e.target.value } }))}
            />
            <p className="text-xs text-muted-foreground">e.g. provider_verified</p>
          </div>
          <div className="space-y-1.5">
            <Label>Reject on verify timeout (seconds)</Label>
            <Input
              type="number"
              value={config.auto_credit_policy.reject_on_verify_timeout_seconds}
              onChange={(e) => setConfig((p) => ({ ...p, auto_credit_policy: { ...p.auto_credit_policy, reject_on_verify_timeout_seconds: Number(e.target.value) } }))}
            />
          </div>
          {[
            { key: "notify_admin_on_risk", label: "Notify admin on risk" },
            { key: "notify_helper_on_auto_credit", label: "Notify helper on auto credit" },
          ].map((row) => (
            <div key={row.key} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
              <div className="text-sm font-medium">{row.label}</div>
              <Switch
                checked={(config.auto_credit_policy as any)[row.key]}
                onCheckedChange={(v) => setConfig((p) => ({ ...p, auto_credit_policy: { ...p.auto_credit_policy, [row.key]: v } }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diamond Store Recommended</CardTitle>
          <CardDescription>Logo source priority + visibility rules for the Diamond store.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>Logo source priority (one per line, in order)</Label>
            <textarea
              className="w-full min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={logoPriorityText}
              onChange={(e) => setLogoPriorityText(e.target.value)}
              placeholder={"helper_country_payment_methods.logo_url\ntopup_payment_methods.icon_url\npayment_gateways.logo_url"}
            />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
            <div>
              <div className="text-sm font-medium">Hide methods without logo</div>
              <div className="text-xs text-muted-foreground">Recommended methods missing a logo are hidden from users.</div>
            </div>
            <Switch
              checked={config.diamond_store_recommended.hide_methods_without_logo}
              onCheckedChange={(v) => setConfig((p) => ({ ...p, diamond_store_recommended: { ...p.diamond_store_recommended, hide_methods_without_logo: v } }))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 z-10 flex justify-end gap-2">
        <Button variant="outline" onClick={fetchConfig} disabled={loading || saving}>
          <RefreshCw className="mr-2 h-4 w-4" /> Reload
        </Button>
        <Button onClick={handleSave} disabled={saving || loading}>
          <Save className="mr-2 h-4 w-4" /> {saving ? "Saving…" : "Save Config"}
        </Button>
      </div>
    </div>
  );
};

export default AdminPaymentGatewayMethodConfig;
