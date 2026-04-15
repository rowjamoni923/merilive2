import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Gamepad2, TrendingUp, Coins, Loader2, BarChart3, Edit, Star, Trophy, Zap, Target, Sparkles, DollarSign, Plus, Link, Monitor, Trash2, Globe, ExternalLink, Image, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";

interface BetMultiplier {
  bet_type: string;
  label: string;
  multiplier: number;
}

interface GameRules {
  bet_multipliers?: BetMultiplier[];
}

interface GameSetting {
  id: string;
  game_id: string;
  game_name: string;
  game_emoji: string;
  game_color: string;
  description: string;
  min_bet: number;
  max_bet: number;
  win_probability: number;
  house_edge: number;
  max_multiplier: number;
  is_active: boolean;
  is_featured: boolean;
  display_order: number;
  preset_bets: number[];
  category?: string;
  jackpot_percentage?: number;
  jackpot_multiplier?: number;
  min_win_probability?: number;
  max_win_probability?: number;
  // New URL/iframe fields
  game_url?: string;
  logo_url?: string;
  game_type?: 'native' | 'iframe' | 'external';
  iframe_width?: number;
  iframe_height?: number;
  // Bet multipliers / rules
  rules?: GameRules;
}

const DEFAULT_PRESET_BETS = [500, 1000, 5000, 10000, 20000];

interface GameStats {
  game_id: string;
  total_bets: number;
  total_bet_amount: number;
  total_wins: number;
  total_win_amount: number;
  house_profit: number;
}

const CATEGORIES = [
  { id: 'all', name: 'All Games', emoji: '🎮', color: 'from-purple-500 to-pink-500' },
  { id: 'crash', name: 'Crash Games', emoji: '🚀', color: 'from-orange-500 to-red-500' },
  { id: 'casino', name: 'Casino', emoji: '🎰', color: 'from-fuchsia-500 to-pink-500' },
  { id: 'dice', name: 'Dice Games', emoji: '🎲', color: 'from-rose-500 to-red-500' },
  { id: 'cards', name: 'Card Games', emoji: '🃏', color: 'from-blue-500 to-indigo-500' },
  { id: 'classic', name: 'Classic', emoji: '🪙', color: 'from-amber-500 to-yellow-500' },
];

const GAME_TYPES = [
  { id: 'native', name: 'Native Game', icon: '🎮', description: 'Built-in game' },
  { id: 'iframe', name: 'Iframe Game', icon: '🖼️', description: 'External game in iframe' },
  { id: 'external', name: 'External Link', icon: '🔗', description: 'Opens in new tab' },
];

export default function AdminGameSettings() {
  const [games, setGames] = useState<GameSetting[]>([]);
  const [stats, setStats] = useState<GameStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingGame, setEditingGame] = useState<GameSetting | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [newGame, setNewGame] = useState<Partial<GameSetting>>({
    game_id: '',
    game_name: '',
    game_emoji: '🎮',
    game_color: 'from-purple-500 to-pink-500',
    description: '',
    min_bet: 1000,
    max_bet: 1000000,
    win_probability: 50,
    house_edge: 5,
    max_multiplier: 10,
    is_active: true,
    is_featured: false,
    display_order: 0,
    preset_bets: [5000, 10000, 20000, 50000, 100000],
    category: 'casino',
    game_type: 'native',
    game_url: '',
    logo_url: '',
    iframe_width: 400,
    iframe_height: 600,
  });

  // Logo Upload Handler
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, target: 'new' | 'edit') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Only images can be uploaded");
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size must be less than 5MB");
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `game_logo_${Date.now()}.${fileExt}`;
      const filePath = `games/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("level-assets")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from("level-assets")
        .getPublicUrl(filePath);

      if (target === 'new') {
        setNewGame(prev => ({ ...prev, logo_url: data.publicUrl }));
      } else if (editingGame) {
        setEditingGame({ ...editingGame, logo_url: data.publicUrl });
      }
      toast.success("Logo uploaded successfully!");
    } catch (error: any) {
      toast.error("Failed to upload logo");
      console.error("Upload error:", error);
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    fetchGames();
  }, []);

  useAdminRealtime(
    ['game_settings'],
    fetchGames,
    'admin-game-settings-rt'
  );

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchGames = async () => {
    const { data, error } = await supabase
      .from('game_settings')
      .select('*')
      .order('display_order', { ascending: true });
    
    if (!error && data) {
      const gamesWithPresets = data.map(game => ({
        ...game,
        preset_bets: game.preset_bets ? 
          (typeof game.preset_bets === 'string' ? JSON.parse(game.preset_bets) : game.preset_bets) 
          : DEFAULT_PRESET_BETS
      })) as GameSetting[];
      setGames(gamesWithPresets);
    }
    setLoading(false);
  };

  const fetchStats = async () => {
    const today = new Date().toISOString().split('T')[0];
    const { data, error } = await supabase
      .from('game_stats')
      .select('*')
      .filter('stat_date', 'gte', today)
      .filter('stat_date', 'lte', today);
    
    if (!error && data) {
      setStats(data);
    }
  };

  const updateGame = async (game: GameSetting) => {
    setSaving(true);
    const { error } = await supabase
      .from('game_settings')
      .update({
        game_name: game.game_name,
        game_emoji: game.game_emoji,
        game_color: game.game_color,
        description: game.description,
        win_probability: game.win_probability,
        house_edge: game.house_edge,
        min_bet: game.min_bet,
        max_bet: game.max_bet,
        max_multiplier: game.max_multiplier,
        is_active: game.is_active,
        is_featured: game.is_featured,
        preset_bets: game.preset_bets,
        category: game.category,
        jackpot_percentage: game.jackpot_percentage || 0,
        jackpot_multiplier: game.jackpot_multiplier || 100,
        min_win_probability: game.min_win_probability || 5,
        max_win_probability: game.max_win_probability || 95,
        game_url: game.game_url || null,
        logo_url: game.logo_url || null,
        game_type: game.game_type || 'native',
        iframe_width: game.iframe_width || 400,
        iframe_height: game.iframe_height || 600,
        rules: (game.rules || {}) as any,
      })
      .eq('id', game.id);

    if (error) {
      toast.error('Failed to update');
    } else {
      toast.success(`${game.game_name} updated successfully`);
      setShowEditDialog(false);
      setEditingGame(null);
      fetchGames();
    }
    setSaving(false);
  };

  const addNewGame = async () => {
    if (!newGame.game_id || !newGame.game_name) {
      toast.error('Game ID and Name are required');
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('game_settings')
      .insert({
        game_id: newGame.game_id,
        game_name: newGame.game_name,
        game_emoji: newGame.game_emoji || '🎮',
        game_color: newGame.game_color || 'from-purple-500 to-pink-500',
        description: newGame.description || '',
        min_bet: newGame.min_bet || 1000,
        max_bet: newGame.max_bet || 1000000,
        win_probability: newGame.win_probability || 50,
        house_edge: newGame.house_edge || 5,
        max_multiplier: newGame.max_multiplier || 10,
        is_active: newGame.is_active ?? true,
        is_featured: newGame.is_featured ?? false,
        display_order: games.length,
        preset_bets: newGame.preset_bets || [5000, 10000, 20000, 50000, 100000],
        category: newGame.category || 'casino',
        game_url: newGame.game_url || null,
        logo_url: newGame.logo_url || null,
        game_type: newGame.game_type || 'native',
        iframe_width: newGame.iframe_width || 400,
        iframe_height: newGame.iframe_height || 600,
      });

    if (error) {
      toast.error('Failed to add game: ' + error.message);
    } else {
      toast.success('Game added successfully!');
      setShowAddDialog(false);
      setNewGame({
        game_id: '',
        game_name: '',
        game_emoji: '🎮',
        game_color: 'from-purple-500 to-pink-500',
        description: '',
        min_bet: 1000,
        max_bet: 1000000,
        win_probability: 50,
        house_edge: 5,
        max_multiplier: 10,
        is_active: true,
        is_featured: false,
        display_order: 0,
        preset_bets: [5000, 10000, 20000, 50000, 100000],
        category: 'casino',
        game_type: 'native',
        game_url: '',
        logo_url: '',
        iframe_width: 400,
        iframe_height: 600,
      });
      fetchGames();
    }
    setSaving(false);
  };

  const deleteGame = async (gameId: string) => {
    if (!confirm('Are you sure you want to delete this game?')) return;
    
    const { error } = await supabase
      .from('game_settings')
      .delete()
      .eq('id', gameId);

    if (error) {
      toast.error('Failed to delete game');
    } else {
      toast.success('Game deleted');
      fetchGames();
    }
  };

  const getStatsForGame = (gameId: string) => {
    return stats.find(s => s.game_id === gameId);
  };

  const filteredGames = activeCategory === 'all' 
    ? games 
    : games.filter(g => g.category === activeCategory);

  const totalStats = {
    bets: stats.reduce((a, s) => a + (s.total_bets || 0), 0),
    betAmount: stats.reduce((a, s) => a + (s.total_bet_amount || 0), 0),
    wins: stats.reduce((a, s) => a + (s.total_wins || 0), 0),
    profit: stats.reduce((a, s) => a + (s.house_profit || 0), 0)
  };

  const getCategoryStats = (categoryId: string) => {
    const categoryGames = categoryId === 'all' ? games : games.filter(g => g.category === categoryId);
    const gameIds = categoryGames.map(g => g.game_id);
    const categoryStats = stats.filter(s => gameIds.includes(s.game_id));
    return {
      bets: categoryStats.reduce((a, s) => a + (s.total_bets || 0), 0),
      profit: categoryStats.reduce((a, s) => a + (s.house_profit || 0), 0),
      activeGames: categoryGames.filter(g => g.is_active).length,
      totalGames: categoryGames.length
    };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6 p-2 md:p-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500">
              <Gamepad2 className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            Game Settings
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Manage games, URLs & settings for Live/Party rooms</p>
        </div>
        <Button 
          onClick={() => setShowAddDialog(true)}
          className="bg-gradient-to-r from-green-500 to-emerald-600"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add New Game
        </Button>
      </div>

      {/* Global Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <BarChart3 className="w-4 h-4 md:w-5 md:h-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Today's Bets</p>
                  <p className="text-lg md:text-xl font-bold text-purple-600">{totalStats.bets.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                  <Coins className="w-4 h-4 md:w-5 md:h-5 text-amber-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Bet Volume</p>
                  <p className="text-lg md:text-xl font-bold text-amber-600">{totalStats.betAmount.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <TrendingUp className="w-4 h-4 md:w-5 md:h-5 text-green-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">House Profit</p>
                  <p className="text-lg md:text-xl font-bold text-green-600">+{totalStats.profit.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
            <CardContent className="p-3 md:p-4">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <Gamepad2 className="w-4 h-4 md:w-5 md:h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Active Games</p>
                  <p className="text-lg md:text-xl font-bold text-blue-600">{games.filter(g => g.is_active).length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Category Tabs */}
      <Tabs value={activeCategory} onValueChange={setActiveCategory} className="w-full">
        <TabsList className="w-full flex flex-wrap h-auto gap-1 bg-transparent p-0">
          {CATEGORIES.map((cat) => {
            const catStats = getCategoryStats(cat.id);
            return (
              <TabsTrigger
                key={cat.id}
                value={cat.id}
                className={cn(
                  "flex-1 min-w-[80px] data-[state=active]:shadow-lg transition-all",
                  "px-3 py-2 rounded-lg border",
                  activeCategory === cat.id 
                    ? `bg-gradient-to-r ${cat.color} text-white border-transparent` 
                    : "bg-card border-border hover:bg-muted"
                )}
              >
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-lg">{cat.emoji}</span>
                  <span className="text-[10px] font-medium">{cat.name}</span>
                  <span className="text-[9px] opacity-70">{catStats.activeGames}/{catStats.totalGames}</span>
                </div>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Category Stats */}
        {activeCategory !== 'all' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20"
          >
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="font-bold text-lg flex items-center gap-2">
                  {CATEGORIES.find(c => c.id === activeCategory)?.emoji}
                  {CATEGORIES.find(c => c.id === activeCategory)?.name} Stats
                </h3>
              </div>
              <div className="flex gap-4 text-sm">
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">Today's Bets</p>
                  <p className="font-bold text-purple-500">{getCategoryStats(activeCategory).bets}</p>
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground text-xs">Profit</p>
                  <p className="font-bold text-green-500">+{getCategoryStats(activeCategory).profit}</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Games Grid */}
        <TabsContent value={activeCategory} className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>{activeCategory === 'all' ? 'All Games' : CATEGORIES.find(c => c.id === activeCategory)?.name}</span>
                <Badge variant="outline">{filteredGames.length} games</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 md:p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredGames.map((game, index) => {
                  const gameStat = getStatsForGame(game.game_id);
                  return (
                    <motion.div
                      key={game.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className={cn(
                        "relative p-4 rounded-xl border transition-all",
                        game.is_active 
                          ? "bg-card hover:shadow-lg" 
                          : "bg-muted/50 opacity-60"
                      )}
                    >
                      {/* Featured Badge */}
                      {game.is_featured && (
                        <div className="absolute -top-2 -right-2">
                          <Badge className="bg-gradient-to-r from-yellow-500 to-amber-500 text-white text-[10px] px-2">
                            <Star className="w-3 h-3 mr-1" />
                            Featured
                          </Badge>
                        </div>
                      )}

                      <div className="flex items-start gap-3">
                        {/* Game Icon - Show Logo from Admin Panel or Fallback to Emoji */}
                        <div className={cn(
                          "w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center text-2xl md:text-3xl shadow-lg overflow-hidden relative",
                          `bg-gradient-to-br ${game.game_color}`
                        )}>
                          {game.logo_url ? (
                            <>
                              <img 
                                src={game.logo_url} 
                                alt={game.game_name}
                                className="w-full h-full object-contain absolute inset-0"
                                loading="lazy"
                                onLoad={(e) => {
                                  // Show image once loaded
                                  (e.target as HTMLImageElement).style.opacity = '1';
                                }}
                                onError={(e) => {
                                  // Hide broken image
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                                style={{ opacity: 1 }}
                              />
                              {/* Fallback emoji shown behind image in case of load failure */}
                              <span className="text-2xl md:text-3xl">{game.game_emoji}</span>
                            </>
                          ) : (
                            <span className="text-2xl md:text-3xl">{game.game_emoji}</span>
                          )}
                        </div>

                        {/* Game Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h3 className="font-bold text-sm md:text-base truncate">{game.game_name}</h3>
                            <Switch
                              checked={game.is_active}
                              onCheckedChange={(checked) => {
                                const updatedGame = { ...game, is_active: checked };
                                updateGame(updatedGame);
                              }}
                            />
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {game.description}
                          </p>
                          
                          {/* Stats Row */}
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <Badge variant="outline" className="text-[9px] bg-green-500/10 text-green-600 border-green-500/30 px-1.5">
                              <Target className="w-2.5 h-2.5 mr-0.5" />
                              Win {game.win_probability}%
                            </Badge>
                            <Badge variant="outline" className="text-[9px] bg-blue-500/10 text-blue-600 border-blue-500/30 px-1.5">
                              <TrendingUp className="w-2.5 h-2.5 mr-0.5" />
                              {game.max_multiplier}x
                            </Badge>
                            {(game.jackpot_percentage || 0) > 0 && (
                              <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-600 border-amber-500/30 px-1.5">
                                <Trophy className="w-2.5 h-2.5 mr-0.5" />
                                JP {game.jackpot_percentage}%
                              </Badge>
                            )}
                            {/* Game Type Badge */}
                            <Badge variant="outline" className={cn(
                              "text-[9px] px-1.5",
                              game.game_type === 'iframe' && "bg-purple-500/10 text-purple-600 border-purple-500/30",
                              game.game_type === 'external' && "bg-orange-500/10 text-orange-600 border-orange-500/30",
                              (!game.game_type || game.game_type === 'native') && "bg-gray-500/10 text-gray-600 border-gray-500/30"
                            )}>
                              {game.game_type === 'iframe' && <><Monitor className="w-2.5 h-2.5 mr-0.5" />iFrame</>}
                              {game.game_type === 'external' && <><ExternalLink className="w-2.5 h-2.5 mr-0.5" />External</>}
                              {(!game.game_type || game.game_type === 'native') && <><Gamepad2 className="w-2.5 h-2.5 mr-0.5" />Native</>}
                            </Badge>
                          </div>

                          {/* Game URL Preview */}
                          {game.game_url && (
                            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                              <Link className="w-2.5 h-2.5" />
                              <span className="truncate max-w-[150px]">{game.game_url}</span>
                            </div>
                          )}

                          {/* Today Stats */}
                          {gameStat && (
                            <div className="flex items-center gap-2 mt-2 text-xs">
                              <span className="text-muted-foreground">Today:</span>
                              <span className="font-medium">{gameStat.total_bets} bets</span>
                              <span className="text-green-500 font-medium">+{gameStat.house_profit}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="absolute bottom-2 right-2 flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => {
                            setEditingGame(game);
                            setShowEditDialog(true);
                          }}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => deleteGame(game.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              {editingGame && (
                <>
                  <span className="text-3xl">{editingGame.game_emoji}</span>
                  <span>{editingGame.game_name} Settings</span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {editingGame && (
            <div className="space-y-5 py-4">
              {/* Win Probability Range */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/20">
                <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-green-500" />
                  Win Probability Settings
                </h4>
                
                <div className="space-y-4">
                  {/* Current Win % */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm">Current Win %</label>
                      <Badge variant="outline" className="bg-green-500/10 text-green-600">
                        {editingGame.win_probability}%
                      </Badge>
                    </div>
                    <Slider
                      value={[editingGame.win_probability]}
                      onValueChange={([val]) => setEditingGame({...editingGame, win_probability: val})}
                      min={editingGame.min_win_probability || 5}
                      max={editingGame.max_win_probability || 95}
                      step={1}
                      className="py-2"
                    />
                  </div>

                  {/* Min/Max Range */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Min Win %</label>
                      <Input
                        type="number"
                        value={editingGame.min_win_probability || 5}
                        onChange={(e) => setEditingGame({...editingGame, min_win_probability: parseFloat(e.target.value) || 5})}
                        className="h-8"
                        min={1}
                        max={50}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Max Win %</label>
                      <Input
                        type="number"
                        value={editingGame.max_win_probability || 95}
                        onChange={(e) => setEditingGame({...editingGame, max_win_probability: parseFloat(e.target.value) || 95})}
                        className="h-8"
                        min={50}
                        max={99}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Jackpot Settings */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20">
                <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  Jackpot Settings
                </h4>
                
                <div className="space-y-4">
                  {/* Jackpot Chance */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-sm">Jackpot Chance</label>
                      <Badge variant="outline" className="bg-amber-500/10 text-amber-600">
                        {editingGame.jackpot_percentage || 0}%
                      </Badge>
                    </div>
                    <Slider
                      value={[editingGame.jackpot_percentage || 0]}
                      onValueChange={([val]) => setEditingGame({...editingGame, jackpot_percentage: val})}
                      min={0}
                      max={10}
                      step={0.1}
                      className="py-2"
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Probability of hitting jackpot per game
                    </p>
                  </div>

                  {/* Jackpot Multiplier */}
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Jackpot Multiplier</label>
                    <Input
                      type="number"
                      value={editingGame.jackpot_multiplier || 100}
                      onChange={(e) => setEditingGame({...editingGame, jackpot_multiplier: parseFloat(e.target.value) || 100})}
                      className="h-8"
                      min={10}
                      max={10000}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Win multiplier when jackpot hits (e.g., 500x)
                    </p>
                  </div>
                </div>
              </div>

              {/* House Edge */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-purple-500" />
                    House Edge
                  </label>
                  <Badge variant="outline" className="bg-purple-500/10 text-purple-600">
                    {editingGame.house_edge}%
                  </Badge>
                </div>
                <Slider
                  value={[editingGame.house_edge]}
                  onValueChange={([val]) => setEditingGame({...editingGame, house_edge: val})}
                  min={0.5}
                  max={20}
                  step={0.5}
                  className="py-2"
                />
              </div>

              {/* Bet Range */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Min Bet</label>
                  <Input
                    type="number"
                    value={editingGame.min_bet}
                    onChange={(e) => setEditingGame({...editingGame, min_bet: parseInt(e.target.value) || 0})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Bet</label>
                  <Input
                    type="number"
                    value={editingGame.max_bet}
                    onChange={(e) => setEditingGame({...editingGame, max_bet: parseInt(e.target.value) || 0})}
                  />
                </div>
              </div>

              {/* Max Multiplier */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Zap className="w-4 h-4 text-blue-500" />
                  Max Multiplier
                </label>
                <Input
                  type="number"
                  value={editingGame.max_multiplier}
                  onChange={(e) => setEditingGame({...editingGame, max_multiplier: parseFloat(e.target.value) || 1})}
                />
              </div>

              {/* Preset Bets */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Preset Bet Amounts</label>
                <p className="text-xs text-muted-foreground">
                  Separate with commas (e.g., 5000, 10000, 20000)
                </p>
                <Input
                  value={editingGame.preset_bets?.join(', ') || ''}
                  onChange={(e) => {
                    const values = e.target.value.split(',').map(v => parseInt(v.trim())).filter(v => !isNaN(v));
                    setEditingGame({...editingGame, preset_bets: values.length > 0 ? values : DEFAULT_PRESET_BETS});
                  }}
                  placeholder="5000, 10000, 20000, 50000, 100000, 200000"
                />
              </div>

              {/* Bet Multipliers - For Casino Games like Roulette, Dice, etc. */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/20">
                <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-orange-500" />
                  Bet Type Multipliers
                  <Badge variant="outline" className="text-[10px] text-orange-400 border-orange-500/50">
                    Casino Games
                  </Badge>
                </h4>
                <p className="text-[10px] text-muted-foreground mb-3">
                  Configure payout multipliers for each bet type (e.g., Roulette: Zero=33x, Red/Black=2x)
                </p>
                
                <div className="space-y-3">
                  {/* Show existing multipliers or default */}
                  {(() => {
                    const multipliers = editingGame.rules?.bet_multipliers || [];
                    
                    // Default multipliers for different games
                    const getDefaultMultipliers = (gameId: string): BetMultiplier[] => {
                      if (gameId === 'roulette') {
                        return [
                          { bet_type: 'zero', label: 'Zero (0)', multiplier: 33 },
                          { bet_type: 'red', label: 'Red', multiplier: 2 },
                          { bet_type: 'black', label: 'Black', multiplier: 2 },
                          { bet_type: 'even', label: 'Even', multiplier: 2 },
                          { bet_type: 'odd', label: 'Odd', multiplier: 2 },
                          { bet_type: 'low', label: '1-18', multiplier: 2 },
                          { bet_type: 'high', label: '19-36', multiplier: 2 },
                        ];
                      }
                      if (gameId === 'dice') {
                        return [
                          { bet_type: 'high', label: 'High', multiplier: 2 },
                          { bet_type: 'low', label: 'Low', multiplier: 2 },
                          { bet_type: 'exact', label: 'Exact Number', multiplier: 6 },
                        ];
                      }
                      if (gameId === 'ferris_wheel') {
                        return [
                          { bet_type: 'segment_1', label: 'Segment 1', multiplier: 2 },
                          { bet_type: 'segment_2', label: 'Segment 2', multiplier: 3 },
                          { bet_type: 'segment_3', label: 'Segment 3', multiplier: 5 },
                          { bet_type: 'segment_4', label: 'Segment 4', multiplier: 10 },
                        ];
                      }
                      return [];
                    };
                    
                    const displayMultipliers = multipliers.length > 0 ? multipliers : getDefaultMultipliers(editingGame.game_id);
                    
                    return (
                      <div className="space-y-2">
                        {displayMultipliers.length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">
                            No bet types configured for this game
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 gap-2">
                            {displayMultipliers.map((mult, idx) => (
                              <div key={mult.bet_type} className="flex items-center gap-2 bg-background/50 rounded-lg p-2">
                                <span className="text-xs flex-1 truncate">{mult.label}</span>
                                <Input
                                  type="number"
                                  value={mult.multiplier}
                                  onChange={(e) => {
                                    const newMultipliers = [...displayMultipliers];
                                    newMultipliers[idx] = { ...mult, multiplier: parseFloat(e.target.value) || 2 };
                                    setEditingGame({
                                      ...editingGame,
                                      rules: { ...editingGame.rules, bet_multipliers: newMultipliers }
                                    });
                                  }}
                                  className="h-7 w-16 text-xs text-center"
                                  min={1}
                                  max={100}
                                  step={0.5}
                                />
                                <span className="text-[10px] text-muted-foreground">x</span>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Button to reset to defaults */}
                        {displayMultipliers.length > 0 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full mt-2 text-xs"
                            onClick={() => {
                              const defaults = getDefaultMultipliers(editingGame.game_id);
                              setEditingGame({
                                ...editingGame,
                                rules: { ...editingGame.rules, bet_multipliers: defaults }
                              });
                            }}
                          >
                            Reset to Default Multipliers
                          </Button>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Game URL Settings */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
                <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-500" />
                  External Game URL Settings
                </h4>
                
                <div className="space-y-4">
                  {/* Game Type */}
                  <div className="space-y-2">
                    <label className="text-sm">Game Type</label>
                    <Select
                      value={editingGame.game_type || 'native'}
                      onValueChange={(val) => setEditingGame({...editingGame, game_type: val as 'native' | 'iframe' | 'external'})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GAME_TYPES.map(type => (
                          <SelectItem key={type.id} value={type.id}>
                            <div className="flex items-center gap-2">
                              <span>{type.icon}</span>
                              <span>{type.name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground">
                      Native = built-in, Iframe = embedded, External = opens in new tab
                    </p>
                  </div>

                  {/* Game URL */}
                  <div className="space-y-2">
                    <label className="text-sm flex items-center gap-2">
                      <Link className="w-3 h-3" />
                      Game URL
                    </label>
                    <Input
                      value={editingGame.game_url || ''}
                      onChange={(e) => setEditingGame({...editingGame, game_url: e.target.value})}
                      placeholder="https://example.com/game"
                    />
                  </div>

                  {/* Logo URL with Upload */}
                  <div className="space-y-2">
                    <Label className="text-sm flex items-center gap-2">
                      <Image className="w-3 h-3" />
                      Logo/Thumbnail
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        value={editingGame.logo_url || ''}
                        onChange={(e) => setEditingGame({...editingGame, logo_url: e.target.value})}
                        placeholder="https://example.com/logo.png"
                        className="flex-1"
                      />
                      <label className="cursor-pointer">
                        <Button variant="outline" size="sm" asChild disabled={uploading}>
                          <span>
                            <Upload className="w-4 h-4 mr-1" />
                            {uploading ? "..." : "Upload"}
                          </span>
                        </Button>
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*"
                          onChange={(e) => handleLogoUpload(e, 'edit')}
                        />
                      </label>
                    </div>
                    {editingGame.logo_url && (
                      <div className="mt-2 flex items-center gap-2">
                        <img 
                          src={editingGame.logo_url} 
                          alt="Game Logo" 
                          className="w-12 h-12 rounded-lg object-cover border"
                        />
                        <span className="text-xs text-muted-foreground truncate max-w-[200px]">{editingGame.logo_url}</span>
                      </div>
                    )}
                  </div>

                  {/* Iframe Dimensions */}
                  {editingGame.game_type === 'iframe' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Width (px)</label>
                        <Input
                          type="number"
                          value={editingGame.iframe_width || 400}
                          onChange={(e) => setEditingGame({...editingGame, iframe_width: parseInt(e.target.value) || 400})}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Height (px)</label>
                        <Input
                          type="number"
                          value={editingGame.iframe_height || 600}
                          onChange={(e) => setEditingGame({...editingGame, iframe_height: parseInt(e.target.value) || 600})}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Toggles */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-500" />
                  <label className="text-sm font-medium">Featured Game</label>
                </div>
                <Switch
                  checked={editingGame.is_featured}
                  onCheckedChange={(checked) => setEditingGame({...editingGame, is_featured: checked})}
                />
              </div>

              {/* Save Button */}
              <Button
                onClick={() => updateGame(editingGame)}
                disabled={saving}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add New Game Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <Plus className="w-5 h-5 text-green-500" />
              Add New Game
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Game ID *</label>
                <Input
                  value={newGame.game_id || ''}
                  onChange={(e) => setNewGame({...newGame, game_id: e.target.value.toLowerCase().replace(/\s+/g, '_')})}
                  placeholder="my_game"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Game Name *</label>
                <Input
                  value={newGame.game_name || ''}
                  onChange={(e) => setNewGame({...newGame, game_name: e.target.value})}
                  placeholder="My Game"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm font-medium">Emoji</label>
                <Input
                  value={newGame.game_emoji || ''}
                  onChange={(e) => setNewGame({...newGame, game_emoji: e.target.value})}
                  placeholder="🎮"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Category</label>
                <Select
                  value={newGame.category || 'casino'}
                  onValueChange={(val) => setNewGame({...newGame, category: val})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.filter(c => c.id !== 'all').map(cat => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.emoji} {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={newGame.description || ''}
                onChange={(e) => setNewGame({...newGame, description: e.target.value})}
                placeholder="Short description of the game..."
                rows={2}
              />
            </div>

            {/* Game Type & URL */}
            <div className="p-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-500/20">
              <h4 className="font-bold text-sm mb-3 flex items-center gap-2">
                <Globe className="w-4 h-4 text-blue-500" />
                Game Source
              </h4>
              
              <div className="space-y-3">
                <div className="space-y-2">
                  <label className="text-sm">Game Type</label>
                  <Select
                    value={newGame.game_type || 'native'}
                    onValueChange={(val) => setNewGame({...newGame, game_type: val as 'native' | 'iframe' | 'external'})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GAME_TYPES.map(type => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.icon} {type.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {(newGame.game_type === 'iframe' || newGame.game_type === 'external') && (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm">Game URL *</label>
                      <Input
                        value={newGame.game_url || ''}
                        onChange={(e) => setNewGame({...newGame, game_url: e.target.value})}
                        placeholder="https://example.com/game"
                      />
                    </div>
                    {/* Logo URL with Upload */}
                    <div className="space-y-2">
                      <Label className="text-sm flex items-center gap-2">
                        <Image className="w-3 h-3" />
                        Logo/Thumbnail
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          value={newGame.logo_url || ''}
                          onChange={(e) => setNewGame({...newGame, logo_url: e.target.value})}
                          placeholder="https://example.com/logo.png"
                          className="flex-1"
                        />
                        <label className="cursor-pointer">
                          <Button variant="outline" size="sm" asChild disabled={uploading}>
                            <span>
                              <Upload className="w-4 h-4 mr-1" />
                              {uploading ? "..." : "Upload"}
                            </span>
                          </Button>
                          <input 
                            type="file" 
                            className="hidden" 
                            accept="image/*"
                            onChange={(e) => handleLogoUpload(e, 'new')}
                          />
                        </label>
                      </div>
                      {newGame.logo_url && (
                        <div className="mt-2 flex items-center gap-2">
                          <img 
                            src={newGame.logo_url} 
                            alt="Game Logo Preview" 
                            className="w-12 h-12 rounded-lg object-cover border"
                          />
                          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{newGame.logo_url}</span>
                        </div>
                      )}
                    </div>
                    {newGame.game_type === 'iframe' && (
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs">Width (px)</label>
                          <Input
                            type="number"
                            value={newGame.iframe_width || 400}
                            onChange={(e) => setNewGame({...newGame, iframe_width: parseInt(e.target.value) || 400})}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs">Height (px)</label>
                          <Input
                            type="number"
                            value={newGame.iframe_height || 600}
                            onChange={(e) => setNewGame({...newGame, iframe_height: parseInt(e.target.value) || 600})}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Game Settings */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm">Win Probability %</label>
                <Input
                  type="number"
                  value={newGame.win_probability || 50}
                  onChange={(e) => setNewGame({...newGame, win_probability: parseFloat(e.target.value) || 50})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm">House Edge %</label>
                <Input
                  type="number"
                  value={newGame.house_edge || 5}
                  onChange={(e) => setNewGame({...newGame, house_edge: parseFloat(e.target.value) || 5})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-sm">Min Bet</label>
                <Input
                  type="number"
                  value={newGame.min_bet || 1000}
                  onChange={(e) => setNewGame({...newGame, min_bet: parseInt(e.target.value) || 1000})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm">Max Bet</label>
                <Input
                  type="number"
                  value={newGame.max_bet || 1000000}
                  onChange={(e) => setNewGame({...newGame, max_bet: parseInt(e.target.value) || 1000000})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm">Max Multiplier</label>
              <Input
                type="number"
                value={newGame.max_multiplier || 10}
                onChange={(e) => setNewGame({...newGame, max_multiplier: parseFloat(e.target.value) || 10})}
              />
            </div>

            {/* Toggles */}
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Active</label>
              <Switch
                checked={newGame.is_active ?? true}
                onCheckedChange={(checked) => setNewGame({...newGame, is_active: checked})}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Featured</label>
              <Switch
                checked={newGame.is_featured ?? false}
                onCheckedChange={(checked) => setNewGame({...newGame, is_featured: checked})}
              />
            </div>

            {/* Add Button */}
            <Button
              onClick={addNewGame}
              disabled={saving || !newGame.game_id || !newGame.game_name}
              className="w-full bg-gradient-to-r from-green-500 to-emerald-600"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              Add Game
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}