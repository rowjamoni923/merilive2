/**
 * Pkg129 UI — Host Auto-Record toggle.
 *
 * Host opt-in once → every new active live_streams INSERT auto-fires a
 * room-composite MP4 egress server-side (tg_auto_record_on_stream_start →
 * livekit-auto-record edge fn).
 *
 * Self-gating: renders nothing if the current user is not a host (is_host).
 * Reads + writes profiles.auto_record_live via livekitAutoRecord client lib.
 * Zero new Supabase channels / polls / cross-user reads.
 */
import { useCallback, useEffect, useState } from "react";
import { Loader2, Video } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getAutoRecordPreference,
  setAutoRecordPreference,
} from "@/lib/livekitAutoRecord";

export const AutoRecordSettingsRow = () => {
  const [isHost, setIsHost] = useState<boolean | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (!cancelled) setIsHost(false);
          return;
        }
        // Own-row read — RLS safe (no cross-user select).
        const { data } = await supabase
          .from("profiles")
          .select("is_host")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        setIsHost(!!data?.is_host);
        if (data?.is_host) {
          const pref = await getAutoRecordPreference();
          if (!cancelled) setEnabled(!!pref);
        }
      } catch {
        if (!cancelled) setIsHost(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = useCallback(
    async (next: boolean) => {
      setSaving(true);
      try {
        const ok = await setAutoRecordPreference(next);
        if (ok) {
          setEnabled(next);
          toast.success(
            next ? "Auto-record enabled" : "Auto-record disabled",
          );
        } else {
          toast.error("Couldn't update preference. Try again.");
        }
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  if (!isHost) return null;

  return (
    <div className="w-full flex items-center justify-between px-4 py-4 border-b">
      <div className="flex items-center gap-3">
        <Video className="w-5 h-5 text-muted-foreground" />
        <div className="flex flex-col text-left">
          <span className="text-foreground">Auto-Record Live</span>
          <span className="text-[11px] text-muted-foreground">
            Save every live stream to your recordings automatically
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {saving && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={saving}
          aria-label="Auto-record live streams"
        />
      </div>
    </div>
  );
};

export default AutoRecordSettingsRow;
