import { useState } from "react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Mail, Send, Users, UserCheck, Crown, Sparkles,
  AlertTriangle, CheckCircle, Loader2, Edit3, Save, Trash2, Plus
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import PolicyLinkPicker from "@/components/policies/PolicyLinkPicker";
import { useBroadcastTemplates, type BroadcastTemplate } from "@/hooks/useBroadcastTemplates";

type TargetAudience = 'all' | 'active' | 'hosts' | 'custom';

const AdminEmailBroadcast = () => {
  const [subject, setSubject] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [targetAudience, setTargetAudience] = useState<TargetAudience>("all");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ sent: number; failed: number; totalEmails: number } | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // DB templates
  const { templates, loading: templatesLoading, saving, updateTemplate, addTemplate, deleteTemplate } = useBroadcastTemplates("email");

  // Edit dialog
  const [editDialog, setEditDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<BroadcastTemplate | null>(null);
  const [editForm, setEditForm] = useState({ title: "", body: "", description: "" });

  // Add dialog
  const [addDialog, setAddDialog] = useState(false);
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
    if (!addForm.title.trim() || !addForm.body.trim()) { toast.error("Name and content required"); return; }
    await addTemplate({
      template_key: `email_${Date.now()}`,
      title_template: addForm.title,
      message_template: addForm.body,
      description: addForm.description,
      category: "email",
    });
    setAddDialog(false);
    setAddForm({ title: "", body: "", description: "" });
  };

  const handleDeleteTemplate = async (t: BroadcastTemplate) => {
    if (!window.confirm(`Delete template "${t.title_template}"?`)) return;
    await deleteTemplate(t.id);
  };

  const handleSend = async () => {
    if (!subject.trim() || !htmlContent.trim()) { toast.error("Subject and content are required"); return; }
    const confirmed = window.confirm(
      `Are you sure you want to send this email to ${targetAudience === 'all' ? 'ALL users' : targetAudience === 'active' ? 'active users (7 days)' : targetAudience === 'hosts' ? 'all hosts' : 'custom list'}?\n\nSubject: ${subject}`
    );
    if (!confirmed) return;
    setSending(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('send-bulk-email', {
        body: { subject, htmlContent, targetAudience },
      });
      if (error) throw error;
      setResult(data);
      if (data.sent > 0) toast.success(`✅ ${data.sent} emails sent successfully!`);
      if (data.failed > 0) toast.warning(`⚠️ ${data.failed} emails failed to send`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send broadcast');
    }
    setSending(false);
  };

  const applyTemplate = (template: BroadcastTemplate) => {
    setSubject(template.title_template);
    setHtmlContent(template.message_template);
    toast.success(`Template "${template.title_template}" applied`);
  };

  return (
    <div className="admin-pro-shell admin-content p-4 md:p-6 space-y-6 -mx-4 -my-4 sm:-mx-6 sm:-my-6">
      <AdminPageHeader
        title="Email Broadcast"
        subtitle="Send emails to all registered users via Amazon SES"
        icon={Mail}
      />

      {/* Quick Templates from DB */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Sparkles className="w-4 h-4" /> Quick Templates
          </h3>
          <Button size="sm" variant="outline" onClick={() => setAddDialog(true)} className="h-7 text-xs">
            <Plus className="w-3 h-3 mr-1" /> Add Template
          </Button>
        </div>
        {templatesLoading ? (
          <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-purple-400" /></div>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">No email templates yet. Click "Add Template" to create one.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {templates.map((t) => (
              <div key={t.id} className="relative group">
                <button
                  onClick={() => applyTemplate(t)}
                  className="w-full p-4 rounded-xl border border-border bg-card hover:border-primary/50 hover:bg-primary/5 transition-all text-left"
                >
                  <p className="font-medium text-sm">{t.title_template}</p>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{t.description || t.template_key}</p>
                </button>
                {/* Edit/Delete overlay */}
                <div className="absolute top-2 right-2 flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEditDialog(t); }}
                    className="p-1.5 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 transition-colors"
                    title="Edit"
                  >
                    <Edit3 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteTemplate(t); }}
                    className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-400 transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Compose */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">Target Audience</label>
            <Select value={targetAudience} onValueChange={(v) => setTargetAudience(v as TargetAudience)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all"><span className="flex items-center gap-2"><Users className="w-4 h-4" /> All Users</span></SelectItem>
                <SelectItem value="active"><span className="flex items-center gap-2"><UserCheck className="w-4 h-4" /> Active Users (7 days)</span></SelectItem>
                <SelectItem value="hosts"><span className="flex items-center gap-2"><Crown className="w-4 h-4" /> All Hosts</span></SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Enter email subject..." className="h-12" />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium">HTML Content</label>
              <PolicyLinkPicker
                format="html"
                onInsert={(snippet) =>
                  setHtmlContent((prev) => (prev ? `${prev}\n\n<p>${snippet}</p>` : `<p>${snippet}</p>`))
                }
              />
            </div>
            <Textarea value={htmlContent} onChange={(e) => setHtmlContent(e.target.value)} placeholder="Paste HTML email content here..." rows={16} className="font-mono text-xs" />
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSend} disabled={sending || !subject.trim() || !htmlContent.trim()} className="flex-1 h-12 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90">
              {sending ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Sending...</>) : (<><Send className="w-4 h-4 mr-2" /> Send Broadcast</>)}
            </Button>
            <Button variant="outline" onClick={() => setShowPreview(!showPreview)} className="h-12">
              {showPreview ? "Hide Preview" : "Preview"}
            </Button>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
            <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-yellow-500">Important</p>
              <p className="text-yellow-500/80 text-xs mt-1">
                Emails are sent via Amazon SES. Make sure your SES account is in production mode
                and noreply@merilive.com is verified. Rate limit: 14 emails/second.
              </p>
            </div>
          </div>

          {result && (
            <div className="p-4 rounded-xl bg-card border border-border space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <span className="font-semibold">Broadcast Complete</span>
              </div>
              <div className="flex gap-3">
                <Badge variant="secondary">Total: {result.totalEmails}</Badge>
                <Badge className="bg-green-500/20 text-green-400">Sent: {result.sent}</Badge>
                {result.failed > 0 && <Badge variant="destructive">Failed: {result.failed}</Badge>}
              </div>
            </div>
          )}
        </div>

        {showPreview && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Email Preview</label>
            <div className="rounded-xl border border-border overflow-hidden bg-white">
              <div className="p-3 bg-muted/30 border-b border-border">
                <p className="text-xs text-muted-foreground">Subject: <span className="text-foreground font-medium">{subject || '(no subject)'}</span></p>
                <p className="text-xs text-muted-foreground">From: MeriLive &lt;noreply@merilive.com&gt;</p>
              </div>
              <iframe srcDoc={htmlContent || '<p style="padding:20px;color:#999;">No content yet</p>'} className="w-full h-[500px] border-0" sandbox="allow-same-origin" title="Email Preview" />
            </div>
          </div>
        )}
      </div>

      {/* Edit Template Dialog */}
      <Dialog open={editDialog} onOpenChange={setEditDialog}>
        <DialogContent className="max-w-lg w-screen sm:w-[96vw] md:w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-lg overflow-y-auto bg-white border-slate-200 text-slate-900">

          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Edit3 className="w-5 h-5 text-purple-400" />
              Edit Email Template
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Template Name</Label>
              <Input value={editForm.title} onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))} className="mt-1.5 bg-white border-slate-300 text-slate-900" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Description</Label>
              <Input value={editForm.description} onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))} className="mt-1.5 bg-white border-slate-300 text-slate-900" placeholder="Internal note" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">HTML Content</Label>
              <Textarea value={editForm.body} onChange={(e) => setEditForm(prev => ({ ...prev, body: e.target.value }))} className="mt-1.5 min-h-[200px] bg-white border-slate-300 text-slate-900 font-mono text-xs" />
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
        <DialogContent className="max-w-lg w-screen sm:w-[96vw] md:w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-lg overflow-y-auto bg-white border-slate-200 text-slate-900">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-slate-900">
              <Plus className="w-5 h-5 text-green-400" />
              Add Email Template
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="text-sm font-medium text-slate-700">Template Name *</Label>
              <Input value={addForm.title} onChange={(e) => setAddForm(prev => ({ ...prev, title: e.target.value }))} className="mt-1.5 bg-white border-slate-300 text-slate-900" placeholder="e.g. 📢 General Announcement" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">Description</Label>
              <Input value={addForm.description} onChange={(e) => setAddForm(prev => ({ ...prev, description: e.target.value }))} className="mt-1.5 bg-white border-slate-300 text-slate-900" placeholder="Internal note" />
            </div>
            <div>
              <Label className="text-sm font-medium text-slate-700">HTML Content *</Label>
              <Textarea value={addForm.body} onChange={(e) => setAddForm(prev => ({ ...prev, body: e.target.value }))} className="mt-1.5 min-h-[200px] bg-white border-slate-300 text-slate-900 font-mono text-xs" placeholder="Paste HTML email content..." />
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
};

export default AdminEmailBroadcast;
