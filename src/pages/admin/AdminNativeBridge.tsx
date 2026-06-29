/**
 * AdminNativeBridge — runtime kill-switch UI for the native Android
 * LiveKit publish path. Flips `app_settings.native_livekit_enabled`,
 * which the gate (`shouldUseNativeLiveKit`) reads with realtime sync.
 *
 * Default = ENABLED (fail-open). Disabling forces every Android client
 * back onto the web livekit-client path on its next join, with no
 * redeploy. Web/iOS clients ignore this flag entirely.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Antenna, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { loadAppSetting, saveAppSetting } from "@/utils/adminSettingsStorage";
import { recordAdminError } from "@/utils/adminErrorLog";
import { formatAdminError } from "@/utils/formatAdminError";

const SETTING_KEY = "native_livekit_enabled";

const AdminNativeBridge = () => {
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const value = await loadAppSetting<boolean | string>(SETTING_KEY);
      // Default to TRUE when row missing (fail-open, matches gate).
      if (value === null || value === undefined) setEnabled(true);
      else if (typeof value === "boolean") setEnabled(value);
      else if (typeof value === "string") setEnabled(value.toLowerCase() !== "false");
      else setEnabled(Boolean(value));
    } catch (err) {
      recordAdminError({ kind: "rpc", label: "AdminNativeBridge.load", message: formatAdminError(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const toggle = async (next: boolean) => {
    setSaving(true);
    setEnabled(next); // optimistic
    try {
      await saveAppSetting(SETTING_KEY, next, "Native Android LiveKit publish path kill-switch");
      toast.success(next ? "Native bridge enabled" : "Native bridge disabled — Android clients will fall back to web on next join");
    } catch (err) {
      setEnabled(!next); // revert
      recordAdminError({ kind: "rpc", label: "AdminNativeBridge.save", message: formatAdminError(err) });
      toast.error("Failed to update kill-switch");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-pro-shell">
    <Card className="border-[hsl(var(--admin-border-light)/0.7)] bg-[hsl(var(--admin-card)/0.68)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-[hsl(var(--admin-text))]">
          <Antenna className="h-5 w-5 text-[hsl(var(--admin-gold))]" />
          Native Android Bridge
          <Badge variant={enabled ? "default" : "secondary"} className="ml-auto">
            {loading ? "Loading…" : enabled ? "Enabled" : "Disabled"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-[hsl(var(--admin-text-secondary))]">
        <p>
          Routes Live broadcast & Private Call publishing through the native LiveKit Android SDK
          (Capacitor plugin) instead of the browser's <code>getUserMedia</code>. Disable to force
          every Android client back to the web path on the next join — useful as an emergency
          rollback. Web and iOS clients are unaffected.
        </p>

        <div className="flex items-center justify-between rounded-lg border border-[hsl(var(--admin-border-light)/0.6)] bg-[hsl(var(--admin-bg)/0.4)] p-4">
          <div className="space-y-1">
            <Label htmlFor="native-bridge-toggle" className="text-[hsl(var(--admin-text))] font-medium">
              Native publish path
            </Label>
            <p className="text-xs">
              Default: enabled. Setting takes effect on each client's next join (realtime push, no
              app restart needed).
            </p>
          </div>
          <div className="flex items-center gap-2">
            {(loading || saving) && <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--admin-gold))]" />}
            <Switch
              id="native-bridge-toggle"
              checked={enabled}
              disabled={loading || saving}
              onCheckedChange={toggle}
            />
          </div>
        </div>

        <p className="text-xs italic">
          Storage key: <code>app_settings.native_livekit_enabled</code>. Absence of the row =
          enabled (fail-open).
        </p>
      </CardContent>
    </Card>
  );
};

export default AdminNativeBridge;
