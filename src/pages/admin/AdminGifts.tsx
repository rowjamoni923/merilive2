import { useState, useEffect, useRef, useCallback } from "react";
import { getAdminCache, setAdminCache } from "@/utils/adminDataCache";
import { useLocation } from "react-router-dom";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion, AnimatePresence } from "framer-motion";
import { SmartImage } from "@/components/ui/smart-image";
import {
  Gift,
  Plus,
  Edit,
  Trash2,
  Search,
  Save,
  Upload,
  Play,
  Sparkles,
  Heart,
  Star,
  Crown,
  Flower2,
  PartyPopper,
  Gem,
  Rocket,
  Music,
  Gamepad2,
  Pizza,
  Car,
  Plane,
  Building,
  Flame,
  Zap,
  Wand2,
  Check,
  Volume2,
  X,
  Eye
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";

import { toast } from "sonner";
import { defaultGiftAnimations, animationCategories, type DefaultAnimation } from "@/data/defaultGiftAnimations";
import Lottie from "lottie-react";
import UniversalFramePlayer from "@/components/common/UniversalFramePlayer";
import FixedAnimationFrame from "@/components/common/FixedAnimationFrame";
import AnimationUploader, { type AnimationFormat } from "@/components/admin/AnimationUploader";
import { isLikelyVapCompositeSize } from "@/utils/vapDetection";

import { recordAdminError } from "@/utils/adminErrorLog";
import { getAdminSessionToken } from "@/utils/adminSession";

import { formatAdminError } from "@/utils/formatAdminError";
interface GiftItem {
  id: string;
  name: string;
  coin_value: number;
  icon_url: string | null;
  animation_type: string | null;
  animation_url: string | null;
  category: string | null;
  display_order: number | null;
  is_active: boolean | null;
  created_at: string | null;
  sound_url: string | null;
  sound_duration_ms: number | null;
  min_level: number | null;
  is_lucky: boolean | null;
}

// Gift categories with icons - English labels
const giftCategories = [
  { id: "all", name: "All Gifts", icon: Gift, color: "from-pink-500 to-purple-500" },
  { id: "wall", name: "Wall", icon: Building, color: "from-slate-500 to-gray-600" },
  { id: "lucky", name: "Lucky", icon: Sparkles, color: "from-yellow-400 to-amber-500" },
  { id: "luxurious", name: "Luxurious", icon: Crown, color: "from-yellow-500 to-amber-500" },
  { id: "vip", name: "VIP", icon: Gem, color: "from-purple-500 to-pink-500" },
  { id: "pro", name: "Pro", icon: Rocket, color: "from-cyan-500 to-blue-500" },
];

const animationTypes = [
  { value: "none", label: "No Animation" },
  { value: "svga", label: "SVGA Animation" },
  { value: "lottie", label: "Lottie Animation" },
  { value: "vap", label: "VAP (Transparent Video)" },
  { value: "float", label: "Float" },
  { value: "burst", label: "Burst" },
  { value: "rain", label: "Rain" },
  { value: "fireworks", label: "Fireworks" },
  { value: "confetti", label: "Confetti" },
  { value: "bounce", label: "Bounce" },
  { value: "sparkle", label: "Sparkle" },
  { value: "fly", label: "Flying" },
  { value: "custom", label: "Custom (GIF/Video)" },
];

const detectUploadedAnimationFormat = async (file: File): Promise<AnimationFormat | null> => {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'svga') return 'svga';
  if (ext === 'pag') return 'pag';
  if (ext === 'json') return 'lottie';
  if (ext === 'gif') return 'gif';
  if (ext === 'webp') return 'webp';
  if (ext === 'png') return 'png';
  if (ext === 'webm') return 'webm';
  if (ext !== 'mp4' && ext !== 'mov' && ext !== 'm4v') return null;

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const done = (format: AnimationFormat) => {
      URL.revokeObjectURL(url);
      resolve(format);
    };
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.onloadeddata = () => {
      // Size-based check — pixel detection may be null on a blank first frame.
      try { done(isLikelyVapCompositeSize(video.videoWidth, video.videoHeight) ? 'vap' : 'mp4'); }
      catch { done('mp4'); }
    };
    video.onerror = () => done('mp4');
    video.src = url;
    video.load();
  });
};

export default function AdminGifts() {
  const location = useLocation();
  const [gifts, setGifts] = useState<GiftItem[]>(() => getAdminCache<GiftItem[]>('admin_gifts') || []);
  const [loading, setLoading] = useState(() => !getAdminCache('admin_gifts'));
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editingGift, setEditingGift] = useState<GiftItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [migratingGiftMedia, setMigratingGiftMedia] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fullscreenPreviewGift, setFullscreenPreviewGift] = useState<GiftItem | null>(null);

  // Lucky gift config state
  interface LuckyRewardTier { id: string; gift_id: string | null; diamond_reward: number; win_chance_percent: number; display_order: number; is_active: boolean; }
  const [luckyConfigs, setLuckyConfigs] = useState<LuckyRewardTier[]>([]);
  const [showLuckyConfig, setShowLuckyConfig] = useState(false);
  const [luckyConfigGiftId, setLuckyConfigGiftId] = useState<string | null>(null);
  
  const iconInputRef = useRef<HTMLInputElement>(null);
  const animationInputRef = useRef<HTMLInputElement>(null);

  // Default animation picker state
  const [showDefaultAnimations, setShowDefaultAnimations] = useState(false);
  const [defaultAnimCategory, setDefaultAnimCategory] = useState('all');
  const [selectedDefaultAnim, setSelectedDefaultAnim] = useState<DefaultAnimation | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    coin_value: 10,
    icon_url: "",
    animation_type: "svga",
    animation_url: "",
    animation_data: null as object | null,
    // Pkg423 — professional animation format support (VAP / SVGA / Lottie / etc.)
    animation_format: null as AnimationFormat | null,
    animation_config_url: "" as string,
    category: "wall",
    display_order: 0,
    is_active: true,
    sound_url: "",
    sound_duration_ms: 3000,
    min_level: 0,
    is_lucky: false,
  });

  const soundInputRef = useRef<HTMLInputElement>(null);

  const fetchGifts = useCallback(async () => {
    try {
      if (gifts.length === 0) setLoading(true);
      // Pkg10: full-list RPC bypasses 500-row REST cap
      const { data, error } = await supabase.rpc('admin_list_gifts_all' as any);

      if (error) throw error;
      const sorted = ((data as any[]) || []).slice().sort((a, b) => {
        const d = (a.display_order ?? 0) - (b.display_order ?? 0);
        if (d !== 0) return d;
        return (a.coin_value ?? 0) - (b.coin_value ?? 0);
      });
      setGifts(sorted as unknown as GiftItem[]);
      setAdminCache('admin_gifts', sorted as unknown as GiftItem[]);
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminGifts.ErrorFetchingGifts", message: formatAdminError(error)});
      toast.error("Failed to load gifts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGifts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Real-time updates
  useAdminRealtime(['gifts', 'gift_categories', 'lucky_gift_config'], fetchGifts, 'admin-gifts-rt');

  // Lucky Gift Config Management
  const fetchLuckyConfigs = useCallback(async (giftId: string) => {
    const { data, error } = await supabase
      .from('lucky_gift_config' as any)
      .select('*')
      .eq('gift_id', giftId)
      .order('display_order');
    if (!error && data) setLuckyConfigs(data as any);
  }, []);

  const saveLuckyTier = async (tier: Partial<LuckyRewardTier>) => {
    if (!luckyConfigGiftId) return;
    try {
      if (tier.id) {
        await supabase.from('lucky_gift_config' as any).update({
          diamond_reward: tier.diamond_reward,
          win_chance_percent: tier.win_chance_percent,
          is_active: tier.is_active,
        }).eq('id', tier.id);
      } else {
        await supabase.from('lucky_gift_config' as any).insert({
          gift_id: luckyConfigGiftId,
          diamond_reward: tier.diamond_reward || 1,
          win_chance_percent: tier.win_chance_percent || 5,
          display_order: luckyConfigs.length,
        });
      }
      toast.success('Lucky tier saved');
      fetchLuckyConfigs(luckyConfigGiftId);
    } catch (e) { toast.error('Failed to save'); }
  };

  const deleteLuckyTier = async (id: string) => {
    await supabase.from('lucky_gift_config' as any).delete().eq('id', id);
    if (luckyConfigGiftId) fetchLuckyConfigs(luckyConfigGiftId);
    toast.success('Tier deleted');
  };

  const openLuckyConfig = (giftId: string) => {
    setLuckyConfigGiftId(giftId);
    fetchLuckyConfigs(giftId);
    setShowLuckyConfig(true);
  };

  // Upload to Cloudflare R2 for large files using proxy multipart upload (avoids CORS issues)
  // R2 requires minimum 5MB per part (except last part) for multipart uploads
  const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB parts - R2 minimum requirement
  const R2_FUNCTION_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/r2-upload`;
  const ADMIN_MIGRATE_GIFT_MEDIA_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-migrate-gift-media`;

  const uploadToR2Multipart = async (file: File, folder: string, onProgress?: (pct: number) => void): Promise<string> => {
    const totalParts = Math.ceil(file.size / CHUNK_SIZE);
    console.log(`[R2 Multipart] Starting upload: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)}MB, ${totalParts} parts)`);
    
    // Step 1: Initialize multipart upload
    const initResponse = await fetch(R2_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': getAdminSessionToken() },
      body: JSON.stringify({
        action: 'init-multipart',
        folder,
        fileName: file.name,
        fileType: file.type || 'application/octet-stream',
        fileSize: file.size,
      }),
    });
    
    const initResult = await initResponse.json();
    if (!initResponse.ok || !initResult.success) {
      throw new Error(initResult.error || 'Failed to initialize upload');
    }
    
    const { uploadId, key } = initResult;
    console.log(`[R2 Multipart] Initialized: uploadId=${uploadId.substring(0, 20)}..., key=${key}`);
    
    const uploadedParts: { PartNumber: number; ETag: string }[] = [];
    
    // Step 2: Upload each part via edge function proxy (avoids CORS)
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);
      
      // Convert chunk to base64 for JSON transport
      const arrayBuffer = await chunk.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64 = btoa(binary);
      
      // Upload part via edge function proxy
      const uploadResponse = await fetch(R2_FUNCTION_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': getAdminSessionToken() },
        body: JSON.stringify({
          action: 'upload-part',
          uploadId,
          key,
          partNumber,
          partData: base64,
        }),
      });
      
      const uploadResult = await uploadResponse.json();
      if (!uploadResponse.ok || !uploadResult.success) {
        throw new Error(uploadResult.error || `Failed to upload part ${partNumber}`);
      }
      
      uploadedParts.push({ PartNumber: partNumber, ETag: uploadResult.etag });
      
      const progress = Math.round((partNumber / totalParts) * 95);
      onProgress?.(progress);
      console.log(`[R2 Multipart] Part ${partNumber}/${totalParts} uploaded (ETag: ${uploadResult.etag})`);
    }
    
    // Step 3: Complete the multipart upload
    console.log('[R2 Multipart] All parts uploaded, completing...');
    onProgress?.(98);
    
    const completeResponse = await fetch(R2_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': getAdminSessionToken() },
      body: JSON.stringify({
        action: 'complete-multipart',
        uploadId,
        key,
        parts: uploadedParts,
      }),
    });
    
    const completeResult = await completeResponse.json();
    if (!completeResponse.ok || !completeResult.success) {
      throw new Error(completeResult.error || 'Failed to complete upload');
    }
    
    onProgress?.(100);
    console.log(`[R2 Multipart] Upload complete: ${completeResult.url}`);
    return completeResult.url;
  };

  const handleUpload = async (file: File, type: 'icon' | 'animation') => {
    if (!file) return;

    // Validate file type - Added SVGA support for both icon and animation
    const allowedIconTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'];
    const allowedAnimationTypes = ['image/gif', 'video/mp4', 'video/webm', 'application/json', 'application/octet-stream'];

    // Also check file extension for SVGA
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const isSVGA = fileExt === 'svga';
    const isLottieFile = fileExt === 'json';

    // For icon uploads, we now also accept SVGA files
    const allowedTypes = type === 'icon' 
      ? [...allowedIconTypes, 'application/octet-stream'] // Include octet-stream for SVGA
      : allowedAnimationTypes;

    if (!allowedTypes.includes(file.type) && !isSVGA && !(type === 'icon' && isLottieFile)) {
      toast.error(`Allowed file types: ${type === 'icon' ? 'PNG, JPG, GIF, WEBP, SVG, SVGA' : 'SVGA, GIF, MP4, WEBM, JSON (Lottie)'}`);
      return;
    }

    // Show file size info
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
    console.log(`[Upload] Starting ${type} upload: ${file.name} (${fileSizeMB}MB)`);
    
    // Validate file size (max 150MB)
    if (file.size > 150 * 1024 * 1024) {
      toast.error("File size must be less than 150MB");
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    
    try {
      let publicUrl: string;
      
      // Use R2 for files > 50MB (Supabase limit), Supabase for smaller files
      const useR2 = file.size > 50 * 1024 * 1024;
      
      if (useR2) {
        // Upload to Cloudflare R2 using S3 multipart upload (bypasses memory limit)
        toast.info(`Large file (${fileSizeMB}MB) - Uploading to R2...`, { duration: 60000 });
        publicUrl = await uploadToR2Multipart(file, 'gifts', (pct) => setUploadProgress(pct));
        console.log('[Upload] R2 multipart upload completed:', publicUrl);
      } else {
        // Upload to Supabase Storage via adminClient (carries x-admin-token for RLS)
        const fileName = `${type}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        setUploadProgress(10);
        const { error: uploadError } = await supabase.storage
          .from('gifts')
          .upload(fileName, file, {
            upsert: true,
            contentType: file.type || 'application/octet-stream',
            cacheControl: '2592000', // 30 days — gift assets are immutable
          });
        setUploadProgress(90);

        if (uploadError) {
          recordAdminError({ kind: "rpc", label: "AdminGifts.UploadStorage", message: formatAdminError(uploadError) });
          throw uploadError;
        }

        const { data: { publicUrl: supabaseUrl } } = supabase.storage
          .from('gifts')
          .getPublicUrl(fileName);

        publicUrl = supabaseUrl;
        setUploadProgress(100);
        console.log('[Upload] Supabase upload completed:', publicUrl);
      }

      if (type === 'icon') {
        // When uploading animation file as icon, auto-clear emoji and set proper icon_url
        // Also auto-set animation_url if it's an SVGA/Lottie file
        if (isSVGA || isLottieFile) {
          const detectedType = isSVGA ? 'svga' : 'lottie';
          setFormData(prev => ({ 
            ...prev, 
            icon_url: publicUrl,
            animation_url: publicUrl,
            animation_type: detectedType
          }));
          toast.success("Animation uploaded as icon! Emoji removed automatically.");
        } else {
          setFormData(prev => ({ ...prev, icon_url: publicUrl }));
          toast.success("Icon uploaded successfully");
        }
      } else {
        // Animation file upload - also update icon_url if it's currently an emoji
        const detectedFormat = await detectUploadedAnimationFormat(file);
        const detectedType = detectedFormat === 'svga' ? 'svga' :
                            detectedFormat === 'lottie' ? 'lottie' :
                            detectedFormat === 'vap' ? 'vap' :
                            detectedFormat === 'mp4' || detectedFormat === 'webm' ? 'custom' :
                            detectedFormat || 'custom';
        
        setFormData(prev => {
          // If icon_url is currently an emoji (not starting with http), auto-replace it with animation
          const isVideoAnimation = fileExt === 'mp4' || fileExt === 'webm';
          const shouldReplaceIcon = !isVideoAnimation && (!prev.icon_url || !prev.icon_url.startsWith('http'));
          return { 
            ...prev, 
            animation_url: publicUrl, 
            animation_type: detectedType,
            animation_format: detectedFormat,
            animation_config_url: detectedFormat === 'vap' ? prev.animation_config_url : '',
            // Auto-set icon_url to animation_url if icon was emoji
            icon_url: shouldReplaceIcon ? publicUrl : prev.icon_url
          };
        });
        
        toast.success(useR2 ? "Animation uploaded to R2!" : "Animation uploaded!");
      }
    } catch (error: any) {
      recordAdminError({ kind: "rpc", label: "AdminGifts.UploadFinalError", message: formatAdminError(error)});
      const errorMessage = error?.message || 'Unknown error';
      toast.error(`Upload failed: ${errorMessage}`);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const migrateLegacyGiftMedia = async () => {
    if (!confirm("Move legacy gift media from private chat-media/gifts into the public gifts bucket?")) return;
    setMigratingGiftMedia(true);
    try {
      const response = await fetch(ADMIN_MIGRATE_GIFT_MEDIA_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": getAdminSessionToken() },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || "Gift media migration failed");
      toast.success(`Gift media migrated: ${result.moved_count || 0} files, ${result.updated_gifts || 0} gifts updated`);
      await fetchGifts();
    } catch (error: any) {
      toast.error(error?.message || "Gift media migration failed");
    } finally {
      setMigratingGiftMedia(false);
    }
  };

  // Sound file upload handler
  const handleSoundUpload = async (file: File) => {
    if (!file) return;

    // Validate audio file type
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/webm'];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Invalid audio type. Please upload MP3, WAV, OGG, or WebM audio files.");
      return;
    }

    // Validate file size (150MB max for audio)
    if (file.size > 150 * 1024 * 1024) {
      toast.error("Audio file too large. Maximum size is 150MB.");
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      const fileName = `gift_sound_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('sounds')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('sounds')
        .getPublicUrl(fileName);

      setFormData(prev => ({
        ...prev,
        sound_url: publicUrl
      }));
      toast.success("Sound file uploaded successfully!");
    } catch (error: any) {
      toast.error(`Sound upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (gift: GiftItem) => {
    setEditingGift(gift);
    setSelectedDefaultAnim(null);
    
    // If animation_url exists and icon_url is emoji, use animation_url as icon for display
    const effectiveIconUrl = (gift.animation_url?.startsWith('http') && !gift.icon_url?.startsWith('http'))
      ? gift.animation_url
      : (gift.icon_url || "");
    
    setFormData({
      name: gift.name,
      coin_value: gift.coin_value,
      icon_url: effectiveIconUrl,
      animation_type: gift.animation_type || "svga",
      animation_url: gift.animation_url || "",
      animation_data: null,
      animation_format: ((gift as any).animation_format as AnimationFormat) || null,
      animation_config_url: (gift as any).animation_config_url || "",
      category: gift.category || "wall",
      display_order: gift.display_order || 0,
      is_active: gift.is_active ?? true,
      sound_url: gift.sound_url || "",
      sound_duration_ms: gift.sound_duration_ms || 3000,
      min_level: (gift as any).min_level || 0,
      is_lucky: (gift as any).is_lucky || false,
    });
    setShowEditDialog(true);
  };

  const handleCreate = () => {
    setEditingGift(null);
    setSelectedDefaultAnim(null);
    setFormData({
      name: "",
      coin_value: 10,
      icon_url: "",
      animation_type: "svga",
      animation_url: "",
      animation_data: null,
      animation_format: null,
      animation_config_url: "",
      category: selectedCategory === "all" ? "wall" : selectedCategory,
      display_order: 0,
      is_active: true,
      sound_url: "",
      sound_duration_ms: 3000,
      min_level: 0,
      is_lucky: selectedCategory === "lucky",
    });
    setShowEditDialog(true);
  };

  const handleSelectDefaultAnimation = (anim: DefaultAnimation) => {
    setSelectedDefaultAnim(anim);
    setFormData(prev => ({
      ...prev,
      icon_url: anim.previewEmoji,
      animation_type: "lottie",
      animation_data: anim.animationData
    }));
    setShowDefaultAnimations(false);
    toast.success(`${anim.name} animation selected`);
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast.error("Please enter a name");
      return;
    }

    setSaving(true);
    try {
      // Refresh session before saving to ensure latest permissions
      await supabase.auth.refreshSession();
      
      const giftData: any = {
        name: formData.name,
        coin_value: formData.coin_value,
        icon_url: formData.icon_url || null,
        animation_type: formData.animation_type,
        animation_url: formData.animation_url || null,
        // Pkg423 — VAP/SVGA/Lottie unified format
        animation_format: formData.animation_format || null,
        animation_config_url: formData.animation_config_url || null,
        category: formData.category,
        display_order: formData.display_order,
        is_active: formData.is_active,
        sound_url: formData.sound_url || null,
        sound_duration_ms: formData.sound_duration_ms || 3000,
        min_level: formData.min_level || 0,
        is_lucky: formData.is_lucky || false,
      };

      if (editingGift) {
        const { error, data } = await supabase
          .from("gifts")
          .update(giftData)
          .eq("id", editingGift.id)
          .select();

        if (error) {
          recordAdminError({ kind: "rpc", label: "AdminGifts.UpdateErrorDetails", message: formatAdminError(error)});
          throw error;
        }
        console.log("Gift updated:", data);
        toast.success("Gift updated successfully");
      } else {
        const { error, data } = await supabase
          .from("gifts")
          .insert(giftData)
          .select();

        if (error) {
          recordAdminError({ kind: "rpc", label: "AdminGifts.InsertErrorDetails", message: formatAdminError(error)});
          throw error;
        }
        console.log("Gift created:", data);
        toast.success("New gift created successfully");
      }

      setShowEditDialog(false);
      fetchGifts();
    } catch (error: any) {
      recordAdminError({ kind: "rpc", label: "AdminGifts.ErrorSavingGift", message: formatAdminError(error)});
      if (error?.message?.includes("row-level security") || error?.code === "42501") {
        toast.error("Permission denied. Please logout and login again.");
      } else {
        toast.error(`Failed to save gift: ${error?.message || 'Unknown error'}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this gift?")) return;

    try {
      const { error } = await supabase
        .from("gifts")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast.success("Gift deleted successfully");
      fetchGifts();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminGifts.ErrorDeletingGift", message: formatAdminError(error)});
      toast.error("Failed to delete gift");
    }
  };

  const toggleActive = async (gift: GiftItem) => {
    try {
      const { error } = await supabase
        .from("gifts")
        .update({ is_active: !gift.is_active })
        .eq("id", gift.id);

      if (error) throw error;
      toast.success(gift.is_active ? "Gift deactivated" : "Gift activated");
      fetchGifts();
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminGifts.ErrorTogglingGift", message: formatAdminError(error)});
    }
  };

  const filteredGifts = gifts.filter(g => {
    const matchesSearch = g.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || g.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryCount = (categoryId: string) => {
    if (categoryId === "all") return gifts.length;
    return gifts.filter(g => g.category === categoryId).length;
  };

  const isVideoOrGif = (url: string | null) => {
    if (!url) return false;
    return url.endsWith('.mp4') || url.endsWith('.webm') || url.endsWith('.gif');
  };

  const isSVGA = (url: string | null) => {
    if (!url) return false;
    return url.toLowerCase().endsWith('.svga');
  };

  const isLottie = (url: string | null) => {
    if (!url) return false;
    return url.toLowerCase().endsWith('.json');
  };

  return (
    <div className="admin-pro-shell space-y-3 md:space-y-6 px-2 md:px-0">
      {/* Header */}
      <div className="flex flex-col gap-2 md:gap-3 p-3 md:p-6 bg-gradient-to-r from-white via-purple-50/50 to-pink-50/50 rounded-xl md:rounded-2xl shadow-lg border border-slate-200/50">
        <div className="flex flex-row items-center justify-between gap-2 md:gap-3">
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-slate-800">
              Gift Management
            </h1>
            <p className="text-slate-600 text-xs md:text-sm">Total {gifts.length} gifts</p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchGifts}
              disabled={loading}
              className="bg-white/50 border-slate-200 text-slate-600 hover:bg-white text-xs md:text-sm"
            >
              <svg className={`w-3 h-3 md:w-4 md:h-4 mr-1 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={migrateLegacyGiftMedia}
              disabled={migratingGiftMedia}
              className="bg-white/50 border-slate-200 text-slate-600 hover:bg-white text-xs md:text-sm"
            >
              <Upload className={`w-3 h-3 md:w-4 md:h-4 mr-1 ${migratingGiftMedia ? 'animate-pulse' : ''}`} />
              <span className="hidden sm:inline">Fix Media</span>
            </Button>
            <Button onClick={handleCreate} size="sm" className="bg-gradient-to-r from-pink-500 to-purple-600 shadow-lg text-xs md:text-sm px-2 md:px-4">
              <Plus className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
              <span className="hidden sm:inline">New Gift</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <Card className="bg-white border-slate-200 shadow-lg">
        <CardContent className="p-2 md:p-4">
          <ScrollArea className="w-full whitespace-nowrap">
            <div className="flex gap-1.5 md:gap-2 pb-2">
              {giftCategories.map((cat) => {
                const Icon = cat.icon;
                const isSelected = selectedCategory === cat.id;
                const count = getCategoryCount(cat.id);
                
                return (
                  <motion.button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    whileTap={{ scale: 0.95 }}
                    className={`flex items-center gap-1 md:gap-2 px-2 md:px-4 py-1.5 md:py-2.5 rounded-lg md:rounded-xl font-medium transition-all whitespace-nowrap text-xs md:text-sm ${
                      isSelected 
                        ? `bg-gradient-to-r ${cat.color} text-white shadow-lg` 
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    <Icon className="w-3 h-3 md:w-4 md:h-4" />
                    <span className="hidden sm:inline">{cat.name}</span>
                    <Badge 
                      variant="secondary" 
                      className={`text-[10px] md:text-xs ${isSelected ? 'bg-white/20 text-slate-900' : 'bg-slate-200 text-slate-600'}`}
                    >
                      {count}
                    </Badge>
                  </motion.button>
                );
              })}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Search */}
      <Card className="bg-white border-slate-200 shadow-lg">
        <CardContent className="p-2 md:p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search gifts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-slate-200 text-slate-800 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Gifts Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <div className="w-10 h-10 border-4 border-pink-500 border-t-transparent rounded-full animate-spin" />
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              setLoading(false);
              fetchGifts();
            }}
            className="text-xs"
          >
            Refresh
          </Button>
        </div>
      ) : filteredGifts.length === 0 ? (
        <Card className="bg-white border-slate-200 shadow-lg">
          <CardContent className="flex flex-col items-center justify-center h-48 md:h-64 text-slate-400">
            <Gift className="w-10 h-10 md:w-12 md:h-12 mb-3 md:mb-4" />
            <p className="text-sm md:text-base">No gifts found</p>
            <Button onClick={handleCreate} variant="outline" className="mt-3 md:mt-4 text-xs md:text-sm">
              <Plus className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
              Add gift to this category
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-4">
          <AnimatePresence mode="popLayout">
            {filteredGifts.map((gift, i) => (
              <motion.div
                key={gift.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: i * 0.02 }}
              >
                <Card className={`bg-white border-slate-200 hover:shadow-xl transition-all overflow-hidden group ${!gift.is_active && "opacity-50"}`}>
                  <CardContent className="p-2 md:p-4 text-center">
                    {/* Gift Icon - Show preview image if exists, otherwise show animation directly */}
                    <div className="relative w-12 h-12 md:w-16 md:h-16 mx-auto mb-2 md:mb-3 rounded-lg md:rounded-xl bg-gradient-to-br from-pink-100 to-purple-100 flex items-center justify-center shadow-md overflow-hidden">
                      {gift.icon_url ? (
                        gift.icon_url.startsWith('http') ? (
                          isSVGA(gift.icon_url) || isLottie(gift.icon_url) ? (
                            <div className="w-full h-full flex items-center justify-center text-pink-500/80">
                              <Play className="w-5 h-5" />
                            </div>
                          ) : (
                            <SmartImage src={gift.icon_url} alt={gift.name} cdnWidth={64} className="w-full h-full object-contain" fallbackSrc="/placeholder.svg" />
                          )
                        ) : (
                          <span className="text-3xl">{gift.icon_url}</span>
                        )
                      ) : gift.animation_url ? (
                        <div className="w-full h-full flex items-center justify-center text-pink-500/80">
                          <Play className="w-5 h-5" />
                        </div>
                      ) : (
                        <Gift className="w-8 h-8 text-pink-500" />
                      )}
                      
                      {/* Animation indicator */}
                      {gift.animation_url && (
                        <div className="absolute top-0 right-0 p-1 bg-purple-500 rounded-bl-lg">
                          <Play className="w-2.5 h-2.5 text-slate-900" />
                        </div>
                      )}
                    </div>

                    {/* Name */}
                    <p className="text-slate-800 font-medium text-xs md:text-sm mb-1 truncate">{gift.name}</p>

                    {/* Category Badge + Lucky/Pro indicators */}
                    <div className="mb-1 md:mb-2 flex flex-wrap gap-1 justify-center">
                      <Badge variant="outline" className="text-[10px] md:text-xs text-purple-600 border-purple-200 px-1 md:px-2">
                        {giftCategories.find(c => c.id === gift.category)?.name || gift.category}
                      </Badge>
                      {(gift as any).is_lucky && (
                        <Badge className="text-[10px] md:text-xs bg-yellow-400 text-black px-1">🎰 Lucky</Badge>
                      )}
                      {(gift as any).min_level > 0 && (
                        <Badge className="text-[10px] md:text-xs bg-cyan-500 text-white px-1">Lv.{(gift as any).min_level}+</Badge>
                      )}
                    </div>

                    {/* Price */}
                    <Badge className="bg-gradient-to-r from-amber-400 to-yellow-500 text-black font-bold border-amber-300 mb-2 md:mb-3 text-[10px] md:text-xs shadow-sm">
                      {gift.coin_value?.toLocaleString()} 💎
                    </Badge>

                    {/* Animation Type - Hide on mobile */}
                    {gift.animation_type && gift.animation_type !== "none" && (
                      <div className="hidden md:flex items-center justify-center gap-1 text-xs text-purple-600 mb-3">
                        <Sparkles className="w-3 h-3" />
                        {animationTypes.find(a => a.value === gift.animation_type)?.label}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-center gap-1 md:gap-2">
                      {gift.animation_url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setFullscreenPreviewGift(gift)}
                          className="w-6 h-6 md:w-8 md:h-8 text-cyan-500 hover:text-cyan-600 hover:bg-cyan-50"
                          title="Preview Animation"
                        >
                          <Eye className="w-3 h-3 md:w-4 md:h-4" />
                        </Button>
                      )}
                      {(gift as any).is_lucky && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openLuckyConfig(gift.id)}
                          className="w-6 h-6 md:w-8 md:h-8 text-yellow-500 hover:text-yellow-600 hover:bg-yellow-50"
                          title="Lucky Gift Config"
                        >
                          <Sparkles className="w-3 h-3 md:w-4 md:h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleEdit(gift)}
                        className="w-6 h-6 md:w-8 md:h-8 text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                      >
                        <Edit className="w-3 h-3 md:w-4 md:h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleActive(gift)}
                        className={`w-6 h-6 md:w-8 md:h-8 ${gift.is_active ? "text-green-500" : "text-slate-400"}`}
                      >
                        <div className={`w-1.5 h-1.5 md:w-2 md:h-2 rounded-full ${gift.is_active ? "bg-green-500" : "bg-slate-400"}`} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(gift.id)}
                        className="w-6 h-6 md:w-8 md:h-8 text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Hidden file inputs */}
      {/* Icon: STATIC images only (SVG / PNG / JPG / GIF / WebP) */}
      <input
        ref={iconInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml,.svg,.png,.jpg,.jpeg,.gif,.webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file, 'icon');
        }}
      />
      {/* Legacy animation input — kept for back-compat; UI now uses <AnimationUploader/> exclusively */}
      <input
        ref={animationInputRef}
        type="file"
        accept=".svga,.gif,.mp4,.webm,.json,.png,.webp,image/gif,video/mp4,video/webm,application/json,application/octet-stream"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file, 'animation');
        }}
      />

      {/* Edit/Create Dialog - Improved scrolling and visibility */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="bg-white border-slate-200 shadow-2xl w-screen sm:w-[95vw] max-w-2xl h-[100dvh] sm:h-[90vh] max-h-[100dvh] sm:max-h-[90vh] rounded-none sm:rounded-lg flex flex-col p-0">
          <DialogHeader className="p-4 md:p-6 pb-2 flex-shrink-0 border-b border-slate-200">
            <DialogTitle className="text-slate-900 text-lg md:text-xl font-bold">
              {editingGift ? "Edit Gift" : "Create New Gift"}
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto overscroll-contain px-4 md:px-6" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div className="space-y-3 md:space-y-4 py-4">
            {/* Category Selection */}
            <div>
              <Label className="text-slate-300 font-medium text-sm md:text-base">Category</Label>
              <ScrollArea className="w-full whitespace-nowrap mt-1.5 md:mt-2">
                <div className="flex gap-1.5 md:gap-2 pb-2">
                  {giftCategories.filter(c => c.id !== 'all').map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = formData.category === cat.id;
                    
                    return (
                      <motion.button
                        key={cat.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, category: cat.id })}
                        whileTap={{ scale: 0.95 }}
                        className={`flex items-center gap-1 md:gap-2 px-2 md:px-3 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-all whitespace-nowrap ${
                          isSelected 
                            ? `bg-gradient-to-r ${cat.color} text-white shadow-md` 
                            : 'bg-slate-50 text-slate-400 hover:bg-slate-700'
                        }`}
                      >
                        <Icon className="w-3 h-3 md:w-3.5 md:h-3.5" />
                        <span>{cat.name}</span>
                      </motion.button>
                    );
                  })}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>

            {/* Name */}
            <div>
              <Label className="text-slate-300 font-medium text-sm md:text-base">Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Gift name"
                className="bg-slate-50 border-slate-200 text-slate-900 mt-1.5 md:mt-2 text-sm"
              />
            </div>

            {/* Coin Value */}
            <div>
              <Label className="text-slate-300 font-medium text-sm md:text-base">Diamond Value</Label>
              <Input
                type="number"
                value={formData.coin_value}
                onChange={(e) => setFormData({ ...formData, coin_value: parseInt(e.target.value) || 0 })}
                className="bg-slate-50 border-slate-200 text-slate-900 mt-1.5 md:mt-2 text-sm"
              />
            </div>

            {/* Min Level (for Pro category) */}
            {(formData.category === 'pro' || formData.min_level > 0) && (
              <div>
                <Label className="text-slate-300 font-medium text-sm md:text-base">Minimum Level Required</Label>
                <Input
                  type="number"
                  min={0}
                  value={formData.min_level}
                  onChange={(e) => setFormData({ ...formData, min_level: parseInt(e.target.value) || 0 })}
                  placeholder="0 = No level requirement"
                  className="bg-slate-50 border-slate-200 text-slate-900 mt-1.5 md:mt-2 text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">Users below this level cannot send this gift</p>
              </div>
            )}

            {/* Lucky Gift Toggle */}
            {formData.category === 'lucky' && (
              <div className="flex items-center gap-3 p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
                <Switch
                  checked={formData.is_lucky}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_lucky: checked })}
                />
                <div>
                  <Label className="text-yellow-400 font-medium text-sm">🎰 Lucky Gift (Lottery)</Label>
                  <p className="text-xs text-slate-400 mt-0.5">Sender can win diamonds when sending this gift</p>
                </div>
              </div>
            )}

            {/* ========== SYSTEM 1 — STATIC ICON (SVG / PNG / JPG / GIF / WebP) ========== */}
            <div className="border-2 border-dashed border-pink-500/50 rounded-xl p-3 md:p-4 bg-pink-500/5">
              <Label className="text-pink-400 font-medium text-sm md:text-base flex items-center gap-2 mb-1">
                <Heart className="w-4 h-4" />
                Static Icon (SVG / PNG / JPG / GIF / WebP)
              </Label>
              <p className="text-[11px] text-pink-300/70 mb-3">
                Small thumbnail shown in gift panels & history. Use the Pro Animation section below for VAP / SVGA / Lottie / MP4.
              </p>

              {formData.icon_url ? (
                <div className="p-3 md:p-4 bg-gradient-to-r from-pink-500/10 to-rose-500/10 rounded-xl border border-pink-500/30">
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl overflow-hidden bg-slate-50 shadow-lg flex items-center justify-center">
                      {formData.icon_url.startsWith('http') ? (
                        <SmartImage src={formData.icon_url} alt="Icon" cdnWidth={128} className="w-full h-full object-contain" fallbackSrc="/placeholder.svg" />
                      ) : (
                        <span className="text-4xl md:text-5xl">{formData.icon_url}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-pink-300 flex items-center gap-2">
                        <Check className="w-4 h-4 text-green-500" />
                        {formData.icon_url.startsWith('http') ? 'Image Icon ✓' : 'Emoji Icon ✓'}
                      </p>
                      <p className="text-xs text-pink-400 truncate mt-1">
                        {formData.icon_url.startsWith('http')
                          ? formData.icon_url.split('/').pop()
                          : 'Text Emoji'}
                      </p>
                    </div>
                    <Button
                      size="icon"
                      variant="destructive"
                      className="w-8 h-8"
                      onClick={() => setFormData(prev => ({ ...prev, icon_url: "" }))}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-16 md:h-20 border-2 border-pink-500/50 border-dashed bg-slate-50 hover:bg-slate-700 text-pink-400 flex flex-col items-center justify-center gap-2"
                  onClick={() => iconInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Uploading...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-6 h-6" />
                      <div className="text-center">
                        <p className="text-sm font-semibold">Upload Static Icon</p>
                        <p className="text-xs text-pink-500">SVG, PNG, JPG, GIF, WebP (max 50MB)</p>
                      </div>
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Default Animations Picker */}
            <div>
              <Label className="text-slate-300 font-medium text-sm md:text-base flex items-center gap-1.5 md:gap-2">
                <Wand2 className="w-3.5 h-3.5 md:w-4 md:h-4 text-purple-500" />
                Default Luxury Animation
              </Label>
              <div className="mt-1.5 md:mt-2 space-y-2 md:space-y-3">
                {selectedDefaultAnim ? (
                  <div className="p-2 md:p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg md:rounded-xl border-2 border-purple-500/30">
                    <div className="flex items-center gap-2 md:gap-3">
                      <div className="w-12 h-12 md:w-16 md:h-16 rounded-lg overflow-hidden bg-slate-50 shadow-lg flex items-center justify-center">
                        <Lottie 
                          animationData={selectedDefaultAnim.animationData} 
                          loop 
                          className="w-10 h-10 md:w-14 md:h-14"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs md:text-sm font-bold text-purple-300">{selectedDefaultAnim.name}</p>
                        <Badge className="mt-1 text-[10px] md:text-xs" style={{ backgroundColor: selectedDefaultAnim.previewColor }}>
                          {selectedDefaultAnim.tier}
                        </Badge>
                      </div>
                      <Check className="w-4 h-4 md:w-5 md:h-5 text-green-500" />
                    </div>
                  </div>
                ) : null}
                
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDefaultAnimations(!showDefaultAnimations)}
                  className="w-full bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-purple-500/30 text-purple-300 hover:from-purple-500/20 hover:to-pink-500/20 text-xs md:text-sm"
                >
                  <Sparkles className="w-3 h-3 md:w-4 md:h-4 mr-1.5 md:mr-2" />
                  {showDefaultAnimations ? 'Close' : 'Choose Default Animation'}
                </Button>

                {showDefaultAnimations && (
                  <div className="p-2 md:p-3 bg-slate-50 rounded-lg md:rounded-xl border border-slate-200 space-y-2 md:space-y-3">
                    {/* Category filter */}
                    <div className="flex gap-1 flex-wrap">
                      {animationCategories.map(cat => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setDefaultAnimCategory(cat.id)}
                          className={`px-1.5 md:px-2 py-0.5 md:py-1 text-[10px] md:text-xs rounded-full transition-all ${
                            defaultAnimCategory === cat.id
                              ? 'bg-purple-500 text-white'
                              : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                    
                    {/* Animations grid */}
                    <div className="grid grid-cols-4 md:grid-cols-5 gap-1.5 md:gap-2 max-h-36 md:max-h-48 overflow-y-auto">
                      {defaultGiftAnimations
                        .filter(a => defaultAnimCategory === 'all' || a.category === defaultAnimCategory)
                        .map(anim => (
                          <motion.button
                            key={anim.id}
                            type="button"
                            whileTap={{ scale: 0.9 }}
                            onClick={() => handleSelectDefaultAnimation(anim)}
                            className={`p-1.5 md:p-2 rounded-lg border-2 transition-all flex flex-col items-center ${
                              selectedDefaultAnim?.id === anim.id
                                ? 'border-purple-500 bg-purple-500/10'
                                : 'border-slate-200 bg-slate-50 hover:border-purple-500/50'
                            }`}
                          >
                            <div className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center">
                              <Lottie 
                                animationData={anim.animationData} 
                                loop 
                                className="w-6 h-6 md:w-8 md:h-8"
                              />
                            </div>
                            <span className="text-[8px] md:text-[10px] text-slate-400 mt-0.5 md:mt-1 truncate w-full text-center">
                              {anim.previewEmoji}
                            </span>
                          </motion.button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ========== SYSTEM 2 — PRO ANIMATION (VAP / SVGA / Lottie / PAG / MP4 / WebM / WebP) ========== */}
            {/* Pkg423 — Single professional uploader: auto-detects VAP side-by-side, handles vapc.json, live preview */}
            <AnimationUploader
              label="Pro Animation File (VAP / SVGA / Lottie / PAG / MP4 / WebM)"
              bucket="gifts"
              folder="gifts/pro"
              value={{
                animation_url: formData.animation_url,
                animation_format: formData.animation_format,
                animation_config_url: formData.animation_config_url || null,
              }}
              onChange={(v) =>
                setFormData((prev) => ({
                  ...prev,
                  animation_url: v.animation_url,
                  animation_format: v.animation_format,
                  animation_config_url: v.animation_config_url || "",
                  // Keep legacy animation_type in sync so existing players keep working
                  animation_type:
                    v.animation_format === 'vap'
                      ? 'vap'
                      : v.animation_format === 'lottie'
                      ? 'lottie'
                      : v.animation_format === 'svga'
                      ? 'svga'
                      : v.animation_format === 'mp4' || v.animation_format === 'webm'
                      ? 'custom'
                      : prev.animation_type,
                }))
              }
            />


            {/* Sound Upload Section - Optional for SVGA */}
            <div className={`border-2 border-dashed rounded-xl p-3 md:p-4 ${
              isSVGA(formData.animation_url) 
                ? 'border-green-500/50 bg-green-500/5' 
                : 'border-amber-500/50 bg-amber-500/5'
            }`}>
              <Label className={`font-medium text-sm md:text-base flex items-center gap-2 mb-2 ${
                isSVGA(formData.animation_url) ? 'text-green-400' : 'text-amber-400'
              }`}>
                🔊 Sound Effect {isSVGA(formData.animation_url) ? '(Optional - SVGA has built-in audio)' : '(Required)'}
              </Label>
              
              {/* SVGA Auto Audio Notice */}
              {isSVGA(formData.animation_url) && (
                <div className="mb-3 p-2 bg-green-500/10 rounded-lg border border-green-500/30 text-xs text-green-400 flex items-center gap-2">
                  <Volume2 className="w-4 h-4" />
                  <span>If the SVGA file has embedded audio, it will play automatically! No need to upload separate sound.</span>
                </div>
              )}
              
              {formData.sound_url ? (
                <div className="flex items-center gap-2 md:gap-3 p-2 md:p-3 bg-green-500/10 rounded-lg border border-green-500/30">
                  <audio src={formData.sound_url} controls className="flex-1 h-8 md:h-10" />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="w-7 h-7 md:w-8 md:h-8"
                    onClick={() => setFormData(prev => ({ ...prev, sound_url: "" }))}
                  >
                    <Trash2 className="w-3 h-3 md:w-4 md:h-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12 md:h-14 border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                  onClick={() => soundInputRef.current?.click()}
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <Sparkles className="w-4 h-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      <div className="text-left">
                        <p className="text-sm font-medium">Upload Sound Effect</p>
                        <p className="text-xs text-amber-400">MP3, WAV, OGG (max 100MB)</p>
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
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleSoundUpload(file);
                }}
              />
            </div>

            {/* Display Order */}
            <div>
              <Label className="text-slate-300 font-medium text-sm md:text-base">Display Order</Label>
              <Input
                type="number"
                value={formData.display_order}
                onChange={(e) => setFormData({ ...formData, display_order: parseInt(e.target.value) || 0 })}
                placeholder="0 = show first"
                className="bg-slate-50 border-slate-200 text-slate-900 mt-1.5 md:mt-2 text-sm"
              />
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between p-3 md:p-4 bg-gradient-to-r from-slate-50 to-purple-500/10 rounded-lg md:rounded-xl border border-slate-200">
              <Label className="text-slate-900 font-medium text-sm md:text-base">Active</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          </div>

          <DialogFooter className="p-4 md:p-6 pt-4 flex-shrink-0 border-t border-slate-200">
            <Button
              variant="outline"
              onClick={() => {
                setSaving(false);
                setShowEditDialog(false);
              }}
              className="bg-slate-50 border-slate-200 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            {saving ? (
              <Button 
                variant="outline"
                onClick={() => setSaving(false)}
                className="border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
              >
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            ) : null}
            <Button 
              onClick={handleSave} 
              disabled={saving || uploading} 
              className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Lucky Gift Config Dialog */}
      <Dialog open={showLuckyConfig} onOpenChange={setShowLuckyConfig}>
        <DialogContent className="bg-white border-slate-200 w-screen sm:w-[95vw] max-w-lg h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[90vh] rounded-none sm:rounded-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 flex items-center gap-2">
              🎰 Lucky Gift Lottery Config
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-slate-400 text-sm">Configure diamond reward tiers for this Lucky Gift.</p>
            <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
              <p className="text-yellow-400 text-sm font-medium">
                Total Win Chance: {luckyConfigs.reduce((sum, c) => sum + Number(c.win_chance_percent), 0).toFixed(1)}%
              </p>
              <p className="text-slate-500 text-xs mt-1">Per 100 gifts ≈ {luckyConfigs.reduce((sum, c) => sum + Number(c.win_chance_percent), 0).toFixed(0)} wins</p>
            </div>
            {luckyConfigs.map((tier) => (
              <div key={tier.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg">
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-slate-400 text-xs">💎 Diamonds</Label>
                    <Input type="number" min={1} defaultValue={tier.diamond_reward}
                      onBlur={(e) => saveLuckyTier({ ...tier, diamond_reward: parseInt(e.target.value) || 1 })}
                      className="bg-slate-700 border-slate-200 text-white text-sm h-8" />
                  </div>
                  <div>
                    <Label className="text-slate-400 text-xs">Win %</Label>
                    <Input type="number" min={0.01} max={100} step={0.1} defaultValue={tier.win_chance_percent}
                      onBlur={(e) => saveLuckyTier({ ...tier, win_chance_percent: parseFloat(e.target.value) || 1 })}
                      className="bg-slate-700 border-slate-200 text-white text-sm h-8" />
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="text-red-400 h-8 w-8" onClick={() => deleteLuckyTier(tier.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
            <Button variant="outline" className="w-full border-dashed border-slate-200 text-slate-400"
              onClick={() => saveLuckyTier({ diamond_reward: 1, win_chance_percent: 5 })}>
              <Plus className="w-4 h-4 mr-2" /> Add Reward Tier
            </Button>
            <p className="text-xs text-slate-500">Example: 1💎 at 20%, 5💎 at 5%, 10💎 at 1%</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Loading Overlay - with real progress tracking */}
      {uploading && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white rounded-2xl p-6 flex flex-col items-center gap-4 shadow-2xl min-w-[320px] border border-slate-200">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <Upload className="w-6 h-6 text-purple-400 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <div className="text-center">
              <p className="text-slate-900 font-medium text-lg">Uploading...</p>
              <p className="text-slate-400 text-sm mt-1">
                {uploadProgress > 0 ? `${uploadProgress}% complete` : 'Large files may take some time'}
              </p>
            </div>
            <div className="w-full bg-slate-50 rounded-full h-3 overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-300" 
                style={{ width: uploadProgress > 0 ? `${uploadProgress}%` : '10%' }} 
              />
            </div>
            <p className="text-xs text-slate-500">
              {uploadProgress > 0 ? 'Resumable Upload - Large files supported' : 'Please wait...'}
            </p>
          </div>
        </div>
      )}
      {/* Fullscreen Animation Preview */}
      {fullscreenPreviewGift && (
        <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center" onClick={() => setFullscreenPreviewGift(null)}>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setFullscreenPreviewGift(null)}
            className="absolute top-4 right-4 text-slate-900 z-10 bg-white/10 hover:bg-white/20 rounded-full"
          >
            <X className="w-6 h-6" />
          </Button>
          <div className="text-center" onClick={e => e.stopPropagation()}>
            <p className="text-slate-900 font-bold text-lg mb-4">{fullscreenPreviewGift.name}</p>
            <div className="w-[80vw] h-[60vh] max-w-[500px] max-h-[500px] flex items-center justify-center mx-auto">
              {(() => {
                const url = fullscreenPreviewGift.animation_url;
                if (!url) return <p className="text-slate-500">No animation file</p>;
                const fmt = ((fullscreenPreviewGift as any).animation_format || '').toLowerCase();
                const configUrl = (fullscreenPreviewGift as any).animation_config_url || undefined;
                if (fmt === 'vap') return <FixedAnimationFrame src={url} type="vap" configSrc={configUrl} size="fill" center={false} loop muted={false} volume={1.0} soundUrl={fullscreenPreviewGift.sound_url} />;
                if (fmt === 'mp4' || fmt === 'webm') return <FixedAnimationFrame src={url} type={fmt} size="fill" center={false} loop muted={false} volume={1.0} soundUrl={fullscreenPreviewGift.sound_url} />;
                if (isSVGA(url)) return <FixedAnimationFrame src={url} type="svga" size="fill" center={false} loop muted={false} volume={1.0} soundUrl={fullscreenPreviewGift.sound_url} />;
                if (isLottie(url)) return <FixedAnimationFrame src={url} type="lottie" size="fill" center={false} loop muted={false} volume={1.0} soundUrl={fullscreenPreviewGift.sound_url} />;
                if (isVideoOrGif(url)) return url.endsWith('.gif') 
                  ? <SmartImage src={url} alt={fullscreenPreviewGift.name} className="w-full h-full object-contain" fallbackSrc="/placeholder.svg" />
                  : <FixedAnimationFrame src={url} type="mp4" size="fill" center={false} loop muted={false} volume={1.0} soundUrl={fullscreenPreviewGift.sound_url} />;
                return <SmartImage src={url} alt={fullscreenPreviewGift.name} className="w-full h-full object-contain" fallbackSrc="/placeholder.svg" />;
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
