import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Save, RefreshCw, Smartphone, Apple, Download, AlertTriangle } from "lucide-react";
import { parseSettingValue } from "@/utils/adminSettingsStorage";

interface VersionSettings {
  id: string;
  platform: string;
  current_version_code: number;
  current_version_name: string;
  min_version_code: number;
  force_update: boolean;
  update_message: string;
  play_store_url: string;
  updated_at: string;
}

const normalizeVersionSettings = (row: any): VersionSettings => ({
  id: row.id,
  platform: row.platform,
  current_version_code: Number((parseSettingValue<string>(row.current_version) || '0').toString().split('.').join('')) || 0,
  current_version_name: parseSettingValue<string>(row.current_version) || '1.0.0',
  min_version_code: Number((parseSettingValue<string>(row.minimum_version) || '0').toString().split('.').join('')) || 0,
  force_update: Boolean(row.force_update),
  update_message: parseSettingValue<string>(row.changelog) || '',
  play_store_url: parseSettingValue<string>(row.update_url) || '',
  updated_at: row.updated_at,
});

const AdminAppVersion = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [androidSettings, setAndroidSettings] = useState<VersionSettings | null>(null);
  const [iosSettings, setIosSettings] = useState<VersionSettings | null>(null);

  const fetchVersionSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_version_settings')
        .select('*');

      if (error) throw error;

      const android = data?.find(s => s.platform === 'android');
      const ios = data?.find(s => s.platform === 'ios');

      setAndroidSettings(android ? normalizeVersionSettings(android) : null);
      setIosSettings(ios ? normalizeVersionSettings(ios) : null);
    } catch (error) {
      console.error('Error fetching version settings:', error);
      toast.error('Failed to load version settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVersionSettings();
  }, []);

  const saveSettings = async (settings: VersionSettings) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('app_version_settings')
        .update({
          current_version: settings.current_version_name,
          minimum_version: settings.min_version_code > 0 ? String(settings.min_version_code) : settings.current_version_name,
          force_update: settings.force_update,
          changelog: settings.update_message,
          update_url: settings.play_store_url,
          updated_at: new Date().toISOString(),
        })
        .eq('id', settings.id);

      if (error) throw error;

      toast.success(`${settings.platform === 'android' ? 'Android' : 'iOS'} version updated successfully`);
      fetchVersionSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const VersionCard = ({ 
    settings, 
    platform,
    onUpdate 
  }: { 
    settings: VersionSettings | null; 
    platform: 'android' | 'ios';
    onUpdate: (settings: VersionSettings) => void;
  }) => {
    const [localSettings, setLocalSettings] = useState<VersionSettings | null>(null);
    const [hasLocalChanges, setHasLocalChanges] = useState(false);

    // Sync with parent settings when they change (from DB), but preserve local edits
    useEffect(() => {
      if (settings) {
        // Only reset local state if no local changes or if ID changed (new data)
        if (!hasLocalChanges || !localSettings || localSettings.id !== settings.id) {
          setLocalSettings(settings);
          setHasLocalChanges(false);
        }
      }
    }, [settings]);

    // Reset hasLocalChanges after successful save
    useEffect(() => {
      if (settings && localSettings && 
          settings.current_version_code === localSettings.current_version_code &&
          settings.current_version_name === localSettings.current_version_name) {
        setHasLocalChanges(false);
      }
    }, [settings?.current_version_code, settings?.current_version_name]);

    const handleLocalChange = (updates: Partial<VersionSettings>) => {
      if (localSettings) {
        setLocalSettings({ ...localSettings, ...updates });
        setHasLocalChanges(true);
      }
    };

    if (!localSettings) return null;

    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {platform === 'android' ? (
              <Smartphone className="w-5 h-5 text-green-500" />
            ) : (
              <Apple className="w-5 h-5 text-gray-400" />
            )}
            {platform === 'android' ? 'Android' : 'iOS'} Version
          </CardTitle>
          <CardDescription>
            Manage {platform === 'android' ? 'Play Store' : 'App Store'} version settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Current Version Name</Label>
              <Input
                key={`name-${settings?.updated_at}`}
                value={localSettings.current_version_name}
                onChange={(e) => handleLocalChange({ current_version_name: e.target.value })}
                placeholder="e.g., 4.0.0"
              />
            </div>
            <div className="space-y-2">
              <Label>Version Code</Label>
              <Input
                key={`code-${settings?.updated_at}`}
                type="number"
                value={localSettings.current_version_code}
                onChange={(e) => handleLocalChange({ current_version_code: parseInt(e.target.value) || 0 })}
                placeholder="e.g., 4"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Minimum Required Version Code</Label>
            <Input
              type="number"
              value={localSettings.min_version_code}
              onChange={(e) => handleLocalChange({ min_version_code: parseInt(e.target.value) || 0 })}
              placeholder="e.g., 1"
            />
            <p className="text-xs text-muted-foreground">
              Users with version below this will be forced to update
            </p>
          </div>

          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <div>
                <p className="text-sm font-medium">Force Update</p>
                <p className="text-xs text-muted-foreground">
                  Users cannot skip this update
                </p>
              </div>
            </div>
            <Switch
              checked={localSettings.force_update}
              onCheckedChange={(checked) => handleLocalChange({ force_update: checked })}
            />
          </div>

          <div className="space-y-2">
            <Label>Update Message</Label>
            <Textarea
              value={localSettings.update_message}
              onChange={(e) => handleLocalChange({ update_message: e.target.value })}
              placeholder="New update available!"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Store URL</Label>
            <Input
              value={localSettings.play_store_url}
              onChange={(e) => handleLocalChange({ play_store_url: e.target.value })}
              placeholder="https://play.google.com/store/apps/details?id=com.merilive.app"
            />
          </div>

          <div className="text-xs text-muted-foreground">
            Last updated: {new Date(localSettings.updated_at).toLocaleString()}
          </div>

          <Button 
            onClick={() => onUpdate(localSettings)} 
            disabled={saving}
            className="w-full"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Download className="w-6 h-6 text-primary" />
            App Version Management
          </h1>
          <p className="text-muted-foreground">
            Control app update prompts for Android and iOS
          </p>
        </div>
        <Button variant="outline" onClick={fetchVersionSettings}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Info Card */}
      <Card className="bg-blue-500/10 border-blue-500/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Smartphone className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="font-semibold text-blue-400">How it works</h3>
              <p className="text-sm text-muted-foreground mt-1">
                When you upload a new version to Play Store, update the version code here. 
                The app will check this database on launch and show update prompt to users 
                with older versions. Set <strong>Force Update</strong> for critical security updates.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Version Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        <VersionCard 
          settings={androidSettings} 
          platform="android"
          onUpdate={saveSettings}
        />
        <VersionCard 
          settings={iosSettings} 
          platform="ios"
          onUpdate={saveSettings}
        />
      </div>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle>📋 Instructions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <div>
            <strong className="text-foreground">1. After uploading to Play Store:</strong>
            <p>Update the Version Name (e.g., "4.0.0") and Version Code (e.g., 4) to match the new release.</p>
          </div>
          <div>
            <strong className="text-foreground">2. For critical updates:</strong>
            <p>Enable "Force Update" and set the Minimum Version Code to the new version. Users won't be able to skip this update.</p>
          </div>
          <div>
            <strong className="text-foreground">3. Update Message:</strong>
            <p>Customize the message shown to users when an update is available.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminAppVersion;
