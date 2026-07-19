import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Bell, Send, Users, Globe, Target, Clock, CheckCircle2, Loader2, Link2, ImagePlus, X, ExternalLink, Zap, ChevronDown, ChevronUp, Edit3, Save, Trash2, Plus } from "lucide-react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { getAdminSessionToken } from "@/utils/adminSession";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import { useBroadcastTemplates, type BroadcastTemplate } from "@/hooks/useBroadcastTemplates";
import { SmartImage } from "@/components/ui/smart-image";
import { recordAdminError } from "@/utils/adminErrorLog";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://ayjdlvuurscxucatbbah.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5amRsdnV1cnNjeHVjYXRiYmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyNjQxMjMsImV4cCI6MjA5MDg0MDEyM30.5A53IMXcvGGnmXK9Dd96V7ceceh1JFuGmPom-hojWJc";
const SEND_PUSH_URL = `${SUPABASE_URL}/functions/v1/send-push-notification`;

type PushBroadcastResponse = {
  success?: boolean;
  accepted?: boolean;
  sent?: number;
  total?: number;
  failed?: number;
  error?: string;
  message?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createBroadcastRequestId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `push-${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

const parseMaybeJson = (text: string): any => {
  try { return text ? JSON.parse(text) : {}; } catch { return { error: text }; }
};

const waitForPublicImage = async (url: string) => {
  // FCM validates/downloads the image from Google's servers. Immediately after a
  // browser upload, public storage can take a moment to become readable; waiting
  // here removes the image-upload race that made rich pushes flaky.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const resp = await fetch(`${url}${url.includes("?") ? "&" : "?"}v=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
      });
      if (resp.ok) return true;
    } catch { /* retry below */ }
    await sleep(350 + attempt * 250);
  }
  return false;
};

const invokePushBroadcastWithFallback = async (
  payload: Record<string, unknown>,
  adminToken: string,
  requestId: string,
): Promise<PushBroadcastResponse> => {
  const body = { ...payload, requestId };
  const headers = { "x-admin-token": adminToken };

  const { data, error } = await supabase.functions.invoke("send-push-notification", {
    headers,
    body,
  });

  if (!error) return (data || {}) as PushBroadcastResponse;

  recordAdminError({
    kind: "edge",
    label: "AdminPushBroadcast.SDKInvoke",
    message: error.message || "Supabase SDK invoke failed; retrying with direct fetch",
    detail: JSON.stringify((error as any)?.context || {}).slice(0, 1000),
    silent: true,
  });

  // Same requestId makes this retry idempotent on the Edge Function side: if the
  // first request actually reached the function but the browser lost the response,
  // this direct fetch replays the saved result instead of sending a duplicate push.
  await sleep(600);
  const resp = await fetch(SEND_PUSH_URL, {
    method: "POST",
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      "content-type": "application/json",
      "x-admin-token": adminToken,
    },
    body: JSON.stringify(body),
  });
  const parsed = parseMaybeJson(await resp.text());
  if (!resp.ok) {
    throw new Error(parsed?.error || parsed?.message || `Edge Function failed (${resp.status})`);
  }
  return parsed as PushBroadcastResponse;
};

const PUSH_CATEGORIES: Record<string, { label: string; color: string }> = {
  push_host: { label: "🎤 Host Messages", color: "from-purple-600/80 to-pink-600/80" },
  push_inviter: { label: "🎁 Inviter Rewards", color: "from-blue-600/80 to-cyan-600/80" },
  push_live: { label: "⏰ 5-Hour Live Rewards", color: "from-amber-600/80 to-orange-600/80" },
};

const DYNAMIC_COLORS = [
  "from-emerald-600/80 to-teal-600/80",
  "from-rose-600/80 to-red-600/80",
  "from-indigo-600/80 to-violet-600/80",
  "from-yellow-600/80 to-amber-600/80",
  "from-fuchsia-600/80 to-purple-600/80",
  "from-sky-600/80 to-blue-600/80",
  "from-lime-600/80 to-green-600/80",
];

const hashCategoryColor = (key: string) => {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return DYNAMIC_COLORS[h % DYNAMIC_COLORS.length];
};

const prettifyCategoryLabel = (key: string) => {
  const base = key.replace(/^push_/, "").replace(/_/g, " ").trim();
  if (!base) return "Custom";
  return "✨ " + base.replace(/\b\w/g, (c) => c.toUpperCase());
};

const getCategoryInfo = (key: string) =>
  PUSH_CATEGORIES[key] || { label: prettifyCategoryLabel(key), color: hashCategoryColor(key) };

export default function AdminPushBroadcast() {
  const [title, setTitle] = useState("");
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
  const [newCategoryMode, setNewCategoryMode] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");

  // All available categories = defaults + any already present in DB
  const allCategoryKeys = Array.from(
    new Set([...Object.keys(PUSH_CATEGORIES), ...Object.keys(grouped)])
  );

  const openEditDialog = (t: BroadcastTemplate) => {
    setEditingTemplate(t);
    setEditForm({ title: t.title_template, body: t.message_template, description: t.description || "" });
    setEditDialog(true);
  };

  const openAddDialog = (category?: string) => {
    setNewCategoryMode(false);
    setNewCategoryLabel("");
    setAddCategory(category || allCategoryKeys[0] || "push_host");
    setAddForm({ title: "", body: "", description: "" });
    setAddDialog(true);
  };

  const openNewCategoryDialog = () => {
    setNewCategoryMode(true);
    setNewCategoryLabel("");
    setAddCategory("");
    setAddForm({ title: "", body: "", description: "" });
    setAddDialog(true);
  };

  const handleSaveEdit = async () => {
    if (!editingTemplate) return;
    await updateTemplate(editingTemplate.id, {
      title_template: editForm.title,
      message_template: editForm.body,
      description: editForm.description,
    });
    setEditDialog(false);
  };

  const handleAddTemplate = async () => {
    if (!addForm.title.trim() || !addForm.body.trim()) {
      toast.error("Title and body are required");
      return;
    }
    let category = addCategory;
    if (newCategoryMode) {
      const slug = newCategoryLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
      if (!slug) { toast.error("Enter a category name"); return; }
      category = slug.startsWith("push_") ? slug : `push_${slug}`;
    }
    const key = `${category}_${Date.now()}`;
    await addTemplate({
      template_key: key,
      title_template: addForm.title,
      message_template: addForm.body,
      description: addForm.description,
      category,
    });
    setAddDialog(false);
    setAddForm({ title: "", body: "", description: "" });
    setNewCategoryMode(false);
    setExpandedPreset(category);
  };


  const handleDeleteTemplate = async (t: BroadcastTemplate) => {
    if (!window.confirm(`Delete template "${t.title_template}"?`)) return;
    await deleteTemplate(t.id);
  };

  const [message, setMessage] = useState("");
  const [targetAudience, setTargetAudience] = useState("all");
  const [linkUrl, setLinkUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sentHistory, setSentHistory] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const { data: tokenStats } = useQuery({
    queryKey: ['device-token-stats'],
    queryFn: async () => {
      const [totalRes, androidRes, iosRes] = await Promise.all([
        supabase.from('device_tokens').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('device_tokens').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('platform', 'android'),
        supabase.from('device_tokens').select('*', { count: 'exact', head: true }).eq('is_active', true).eq('platform', 'ios'),
      ]);
      return { total: totalRes.count || 0, android: androidRes.count || 0, ios: iosRes.count || 0 };
    }
  });

  // ⚡ Zero-refresh: invalidate device-token stats whenever device_tokens changes
  useAdminRealtime(['device_tokens'], () => {
    queryClient.invalidateQueries({ queryKey: ['device-token-stats'] });
  });

  // FCM `image` field (Android) renders the bitmap on the lock-screen heads-up.
  // Android's NotificationCompat.BigPictureStyle decodes whatever Bitmap-loadable
  // format we hand it. So we allow the full A→Z image set that browsers + Android
  // can actually display, not just jpg/png. SVG is excluded because FCM cannot
  // decode vector formats server-side.
  const ALLOWED_PUSH_IMAGE_EXT = new Set([
    'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'heif', 'avif',
  ]);
  const ALLOWED_PUSH_IMAGE_MIME = new Set([
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
    'image/bmp', 'image/heic', 'image/heif', 'image/avif',
  ]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
    const rawExt = file.name.split('.').pop()?.toLowerCase() || '';
    const mime = (file.type || '').toLowerCase();
    if (!ALLOWED_PUSH_IMAGE_EXT.has(rawExt) && !ALLOWED_PUSH_IMAGE_MIME.has(mime)) {
      toast.error("Unsupported image format. Use JPG, PNG, WebP, GIF, BMP, HEIC, HEIF or AVIF.");
      return;
    }
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadImage = async (): Promise<string | null> => {
    if (!imageFile) return null;
    setIsUploading(true);
    try {
      // Preserve the original extension so the storage URL matches the bitmap
      // bytes (mismatched extension caused GIF / HEIC / WebP pushes to render
      // as blank thumbnails on Android lockscreens). Fall back to mime-derived
      // extension, then 'jpg' only as a last resort.
      const rawExt = imageFile.name.split('.').pop()?.toLowerCase() || '';
      const mimeExt = (imageFile.type || '').split('/').pop()?.toLowerCase() || '';
      const ext = ALLOWED_PUSH_IMAGE_EXT.has(rawExt)
        ? rawExt
        : (ALLOWED_PUSH_IMAGE_EXT.has(mimeExt) ? mimeExt : 'jpg');
      const filePath = `broadcast/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('assets').upload(filePath, imageFile, { contentType: imageFile.type || `image/${ext}`, cacheControl: '31536000' });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(filePath);
      const publicReady = await waitForPublicImage(urlData.publicUrl);
      if (!publicReady) throw new Error("Uploaded image is not publicly readable yet. Please try again.");
      return urlData.publicUrl;
    } catch (err: any) {
      recordAdminError({
        kind: "rest",
        label: "AdminPushBroadcast.UploadImage",
        message: err?.message || "Failed to upload image",
        detail: JSON.stringify(err || {}).slice(0, 1000),
        silent: true,
      });
      toast.error(err?.message || "Failed to upload image");
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  const handleSendNotification = async () => {
    if (!title.trim() || !message.trim()) { toast.error("Title and message are required"); return; }
    setIsSending(true);
    try {
      let imageUrl: string | null = null;
      if (imageFile) imageUrl = await uploadImage();
      if (imageFile && !imageUrl) {
        toast.error("Image upload failed. Notification was not sent.");
        return;
      }
      const adminToken = getAdminSessionToken();
      if (!adminToken) { toast.error("Admin session expired. Please sign in again."); setIsSending(false); return; }
      const requestId = createBroadcastRequestId();
      const data = await invokePushBroadcastWithFallback({
        title: title.trim(),
        body: message.trim(),
        target: targetAudience,
        type: 'broadcast',
        imageUrl: imageUrl || undefined,
        data: {
          type: 'broadcast',
          broadcast_id: requestId,
          persist_fallback: false,
          timestamp: new Date().toISOString(),
          ...(linkUrl.trim() ? { link_url: linkUrl.trim() } : {}),
          ...(imageUrl ? { image_url: imageUrl } : {})
        }
      }, adminToken, requestId);

      if (!data?.success && !data?.accepted) {
        throw new Error(data?.error || data?.message || "Push notification failed");
      }
      const sentCount = Number(data?.sent || 0);
      const failedCount = Number(data?.failed || 0);
      toast.success(data?.accepted ? "Broadcast is already processing — please wait." : `Push notification sent to ${sentCount} devices${failedCount ? ` (${failedCount} failed)` : ''}!`);
      setSentHistory(prev => [{ id: Date.now(), title, message, target: targetAudience, linkUrl: linkUrl.trim() || null, imageUrl, sentAt: new Date().toISOString(), sentCount }, ...prev]);
      setTitle(""); setMessage(""); setLinkUrl(""); removeImage();
    } catch (error: any) {
      recordAdminError({
        kind: "edge",
        label: "AdminPushBroadcast.SendNotification",
        message: error?.message || "Failed to send notification",
        detail: error?.stack?.slice(0, 1000),
        silent: true,
      });
      toast.error(error.message || "Failed to send notification");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="admin-pro-shell admin-content space-y-6 p-4 md:p-6 -mx-4 -my-4 sm:-mx-6 sm:-my-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Bell className="h-6 w-6 text-purple-400" />
            Push Notification Broadcast
          </h1>
          <p className="text-slate-600 mt-1">Send push notifications to all users</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-slate-600">Total Devices</p><p className="text-2xl font-bold text-slate-900">{tokenStats?.total || 0}</p></div>
              <Users className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-slate-600">Android</p><p className="text-2xl font-bold text-slate-900">{tokenStats?.android || 0}</p></div>
              <Globe className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-slate-600">iOS</p><p className="text-2xl font-bold text-slate-900">{tokenStats?.ios || 0}</p></div>
              <Target className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Templates (from DB) */}
      <Card className="bg-white border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <CardTitle className="text-slate-900 flex items-center gap-2 text-lg">
              <Zap className="w-5 h-5 text-yellow-400" />
              Quick Templates — Click to Use
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={openNewCategoryDialog} className="border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10">
                <Plus className="w-4 h-4 mr-1" /> New Category
              </Button>
              <Button size="sm" variant="outline" onClick={() => openAddDialog()} className="border-purple-500/30 text-purple-300 hover:bg-purple-500/10">
                <Plus className="w-4 h-4 mr-1" /> Add Template
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {templatesLoading ? (
            <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-purple-400" /></div>
          ) : allCategoryKeys.length === 0 ? (
            <p className="text-slate-500 text-sm py-4 text-center">No categories yet. Click "New Category" to create one.</p>
          ) : allCategoryKeys.map((catKey) => {
            const info = getCategoryInfo(catKey);
            const catTemplates = grouped[catKey] || [];
            const isExpanded = expandedPreset === catKey;
            return (
              <div key={catKey}>
                <div className={`w-full flex items-center gap-2 rounded-xl bg-gradient-to-r ${info.color} text-white font-semibold transition-all hover:opacity-90`}>
                  <button
                    onClick={() => setExpandedPreset(isExpanded ? null : catKey)}
                    className="flex-1 flex items-center justify-between p-3 text-left"
                  >
                    <span>{info.label} ({catTemplates.length})</span>
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); openAddDialog(catKey); setExpandedPreset(catKey); }}
                    title="Add template to this category"
                    className="p-3 hover:bg-white/10 rounded-r-xl"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                {isExpanded && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-2 space-y-2 pl-2">
                    {catTemplates.length === 0 ? (
                      <button
                        onClick={() => openAddDialog(catKey)}
                        className="w-full text-slate-600 hover:text-purple-300 text-sm py-3 pl-2 border border-dashed border-slate-200 hover:border-purple-500/50 rounded-lg transition-all"
                      >
                        + Add first template to {info.label}
                      </button>
                    ) : catTemplates.map((template, idx) => (
                      <motion.div
                        key={template.id}
                        initial={{ x: -10, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: idx * 0.05 }}
                        className="flex items-start gap-2"
                      >
                        <button
                          onClick={() => {
                            setTitle(template.title_template);
                            setMessage(template.message_template);
                            toast.success("✅ Template loaded! Edit & send.");
                          }}
                          className="flex-1 text-left p-3 rounded-lg bg-white border border-slate-200 hover:border-purple-500/50 hover:bg-white transition-all group"
                        >
                          <p className="text-slate-900 font-medium text-sm truncate group-hover:text-purple-300 transition-colors">{template.title_template}</p>
                          <p className="text-slate-600 text-xs mt-1 line-clamp-2">{template.message_template}</p>
                        </button>
                        <div className="flex flex-col gap-1 pt-1">
                          <button onClick={() => openEditDialog(template)} className="p-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 transition-colors" title="Edit">
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteTemplate(template)} className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors" title="Delete">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* Compose / History Tabs */}
      <Tabs defaultValue="compose" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-white">
          <TabsTrigger value="compose">Compose Message</TabsTrigger>
          <TabsTrigger value="history">Sent History</TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="mt-4">
          <Card className="bg-white border-slate-200">
            <CardHeader>
              <CardTitle className="text-slate-900">New Broadcast</CardTitle>
              <CardDescription>Send a push notification to users</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="target">Target Audience</Label>
                <Select value={targetAudience} onValueChange={setTargetAudience}>
                  <SelectTrigger className="bg-gray-700 border-gray-600"><SelectValue placeholder="Select audience" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users ({tokenStats?.total || 0})</SelectItem>
                    <SelectItem value="android">Android Only ({tokenStats?.android || 0})</SelectItem>
                    <SelectItem value="ios">iOS Only ({tokenStats?.ios || 0})</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title">Notification Title</Label>
                <Input id="title" placeholder="Enter notification title..." value={title} onChange={(e) => setTitle(e.target.value)} className="bg-gray-700 border-gray-600" maxLength={50} />
                <p className="text-xs text-slate-500">{title.length}/50 characters</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message Body</Label>
                <Textarea id="message" placeholder="Enter notification message..." value={message} onChange={(e) => setMessage(e.target.value)} className="bg-gray-700 border-gray-600 min-h-[100px]" maxLength={200} />
                <p className="text-xs text-slate-500">{message.length}/200 characters</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="link" className="flex items-center gap-2"><Link2 className="h-4 w-4 text-blue-400" />Action Link (Optional)</Label>
                <Input id="link" placeholder="https://example.com or /recharge" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="bg-gray-700 border-gray-600" />
                <p className="text-xs text-slate-500">Users will navigate to this link when tapping the notification</p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2"><ImagePlus className="h-4 w-4 text-green-400" />Notification Image (Optional)</Label>
                {imagePreview ? (
                  <div className="relative inline-block">
                    <SmartImage src={imagePreview} alt="Preview" className="w-full max-w-sm h-auto rounded-lg border border-gray-600 object-cover max-h-48" fallbackSrc="/placeholder.svg" />
                    <button onClick={removeImage} className="absolute top-2 right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors">
                      <X className="h-3 w-3 text-slate-900" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-gray-600 rounded-lg p-6 flex flex-col items-center gap-2 hover:border-purple-500/50 hover:bg-gray-700/30 transition-all">
                    <ImagePlus className="h-8 w-8 text-slate-500" />
                    <span className="text-sm text-slate-600">Click to upload image</span>
                    <span className="text-xs text-slate-500">PNG, JPG up to 5MB</span>
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
              </div>

              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                      <Bell className="h-5 w-5 text-slate-900" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-900 font-medium">{title || "Notification Title"}</p>
                      <p className="text-slate-600 text-sm">{message || "Notification message will appear here..."}</p>
                      {linkUrl.trim() && (
                        <div className="flex items-center gap-1 mt-1">
                          <ExternalLink className="h-3 w-3 text-blue-400" />
                          <span className="text-blue-400 text-xs truncate">{linkUrl.trim()}</span>
                        </div>
                      )}
                      <p className="text-slate-500 text-xs mt-1">now</p>
                    </div>
                    {imagePreview && <SmartImage src={imagePreview} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-slate-200" fallbackSrc="/placeholder.svg" />}
                  </div>
                </div>
              </div>

              <Button onClick={handleSendNotification} disabled={isSending || isUploading || !title.trim() || !message.trim()} className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
                {isSending || isUploading ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" />{isUploading ? "Uploading image..." : "Sending..."}</>) : (<><Send className="h-4 w-4 mr-2" />Send Notification</>)}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="mt-4">
          <Card className="bg-white border-slate-200">
            <CardHeader>
              <CardTitle className="text-slate-900">Sent History</CardTitle>
              <CardDescription>Recent broadcast notifications</CardDescription>
            </CardHeader>
            <CardContent>
              {sentHistory.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No notifications sent yet in this session</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sentHistory.map((item) => (
                    <div key={item.id} className="bg-white rounded-lg p-4 border border-slate-200">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                            <p className="text-slate-900 font-medium truncate">{item.title}</p>
                          </div>
                          <p className="text-slate-600 text-sm mt-1">{item.message}</p>
                          {item.linkUrl && (<div className="flex items-center gap-1 mt-1"><Link2 className="h-3 w-3 text-blue-400" /><span className="text-blue-400 text-xs truncate">{item.linkUrl}</span></div>)}
                          {item.imageUrl && (<div className="flex items-center gap-1 mt-1"><ImagePlus className="h-3 w-3 text-green-400" /><span className="text-green-400 text-xs">Image attached</span></div>)}
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">{item.sentCount} sent</Badge>
                          <p className="text-slate-500 text-xs mt-1">{new Date(item.sentAt).toLocaleTimeString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Template Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-lg w-screen sm:w-auto h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[90vh] rounded-none sm:rounded-lg overflow-y-auto bg-white border-slate-200 text-slate-900">

          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Edit3 className="w-5 h-5 text-purple-400" />
              Edit Template
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Title</Label>
              <Input value={editForm.title} onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))} className="mt-1.5 bg-white border-slate-300 text-slate-900" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Message Body</Label>
              <Textarea value={editForm.body} onChange={(e) => setEditForm(prev => ({ ...prev, body: e.target.value }))} className="mt-1.5 min-h-[120px] bg-white border-slate-300 text-slate-900" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Description (Optional)</Label>
              <Input value={editForm.description} onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))} className="mt-1.5 bg-white border-slate-300 text-slate-900" placeholder="Internal note" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditDialog(false)} className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-100">Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={saving || !editForm.title || !editForm.body} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />} Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Template Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent className="max-w-lg w-screen sm:w-auto h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[90vh] rounded-none sm:rounded-lg overflow-y-auto bg-white border-slate-200 text-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Plus className="w-5 h-5 text-green-400" />
              {newCategoryMode ? "Create New Category" : "Add New Template"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            {newCategoryMode ? (
              <div>
                <Label className="text-sm font-medium text-slate-700">Category Name *</Label>
                <Input
                  value={newCategoryLabel}
                  onChange={(e) => setNewCategoryLabel(e.target.value)}
                  className="mt-1.5 bg-white border-slate-300 text-slate-900"
                  placeholder="e.g. Daily Reminders, VIP Promo..."
                />
                <p className="text-xs text-slate-500 mt-1">A new category will be created and the first template added to it.</p>
              </div>
            ) : (
              <div>
                <Label className="text-sm font-medium text-slate-700">Category</Label>
                <Select value={addCategory} onValueChange={setAddCategory}>
                  <SelectTrigger className="mt-1.5 bg-white border-slate-300 text-slate-900"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {allCategoryKeys.map((key) => (
                      <SelectItem key={key} value={key}>{getCategoryInfo(key).label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => { setNewCategoryMode(true); setNewCategoryLabel(""); }}
                  className="text-xs text-emerald-400 hover:text-emerald-300 mt-1.5"
                >
                  + Create a new category instead
                </button>
              </div>
            )}
            <div>
              <Label className="text-sm font-medium text-slate-700">Title *</Label>
              <Input value={addForm.title} onChange={(e) => setAddForm(prev => ({ ...prev, title: e.target.value }))} className="mt-1.5 bg-white border-slate-300 text-slate-900" placeholder="Notification title..." />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Message Body *</Label>
              <Textarea value={addForm.body} onChange={(e) => setAddForm(prev => ({ ...prev, body: e.target.value }))} className="mt-1.5 min-h-[120px] bg-white border-slate-300 text-slate-900" placeholder="Notification message..." />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Description (Optional)</Label>
              <Input value={addForm.description} onChange={(e) => setAddForm(prev => ({ ...prev, description: e.target.value }))} className="mt-1.5 bg-white border-slate-300 text-slate-900" placeholder="Internal note" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setAddDialog(false)} className="flex-1 border-slate-300 text-slate-700 hover:bg-slate-100">Cancel</Button>
              <Button onClick={handleAddTemplate} disabled={saving || !addForm.title || !addForm.body} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />} Add Template
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
