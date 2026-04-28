import { useState, useEffect, useRef } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Megaphone, 
  Send,
  Loader2,
  Users,
  Building2,
  Crown,
  Shield,
  Diamond,
  AlertTriangle,
  Clock,
  Check,
  Trash2,
  Eye,
  XCircle,
  Languages,
  ImagePlus,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { formatDistanceToNow } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";

interface AdminNotice {
  id: string;
  title: string;
  message: string;
  image_url: string | null;
  target_audience: string[];
  priority: string;
  is_active: boolean;
  created_at: string;
  expires_at: string | null;
}

const AUDIENCE_OPTIONS = [
  { id: 'all', label: 'All Users', icon: Users, gradient: 'from-blue-500 to-indigo-600', description: 'Send to everyone' },
  { id: 'hosts', label: 'Hosts Only', icon: Crown, gradient: 'from-pink-500 to-rose-600', description: 'Female verified hosts' },
  { id: 'agencies', label: 'Agencies Only', icon: Building2, gradient: 'from-purple-500 to-violet-600', description: 'Agency owners' },
  { id: 'users', label: 'Regular Users', icon: Users, gradient: 'from-emerald-500 to-teal-600', description: 'All registered users' },
  { id: 'level5_helpers', label: 'Level 5 Helpers', icon: Diamond, gradient: 'from-cyan-400 to-blue-500', description: 'Verified Level 5 helpers' },
  { id: 'helpers', label: 'All Helpers', icon: Shield, gradient: 'from-amber-500 to-orange-600', description: 'All verified helpers' },
];

const PRIORITY_OPTIONS = [
  { id: 'low', label: 'Low', gradient: 'from-slate-500 to-gray-600', textColor: 'text-slate-400' },
  { id: 'normal', label: 'Normal', gradient: 'from-blue-500 to-indigo-600', textColor: 'text-blue-400' },
  { id: 'high', label: 'High', gradient: 'from-orange-500 to-red-500', textColor: 'text-orange-400' },
  { id: 'urgent', label: 'Urgent', gradient: 'from-red-500 to-rose-600', textColor: 'text-red-400' },
];

const AdminNoticeBroadcast = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [selectedAudiences, setSelectedAudiences] = useState<string[]>([]);
  const [priority, setPriority] = useState("normal");
  const [expiresIn, setExpiresIn] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  
  const [notices, setNotices] = useState<AdminNotice[]>([]);
  const [loadingNotices, setLoadingNotices] = useState(true);
  
  const [previewDialog, setPreviewDialog] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const TRANSLATE_LANGUAGES = [
    { code: "Bengali", label: "🇧🇩 Bengali" },
    { code: "Hindi", label: "🇮🇳 Hindi" },
    { code: "Urdu", label: "🇵🇰 Urdu" },
    { code: "Nepali", label: "🇳🇵 Nepali" },
    { code: "Sinhala", label: "🇱🇰 Sinhala" },
    { code: "English", label: "🇬🇧 English" },
    { code: "Arabic", label: "🇸🇦 Arabic" },
  ];

  useAdminRealtime(['admin_notices'], () => fetchNotices());

  const fetchNotices = async () => {
    try {
      const { data, error } = await supabase
        .from("admin_notices")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotices((data as AdminNotice[]) || []);
    } catch (error: any) {
      console.error("Error fetching notices:", error);
    } finally {
      setLoadingNotices(false);
    }
  };

  const toggleAudience = (audienceId: string) => {
    setSelectedAudiences(prev => {
      if (audienceId === 'all') {
        return prev.includes('all') ? [] : ['all'];
      }
      
      const newAudiences = prev.filter(a => a !== 'all');
      if (newAudiences.includes(audienceId)) {
        return newAudiences.filter(a => a !== audienceId);
      }
      return [...newAudiences, audienceId];
    });
  };

  const handleTranslate = async (targetLanguage: string) => {
    if (!title.trim() && !message.trim()) {
      toast({
        title: "Nothing to translate",
        description: "Please enter a title or message first",
        variant: "destructive",
      });
      return;
    }

    setTranslating(true);
    try {
      const translateText = async (text: string) => {
        if (!text.trim()) return text;
        const { data, error } = await supabase.functions.invoke("translate", {
          body: { text, targetLanguage },
        });
        if (error) throw error;
        return data.translatedText || text;
      };

      const [translatedTitle, translatedMessage] = await Promise.all([
        title.trim() ? translateText(title) : Promise.resolve(title),
        message.trim() ? translateText(message) : Promise.resolve(message),
      ]);

      setTitle(translatedTitle);
      setMessage(translatedMessage);

      toast({
        title: `Translated to ${targetLanguage} ✅`,
        description: "Title and message have been translated",
      });
    } catch (error: any) {
      toast({
        title: "Translation Failed",
        description: error.message || "Could not translate the text",
        variant: "destructive",
      });
    } finally {
      setTranslating(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const filesToUpload = Array.from(files).filter(file => {
      if (!file.type.startsWith('image/')) {
        toast({ title: "Invalid File", description: `${file.name} is not an image`, variant: "destructive" });
        return false;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: "File Too Large", description: `${file.name} exceeds 10MB`, variant: "destructive" });
        return false;
      }
      return true;
    });

    if (filesToUpload.length === 0) return;
    if (imageUrls.length + filesToUpload.length > 10) {
      toast({ title: "Too Many Images", description: "Maximum 10 images allowed", variant: "destructive" });
      return;
    }

    setUploadingImage(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of filesToUpload) {
        const ext = file.name.split('.').pop();
        const fileName = `notice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
        const { error } = await supabase.storage
          .from('banners')
          .upload(`notices/${fileName}`, file, { upsert: true });

        if (error) throw error;

        const { data: urlData } = supabase.storage.from('banners').getPublicUrl(`notices/${fileName}`);
        uploadedUrls.push(urlData.publicUrl);
      }
      setImageUrls(prev => [...prev, ...uploadedUrls]);
      toast({ title: `${uploadedUrls.length} Image(s) Uploaded ✅` });
    } catch (error: any) {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const handleSendNotice = async () => {
    if (!title.trim() || !message.trim() || selectedAudiences.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please fill in all fields and select at least one audience",
        variant: "destructive",
      });
      return;
    }

    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      let expiresAt = null;
      if (expiresIn) {
        const hours = parseInt(expiresIn);
        if (!isNaN(hours) && hours > 0) {
          expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
        }
      }

      const { error } = await supabase
        .from("admin_notices")
        .insert({
          title: title.trim(),
          message: message.trim(),
          image_url: imageUrls.length > 0 ? imageUrls.join(',') : null,
          target_audience: selectedAudiences,
          priority,
          created_by: user?.id,
          expires_at: expiresAt,
        });

      if (error) throw error;

      toast({
        title: "Notice Sent! 📢",
        description: `Notice has been broadcast to ${selectedAudiences.join(', ')}`,
      });

      // Reset form
      setTitle("");
      setMessage("");
      setImageUrls([]);
      setSelectedAudiences([]);
      setPriority("normal");
      setExpiresIn("");
      fetchNotices();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const handleDeleteNotice = async (noticeId: string) => {
    setDeleting(true);
    try {
      const { error } = await supabase
        .from("admin_notices")
        .delete()
        .eq("id", noticeId);

      if (error) throw error;

      toast({
        title: "Notice Deleted",
        description: "The notice has been removed",
      });
      setDeleteDialog(null);
      fetchNotices();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async (notice: AdminNotice) => {
    try {
      const { error } = await supabase
        .from("admin_notices")
        .update({ is_active: !notice.is_active })
        .eq("id", notice.id);

      if (error) throw error;

      toast({
        title: notice.is_active ? "Notice Deactivated" : "Notice Activated",
        description: notice.is_active ? "Users will no longer see this notice" : "Notice is now visible to users",
      });
      fetchNotices();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getAudienceLabel = (audienceIds: string[]) => {
    return audienceIds.map(id => {
      const option = AUDIENCE_OPTIONS.find(o => o.id === id);
      return option?.label || id;
    }).join(', ');
  };

  const getPriorityBadge = (priorityId: string) => {
    const option = PRIORITY_OPTIONS.find(o => o.id === priorityId);
    return (
      <Badge className={`bg-gradient-to-r ${option?.gradient} text-white text-xs border-0 shadow-sm`}>
        {priorityId === 'urgent' ? '🚨' : priorityId === 'high' ? '⚡' : priorityId === 'normal' ? '📢' : '📋'} {option?.label || priorityId}
      </Badge>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gradient-to-r from-orange-500 via-rose-500 to-pink-600 shadow-lg shadow-orange-500/20">
        <div className="flex items-center h-14 px-4">
          <button 
            onClick={() => navigate('/admin')}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold text-white pr-7">
            Notice Broadcast
          </h1>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Compose Section */}
        <Card className="border-2 border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-orange-500/5">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Megaphone className="w-5 h-5 text-primary" />
              Compose Notice
            </CardTitle>
            <CardDescription>
              Send targeted announcements to specific user groups
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Title */}
            <div>
              <Label className="text-sm font-medium">Notice Title *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter notice title..."
                className="mt-1.5"
                maxLength={100}
              />
            </div>

            {/* Message */}
            <div>
              <Label className="text-sm font-medium">Message *</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your announcement message..."
                className="mt-1.5 min-h-[120px] resize-none"
                maxLength={5000}
              />
              <p className="text-xs text-muted-foreground mt-1 text-right">
                {message.length}/5000
              </p>
            </div>

            {/* Image Upload */}
            <div>
              <Label className="text-sm font-medium">Attach Image (Optional)</Label>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
              {imageUrls.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {imageUrls.map((url, idx) => (
                    <div key={idx} className="relative inline-block">
                      <img src={url} alt={`Notice ${idx + 1}`} className="h-24 w-24 rounded-lg border border-border object-cover" />
                      <button
                        onClick={() => setImageUrls(prev => prev.filter((_, i) => i !== idx))}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-destructive text-white rounded-full flex items-center justify-center hover:bg-destructive/80"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {imageUrls.length < 10 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="mt-1.5 w-full border-dashed"
                >
                  {uploadingImage ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Uploading...</>
                  ) : (
                    <><ImagePlus className="w-4 h-4 mr-2" /> Add Images ({imageUrls.length}/10)</>
                  )}
                </Button>
              )}
            </div>


            <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl p-3 border border-blue-500/20">
              <div className="flex items-center gap-2 mb-2">
                <Languages className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium">Translate Message</span>
                {translating && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
              </div>
              <div className="flex flex-wrap gap-2">
                {TRANSLATE_LANGUAGES.map((lang) => (
                  <Button
                    key={lang.code}
                    variant="outline"
                    size="sm"
                    disabled={translating || (!title.trim() && !message.trim())}
                    onClick={() => handleTranslate(lang.code)}
                    className="text-xs h-7 px-2.5"
                  >
                    {lang.label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Target Audience */}
            <div>
              <Label className="text-sm font-medium mb-3 block">Target Audience *</Label>
              <div className="grid grid-cols-2 gap-3">
                {AUDIENCE_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const isSelected = selectedAudiences.includes(option.id);
                  const isDisabled = option.id !== 'all' && selectedAudiences.includes('all');
                  
                  return (
                    <motion.button
                      key={option.id}
                      onClick={() => toggleAudience(option.id)}
                      disabled={isDisabled}
                      className={`p-3 rounded-xl border-2 transition-all text-left ${
                        isSelected 
                          ? 'border-primary bg-primary/10' 
                          : isDisabled
                            ? 'border-muted bg-muted/30 opacity-50 cursor-not-allowed'
                            : 'border-border hover:border-primary/50'
                      }`}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${option.gradient} flex items-center justify-center shadow-lg`}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{option.label}</p>
                          <p className="text-xs text-muted-foreground truncate">{option.description}</p>
                        </div>
                        {isSelected && (
                          <Check className="w-5 h-5 text-primary flex-shrink-0" />
                        )}
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Priority & Expiry */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITY_OPTIONS.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        <div className="flex items-center gap-2">
                          <span className={`w-2.5 h-2.5 rounded-full bg-gradient-to-r ${option.gradient}`} />
                          {option.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm font-medium">Expires In (hours)</Label>
                <Input
                  type="number"
                  value={expiresIn}
                  onChange={(e) => setExpiresIn(e.target.value)}
                  placeholder="Optional"
                  className="mt-1.5"
                  min="1"
                />
              </div>
            </div>

            {/* Preview & Send Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={() => setPreviewDialog(true)}
                disabled={!title || !message}
                className="flex-1"
              >
                <Eye className="w-4 h-4 mr-2" />
                Preview
              </Button>
              <Button
                onClick={handleSendNotice}
                disabled={sending || !title || !message || selectedAudiences.length === 0}
                className="flex-1 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Send Notice
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Recent Notices */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="w-5 h-5 text-muted-foreground" />
            Recent Notices
          </h2>

          {loadingNotices ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : notices.length === 0 ? (
            <Card className="p-8 text-center">
              <Megaphone className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No notices sent yet</p>
            </Card>
          ) : (
            <ScrollArea className="h-[500px]">
              <div className="space-y-3">
                <AnimatePresence>
                  {notices.map((notice, index) => (
                    <motion.div
                      key={notice.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Card className={`overflow-hidden ${!notice.is_active ? 'opacity-60' : ''}`}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-semibold truncate">{notice.title}</h3>
                                {getPriorityBadge(notice.priority)}
                                {!notice.is_active && (
                                  <Badge variant="outline" className="text-xs">
                                    Inactive
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                                {notice.message}
                              </p>
                              {notice.image_url && (() => {
                                const urls = notice.image_url!.split(',').map(u => u.trim()).filter(Boolean);
                                return urls.length > 0 ? (
                                  <div className="flex flex-wrap gap-1.5 mb-2">
                                    {urls.map((url, idx) => (
                                      <img key={idx} src={url} alt={`Notice ${idx+1}`} className="rounded-lg h-20 w-20 object-cover border border-border" />
                                    ))}
                                  </div>
                                ) : null;
                              })()}
                              <div className="flex flex-wrap gap-1">
                                {notice.target_audience.map(audience => {
                                  const option = AUDIENCE_OPTIONS.find(o => o.id === audience);
                                  return (
                                    <Badge key={audience} variant="secondary" className="text-xs">
                                      {option?.label || audience}
                                    </Badge>
                                  );
                                })}
                              </div>
                              <p className="text-xs text-muted-foreground mt-2">
                                {formatDistanceToNow(new Date(notice.created_at), { addSuffix: true })}
                                {notice.expires_at && (
                                  <span className="ml-2">
                                    • Expires {formatDistanceToNow(new Date(notice.expires_at), { addSuffix: true })}
                                  </span>
                                )}
                              </p>
                            </div>
                            
                            <div className="flex flex-col gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleToggleActive(notice)}
                                className="h-8 w-8"
                              >
                                {notice.is_active ? (
                                  <XCircle className="w-4 h-4 text-orange-500" />
                                ) : (
                                  <Check className="w-4 h-4 text-green-500" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setDeleteDialog(notice.id)}
                                className="h-8 w-8 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewDialog} onOpenChange={setPreviewDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Notice Preview</DialogTitle>
            <DialogDescription>
              This is how users will see the notice
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-4">
            <div className={`rounded-2xl p-4 border-2 ${
              priority === 'urgent' 
                ? 'bg-gradient-to-br from-red-500/20 to-orange-500/10 border-red-500/30' 
                : priority === 'high'
                  ? 'bg-gradient-to-br from-orange-500/20 to-amber-500/10 border-orange-500/30'
                  : 'bg-gradient-to-br from-primary/10 to-blue-500/5 border-primary/20'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  priority === 'urgent' ? 'bg-red-500' : priority === 'high' ? 'bg-orange-500' : 'bg-primary'
                }`}>
                  <Megaphone className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-foreground">{title || 'Notice Title'}</h4>
                    {priority === 'urgent' && (
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                    {message || 'Your message will appear here...'}
                  </p>
                  {imageUrls.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {imageUrls.map((url, idx) => (
                        <img key={idx} src={url} alt={`Notice ${idx + 1}`} className="rounded-lg h-24 w-24 object-cover" />
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground/70 mt-2">Just now • Admin Notice</p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteDialog} onOpenChange={() => setDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Notice?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The notice will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDialog && handleDeleteNotice(deleteDialog)}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminNoticeBroadcast;
