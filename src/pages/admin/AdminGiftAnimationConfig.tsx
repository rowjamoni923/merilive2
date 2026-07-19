/**
 * Admin: Gift Animation Config
 *
 * Manages `app_settings.gift_animation_config`:
 *   {
 *     full_screen_threshold: number,   // coin value ≥ this → full-screen animation
 *     full_screen_enabled:   boolean,  // master kill-switch for full-screen playback
 *   }
 *
 * Consumed live by:
 *   - src/hooks/useGlobalFullScreenGift.ts   (web, all surfaces)
 *   - merilive_app/lib/features/gifting/data/gift_animation_config.dart (Flutter)
 *
 * Edit → save → all clients pick up on next `admin-table-update` broadcast.
 */
import { useEffect, useState } from 'react';
import { Sparkles, Save, RefreshCw, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { adminSupabase as supabase } from '@/integrations/supabase/adminClient';
import { toast } from 'sonner';
import { useAdminRealtime } from '@/hooks/useAdminRealtime';

const SETTING_KEY = 'gift_animation_config';
const DEFAULT_THRESHOLD = 500;
const DEFAULT_ENABLED = true;

interface GiftAnimationConfig {
  full_screen_threshold: number;
  full_screen_enabled: boolean;
}

export default function AdminGiftAnimationConfig() {
  const [threshold, setThreshold] = useState<number>(DEFAULT_THRESHOLD);
  const [enabled, setEnabled] = useState<boolean>(DEFAULT_ENABLED);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value, updated_at')
        .eq('setting_key', SETTING_KEY)
        .maybeSingle();
      if (error) throw error;
      const cfg = (data?.setting_value as GiftAnimationConfig | null) ?? null;
      setThreshold(
        typeof cfg?.full_screen_threshold === 'number' && cfg.full_screen_threshold > 0
          ? Math.floor(cfg.full_screen_threshold)
          : DEFAULT_THRESHOLD,
      );
      setEnabled(typeof cfg?.full_screen_enabled === 'boolean' ? cfg.full_screen_enabled : DEFAULT_ENABLED);
      setLastUpdated(data?.updated_at ?? null);
    } catch (err) {
      console.error('[AdminGiftAnimationConfig] fetch failed', err);
      toast.error('Failed to load config');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  useAdminRealtime(['app_settings'], () => fetchConfig());

  const save = async () => {
    if (!Number.isFinite(threshold) || threshold < 1) {
      toast.error('Threshold must be ≥ 1');
      return;
    }
    setSaving(true);
    try {
      const payload: GiftAnimationConfig = {
        full_screen_threshold: Math.floor(threshold),
        full_screen_enabled: enabled,
      };
      const { error } = await supabase
        .from('app_settings')
        .upsert(
          {
            setting_key: SETTING_KEY,
            setting_value: payload as unknown as Record<string, unknown>,
            description: 'Full-screen gift animation threshold & enable-flag (all surfaces)',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'setting_key' },
        );
      if (error) throw error;
      toast.success('Gift animation config saved — clients will pick up live');
      fetchConfig();
    } catch (err) {
      console.error('[AdminGiftAnimationConfig] save failed', err);
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
          <Sparkles className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Gift Animation Config</h1>
          <p className="text-sm text-slate-500">
            Controls full-screen animation playback across Live, Party, Call, Chat, Profile & Reels.
          </p>
        </div>
      </div>

      <Card className="border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg text-slate-900">Full-Screen Playback</CardTitle>
          <CardDescription>
            When a gift's per-unit diamond value meets or exceeds the threshold, a full-screen VAP/SVGA/Lottie/MP4
            animation plays. Below the threshold, only the compact flying banner appears.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex-1">
              <Label htmlFor="fs-enabled" className="text-base font-medium text-slate-900">
                Enable full-screen animation
              </Label>
              <p className="mt-1 text-xs text-slate-500">
                Master kill-switch — turn off for a lightweight, low-bandwidth experience.
              </p>
            </div>
            <Switch id="fs-enabled" checked={enabled} onCheckedChange={setEnabled} disabled={loading} />
          </div>

          <div>
            <Label htmlFor="fs-threshold" className="text-base font-medium text-slate-900">
              Diamond threshold
            </Label>
            <p className="mb-2 mt-1 text-xs text-slate-500">
              Gifts costing at least this many diamonds per unit will trigger a full-screen animation.
            </p>
            <Input
              id="fs-threshold"
              type="number"
              min={1}
              step={1}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              disabled={loading || !enabled}
              className="max-w-xs"
            />
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs text-blue-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <b>Live preview:</b> current settings — threshold{' '}
              <span className="font-mono font-semibold">{threshold}</span> diamonds,{' '}
              <span className="font-semibold">{enabled ? 'ENABLED' : 'DISABLED'}</span>.
              {lastUpdated && (
                <span className="ml-2 text-blue-700/70">
                  · updated {new Date(lastUpdated).toLocaleString()}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={save} disabled={saving || loading} className="gap-2">
              <Save className="h-4 w-4" />
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
            <Button variant="outline" onClick={fetchConfig} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
