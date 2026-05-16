import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Video, Trash2, Eye, EyeOff, Star, StarOff, Search, Filter, Play, User, Calendar, Heart, MessageCircle, Share2, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { getCurrentAdminId } from "@/utils/adminSession";
import { toast } from "sonner";
import { format } from "date-fns";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
interface Reel {
  id: string;
  user_id: string;
  video_url: string;
  thumbnail_url: string | null;
  caption: string | null;
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  is_featured: boolean;
  is_approved: boolean;
  is_active: boolean;
  created_at: string;
  category?: {
    name: string;
    icon: string | null;
  } | null;
  user?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  display_order: number;
  is_active: boolean;
}

interface Report {
  id: string;
  reason: string;
  description: string | null;
  status: string;
  created_at: string;
  reel?: Reel;
  user?: {
    display_name: string | null;
  } | null;
}

const AdminReels = () => {
  const [reels, setReels] = useState<Reel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedReel, setSelectedReel] = useState<Reel | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [activeTab, setActiveTab] = useState("reels");
  
  // Category form
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("");
  const [newCategoryOrder, setNewCategoryOrder] = useState(0);

  useAdminRealtime(['reels', 'reel_categories'], () => fetchData());

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchReels(), fetchCategories(), fetchReports()]);
    setLoading(false);
  };

  const fetchReels = async () => {
    const adminId = getCurrentAdminId();
    if (!adminId) { setReels([]); return; }
    const { data, error } = await supabase.rpc("admin_list_reels", { _admin_id: adminId, _limit: 200 });
    if (error || !data) return;
    const rows: any[] = data;
    const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)));
    const catIds = Array.from(new Set(rows.map((r) => r.category_id).filter(Boolean)));
    const [usersRes, catsRes] = await Promise.all([
      userIds.length ? supabase.from("profiles").select("id, display_name, avatar_url").in("id", userIds) : Promise.resolve({ data: [] as any[] }),
      catIds.length ? supabase.from("reel_categories").select("id, name, icon").in("id", catIds) : Promise.resolve({ data: [] as any[] }),
    ]);
    const userMap = Object.fromEntries(((usersRes as any).data || []).map((u: any) => [u.id, u]));
    const catMap = Object.fromEntries(((catsRes as any).data || []).map((c: any) => [c.id, c]));
    setReels(rows.map((r) => ({ ...r, user: userMap[r.user_id] || null, category: catMap[r.category_id] || null })) as any);
  };

  const fetchCategories = async () => {
    const { data, error } = await supabase
      .from('reel_categories')
      .select('*')
      .order('display_order');
    
    if (!error && data) setCategories(data);
  };

  const fetchReports = async () => {
    const { data, error } = await supabase
      .from('reel_reports')
      .select(`
        *,
        reel:reels(*),
        user:profiles!reel_reports_user_id_fkey(display_name)
      `)
      .order('created_at', { ascending: false });
    
    if (!error && data) setReports(data as any);
  };

  const toggleApproval = async (reel: Reel) => {
    const { error } = await supabase
      .from('reels')
      .update({ is_approved: !reel.is_approved })
      .eq('id', reel.id);
    
    if (error) {
      toast.error("Failed to update");
    } else {
      setReels(prev => prev.map(r => 
        r.id === reel.id ? { ...r, is_approved: !r.is_approved } : r
      ));
      toast.success(reel.is_approved ? "Reel hidden" : "Reel approved");
    }
  };

  const toggleFeatured = async (reel: Reel) => {
    const { error } = await supabase
      .from('reels')
      .update({ is_featured: !reel.is_featured })
      .eq('id', reel.id);
    
    if (error) {
      toast.error("Failed to update");
    } else {
      setReels(prev => prev.map(r => 
        r.id === reel.id ? { ...r, is_featured: !r.is_featured } : r
      ));
      toast.success(reel.is_featured ? "Removed from featured" : "Added to featured");
    }
  };

  const deleteReel = async (reelId: string) => {
    if (!confirm("Are you sure you want to delete this reel?")) return;
    
    const reel = reels.find(r => r.id === reelId);
    
    const { error } = await supabase
      .from('reels')
      .delete()
      .eq('id', reelId);
    
    if (error) {
      console.error("Delete reel error:", error);
      recordAdminError({ kind: "rpc", label: "AdminReels.reel", message: formatAdminError(error) });
      toast.error("Failed to delete reel");
    } else {
      // Clean up storage files
      if (reel?.video_url) {
        try {
          const url = new URL(reel.video_url);
          const pathParts = url.pathname.split('/');
          const bucketIdx = pathParts.findIndex(p => p === 'reels');
          if (bucketIdx !== -1) {
            const filePath = pathParts.slice(bucketIdx + 1).join('/');
            await supabase.storage.from('reels').remove([filePath]);
          }
        } catch (e) {
          console.log('Could not delete video file:', e);
        }
      }
      if (reel?.thumbnail_url) {
        try {
          const url = new URL(reel.thumbnail_url);
          const pathParts = url.pathname.split('/');
          const bucketIdx = pathParts.findIndex(p => p === 'reels');
          if (bucketIdx !== -1) {
            const filePath = pathParts.slice(bucketIdx + 1).join('/');
            await supabase.storage.from('reels').remove([filePath]);
          }
        } catch (e) {
          console.log('Could not delete thumbnail:', e);
        }
      }
      setReels(prev => prev.filter(r => r.id !== reelId));
      toast.success("Reel deleted successfully");
    }
  };

  const saveCategory = async () => {
    if (!newCategoryName.trim()) {
      toast.error("Category name is required");
      return;
    }

    const slug = newCategoryName.toLowerCase().replace(/\s+/g, '-');

    if (editingCategory) {
      const { error } = await supabase
        .from('reel_categories')
        .update({
          name: newCategoryName,
          icon: newCategoryIcon || null,
          display_order: newCategoryOrder
        })
        .eq('id', editingCategory.id);
      
      if (error) {
        toast.error("Failed to update");
      } else {
        toast.success("Category updated");
        fetchCategories();
      }
    } else {
      const { error } = await supabase
        .from('reel_categories')
        .insert({
          name: newCategoryName,
          slug,
          icon: newCategoryIcon || null,
          display_order: newCategoryOrder
        });
      
      if (error) {
        toast.error("Failed to create");
      } else {
        toast.success("Category created");
        fetchCategories();
      }
    }

    setEditingCategory(null);
    setNewCategoryName("");
    setNewCategoryIcon("");
    setNewCategoryOrder(0);
  };

  const toggleCategoryStatus = async (category: Category) => {
    const { error } = await supabase
      .from('reel_categories')
      .update({ is_active: !category.is_active })
      .eq('id', category.id);
    
    if (!error) {
      setCategories(prev => prev.map(c => 
        c.id === category.id ? { ...c, is_active: !c.is_active } : c
      ));
      toast.success(category.is_active ? "Category disabled" : "Category enabled");
    }
  };

  const resolveReport = async (reportId: string, status: string) => {
    const { error } = await supabase
      .from('reel_reports')
      .update({ 
        status,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', reportId);
    
    if (!error) {
      setReports(prev => prev.map(r => 
        r.id === reportId ? { ...r, status } : r
      ));
      toast.success("Report updated");
    }
  };

  const filteredReels = reels.filter(reel => {
    if (searchQuery && !reel.caption?.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !reel.user?.display_name?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (filterStatus === "approved" && !reel.is_approved) return false;
    if (filterStatus === "pending" && reel.is_approved) return false;
    if (filterStatus === "featured" && !reel.is_featured) return false;
    return true;
  });

  const stats = {
    total: reels.length,
    approved: reels.filter(r => r.is_approved).length,
    pending: reels.filter(r => !r.is_approved).length,
    featured: reels.filter(r => r.is_featured).length,
    totalViews: reels.reduce((sum, r) => sum + r.view_count, 0),
    totalLikes: reels.reduce((sum, r) => sum + r.like_count, 0),
    pendingReports: reports.filter(r => r.status === 'pending').length
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Video className="w-6 h-6 text-pink-500" />
            Reels Management
          </h1>
          <p className="text-muted-foreground">Manage user uploaded reels and categories</p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total Reels</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-green-500">{stats.approved}</p>
            <p className="text-xs text-muted-foreground">Approved</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-yellow-500">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-purple-500">{stats.featured}</p>
            <p className="text-xs text-muted-foreground">Featured</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{stats.totalViews.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Views</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-red-500">{stats.totalLikes.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">Total Likes</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-orange-500">{stats.pendingReports}</p>
            <p className="text-xs text-muted-foreground">Reports</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="reels">Reels</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="reports">Reports ({stats.pendingReports})</TabsTrigger>
        </TabsList>

        {/* Reels Tab */}
        <TabsContent value="reels" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search by caption or user..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="featured">Featured</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reels Grid */}
          {loading ? (
            <div className="text-center py-8">Loading...</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {filteredReels.map(reel => (
                <Card key={reel.id} className="overflow-hidden">
                  <div className="relative aspect-[9/16] bg-muted">
                    {reel.thumbnail_url ? (
                      <img 
                        src={reel.thumbnail_url} 
                        alt="" 
                        className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Video className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    
                    {/* Overlay Badges */}
                    <div className="absolute top-2 left-2 flex flex-col gap-1">
                      {reel.is_featured && (
                        <Badge className="bg-purple-500">Featured</Badge>
                      )}
                      {!reel.is_approved && (
                        <Badge variant="destructive">Pending</Badge>
                      )}
                    </div>

                    {/* Play Button */}
                    <button
                      onClick={() => {
                        setSelectedReel(reel);
                        setShowPreview(true);
                      }}
                      className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity"
                    >
                      <Play className="w-12 h-12 text-white" fill="white" />
                    </button>

                    {/* Stats */}
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-white text-xs">
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {reel.view_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3" />
                        {reel.like_count}
                      </span>
                    </div>
                  </div>

                  <CardContent className="p-3 space-y-2">
                    {/* User */}
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={reel.user?.avatar_url || ''} />
                        <AvatarFallback>{reel.user?.display_name?.[0] || 'U'}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm truncate flex-1">{reel.user?.display_name || 'User'}</span>
                    </div>

                    {/* Caption */}
                    {reel.caption && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{reel.caption}</p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-1">
                      <Button 
                        size="sm" 
                        variant={reel.is_approved ? "outline" : "default"}
                        onClick={() => toggleApproval(reel)}
                        className="flex-1"
                      >
                        {reel.is_approved ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </Button>
                      <Button 
                        size="sm" 
                        variant={reel.is_featured ? "default" : "outline"}
                        onClick={() => toggleFeatured(reel)}
                        className="flex-1"
                      >
                        {reel.is_featured ? <StarOff className="w-3 h-3" /> : <Star className="w-3 h-3" />}
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive"
                        onClick={() => deleteReel(reel.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-4">
          {/* Add/Edit Category Form */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                {editingCategory ? 'Edit Category' : 'Add Category'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <Input
                  placeholder="Category name"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1 min-w-[200px]"
                />
                <Input
                  placeholder="Icon (emoji)"
                  value={newCategoryIcon}
                  onChange={(e) => setNewCategoryIcon(e.target.value)}
                  className="w-[100px]"
                />
                <Input
                  type="number"
                  placeholder="Order"
                  value={newCategoryOrder}
                  onChange={(e) => setNewCategoryOrder(parseInt(e.target.value) || 0)}
                  className="w-[80px]"
                />
                <Button onClick={saveCategory}>
                  {editingCategory ? 'Update' : 'Add'}
                </Button>
                {editingCategory && (
                  <Button variant="outline" onClick={() => {
                    setEditingCategory(null);
                    setNewCategoryName("");
                    setNewCategoryIcon("");
                    setNewCategoryOrder(0);
                  }}>
                    Cancel
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Categories List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map(category => (
              <Card key={category.id} className={!category.is_active ? 'opacity-50' : ''}>
                <CardContent className="pt-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{category.icon || '📁'}</span>
                    <div>
                      <p className="font-medium">{category.name}</p>
                      <p className="text-xs text-muted-foreground">Order: {category.display_order}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingCategory(category);
                        setNewCategoryName(category.name);
                        setNewCategoryIcon(category.icon || '');
                        setNewCategoryOrder(category.display_order);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant={category.is_active ? "destructive" : "default"}
                      onClick={() => toggleCategoryStatus(category)}
                    >
                      {category.is_active ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Reports Tab */}
        <TabsContent value="reports" className="space-y-4">
          {reports.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No reports yet
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {reports.map(report => (
                <Card key={report.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant={
                            report.status === 'pending' ? 'destructive' : 
                            report.status === 'resolved' ? 'default' : 'outline'
                          }>
                            {report.status}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {format(new Date(report.created_at), 'PPp')}
                          </span>
                        </div>
                        <p className="font-medium">{report.reason}</p>
                        {report.description && (
                          <p className="text-sm text-muted-foreground mt-1">{report.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          Reported by: {report.user?.display_name || 'Unknown'}
                        </p>
                      </div>
                      {report.status === 'pending' && (
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => resolveReport(report.id, 'resolved')}
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Resolve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resolveReport(report.id, 'dismissed')}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Dismiss
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Video Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="sm:max-w-lg p-0 bg-black">
          <DialogHeader className="p-4">
            <DialogTitle className="text-white">Preview</DialogTitle>
          </DialogHeader>
          {selectedReel && (
            <video
              src={selectedReel.video_url}
              className="w-full max-h-[70vh] object-contain"
              controls
              autoPlay
              loop
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminReels;
