import { useState, useEffect } from "react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, Eye, EyeOff, Globe, Sparkles, Megaphone, HelpCircle, Image, BarChart3, Mic, Building2, Settings } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { loadAppSettingsByPrefix, saveAppSetting } from "@/utils/adminSettingsStorage";
import useAdminRealtime from "@/hooks/useAdminRealtime";

// Define interfaces for LandingSection and LandingSetting
interface SelectOption {
  label: string;
  value: string;
}

interface StatsSection {
  downloads: string;
  rating: string;
  hosts: string;
  support: string;
}

interface HostProgram {
  daily_earn: string;
  bonus_days: string;
  daily_hours: string;
  min_withdraw: string;
}

interface Agency {
  sub_bonus: string;
}

interface HeroSection {
  title: string;
  subtitle: string;
  description: string;
}

interface FeatureSection {
  icon: string;
}

interface EventSection {
  start_date: string;
  end_date: string;
}

interface AnnouncementSection {
  badge_text: string;
}

interface TestimonialSection {
  author: string;
  quote: string;
}

interface FAQSection {
  question: string;
  answer: string;
}

interface HeroBannerSection {
  image_url: string;
  link_url: string;
  link_label: string;
}

interface SectionTypes {
  feature: FeatureSection;
  event: EventSection;
  announcement: AnnouncementSection;
  testimonial: TestimonialSection;
  faq: FAQSection;
  hero_banner: HeroBannerSection;
}

interface LandingSection {
  id: string;
  section_type: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  link_label: string | null;
  badge_text: string | null;
  icon_name: string | null;
  gradient_colors: string;
  display_order: number;
  is_active: boolean;
  start_date: string | null;
  end_date: string | null;
}

interface LandingSetting {
  id: string;
  setting_key: string;
  setting_value: string;
  description: string | null;
}

const sectionTypeLabels: Record<string, { label: string; icon: any; color: string }> = {
  feature: { label: "Feature", icon: Sparkles, color: "from-pink-500 to-purple-600" },
  event: { label: "Event", icon: Globe, color: "from-orange-500 to-red-500" },
  announcement: { label: "Announcement", icon: Megaphone, color: "from-blue-500 to-indigo-600" },
  testimonial: { label: "Testimonial", icon: HelpCircle, color: "from-green-500 to-emerald-600" },
  faq: { label: "FAQ", icon: HelpCircle, color: "from-yellow-500 to-orange-500" },
  hero_banner: { label: "Hero Banner", icon: Image, color: "from-violet-500 to-purple-600" },
};

const iconOptions = ["Video", "Phone", "Gift", "Music", "Users", "Shield", "Wallet", "Zap", "Star", "Heart", "Clock", "Trophy", "MessageCircle", "Globe", "Download", "Sparkles"];

const gradientOptions = [
  { label: "Pink → Rose", value: "from-pink-500 to-rose-500" },
  { label: "Blue → Cyan", value: "from-blue-500 to-cyan-500" },
  { label: "Purple → Violet", value: "from-purple-500 to-violet-500" },
  { label: "Orange → Amber", value: "from-orange-500 to-amber-500" },
  { label: "Emerald → Green", value: "from-emerald-500 to-green-500" },
  { label: "Indigo → Blue", value: "from-indigo-500 to-blue-500" },
  { label: "Red → Pink", value: "from-red-500 to-pink-500" },
  { label: "Pink → Purple", value: "from-pink-500 to-purple-600" },
];

// Landing settings grouped for display
const settingsGroups = [
  {
    title: "📊 Stats Section",
    icon: BarChart3,
    keys: [
      { key: "landing_stat_downloads", label: "Downloads Count", placeholder: "50,000+" },
      { key: "landing_stat_rating", label: "Rating", placeholder: "4.5★" },
      { key: "landing_stat_hosts", label: "Live Hosts", placeholder: "1000+" },
      { key: "landing_stat_support", label: "Support", placeholder: "24/7" },
    ]
  },
  {
    title: "🎤 Host Program",
    icon: Mic,
    keys: [
      { key: "landing_host_daily_earn", label: "Daily Earning", placeholder: "$10" },
      { key: "landing_host_bonus_days", label: "Bonus Duration (Days)", placeholder: "10" },
      { key: "landing_host_daily_hours", label: "Required Daily Hours", placeholder: "5" },
      { key: "landing_host_min_withdraw", label: "Minimum Withdraw", placeholder: "$10" },
    ]
  },
  {
    title: "🏢 Agency",
    icon: Building2,
    keys: [
      { key: "landing_agency_sub_bonus", label: "Sub-Agency Bonus", placeholder: "2%" },
    ]
  },
  {
    title: "🎯 Hero Section",
    icon: Globe,
    keys: [
      { key: "landing_hero_title", label: "Hero Title", placeholder: "MeriLive" },
      { key: "landing_hero_subtitle", label: "Hero Subtitle", placeholder: "Live Streaming · Video Call..." },
      { key: "landing_hero_description", label: "Hero Description", placeholder: "Stream live, connect..." },
    ]
  },
];

const AdminLandingPageManager = () => {
  const [activeTab, setActiveTab] = useState("settings");
  const [sections, setSections] = useState<LandingSection[]>([]);
  const [settings, setSettings] = useState<Record<string, LandingSetting>>({});
  const [settingValues, setSettingValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingSection, setEditingSection] = useState<LandingSection | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");

  useEffect(() => {
    fetchAll();
  }, []);

  // ⚡ Zero-refresh: instantly refetch when sections or settings change in DB
  useAdminRealtime(['landing_page_sections', 'app_settings'], () => {
    fetchAll(, { enableRealtimeRefresh: true });
  });

  const fetchAll = async () => {
    setLoading(true);
    const [sectionsRes, settingsRes] = await Promise.all([
      supabase.from("landing_page_sections").select("*").order("section_type").order("display_order"),
      loadAppSettingsByPrefix<string>("landing_"),
    ]);

    if (sectionsRes.data) setSections(sectionsRes.data || []);
    
    if (settingsRes.length > 0) {
      const map: Record<string, LandingSetting> = {};
      const vals: Record<string, string> = {};
      settingsRes.forEach((s: any) => {
        map[s.setting_key] = {
          ...s,
          setting_value: typeof s.parsed_value === 'string' ? s.parsed_value : JSON.stringify(s.parsed_value ?? ''),
        };
        const val = typeof s.parsed_value === 'string' ? s.parsed_value : JSON.stringify(s.parsed_value ?? '');
        vals[s.setting_key] = val.replace(/^"|"$/g, '');
      });
      setSettings(map);
      setSettingValues(vals);
    }
    setLoading(false);
  };

  // --- Settings handlers ---
  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await Promise.all(
        Object.entries(settingValues).map(([key, value]) =>
          saveAppSetting(key, value, `Landing setting: ${key}`)
        )
      );

      toast({ title: "✅ Saved", description: "Landing page settings updated" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to save landing settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // --- Section handlers ---
  const handleSaveSection = async (section: LandingSection) => {
    setSaving(true);
    const { id, ...rest } = section;
    
    if (id.startsWith("new-")) {
      const { error } = await supabase.from("landing_page_sections").insert({ ...rest });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "✅ Saved", description: "New section added" });
      }
    } else {
      const { error } = await supabase.from("landing_page_sections").update(rest).eq("id", id);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "✅ Updated" });
      }
    }
    
    setSaving(false);
    setShowDialog(false);
    setEditingSection(null);
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this section?")) return;
    const { error } = await supabase.from("landing_page_sections").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "🗑️ Deleted" });
      fetchAll();
    }
  };

  const handleToggleActive = async (id: string, is_active: boolean) => {
    await supabase.from("landing_page_sections").update({ is_active: !is_active }).eq("id", id);
    fetchAll();
  };

  const createNew = (type: string) => {
    setEditingSection({
      id: `new-${Date.now()}`,
      section_type: type,
      title: "",
      subtitle: null,
      description: null,
      image_url: null,
      link_url: null,
      link_label: null,
      badge_text: null,
      icon_name: type === "feature" ? "Star" : null,
      gradient_colors: "from-pink-500 to-purple-600",
      display_order: sections.filter(s => s.section_type === type).length + 1,
      is_active: true,
      start_date: null,
      end_date: null,
    });
    setShowDialog(true);
  };

  const filteredSections = filterType === "all" ? sections : sections.filter(s => s.section_type === filterType);

  return (
    <div className="h-full min-h-0 flex flex-col gap-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 via-pink-600 to-rose-600 rounded-2xl p-6 shadow-lg shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
            <Globe className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Landing Page Manager</h1>
            <p className="text-white/80">Manage all content for merilive.top</p>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col space-y-4">
        <TabsList className="flex w-full bg-slate-900/50 p-1 h-auto shrink-0">
          <TabsTrigger value="settings" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white py-3 flex-1 text-xs sm:text-sm">
            <Settings className="w-4 h-4 mr-1.5" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="sections" className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white py-3 flex-1 text-xs sm:text-sm">
            <Sparkles className="w-4 h-4 mr-1.5" />
            Sections
          </TabsTrigger>
        </TabsList>

        {/* ===== SETTINGS TAB ===== */}
        <TabsContent
          value="settings"
          className="mt-0 flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain space-y-6 pr-1 pb-24"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {loading ? (
            <div className="text-center py-10 text-muted-foreground">Loading...</div>
          ) : (
            <>
              {settingsGroups.map((group) => (
                <Card key={group.title} className="border-border/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <group.icon className="w-5 h-5 text-purple-400" />
                      {group.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {group.keys.map((item) => (
                        <div key={item.key}>
                          <Label className="text-xs text-muted-foreground mb-1 block">{item.label}</Label>
                          <Input
                            value={settingValues[item.key] || ""}
                            onChange={(e) => setSettingValues(prev => ({ ...prev, [item.key]: e.target.value }))}
                            placeholder={item.placeholder}
                            className="bg-background/50 border-border"
                          />
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}

              <Button
                onClick={handleSaveSettings}
                disabled={saving}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white h-12 text-base font-bold"
              >
                <Save className="w-5 h-5 mr-2" />
                {saving ? "Saving..." : "Save All Settings"}
              </Button>
            </>
          )}
        </TabsContent>

        {/* ===== SECTIONS TAB ===== */}
        <TabsContent
          value="sections"
          className="mt-0 flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain space-y-4 pr-1 pb-24"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* Add buttons */}
          <div className="flex gap-2 flex-wrap">
            {Object.entries(sectionTypeLabels).map(([key, { label }]) => (
              <Button key={key} size="sm" variant="outline" onClick={() => createNew(key)} className="text-xs">
                <Plus className="w-3 h-3 mr-1" />
                {label}
              </Button>
            ))}
          </div>

          {/* Filter */}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant={filterType === "all" ? "default" : "outline"} onClick={() => setFilterType("all")} className={filterType === "all" ? "bg-gradient-to-r from-pink-500 to-purple-600 text-white" : ""}>
              All ({sections.length})
            </Button>
            {Object.entries(sectionTypeLabels).map(([key, { label }]) => {
              const count = sections.filter(s => s.section_type === key).length;
              return (
                <Button key={key} size="sm" variant={filterType === key ? "default" : "outline"} onClick={() => setFilterType(key)} className={filterType === key ? "bg-gradient-to-r from-pink-500 to-purple-600 text-white" : ""}>
                  {label} ({count})
                </Button>
              );
            })}
          </div>

          {/* Section list */}
          {loading ? (
            <div className="text-center py-10 text-muted-foreground">Loading...</div>
          ) : (
            <div className="space-y-3">
              {filteredSections.map((section) => {
                const typeInfo = sectionTypeLabels[section.section_type] || sectionTypeLabels.feature;
                const TypeIcon = typeInfo.icon;
                return (
                  <Card key={section.id} className={`border-border/50 ${!section.is_active ? 'opacity-50' : ''}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${section.gradient_colors} flex items-center justify-center flex-shrink-0`}>
                          <TypeIcon className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-sm truncate">{section.title}</h3>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{typeInfo.label}</span>
                            {!section.is_active && <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400">Inactive</span>}
                          </div>
                          {section.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{section.description}</p>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button size="sm" variant="ghost" onClick={() => handleToggleActive(section.id, section.is_active)} className="h-8 w-8 p-0">
                            {section.is_active ? <Eye className="w-4 h-4 text-green-500" /> : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingSection(section); setShowDialog(true); }} className="h-8 w-8 p-0">
                            <Save className="w-4 h-4 text-blue-500" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete(section.id)} className="h-8 w-8 p-0">
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {filteredSections.length === 0 && (
                <div className="text-center py-10 text-muted-foreground text-sm">No sections found</div>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingSection?.id.startsWith("new-") ? "Add New Section" : "Edit Section"}
            </DialogTitle>
          </DialogHeader>

          {editingSection && (
            <div className="space-y-4">
              <div>
                <Label>Type</Label>
                <Select value={editingSection.section_type} onValueChange={(v) => setEditingSection({ ...editingSection, section_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(sectionTypeLabels).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Title *</Label>
                <Input value={editingSection.title} onChange={(e) => setEditingSection({ ...editingSection, title: e.target.value })} placeholder="Section title" />
              </div>

              <div>
                <Label>Subtitle</Label>
                <Input value={editingSection.subtitle || ""} onChange={(e) => setEditingSection({ ...editingSection, subtitle: e.target.value })} placeholder="Optional subtitle" />
              </div>

              <div>
                <Label>Description</Label>
                <Textarea value={editingSection.description || ""} onChange={(e) => setEditingSection({ ...editingSection, description: e.target.value })} rows={3} placeholder="Description text" />
              </div>

              <div>
                <Label>Image URL</Label>
                <Input value={editingSection.image_url || ""} onChange={(e) => setEditingSection({ ...editingSection, image_url: e.target.value })} placeholder="https://..." />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Link URL</Label>
                  <Input value={editingSection.link_url || ""} onChange={(e) => setEditingSection({ ...editingSection, link_url: e.target.value })} placeholder="https://..." />
                </div>
                <div>
                  <Label>Link Label</Label>
                  <Input value={editingSection.link_label || ""} onChange={(e) => setEditingSection({ ...editingSection, link_label: e.target.value })} placeholder="Learn More" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Badge Text</Label>
                  <Input value={editingSection.badge_text || ""} onChange={(e) => setEditingSection({ ...editingSection, badge_text: e.target.value })} placeholder="NEW" />
                </div>
                <div>
                  <Label>Display Order</Label>
                  <Input type="number" value={editingSection.display_order} onChange={(e) => setEditingSection({ ...editingSection, display_order: parseInt(e.target.value) || 0 })} />
                </div>
              </div>

              {editingSection.section_type === "feature" && (
                <div>
                  <Label>Icon</Label>
                  <Select value={editingSection.icon_name || "Star"} onValueChange={(v) => setEditingSection({ ...editingSection, icon_name: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {iconOptions.map(icon => (
                        <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div>
                <Label>Gradient</Label>
                <Select value={editingSection.gradient_colors} onValueChange={(v) => setEditingSection({ ...editingSection, gradient_colors: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {gradientOptions.map(g => (
                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Switch checked={editingSection.is_active} onCheckedChange={(c) => setEditingSection({ ...editingSection, is_active: c })} />
                <Label>Active</Label>
              </div>

              <Button onClick={() => handleSaveSection(editingSection)} disabled={saving} className="w-full bg-gradient-to-r from-purple-500 to-pink-600">
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminLandingPageManager;
