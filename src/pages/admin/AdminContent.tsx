import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Save, Plus, Edit, Trash2, FileText, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";

interface ContentPage {
  id: string;
  page_key: string;
  title: string;
  content: string;
  is_active: boolean;
  updated_at: string;
}

export default function AdminContent() {
  const [pages, setPages] = useState<ContentPage[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingPage, setEditingPage] = useState<ContentPage | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [saving, setSaving] = useState(false);

  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [showPreview, setShowPreview] = useState(false);

  useAdminRealtime(['app_content'], () => fetchPages());

  const fetchPages = async () => {
    try {
      const { data, error } = await supabase
        .from("app_content")
        .select("*")
        .order("page_key");

      if (error) throw error;
      setPages(data || []);
    } catch (error) {
      console.error("Error fetching pages:", error);
      toast.error("Failed to load pages");
    } finally {
      setLoading(false);
    }
  };

  const openEditor = (page: ContentPage | null) => {
    if (page) {
      setEditingPage(page);
      setEditTitle(page.title);
      setEditContent(page.content);
      setEditActive(page.is_active);
    } else {
      setEditingPage(null);
      setEditTitle("");
      setEditContent("");
      setEditActive(true);
    }
    setShowEditor(true);
    setShowPreview(false);
  };

  const handleSave = async () => {
    if (!editTitle.trim() || !editContent.trim()) {
      toast.error("Please enter title and content");
      return;
    }

    setSaving(true);
    try {
      if (editingPage) {
        const { error } = await supabase
          .from("app_content")
          .update({
            title: editTitle,
            content: editContent,
            is_active: editActive,
          })
          .eq("id", editingPage.id);

        if (error) throw error;
        toast.success("Page updated successfully");
      } else {
        const pageKey = editTitle.toLowerCase().replace(/\s+/g, "_");
        const { error } = await supabase
          .from("app_content")
          .insert({
            page_key: pageKey,
            title: editTitle,
            content: editContent,
            is_active: editActive,
          });

        if (error) throw error;
        toast.success("New page created successfully");
      }

      setShowEditor(false);
      fetchPages();
    } catch (error: any) {
      toast.error(error.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pageId: string) => {
    if (!confirm("Are you sure you want to delete this page?")) return;

    try {
      const { error } = await supabase
        .from("app_content")
        .delete()
        .eq("id", pageId);

      if (error) throw error;
      toast.success("Page deleted successfully");
      fetchPages();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete");
    }
  };

  const toggleActive = async (page: ContentPage) => {
    try {
      const { error } = await supabase
        .from("app_content")
        .update({ is_active: !page.is_active })
        .eq("id", page.id);

      if (error) throw error;
      fetchPages();
      toast.success(page.is_active ? "Page deactivated" : "Page activated");
    } catch (error: any) {
      toast.error(error.message || "Failed to update");
    }
  };

  const renderPreview = (text: string) => {
    return text
      .split("\n")
      .map((line, i) => {
        if (line.startsWith("## ")) {
          return <h2 key={i} className="text-xl font-bold mt-4 mb-2 text-slate-800">{line.slice(3)}</h2>;
        }
        if (line.startsWith("### ")) {
          return <h3 key={i} className="text-lg font-semibold mt-3 mb-1 text-slate-700">{line.slice(4)}</h3>;
        }
        const escaped = line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const boldedLine = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        if (line.startsWith("- ")) {
          return <li key={i} className="ml-4 text-slate-600" dangerouslySetInnerHTML={{ __html: boldedLine.slice(2) }} />;
        }
        if (line.trim() === "") return <br key={i} />;
        return <p key={i} className="mb-1 text-slate-600" dangerouslySetInnerHTML={{ __html: boldedLine }} />;
      });
  };

  const pageKeyNames: Record<string, string> = {
    privacy_policy: "Privacy Policy",
    user_agreement: "User Agreement",
    about_us: "About Us",
    customer_service: "Customer Service",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-2 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-6 bg-gradient-to-r from-slate-50 via-purple-50 to-blue-50 rounded-xl sm:rounded-2xl shadow-lg border border-slate-200">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-slate-800 via-purple-700 to-slate-800 bg-clip-text text-transparent">Content Management</h1>
          <p className="text-slate-600 text-sm mt-1">Edit all app pages</p>
        </div>
        <Button onClick={() => openEditor(null)} className="gap-2 bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 w-full sm:w-auto">
          <Plus className="w-4 h-4" />
          New Page
        </Button>
      </div>

      <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
        {pages.map((page) => (
          <Card key={page.id} className="bg-white border-slate-200 shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="pb-2 p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-slate-800 flex items-center gap-2 text-base sm:text-lg">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center">
                    <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <span className="truncate">{page.title}</span>
                </CardTitle>
                <Badge variant={page.is_active ? "default" : "secondary"} className={page.is_active ? "bg-green-100 text-green-700 border-green-200" : "bg-slate-100 text-slate-600"}>
                  {page.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                {pageKeyNames[page.page_key] || page.page_key}
              </p>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-0 sm:pt-0">
              <p className="text-slate-600 text-xs sm:text-sm line-clamp-2 mb-4">
                {page.content.slice(0, 150)}...
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditor(page)}
                  className="flex-1 border-slate-200 text-slate-700 hover:bg-slate-100"
                >
                  <Edit className="w-4 h-4 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleActive(page)}
                  className="border-slate-200 text-slate-700 hover:bg-slate-100"
                >
                  {page.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(page.id)}
                  className="border-red-200 text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {pages.length === 0 && (
        <Card className="bg-white border-slate-200 shadow-lg">
          <CardContent className="p-8 sm:p-12 text-center">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">No pages found</p>
            <Button onClick={() => openEditor(null)} className="mt-4 bg-gradient-to-r from-pink-500 to-purple-600">
              Create First Page
            </Button>
          </CardContent>
        </Card>
      )}

      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-800">
              {editingPage ? "Edit Page" : "Create New Page"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-700">Title</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder="Page title"
                className="bg-white border-slate-200 text-slate-800"
              />
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  checked={editActive}
                  onCheckedChange={setEditActive}
                />
                <Label className="text-slate-700">Active</Label>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPreview(!showPreview)}
                className="border-slate-200 text-slate-700"
              >
                {showPreview ? <Edit className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                {showPreview ? "Edit" : "Preview"}
              </Button>
            </div>

            <div className="space-y-2">
              <Label className="text-slate-700">Content (Markdown)</Label>
              {showPreview ? (
                <div className="min-h-[200px] sm:min-h-[300px] p-4 border rounded-md bg-slate-50 prose prose-sm max-w-none">
                  {renderPreview(editContent)}
                </div>
              ) : (
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="## Heading&#10;&#10;Paragraph text&#10;&#10;- List item&#10;- **Bold text**"
                  className="min-h-[200px] sm:min-h-[300px] font-mono bg-white border-slate-200 text-slate-800"
                />
              )}
              <p className="text-xs text-slate-500">
                Use Markdown: ## Heading, ### Sub-heading, **Bold**, - List
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setShowEditor(false)} className="w-full sm:w-auto border-slate-200 text-slate-700">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto bg-gradient-to-r from-pink-500 to-purple-600">
              {saving ? "Saving..." : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
