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
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import { useBroadcastTemplates, type BroadcastTemplate } from "@/hooks/useBroadcastTemplates";

const PUSH_CATEGORIES: Record<string, { label: string; color: string }> = {
  push_host: { label: "🎤 Host Messages", color: "from-purple-600/80 to-pink-600/80" },
  push_inviter: { label: "🎁 Inviter Rewards", color: "from-blue-600/80 to-cyan-600/80" },
  push_live: { label: "⏰ 5-Hour Live Rewards", color: "from-amber-600/80 to-orange-600/80" },
};

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

  const openEditDialog = (t: BroadcastTemplate) => {
    setEditingTemplate(t);
    setEditForm({ title: t.title_template, body: t.message_template, description: t.description || "" });
    setEditDialog(true);
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
    const key = `${addCategory}_${Date.now()}`;
    await addTemplate({
      template_key: key,
      title_template: addForm.title,
      message_template: addForm.body,
      description: addForm.description,
      category: addCategory,
    });
    setAddDialog(false);
    setAddForm({ title: "", body: "", description: "" });
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

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5MB"); return; }
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
      const ext = imageFile.name.split('.').pop() || 'jpg';
      const filePath = `broadcast/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('assets').upload(filePath, imageFile, { contentType: imageFile.type, cacheControl: '31536000' });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('assets').getPublicUrl(filePath);
      return urlData.publicUrl;
    } catch (err: any) {
      toast.error("Failed to upload image");
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
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          title: title.trim(), body: message.trim(), target: targetAudience,
          imageUrl: imageUrl || undefined,
          data: { type: 'broadcast', timestamp: new Date().toISOString(), ...(linkUrl.trim() ? { link_url: linkUrl.trim() } : {}), ...(imageUrl ? { image_url: imageUrl } : {}) }
        }
      });
      if (error) throw error;
      toast.success(`Push notification sent to ${data?.sent || 0} devices!`);
      setSentHistory(prev => [{ id: Date.now(), title, message, target: targetAudience, linkUrl: linkUrl.trim() || null, imageUrl, sentAt: new Date().toISOString(), sentCount: data?.sent || 0 }, ...prev]);
      setTitle(""); setMessage(""); setLinkUrl(""); removeImage();
    } catch (error: any) {
      toast.error(error.message || "Failed to send notification");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell className="h-6 w-6 text-purple-400" />
            Push Notification Broadcast
          </h1>
          <p className="text-gray-400 mt-1">Send push notifications to all users</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-gray-400">Total Devices</p><p className="text-2xl font-bold text-white">{tokenStats?.total || 0}</p></div>
              <Users className="h-8 w-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/20 to-green-600/10 border-green-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-gray-400">Android</p><p className="text-2xl font-bold text-white">{tokenStats?.android || 0}</p></div>
              <Globe className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/20 to-purple-600/10 border-purple-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm text-gray-400">iOS</p><p className="text-2xl font-bold text-white">{tokenStats?.ios || 0}</p></div>
              <Target className="h-8 w-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Templates (from DB) */}
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
                      <p className="text-gray-500 text-sm py-2 pl-2">No templates yet. Click "Add" to create one.</p>
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
                          className="flex-1 text-left p-3 rounded-lg bg-gray-800/70 border border-gray-700 hover:border-purple-500/50 hover:bg-gray-800 transition-all group"
                        >
                          <p className="text-white font-medium text-sm truncate group-hover:text-purple-300 transition-colors">{template.title_template}</p>
                          <p className="text-gray-400 text-xs mt-1 line-clamp-2">{template.message_template}</p>
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
        <TabsList className="grid w-full grid-cols-2 bg-gray-800/50">
          <TabsTrigger value="compose">Compose Message</TabsTrigger>
          <TabsTrigger value="history">Sent History</TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="mt-4">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white">New Broadcast</CardTitle>
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
                <p className="text-xs text-gray-500">{title.length}/50 characters</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="message">Message Body</Label>
                <Textarea id="message" placeholder="Enter notification message..." value={message} onChange={(e) => setMessage(e.target.value)} className="bg-gray-700 border-gray-600 min-h-[100px]" maxLength={200} />
                <p className="text-xs text-gray-500">{message.length}/200 characters</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="link" className="flex items-center gap-2"><Link2 className="h-4 w-4 text-blue-400" />Action Link (Optional)</Label>
                <Input id="link" placeholder="https://example.com or /recharge" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="bg-gray-700 border-gray-600" />
                <p className="text-xs text-gray-500">Users will navigate to this link when tapping the notification</p>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-2"><ImagePlus className="h-4 w-4 text-green-400" />Notification Image (Optional)</Label>
                {imagePreview ? (
                  <div className="relative inline-block">
                    <img src={imagePreview} alt="Preview" className="w-full max-w-sm h-auto rounded-lg border border-gray-600 object-cover max-h-48" />
                    <button onClick={removeImage} className="absolute top-2 right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors">
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-gray-600 rounded-lg p-6 flex flex-col items-center gap-2 hover:border-purple-500/50 hover:bg-gray-700/30 transition-all">
                    <ImagePlus className="h-8 w-8 text-gray-500" />
                    <span className="text-sm text-gray-400">Click to upload image</span>
                    <span className="text-xs text-gray-500">PNG, JPG up to 5MB</span>
                  </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
              </div>

              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center flex-shrink-0">
                      <Bell className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium">{title || "Notification Title"}</p>
                      <p className="text-gray-400 text-sm">{message || "Notification message will appear here..."}</p>
                      {linkUrl.trim() && (
                        <div className="flex items-center gap-1 mt-1">
                          <ExternalLink className="h-3 w-3 text-blue-400" />
                          <span className="text-blue-400 text-xs truncate">{linkUrl.trim()}</span>
                        </div>
                      )}
                      <p className="text-gray-500 text-xs mt-1">now</p>
                    </div>
                    {imagePreview && <img src={imagePreview} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-gray-700" />}
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
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white">Sent History</CardTitle>
              <CardDescription>Recent broadcast notifications</CardDescription>
            </CardHeader>
            <CardContent>
              {sentHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No notifications sent yet in this session</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sentHistory.map((item) => (
                    <div key={item.id} className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-green-400 flex-shrink-0" />
                            <p className="text-white font-medium truncate">{item.title}</p>
                          </div>
                          <p className="text-gray-400 text-sm mt-1">{item.message}</p>
                          {item.linkUrl && (<div className="flex items-center gap-1 mt-1"><Link2 className="h-3 w-3 text-blue-400" /><span className="text-blue-400 text-xs truncate">{item.linkUrl}</span></div>)}
                          {item.imageUrl && (<div className="flex items-center gap-1 mt-1"><ImagePlus className="h-3 w-3 text-green-400" /><span className="text-green-400 text-xs">Image attached</span></div>)}
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">{item.sentCount} sent</Badge>
                          <p className="text-gray-500 text-xs mt-1">{new Date(item.sentAt).toLocaleTimeString()}</p>
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
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-[#1a1a2e] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Edit3 className="w-5 h-5 text-purple-400" />
              Edit Template
            </DialogTitle>
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
            <div>
              <Label className="text-sm font-medium text-white/80">Description (Optional)</Label>
              <Input value={editForm.description} onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))} className="mt-1.5 bg-white/5 border-white/10 text-white" placeholder="Internal note" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setEditDialog(false)} className="flex-1 border-white/20 text-white/80 hover:bg-white/10">Cancel</Button>
              <Button onClick={handleSaveEdit} disabled={saving || !editForm.title || !editForm.body} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white">
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
            <DialogTitle className="flex items-center gap-2 text-white">
              <Plus className="w-5 h-5 text-green-400" />
              Add New Template
            </DialogTitle>
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
            <div>
              <Label className="text-sm font-medium text-white/80">Description (Optional)</Label>
              <Input value={addForm.description} onChange={(e) => setAddForm(prev => ({ ...prev, description: e.target.value }))} className="mt-1.5 bg-white/5 border-white/10 text-white" placeholder="Internal note" />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setAddDialog(false)} className="flex-1 border-white/20 text-white/80 hover:bg-white/10">Cancel</Button>
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
