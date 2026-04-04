import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Bell, 
  Save,
  Loader2,
  Edit3,
  Eye,
  MessageSquare,
  AlertCircle,
  Info
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface NotificationTemplate {
  id: string;
  template_key: string;
  title_template: string;
  message_template: string;
  description: string | null;
  updated_at: string;
}

const AdminNotificationTemplates = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Edit dialog
  const [editDialog, setEditDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null);
  const [editForm, setEditForm] = useState({
    title_template: "",
    message_template: "",
    description: ""
  });

  // Preview dialog
  const [previewDialog, setPreviewDialog] = useState(false);
  const [previewContent, setPreviewContent] = useState({ title: "", message: "" });

  useAdminRealtime(['notification_templates'], () => fetchTemplates());

  const fetchTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("notification_templates")
        .select("*")
        .order("template_key");

      if (error) throw error;
      setTemplates(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (template: NotificationTemplate) => {
    setSelectedTemplate(template);
    setEditForm({
      title_template: template.title_template,
      message_template: template.message_template,
      description: template.description || ""
    });
    setEditDialog(true);
  };

  const handleSaveTemplate = async () => {
    if (!selectedTemplate) return;

    setSaving(true);
    try {
      console.log('[AdminNotificationTemplates] Saving template:', selectedTemplate.id, editForm);
      
      const { data, error } = await supabase
        .from("notification_templates")
        .update({
          title_template: editForm.title_template,
          message_template: editForm.message_template,
          description: editForm.description || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", selectedTemplate.id)
        .select();

      if (error) {
        console.error('[AdminNotificationTemplates] Update error:', error);
        throw error;
      }

      console.log('[AdminNotificationTemplates] Template updated successfully:', data);

      toast({
        title: "Success!",
        description: "Template updated successfully",
      });

      setEditDialog(false);
      await fetchTemplates();
    } catch (error: any) {
      console.error('[AdminNotificationTemplates] Error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save template",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const previewTemplate = (template: NotificationTemplate) => {
    // Replace placeholders with example values
    let title = template.title_template;
    let message = template.message_template;

    const exampleValues: Record<string, string> = {
      "{{code}}": "123456",
      "{{agency_name}}": "Demo Agency",
      "{{agency_code}}": "AGDEMO01",
      "{{display_name}}": "John Doe",
      "{{user_name}}": "john_doe"
    };

    for (const [placeholder, value] of Object.entries(exampleValues)) {
      title = title.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
      message = message.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    }

    setPreviewContent({ title, message });
    setPreviewDialog(true);
  };

  const getTemplateIcon = (key: string) => {
    switch (key) {
      case 'agency_verification_code':
        return '🔐';
      case 'agency_created':
        return '🎉';
      case 'welcome_message':
        return '👋';
      default:
        return '📢';
    }
  };

  const getTemplateLabel = (key: string) => {
    switch (key) {
      case 'agency_verification_code':
        return 'Agency Verification';
      case 'agency_created':
        return 'Agency Created';
      case 'welcome_message':
        return 'Welcome Message';
      default:
        return key;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a14] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a14]">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
        <div className="flex items-center h-14 px-4">
          <button 
            onClick={() => navigate('/admin')}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold pr-7">
            Notification Templates
          </h1>
        </div>
      </div>

      {/* Info Banner */}
      <div className="mx-4 mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
        <div className="flex gap-3">
          <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-blue-300 font-medium">Variable Usage</p>
            <p className="text-xs text-blue-400/80 mt-1">
              Use {"{{variable_name}}"} format to add dynamic values to templates.
              <br />
              Example: {"{{code}}"}, {"{{agency_name}}"}, {"{{display_name}}"}
            </p>
          </div>
        </div>
      </div>

      {/* Templates List */}
      <div className="p-4 space-y-4">
        {templates.map((template) => (
          <Card key={template.id} className="overflow-hidden bg-white/5 border-white/10">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getTemplateIcon(template.template_key)}</span>
                  <div>
                    <CardTitle className="text-base text-white">
                      {getTemplateLabel(template.template_key)}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5 text-white/50">
                      {template.description || template.template_key}
                    </CardDescription>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs text-white/60 border-white/20">
                  {template.template_key}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="bg-white/5 rounded-lg p-3 mb-4 border border-white/10">
                <p className="font-medium text-sm mb-1 text-white/90">{template.title_template}</p>
                <p className="text-xs text-white/50 line-clamp-2">{template.message_template}</p>
              </div>
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => previewTemplate(template)}
                  className="flex-1 border-white/20 text-white/80 hover:bg-white/10 hover:text-white"
                >
                  <Eye className="w-4 h-4 mr-1" />
                  Preview
                </Button>
                <Button
                  size="sm"
                  onClick={() => openEditDialog(template)}
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
                >
                  <Edit3 className="w-4 h-4 mr-1" />
                  Edit
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
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
              <Label className="text-sm font-medium text-white/80">Template Key</Label>
              <Input
                value={selectedTemplate?.template_key || ""}
                disabled
                className="mt-1.5 bg-white/5 border-white/10 text-white/60"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-white/80">Description</Label>
              <Input
                value={editForm.description}
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Description of this template"
                className="mt-1.5 bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-white/80">Title Template *</Label>
              <Input
                value={editForm.title_template}
                onChange={(e) => setEditForm(prev => ({ ...prev, title_template: e.target.value }))}
                placeholder="Notification title"
                className="mt-1.5 bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
            </div>

            <div>
              <Label className="text-sm font-medium text-white/80">Message Template *</Label>
              <Textarea
                value={editForm.message_template}
                onChange={(e) => setEditForm(prev => ({ ...prev, message_template: e.target.value }))}
                placeholder="Notification message"
                className="mt-1.5 min-h-[150px] bg-white/5 border-white/10 text-white placeholder:text-white/30"
              />
              <p className="text-xs text-white/40 mt-1">
                Variables: {"{{code}}"}, {"{{agency_name}}"}, {"{{agency_code}}"}, {"{{display_name}}"}
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setEditDialog(false)}
                className="flex-1 border-white/20 text-white/80 hover:bg-white/10"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveTemplate}
                disabled={saving || !editForm.title_template || !editForm.message_template}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewDialog} onOpenChange={setPreviewDialog}>
        <DialogContent className="max-w-sm bg-[#1a1a2e] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <MessageSquare className="w-5 h-5 text-purple-400" />
              Preview
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4">
            <div className="bg-purple-500/10 rounded-xl p-4 border border-purple-500/20">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-full flex items-center justify-center text-white">
                  <Bell className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm text-white">{previewContent.title}</p>
                  <p className="text-xs text-white/60 mt-1 whitespace-pre-wrap">
                    {previewContent.message}
                  </p>
                  <p className="text-xs text-white/30 mt-2">Just now</p>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminNotificationTemplates;
