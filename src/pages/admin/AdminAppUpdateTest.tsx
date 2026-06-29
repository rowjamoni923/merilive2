import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FlaskConical, Rocket, Trash2, PlayCircle, AlertTriangle } from "lucide-react";
import {
  APP_UPDATE_DISMISSED_VERSION_KEY,
  APP_UPDATE_PROMPT_STATE_KEY,
  APP_UPDATE_TEST_OVERRIDE_KEY,
  APP_UPDATE_TEST_TRIGGER_EVENT,
} from "@/hooks/useAppUpdate";

interface TestOverride {
  forceUpdate: boolean;
  currentVersion: string;
  availableVersion: string;
  currentVersionCode: number;
  availableVersionCode: number;
  updateMessage: string;
  playStoreUrl: string;
}

const DEFAULTS: TestOverride = {
  forceUpdate: true,
  currentVersion: "8.2.13",
  availableVersion: "9.0.0",
  currentVersionCode: 80213,
  availableVersionCode: 90000,
  updateMessage:
    "[TEST MODE] Simulated forced update — verify modal renders, dismiss is disabled when forced, and Update Now opens the Play Store.",
  playStoreUrl: "https://play.google.com/store/apps/details?id=com.merilive.app",
};

const AdminAppUpdateTest = () => {
  const [override, setOverride] = useState<TestOverride>(DEFAULTS);
  const [active, setActive] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(APP_UPDATE_TEST_OVERRIDE_KEY);
      if (raw) {
        setOverride({ ...DEFAULTS, ...JSON.parse(raw) });
        setActive(true);
      }
    } catch {}
  }, []);

  const persist = (next: TestOverride) => {
    localStorage.setItem(APP_UPDATE_TEST_OVERRIDE_KEY, JSON.stringify(next));
    setActive(true);
  };

  const handleEnable = () => {
    persist(override);
    window.dispatchEvent(new CustomEvent(APP_UPDATE_TEST_TRIGGER_EVENT));
    toast.success("Test mode enabled — modal will appear on this device.", {
      description: "Open any page in the same browser tab to see the simulated update modal.",
    });
  };

  const handleTriggerNow = () => {
    persist(override);
    window.dispatchEvent(new CustomEvent(APP_UPDATE_TEST_TRIGGER_EVENT));
    toast.success("Triggered — switch to a non-admin page to see the modal.");
  };

  const handleClear = () => {
    localStorage.removeItem(APP_UPDATE_TEST_OVERRIDE_KEY);
    localStorage.removeItem(APP_UPDATE_PROMPT_STATE_KEY);
    localStorage.removeItem(APP_UPDATE_DISMISSED_VERSION_KEY);
    setActive(false);
    toast.success("Test mode and prompt memory cleared. Reload the app to restore normal flow.");
  };

  const setField = <K extends keyof TestOverride>(key: K, value: TestOverride[K]) =>
    setOverride((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="p-4 md:p-6 space-y-6 bg-white min-h-screen">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <FlaskConical className="w-6 h-6 text-blue-600" />
            App Update — Test Mode
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Simulate a forced or optional update without publishing a new APK. The override is
            stored in this browser's localStorage and applied by the update hook on the next page
            load (or immediately via the Trigger Now button).
          </p>
        </div>
        {active ? (
          <Badge className="bg-emerald-500 text-white shrink-0">Test mode ACTIVE</Badge>
        ) : (
          <Badge variant="secondary" className="shrink-0">Inactive</Badge>
        )}
      </div>

      <Card className="border-amber-200 bg-amber-50 shadow-sm">
        <CardContent className="p-4 flex gap-3 text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <strong>Scope:</strong> This test override only affects the current browser / device
            (it lives in localStorage). It does <strong>not</strong> change any real version
            settings and does <strong>not</strong> affect other users. Clear it when QA is done.
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Simulated payload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <div>
              <Label className="text-sm font-semibold text-slate-800">Force update</Label>
              <p className="text-xs text-slate-500">
                When ON the dismiss button is hidden and the modal cannot be closed.
              </p>
            </div>
            <Switch
              checked={override.forceUpdate}
              onCheckedChange={(v) => setField("forceUpdate", v)}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Current version (device)</Label>
              <Input
                value={override.currentVersion}
                onChange={(e) => setField("currentVersion", e.target.value)}
                placeholder="8.2.13"
              />
            </div>
            <div>
              <Label className="text-xs">Current version code</Label>
              <Input
                type="number"
                value={override.currentVersionCode}
                onChange={(e) => setField("currentVersionCode", Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label className="text-xs">Available version (server target)</Label>
              <Input
                value={override.availableVersion}
                onChange={(e) => setField("availableVersion", e.target.value)}
                placeholder="9.0.0"
              />
            </div>
            <div>
              <Label className="text-xs">Available version code</Label>
              <Input
                type="number"
                value={override.availableVersionCode}
                onChange={(e) => setField("availableVersionCode", Number(e.target.value) || 0)}
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">Update message</Label>
            <Textarea
              rows={3}
              value={override.updateMessage}
              onChange={(e) => setField("updateMessage", e.target.value)}
            />
          </div>

          <div>
            <Label className="text-xs">Play Store URL</Label>
            <Input
              value={override.playStoreUrl}
              onChange={(e) => setField("playStoreUrl", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={handleEnable} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Rocket className="w-4 h-4 mr-2" />
          Enable test mode
        </Button>
        <Button onClick={handleTriggerNow} variant="outline">
          <PlayCircle className="w-4 h-4 mr-2" />
          Trigger now (same tab)
        </Button>
        <Button onClick={handleClear} variant="outline" className="text-red-600 hover:text-red-700">
          <Trash2 className="w-4 h-4 mr-2" />
          Clear test mode
        </Button>
      </div>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">QA checklist</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 space-y-2">
          <p>1. Enable test mode → navigate to <code className="text-xs bg-slate-100 px-1 rounded">/</code> (home). The premium update modal must appear.</p>
          <p>2. When <strong>Force update</strong> is ON: the dismiss button must be hidden / disabled and tapping outside must NOT close the modal.</p>
          <p>3. Tap <strong>Update Now</strong> → Play Store URL must open; the dismissed-version flag is persisted so the modal won't re-appear immediately.</p>
          <p>4. Turn force OFF, re-enable test mode, reload → modal should appear with a working Dismiss button.</p>
          <p>5. Check the <strong>App Update Logs</strong> page to confirm the store-open / dismiss outcomes are recorded.</p>
          <p>6. Click <strong>Clear test mode</strong> and reload — all test override / prompt memory clears and real version logic resumes.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAppUpdateTest;
