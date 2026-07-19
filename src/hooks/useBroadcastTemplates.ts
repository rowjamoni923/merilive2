import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface BroadcastTemplate {
  id: string;
  template_key: string;
  title_template: string;
  message_template: string;
  description: string | null;
  category: string;
  updated_at: string;
}

export function useBroadcastTemplates(categoryPrefix: string) {
  const [templates, setTemplates] = useState<BroadcastTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchTemplates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("notification_templates")
        .select("*")
        .like("category", `${categoryPrefix}%`)
        .order("template_key");

      if (error) throw error;
      setTemplates((data as unknown as BroadcastTemplate[]) || []);
    } catch (err: any) {
      console.error("[BroadcastTemplates] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [categoryPrefix]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const updateTemplate = async (id: string, updates: { title_template: string; message_template: string; description?: string }) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("notification_templates")
        .update({
          ...updates,
          title: updates.title_template,
          body: updates.message_template,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      if (error) throw error;
      toast.success("✅ Template updated!");
      await fetchTemplates();
    } catch (err: any) {
      toast.error(err.message || "Failed to update template");
    } finally {
      setSaving(false);
    }
  };

  const addTemplate = async (template: { template_key: string; title_template: string; message_template: string; description?: string; category: string }) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("notification_templates")
        .insert({
          ...template,
        });

      if (error) throw error;
      toast.success("✅ Template added!");
      await fetchTemplates();
    } catch (err: any) {
      toast.error(err.message || "Failed to add template");
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      const { error } = await supabase
        .from("notification_templates")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Template deleted");
      await fetchTemplates();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete template");
    }
  };

  // Group by category
  const grouped = templates.reduce<Record<string, BroadcastTemplate[]>>((acc, t) => {
    const cat = t.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  return { templates, grouped, loading, saving, updateTemplate, addTemplate, deleteTemplate, refetch: fetchTemplates };
}
