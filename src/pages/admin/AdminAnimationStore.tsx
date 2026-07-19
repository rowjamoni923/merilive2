import React, { useState, useMemo, useEffect } from 'react';
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Crown, Star, Diamond, Flame, Shield, Heart, Zap, Filter, Search, Check, Lock, ChevronDown, Eye, Copy, Download, Save, Plus, Trash2, Settings, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import Lottie from 'lottie-react';
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { 
  premiumAnimations, 
  categoryLabels, 
  tierLabels,
  getAnimationsByCategory,
  getAnimationsByTier,
  PremiumAnimation 
} from '@/data/premiumAnimations';

const tierColors: Record<PremiumAnimation['tier'], string> = {
  bronze: 'from-amber-700 to-amber-900',
  silver: 'from-gray-300 to-gray-500',
  gold: 'from-yellow-400 to-amber-500',
  platinum: 'from-slate-300 to-blue-200',
  diamond: 'from-cyan-300 to-blue-400',
  legendary: 'from-pink-500 to-purple-600'
};

const tierBgColors: Record<PremiumAnimation['tier'], string> = {
  bronze: 'bg-amber-900/20 border-amber-700/50',
  silver: 'bg-gray-500/20 border-gray-400/50',
  gold: 'bg-yellow-500/20 border-yellow-500/50',
  platinum: 'bg-blue-200/20 border-blue-300/50',
  diamond: 'bg-cyan-400/20 border-cyan-400/50',
  legendary: 'bg-purple-500/20 border-purple-500/50'
};

const categoryIcons: Record<PremiumAnimation['category'], React.ReactNode> = {
  entry_bar: <Zap className="w-4 h-4" />,
  portrait_frame: <Crown className="w-4 h-4" />,
  privilege_sticker: <Star className="w-4 h-4" />,
  privilege_gift: <Heart className="w-4 h-4" />,
  entrance_effect: <Sparkles className="w-4 h-4" />,
  party_background: <Diamond className="w-4 h-4" />,
  badge: <Shield className="w-4 h-4" />,
  special_effect: <Flame className="w-4 h-4" />
};

interface LevelAnimationAssignment {
  id: string;
  level: number;
  category: string;
  animation_id: string;
  animation_name: string;
  is_active: boolean;
}

const AdminAnimationStore = () => {
  const [activeView, setActiveView] = useState<'browse' | 'assign'>('browse');
  const [selectedCategory, setSelectedCategory] = useState<PremiumAnimation['category'] | 'all'>('all');
  const [selectedTier, setSelectedTier] = useState<PremiumAnimation['tier'] | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewAnimation, setPreviewAnimation] = useState<PremiumAnimation | null>(null);
  const [selectedAnimations, setSelectedAnimations] = useState<Set<string>>(new Set());
  
  // Assignment state
  const [assignments, setAssignments] = useState<LevelAnimationAssignment[]>([]);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignCategory, setAssignCategory] = useState<string>('entry_bar');
  const [assignLevel, setAssignLevel] = useState<number>(1);
  const [assignAnimationId, setAssignAnimationId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Hidden (admin-deleted) animation IDs
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PremiumAnimation | null>(null);

  const loadHidden = async () => {
    const { data, error } = await supabase
      .from('premium_animations_hidden')
      .select('animation_id');
    if (!error && data) {
      setHiddenIds(new Set(data.map((r: any) => r.animation_id)));
    }
  };

  useEffect(() => { loadHidden(); }, []);

  // Load existing assignments
  useAdminRealtime(['animation_store_items', 'premium_animations_hidden'], () => {
    loadAssignments();
    loadHidden();
  });

  const handleDeleteAnimation = async (animation: PremiumAnimation) => {
    const { error } = await supabase
      .from('premium_animations_hidden')
      .insert({ animation_id: animation.id, reason: 'Admin removed from store' });
    if (error) {
      toast.error('Delete failed: ' + error.message);
      return;
    }
    toast.success(`"${animation.name}" deleted from store`);
    setConfirmDelete(null);
    loadHidden();
  };

  const handleRestoreAnimation = async (id: string) => {
    const { error } = await supabase
      .from('premium_animations_hidden')
      .delete()
      .eq('animation_id', id);
    if (error) {
      toast.error('Restore failed: ' + error.message);
      return;
    }
    toast.success('Animation restored');
    loadHidden();
  };

  const loadAssignments = async () => {
    const { data, error } = await supabase
      .from('level_animations')
      .select('*')
      .order('level', { ascending: true });

    if (!error && data) {
      // Map to our format
      const mapped: LevelAnimationAssignment[] = data.map(item => {
        const animation = premiumAnimations.find(a => a.id === item.animation_url);
        return {
          id: item.id,
          level: item.level,
          category: animation?.category || 'entrance_effect',
          animation_id: item.animation_url,
          animation_name: animation?.name || item.animation_url,
          is_active: item.is_active || false
        };
      });
      setAssignments(mapped);
    }
  };

  const filteredAnimations = useMemo(() => {
    return premiumAnimations.filter(animation => {
      const matchesCategory = selectedCategory === 'all' || animation.category === selectedCategory;
      const matchesTier = selectedTier === 'all' || animation.tier === selectedTier;
      const matchesSearch = animation.name.toLowerCase().includes(searchQuery.toLowerCase());
      const isHidden = hiddenIds.has(animation.id);
      const matchesHidden = showHidden ? isHidden : !isHidden;
      return matchesCategory && matchesTier && matchesSearch && matchesHidden;
    });
  }, [selectedCategory, selectedTier, searchQuery, hiddenIds, showHidden]);

  const animationsByCategory = useMemo(() => {
    const grouped: Record<string, PremiumAnimation[]> = {};
    Object.keys(categoryLabels).forEach(cat => {
      grouped[cat] = premiumAnimations.filter(a => a.category === cat);
    });
    return grouped;
  }, []);

  const stats = useMemo(() => {
    const byCategory: Record<string, number> = {};
    const byTier: Record<string, number> = {};
    
    premiumAnimations.forEach(a => {
      byCategory[a.category] = (byCategory[a.category] || 0) + 1;
      byTier[a.tier] = (byTier[a.tier] || 0) + 1;
    });
    
    return { byCategory, byTier, total: premiumAnimations.length };
  }, []);

  const toggleSelection = (id: string) => {
    const newSelection = new Set(selectedAnimations);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedAnimations(newSelection);
  };

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    toast.success('Animation ID copied!');
  };

  const handleAssignToLevel = async () => {
    if (!assignAnimationId || !assignLevel) {
      toast.error('Please select an animation and level');
      return;
    }

    setSaving(true);
    try {
      const animation = premiumAnimations.find(a => a.id === assignAnimationId);
      
      // Use upsert to handle duplicate key constraint
      // First check if level already exists in database
      const { data: existingInDb } = await supabase
        .from('level_animations')
        .select('id')
        .eq('level', assignLevel)
        .maybeSingle();

      if (existingInDb) {
        // Update existing record for this level
        const { error } = await supabase
          .from('level_animations')
          .update({ 
            animation_url: assignAnimationId,
            animation_type: assignCategory,
            is_active: true
          })
          .eq('level', assignLevel);

        if (error) throw error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('level_animations')
          .insert({
            level: assignLevel,
            animation_url: assignAnimationId,
            animation_type: assignCategory,
            is_active: true
          });

        if (error) throw error;
      }

      toast.success(`Animation "${animation?.name}" assigned to Level ${assignLevel}`);
      setShowAssignModal(false);
      loadAssignments();
    } catch (err: any) {
      toast.error('Error: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAssignment = async (id: string) => {
    const { error } = await supabase
      .from('level_animations')
      .delete()
      .eq('id', id);

    if (!error) {
      toast.success('Assignment removed');
      loadAssignments();
    } else {
      toast.error('Error removing assignment');
    }
  };

  const getAnimationForSelection = (category: string) => {
    return premiumAnimations.filter(a => a.category === category);
  };

  return (
    <div className="admin-pro-shell space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
          <Sparkles className="w-8 h-8 text-primary" />
          Premium Animation Store
        </h1>
        <p className="text-muted-foreground mt-1">
          100 Luxury Animations - Use for Level Privileges
        </p>
      </div>

      {/* View Toggle */}
      <div className="flex gap-2 mb-6">
        <Button 
          variant={activeView === 'browse' ? 'default' : 'outline'}
          onClick={() => setActiveView('browse')}
          className="gap-2"
        >
          <Eye className="w-4 h-4" />
          Browse Animations
        </Button>
        <Button 
          variant={activeView === 'assign' ? 'default' : 'outline'}
          onClick={() => setActiveView('assign')}
          className="gap-2"
        >
          <Settings className="w-4 h-4" />
          Assign to Levels
        </Button>
        <Button
          variant={showHidden ? 'destructive' : 'outline'}
          onClick={() => setShowHidden(v => !v)}
          className="gap-2 ml-auto"
          title="Toggle deleted animations view"
        >
          <Trash2 className="w-4 h-4" />
          {showHidden ? `Showing Deleted (${hiddenIds.size})` : `Deleted (${hiddenIds.size})`}
        </Button>
      </div>

      {activeView === 'browse' ? (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30">
              <CardContent className="p-4">
              <div className="text-3xl font-bold text-primary">{stats.total}</div>
                <div className="text-sm text-muted-foreground">Total Animations</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-yellow-500/20 to-yellow-500/5 border-yellow-500/30">
              <CardContent className="p-4">
                <div className="text-3xl font-bold text-yellow-500">{Object.keys(categoryLabels).length}</div>
                <div className="text-sm text-muted-foreground">Categories</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-purple-500/20 to-purple-500/5 border-purple-500/30">
              <CardContent className="p-4">
                <div className="text-3xl font-bold text-purple-500">{Object.keys(tierLabels).length}</div>
                <div className="text-sm text-muted-foreground">Tiers</div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-green-500/20 to-green-500/5 border-green-500/30">
              <CardContent className="p-4">
                <div className="text-3xl font-bold text-green-500">{assignments.length}</div>
                <div className="text-sm text-muted-foreground">Assigned</div>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-4">
                {/* Search */}
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search animations..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                {/* Category Filter */}
                <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as any)}>
                  <SelectTrigger className="w-full md:w-48">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {Object.entries(categoryLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Tier Filter */}
                <Select value={selectedTier} onValueChange={(v) => setSelectedTier(v as any)}>
                  <SelectTrigger className="w-full md:w-40">
                    <SelectValue placeholder="Tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tiers</SelectItem>
                    {Object.entries(tierLabels).map(([key, label]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Category Tabs */}
          <ScrollArea className="w-full mb-4">
            <div className="flex gap-2 pb-2">
              <Button 
                variant={selectedCategory === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategory('all')}
              >
                All ({stats.total})
              </Button>
              {Object.entries(categoryLabels).map(([key, label]) => (
                <Button 
                  key={key}
                  variant={selectedCategory === key ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedCategory(key as any)}
                  className="gap-2 whitespace-nowrap"
                >
                  {categoryIcons[key as PremiumAnimation['category']]}
                  {label} ({stats.byCategory[key] || 0})
                </Button>
              ))}
            </div>
          </ScrollArea>

          {/* Animation Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            <AnimatePresence mode="popLayout">
              {filteredAnimations.map((animation, index) => (
                <motion.div
                  key={animation.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.02 }}
                  className={`relative rounded-xl border-2 overflow-hidden cursor-pointer transition-all
                    ${tierBgColors[animation.tier]}
                    ${selectedAnimations.has(animation.id) ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''}
                  `}
                  onClick={() => toggleSelection(animation.id)}
                >
                  {/* Selection Indicator */}
                  {selectedAnimations.has(animation.id) && (
                    <div className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                      <Check className="w-4 h-4 text-primary-foreground" />
                    </div>
                  )}

                  {/* Animation Preview */}
                  <div 
                    className="aspect-square p-2 flex items-center justify-center relative overflow-hidden"
                    style={{ 
                      background: `linear-gradient(135deg, ${animation.previewColor}60 0%, ${animation.previewColor}30 50%, ${animation.previewColor}10 100%)`,
                    }}
                  >
                    {/* Animated background glow */}
                    <motion.div 
                      className="absolute inset-0"
                      style={{
                        background: `radial-gradient(circle at center, ${animation.previewColor}80 0%, transparent 60%)`,
                      }}
                      animate={{
                        opacity: [0.3, 0.6, 0.3],
                        scale: [1, 1.1, 1],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    />
                    {/* Animated Shape Icon Fallback with Motion */}
                    <motion.div 
                      className="relative z-10 w-20 h-20 flex items-center justify-center"
                      animate={{
                        rotate: animation.tier === 'legendary' ? [0, 360] : [0, 5, -5, 0],
                        scale: [1, 1.1, 1],
                      }}
                      transition={{
                        duration: animation.tier === 'legendary' ? 4 : 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    >
                      {/* Tier-based animated icon */}
                      {animation.category === 'entry_bar' && <Zap className="w-12 h-12" style={{ color: animation.previewColor, filter: `drop-shadow(0 0 10px ${animation.previewColor})` }} />}
                      {animation.category === 'portrait_frame' && <Crown className="w-12 h-12" style={{ color: animation.previewColor, filter: `drop-shadow(0 0 10px ${animation.previewColor})` }} />}
                      {animation.category === 'privilege_sticker' && <Star className="w-12 h-12" style={{ color: animation.previewColor, filter: `drop-shadow(0 0 10px ${animation.previewColor})` }} />}
                      {animation.category === 'privilege_gift' && <Heart className="w-12 h-12" style={{ color: animation.previewColor, filter: `drop-shadow(0 0 10px ${animation.previewColor})` }} />}
                      {animation.category === 'entrance_effect' && <Sparkles className="w-12 h-12" style={{ color: animation.previewColor, filter: `drop-shadow(0 0 10px ${animation.previewColor})` }} />}
                      {animation.category === 'party_background' && <Diamond className="w-12 h-12" style={{ color: animation.previewColor, filter: `drop-shadow(0 0 10px ${animation.previewColor})` }} />}
                      {animation.category === 'badge' && <Shield className="w-12 h-12" style={{ color: animation.previewColor, filter: `drop-shadow(0 0 10px ${animation.previewColor})` }} />}
                      {animation.category === 'special_effect' && <Flame className="w-12 h-12" style={{ color: animation.previewColor, filter: `drop-shadow(0 0 10px ${animation.previewColor})` }} />}
                    </motion.div>
                    {/* Sparkle particles */}
                    <motion.div
                      className="absolute top-2 right-2 w-3 h-3"
                      animate={{
                        opacity: [0, 1, 0],
                        scale: [0.5, 1.2, 0.5],
                      }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: 0 }}
                    >
                      <Sparkles className="w-full h-full" style={{ color: animation.previewColor }} />
                    </motion.div>
                    <motion.div
                      className="absolute bottom-3 left-3 w-2 h-2"
                      animate={{
                        opacity: [0, 1, 0],
                        scale: [0.5, 1.2, 0.5],
                      }}
                      transition={{ duration: 1.5, repeat: Infinity, delay: 0.5 }}
                    >
                      <Star className="w-full h-full" style={{ color: animation.previewColor }} />
                    </motion.div>
                  </div>

                  {/* Info */}
                  <div className="p-3 bg-background/80 backdrop-blur">
                    <div className="text-xs font-medium text-foreground truncate mb-1">
                      {animation.name}
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <Badge 
                        variant="outline" 
                        className={`text-[10px] bg-gradient-to-r ${tierColors[animation.tier]} text-white border-0`}
                      >
                        {tierLabels[animation.tier]}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">
                        Lv.{animation.unlockLevel}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 mt-2">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-7 px-2 flex-1"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewAnimation(animation);
                        }}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        Preview
                      </Button>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-7 px-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAssignAnimationId(animation.id);
                          setAssignCategory(animation.category);
                          setShowAssignModal(true);
                        }}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                      {showHidden ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10"
                          title="Restore"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRestoreAnimation(animation.id);
                          }}
                        >
                          <ArrowRight className="w-3 h-3 rotate-180" />
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDelete(animation);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {filteredAnimations.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No animations found</p>
            </div>
          )}
        </>
      ) : (
        /* Assignment View */
        <div className="space-y-6">
          {/* Add New Assignment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="w-5 h-5" />
                New Assignment
              </CardTitle>
              <CardDescription>
                Assign animations to levels
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>Category</Label>
                  <Select value={assignCategory} onValueChange={setAssignCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(categoryLabels).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Level</Label>
                  <Select 
                    value={assignLevel.toString()} 
                    onValueChange={(v) => setAssignLevel(parseInt(v))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 100 }, (_, i) => i + 1).map(level => (
                        <SelectItem key={level} value={level.toString()}>Level {level}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Animation</Label>
                  <Select value={assignAnimationId} onValueChange={setAssignAnimationId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select animation" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAnimationForSelection(assignCategory).map(anim => (
                        <SelectItem key={anim.id} value={anim.id}>
                          {anim.name} ({tierLabels[anim.tier]})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end">
                  <Button 
                    onClick={handleAssignToLevel} 
                    disabled={saving || !assignAnimationId}
                    className="w-full"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Saving...' : 'Assign'}
                  </Button>
                </div>
              </div>

              {/* Preview selected animation */}
              {assignAnimationId && (
                <div className="mt-4 p-4 rounded-lg bg-muted/50 flex items-center gap-4">
                  <div className="w-16 h-16 relative flex items-center justify-center"
                    style={{ 
                      background: `radial-gradient(circle, ${premiumAnimations.find(a => a.id === assignAnimationId)?.previewColor}30 0%, transparent 70%)` 
                    }}
                  >
                    <Lottie
                      animationData={premiumAnimations.find(a => a.id === assignAnimationId)?.animationData}
                      loop={true}
                      autoplay={true}
                      style={{ width: '100%', height: '100%' }}
                    />
                  </div>
                  <div>
                    <p className="font-medium">
                      {premiumAnimations.find(a => a.id === assignAnimationId)?.name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Will be assigned to Level {assignLevel}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Assignments by Category */}
          {Object.entries(categoryLabels).map(([category, label]) => {
            const categoryAssignments = assignments.filter(a => a.category === category);
            
            return (
              <Card key={category}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {categoryIcons[category as PremiumAnimation['category']]}
                    {label}
                    <Badge variant="secondary" className="ml-2">
                      {categoryAssignments.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {categoryAssignments.length === 0 ? (
                    <p className="text-muted-foreground text-center py-4">
                      No assignments yet
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                      {categoryAssignments.map(assignment => {
                        const animation = premiumAnimations.find(a => a.id === assignment.animation_id);
                        
                        return (
                          <div 
                            key={assignment.id}
                            className="relative rounded-lg border p-3 bg-muted/30"
                          >
                            <div className="absolute top-2 right-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-destructive hover:text-destructive"
                                onClick={() => handleRemoveAssignment(assignment.id)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>

                            <div className="w-14 h-14 mx-auto mb-2 flex items-center justify-center"
                              style={{ 
                                background: `radial-gradient(circle, ${animation?.previewColor}30 0%, transparent 70%)` 
                              }}
                            >
                              {animation && (
                                <Lottie
                                  animationData={animation.animationData}
                                  loop={true}
                                  autoplay={true}
                                  style={{ width: '100%', height: '100%' }}
                                />
                              )}
                            </div>
                            
                            <div className="text-center">
                              <Badge className="mb-1">Level {assignment.level}</Badge>
                              <p className="text-xs text-muted-foreground truncate">
                                {assignment.animation_name}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      <Dialog open={!!previewAnimation} onOpenChange={() => setPreviewAnimation(null)}>
        <DialogContent className="sm:max-w-md w-screen sm:w-auto h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[90vh] rounded-none sm:rounded-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewAnimation?.name}</DialogTitle>
            <DialogDescription>
              {previewAnimation && categoryLabels[previewAnimation.category]} • {previewAnimation && tierLabels[previewAnimation.tier]} Tier
            </DialogDescription>
          </DialogHeader>
          
          {previewAnimation && (
            <div className="space-y-4">
              {/* Large Preview */}
              <div 
                className="aspect-square rounded-xl flex items-center justify-center relative overflow-hidden"
                style={{ 
                  background: `linear-gradient(135deg, ${previewAnimation.previewColor}60 0%, ${previewAnimation.previewColor}30 50%, hsl(var(--muted)) 100%)` 
                }}
              >
                {/* Animated glow rings */}
                <motion.div 
                  className="absolute inset-0"
                  style={{
                    background: `radial-gradient(circle at center, ${previewAnimation.previewColor}60 0%, transparent 50%)`,
                  }}
                  animate={{
                    opacity: [0.4, 0.8, 0.4],
                    scale: [1, 1.2, 1],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                />
                {/* Main animated icon */}
                <motion.div 
                  className="relative z-10 w-48 h-48 flex items-center justify-center"
                  animate={{
                    rotate: previewAnimation.tier === 'legendary' ? [0, 360] : [0, 10, -10, 0],
                    scale: [1, 1.15, 1],
                  }}
                  transition={{
                    duration: previewAnimation.tier === 'legendary' ? 3 : 2,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                >
                  {previewAnimation.category === 'entry_bar' && <Zap className="w-32 h-32" style={{ color: previewAnimation.previewColor, filter: `drop-shadow(0 0 20px ${previewAnimation.previewColor}) drop-shadow(0 0 40px ${previewAnimation.previewColor}50)` }} />}
                  {previewAnimation.category === 'portrait_frame' && <Crown className="w-32 h-32" style={{ color: previewAnimation.previewColor, filter: `drop-shadow(0 0 20px ${previewAnimation.previewColor}) drop-shadow(0 0 40px ${previewAnimation.previewColor}50)` }} />}
                  {previewAnimation.category === 'privilege_sticker' && <Star className="w-32 h-32" style={{ color: previewAnimation.previewColor, filter: `drop-shadow(0 0 20px ${previewAnimation.previewColor}) drop-shadow(0 0 40px ${previewAnimation.previewColor}50)` }} />}
                  {previewAnimation.category === 'privilege_gift' && <Heart className="w-32 h-32" style={{ color: previewAnimation.previewColor, filter: `drop-shadow(0 0 20px ${previewAnimation.previewColor}) drop-shadow(0 0 40px ${previewAnimation.previewColor}50)` }} />}
                  {previewAnimation.category === 'entrance_effect' && <Sparkles className="w-32 h-32" style={{ color: previewAnimation.previewColor, filter: `drop-shadow(0 0 20px ${previewAnimation.previewColor}) drop-shadow(0 0 40px ${previewAnimation.previewColor}50)` }} />}
                  {previewAnimation.category === 'party_background' && <Diamond className="w-32 h-32" style={{ color: previewAnimation.previewColor, filter: `drop-shadow(0 0 20px ${previewAnimation.previewColor}) drop-shadow(0 0 40px ${previewAnimation.previewColor}50)` }} />}
                  {previewAnimation.category === 'badge' && <Shield className="w-32 h-32" style={{ color: previewAnimation.previewColor, filter: `drop-shadow(0 0 20px ${previewAnimation.previewColor}) drop-shadow(0 0 40px ${previewAnimation.previewColor}50)` }} />}
                  {previewAnimation.category === 'special_effect' && <Flame className="w-32 h-32" style={{ color: previewAnimation.previewColor, filter: `drop-shadow(0 0 20px ${previewAnimation.previewColor}) drop-shadow(0 0 40px ${previewAnimation.previewColor}50)` }} />}
                </motion.div>
                {/* Floating sparkle particles */}
                {[...Array(6)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-4 h-4"
                    style={{
                      top: `${20 + (i * 12)}%`,
                      left: `${10 + (i * 15)}%`,
                    }}
                    animate={{
                      opacity: [0, 1, 0],
                      scale: [0.3, 1, 0.3],
                      y: [0, -20, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      delay: i * 0.3,
                      ease: "easeInOut"
                    }}
                  >
                    <Sparkles className="w-full h-full" style={{ color: previewAnimation.previewColor }} />
                  </motion.div>
                ))}
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Category:</span>
                  <div className="flex items-center gap-2 mt-1">
                    {categoryIcons[previewAnimation.category]}
                    {categoryLabels[previewAnimation.category]}
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Tier:</span>
                  <div className="mt-1">
                    <Badge className={`bg-gradient-to-r ${tierColors[previewAnimation.tier]} text-white border-0`}>
                      {tierLabels[previewAnimation.tier]}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Default Level:</span>
                  <div className="mt-1 font-medium">Level {previewAnimation.unlockLevel}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">ID:</span>
                  <div className="mt-1 font-mono text-xs bg-muted px-2 py-1 rounded">
                    {previewAnimation.id}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Button 
                  className="flex-1" 
                  onClick={() => {
                    setAssignAnimationId(previewAnimation.id);
                    setAssignCategory(previewAnimation.category);
                    setPreviewAnimation(null);
                    setShowAssignModal(true);
                  }}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Assign to Level
                </Button>
                <Button 
                  variant="outline"
                  onClick={() => handleCopyId(previewAnimation.id)}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Assign to Level Modal */}
      <Dialog open={showAssignModal} onOpenChange={setShowAssignModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign to Level</DialogTitle>
            <DialogDescription>
              Select which level to assign this animation
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Level Number</Label>
              <Select 
                value={assignLevel.toString()} 
                onValueChange={(v) => setAssignLevel(parseInt(v))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 100 }, (_, i) => i + 1).map(level => (
                    <SelectItem key={level} value={level.toString()}>Level {level}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {assignAnimationId && (
              <div className="p-4 rounded-lg bg-muted/50 flex items-center gap-4">
                <div className="w-16 h-16 flex items-center justify-center"
                  style={{ 
                    background: `radial-gradient(circle, ${premiumAnimations.find(a => a.id === assignAnimationId)?.previewColor}30 0%, transparent 70%)` 
                  }}
                >
                  <Lottie
                    animationData={premiumAnimations.find(a => a.id === assignAnimationId)?.animationData}
                    loop={true}
                    autoplay={true}
                    style={{ width: '100%', height: '100%' }}
                  />
                </div>
                <div>
                  <p className="font-medium">
                    {premiumAnimations.find(a => a.id === assignAnimationId)?.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {categoryLabels[assignCategory as keyof typeof categoryLabels]}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAssignModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssignToLevel} disabled={saving}>
              {saving ? 'Saving...' : 'Assign'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Delete Dialog */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent className="max-w-md w-screen sm:w-auto h-[100dvh] sm:h-auto max-h-[100dvh] sm:max-h-[90vh] rounded-none sm:rounded-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="w-5 h-5" />
              Delete Animation?
            </DialogTitle>
            <DialogDescription>
              "{confirmDelete?.name}" will be removed from the Animation Store. You can restore it
              later from the "Deleted" view.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete && handleDeleteAnimation(confirmDelete)}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminAnimationStore;
