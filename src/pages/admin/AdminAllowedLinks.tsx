import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Globe, Shield, Link2, CreditCard, Store, ExternalLink } from "lucide-react";

interface AllowedLink {
  id: string;
  url_pattern: string;
  link_type: string;
  label: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  created_at: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  internal: { label: "Internal", icon: Globe, color: "text-blue-400" },
  payment: { label: "Payment", icon: CreditCard, color: "text-green-400" },
  store: { label: "App Store", icon: Store, color: "text-purple-400" },
  social: { label: "Social", icon: ExternalLink, color: "text-pink-400" },
  general: { label: "General", icon: Link2, color: "text-gray-400" },
};

const AdminAllowedLinks = () => {
  const [links, setLinks] = useState<AllowedLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newLink, setNewLink] = useState({
    url_pattern: "",
    link_type: "domain",
    label: "",
    description: "",
    category: "general",
  });

  useAdminRealtime(['allowed_external_links'], () => fetchLinks());

  const fetchLinks = async () => {
    const { data, error } = await supabase
      .from('allowed_external_links')
      .select('*')
      .order('category', { ascending: true })
      .order('created_at', { ascending: true });

    if (!error && data) {
      setLinks(data as AllowedLink[]);
    }
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!newLink.url_pattern || !newLink.label) {
      toast.error("URL Pattern and Label are required");
      return;
    }

    const { error } = await supabase.from('allowed_external_links').insert({
    });

    if (error) {
      toast.error("Failed to add link: " + error.message);
    } else {
      toast.success("Link added successfully");
      setShowAddDialog(false);
      setNewLink({ url_pattern: "", link_type: "domain", label: "", description: "", category: "general" });
    }
  };

  const handleToggle = async (id: string, currentState: boolean) => {
    const { error } = await supabase
      .from('allowed_external_links')
      .update({ is_active: !currentState })
      .eq('id', id);

    if (error) {
      toast.error("Failed to update");
    } else {
      toast.success(!currentState ? "Link activated" : "Link deactivated");
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
    
    const { error } = await supabase
      .from('allowed_external_links')
      .delete()
      .eq('id', id);

    if (error) {
      toast.error("Failed to delete");
    } else {
      toast.success("Link removed");
    }
  };

  const activeCount = links.filter(l => l.is_active).length;
  const grouped = links.reduce((acc, link) => {
    const cat = link.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(link);
    return acc;
  }, {} as Record<string, AllowedLink[]>);

  return (
    <div className="admin-pro-shell admin-content space-y-6 p-4 md:p-6 -mx-4 -my-4 sm:-mx-6 sm:-my-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            Allowed External Links
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Only these links will work inside the native app. All others will be blocked.
          </p>
        </div>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4 mr-1" /> Add Link
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-background border-border">
            <DialogHeader>
              <DialogTitle>Add Allowed Link</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-2">
              <div>
                <Label>Label *</Label>
                <Input
                  placeholder="e.g. bKash Payment"
                  value={newLink.label}
                  onChange={e => setNewLink(p => ({ ...p, label: e.target.value }))}
                />
              </div>
              <div>
                <Label>URL Pattern *</Label>
                <Input
                  placeholder="e.g. bkash.com or https://example.com/page"
                  value={newLink.url_pattern}
                  onChange={e => setNewLink(p => ({ ...p, url_pattern: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <Select value={newLink.link_type} onValueChange={v => setNewLink(p => ({ ...p, link_type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="domain">Domain (*.example.com)</SelectItem>
                      <SelectItem value="exact_url">Exact URL</SelectItem>
                      <SelectItem value="prefix">URL Prefix</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={newLink.category} onValueChange={v => setNewLink(p => ({ ...p, category: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="internal">Internal</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="store">App Store</SelectItem>
                      <SelectItem value="social">Social</SelectItem>
                      <SelectItem value="general">General</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  placeholder="Optional description"
                  value={newLink.description}
                  onChange={e => setNewLink(p => ({ ...p, description: e.target.value }))}
                />
              </div>
              <Button onClick={handleAdd} className="w-full bg-emerald-600 hover:bg-emerald-700">
                Add Link
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-emerald-500/10 border-emerald-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{activeCount}</p>
            <p className="text-xs text-muted-foreground">Active Links</p>
          </CardContent>
        </Card>
        <Card className="bg-red-500/10 border-red-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-400">{links.length - activeCount}</p>
            <p className="text-xs text-muted-foreground">Disabled Links</p>
          </CardContent>
        </Card>
      </div>

      {/* Links by category */}
      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : (
        Object.entries(grouped).map(([category, categoryLinks]) => {
          const config = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.general;
          const Icon = config.icon;
          
          return (
            <Card key={category} className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${config.color}`} />
                  {config.label}
                  <Badge variant="secondary" className="text-xs">{categoryLinks.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {categoryLinks.map(link => (
                  <div
                    key={link.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      link.is_active ? 'bg-card border-border/50' : 'bg-muted/30 border-border/20 opacity-60'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-foreground">{link.label}</span>
                        <Badge variant="outline" className="text-[10px]">{link.link_type}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                        {link.url_pattern}
                      </p>
                      {link.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{link.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3">
                      <Switch
                        checked={link.is_active}
                        onCheckedChange={() => handleToggle(link.id, link.is_active)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                        onClick={() => handleDelete(link.id, link.label)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
};

export default AdminAllowedLinks;
