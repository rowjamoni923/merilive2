import { useState, useEffect } from "react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Trash2, Check, Image as ImageIcon, RefreshCw } from "lucide-react";

interface BadgeSetting {
  id: string;
  setting_key: string;
  setting_value: string | null;
  description: string | null;
}

const BADGE_KEYS = [
  { key: "verified_badge_icon", label: "Verified Badge", desc: "Blue checkmark badge shown on verified profiles" },
  { key: "host_badge_icon", label: "Host Badge", desc: "Badge shown for approved hosts" },
  { key: "vip_badge_icon", label: "VIP Badge", desc: "Badge shown for VIP users" },
  { key: "admin_badge_icon", label: "Admin Badge", desc: "Badge shown for admin users" },
  { key: "top_gifter_badge_icon", label: "Top Gifter Badge", desc: "Badge for top gifters on leaderboard" },
];

const AdminVerifiedBadges = () => {
  const [badges, setBadges] = useState<Record<string, BadgeSetting>>({});
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);

  const fetchBadges = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("branding_settings")
      .select("*")
      .in("setting_key", BADGE_KEYS.map(b => b.key));

    const map: Record<string, BadgeSetting> = {};
    data?.forEach((item: any) => { map[item.setting_key] = item; });
    setBadges(map);
    setLoading(false);
  };

  useEffect(() => { fetchBadges(); }, []);
  useAdminRealtime(['branding_settings'], fetchBadges, 'admin-badges-rt');

  const handleUpload = async (key: string, file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files (PNG, SVG, WebP) are allowed");
      return;
    }

    setUploading(key);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `badges/${key}_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("app-assets")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("app-assets").getPublicUrl(path);
      const publicUrl = urlData.publicUrl;

      // Upsert into branding_settings
      const existing = badges[key];
      if (existing) {
        await supabase.from("branding_settings").update({ setting_value: publicUrl, updated_at: new Date().toISOString() }).eq("id", existing.id);
      } else {
        const desc = BADGE_KEYS.find(b => b.key === key)?.desc || "";
        await supabase.from("branding_settings").insert({ setting_key: key, setting_value: publicUrl, description: desc });
      }

      toast.success("Badge uploaded successfully!");
      fetchBadges();
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const handleRemove = async (key: string) => {
    const existing = badges[key];
    if (!existing) return;

    await supabase.from("branding_settings").update({ setting_value: null, updated_at: new Date().toISOString() }).eq("id", existing.id);
    toast.success("Badge removed");
    fetchBadges();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Verified Badges</h1>
          <p className="text-muted-foreground text-sm mt-1">Upload and manage verification badge icons (PNG/SVG)</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchBadges} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {BADGE_KEYS.map(({ key, label, desc }) => {
          const badge = badges[key];
          const currentUrl = badge?.setting_value;

          return (
            <Card key={key} className="relative overflow-hidden">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Check className="w-4 h-4 text-blue-500" />
                  {label}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Preview */}
                <div className="flex items-center justify-center h-24 rounded-lg border-2 border-dashed border-muted bg-muted/30">
                  {currentUrl ? (
                    <img src={currentUrl} alt={label} className="max-h-20 max-w-20 object-contain" onError={(e) => { const t = e.currentTarget; if (t.src.indexOf('/placeholder.svg') === -1) t.src = '/placeholder.svg'; }} />
                  ) : (
                    <div className="text-center text-muted-foreground">
                      <ImageIcon className="w-8 h-8 mx-auto mb-1 opacity-40" />
                      <span className="text-xs">No badge uploaded</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <label className="flex-1">
                    <input
                      type="file"
                      accept="image/png,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(key, file);
                        e.target.value = "";
                      }}
                    />
                    <Button variant="outline" size="sm" className="w-full" disabled={uploading === key} asChild>
                      <span>
                        <Upload className="w-4 h-4 mr-2" />
                        {uploading === key ? "Uploading..." : "Upload PNG"}
                      </span>
                    </Button>
                  </label>
                  {currentUrl && (
                    <Button variant="destructive" size="sm" onClick={() => handleRemove(key)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                {currentUrl && (
                  <Badge variant="secondary" className="text-[10px] w-full justify-center truncate">
                    ✅ Active
                  </Badge>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

export default AdminVerifiedBadges;
