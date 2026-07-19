import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { SmartImage } from "@/components/ui/smart-image";
import { Sparkles, Crown, Star, Gift, Car, Image, Headphones, Upload, Pencil, Trash2, RefreshCw, Play, Frame, Sticker, PartyPopper, Users, Award, Eye } from "lucide-react";
import UniversalFramePlayer from "@/components/common/UniversalFramePlayer";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
import AnimationUploader, { type AnimationFormat } from "@/components/admin/AnimationUploader";
import PrivilegeTierManager from "@/components/admin/PrivilegeTierManager";
import { Layers } from "lucide-react";
interface LevelPrivilege {
  id: string;
  privilege_type: string;
  name: string;
  description: string;
  unlock_level: number;
  animation_url: string | null;
  preview_url: string | null;
  icon_name: string;
  icon_bg_color: string;
  icon_color: string;
  icon_url: string | null;
  is_active: boolean;
  display_order: number;
}

interface LevelAnimation {
  id: string;
  level: number;
  animation_url: string;
  animation_type: string;
  preview_url: string | null;
  duration_ms: number;
  is_active: boolean;
  icon_url?: string | null;
  display_name?: string | null;
}

// Category definitions with icons and colors
const PRIVILEGE_CATEGORIES = [
  { 
    type: 'entry_bar', 
    name: 'Entry Bar', 
    description: 'Show a striking bar when entering rooms.',
    icon: Sparkles, 
    bgColor: '#FEE2E2', 
    iconColor: '#EF4444' 
  },
  { 
    type: 'portrait_frame', 
    name: 'Portrait Frame', 
    description: 'Show your noble status everywhere.',
    icon: Frame, 
    bgColor: '#FCE7F3', 
    iconColor: '#EC4899' 
  },
  { 
    type: 'privilege_sticker', 
    name: 'Privilege Sticker', 
    description: 'Exclusive stickers for high-level users!',
    icon: Sticker, 
    bgColor: '#FEF3C7', 
    iconColor: '#F59E0B' 
  },
  { 
    type: 'privilege_gift', 
    name: 'Privilege Gift', 
    description: 'Send exclusive luxury gifts!',
    icon: Gift, 
    bgColor: '#DBEAFE', 
    iconColor: '#3B82F6' 
  },
  { 
    type: 'entrance_effect', 
    name: 'Entrance Effect', 
    description: 'Enter rooms with exclusive effects.',
    icon: PartyPopper, 
    bgColor: '#E0E7FF', 
    iconColor: '#6366F1' 
  },
  { 
    type: 'party_background', 
    name: 'Party Room Background', 
    description: 'Make your party room stand out!',
    icon: Image, 
    bgColor: '#D1FAE5', 
    iconColor: '#10B981' 
  },
  { 
    type: 'customer_service', 
    name: 'Exclusive Customer Service', 
    description: 'Exclusive WhatsApp customer support.',
    icon: Headphones, 
    bgColor: '#F3E8FF', 
    iconColor: '#9333EA' 
  },
  { 
    type: 'medal_display', 
    name: 'Medal Display', 
    description: 'Display your earned medals.',
    icon: Award, 
    bgColor: '#FFF7ED', 
    iconColor: '#EA580C' 
  },
];

const iconMap: Record<string, React.ElementType> = {
  Sparkles, Crown, Star, Gift, Car, Image, Headphones, Frame, Sticker, PartyPopper, Users, Award
};

const AdminLevelPrivileges = () => {
  const [privileges, setPrivileges] = useState<LevelPrivilege[]>([]);
  const [animations, setAnimations] = useState<LevelAnimation[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const [editingPrivilege, setEditingPrivilege] = useState<LevelPrivilege | null>(null);
  const [editingAnimation, setEditingAnimation] = useState<LevelAnimation | null>(null);
  const [isPrivilegeDialogOpen, setIsPrivilegeDialogOpen] = useState(false);
  const [isAnimationDialogOpen, setIsAnimationDialogOpen] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [previewAnimation, setPreviewAnimation] = useState<string | null>(null);
  const [tierManagerCategory, setTierManagerCategory] = useState<typeof PRIVILEGE_CATEGORIES[number] | null>(null);

  useAdminRealtime(['level_privileges'], () => fetchData());

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const [privilegesRes, animationsRes] = await Promise.all([
        supabase
          .from('level_privileges')
          .select('*')
          .order('display_order'),
        supabase
          .from('level_animations')
          .select('*')
          .order('level')
      ]);

      if (privilegesRes.data) setPrivileges(privilegesRes.data);
      if (animationsRes.data) setAnimations(animationsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
      recordAdminError({ kind: "rpc", label: "AdminLevelPrivileges.fetchData", message: formatAdminError(error) });
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (file: File, type: 'animation' | 'preview'): Promise<string | null> => {
    try {
      setUploadingFile(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${type}_${Date.now()}.${fileExt}`;
      const filePath = `${type}s/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('level-assets')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('level-assets')
        .getPublicUrl(filePath);

      toast.success('File uploaded successfully');
      return publicUrl;
    } catch (error) {
      console.error('Upload error:', error);
      recordAdminError({ kind: "rpc", label: "AdminLevelPrivileges.filePath", message: formatAdminError(error) });
      toast.error('Failed to upload file');
      return null;
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSavePrivilege = async () => {
    if (!editingPrivilege) return;

    setSaving(true);
    try {
      // For new privileges, remove the empty id so Supabase can generate one
      const dataToSave = { ...editingPrivilege };
      
      if (!dataToSave.id || dataToSave.id === '') {
        // This is a new privilege - let Supabase generate the ID
        const { id, ...insertData } = dataToSave;
        const { error } = await supabase
          .from('level_privileges')
          .insert({
            ...insertData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });

        if (error) throw error;
      } else {
        // This is an update
        const { error } = await supabase
          .from('level_privileges')
          .update({
            ...dataToSave,
            updated_at: new Date().toISOString()
          })
          .eq('id', dataToSave.id);

        if (error) throw error;
      }

      toast.success('Privilege saved successfully');
      setIsPrivilegeDialogOpen(false);
      setEditingPrivilege(null);
      fetchData();
    } catch (error) {
      console.error('Error saving privilege:', error);
      recordAdminError({ kind: "rpc", label: "AdminLevelPrivileges.dataToSave", message: formatAdminError(error) });
      toast.error('Failed to save: ' + (error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAnimation = async () => {
    if (!editingAnimation) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('level_animations')
        .upsert({
          ...editingAnimation,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      toast.success('Animation saved successfully');
      setIsAnimationDialogOpen(false);
      setEditingAnimation(null);
      fetchData();
    } catch (error) {
      console.error('Error saving animation:', error);
      recordAdminError({ kind: "rpc", label: "AdminLevelPrivileges.handleSaveAnimation", message: formatAdminError(error) });
      toast.error('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePrivilege = async (id: string) => {
    if (!confirm('Are you sure you want to delete this privilege?')) return;

    try {
      const { error } = await supabase
        .from('level_privileges')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Privilege deleted successfully');
      fetchData();
    } catch (error) {
      console.error('Error deleting privilege:', error);
      recordAdminError({ kind: "rpc", label: "AdminLevelPrivileges.handleDeletePrivilege", message: formatAdminError(error) });
      toast.error('Failed to delete');
    }
  };

  const handleToggleActive = async (table: 'level_privileges' | 'level_animations', id: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from(table)
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      toast.success(isActive ? 'Activated' : 'Deactivated');
      fetchData();
    } catch (error) {
      console.error('Error toggling active:', error);
      recordAdminError({ kind: "rpc", label: "AdminLevelPrivileges.handleToggleActive", message: formatAdminError(error) });
      toast.error('Failed to update');
    }
  };

  const getPrivilegesByCategory = (categoryType: string) => {
    return privileges.filter(p => p.privilege_type === categoryType);
  };

  const getAnimationByLevel = (level: number) => {
    return animations.find(a => a.level === level);
  };

  const openCategoryEditor = (category: typeof PRIVILEGE_CATEGORIES[0]) => {
    const existingPrivilege = privileges.find(p => p.privilege_type === category.type);
    
    if (existingPrivilege) {
      setEditingPrivilege(existingPrivilege);
    } else {
      setEditingPrivilege({
        id: '',
        privilege_type: category.type,
        name: category.name,
        description: category.description,
        unlock_level: 1,
        animation_url: null,
        preview_url: null,
        icon_name: category.icon.name || 'Star',
        icon_bg_color: category.bgColor,
        icon_color: category.iconColor,
        icon_url: null,
        is_active: true,
        display_order: PRIVILEGE_CATEGORIES.findIndex(c => c.type === category.type) + 1
      });
    }
    setSelectedCategory(category.type);
    setIsPrivilegeDialogOpen(true);
  };

  const openLevelAnimationEditor = (level: number) => {
    const existingAnimation = getAnimationByLevel(level);
    
    if (existingAnimation) {
      setEditingAnimation(existingAnimation);
    } else {
      setEditingAnimation({
        id: '',
        level: level,
        animation_url: '',
        animation_type: 'lottie',
        preview_url: null,
        duration_ms: 3000,
        is_active: true,
        icon_url: null,
        display_name: `Level ${level}`
      });
    }
    setSelectedLevel(level);
    setIsAnimationDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="admin-pro-shell space-y-6">
      <div className="bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-slate-900" />
              Level Privilege Management
            </h1>
            <p className="text-slate-700">Upload animations and manage settings for each category</p>
          </div>
          <Button onClick={fetchData} variant="outline" size="icon" className="border-white/30 text-slate-900 hover:bg-white/20">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Categories Section - Removed tabs, showing only categories */}
      <div className="space-y-4">
          <Card className="bg-white border-slate-200/50 shadow-lg">
            <CardHeader>
              <CardTitle className="text-slate-900">Privilege Categories</CardTitle>
              <CardDescription className="text-slate-400">
                Click on each category to edit name, description and upload animations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {PRIVILEGE_CATEGORIES.map((category) => {
                  const CategoryIcon = category.icon;
                  const existingPrivilege = privileges.find(p => p.privilege_type === category.type);
                  
                  return (
                    <div
                      key={category.type}
                      className="flex items-center gap-4 p-4 bg-slate-50/50 rounded-xl border border-slate-200/50 hover:border-purple-500/50 transition-colors cursor-pointer"
                      onClick={() => openCategoryEditor(category)}
                    >
                      {/* Icon (custom uploaded logo, falls back to lucide) */}
                      <div 
                        className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                        style={{ 
                          backgroundColor: existingPrivilege?.icon_url ? 'transparent' : (existingPrivilege?.icon_bg_color || category.bgColor), 
                          color: existingPrivilege?.icon_color || category.iconColor 
                        }}
                      >
                        {existingPrivilege?.icon_url ? (
                          <SmartImage src={existingPrivilege.icon_url} alt={category.name} className="w-full h-full object-contain" />
                        ) : (
                          <CategoryIcon className="w-7 h-7" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-slate-900 font-semibold">
                          {existingPrivilege?.name || category.name}
                        </h3>
                        <p className="text-slate-400 text-sm truncate">
                          {existingPrivilege?.description || category.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {existingPrivilege?.animation_url && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30">
                              Has Animation
                            </span>
                          )}
                          {existingPrivilege && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                              From Lv{existingPrivilege.unlock_level}
                            </span>
                          )}
                          {existingPrivilege?.is_active ? (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              Active
                            </span>
                          ) : existingPrivilege && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400 border border-slate-500/30">
                              Inactive
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Preview */}
                      {existingPrivilege?.animation_url && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-slate-400 hover:text-purple-400 hover:bg-purple-500/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewAnimation(existingPrivilege.animation_url);
                          }}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Preview
                        </Button>
                      )}

                      {/* Manage Tiers button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0 border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTierManagerCategory(category);
                        }}
                      >
                        <Layers className="w-4 h-4 mr-1" />
                        Manage Tiers
                      </Button>

                      {/* Edit button */}
                      <Button
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                      >
                        <Pencil className="w-4 h-4 mr-1" />
                        Edit
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
      </div>

      {/* Privilege Edit Dialog */}
      <Dialog open={isPrivilegeDialogOpen} onOpenChange={setIsPrivilegeDialogOpen}>
        <DialogContent className="max-w-2xl w-screen sm:w-auto h-[100dvh] sm:h-auto rounded-none sm:rounded-lg max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900">
              {editingPrivilege?.id ? 'Edit Privilege' : 'Create New Privilege'}
            </DialogTitle>
          </DialogHeader>
          
          {editingPrivilege && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-600">Name</Label>
                  <Input
                    value={editingPrivilege.name}
                    onChange={(e) => setEditingPrivilege({
                      ...editingPrivilege,
                      name: e.target.value
                    })}
                    placeholder="Privilege name"
                    className="bg-white/5 border-white/10 text-slate-900"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-600">Unlock Level</Label>
                  <Input
                    type="number"
                    min={1}
                    max={50}
                    value={editingPrivilege.unlock_level}
                    onChange={(e) => setEditingPrivilege({
                      ...editingPrivilege,
                      unlock_level: parseInt(e.target.value) || 1
                    })}
                    className="bg-white/5 border-white/10 text-slate-900"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-600">Description</Label>
                <Textarea
                  value={editingPrivilege.description}
                  onChange={(e) => setEditingPrivilege({
                    ...editingPrivilege,
                    description: e.target.value
                  })}
                  placeholder="Privilege description"
                  className="bg-white/5 border-white/10 text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-600">Icon Background Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={editingPrivilege.icon_bg_color}
                      onChange={(e) => setEditingPrivilege({
                        ...editingPrivilege,
                        icon_bg_color: e.target.value
                      })}
                      className="w-12 h-10 p-1 bg-transparent border-white/10"
                    />
                    <Input
                      value={editingPrivilege.icon_bg_color}
                      onChange={(e) => setEditingPrivilege({
                        ...editingPrivilege,
                        icon_bg_color: e.target.value
                      })}
                      className="bg-white/5 border-white/10 text-slate-900"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-600">Icon Color</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={editingPrivilege.icon_color}
                      onChange={(e) => setEditingPrivilege({
                        ...editingPrivilege,
                        icon_color: e.target.value
                      })}
                      className="w-12 h-10 p-1 bg-transparent border-white/10"
                    />
                    <Input
                      value={editingPrivilege.icon_color}
                      onChange={(e) => setEditingPrivilege({
                        ...editingPrivilege,
                        icon_color: e.target.value
                      })}
                      className="bg-white/5 border-white/10 text-slate-900"
                    />
                  </div>
                </div>
              </div>

              {/* Category Logo / 3D Icon Upload — shown to admin, host & user everywhere */}
              <div className="space-y-2">
                <Label className="text-slate-600">Category Logo (3D / PNG — replaces default icon for everyone)</Label>
                <div className="flex items-center gap-3">
                  <div
                    className="w-16 h-16 rounded-xl border border-white/10 flex items-center justify-center overflow-hidden shrink-0"
                    style={{ backgroundColor: editingPrivilege.icon_url ? 'transparent' : editingPrivilege.icon_bg_color }}
                  >
                    {editingPrivilege.icon_url ? (
                      <SmartImage src={editingPrivilege.icon_url} alt="logo" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-slate-400 text-xs text-center px-1">No Logo</span>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col gap-2">
                    <Input
                      value={editingPrivilege.icon_url || ''}
                      onChange={(e) => setEditingPrivilege({ ...editingPrivilege, icon_url: e.target.value || null })}
                      placeholder="https://… or upload"
                      className="bg-white/5 border-white/10 text-slate-900"
                    />
                    <div className="flex gap-2">
                      <label className="cursor-pointer">
                        <Button variant="outline" asChild disabled={uploadingFile}>
                          <span className="flex items-center">
                            <Upload className="w-4 h-4 mr-2" />
                            Upload Logo
                          </span>
                        </Button>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              const url = await handleFileUpload(file, 'preview');
                              if (url) {
                                setEditingPrivilege({ ...editingPrivilege, icon_url: url });
                              }
                            }
                          }}
                        />
                      </label>
                      {editingPrivilege.icon_url && (
                        <Button
                          variant="ghost"
                          className="text-red-400 hover:text-red-300"
                          onClick={() => setEditingPrivilege({ ...editingPrivilege, icon_url: null })}
                        >
                          <Trash2 className="w-4 h-4 mr-1" /> Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-400">PNG / WebP / SVG recommended (transparent background). Shown to users, hosts & admins identically.</p>
              </div>

              {/* Pkg424 — Unified animation uploader (VAP / SVGA / Lottie / WebP / PNG / GIF / MP4) */}
              <AnimationUploader
                label="Animation (SVGA / VAP / Lottie / WebP / PNG / GIF / MP4)"
                bucket="level-privileges"
                folder="unified"
                value={{
                  animation_url: editingPrivilege.animation_url || '',
                  animation_format: ((editingPrivilege as any).animation_format ?? null) as AnimationFormat | null,
                  animation_config_url: (editingPrivilege as any).animation_config_url || null,
                }}
                onChange={(v) => setEditingPrivilege({
                  ...editingPrivilege,
                  animation_url: v.animation_url || null,
                  animation_format: v.animation_format,
                  animation_config_url: v.animation_config_url || null,
                } as any)}
              />


              {/* Preview Image Upload */}
              <div className="space-y-2">
                <Label className="text-slate-600">Preview Image (Optional)</Label>
                <div className="flex gap-2">
                  <Input
                    value={editingPrivilege.preview_url || ''}
                    onChange={(e) => setEditingPrivilege({
                      ...editingPrivilege,
                      preview_url: e.target.value
                    })}
                    placeholder="URL or upload file"
                    className="bg-white/5 border-white/10 text-slate-900"
                  />
                  <label className="cursor-pointer">
                    <Button variant="outline" asChild disabled={uploadingFile}>
                      <span className="flex items-center">
                        <Upload className="w-4 h-4 mr-2" />
                        Upload
                      </span>
                    </Button>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const url = await handleFileUpload(file, 'preview');
                          if (url) {
                            setEditingPrivilege({
                              ...editingPrivilege,
                              preview_url: url
                            });
                          }
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingPrivilege.is_active}
                    onCheckedChange={(checked) => setEditingPrivilege({
                      ...editingPrivilege,
                      is_active: checked
                    })}
                  />
                  <Label className="text-slate-900">Active</Label>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsPrivilegeDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSavePrivilege}>
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Animation Edit Dialog */}
      <Dialog open={isAnimationDialogOpen} onOpenChange={setIsAnimationDialogOpen}>
        <DialogContent className="max-w-lg w-screen sm:w-auto h-[100dvh] sm:h-auto rounded-none sm:rounded-lg max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900">
              Edit Level {editingAnimation?.level} Animation
            </DialogTitle>
          </DialogHeader>
          
          {editingAnimation && (
            <div className="space-y-4">
              {/* Level Icon/Logo Upload */}
              <div className="space-y-2">
                <Label className="text-slate-600">Level Logo/Icon</Label>
                <div className="flex items-center gap-4">
                  {/* Preview */}
                  <div className="w-20 h-20 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden">
                    {editingAnimation.icon_url ? (
                      <SmartImage 
                        src={editingAnimation.icon_url} 
                        alt={`Level ${editingAnimation.level}`}
                        className="w-full h-full object-contain" fallbackSrc="/placeholder.svg" />
                    ) : (
                      <span className="text-3xl font-bold text-slate-400">
                        {editingAnimation.level}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <Input
                      value={editingAnimation.icon_url || ''}
                      onChange={(e) => setEditingAnimation({
                        ...editingAnimation,
                        icon_url: e.target.value
                      })}
                      placeholder="Logo URL or upload"
                      className="bg-white/5 border-white/10 text-slate-900"
                    />
                    <label className="cursor-pointer inline-block">
                      <Button variant="outline" size="sm" asChild disabled={uploadingFile}>
                        <span className="flex items-center">
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Logo
                        </span>
                      </Button>
                      <input
                        type="file"
                        accept="image/*,.gif,.webp,.png"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const url = await handleFileUpload(file, 'preview');
                            if (url) {
                              setEditingAnimation({
                                ...editingAnimation,
                                icon_url: url
                              });
                            }
                          }
                        }}
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* Display Name */}
              <div className="space-y-2">
                <Label className="text-slate-600">Display Name</Label>
                <Input
                  value={editingAnimation.display_name || ''}
                  onChange={(e) => setEditingAnimation({
                    ...editingAnimation,
                    display_name: e.target.value
                  })}
                  placeholder={`Level ${editingAnimation.level}`}
                  className="bg-white/5 border-white/10 text-slate-900"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-slate-600">Animation Type</Label>
                <select
                  className="w-full h-10 px-3 rounded-md border border-white/10 bg-white/5 text-slate-900"
                  value={editingAnimation.animation_type}
                  onChange={(e) => setEditingAnimation({
                    ...editingAnimation,
                    animation_type: e.target.value
                  })}
                >
                  <option value="lottie">Lottie (JSON)</option>
                  <option value="gif">GIF / WebP</option>
                  <option value="svga">SVGA</option>
                  <option value="video">Video (MP4/WebM)</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-600">Animation File</Label>
                <div className="flex gap-2">
                  <Input
                    value={editingAnimation.animation_url}
                    onChange={(e) => setEditingAnimation({
                      ...editingAnimation,
                      animation_url: e.target.value
                    })}
                    placeholder="URL or upload file"
                    className="bg-white/5 border-white/10 text-slate-900"
                  />
                  <label className="cursor-pointer">
                    <Button variant="outline" asChild disabled={uploadingFile}>
                      <span>
                        <Upload className="w-4 h-4" />
                      </span>
                    </Button>
                    <input
                      type="file"
                      accept=".json,.gif,.webp,.svga,.mp4,.webm,.png"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const url = await handleFileUpload(file, 'animation');
                          if (url) {
                            setEditingAnimation({
                              ...editingAnimation,
                              animation_url: url
                            });
                          }
                        }
                      }}
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-slate-600">Duration (milliseconds)</Label>
                <Input
                  type="number"
                  min={1000}
                  max={10000}
                  step={500}
                  value={editingAnimation.duration_ms}
                  onChange={(e) => setEditingAnimation({
                    ...editingAnimation,
                    duration_ms: parseInt(e.target.value) || 3000
                  })}
                  className="bg-white/5 border-white/10 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingAnimation.is_active}
                    onCheckedChange={(checked) => setEditingAnimation({
                      ...editingAnimation,
                      is_active: checked
                    })}
                  />
                  <Label className="text-slate-900">Active</Label>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setIsAnimationDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveAnimation}>
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Animation Preview Dialog */}
      <Dialog open={!!previewAnimation} onOpenChange={() => setPreviewAnimation(null)}>
        <DialogContent className="max-w-lg w-screen sm:w-auto h-[100dvh] sm:h-auto rounded-none sm:rounded-lg max-h-[100dvh] sm:max-h-[90vh] overflow-y-auto bg-white border-slate-200">
          <DialogHeader>
            <DialogTitle className="text-slate-900">Animation Preview</DialogTitle>
          </DialogHeader>
          <div className="aspect-video bg-black/90 rounded-lg flex items-center justify-center overflow-hidden">
            {previewAnimation && (
              <UniversalFramePlayer
                src={previewAnimation}
                className="w-full h-full"
                loop={true}
                autoPlay={true}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Loading Overlay */}
      {uploadingFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-white bg-white rounded-2xl p-6 flex flex-col items-center gap-4 shadow-2xl">
            <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            <p className="font-medium">Uploading...</p>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setUploadingFile(false)}
              className="mt-2"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Per-Category Tier Manager */}
      {tierManagerCategory && (
        <PrivilegeTierManager
          open={!!tierManagerCategory}
          onOpenChange={(open) => { if (!open) setTierManagerCategory(null); }}
          categoryType={tierManagerCategory.type}
          categoryName={tierManagerCategory.name}
          defaultBgColor={tierManagerCategory.bgColor}
          defaultIconColor={tierManagerCategory.iconColor}
        />
      )}
    </div>
  );
};

export default AdminLevelPrivileges;
