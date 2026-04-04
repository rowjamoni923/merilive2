import { useState } from "react";
import { motion } from "framer-motion";
import { 
  Bell, 
  Send, 
  Users, 
  User, 
  Globe, 
  Smartphone,
  Loader2,
  CheckCircle,
  AlertCircle,
  Image as ImageIcon,
  X,
  Zap,
  ChevronDown,
  ChevronUp,
  Edit3,
  Trash2,
  Plus,
  Save
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useBroadcastTemplates, type BroadcastTemplate } from "@/hooks/useBroadcastTemplates";

type TargetType = "all" | "single" | "country";
type NotificationType = "general" | "call" | "message" | "gift" | "reward";

interface NotificationFormData {
  title: string;
  body: string;
  type: NotificationType;
  targetType: TargetType;
  targetUserId: string;
  targetCountry: string;
  imageUrl: string;
}

const PUSH_CATEGORIES: Record<string, { label: string; color: string }> = {
  push_host: { label: "🎤 Host Messages", color: "from-pink-500 to-rose-600" },
  push_inviter: { label: "🎁 Inviter Rewards", color: "from-amber-500 to-orange-600" },
  push_live: { label: "💰 5-Hour Live Reward", color: "from-emerald-500 to-teal-600" },
};

export function AdminPushNotificationBroadcast() {
  const [formData, setFormData] = useState<NotificationFormData>({
    title: "",
    body: "",
    type: "general",
    targetType: "all",
    targetUserId: "",
    targetCountry: "",
    imageUrl: "",
  });
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);
  const { grouped, loading: templatesLoading, saving, updateTemplate, addTemplate, deleteTemplate } = useBroadcastTemplates("push");

  // Edit dialog
  const [editDialog, setEditDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BroadcastTemplate | null>(null);
  const [editForm, setEditForm] = useState({ title: "", body: "", description: "" });

  // Add dialog
  const [addDialog, setAddDialog] = useState(false);
  const [addCategory, setAddCategory] = useState("push_host");
  const [addForm, setAddForm] = useState({ title: "", body: "", description: "" });

  const openEditDialog = (t: BroadcastTemplate) => {
    setEditingTemplate(t);
    setEditForm({ title: t.title_template, body: t.message_template, description: t.description || "" });
    setEditDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!editingTemplate) return;
    await updateTemplate(editingTemplate.id, { title_template: editForm.title, message_template: editForm.body, description: editForm.description });
    setEditDialog(false);
  };

  const handleAddTemplate = async () => {
    if (!addForm.title.trim() || !addForm.body.trim()) { toast.error("Title and body required"); return; }
    await addTemplate({ template_key: `${addCategory}_${Date.now()}`, title_template: addForm.title, message_template: addForm.body, description: addForm.description, category: addCategory });
    setAddDialog(false);
    setAddForm({ title: "", body: "", description: "" });
  };

  const handleDeleteTemplate = async (t: BroadcastTemplate) => {
    if (!window.confirm(`Delete "${t.title_template}"?`)) return;
    await deleteTemplate(t.id);
  };
  const [isSending, setIsSending] = useState(false);
  const [lastResult, setLastResult] = useState<{
    success: boolean;
    sent: number;
    failed: number;
    total: number;
  } | null>(null);

  const notificationTypes: { value: NotificationType; label: string; icon: string }[] = [
    { value: "general", label: "🔔 General", icon: "🔔" },
    { value: "message", label: "💬 Message", icon: "💬" },
    { value: "gift", label: "🎁 Gift/Reward", icon: "🎁" },
    { value: "call", label: "📞 Call Alert", icon: "📞" },
  ];

  const countries = [
    { code: "BD", name: "🇧🇩 Bangladesh" },
    { code: "IN", name: "🇮🇳 India" },
    { code: "PK", name: "🇵🇰 Pakistan" },
    { code: "NP", name: "🇳🇵 Nepal" },
    { code: "LK", name: "🇱🇰 Sri Lanka" },
  ];

  const handleSend = async () => {
    if (!formData.title.trim() || !formData.body.trim()) {
      toast.error("Title and Message are required");
      return;
    }

    if (formData.targetType === "single" && !formData.targetUserId.trim()) {
      toast.error("User ID is required");
      return;
    }

    setIsSending(true);
    setLastResult(null);

    try {
      // Build payload based on target type
      let payload: Record<string, unknown> = {
        title: formData.title,
        body: formData.body,
        type: formData.type,
      };

      if (formData.imageUrl) {
        payload.image = formData.imageUrl;
      }

      if (formData.targetType === "all") {
        payload.send_to_all = true;
      } else if (formData.targetType === "single") {
        // Find user by UID using raw query to avoid type recursion
        const { data: userData, error: userError } = await (supabase as any)
          .from("profiles")
          .select("id")
          .eq("uid", formData.targetUserId)
          .limit(1);
        
        if (userError || !userData || userData.length === 0) {
          toast.error("User not found with this UID");
          setIsSending(false);
          return;
        }
        payload.user_id = userData[0].id;
      } else if (formData.targetType === "country") {
        // Get all users from the country
        const { data: countryUsers, error: countryError } = await (supabase as any)
          .from("profiles")
          .select("id")
          .eq("country_code", formData.targetCountry);
        
        if (countryError || !countryUsers || countryUsers.length === 0) {
          toast.error("No users found in this country");
          setIsSending(false);
          return;
        }
        payload.user_ids = countryUsers.map((u: { id: string }) => u.id);
      }

      const { data, error } = await supabase.functions.invoke("send-push-notification", {
        body: payload,
      });

      if (error) throw error;

      setLastResult({
        success: data.success,
        sent: data.sent || 0,
        failed: data.failed || 0,
        total: data.total || 0,
      });

      if (data.success) {
        toast.success(`✅ Notification sent to ${data.sent} users!`);
        // Reset form
        setFormData(prev => ({
          ...prev,
          title: "",
          body: "",
          imageUrl: "",
        }));
      } else {
        toast.error("Failed to send notification");
      }
    } catch (error) {
      console.error("Send notification error:", error);
      toast.error("Error sending notification");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
          <Bell className="w-6 h-6 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Push Notification</h2>
          <p className="text-gray-400 text-sm">Send notifications to users</p>
        </div>
      </div>

      {/* Quick Preset Templates (from DB) */}
      <Card className="bg-gray-900/50 border-gray-800">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2 text-lg">
              <Zap className="w-5 h-5 text-yellow-400" />
              Quick Templates — Click to Use
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => { setAddCategory("push_host"); setAddDialog(true); }} className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10">
              <Plus className="w-4 h-4 mr-1" /> Add
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {templatesLoading ? (
            <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-purple-400" /></div>
          ) : Object.keys(PUSH_CATEGORIES).map((catKey) => {
            const info = PUSH_CATEGORIES[catKey];
            const catTemplates = grouped[catKey] || [];
            const isExpanded = expandedPreset === catKey;
            return (
              <div key={catKey}>
                <button
                  onClick={() => setExpandedPreset(isExpanded ? null : catKey)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl bg-gradient-to-r ${info.color} text-white font-semibold transition-all hover:opacity-90`}
                >
                  <span>{info.label} ({catTemplates.length})</span>
                  {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </button>
                {isExpanded && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2 space-y-2 pl-2">
                    {catTemplates.length === 0 ? (
                      <p className="text-gray-500 text-sm py-2 pl-2">No templates. Click "Add" to create.</p>
                    ) : catTemplates.map((template, idx) => (
                      <motion.div key={template.id} initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: idx * 0.05 }} className="flex items-start gap-2">
                        <button
                          onClick={() => { setFormData(prev => ({ ...prev, title: template.title_template, body: template.message_template })); toast.success("✅ Template loaded!"); }}
                          className="flex-1 text-left p-3 rounded-lg bg-gray-800/70 border border-gray-700 hover:border-purple-500/50 hover:bg-gray-800 transition-all group"
                        >
                          <p className="text-white font-medium text-sm truncate group-hover:text-purple-300 transition-colors">{template.title_template}</p>
                          <p className="text-gray-400 text-xs mt-1 line-clamp-2">{template.message_template}</p>
                        </button>
                        <div className="flex flex-col gap-1 pt-1">
                          <button onClick={() => openEditDialog(template)} className="p-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400" title="Edit"><Edit3 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteTemplate(template)} className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form Card */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Send className="w-5 h-5" />
              Compose Notification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Title */}
            <div className="space-y-2">
              <Label className="text-gray-300">Title *</Label>
              <Input
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="🎉 Special Offer!"
                className="bg-gray-800 border-gray-700 text-white"
                maxLength={100}
              />
            </div>

            {/* Body */}
            <div className="space-y-2">
              <Label className="text-gray-300">Message *</Label>
              <Textarea
                value={formData.body}
                onChange={(e) => setFormData(prev => ({ ...prev, body: e.target.value }))}
                placeholder="Get 50% bonus today..."
                className="bg-gray-800 border-gray-700 text-white min-h-[100px]"
                maxLength={500}
              />
              <p className="text-xs text-gray-500 text-right">{formData.body.length}/500</p>
            </div>

            {/* Image URL (optional) */}
            <div className="space-y-2">
              <Label className="text-gray-300 flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                Image URL (Optional)
              </Label>
              <Input
                value={formData.imageUrl}
                onChange={(e) => setFormData(prev => ({ ...prev, imageUrl: e.target.value }))}
                placeholder="https://example.com/image.png"
                className="bg-gray-800 border-gray-700 text-white"
              />
            </div>

            {/* Notification Type */}
            <div className="space-y-2">
              <Label className="text-gray-300">Notification Type</Label>
              <Select
                value={formData.type}
                onValueChange={(value: NotificationType) => 
                  setFormData(prev => ({ ...prev, type: value }))
                }
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  {notificationTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value} className="text-white">
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Target Audience */}
            <div className="space-y-3">
              <Label className="text-gray-300">Target Audience</Label>
              <RadioGroup
                value={formData.targetType}
                onValueChange={(value: TargetType) => 
                  setFormData(prev => ({ ...prev, targetType: value }))
                }
                className="space-y-2"
              >
                <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                  <RadioGroupItem value="all" id="all" className="text-purple-500" />
                  <Label htmlFor="all" className="flex items-center gap-2 text-white cursor-pointer">
                    <Globe className="w-4 h-4 text-purple-400" />
                    All Users
                  </Label>
                </div>
                <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                  <RadioGroupItem value="single" id="single" className="text-purple-500" />
                  <Label htmlFor="single" className="flex items-center gap-2 text-white cursor-pointer">
                    <User className="w-4 h-4 text-blue-400" />
                    Specific User
                  </Label>
                </div>
                <div className="flex items-center space-x-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                  <RadioGroupItem value="country" id="country" className="text-purple-500" />
                  <Label htmlFor="country" className="flex items-center gap-2 text-white cursor-pointer">
                    <Users className="w-4 h-4 text-green-400" />
                    Specific Country
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Conditional Fields */}
            {formData.targetType === "single" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-2"
              >
                <Label className="text-gray-300">User UID</Label>
                <Input
                  value={formData.targetUserId}
                  onChange={(e) => setFormData(prev => ({ ...prev, targetUserId: e.target.value }))}
                  placeholder="Enter user UID (e.g., 100001)"
                  className="bg-gray-800 border-gray-700 text-white"
                />
              </motion.div>
            )}

            {formData.targetType === "country" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="space-y-2"
              >
                <Label className="text-gray-300">Select Country</Label>
                <Select
                  value={formData.targetCountry}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, targetCountry: value }))}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                    <SelectValue placeholder="Select Country" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    {countries.map((country) => (
                      <SelectItem key={country.code} value={country.code} className="text-white">
                        {country.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
            )}

            {/* Send Button */}
            <Button
              onClick={handleSend}
              disabled={isSending || !formData.title || !formData.body}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            >
              {isSending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Notification
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Preview Card */}
        <Card className="bg-gray-900/50 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5" />
              Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Phone Mockup */}
            <div className="bg-gray-950 rounded-3xl p-4 border-4 border-gray-700 max-w-xs mx-auto">
              {/* Status Bar */}
              <div className="flex justify-between items-center text-white text-xs mb-4">
                <span>9:41</span>
                <div className="flex gap-1">
                  <span>📶</span>
                  <span>🔋</span>
                </div>
              </div>

              {/* Notification Preview */}
              <motion.div
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-white rounded-2xl p-3 shadow-lg"
              >
                <div className="flex items-start gap-3">
                  {/* App Icon */}
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold text-sm">M</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* App Name & Time */}
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-gray-500 text-xs font-medium">MERILIVE</span>
                      <span className="text-gray-400 text-xs">now</span>
                    </div>

                    {/* Title */}
                    <p className="font-semibold text-foreground text-sm truncate">
                      {formData.title || "Notification Title"}
                    </p>

                    {/* Body */}
                    <p className="text-muted-foreground text-xs line-clamp-2 mt-0.5">
                      {formData.body || "Your notification message will appear here..."}
                    </p>

                    {/* Image Preview */}
                    {formData.imageUrl && (
                      <div className="mt-2 rounded-lg overflow-hidden">
                        <img 
                          src={formData.imageUrl} 
                          alt="Preview" 
                          className="w-full h-20 object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Empty space */}
              <div className="h-40" />

              {/* Home indicator */}
              <div className="flex justify-center">
                <div className="w-32 h-1 bg-gray-600 rounded-full" />
              </div>
            </div>

            {/* Result */}
            {lastResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`mt-6 p-4 rounded-xl border ${
                  lastResult.success
                    ? "bg-green-500/10 border-green-500/30"
                    : "bg-red-500/10 border-red-500/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  {lastResult.success ? (
                    <CheckCircle className="w-6 h-6 text-green-400" />
                  ) : (
                    <AlertCircle className="w-6 h-6 text-red-400" />
                  )}
                  <div>
                    <p className={`font-medium ${lastResult.success ? "text-green-400" : "text-red-400"}`}>
                      {lastResult.success ? "Sent Successfully!" : "Failed"}
                    </p>
                    <p className="text-sm text-gray-400">
                      ✅ {lastResult.sent} sent • ❌ {lastResult.failed} failed • 📱 {lastResult.total} total
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Template Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-[#1a1a2e] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white"><Edit3 className="w-5 h-5 text-purple-400" /> Edit Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-sm font-medium text-white/80">Title</Label>
              <Input value={editForm.title} onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))} className="mt-1.5 bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <Label className="text-sm font-medium text-white/80">Message Body</Label>
              <Textarea value={editForm.body} onChange={(e) => setEditForm(prev => ({ ...prev, body: e.target.value }))} className="mt-1.5 min-h-[120px] bg-white/5 border-white/10 text-white" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditDialog(false)} className="flex-1 border-white/20 text-white/80 hover:bg-white/10">Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={saving} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Template Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-[#1a1a2e] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white"><Plus className="w-5 h-5 text-green-400" /> Add Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-sm font-medium text-white/80">Category</Label>
              <Select value={addCategory} onValueChange={setAddCategory}>
                <SelectTrigger className="mt-1.5 bg-white/5 border-white/10 text-white"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PUSH_CATEGORIES).map(([key, val]) => (
                    <SelectItem key={key} value={key}>{val.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium text-white/80">Title *</Label>
              <Input value={addForm.title} onChange={(e) => setAddForm(prev => ({ ...prev, title: e.target.value }))} className="mt-1.5 bg-white/5 border-white/10 text-white" placeholder="Notification title..." />
            </div>
            <div>
              <Label className="text-sm font-medium text-white/80">Message Body *</Label>
              <Textarea value={addForm.body} onChange={(e) => setAddForm(prev => ({ ...prev, body: e.target.value }))} className="mt-1.5 min-h-[120px] bg-white/5 border-white/10 text-white" placeholder="Notification message..." />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setAddDialog(false)} className="flex-1 border-white/20 text-white/80 hover:bg-white/10">Cancel</Button>
              <Button onClick={handleAddTemplate} disabled={saving} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />} Add
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminPushNotificationBroadcast;
