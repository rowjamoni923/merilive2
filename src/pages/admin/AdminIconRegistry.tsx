import React, { useState, useEffect, useCallback, useMemo } from 'react';
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, Trash2, Save, Edit2, Upload, Copy, Check,
  Image, Palette, Eye, Filter, X, Home, Diamond, Gem, Users,
  Phone, Video, Music, Gift, Shield, Star, Heart, Zap,
  Crown, Sparkles, Globe, Wallet, Award, Settings, Bell,
  MessageCircle, Play, Trophy, Clock, Target, Coins,
  ArrowRight, ChevronDown, Package, Layers
} from 'lucide-react';
import { icons as allLucideIcons } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";

interface IconRegistryItem {
  id: string;
  icon_key: string;
  icon_name: string;
  category: string;
  icon_type: string;
  lucide_name: string | null;
  icon_url: string | null;
  animation_url: string | null;
  fallback_emoji: string | null;
  color_hex: string | null;
  description: string | null;
  display_order: number;
  is_active: boolean;
}

const CATEGORIES = [
  { value: 'navigation', label: 'Navigation', icon: Home },
  { value: 'currency', label: 'Currency', icon: Diamond },
  { value: 'feature', label: 'Features', icon: Sparkles },
  { value: 'status', label: 'Status', icon: Shield },
  { value: 'social', label: 'Social', icon: Users },
  { value: 'media', label: 'Media', icon: Play },
  { value: 'commerce', label: 'Commerce', icon: Wallet },
  { value: 'reward', label: 'Rewards', icon: Trophy },
  { value: 'general', label: 'General', icon: Layers },
];

const ICON_TYPES = [
  { value: 'lucide', label: 'Lucide Icon' },
  { value: 'custom', label: 'Custom Image (PNG/SVG)' },
  { value: 'lottie', label: 'Lottie Animation' },
  { value: 'svga', label: 'SVGA Animation' },
];

const POPULAR_LUCIDE_ICONS = [
  'Home', 'Diamond', 'Gem', 'Users', 'Phone', 'Video', 'Music', 'Gift',
  'Shield', 'Star', 'Heart', 'Zap', 'Crown', 'Sparkles', 'Globe', 'Wallet',
  'Award', 'Settings', 'Bell', 'MessageCircle', 'Play', 'Trophy', 'Clock',
  'Target', 'Coins', 'Package', 'Layers', 'Eye', 'Search', 'Filter',
  'Image', 'Palette', 'Upload', 'ArrowRight', 'ChevronDown',
];

const emptyForm = {
  icon_key: '',
  icon_name: '',
  category: 'general',
  icon_type: 'lucide',
  lucide_name: '',
  icon_url: '',
  animation_url: '',
  fallback_emoji: '',
  color_hex: '',
  description: '',
  display_order: 0,
  is_active: true,
};

const AdminIconRegistry = () => {
  const [icons, setIcons] = useState<IconRegistryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showDialog, setShowDialog] = useState(false);
  const [editingIcon, setEditingIcon] = useState<IconRegistryItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [lucideSearch, setLucideSearch] = useState('');

  const fetchIcons = useCallback(async () => {
    const { data, error } = await supabase
      .from('app_icon_registry')
      .select('*')
      .order('category')
      .order('display_order');
    if (!error && data) {
      setIcons(data as IconRegistryItem[]);
    }
    setLoading(false);
  }, []);

  
  useAdminRealtime(['app_icon_registry'], fetchIcons);

  const filteredIcons = useMemo(() => {
    return icons.filter(icon => {
      const matchesSearch = !search ||
        icon.icon_name.toLowerCase().includes(search.toLowerCase()) ||
        icon.icon_key.toLowerCase().includes(search.toLowerCase()) ||
        icon.description?.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = filterCategory === 'all' || icon.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [icons, search, filterCategory]);

  const groupedIcons = useMemo(() => {
    const groups: Record<string, IconRegistryItem[]> = {};
    filteredIcons.forEach(icon => {
      if (!groups[icon.category]) groups[icon.category] = [];
      groups[icon.category].push(icon);
    });
    return groups;
  }, [filteredIcons]);

  const handleAdd = () => {
    setEditingIcon(null);
    setForm(emptyForm);
    setShowDialog(true);
  };

  const handleEdit = (icon: IconRegistryItem) => {
    setEditingIcon(icon);
    setForm({
      icon_key: icon.icon_key,
      icon_name: icon.icon_name,
      category: icon.category,
      icon_type: icon.icon_type,
      lucide_name: icon.lucide_name || '',
      icon_url: icon.icon_url || '',
      animation_url: icon.animation_url || '',
      fallback_emoji: icon.fallback_emoji || '',
      color_hex: icon.color_hex || '',
      description: icon.description || '',
      display_order: icon.display_order,
      is_active: icon.is_active,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!form.icon_key || !form.icon_name) {
      toast.error('Key and Name are required');
      return;
    }
    setSaving(true);
    const payload = {
      icon_key: form.icon_key,
      icon_name: form.icon_name,
      category: form.category,
      icon_type: form.icon_type,
      lucide_name: form.lucide_name || null,
      icon_url: form.icon_url || null,
      animation_url: form.animation_url || null,
      fallback_emoji: form.fallback_emoji || null,
      color_hex: form.color_hex || null,
      description: form.description || null,
      display_order: form.display_order,
      is_active: form.is_active,
      updated_at: new Date().toISOString(),
    };

    if (editingIcon) {
      const { error } = await supabase
        .from('app_icon_registry')
        .update(payload)
        .eq('id', editingIcon.id);
      if (error) toast.error(error.message);
      else toast.success('Icon updated');
    } else {
      const { error } = await supabase
        .from('app_icon_registry')
        .insert(payload);
      if (error) toast.error(error.message);
      else toast.success('Icon added');
    }
    setSaving(false);
    setShowDialog(false);
    fetchIcons();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this icon?')) return;
    await supabase.from('app_icon_registry').delete().eq('id', id);
    toast.success('Deleted');
    fetchIcons();
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    const ext = file.name.split('.').pop();
    const path = `icons/${Date.now()}_${form.icon_key || 'icon'}.${ext}`;
    const { error } = await supabase.storage.from('app-icons').upload(path, file);
    if (error) {
      toast.error('Upload failed: ' + error.message);
      setUploadingFile(false);
      return;
    }
    const { data: urlData } = supabase.storage.from('app-icons').getPublicUrl(path);
    setForm(f => ({ ...f, icon_url: urlData.publicUrl }));
    toast.success('Uploaded!');
    setUploadingFile(false);
  };

  const renderLucideIcon = (name: string | null, size = 20) => {
    if (!name) return null;
    const IconComp = (allLucideIcons as any)[name];
    if (!IconComp) return <span className="text-xs text-muted-foreground">?</span>;
    return <IconComp size={size} />;
  };

  const renderIconPreview = (icon: IconRegistryItem) => {
    if (icon.icon_type === 'lucide' && icon.lucide_name) {
      return (
        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center" style={{ color: icon.color_hex || undefined }}>
          {renderLucideIcon(icon.lucide_name, 22)}
        </div>
      );
    }
    if (icon.icon_url) {
      return (
        <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center overflow-hidden">
          <img src={icon.icon_url} alt={icon.icon_name} className="w-8 h-8 object-contain" onError={(e) => { const t = e.currentTarget; if (t.src.indexOf('/placeholder.svg') === -1) t.src = '/placeholder.svg'; }} />
        </div>
      );
    }
    if (icon.fallback_emoji) {
      return <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center text-xl">{icon.fallback_emoji}</div>;
    }
    return <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center"><Image className="w-5 h-5 text-muted-foreground" /></div>;
  };

  const lucideIconNames = useMemo(() => {
    const names = Object.keys(allLucideIcons).filter(n => n !== 'createLucideIcon' && n !== 'default' && typeof (allLucideIcons as any)[n] === 'function');
    if (!lucideSearch) return POPULAR_LUCIDE_ICONS;
    return names.filter(n => n.toLowerCase().includes(lucideSearch.toLowerCase())).slice(0, 50);
  }, [lucideSearch]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-[hsl(var(--admin-border-light)/0.8)] bg-[linear-gradient(120deg,hsl(var(--admin-card-alt)/0.96),hsl(var(--admin-card)/0.82))] p-6 shadow-[0_24px_50px_-30px_hsl(var(--admin-gold)/0.65)]">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-[hsl(var(--admin-gold)/0.42)] bg-[linear-gradient(135deg,hsl(var(--primary)/0.3),hsl(var(--accent)/0.2))]">
            <Package className="w-7 h-7 text-[hsl(var(--admin-gold))]" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-white">App Icon Registry</h1>
            <p className="text-sm text-white/60">Manage all icons used across the app • Native apps load icons from here</p>
          </div>
          <Badge variant="outline" className="border-[hsl(var(--admin-gold)/0.4)] text-[hsl(var(--admin-gold))]">
            {icons.length} Icons
          </Badge>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search icons..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-slate-900 border-slate-700"
          />
        </div>
        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[160px] bg-slate-900 border-slate-700">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {CATEGORIES.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleAdd} className="gap-2">
          <Plus className="w-4 h-4" /> Add Icon
        </Button>
      </div>

      {/* Icon Grid by Category */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : Object.keys(groupedIcons).length === 0 ? (
        <Card className="bg-slate-900 border-slate-700">
          <CardContent className="p-12 text-center">
            <Package className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <p className="text-white font-medium">No icons found</p>
            <p className="text-sm text-muted-foreground mt-1">Add icons to build your app's icon registry</p>
            <Button onClick={handleAdd} className="mt-4 gap-2"><Plus className="w-4 h-4" /> Add First Icon</Button>
          </CardContent>
        </Card>
      ) : (
        Object.entries(groupedIcons).map(([category, categoryIcons]) => {
          const catConfig = CATEGORIES.find(c => c.value === category);
          const CatIcon = catConfig?.icon || Layers;
          return (
            <div key={category} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <CatIcon className="w-4 h-4 text-[hsl(var(--admin-gold))]" />
                <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                  {catConfig?.label || category}
                </h2>
                <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">{categoryIcons.length}</Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                <AnimatePresence mode="popLayout">
                  {categoryIcons.map(icon => (
                    <motion.div
                      key={icon.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="group relative bg-slate-900 border border-slate-700 rounded-xl p-3 hover:border-[hsl(var(--admin-gold)/0.5)] transition-colors cursor-pointer"
                      onClick={() => handleEdit(icon)}
                    >
                      <div className="flex flex-col items-center gap-2">
                        {renderIconPreview(icon)}
                        <div className="text-center w-full">
                          <p className="text-xs font-medium text-white truncate">{icon.icon_name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">{icon.icon_key}</p>
                        </div>
                      </div>
                      {/* Type badge */}
                      <Badge
                        variant="outline"
                        className="absolute top-1.5 right-1.5 text-[9px] px-1 py-0 border-slate-600 text-slate-400"
                      >
                        {icon.icon_type}
                      </Badge>
                      {/* Copy key button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCopyKey(icon.icon_key); }}
                        className="absolute top-1.5 left-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded bg-slate-800 hover:bg-slate-700"
                      >
                        {copiedKey === icon.icon_key ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                      </button>
                      {!icon.is_active && (
                        <div className="absolute inset-0 bg-black/50 rounded-xl flex items-center justify-center">
                          <Badge variant="destructive" className="text-[10px]">Inactive</Badge>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          );
        })
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg bg-slate-900 border-slate-700 max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white">
              {editingIcon ? 'Edit Icon' : 'Add New Icon'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Preview */}
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-slate-600 flex items-center justify-center" style={{ color: form.color_hex || undefined }}>
                {form.icon_type === 'lucide' && form.lucide_name ? renderLucideIcon(form.lucide_name, 36) :
                 form.icon_url ? <img src={form.icon_url} className="w-14 h-14 object-contain" onError={(e) => { const t = e.currentTarget; if (t.src.indexOf('/placeholder.svg') === -1) t.src = '/placeholder.svg'; }} /> :
                 form.fallback_emoji ? <span className="text-3xl">{form.fallback_emoji}</span> :
                 <Image className="w-8 h-8 text-muted-foreground" />}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-white/70">Icon Key *</Label>
                <Input
                  value={form.icon_key}
                  onChange={e => setForm(f => ({ ...f, icon_key: e.target.value }))}
                  placeholder="nav_home"
                  className="bg-slate-800 border-slate-600"
                  disabled={!!editingIcon}
                />
              </div>
              <div>
                <Label className="text-white/70">Display Name *</Label>
                <Input
                  value={form.icon_name}
                  onChange={e => setForm(f => ({ ...f, icon_name: e.target.value }))}
                  placeholder="Home"
                  className="bg-slate-800 border-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-white/70">Category</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger className="bg-slate-800 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-white/70">Icon Type</Label>
                <Select value={form.icon_type} onValueChange={v => setForm(f => ({ ...f, icon_type: v }))}>
                  <SelectTrigger className="bg-slate-800 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Lucide icon picker */}
            {form.icon_type === 'lucide' && (
              <div>
                <Label className="text-white/70">Lucide Icon Name</Label>
                <Input
                  value={lucideSearch || form.lucide_name}
                  onChange={e => { setLucideSearch(e.target.value); setForm(f => ({ ...f, lucide_name: e.target.value })); }}
                  placeholder="Search Lucide icons..."
                  className="bg-slate-800 border-slate-600 mb-2"
                />
                <div className="grid grid-cols-6 gap-1.5 max-h-32 overflow-y-auto p-2 bg-slate-800 rounded-lg border border-slate-600">
                  {lucideIconNames.map(name => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => { setForm(f => ({ ...f, lucide_name: name })); setLucideSearch(''); }}
                      className={`p-2 rounded-lg flex items-center justify-center transition-colors ${
                        form.lucide_name === name ? 'bg-primary/20 ring-1 ring-primary' : 'hover:bg-white/5'
                      }`}
                      title={name}
                    >
                      {renderLucideIcon(name, 18)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Custom icon upload */}
            {(form.icon_type === 'custom' || form.icon_type === 'lottie' || form.icon_type === 'svga') && (
              <div>
                <Label className="text-white/70">
                  {form.icon_type === 'custom' ? 'Icon Image (PNG/SVG)' : 'Animation File URL'}
                </Label>
                {form.icon_type === 'custom' ? (
                  <div className="flex gap-2">
                    <Input
                      value={form.icon_url}
                      onChange={e => setForm(f => ({ ...f, icon_url: e.target.value }))}
                      placeholder="https://... or upload"
                      className="bg-slate-800 border-slate-600 flex-1"
                    />
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                      <Button type="button" variant="outline" size="icon" disabled={uploadingFile} asChild>
                        <span><Upload className="w-4 h-4" /></span>
                      </Button>
                    </label>
                  </div>
                ) : (
                  <Input
                    value={form.animation_url}
                    onChange={e => setForm(f => ({ ...f, animation_url: e.target.value }))}
                    placeholder="https://r2.merilive.com/animations/..."
                    className="bg-slate-800 border-slate-600"
                  />
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-white/70">Emoji</Label>
                <Input
                  value={form.fallback_emoji}
                  onChange={e => setForm(f => ({ ...f, fallback_emoji: e.target.value }))}
                  placeholder="💎"
                  className="bg-slate-800 border-slate-600"
                />
              </div>
              <div>
                <Label className="text-white/70">Color</Label>
                <div className="flex gap-1">
                  <Input
                    value={form.color_hex}
                    onChange={e => setForm(f => ({ ...f, color_hex: e.target.value }))}
                    placeholder="#FFD700"
                    className="bg-slate-800 border-slate-600 flex-1"
                  />
                  {form.color_hex && (
                    <div className="w-9 h-9 rounded border border-slate-600" style={{ background: form.color_hex }} />
                  )}
                </div>
              </div>
              <div>
                <Label className="text-white/70">Order</Label>
                <Input
                  type="number"
                  value={form.display_order}
                  onChange={e => setForm(f => ({ ...f, display_order: parseInt(e.target.value) || 0 }))}
                  className="bg-slate-800 border-slate-600"
                />
              </div>
            </div>

            <div>
              <Label className="text-white/70">Description (where is this used?)</Label>
              <Textarea
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Used in bottom nav bar, home page header..."
                className="bg-slate-800 border-slate-600"
                rows={2}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))}
                className="rounded"
              />
              <Label className="text-white/70">Active</Label>
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            {editingIcon && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { handleDelete(editingIcon.id); setShowDialog(false); }}
              >
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            )}
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminIconRegistry;
