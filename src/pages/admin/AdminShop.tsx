import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Eye, 
  EyeOff, 
  Search,
  Crown,
  Sparkles,
  Car,
  MessageCircle,
  Award,
  ShoppingBag,
  Star,
  TrendingUp,
  ArrowLeft,
  Upload,
  Image,
  FileVideo,
  X,
  Loader2,
  Gift,
  Smile,
  Sofa,
  Home,
  Wand2,
  Palette,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import SVGAPreviewWithMuteToggle from "@/components/admin/SVGAPreviewWithMuteToggle";
import { UniversalAnimationPlayer } from "@/features/shared/animations";
import { useR2Upload } from "@/hooks/useR2Upload";

const adminCardStyles = "bg-white/10 backdrop-blur-sm rounded-xl p-4 border border-white/10";
const adminButtonStyles = { primary: "bg-gradient-to-r from-purple-500 to-pink-500 text-white" };
const adminInputStyles = "bg-white/10 border-white/20 text-white";

interface ShopItem {
  id: string;
  name: string;
  description: string | null;
  category: string;
  preview_url: string | null;
  animation_url: string | null;
  animation_file_url: string | null;
  image_url: string | null;
  svga_url: string | null;
  file_type: string | null;
  item_type: string | null;
  animation_type: string | null;
  price_diamonds: number | null;
  price_coins: number | null;
  duration_days: number | null;
  min_level: number | null;
  level_required: number | null;
  rarity: string | null;
  tag: string | null;
  is_premium: boolean | null;
  is_vip_exclusive: boolean | null;
  is_active: boolean;
  is_featured: boolean | null;
  display_order: number;
  total_sold: number | null;
  created_at: string;
  sound_url: string | null;
  sound_duration_ms: number | null;
  is_permanent: boolean | null;
}

type ShopFormData = {
  name: string;
  description: string;
  category: string;
  preview_url: string;
  animation_url: string;
  animation_file_url: string;
  file_type: string;
  animation_type: string;
  price_diamonds: number;
  duration_days: number | null;
  min_level: number;
  rarity: string;
  is_premium: boolean;
  is_active: boolean;
  is_featured: boolean;
  display_order: number;
  sound_url: string;
  sound_duration_ms: number;
};

// Extended categories for live streaming app
const categories = [
  { id: "frame", name: "Avatar Frames", icon: Crown },
  { id: "entrance", name: "Entrance Effects", icon: Sparkles },
  { id: "vehicle", name: "Vehicles", icon: Car },
  { id: "bubble", name: "Chat Bubbles", icon: MessageCircle },
  { id: "badge", name: "Badges", icon: Award },
  { id: "party_background", name: "Party Backgrounds", icon: Image },
  { id: "seat_effect", name: "Seat Effects", icon: Sofa },
  { id: "gift_effect", name: "Gift Effects", icon: Gift },
  { id: "profile_decoration", name: "Profile Decorations", icon: Wand2 },
  { id: "room_theme", name: "Room Themes", icon: Home },
  { id: "sticker", name: "Stickers", icon: Palette },
  { id: "emoji", name: "Animated Emojis", icon: Smile },
  { id: "lucky_gift", name: "Lucky Gifts", icon: Star },
];

const rarities = ["common", "rare", "epic", "legendary", "mythic"];
const fileTypes = ["svga", "lottie", "vap", "gif", "video", "image"];
const animationTypes = ["static", "animated"];

const createDefaultFormData = (): ShopFormData => ({
  name: "",
  description: "",
  category: "frame",
  preview_url: "",
  animation_url: "",
  animation_file_url: "",
  file_type: "svga",
  animation_type: "animated",
  price_diamonds: 100,
  duration_days: null,
  min_level: 0,
  rarity: "common",
  is_premium: false,
  is_active: true,
  is_featured: false,
  display_order: 0,
  sound_url: "",
  sound_duration_ms: 3000,
});

const detectFileTypeFromUrl = (url: string | null | undefined): string => {
  if (!url) return "image";

  const lower = url.toLowerCase();
  if (lower.endsWith(".svga")) return "svga";
  if (lower.endsWith(".json")) return "lottie";
  if (lower.endsWith(".mp4") || lower.endsWith(".webm")) return "video";
  if (lower.endsWith(".gif")) return "gif";
  return "image";
};

const normalizeShopItem = (raw: any): ShopItem => {
  const assetUrl = raw.animation_file_url ?? raw.svga_url ?? raw.animation_url ?? raw.image_url ?? raw.preview_url ?? null;
  const normalizedFileType = raw.file_type ?? raw.item_type ?? detectFileTypeFromUrl(assetUrl);

  return {
    id: raw.id,
    name: raw.name ?? "",
    description: raw.description ?? null,
    category: raw.category ?? "frame",
    preview_url: raw.preview_url ?? raw.image_url ?? assetUrl,
    animation_url: raw.animation_url ?? (normalizedFileType !== "svga" ? assetUrl : null),
    animation_file_url: raw.animation_file_url ?? assetUrl,
    image_url: raw.image_url ?? null,
    svga_url: raw.svga_url ?? (normalizedFileType === "svga" ? assetUrl : null),
    file_type: normalizedFileType,
    item_type: raw.item_type ?? normalizedFileType,
    animation_type: raw.animation_type ?? (normalizedFileType === "image" ? "static" : "animated"),
    price_diamonds: raw.price_diamonds ?? 0,
    price_coins: raw.price_coins ?? 0,
    duration_days: raw.duration_days ?? null,
    min_level: raw.min_level ?? raw.level_required ?? 0,
    level_required: raw.level_required ?? raw.min_level ?? 0,
    rarity: raw.rarity ?? raw.tag ?? "common",
    tag: raw.tag ?? raw.rarity ?? null,
    is_premium: raw.is_premium ?? raw.is_vip_exclusive ?? false,
    is_vip_exclusive: raw.is_vip_exclusive ?? raw.is_premium ?? false,
    is_active: raw.is_active ?? true,
    is_featured: raw.is_featured ?? false,
    display_order: raw.display_order ?? 0,
    total_sold: raw.total_sold ?? 0,
    created_at: raw.created_at ?? "",
    sound_url: raw.sound_url ?? null,
    sound_duration_ms: raw.sound_duration_ms ?? null,
    is_permanent: raw.is_permanent ?? raw.duration_days == null,
  };
};

const buildShopItemPayload = (formData: ShopFormData, existingItem?: ShopItem | null) => {
  const normalizedFileType = formData.file_type || "image";
  const uploadedAssetUrl = formData.animation_file_url.trim();
  const manualAnimationUrl = formData.animation_url.trim();
  const manualPreviewUrl = formData.preview_url.trim();
  const fallbackAssetUrl = uploadedAssetUrl || manualAnimationUrl || manualPreviewUrl || null;
  const normalizedDuration = formData.duration_days && formData.duration_days > 0 ? formData.duration_days : null;
  const normalizedMinLevel = Math.max(0, Number(formData.min_level) || 0);
  const normalizedPriceDiamonds = Math.max(0, Number(formData.price_diamonds) || 0);

  const dataToSave = {
    name: formData.name.trim(),
    description: formData.description.trim() || null,
    category: formData.category,
    item_type: normalizedFileType,
    file_type: normalizedFileType,
    animation_type: formData.animation_type,
    price_coins: existingItem?.price_coins ?? 0,
    price_diamonds: normalizedPriceDiamonds,
    image_url: normalizedFileType === "image" || normalizedFileType === "gif" ? fallbackAssetUrl : null,
    animation_url: normalizedFileType === "svga" ? null : fallbackAssetUrl,
    svga_url: normalizedFileType === "svga" ? fallbackAssetUrl : null,
    preview_url: manualPreviewUrl || fallbackAssetUrl,
    animation_file_url: fallbackAssetUrl,
    duration_days: normalizedDuration,
    is_permanent: normalizedDuration === null,
    is_active: formData.is_active,
    is_featured: formData.is_featured,
    display_order: Math.max(0, Number(formData.display_order) || 0),
    level_required: normalizedMinLevel,
    min_level: normalizedMinLevel,
    vip_discount_percent: existingItem?.is_vip_exclusive || formData.is_premium ? 100 : 0,
    is_vip_exclusive: formData.is_premium,
    tag: formData.rarity,
    rarity: formData.rarity,
    is_premium: formData.is_premium,
    total_sold: existingItem?.total_sold ?? 0,
    sound_url: formData.sound_url.trim() || null,
    sound_duration_ms: formData.sound_url.trim()
      ? Math.max(0, Number(formData.sound_duration_ms) || 3000)
      : null,
  };

  return Object.fromEntries(
    Object.entries(dataToSave).filter(([, value]) => value !== undefined)
  );
};

const AdminShop = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingItem, setEditingItem] = useState<ShopItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [uploadingPreview, setUploadingPreview] = useState(false);
  const previewInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile: r2UploadFile, uploading: r2Uploading, progress: r2Progress } = useR2Upload();
  
  const [formData, setFormData] = useState<ShopFormData>(createDefaultFormData());

  const [fullscreenPreviewItem, setFullscreenPreviewItem] = useState<ShopItem | null>(null);
  const soundInputRef = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("shop_items")
      .select("*")
      .order("category")
      .order("display_order");

    if (error) {
      toast.error("Failed to load shop items");
      console.error(error);
    } else {
      setItems((data || []).map(normalizeShopItem));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useAdminRealtime(['shop_items'], fetchItems);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    
    // Allowed extensions
    const allowedExtensions = ['svga', 'svg', 'json', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'lottie', 'bmp', 'tiff', 'tif', 'apng', 'avif'];
    
    if (!fileExt || !allowedExtensions.includes(fileExt)) {
      toast.error("Invalid file type. Please upload SVGA, SVG, PNG, GIF, WebP, JSON (Lottie), MP4, or WebM files.");
      return;
    }

    // Validate file size (150MB max - R2 supports up to 150MB)
    if (file.size > 150 * 1024 * 1024) {
      toast.error("File too large. Maximum size is 150MB.");
      return;
    }

    setUploading(true);
    try {
      const result = await r2UploadFile(file, {
        bucket: 'shop-items',
        folder: 'shop-items',
      });

      if (!result.success || !result.url) {
        throw new Error(result.error || 'Upload failed');
      }

      const publicUrl = result.url;

      let detectedType = 'image';
      if (fileExt === 'svga') detectedType = 'svga';
      else if (fileExt === 'json') detectedType = 'lottie';
      else if (fileExt === 'gif') detectedType = 'gif';
      else if (fileExt === 'mp4' || fileExt === 'webm') detectedType = 'video';

      setFormData(prev => ({
        ...prev,
        animation_url: publicUrl,
        animation_file_url: publicUrl,
        preview_url: prev.preview_url || publicUrl,
        file_type: detectedType,
        animation_type: detectedType === 'image' ? 'static' : 'animated'
      }));
      setPreviewFile(publicUrl);
      toast.success(`${detectedType.toUpperCase()} file uploaded successfully!`);
    } catch (error: any) {
      toast.error(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSoundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm'];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid audio type. Please upload MP3, WAV, OGG, or WebM audio files.");
      return;
    }

    if (file.size > 150 * 1024 * 1024) {
      toast.error("Audio file too large. Maximum size is 150MB.");
      return;
    }

    setUploading(true);
    try {
      const result = await r2UploadFile(file, {
        bucket: 'sounds',
        folder: 'shop-sounds',
      });

      if (!result.success || !result.url) {
        throw new Error(result.error || 'Upload failed');
      }

      setFormData(prev => ({
        ...prev,
        sound_url: result.url!
      }));
      toast.success("Sound file uploaded successfully!");
    } catch (error: any) {
      toast.error(`Sound upload failed: ${error.message}`);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handlePreviewImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid image type. Please upload PNG, JPG, GIF, or WebP.");
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      toast.error("Preview image too large. Maximum size is 20MB.");
      return;
    }

    setUploadingPreview(true);
    try {
      const result = await r2UploadFile(file, {
        bucket: 'shop-items',
        folder: 'shop-previews',
      });

      if (!result.success || !result.url) {
        throw new Error(result.error || 'Upload failed');
      }

      setFormData(prev => ({
        ...prev,
        preview_url: result.url!,
      }));
      toast.success("Preview image uploaded!");
    } catch (error: any) {
      toast.error(`Preview upload failed: ${error.message}`);
    } finally {
      setUploadingPreview(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Please enter a name");
      return;
    }

    setSaving(true);
    try {
      const dataToSave = buildShopItemPayload(formData, editingItem);

      if (editingItem) {
        const { error } = await supabase
          .from("shop_items")
          .update(dataToSave)
          .eq("id", editingItem.id);
        if (error) throw error;
        toast.success("Item updated!");
      } else {
        const { error } = await supabase
          .from("shop_items")
          .insert(dataToSave);
        if (error) throw error;
        toast.success("Item created!");
      }
      setShowAddDialog(false);
      setEditingItem(null);
      setFormData(createDefaultFormData());
      setPreviewFile(null);
      fetchItems();
    } catch (error: any) {
      toast.error(error.message || "Failed to save item");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this item?")) return;
    
    await supabase
      .from("shop_items")
      .delete()
      .eq("id", id);
    toast.success("Item deleted!");
    fetchItems();
  };

  const toggleActive = async (item: ShopItem) => {
    await supabase
      .from("shop_items")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);
    fetchItems();
  };

  const toggleFeatured = async (item: ShopItem) => {
    await supabase
      .from("shop_items")
      .update({ is_featured: !item.is_featured })
      .eq("id", item.id);
    fetchItems();
  };

  const resetForm = () => {
    setFormData(createDefaultFormData());
    setPreviewFile(null);
  };

  const openEdit = (item: ShopItem) => {
    const normalizedItem = normalizeShopItem(item);

    setEditingItem(normalizedItem);
    setFormData({
      name: normalizedItem.name,
      description: normalizedItem.description || "",
      category: normalizedItem.category,
      preview_url: normalizedItem.preview_url || "",
      animation_url: normalizedItem.animation_url || normalizedItem.svga_url || "",
      animation_file_url: normalizedItem.animation_file_url || normalizedItem.svga_url || normalizedItem.image_url || "",
      file_type: normalizedItem.file_type || normalizedItem.item_type || detectFileTypeFromUrl(normalizedItem.animation_file_url || normalizedItem.preview_url),
      animation_type: normalizedItem.animation_type || "animated",
      price_diamonds: normalizedItem.price_diamonds ?? 0,
      duration_days: normalizedItem.duration_days,
      min_level: normalizedItem.min_level ?? normalizedItem.level_required ?? 0,
      rarity: normalizedItem.rarity || normalizedItem.tag || "common",
      is_premium: normalizedItem.is_premium ?? normalizedItem.is_vip_exclusive ?? false,
      is_active: normalizedItem.is_active,
      is_featured: normalizedItem.is_featured ?? false,
      display_order: normalizedItem.display_order,
      sound_url: normalizedItem.sound_url || "",
      sound_duration_ms: normalizedItem.sound_duration_ms || 3000,
    });
    setPreviewFile(
      normalizedItem.animation_file_url ||
      normalizedItem.svga_url ||
      normalizedItem.preview_url ||
      normalizedItem.animation_url ||
      normalizedItem.image_url ||
      null
    );
    setShowAddDialog(true);
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryIcon = (category: string) => {
    const cat = categories.find(c => c.id === category);
    return cat ? cat.icon : ShoppingBag;
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case "common": return "bg-gray-500";
      case "rare": return "bg-blue-500";
      case "epic": return "bg-purple-500";
      case "legendary": return "bg-amber-500";
      case "mythic": return "bg-gradient-to-r from-pink-500 to-cyan-500";
      default: return "bg-gray-500";
    }
  };

  // For card thumbnail: prefer preview_url (static image)
  const getCardThumbnail = (item: ShopItem) => {
    return item.preview_url || item.image_url || item.animation_file_url || item.svga_url || item.animation_url;
  };

  // For fullscreen preview: prefer animation file
  const getAnimationUrl = (item: ShopItem) => {
    return item.animation_file_url || item.svga_url || item.animation_url || item.preview_url || item.image_url;
  };

  const isSVGA = (url: string | null | undefined) => {
    if (!url) return false;
    return url.toLowerCase().endsWith('.svga');
  };

  const isLottie = (url: string | null | undefined) => {
    if (!url) return false;
    return url.toLowerCase().endsWith('.json');
  };

  const isVideo = (url: string | null | undefined) => {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.endsWith('.mp4') || lower.endsWith('.webm');
  };

  const totalItems = items.length;
  const activeItems = items.filter(i => i.is_active).length;
  const featuredItems = items.filter(i => Boolean(i.is_featured)).length;
  const totalSold = items.reduce((acc, i) => acc + (i.total_sold ?? 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 px-3 py-4 pb-24 md:p-6 md:pb-20">
      {/* Hidden File Input - Accept all files on mobile to allow SVGA selection, validation happens in handler */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="*/*"
        className="hidden"
      />

      {/* Header - Mobile optimized */}
      <div className="flex items-center justify-between gap-2 mb-4 md:mb-6">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => navigate("/admin")}
            className="text-white hover:bg-white/10 shrink-0 w-8 h-8 md:w-10 md:h-10"
          >
            <ArrowLeft className="w-4 h-4 md:w-5 md:h-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-base md:text-2xl font-bold text-white flex items-center gap-2 truncate">
              <ShoppingBag className="w-4 h-4 md:w-6 md:h-6 text-purple-400 shrink-0" />
              <span className="truncate">Shop Management</span>
            </h1>
            <p className="text-white/60 text-xs md:text-sm hidden sm:block">Manage shop items - Frames, Effects, Backgrounds & more</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchItems}
          disabled={loading}
          className="gap-1.5 bg-white/10 border-white/20 text-white hover:bg-white/20 text-xs px-2 md:px-3 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 md:w-4 md:h-4 ${loading ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {/* Stats - Mobile optimized grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4 md:mb-6">
        <div className={adminCardStyles}>
          <p className="text-white/60 text-[10px] md:text-xs">Total Items</p>
          <p className="text-lg md:text-2xl font-bold text-white">{totalItems}</p>
        </div>
        <div className={adminCardStyles}>
          <p className="text-white/60 text-[10px] md:text-xs">Active</p>
          <p className="text-lg md:text-2xl font-bold text-green-400">{activeItems}</p>
        </div>
        <div className={adminCardStyles}>
          <p className="text-white/60 text-[10px] md:text-xs">Featured</p>
          <p className="text-lg md:text-2xl font-bold text-amber-400">{featuredItems}</p>
        </div>
        <div className={adminCardStyles}>
          <p className="text-white/60 text-[10px] md:text-xs">Total Sold</p>
          <p className="text-lg md:text-2xl font-bold text-purple-400">{totalSold}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
            <Input
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`${adminInputStyles} pl-10`}
            />
          </div>
        </div>

        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className={`w-[180px] ${adminInputStyles}`}>
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(cat => (
              <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchItems}
          disabled={loading}
          className="border-white/20 text-white hover:bg-white/10"
        >
          <svg className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </Button>

        <Button
          onClick={() => {
            resetForm();
            setEditingItem(null);
            setShowAddDialog(true);
          }}
          className={adminButtonStyles.primary}
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Item
        </Button>
      </div>

      {/* Items Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredItems.map((item) => {
          const CategoryIcon = getCategoryIcon(item.category);
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`${adminCardStyles} ${!item.is_active && "opacity-60"}`}
            >
              <div className="flex gap-3">
                {/* Preview - Supports SVGA, Lottie, Video, Image */}
                <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {getPreviewUrl(item) ? (
                    isSVGA(getPreviewUrl(item)) ? (
                      <Suspense fallback={<div className="w-full h-full bg-purple-500/20 animate-pulse" />}>
                        <UniversalAnimationPlayer
                          src={getPreviewUrl(item)!}
                          className="w-full h-full"
                          loop={true}
                          autoPlay={true}
                        />
                      </Suspense>
                    ) : isLottie(getPreviewUrl(item)) ? (
                      <UniversalAnimationPlayer
                        src={getPreviewUrl(item)!}
                        className="w-full h-full"
                        loop={true}
                        autoPlay={true}
                      />
                    ) : isVideo(getPreviewUrl(item)) ? (
                      <video 
                        src={getPreviewUrl(item)!} 
                        className="w-full h-full object-cover" 
                        autoPlay 
                        muted 
                        loop 
                        playsInline
                      />
                    ) : (
                      <img src={getPreviewUrl(item)!} alt={item.name} className="w-full h-full object-cover" />
                    )
                  ) : (
                    <CategoryIcon className="w-8 h-8 text-purple-400" />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-white font-semibold truncate">{item.name}</h3>
                    {item.is_featured && <Star className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                  </div>
                  
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge className={`${getRarityColor(item.rarity)} text-white text-xs`}>
                      {item.rarity}
                    </Badge>
                    <Badge variant="outline" className="text-xs text-white/70 border-white/20">
                      {item.category.replace('_', ' ')}
                    </Badge>
                    {item.animation_type === 'animated' && (
                      <Badge className="bg-purple-500 text-white text-xs">
                        Animated
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-3 text-sm flex-wrap">
                    <span className="bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-bold px-2 py-0.5 rounded-md text-xs shadow-sm">💎 {item.price_diamonds?.toLocaleString()}</span>
                    <span className="text-white/70 font-medium">Lv.{item.min_level}+</span>
                    <span className="text-white/50">{item.total_sold} sold</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => toggleActive(item)}
                    className={item.is_active ? "text-green-400" : "text-red-400"}
                  >
                    {item.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => toggleFeatured(item)}
                    className={item.is_featured ? "text-amber-400" : "text-white/40"}
                  >
                    <Star className="w-4 h-4" />
                  </Button>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => openEdit(item)}
                    className="text-blue-400 hover:bg-blue-400/10"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleDelete(item.id)}
                    className="text-red-400 hover:bg-red-400/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Add/Edit Dialog - Mobile optimized */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="bg-slate-900 border-white/10 w-[95vw] max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 rounded-xl">
          <DialogHeader className="p-3 md:p-6 pb-0 flex-shrink-0 border-b border-white/10">
            <DialogTitle className="text-white text-base md:text-lg">
              {editingItem ? "Edit Item" : "Add New Shop Item"}
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="flex-1 px-3 md:px-6 overflow-y-auto">
            <div className="space-y-3 md:space-y-4 py-3 md:py-4">
              {/* File Upload Section - Mobile optimized */}
              <div className="border-2 border-dashed border-white/20 rounded-lg md:rounded-xl p-3 md:p-4">
                <Label className="text-white/80 mb-2 block text-sm">Upload Animation/Image</Label>
                
                {previewFile ? (
                  <div className="relative">
                    <div className="w-full aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                      {formData.file_type === 'svga' ? (
                        <SVGAPreviewWithMuteToggle 
                          src={previewFile} 
                          className="w-full h-full object-contain"
                          containerClassName="w-full h-full"
                          loop={true}
                          autoPlay={true}
                          showMuteButton={true}
                        />
                      ) : formData.file_type === 'lottie' ? (
                        <UniversalAnimationPlayer 
                          src={previewFile} 
                          className="w-full h-full"
                          loop={true}
                          autoPlay={true}
                        />
                      ) : formData.file_type === 'video' ? (
                        <video src={previewFile} className="w-full h-full object-contain" controls autoPlay muted loop />
                      ) : formData.file_type === 'gif' ? (
                        <img src={previewFile} alt="Preview" className="w-full h-full object-contain" />
                      ) : (
                        <img src={previewFile} alt="Preview" className="w-full h-full object-contain" />
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="absolute top-1.5 right-1.5 w-7 h-7 md:w-8 md:h-8 z-10"
                      onClick={() => {
                        setPreviewFile(null);
                        setFormData(prev => ({ ...prev, animation_file_url: "" }));
                      }}
                    >
                      <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full h-16 md:h-24 border-white/20 text-white/70 hover:bg-white/10 flex-col md:flex-row items-center justify-center gap-1 md:gap-2"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        <div className="text-center md:text-left">
                          <p className="text-sm">Click to upload</p>
                          <p className="text-[10px] md:text-xs text-white/50 hidden sm:block">SVGA, PNG, GIF, WebP, Lottie JSON, MP4, WebM (max 100MB)</p>
                        </div>
                      </>
                    )}
                  </Button>
                )}
              </div>

              {/* Sound Upload Section - Mobile optimized */}
              <div className="border-2 border-dashed border-amber-500/30 rounded-lg md:rounded-xl p-3 md:p-4 bg-amber-500/5">
                <Label className="text-amber-400 mb-2 block flex items-center gap-2 text-sm">
                  🔊 Sound Effect (Required)
                </Label>
                
                {formData.sound_url ? (
                  <div className="flex items-center gap-2 md:gap-3 p-2 md:p-3 bg-green-500/10 rounded-lg border border-green-500/20">
                    <audio src={formData.sound_url} controls className="flex-1 h-7 md:h-8" />
                    <Button
                      size="icon"
                      variant="destructive"
                      className="w-7 h-7 md:w-8 md:h-8 shrink-0"
                      onClick={() => setFormData(prev => ({ ...prev, sound_url: "" }))}
                    >
                      <X className="w-3.5 h-3.5 md:w-4 md:h-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full h-12 md:h-16 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 flex-col md:flex-row items-center justify-center gap-1"
                    onClick={() => soundInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
                        <span className="text-sm">Uploading...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 md:w-5 md:h-5" />
                        <div className="text-center md:text-left">
                          <p className="text-sm">Upload Sound Effect</p>
                          <p className="text-[10px] md:text-xs text-amber-400/70 hidden sm:block">MP3, WAV, OGG (max 100MB)</p>
                        </div>
                      </>
                    )}
                  </Button>
                )}
                <input
                  ref={soundInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={handleSoundUpload}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 md:gap-4">
                <div className="col-span-2">
                  <Label className="text-white/80 text-sm">Name *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className={`${adminInputStyles} h-9 md:h-10 text-sm`}
                    placeholder="Item name"
                  />
                </div>

                <div className="col-span-2">
                  <Label className="text-white/80">Description</Label>
                  <Textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className={adminInputStyles}
                    rows={2}
                    placeholder="Brief description"
                  />
                </div>

                <div>
                  <Label className="text-white/80">Category</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                    <SelectTrigger className={adminInputStyles}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map(cat => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-white/80">Rarity</Label>
                  <Select value={formData.rarity} onValueChange={(v) => setFormData({ ...formData, rarity: v })}>
                    <SelectTrigger className={adminInputStyles}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {rarities.map(r => (
                        <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-white/80">File Type</Label>
                  <Select value={formData.file_type} onValueChange={(v) => setFormData({ ...formData, file_type: v })}>
                    <SelectTrigger className={adminInputStyles}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fileTypes.map(t => (
                        <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-white/80">Animation Type</Label>
                  <Select value={formData.animation_type} onValueChange={(v) => setFormData({ ...formData, animation_type: v })}>
                    <SelectTrigger className={adminInputStyles}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {animationTypes.map(t => (
                        <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-white/80">Price (Diamonds)</Label>
                  <Input
                    type="number"
                    value={formData.price_diamonds}
                    onChange={(e) => setFormData({ ...formData, price_diamonds: parseInt(e.target.value) || 0 })}
                    className={adminInputStyles}
                  />
                </div>

                <div>
                  <Label className="text-white/80">Duration (Days)</Label>
                  <Input
                    type="number"
                    placeholder="Empty = Permanent"
                    value={formData.duration_days || ""}
                    onChange={(e) => setFormData({ ...formData, duration_days: e.target.value ? parseInt(e.target.value) : null })}
                    className={adminInputStyles}
                  />
                </div>

                <div>
                  <Label className="text-white/80">Min Level</Label>
                  <Input
                    type="number"
                    value={formData.min_level}
                    onChange={(e) => setFormData({ ...formData, min_level: parseInt(e.target.value) || 0 })}
                    className={adminInputStyles}
                  />
                </div>

                <div>
                  <Label className="text-white/80">Display Order</Label>
                  <Input
                    type="number"
                    value={formData.display_order}
                    onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                    className={adminInputStyles}
                  />
                </div>

                {/* Preview Image Upload */}
                <div className="col-span-2">
                  <Label className="text-white/80 flex items-center gap-2">
                    <Image className="h-4 w-4 text-blue-400" />
                    Preview Photo (Optional)
                  </Label>
                  
                  {formData.preview_url ? (
                    <div className="mt-2 relative inline-block">
                      <img
                        src={formData.preview_url}
                        alt="Preview"
                        className="w-24 h-24 rounded-lg object-cover border border-white/20"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, preview_url: "" })}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div
                      className="mt-2 border-2 border-dashed border-white/20 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400/50 transition-colors"
                      onClick={() => previewInputRef.current?.click()}
                    >
                      {uploadingPreview ? (
                        <p className="text-white/60 text-sm">Uploading preview...</p>
                      ) : (
                        <>
                          <Upload className="h-5 w-5 mx-auto text-white/40 mb-1" />
                          <p className="text-white/60 text-sm">Upload Preview Photo</p>
                          <p className="text-white/40 text-xs">PNG, JPG, GIF, WebP (max 20MB)</p>
                        </>
                      )}
                    </div>
                  )}
                  <input
                    ref={previewInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={handlePreviewImageUpload}
                  />
                  {/* Manual URL fallback */}
                  <Input
                    value={formData.preview_url}
                    onChange={(e) => setFormData({ ...formData, preview_url: e.target.value })}
                    className={`${adminInputStyles} mt-2`}
                    placeholder="Or paste preview URL..."
                  />
                </div>

                {/* Toggles */}
                <div className="col-span-2 flex flex-wrap gap-6 pt-2">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.is_active}
                      onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
                    />
                    <Label className="text-white/80">Active</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.is_featured}
                      onCheckedChange={(v) => setFormData({ ...formData, is_featured: v })}
                    />
                    <Label className="text-white/80">Featured</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={formData.is_premium}
                      onCheckedChange={(v) => setFormData({ ...formData, is_premium: v })}
                    />
                    <Label className="text-white/80">Premium</Label>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  className="flex-1 border-white/20 text-white"
                  onClick={() => {
                    setShowAddDialog(false);
                    setEditingItem(null);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button
                  className={`flex-1 ${adminButtonStyles.primary}`}
                  onClick={handleSave}
                >
                  {editingItem ? "Update Item" : "Create Item"}
                </Button>
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Upload Loading Overlay */}
      {uploading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-slate-900 rounded-2xl p-6 flex flex-col items-center gap-4 shadow-2xl border border-white/10">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
             <p className="text-white font-medium">Uploading...</p>
             <Button 
               variant="outline" 
               size="sm"
               onClick={() => setUploading(false)}
               className="mt-2 border-white/20 text-white/70 hover:text-white hover:bg-white/10"
             >
               Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminShop;
