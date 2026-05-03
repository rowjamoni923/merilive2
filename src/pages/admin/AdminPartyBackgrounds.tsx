import { useState, useEffect, useRef, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { 
  Image, 
  Plus, 
  Search, 
  Trash2, 
  Edit2, 
  Eye, 
  EyeOff,
  Crown,
  Palette,
  Sparkles,
  Upload,
  X,
  Check,
  Filter,
  Grid,
  List,
  DollarSign,
  Tag,
  Mountain,
  Sunset,
  Building2,
  Stars,
  TreePine,
  Waves,
  Loader2,
  ImagePlus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { getAdminSession } from "@/utils/adminSession";
import { cn } from "@/lib/utils";
import { recordAdminError } from "@/utils/adminErrorLog";

interface PartyBackground {
  id: string;
  name: string;
  image_url: string | null;  // DB column name
  gradient_css: string | null; // DB column name  
  category: string;
  is_premium: boolean;
  is_active: boolean;
  price_diamonds: number; // DB uses diamonds not coins
  display_order: number;
  created_at: string;
}

const categories = [
  { id: "nature", name: "Nature", icon: TreePine, color: "from-green-500 to-emerald-500" },
  { id: "space", name: "Space", icon: Stars, color: "from-purple-500 to-indigo-500" },
  { id: "city", name: "City", icon: Building2, color: "from-gray-500 to-slate-500" },
  { id: "abstract", name: "Abstract", icon: Palette, color: "from-pink-500 to-rose-500" },
  { id: "ocean", name: "Ocean", icon: Waves, color: "from-blue-500 to-cyan-500" },
  { id: "sunset", name: "Sunset", icon: Sunset, color: "from-orange-500 to-red-500" },
  { id: "premium", name: "Premium", icon: Crown, color: "from-yellow-500 to-amber-500" },
];

// Default backgrounds - ONLY IMAGE-BASED (no gradients)
const defaultBackgrounds: Omit<PartyBackground, "id" | "created_at">[] = [
  { name: "Nature", image_url: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=800", gradient_css: null, category: "nature", is_premium: false, is_active: true, price_diamonds: 0, display_order: 1 },
  { name: "Galaxy", image_url: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=800", gradient_css: null, category: "space", is_premium: false, is_active: true, price_diamonds: 0, display_order: 2 },
  { name: "Neon", image_url: "https://images.unsplash.com/photo-1557683316-973673baf926?w=800", gradient_css: null, category: "abstract", is_premium: true, is_active: true, price_diamonds: 500, display_order: 3 },
  { name: "Sunset", image_url: "https://images.unsplash.com/photo-1495616811223-4d98c6e9c869?w=800", gradient_css: null, category: "sunset", is_premium: false, is_active: true, price_diamonds: 0, display_order: 4 },
  { name: "Ocean", image_url: "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=800", gradient_css: null, category: "ocean", is_premium: false, is_active: true, price_diamonds: 0, display_order: 5 },
  { name: "Forest", image_url: "https://images.unsplash.com/photo-1448375240586-882707db888b?w=800", gradient_css: null, category: "nature", is_premium: false, is_active: true, price_diamonds: 0, display_order: 6 },
  { name: "Night City", image_url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800", gradient_css: null, category: "city", is_premium: true, is_active: true, price_diamonds: 800, display_order: 7 },
  { name: "Abstract", image_url: "https://images.unsplash.com/photo-1550684376-efcbd6e3f031?w=800", gradient_css: null, category: "abstract", is_premium: false, is_active: true, price_diamonds: 0, display_order: 8 },
  { name: "Aurora", image_url: "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=800", gradient_css: null, category: "nature", is_premium: true, is_active: true, price_diamonds: 1000, display_order: 9 },
  { name: "Desert", image_url: "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=800", gradient_css: null, category: "nature", is_premium: false, is_active: true, price_diamonds: 0, display_order: 10 },
  { name: "Mountains", image_url: "https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=800", gradient_css: null, category: "nature", is_premium: false, is_active: true, price_diamonds: 0, display_order: 11 },
  { name: "Sakura", image_url: "https://images.unsplash.com/photo-1522383225653-ed111181a951?w=800", gradient_css: null, category: "nature", is_premium: true, is_active: true, price_diamonds: 1200, display_order: 12 },
];

const AdminPartyBackgrounds = () => {
  const [backgrounds, setBackgrounds] = useState<PartyBackground[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPremium, setFilterPremium] = useState<"all" | "free" | "premium">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [selectedBackground, setSelectedBackground] = useState<PartyBackground | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: "",
    image_url: "",
    gradient_css: "",
    category: "nature",
    is_premium: false,
    is_active: true,
    price_diamonds: 0,
    display_order: 1
  });

  const fetchBackgrounds = useCallback(async () => {
    setIsLoading(true);
    const session = getAdminSession();

    try {
      let rows: any[] = [];
      if (session?.admin_id) {
        const { data, error } = await adminSupabase.rpc('admin_list_party_backgrounds' as any, {
          _admin_id: session.admin_id,
        });
        if (error) throw error;
        rows = (data as any[]) || [];
      } else {
        const { data, error } = await supabase
          .from('party_room_backgrounds')
          .select('*')
          .order('display_order', { ascending: true });
        if (error) throw error;
        rows = data || [];
      }

      setBackgrounds(rows.map((bg: any) => ({
        id: bg.id,
        name: bg.name,
        image_url: bg.image_url,
        gradient_css: bg.gradient_css,
        category: bg.category || 'nature',
        is_premium: bg.is_premium || false,
        is_active: bg.is_active ?? true,
        price_diamonds: bg.price_diamonds || 0,
        display_order: bg.display_order || 1,
        created_at: bg.created_at
      })));
    } catch (err) {
      recordAdminError({ kind: "rpc", label: "AdminPartyBackgrounds.ErrorFetchingBackgrounds", message: err instanceof Error ? err.message : "Error fetching backgrounds" });
      toast.error("Failed to load backgrounds");
      setBackgrounds([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBackgrounds();
  }, [fetchBackgrounds]);

  const filteredBackgrounds = backgrounds.filter(bg => {
    const matchesSearch = bg.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || bg.category === filterCategory;
    const matchesPremium = filterPremium === "all" || 
      (filterPremium === "premium" && bg.is_premium) ||
      (filterPremium === "free" && !bg.is_premium);
    return matchesSearch && matchesCategory && matchesPremium;
  });

  const handleAdd = () => {
    setFormData({
      name: "",
      image_url: "",
      gradient_css: "",
      category: "nature",
      is_premium: false,
      is_active: true,
      price_diamonds: 0,
      display_order: backgrounds.length + 1
    });
    setShowAddDialog(true);
  };

  const handleEdit = (bg: PartyBackground) => {
    setSelectedBackground(bg);
    setFormData({
      name: bg.name,
      image_url: bg.image_url || "",
      gradient_css: bg.gradient_css || "",
      category: bg.category,
      is_premium: bg.is_premium,
      is_active: bg.is_active,
      price_diamonds: bg.price_diamonds,
      display_order: bg.display_order
    });
    setShowEditDialog(true);
  };

  const handleSaveNew = async () => {
    if (!formData.name || !formData.image_url) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      const session = getAdminSession();
      if (!session?.admin_id) {
        toast.error("Admin session expired. Please re-login.");
        return;
      }
      const { data, error } = await adminSupabase.rpc('admin_upsert_party_background' as any, {
        _admin_id: session.admin_id,
        _id: null,
        _name: formData.name,
        _image_url: formData.image_url || null,
        _gradient_css: formData.gradient_css || null,
        _category: formData.category,
        _is_premium: formData.is_premium,
        _is_active: formData.is_active,
        _price_diamonds: formData.price_diamonds,
        _display_order: formData.display_order,
      });
      if (error) throw error;
      if (data) {
        setBackgrounds(prev => [...prev, {
          ...(data as any),
          category: (data as any).category || 'nature',
          price_diamonds: (data as any).price_diamonds || 0,
        }]);
      }
      setShowAddDialog(false);
      toast.success("Background added successfully!");
    } catch (err: any) {
      recordAdminError({ kind: "rpc", label: "AdminPartyBackgrounds.ErrorAddingBackground", message: err instanceof Error ? err.message : "Error adding background" });
      toast.error(err?.message || "Failed to add background");
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedBackground || !formData.name || !formData.image_url) {
      toast.error("Please fill in all required fields");
      return;
    }

    try {
      const session = getAdminSession();
      if (!session?.admin_id) {
        toast.error("Admin session expired. Please re-login.");
        return;
      }
      const { error } = await adminSupabase.rpc('admin_upsert_party_background' as any, {
        _admin_id: session.admin_id,
        _id: selectedBackground.id,
        _name: formData.name,
        _image_url: formData.image_url || null,
        _gradient_css: formData.gradient_css || null,
        _category: formData.category,
        _is_premium: formData.is_premium,
        _is_active: formData.is_active,
        _price_diamonds: formData.price_diamonds,
        _display_order: formData.display_order,
      });
      if (error) throw error;

      setBackgrounds(prev => prev.map(bg => 
        bg.id === selectedBackground.id 
          ? { ...bg, ...formData, image_url: formData.image_url || null, gradient_css: formData.gradient_css || null }
          : bg
      ));
      setShowEditDialog(false);
      toast.success("Background updated successfully!");
    } catch (err) {
      recordAdminError({ kind: "rpc", label: "AdminPartyBackgrounds.ErrorUpdatingBackground", message: err instanceof Error ? err.message : "Error updating background" });
      toast.error("Failed to update background");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const session = getAdminSession();
      if (!session?.admin_id) {
        toast.error("Admin session expired. Please re-login.");
        return;
      }

      // Clear referencing party rooms first (best-effort, ignored if RLS denies)
      await supabase
        .from('party_rooms')
        .update({ background_id: null } as any)
        .eq('background_id', id);

      const { data, error } = await adminSupabase.rpc('admin_delete_party_background' as any, {
        _admin_id: session.admin_id,
        _id: id,
      });
      if (error) throw error;
      if (!(data as any)?.success) throw new Error('Delete failed');

      setBackgrounds(prev => prev.filter(bg => bg.id !== id));
      toast.success("Background deleted");
    } catch (err: any) {
      recordAdminError({ kind: "rpc", label: "AdminPartyBackgrounds.ErrorDeletingBackground", message: err instanceof Error ? err.message : "Error deleting background" });
      toast.error(err?.message || "Failed to delete background");
    }
  };

  const handleToggleActive = async (id: string) => {
    const bg = backgrounds.find(b => b.id === id);
    if (!bg) return;

    try {
      const session = getAdminSession();
      if (!session?.admin_id) {
        toast.error("Admin session expired. Please re-login.");
        return;
      }
      const { error } = await adminSupabase.rpc('admin_upsert_party_background' as any, {
        _admin_id: session.admin_id,
        _id: id,
        _name: bg.name,
        _image_url: bg.image_url,
        _gradient_css: bg.gradient_css,
        _category: bg.category,
        _is_premium: bg.is_premium,
        _is_active: !bg.is_active,
        _price_diamonds: bg.price_diamonds,
        _display_order: bg.display_order,
      });
      if (error) throw error;
      setBackgrounds(prev => prev.map(b =>
        b.id === id ? { ...b, is_active: !b.is_active } : b
      ));
    } catch (err: any) {
      recordAdminError({ kind: "rpc", label: "AdminPartyBackgrounds.ErrorTogglingBackground", message: err instanceof Error ? err.message : "Error toggling background" });
      toast.error(err?.message || "Failed to update background");
    }
  };

  const handleTogglePremium = (id: string) => {
    setBackgrounds(prev => prev.map(bg => 
      bg.id === id ? { ...bg, is_premium: !bg.is_premium } : bg
    ));
  };

  // Handle file upload to Supabase Storage
  const handleFileUpload = async (file: File, isEdit: boolean = false) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Only JPG, PNG, WebP, GIF images are allowed");
      return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10MB");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const fileName = `bg_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `backgrounds/${fileName}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('party-backgrounds')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('party-backgrounds')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      // Update form data with the new URL
      setFormData(prev => ({ ...prev, image_url: publicUrl }));
      
      setUploadProgress(100);
      toast.success("Image uploaded successfully!");
    } catch (err: any) {
      recordAdminError({ kind: "rpc", label: "AdminPartyBackgrounds.ErrorUploadingFile", message: err instanceof Error ? err.message : "Error uploading file" });
      toast.error(err.message || "Failed to upload image");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file, isEdit);
    }
    // Reset input
    e.target.value = '';
  };

  const stats = {
    total: backgrounds.length,
    active: backgrounds.filter(b => b.is_active).length,
    premium: backgrounds.filter(b => b.is_premium).length,
    free: backgrounds.filter(b => !b.is_premium).length
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
              <Image className="w-5 h-5 text-white" />
            </div>
            Party Backgrounds
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage room backgrounds and themes for party rooms
          </p>
        </div>
        <Button onClick={handleAdd} className="bg-gradient-to-r from-purple-500 to-pink-500">
          <Plus className="w-4 h-4 mr-2" />
          Add Background
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                <Image className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-xs text-muted-foreground">Total</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
                <Eye className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.active}</p>
                <p className="text-xs text-muted-foreground">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 dark:bg-yellow-900/30 rounded-xl flex items-center justify-center">
                <Crown className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.premium}</p>
                <p className="text-xs text-muted-foreground">Premium</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-md">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.free}</p>
                <p className="text-xs text-muted-foreground">Free</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-0 shadow-md">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search backgrounds..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-full md:w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterPremium} onValueChange={(v) => setFilterPremium(v as any)}>
              <SelectTrigger className="w-full md:w-32">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="free">Free</SelectItem>
                <SelectItem value="premium">Premium</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-1">
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("grid")}
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("list")}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backgrounds Grid/List */}
      {viewMode === "grid" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {filteredBackgrounds.map((bg) => (
            <Card 
              key={bg.id} 
              className={cn(
                "overflow-hidden border-0 shadow-md transition-all hover:shadow-lg",
                !bg.is_active && "opacity-60"
              )}
            >
              <div
                className="relative aspect-video bg-muted"
                style={bg.gradient_css && !bg.image_url ? { background: bg.gradient_css } : undefined}
              >
                {bg.image_url ? (
                  <img
                    src={bg.image_url}
                    alt={bg.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      const img = e.currentTarget;
                      img.style.display = 'none';
                      const parent = img.parentElement;
                      if (parent) {
                        parent.style.background = bg.gradient_css || 'linear-gradient(135deg, hsl(var(--muted)), hsl(var(--muted-foreground) / 0.2))';
                        if (!parent.querySelector('[data-fallback]')) {
                          const ph = document.createElement('div');
                          ph.dataset.fallback = '1';
                          ph.className = 'absolute inset-0 flex items-center justify-center text-xs text-white/70';
                          ph.textContent = 'Image unavailable';
                          parent.appendChild(ph);
                        }
                      }
                    }}
                  />
                ) : !bg.gradient_css ? (
                  <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                    No preview
                  </div>
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                
                {/* Badges */}
                <div className="absolute top-2 left-2 flex gap-1">
                  {bg.is_premium && (
                    <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0 text-[10px]">
                      <Crown className="w-2.5 h-2.5 mr-0.5" />
                      VIP
                    </Badge>
                  )}
                  {!bg.is_active && (
                    <Badge variant="secondary" className="text-[10px]">
                      <EyeOff className="w-2.5 h-2.5 mr-0.5" />
                      Hidden
                    </Badge>
                  )}
                </div>

                {/* Price */}
                {bg.is_premium && (
                  <div className="absolute top-2 right-2">
                    <Badge className="bg-black/50 backdrop-blur-sm text-white border-0 text-[10px]">
                      <DollarSign className="w-2.5 h-2.5" />
                      {bg.price_diamonds}
                    </Badge>
                  </div>
                )}

                {/* Name */}
                <div className="absolute bottom-2 left-2 right-2">
                  <p className="text-white font-medium text-sm truncate">{bg.name}</p>
                  <p className="text-white/70 text-xs capitalize">{bg.category}</p>
                </div>
              </div>
              <CardContent className="p-2">
                <div className="flex items-center justify-between">
                  <Switch
                    checked={bg.is_active}
                    onCheckedChange={() => handleToggleActive(bg.id)}
                  />
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleEdit(bg)}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-600"
                      onClick={() => handleDelete(bg.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="border-0 shadow-md">
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {filteredBackgrounds.map((bg) => (
                <div 
                  key={bg.id} 
                  className={cn(
                    "flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors",
                    !bg.is_active && "opacity-60"
                  )}
                >
                  <div
                    className="w-20 h-12 rounded-lg overflow-hidden bg-muted shrink-0"
                    style={bg.gradient_css && !bg.image_url ? { background: bg.gradient_css } : undefined}
                  >
                    {bg.image_url && (
                      <img
                        src={bg.image_url}
                        alt={bg.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{bg.name}</p>
                      {bg.is_premium && (
                        <Badge className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white border-0 text-[10px]">
                          VIP
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground capitalize">{bg.category}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {bg.is_premium && (
                      <Badge variant="outline">
                        <DollarSign className="w-3 h-3 mr-0.5" />
                        {bg.price_diamonds}
                      </Badge>
                    )}
                    <Switch
                      checked={bg.is_active}
                      onCheckedChange={() => handleToggleActive(bg.id)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(bg)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-red-500"
                      onClick={() => handleDelete(bg.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {filteredBackgrounds.length === 0 && (
        <div className="text-center py-12">
          <Image className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No backgrounds found</p>
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-purple-500" />
              Add Background
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Background name"
              />
            </div>

            {/* Upload Section */}
            <div>
              <Label className="mb-2 block">Upload Image</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => handleFileSelect(e, false)}
                className="hidden"
              />
              <div 
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
                  isUploading 
                    ? "border-purple-500 bg-purple-500/10" 
                    : "border-muted-foreground/30 hover:border-purple-500 hover:bg-purple-500/5"
                )}
              >
                {isUploading ? (
                  <div className="space-y-2">
                    <Loader2 className="w-8 h-8 mx-auto animate-spin text-purple-500" />
                    <p className="text-sm text-muted-foreground">Uploading...</p>
                    <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <ImagePlus className="w-10 h-10 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">Click to upload image</p>
                    <p className="text-xs text-muted-foreground">JPG, PNG, WebP, GIF (max 10MB)</p>
                  </>
                )}
              </div>
            </div>

            {/* Or URL Input */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">Or paste URL</span>
              </div>
            </div>

            <div>
              <Input
                value={formData.image_url}
                onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>

            {/* Preview */}
            {formData.image_url && (
              <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8"
                  onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}

            <div>
              <Label>Category</Label>
              <Select 
                value={formData.category} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Premium (VIP)</Label>
              <Switch
                checked={formData.is_premium}
                onCheckedChange={(v) => setFormData(prev => ({ ...prev, is_premium: v }))}
              />
            </div>
            {formData.is_premium && (
              <div>
                <Label>Price (Diamonds)</Label>
                <Input
                  type="number"
                  value={formData.price_diamonds}
                  onChange={(e) => setFormData(prev => ({ ...prev, price_diamonds: parseInt(e.target.value) || 0 }))}
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(v) => setFormData(prev => ({ ...prev, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSaveNew} 
              disabled={isUploading || !formData.name || !formData.image_url}
              className="bg-gradient-to-r from-purple-500 to-pink-500"
            >
              <Check className="w-4 h-4 mr-2" />
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-purple-500" />
              Edit Background
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Background name"
              />
            </div>

            {/* Current Image Preview */}
            {formData.image_url && (
              <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
                <img src={formData.image_url} alt="Preview" className="w-full h-full object-cover" />
                <Button
                  variant="destructive"
                  size="icon"
                  className="absolute top-2 right-2 h-8 w-8"
                  onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            )}

            {/* Upload New Image */}
            <div>
              <Label className="mb-2 block">Upload New Image</Label>
              <input
                ref={editFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(e) => handleFileSelect(e, true)}
                className="hidden"
              />
              <div 
                onClick={() => !isUploading && editFileInputRef.current?.click()}
                className={cn(
                  "border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all",
                  isUploading 
                    ? "border-purple-500 bg-purple-500/10" 
                    : "border-muted-foreground/30 hover:border-purple-500 hover:bg-purple-500/5"
                )}
              >
                {isUploading ? (
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
                    <span className="text-sm text-muted-foreground">Uploading...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                    <span className="text-sm">Click to upload new image</span>
                  </div>
                )}
              </div>
            </div>

            {/* Or URL Input */}
            <div>
              <Label>Or paste Image URL</Label>
              <Input
                value={formData.image_url}
                onChange={(e) => setFormData(prev => ({ ...prev, image_url: e.target.value }))}
                placeholder="https://..."
              />
            </div>

            <div>
              <Label>Category</Label>
              <Select 
                value={formData.category} 
                onValueChange={(v) => setFormData(prev => ({ ...prev, category: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Premium (VIP)</Label>
              <Switch
                checked={formData.is_premium}
                onCheckedChange={(v) => setFormData(prev => ({ ...prev, is_premium: v }))}
              />
            </div>
            {formData.is_premium && (
              <div>
                <Label>Price (Diamonds)</Label>
                <Input
                  type="number"
                  value={formData.price_diamonds}
                  onChange={(e) => setFormData(prev => ({ ...prev, price_diamonds: parseInt(e.target.value) || 0 }))}
                />
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(v) => setFormData(prev => ({ ...prev, is_active: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleSaveEdit}
              disabled={isUploading || !formData.name || !formData.image_url}
              className="bg-gradient-to-r from-purple-500 to-pink-500"
            >
              <Check className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPartyBackgrounds;
