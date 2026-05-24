import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, Gift, Phone, Users, Video, Coins, Award, Shield, Building2, HeadphonesIcon, Crown, Volume2, VolumeX, ShieldCheck, ShieldX } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { recordClientError } from "@/utils/clientErrorLog";
import { useAppSyncEvent } from "@/hooks/useAppSyncEvent";

interface NotificationCategory {
  key: string;
  label: string;
  description: string;
  icon: any;
}

const CATEGORIES: NotificationCategory[] = [
  { key: 'calls', label: 'Calls', description: 'Incoming calls, missed calls', icon: Phone },
  { key: 'gifts', label: 'Gifts', description: 'Gift sent & received', icon: Gift },
  { key: 'social', label: 'Social', description: 'New followers, messages', icon: Users },
  { key: 'live', label: 'Live & Party', description: 'Live streams, party invites', icon: Video },
  { key: 'transactions', label: 'Transactions', description: 'Top-up, withdrawal, diamonds', icon: Coins },
  { key: 'rewards', label: 'Rewards', description: 'Level up, tasks, bonuses', icon: Award },
  { key: 'system', label: 'System', description: 'Admin messages, security', icon: Shield },
  { key: 'agency', label: 'Agency', description: 'Agency notifications', icon: Building2 },
  { key: 'helper', label: 'Helper', description: 'Orders, payroll, level', icon: HeadphonesIcon },
  { key: 'host', label: 'Host', description: 'Application status', icon: Crown },
  { key: 'face_verification_approved', label: 'Face Verification — Approved', description: 'Notify when your face verification is approved', icon: ShieldCheck },
  { key: 'face_verification_rejected', label: 'Face Verification — Rejected', description: 'Notify when your face verification is rejected', icon: ShieldX },
  { key: 'general', label: 'General', description: 'Other notifications', icon: Bell },
];

interface PrefState {
  enabled: boolean;
  push_enabled: boolean;
  sound_enabled: boolean;
}

const DEFAULT_PREF: PrefState = { enabled: true, push_enabled: true, sound_enabled: true };

export default function NotificationSettings() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<Record<string, PrefState>>({});
  const [loading, setLoading] = useState(true);
  const [globalSound, setGlobalSound] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('notification_preferences')
        .select('category, enabled, push_enabled, sound_enabled')
        .eq('user_id', user.id);

      const map: Record<string, PrefState> = {};
      data?.forEach(p => {
        map[p.category] = { enabled: p.enabled, push_enabled: p.push_enabled, sound_enabled: p.sound_enabled };
      });
      setPrefs(map);

      // Check if any sound is disabled
      const anySoundOff = data?.some(p => !p.sound_enabled);
      setGlobalSound(!anySoundOff);
      setLoading(false);
    };
    load();
  }, []);

  const updatePref = async (category: string, field: keyof PrefState, value: boolean) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const current = prefs[category] || { ...DEFAULT_PREF };
    const updated = { ...current, [field]: value };

    // If disabling main toggle, also disable push
    if (field === 'enabled' && !value) {
      updated.push_enabled = false;
    }
    // If enabling push, also enable main
    if (field === 'push_enabled' && value) {
      updated.enabled = true;
    }

    setPrefs(prev => ({ ...prev, [category]: updated }));

    const { error } = await supabase
      .from('notification_preferences')
      .upsert({
        user_id: user.id,
        category,
        enabled: updated.enabled,
        push_enabled: updated.push_enabled,
        sound_enabled: updated.sound_enabled,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,category' });

    if (error) {
      console.error('Failed to update preference:', error);
      recordClientError({ label: "NotificationSettings.updated", message: error instanceof Error ? error.message : String(error) });
      toast({ title: 'Error', description: 'Failed to save preference', variant: 'destructive' });
    }
  };

  const toggleGlobalSound = async (value: boolean) => {
    setGlobalSound(value);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Update all categories
    const updates = CATEGORIES.map(cat => ({
      user_id: user.id,
      category: cat.key,
      enabled: (prefs[cat.key] || DEFAULT_PREF).enabled,
      push_enabled: (prefs[cat.key] || DEFAULT_PREF).push_enabled,
      sound_enabled: value,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('notification_preferences').upsert(updates, { onConflict: 'user_id,category' });
    if (error) {
      console.error('Failed to update sound:', error);
      recordClientError({ label: "NotificationSettings.updates", message: error instanceof Error ? error.message : String(error) });
    } else {
      setPrefs(prev => {
        const next = { ...prev };
        CATEGORIES.forEach(cat => {
          next[cat.key] = { ...(next[cat.key] || DEFAULT_PREF), sound_enabled: value };
        });
        return next;
      });
    }
  };

  const getPref = (key: string): PrefState => prefs[key] || DEFAULT_PREF;

  if (loading) {
    return (
      <div className="mobile-page bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="mobile-page bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF]">
      <div className="mobile-header bg-white/80 backdrop-blur-xl border-b border-amber-200/50 border-amber-200/60">
        <div className="flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2 hover:bg-amber-50 rounded-full transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold pr-7">Notification Settings</h1>
        </div>
      </div>

      <div className="mobile-page-scrollable">
        {/* Global Sound Toggle */}
        <div className="px-4 py-3 bg-amber-50/30 border-b border-amber-200/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {globalSound ? (
                <Volume2 className="w-5 h-5 text-primary" />
              ) : (
                <VolumeX className="w-5 h-5 text-slate-600" />
              )}
              <div>
                <p className="font-medium text-slate-800">Notification Sound</p>
                <p className="text-xs text-slate-600">Play sound for all notifications</p>
              </div>
            </div>
            <Switch checked={globalSound} onCheckedChange={toggleGlobalSound} />
          </div>
        </div>

        {/* Category List */}
        <div className="divide-y divide-border">
          {CATEGORIES.map(cat => {
            const pref = getPref(cat.key);
            const Icon = cat.icon;
            return (
              <div key={cat.key} className="px-4 py-3.5">
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-8 h-8 rounded-lg ${cat.color} flex items-center justify-center`}>
                    <Icon className="w-4 h-4 text-slate-800" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-800 text-sm">{cat.label}</p>
                    <p className="text-xs text-slate-600">{cat.description}</p>
                  </div>
                  <Switch
                    checked={pref.enabled}
                    onCheckedChange={(v) => updatePref(cat.key, 'enabled', v)}
                  />
                </div>
                {pref.enabled && (
                  <div className="ml-11 flex items-center gap-4 mt-1">
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <Switch
                        className="scale-75"
                        checked={pref.push_enabled}
                        onCheckedChange={(v) => updatePref(cat.key, 'push_enabled', v)}
                      />
                      Push
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <Switch
                        className="scale-75"
                        checked={pref.sound_enabled}
                        onCheckedChange={(v) => updatePref(cat.key, 'sound_enabled', v)}
                      />
                      Sound
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-4 text-center text-xs text-slate-600">
          Disabled categories will not appear in your notifications. Push notifications require device permission to be enabled.
        </div>
      </div>
    </div>
  );
}
