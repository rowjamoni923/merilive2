import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Eye, EyeOff, RefreshCw, CheckCircle2, XCircle, Video, Phone, PartyPopper, AlertTriangle, Power } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { saveAppSetting } from "@/utils/adminSettingsStorage";

export default function AdminAgoraSettings() {
  const [appId, setAppId] = useState("");
  const [appCertificate, setAppCertificate] = useState("");
  const [showCertificate, setShowCertificate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [forceStoppingAll, setForceStoppingAll] = useState(false);
  const [activeStreamCount, setActiveStreamCount] = useState(0);

  useEffect(() => {
    fetchSettings();
    fetchActiveStreamCount();
  }, []);

  useAdminRealtime(['app_settings', 'live_streams'], () => { fetchSettings(); fetchActiveStreamCount(); });

  const fetchActiveStreamCount = async () => {
    try {
      const { count } = await supabase
        .from("live_streams")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true);
      setActiveStreamCount(count || 0);
    } catch (e) {
      console.error("Error fetching active stream count:", e);
    }
  };

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from("app_settings")
        .select("setting_key, setting_value, updated_at")
        .in("setting_key", ["agora_app_id", "agora_app_certificate"]);

      if (error) throw error;

      data?.forEach((item: any) => {
        if (item.setting_key === "agora_app_id") {
          setAppId((item.setting_value as string) || "");
          setLastUpdated(item.updated_at);
        }
        if (item.setting_key === "agora_app_certificate") {
          setAppCertificate((item.setting_value as string) || "");
        }
      });
    } catch (err) {
      console.error("Error fetching Agora settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!appId.trim()) {
      toast.error("App ID is required");
      return;
    }

    setSaving(true);
    try {
      const settings = [
        { setting_key: "agora_app_id", setting_value: appId.trim(), description: "Agora RTC App ID" },
        { setting_key: "agora_app_certificate", setting_value: appCertificate.trim(), description: "Agora RTC App Certificate" },
      ];

      for (const setting of settings) {
        await saveAppSetting(setting.setting_key, setting.setting_value, setting.description);
      }

      setLastUpdated(new Date().toISOString());
      toast.success("✅ Agora credentials saved! Live streams, calls, and party rooms will use the new credentials.");
    } catch (err: any) {
      console.error("Error saving Agora settings:", err);
      toast.error("Failed to save: " + (err.message || "Unknown error"));
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("agora-token", {
        body: { channelName: "test_connection_check", uid: 99999, role: "subscriber" },
      });

      if (error) throw error;
      if (data?.token) {
        setTestResult("success");
        toast.success("✅ Agora connection successful! Token generated.");
      } else {
        setTestResult("error");
        toast.error("Token generation failed");
      }
    } catch (err: any) {
      setTestResult("error");
      toast.error("Connection test failed: " + (err.message || "Unknown error"));
    } finally {
      setTesting(false);
    }
  };

  const forceStopAllStreams = async () => {
    setForceStoppingAll(true);
    try {
      const now = new Date().toISOString();

      // 1. End all active streams
      const { error: streamError } = await supabase
        .from("live_streams")
        .update({ is_active: false, ended_at: now, viewer_count: 0 })
        .eq("is_active", true);

      if (streamError) throw streamError;

      // 2. Clear all active viewers
      const { error: viewerError } = await supabase
        .from("stream_viewers")
        .update({ left_at: now })
        .is("left_at", null);

      if (viewerError) throw viewerError;

      // 3. Trigger global app reentry so all clients reload
      await supabase
        .from("app_settings")
        .update({ setting_value: Date.now().toString(), updated_at: now })
        .eq("setting_key", "global_app_reentry");

      setActiveStreamCount(0);
      toast.success("✅ All live streams have been stopped! All users will auto-reload.");
    } catch (err: any) {
      console.error("Force stop error:", err);
      toast.error("Failed: " + (err.message || "Unknown error"));
    } finally {
      setForceStoppingAll(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Agora RTC Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure Agora credentials for Live Streaming, Private Calls, and Party Rooms.
        </p>
      </div>

      {/* Status Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex gap-2">
                <Badge variant="outline" className="gap-1"><Video className="w-3 h-3" /> Live</Badge>
                <Badge variant="outline" className="gap-1"><Phone className="w-3 h-3" /> Calls</Badge>
                <Badge variant="outline" className="gap-1"><PartyPopper className="w-3 h-3" /> Party</Badge>
              </div>
            </div>
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Last updated: {new Date(lastUpdated).toLocaleString()}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Credentials Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Agora Credentials</CardTitle>
          <CardDescription>
            Get these from <a href="https://console.agora.io" target="_blank" rel="noopener noreferrer" className="text-primary underline">console.agora.io</a> → Your Project → Configure
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="appId">App ID *</Label>
            <Input
              id="appId"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="e.g., bad7adbb1f9e4fd3bc519fc704e22803"
              className="font-mono text-sm"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="certificate">Primary Certificate (App Certificate)</Label>
            <div className="relative">
              <Input
                id="certificate"
                type={showCertificate ? "text" : "password"}
                value={appCertificate}
                onChange={(e) => setAppCertificate(e.target.value)}
                placeholder="Enter your App Certificate"
                className="font-mono text-sm pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCertificate(!showCertificate)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showCertificate ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button onClick={saveSettings} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save Credentials
            </Button>

            <Button variant="outline" onClick={testConnection} disabled={testing} className="gap-2">
              {testing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : testResult === "success" ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : testResult === "error" ? (
                <XCircle className="w-4 h-4 text-red-500" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Test Connection
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Emergency: Force Stop All Streams */}
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            Emergency Controls
          </CardTitle>
          <CardDescription>
            Stop all live streams and remove all users. They can rejoin later.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Active Streams: <span className="text-destructive font-bold">{activeStreamCount}</span></p>
              <p className="text-xs text-muted-foreground">Force stop will end all streams and reload all users' apps</p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={forceStoppingAll || activeStreamCount === 0} className="gap-2">
                  {forceStoppingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                  Force Stop All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>⚠️ Stop All Streams?</AlertDialogTitle>
                   <AlertDialogDescription>
                     This will stop {activeStreamCount} active streams, remove all viewers, and reload all users' apps. Hosts can start new streams later.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={forceStopAllStreams} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Yes, Stop All Streams
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📋 Setup Guide</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="space-y-2">
            <p><strong>1.</strong> Go to <a href="https://console.agora.io" target="_blank" rel="noopener noreferrer" className="text-primary underline">Agora Console</a></p>
            <p><strong>2.</strong> Select your project (e.g., "meri live")</p>
            <p><strong>3.</strong> Copy the <strong>App ID</strong></p>
            <p><strong>4.</strong> Click <strong>Configure</strong> → copy <strong>Primary Certificate</strong></p>
            <p><strong>5.</strong> Paste both values above and click <strong>Save</strong></p>
            <p><strong>6.</strong> Click <strong>Test Connection</strong> to verify</p>
          </div>
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg mt-4">
            <p className="text-amber-600 dark:text-amber-400 font-medium">
              ⚠️ After saving, all new live streams, calls, and party rooms will use the updated credentials immediately.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
