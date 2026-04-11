import { useState, useEffect, useRef, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus, Edit2, Trash2, Search, Filter, Eye, EyeOff, Star, Upload, FileVideo, Image as ImageIcon, FileCode, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import UniversalFramePlayer from "@/components/common/UniversalFramePlayer";
import { removeBlackBackground, needsBackgroundRemoval } from "@/utils/removeBlackBackground";

interface Frame {
  id: string;
  name: string;
  frame_url: string;
  frame_type: string | null;
  animation_type: string | null;
  min_level: number;
  is_premium: boolean;
  is_active: boolean;
  display_order: number;
  description: string | null;
  category: string | null;
  price_diamonds: number | null;
  preview_url: string | null;
  created_at: string;
  sound_url: string | null;
  sound_duration_ms: number | null;
  target_type: 'user' | 'host' | 'both' | null;
}

const targetTypeOptions = [
  { value: 'user', label: 'User Only', icon: '👤', color: 'bg-blue-500' },
  { value: 'host', label: 'Host Only', icon: '🎤', color: 'bg-pink-500' },
  { value: 'both', label: 'Both', icon: '👥', color: 'bg-purple-500' },
];

const frameTypeOptions = [
  { value: 'svga', label: 'SVGA Animation', icon: FileVideo, color: 'text-purple-500' },
  { value: 'lottie', label: 'Lottie JSON', icon: FileCode, color: 'text-blue-500' },
  { value: 'gif', label: 'GIF Animation', icon: ImageIcon, color: 'text-green-500' },
  { value: 'webp', label: 'WebP Animation', icon: ImageIcon, color: 'text-amber-500' },
  { value: 'mp4', label: 'MP4 Video', icon: FileVideo, color: 'text-rose-500' },
  { value: 'png', label: 'Static PNG', icon: ImageIcon, color: 'text-gray-500' },
];

const categoryOptions = ['general', 'vip', 'seasonal', 'event', 'special', 'birthday', 'festival'];

const AdminFrames = () => {
  const location = useLocation();
  const [frames, setFrames] = useState<Frame[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingFrame, setEditingFrame] = useState<Frame | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processingBackground, setProcessingBackground] = useState(false);
  const [autoRemoveBlack, setAutoRemoveBlack] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    frame_url: "",
    frame_type: "svga" as string,
    animation_type: "glow",
    min_level: 1,
    is_premium: false,
    is_active: true,
    display_order: 0,
    description: "",
    category: "general",
    price_diamonds: 0,
    preview_url: "",
    sound_url: "",
    sound_duration_ms: 3000,
    target_type: "both" as 'user' | 'host' | 'both',
  });

  const [fullscreenPreviewFrame, setFullscreenPreviewFrame] = useState<Frame | null>(null);
  const soundInputRef = useRef<HTMLInputElement>(null);

  const fetchFrames = useCallback(async (showToast: boolean = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("avatar_frames" as any)
        .select("*")
        .order("min_level", { ascending: true })
        .order("display_order", { ascending: true });

      if (error) {
        toast.error("Failed to load frames");
        console.error(error);
      } else {
        setFrames((data || []) as unknown as Frame[]);
        if (showToast) {
          toast.success(`${(data || []).length} frames loaded`);
        }
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFrames();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useAdminRealtime(['avatar_frames'], fetchFrames);

  // R2 upload for large files
  const uploadToR2 = async (file: File, folder: string): Promise<string> => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-upload`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'R2 upload failed');
    }
    return result.url;
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Detect frame type from file extension
    const fileName = file.name.toLowerCase();
    let detectedType = 'static';
    if (fileName.endsWith('.svga')) detectedType = 'svga';
    else if (fileName.endsWith('.json')) detectedType = 'lottie';
    else if (fileName.endsWith('.gif')) detectedType = 'gif';
    else if (fileName.endsWith('.webp')) detectedType = 'webp';
    else if (fileName.endsWith('.png')) detectedType = 'png';
    else if (fileName.endsWith('.mp4')) detectedType = 'mp4';
    else if (fileName.endsWith('.webm')) detectedType = 'webm';

    setUploading(true);
    try {
      let fileToUpload: File | Blob = file;
      let finalExtension = file.name.split('.').pop();
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);

      // Auto-remove black background for GIF/JPG/PNG/WebP if enabled
      if (autoRemoveBlack && needsBackgroundRemoval(file) && detectedType !== 'svga') {
        setProcessingBackground(true);
        toast.info('🎨 Removing black background...');
        
        try {
          const processedBlob = await removeBlackBackground(file, { 
            blackThreshold: 35,
            preserveEdges: true 
          });
          fileToUpload = processedBlob;
          finalExtension = 'png';
          detectedType = 'png';
          toast.success('✅ Black background removed successfully!');
        } catch (bgError) {
          console.error('Background removal failed:', bgError);
          toast.warning('Background removal failed, uploading original file...');
        } finally {
          setProcessingBackground(false);
        }
      }

      let publicUrl: string;

      // Use R2 for files > 50MB
      if (file.size > 50 * 1024 * 1024) {
        toast.info(`Large file (${fileSizeMB}MB) - uploading to R2...`);
        publicUrl = await uploadToR2(fileToUpload as File, 'frames');
      } else {
        // Upload to Supabase storage
        const uniqueName = `frame_${Date.now()}_${Math.random().toString(36).substring(7)}.${finalExtension}`;
        
        // Determine content type based on file extension
        const extensionToMimeType: Record<string, string> = {
          'svga': 'application/octet-stream',
          'json': 'application/json',
          'png': 'image/png',
          'jpg': 'image/jpeg',
          'jpeg': 'image/jpeg',
          'gif': 'image/gif',
          'webp': 'image/webp',
          'mp4': 'video/mp4',
          'webm': 'video/webm',
        };
        const contentType = extensionToMimeType[finalExtension || ''] || 'application/octet-stream';
        
        const { data, error } = await supabase.storage
          .from('frames')
          .upload(uniqueName, fileToUpload, {
            cacheControl: '3600',
            upsert: false,
            contentType: contentType,
          });

        if (error) throw error;

        const { data: urlData } = supabase.storage
          .from('frames')
          .getPublicUrl(uniqueName);

        publicUrl = urlData.publicUrl;
      }

      setFormData({
        ...formData,
        frame_url: publicUrl,
        frame_type: detectedType,
      });

      toast.success(`${detectedType.toUpperCase()} file uploaded successfully!`);
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || "Failed to upload file");
    } finally {
      setUploading(false);
      setProcessingBackground(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.frame_url) {
      toast.error("Frame Name and Frame URL are required!");
      return;
    }
    
    try {
      const saveData = {
        name: formData.name,
        frame_url: formData.frame_url,
        frame_type: formData.frame_type,
        animation_type: formData.animation_type,
        min_level: formData.min_level,
        is_premium: formData.is_premium,
        is_active: formData.is_active,
        display_order: formData.display_order,
        description: formData.description || null,
        category: formData.category,
        price_diamonds: formData.price_diamonds,
        preview_url: formData.preview_url || null,
        target_type: formData.target_type,
        updated_at: new Date().toISOString(),
      };

      if (editingFrame) {
        const { error } = await supabase
          .from("avatar_frames")
          .update(saveData)
          .eq("id", editingFrame.id);
          
        if (error) {
          console.error('Update error:', error);
          toast.error(`Update failed: ${error.message}`);
          return;
        }
        toast.success("Frame updated!");
      } else {
        const { error } = await supabase
          .from("avatar_frames")
          .insert({
            ...saveData,
            created_at: new Date().toISOString(),
          });
          
        if (error) {
          console.error('Insert error:', error);
          toast.error(`Insert failed: ${error.message}`);
          return;
        }
        toast.success("New frame added!");
      }
      setShowAddDialog(false);
      setEditingFrame(null);
      resetForm();
      fetchFrames();
    } catch (error: any) {
      console.error('Save error:', error);
      toast.error(`Error: ${error.message}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this frame? Users using this frame will have it removed.")) return;
    
    try {
      // STEP 1: Use security definer function to clear all frame references
      // This bypasses RLS and clears frame_id/equipped_frame_id from all profiles
      const { error: clearError } = await supabase.rpc('admin_clear_frame_references', {
        frame_id_to_clear: id
      });
      
      if (clearError) {
        console.error('Clear frame references error:', clearError);
        toast.error(`Failed to clear frame references: ${clearError.message}`);
        return;
      }
      
      // STEP 2: Now safely delete the frame
      const { error } = await supabase
        .from("avatar_frames")
        .delete()
        .eq("id", id);
        
      if (error) {
        console.error('Delete error:', error);
        toast.error(`Delete failed: ${error.message}`);
        return;
      }
      toast.success("Frame deleted! User frames have been removed.");
      fetchFrames();
    } catch (error: any) {
      console.error('Delete error:', error);
      toast.error(`Delete error: ${error.message}`);
    }
  };

  const toggleActive = async (frame: Frame) => {
    try {
      const { error } = await supabase
        .from("avatar_frames")
        .update({ is_active: !frame.is_active, updated_at: new Date().toISOString() })
        .eq("id", frame.id);
        
      if (error) {
        console.error('Toggle error:', error);
        toast.error(`Status change failed: ${error.message}`);
        return;
      }
      fetchFrames();
    } catch (error: any) {
      console.error('Toggle error:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      frame_url: "",
      frame_type: "svga",
      animation_type: "glow",
      min_level: 1,
      is_premium: false,
      is_active: true,
      display_order: 0,
      description: "",
      category: "general",
      price_diamonds: 0,
      preview_url: "",
      sound_url: "",
      sound_duration_ms: 3000,
      target_type: "both",
    });
  };

  const openEditDialog = (frame: Frame) => {
    setEditingFrame(frame);
    setFormData({
      name: frame.name,
      frame_url: frame.frame_url,
      frame_type: frame.frame_type || "svga",
      animation_type: frame.animation_type || "glow",
      min_level: frame.min_level,
      is_premium: frame.is_premium,
      is_active: frame.is_active,
      display_order: frame.display_order,
      description: frame.description || "",
      category: frame.category || "general",
      price_diamonds: frame.price_diamonds || 0,
      preview_url: frame.preview_url || "",
      sound_url: frame.sound_url || "",
      sound_duration_ms: frame.sound_duration_ms || 3000,
      target_type: frame.target_type || "both",
    });
    setShowAddDialog(true);
  };

  const getTargetBadge = (targetType: string | null) => {
    const option = targetTypeOptions.find(o => o.value === targetType) || targetTypeOptions[2];
    return option;
  };

  const filteredFrames = frames.filter((frame) => {
    const matchesSearch = frame.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel = levelFilter === "all" || frame.min_level === parseInt(levelFilter);
    const matchesType = typeFilter === "all" || frame.frame_type === typeFilter;
    return matchesSearch && matchesLevel && matchesType;
  });

  const getTypeIcon = (type: string | null) => {
    const option = frameTypeOptions.find(o => o.value === type);
    if (!option) return ImageIcon;
    return option.icon;
  };

  const getTypeColor = (type: string | null) => {
    const option = frameTypeOptions.find(o => o.value === type);
    return option?.color || 'text-gray-500';
  };

  const levelGroups = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Avatar Frames
          </h1>
          <p className="text-muted-foreground">Manage SVGA, Lottie, GIF animated profile frames</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchFrames(true)}
            disabled={loading}
            className="gap-2"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh
          </Button>
          <Button
            onClick={() => {
              resetForm();
              setEditingFrame(null);
              setShowAddDialog(true);
            }}
            className="gap-2 bg-gradient-to-r from-purple-500 to-pink-500"
          >
            <Plus className="w-4 h-4" />
            Add Frame
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-purple-200 dark:border-purple-800">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-purple-600">{frames.length}</p>
            <p className="text-sm text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-900/20 dark:to-purple-900/20 border-violet-200 dark:border-violet-800">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-violet-600">{frames.filter(f => f.frame_type === 'svga').length}</p>
            <p className="text-sm text-muted-foreground">SVGA</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-blue-600">{frames.filter(f => f.frame_type === 'lottie').length}</p>
            <p className="text-sm text-muted-foreground">Lottie</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-green-600">{frames.filter(f => f.frame_type === 'gif').length}</p>
            <p className="text-sm text-muted-foreground">GIF</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-amber-200 dark:border-amber-800">
          <CardContent className="p-4">
            <p className="text-2xl font-bold text-amber-600">{frames.filter(f => f.is_premium).length}</p>
            <p className="text-sm text-muted-foreground">Premium</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search frames..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Frame Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {frameTypeOptions.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="w-40">
            <Filter className="w-4 h-4 mr-2" />
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            {levelGroups.map((level) => (
              <SelectItem key={level} value={level.toString()}>
                Level {level}+
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Frames Grid */}
      <ScrollArea className="h-[calc(100vh-400px)]">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pb-4">
          {filteredFrames.map((frame) => {
            const TypeIcon = getTypeIcon(frame.frame_type);
            return (
              <motion.div
                key={frame.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                whileHover={{ scale: 1.05 }}
                className={`relative bg-white dark:bg-slate-800 rounded-xl border-2 overflow-hidden shadow-sm hover:shadow-lg transition-all ${
                  frame.is_active ? "border-green-200 dark:border-green-800" : "border-gray-200 dark:border-gray-700 opacity-60"
                }`}
              >
                {/* Frame Preview - Show preview_url as static thumbnail */}
                <div className="relative aspect-square bg-gradient-to-br from-gray-900 to-black flex items-center justify-center overflow-hidden">
                  {frame.preview_url ? (
                    <img src={frame.preview_url} alt={frame.name} className="w-full h-full object-contain" />
                  ) : (
                    <div className="relative w-20 h-20">
                      <Avatar className="w-full h-full border-2 border-white shadow-lg absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-5">
                        <AvatarImage src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200" />
                        <AvatarFallback>U</AvatarFallback>
                      </Avatar>
                      <div className="absolute -inset-4 w-[calc(100%+32px)] h-[calc(100%+32px)] z-20">
                        <UniversalFramePlayer
                          src={frame.frame_url}
                          type={frame.frame_type as any}
                          className="w-full h-full"
                          loop={true}
                          autoPlay={true}
                        />
                      </div>
                    </div>
                  )}
                  
                  {/* Type Badge */}
                  <Badge className={`absolute top-2 left-2 bg-black/60 backdrop-blur-sm ${getTypeColor(frame.frame_type)}`}>
                    <TypeIcon className="w-3 h-3 mr-1" />
                    {frame.frame_type?.toUpperCase() || 'STATIC'}
                  </Badge>
                  
                  {/* Level Badge */}
                  <Badge className="absolute bottom-2 left-2 bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-semibold text-xs shadow-md">
                    Lv{frame.min_level}+
                  </Badge>
                  
                  {/* Premium Badge */}
                  {frame.is_premium && (
                    <Badge className="absolute top-2 right-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs">
                      <Star className="w-3 h-3 mr-1" />
                      VIP
                    </Badge>
                  )}
                </div>

                {/* Info */}
                <div className="p-3 space-y-2">
                  {/* Frame Name - Full Display */}
                  <p className="font-semibold text-sm text-white leading-tight line-clamp-2" title={frame.name}>
                    {frame.name}
                  </p>
                  
                  {/* Level Badge - Prominent Display */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-gradient-to-r from-amber-500 to-orange-500 text-black font-bold text-xs px-2 py-1 shadow-md">
                      ⭐ Level {frame.min_level}+
                    </Badge>
                    {(frame.price_diamonds || 0) > 0 && (
                      <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 text-white font-bold text-xs shadow-md">
                        💎 {frame.price_diamonds?.toLocaleString()}
                      </Badge>
                    )}
                  </div>
                  
                  {/* Category & Target Type Row */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 capitalize">{frame.category}</span>
                    <Badge className={`${getTargetBadge(frame.target_type).color} text-white text-[10px] px-1.5 py-0.5`}>
                      {getTargetBadge(frame.target_type).icon} {getTargetBadge(frame.target_type).value === 'user' ? 'User' : getTargetBadge(frame.target_type).value === 'host' ? 'Host' : 'All'}
                    </Badge>
                  </div>
                </div>

                {/* Actions */}
                <div className="absolute bottom-14 right-2 flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 bg-white/80 dark:bg-black/50 backdrop-blur-sm"
                    onClick={() => setFullscreenPreviewFrame(frame)}
                    title="Preview Animation"
                  >
                    <Eye className="w-4 h-4 text-cyan-500" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 bg-white/80 dark:bg-black/50 backdrop-blur-sm"
                    onClick={() => toggleActive(frame)}
                    title={frame.is_active ? "Deactivate" : "Activate"}
                  >
                    {frame.is_active ? (
                      <Eye className="w-4 h-4 text-green-500" />
                    ) : (
                      <EyeOff className="w-4 h-4 text-gray-400" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 bg-white/80 dark:bg-black/50 backdrop-blur-sm"
                    onClick={() => openEditDialog(frame)}
                  >
                    <Edit2 className="w-4 h-4 text-blue-500" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 bg-white/80 dark:bg-black/50 backdrop-blur-sm"
                    onClick={() => handleDelete(frame.id)}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </ScrollArea>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-0">
          <DialogHeader className="p-4 md:p-6 pb-0 flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <FileVideo className="w-5 h-5 text-purple-500" />
              {editingFrame ? "Edit Frame" : "Add New Frame"}
            </DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="flex-1 px-4 md:px-6 overflow-y-auto">
          <div className="space-y-4 py-4">
            {/* File Upload - Primary Upload Area */}
            <div className="border-2 border-dashed border-purple-400 rounded-xl p-4 bg-purple-50/50 dark:bg-purple-900/20">
              <input
                ref={fileInputRef}
                type="file"
                accept=".svga,.json,.gif,.webp,.png,.mp4,.webm"
                onChange={handleFileUpload}
                className="hidden"
              />
              
              {formData.frame_url ? (
                <div className="flex items-center gap-4">
                  {/* Preview */}
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900 dark:to-pink-900 flex items-center justify-center shadow-lg">
                    {/* Avatar - Behind */}
                    <Avatar className="w-12 h-12 z-10">
                      <AvatarFallback className="bg-gradient-to-br from-pink-400 to-purple-500 text-white">U</AvatarFallback>
                    </Avatar>
                    {/* Frame - In front */}
                    <div className="absolute inset-0 z-20 pointer-events-none">
                      <UniversalFramePlayer
                        src={formData.frame_url}
                        type={formData.frame_type as any}
                        className="w-full h-full"
                        loop={true}
                        autoPlay={true}
                      />
                    </div>
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-purple-700 dark:text-purple-300 flex items-center gap-2">
                      ✅ Frame Uploaded!
                    </p>
                    <p className="text-xs text-purple-600 dark:text-purple-400 truncate mt-1">
                      {formData.frame_url.split('/').pop()}
                    </p>
                    <Badge className="mt-2 bg-purple-600">
                      {formData.frame_type?.toUpperCase()}
                    </Badge>
                  </div>
                  
                  <Button
                    size="icon"
                    variant="destructive"
                    className="shrink-0"
                    onClick={() => setFormData({ ...formData, frame_url: "", frame_type: "svga" })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full h-24 border-2 border-purple-400 border-dashed bg-white dark:bg-gray-800 hover:bg-purple-50 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300 flex flex-col items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-8 h-8" />
                      <div className="text-center">
                        <p className="text-sm font-semibold">Click to Upload Frame</p>
                        <p className="text-xs text-purple-500 mt-1">SVGA, GIF, WebP, PNG, MP4, Lottie JSON</p>
                      </div>
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Auto Remove Black Background Toggle */}
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/30">
              <div className="flex items-center gap-3">
                <Wand2 className="w-5 h-5 text-purple-400" />
                <div>
                  <p className="text-sm font-medium text-white">Auto Background Remove</p>
                  <p className="text-xs text-slate-400">Auto-remove black background from GIF/JPG/PNG</p>
                </div>
              </div>
              <Switch
                checked={autoRemoveBlack}
                onCheckedChange={setAutoRemoveBlack}
                className="data-[state=checked]:bg-purple-500"
              />
            </div>

            {processingBackground && (
              <div className="flex items-center gap-2 p-3 bg-amber-500/20 rounded-lg border border-amber-500/30">
                <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-amber-400">🎨 Removing black background...</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Frame Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Golden Wings"
                />
              </div>

              <div>
                <Label>Frame Type</Label>
                <Select
                  value={formData.frame_type}
                  onValueChange={(v) => setFormData({ ...formData, frame_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {frameTypeOptions.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryOptions.map((cat) => (
                      <SelectItem key={cat} value={cat} className="capitalize">
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Minimum Level</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={formData.min_level}
                  onChange={(e) => setFormData({ ...formData, min_level: parseInt(e.target.value) || 1 })}
                />
              </div>

              <div>
                <Label>Target Type</Label>
                <Select
                  value={formData.target_type}
                  onValueChange={(v) => setFormData({ ...formData, target_type: v as 'user' | 'host' | 'both' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {targetTypeOptions.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        <span className="flex items-center gap-2">
                          <span>{type.icon}</span>
                          <span>{type.label}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label>Price (Diamonds)</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.price_diamonds}
                  onChange={(e) => setFormData({ ...formData, price_diamonds: parseInt(e.target.value) || 0 })}
                />
              </div>

              <div className="col-span-2">
                <Label>Description (Optional)</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="A beautiful animated frame..."
                  rows={2}
                />
              </div>
            </div>

            {/* Preview */}
            {formData.frame_url && (
              <div className="flex justify-center p-6 bg-gradient-to-br from-gray-900 to-black rounded-xl">
                <div className="relative w-28 h-28">
                  {/* Avatar - Behind the frame */}
                  <Avatar className="w-full h-full border-2 border-white shadow-lg absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
                    <AvatarImage src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200" />
                    <AvatarFallback>U</AvatarFallback>
                  </Avatar>
                  {/* Frame - In front of avatar */}
                  <div className="absolute -inset-4 w-[calc(100%+32px)] h-[calc(100%+32px)] z-20 pointer-events-none">
                    <UniversalFramePlayer
                      src={formData.frame_url}
                      type={formData.frame_type as any}
                      className="w-full h-full"
                      loop={true}
                      autoPlay={true}
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_premium}
                  onCheckedChange={(v) => setFormData({ ...formData, is_premium: v })}
                />
                <Label>Premium Frame</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
                />
                <Label>Active</Label>
              </div>
            </div>
          </div>
          </ScrollArea>

          <DialogFooter className="p-4 md:p-6 pt-4 flex-shrink-0 border-t">
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-gradient-to-r from-purple-500 to-pink-500">
              {editingFrame ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Loading Overlay */}
      {uploading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-700 font-medium">Uploading...</p>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setUploading(false)}
              className="mt-2 text-slate-500 hover:text-slate-700"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminFrames;
