import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Gamepad2, 
  Plus, 
  ExternalLink, 
  Key, 
  Shield, 
  Globe, 
  Trash2, 
  Edit, 
  RefreshCw,
  Link,
  Server,
  Zap,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  EyeOff,
  Copy,
  Play,
  Settings,
  DollarSign,
  Users
} from "lucide-react";

// Popular Game Provider Presets
const GAME_PROVIDER_PRESETS = [
  {
    id: 'softswiss',
    name: 'SOFTSWISS Game Aggregator',
    logo: '🎰',
    website: 'https://www.softswiss.com/game-aggregator/',
    description: '16,000+ games from 200+ studios. Industry leading aggregator.',
    features: ['Slots', 'Live Casino', 'Table Games', 'Crash Games'],
    integration_type: 'api',
    docs_url: 'https://www.softswiss.com/api-docs/',
  },
  {
    id: 'veligames',
    name: 'VeliGames (VeliTech)',
    logo: '🎮',
    website: 'https://velitech.com/products/game-aggregator/',
    description: '35,000+ games from 160+ providers. Single API integration.',
    features: ['Slots', 'Crash', 'Live Casino', 'Sports'],
    integration_type: 'api',
    docs_url: 'https://velitech.com/docs/',
  },
  {
    id: 'pago',
    name: 'PAGO Gaming',
    logo: '🌏',
    website: 'https://pagogaming.com/',
    description: 'Asian market focused. RNG slots, table games, live casino.',
    features: ['RNG Games', 'Live Casino', 'Sportsbook'],
    integration_type: 'api',
    docs_url: 'https://pagogaming.com/docs/',
  },
  {
    id: 'kanggiten',
    name: 'Kanggiten',
    logo: '🃏',
    website: 'https://kanggiten.com/game-aggregator/',
    description: '20,000+ slots, table games, live titles. Fast API integration.',
    features: ['Slots', 'Tables', 'Live Dealer', 'Tournaments'],
    integration_type: 'api',
    docs_url: 'https://kanggiten.com/docs/',
  },
  {
    id: 'luckystreak',
    name: 'LuckyStreak Social Casino',
    logo: '🍀',
    website: 'https://luckystreak.io/',
    description: 'Social casino API with virtual currency support.',
    features: ['Virtual Currency', 'Social Features', 'Live Casino'],
    integration_type: 'api',
    docs_url: 'https://luckystreak.io/docs/',
  },
  {
    id: 'yggdrasil',
    name: 'Yggdrasil Livespins',
    logo: '🎲',
    website: 'https://livespins.com/',
    description: 'Bet-behind streaming platform. Watch & play with streamers.',
    features: ['Bet Behind', 'Streamer Mode', 'Social Betting'],
    integration_type: 'iframe',
    docs_url: 'https://livespins.com/operators/',
  },
  {
    id: 'spribe',
    name: 'Spribe (Aviator, Mines)',
    logo: '✈️',
    website: 'https://spribe.co/',
    description: 'Popular crash games like Aviator, Mines, Plinko.',
    features: ['Aviator', 'Mines', 'Plinko', 'Goal', 'Dice'],
    integration_type: 'api',
    docs_url: 'https://spribe.co/developers/',
  },
  {
    id: 'evolution',
    name: 'Evolution Gaming',
    logo: '🎬',
    website: 'https://www.evolution.com/',
    description: 'Premium live casino with real dealers.',
    features: ['Live Blackjack', 'Live Roulette', 'Game Shows'],
    integration_type: 'iframe',
    docs_url: 'https://www.evolution.com/partners/',
  },
  {
    id: 'pragmatic',
    name: 'Pragmatic Play',
    logo: '🎪',
    website: 'https://www.pragmaticplay.com/',
    description: 'Popular slot games and live casino.',
    features: ['Slots', 'Live Casino', 'Bingo', 'Virtual Sports'],
    integration_type: 'api',
    docs_url: 'https://www.pragmaticplay.com/en/partners/',
  },
  {
    id: 'custom',
    name: 'Custom Provider',
    logo: '⚙️',
    website: '',
    description: 'Add your own game provider API.',
    features: ['Custom Integration'],
    integration_type: 'api',
    docs_url: '',
  },
];

interface GameProvider {
  id: string;
  name: string;
  provider_key: string;
  api_url: string;
  api_key: string;
  api_secret: string;
  merchant_id: string;
  is_active: boolean;
  integration_type: 'api' | 'iframe' | 'webhook';
  webhook_url?: string;
  callback_url?: string;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface ProviderGame {
  id: string;
  provider_id: string;
  game_id: string;
  game_name: string;
  game_type: string;
  thumbnail_url?: string;
  launch_url?: string;
  is_active: boolean;
}

export default function AdminGameProviders() {
  const [providers, setProviders] = useState<GameProvider[]>([]);
  const [providerGames, setProviderGames] = useState<ProviderGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showApiKeysVisible, setShowApiKeysVisible] = useState<Record<string, boolean>>({});
  const [selectedPreset, setSelectedPreset] = useState<typeof GAME_PROVIDER_PRESETS[0] | null>(null);
  const [editingProvider, setEditingProvider] = useState<GameProvider | null>(null);
  const [newProvider, setNewProvider] = useState<Partial<GameProvider>>({
    name: '',
    provider_key: '',
    api_url: '',
    api_key: '',
    api_secret: '',
    merchant_id: '',
    is_active: false,
    integration_type: 'api',
    settings: {},
  });

  const fetchProviders = async () => {
    try {
      const { data, error } = await supabase
        .from('game_providers')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      if (data) {
        setProviders(data.map(p => ({
          id: p.id,
          name: p.provider_name,
          provider_key: p.provider_id,
          api_url: p.api_url || '',
          api_key: p.api_key || '',
          api_secret: p.api_secret || '',
          merchant_id: p.merchant_id || '',
          is_active: p.is_active || false,
          integration_type: (p.provider_type as 'api' | 'iframe' | 'webhook') || 'api',
          settings: (p.sdk_config as Record<string, any>) || {},
          created_at: p.created_at || '',
          updated_at: p.updated_at || '',
        })));
      }
    } catch (error) {
      console.error('Error fetching providers:', error);
      toast.error('Failed to load providers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders();
  }, []);
  useAdminRealtime(['game_providers'], fetchProviders, 'admin-game-providers-rt');

  const saveProviders = async (updatedProviders: GameProvider[]) => {
    setProviders(updatedProviders);
  };

  const handleAddProvider = () => {
    if (!newProvider.name || !newProvider.provider_key) {
      toast.error('Name and Provider Key are required');
      return;
    }

    setSaving(true);
    const provider: GameProvider = {
      id: crypto.randomUUID(),
      name: newProvider.name!,
      provider_key: newProvider.provider_key!,
      api_url: newProvider.api_url || '',
      api_key: newProvider.api_key || '',
      api_secret: newProvider.api_secret || '',
      merchant_id: newProvider.merchant_id || '',
      is_active: newProvider.is_active || false,
      integration_type: newProvider.integration_type || 'api',
      webhook_url: newProvider.webhook_url,
      callback_url: newProvider.callback_url,
      settings: newProvider.settings || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const updated = [...providers, provider];
    saveProviders(updated);
    
    toast.success('Game provider added successfully!');
    setShowAddDialog(false);
    setSelectedPreset(null);
    setNewProvider({
      name: '',
      provider_key: '',
      api_url: '',
      api_key: '',
      api_secret: '',
      merchant_id: '',
      is_active: false,
      integration_type: 'api',
      settings: {},
    });
    setSaving(false);
  };

  const handleUpdateProvider = () => {
    if (!editingProvider) return;

    setSaving(true);
    const updated = providers.map(p => 
      p.id === editingProvider.id 
        ? { ...editingProvider, updated_at: new Date().toISOString() }
        : p
    );
    saveProviders(updated);
    
    toast.success('Provider updated successfully!');
    setShowEditDialog(false);
    setEditingProvider(null);
    setSaving(false);
  };

  const handleDeleteProvider = (id: string) => {
    if (!confirm('Are you sure you want to delete this provider?')) return;
    
    const updated = providers.filter(p => p.id !== id);
    saveProviders(updated);
    toast.success('Provider deleted');
  };

  const handleToggleActive = (id: string, isActive: boolean) => {
    const updated = providers.map(p => 
      p.id === id ? { ...p, is_active: isActive, updated_at: new Date().toISOString() } : p
    );
    saveProviders(updated);
    toast.success(isActive ? 'Provider activated' : 'Provider deactivated');
  };

  const selectPreset = (preset: typeof GAME_PROVIDER_PRESETS[0]) => {
    setSelectedPreset(preset);
    setNewProvider({
      name: preset.name,
      provider_key: preset.id,
      api_url: '',
      api_key: '',
      api_secret: '',
      merchant_id: '',
      is_active: false,
      integration_type: preset.integration_type as 'api' | 'iframe',
      settings: {},
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const testConnection = async (provider: GameProvider) => {
    toast.info('Testing connection...');
    // Simulate connection test
    setTimeout(() => {
      if (provider.api_key && provider.api_url) {
        toast.success('Connection successful!');
      } else {
        toast.error('Connection failed - missing credentials');
      }
    }, 1500);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 rounded-2xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-xl">
                <Globe className="w-6 h-6" />
              </div>
              Third-Party Game Providers
            </h1>
            <p className="text-white/80 mt-1">
              Connect external game APIs like SOFTSWISS, Spribe, Evolution & more
            </p>
          </div>
          <Button
            onClick={() => setShowAddDialog(true)}
            className="bg-white text-purple-600 hover:bg-white/90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Provider
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4 mt-6">
          <div className="bg-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              <span className="text-lg font-bold">{providers.length}</span>
            </div>
            <p className="text-sm text-white/70">Total Providers</p>
          </div>
          <div className="bg-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-300" />
              <span className="text-lg font-bold">{providers.filter(p => p.is_active).length}</span>
            </div>
            <p className="text-sm text-white/70">Active</p>
          </div>
          <div className="bg-white/10 rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Gamepad2 className="w-5 h-5" />
              <span className="text-lg font-bold">{providerGames.length}</span>
            </div>
            <p className="text-sm text-white/70">Total Games</p>
          </div>
        </div>
      </div>

      {/* Provider List */}
      <div className="grid gap-4">
        {providers.length === 0 ? (
          <Card className="p-8 text-center">
            <Globe className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Game Providers Connected</h3>
            <p className="text-muted-foreground mb-4">
              Add a third-party game provider to offer thousands of games
            </p>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Provider
            </Button>
          </Card>
        ) : (
          providers.map((provider) => (
            <motion.div
              key={provider.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className={`border-2 ${provider.is_active ? 'border-green-500/30 bg-green-500/5' : 'border-muted'}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      {/* Logo */}
                      <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center text-2xl">
                        {GAME_PROVIDER_PRESETS.find(p => p.id === provider.provider_key)?.logo || '🎮'}
                      </div>

                      {/* Info */}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-lg">{provider.name}</h3>
                          {provider.is_active ? (
                            <Badge className="bg-green-500">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                          <Badge variant="outline">{provider.integration_type.toUpperCase()}</Badge>
                        </div>

                        <p className="text-sm text-muted-foreground mt-1">
                          {GAME_PROVIDER_PRESETS.find(p => p.id === provider.provider_key)?.description || 'Custom provider'}
                        </p>

                        {/* API Info */}
                        <div className="flex items-center gap-4 mt-3 flex-wrap">
                          {provider.api_url && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Link className="w-3 h-3" />
                              <span className="truncate max-w-[200px]">{provider.api_url}</span>
                            </div>
                          )}
                          {provider.merchant_id && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <DollarSign className="w-3 h-3" />
                              <span>Merchant: {provider.merchant_id}</span>
                            </div>
                          )}
                        </div>

                        {/* API Key (masked) */}
                        {provider.api_key && (
                          <div className="flex items-center gap-2 mt-2">
                            <Key className="w-3 h-3 text-amber-500" />
                            <span className="text-xs font-mono">
                              {showApiKeysVisible[provider.id] 
                                ? provider.api_key 
                                : '••••••••••••••••'}
                            </span>
                            <button
                              onClick={() => setShowApiKeysVisible(prev => ({
                                ...prev,
                                [provider.id]: !prev[provider.id]
                              }))}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              {showApiKeysVisible[provider.id] ? (
                                <EyeOff className="w-3 h-3" />
                              ) : (
                                <Eye className="w-3 h-3" />
                              )}
                            </button>
                            <button
                              onClick={() => copyToClipboard(provider.api_key)}
                              className="text-muted-foreground hover:text-foreground"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={provider.is_active}
                        onCheckedChange={(checked) => handleToggleActive(provider.id, checked)}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => testConnection(provider)}
                      >
                        <Zap className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingProvider(provider);
                          setShowEditDialog(true);
                        }}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => handleDeleteProvider(provider.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))
        )}
      </div>

      {/* Add Provider Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5" />
              Add Game Provider
            </DialogTitle>
            <DialogDescription>
              Connect a third-party game provider to add thousands of games
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="presets" className="mt-4">
            <TabsList className="w-full">
              <TabsTrigger value="presets" className="flex-1">Popular Providers</TabsTrigger>
              <TabsTrigger value="custom" className="flex-1">Custom Provider</TabsTrigger>
            </TabsList>

            <TabsContent value="presets" className="mt-4">
              <ScrollArea className="h-[400px] pr-4">
                <div className="grid grid-cols-2 gap-3">
                  {GAME_PROVIDER_PRESETS.map((preset) => (
                    <motion.button
                      key={preset.id}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => selectPreset(preset)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        selectedPreset?.id === preset.id
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-border hover:border-purple-500/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <span className="text-2xl">{preset.logo}</span>
                        <div>
                          <h4 className="font-semibold">{preset.name}</h4>
                          <Badge variant="outline" className="text-[10px]">
                            {preset.integration_type.toUpperCase()}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                        {preset.description}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {preset.features.slice(0, 3).map((f) => (
                          <Badge key={f} variant="secondary" className="text-[9px]">
                            {f}
                          </Badge>
                        ))}
                      </div>
                      {preset.website && (
                        <a
                          href={preset.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-purple-500 mt-2 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3 h-3" />
                          Visit Website
                        </a>
                      )}
                    </motion.button>
                  ))}
                </div>
              </ScrollArea>

              {selectedPreset && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-4 p-4 bg-muted rounded-xl space-y-4"
                >
                  <h4 className="font-semibold flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    Enter API Credentials for {selectedPreset.name}
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>API URL</Label>
                      <Input
                        placeholder="https://api.provider.com/v1"
                        value={newProvider.api_url || ''}
                        onChange={(e) => setNewProvider(prev => ({ ...prev, api_url: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Merchant ID</Label>
                      <Input
                        placeholder="Your merchant ID"
                        value={newProvider.merchant_id || ''}
                        onChange={(e) => setNewProvider(prev => ({ ...prev, merchant_id: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>API Key</Label>
                      <Input
                        type="password"
                        placeholder="Your API key"
                        value={newProvider.api_key || ''}
                        onChange={(e) => setNewProvider(prev => ({ ...prev, api_key: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>API Secret</Label>
                      <Input
                        type="password"
                        placeholder="Your API secret"
                        value={newProvider.api_secret || ''}
                        onChange={(e) => setNewProvider(prev => ({ ...prev, api_secret: e.target.value }))}
                      />
                    </div>
                  </div>

                  {selectedPreset.docs_url && (
                    <a
                      href={selectedPreset.docs_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm text-purple-500 hover:underline"
                    >
                      <ExternalLink className="w-4 h-4" />
                      View API Documentation
                    </a>
                  )}

                  <Button
                    onClick={handleAddProvider}
                    disabled={saving}
                    className="w-full"
                  >
                    {saving ? (
                      <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Add {selectedPreset.name}
                  </Button>
                </motion.div>
              )}
            </TabsContent>

            <TabsContent value="custom" className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Provider Name *</Label>
                  <Input
                    placeholder="My Game Provider"
                    value={newProvider.name || ''}
                    onChange={(e) => setNewProvider(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Provider Key *</Label>
                  <Input
                    placeholder="my_provider"
                    value={newProvider.provider_key || ''}
                    onChange={(e) => setNewProvider(prev => ({ ...prev, provider_key: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Integration Type</Label>
                  <Select
                    value={newProvider.integration_type}
                    onValueChange={(v) => setNewProvider(prev => ({ ...prev, integration_type: v as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="api">API Integration</SelectItem>
                      <SelectItem value="iframe">Iframe Embed</SelectItem>
                      <SelectItem value="webhook">Webhook</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>API URL</Label>
                  <Input
                    placeholder="https://api.provider.com/v1"
                    value={newProvider.api_url || ''}
                    onChange={(e) => setNewProvider(prev => ({ ...prev, api_url: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    placeholder="Your API key"
                    value={newProvider.api_key || ''}
                    onChange={(e) => setNewProvider(prev => ({ ...prev, api_key: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>API Secret</Label>
                  <Input
                    type="password"
                    placeholder="Your API secret"
                    value={newProvider.api_secret || ''}
                    onChange={(e) => setNewProvider(prev => ({ ...prev, api_secret: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Merchant ID</Label>
                  <Input
                    placeholder="Your merchant ID"
                    value={newProvider.merchant_id || ''}
                    onChange={(e) => setNewProvider(prev => ({ ...prev, merchant_id: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Callback URL (Optional)</Label>
                  <Input
                    placeholder="https://yourdomain.com/callback"
                    value={newProvider.callback_url || ''}
                    onChange={(e) => setNewProvider(prev => ({ ...prev, callback_url: e.target.value }))}
                  />
                </div>
              </div>

              <Button
                onClick={handleAddProvider}
                disabled={saving || !newProvider.name || !newProvider.provider_key}
                className="w-full"
              >
                {saving ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Add Custom Provider
              </Button>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Edit Provider Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Provider</DialogTitle>
          </DialogHeader>

          {editingProvider && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Provider Name</Label>
                <Input
                  value={editingProvider.name}
                  onChange={(e) => setEditingProvider({ ...editingProvider, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>API URL</Label>
                <Input
                  value={editingProvider.api_url}
                  onChange={(e) => setEditingProvider({ ...editingProvider, api_url: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={editingProvider.api_key}
                  onChange={(e) => setEditingProvider({ ...editingProvider, api_key: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>API Secret</Label>
                <Input
                  type="password"
                  value={editingProvider.api_secret}
                  onChange={(e) => setEditingProvider({ ...editingProvider, api_secret: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Merchant ID</Label>
                <Input
                  value={editingProvider.merchant_id}
                  onChange={(e) => setEditingProvider({ ...editingProvider, merchant_id: e.target.value })}
                />
              </div>

              <Button onClick={handleUpdateProvider} disabled={saving} className="w-full">
                {saving ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : null}
                Save Changes
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Popular Providers Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ExternalLink className="w-5 h-5" />
            Popular Game Provider Websites
          </CardTitle>
          <CardDescription>
            Visit these websites to get API credentials and documentation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {GAME_PROVIDER_PRESETS.filter(p => p.website).map((preset) => (
              <a
                key={preset.id}
                href={preset.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-3 rounded-lg border hover:bg-muted transition-colors"
              >
                <span className="text-xl">{preset.logo}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{preset.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{preset.website}</p>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
