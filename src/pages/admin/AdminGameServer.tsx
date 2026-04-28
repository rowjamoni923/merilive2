import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Server, 
  Power, 
  Activity, 
  Settings2,
  Loader2, 
  Play,
  Pause,
  RefreshCcw,
  AlertTriangle,
  Clock,
  Users,
  Coins,
  TrendingUp,
  Gamepad2,
  Zap,
  BarChart3,
  DollarSign,
  Trophy,
  Target
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LivePulse } from "@/components/realtime/RealtimeIndicator";

interface GameServerSettings {
  id: string;
  server_name: string;
  is_active: boolean;
  global_house_edge: number;
  max_total_payout_per_round: number;
  maintenance_mode: boolean;
  maintenance_message: string | null;
  auto_process_enabled: boolean;
  round_interval_seconds: number;
  betting_duration_seconds: number;
}

interface GameRoundStats {
  game_id: string;
  game_name: string;
  game_emoji: string;
  total_rounds: number;
  total_wagered: number;
  total_players: number;
  active_rounds: number;
  last_round_at: string;
}

interface LiveRound {
  id: string;
  game_id: string;
  round_number: number;
  status: string;
  total_bet_amount: number;
  total_players: number;
  created_at: string;
}

export default function AdminGameServer() {
  const [settings, setSettings] = useState<GameServerSettings | null>(null);
  const [roundStats, setRoundStats] = useState<GameRoundStats[]>([]);
  const [liveRounds, setLiveRounds] = useState<LiveRound[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const fetchData = async () => {
    setLoading(true);
    await Promise.all([fetchSettings(), fetchRoundStats(), fetchLiveRounds()]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);
  useAdminRealtime(['game_server_settings'], fetchData, 'admin-game-server-rt', { enableRealtimeRefresh: true });

  const fetchSettings = async () => {
    const { data, error } = await supabase
      .from('game_server_settings')
      .select('*')
      .limit(1)
      .single();
    
    if (!error && data) {
      setSettings(data as GameServerSettings);
    }
  };

  const fetchRoundStats = async () => {
    const { data, error } = await supabase
      .from('game_rounds_stats')
      .select('*');
    
    if (!error && data) {
      setRoundStats(data as GameRoundStats[]);
    }
  };

  const fetchLiveRounds = async () => {
    const { data, error } = await supabase
      .from('live_game_rounds')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(20);
    
    if (!error && data) {
      setLiveRounds(data as LiveRound[]);
    }
  };

  const updateSettings = async (updates: Partial<GameServerSettings>) => {
    if (!settings) return;
    
    setSaving(true);
    const { error } = await supabase
      .from('game_server_settings')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', settings.id);
    
    if (error) {
      toast.error('Failed to update settings');
    } else {
      setSettings({ ...settings, ...updates });
      toast.success('Settings updated');
    }
    setSaving(false);
  };

  const totalStats = {
    totalRounds: roundStats.reduce((a, s) => a + (s.total_rounds || 0), 0),
    totalWagered: roundStats.reduce((a, s) => a + (s.total_wagered || 0), 0),
    totalPlayers: roundStats.reduce((a, s) => a + (s.total_players || 0), 0),
    activeRounds: liveRounds.length
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-2 md:p-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
            <div className="p-2 rounded-xl bg-gradient-to-br from-green-500 to-emerald-500">
              <Server className="w-5 h-5 md:w-6 md:h-6 text-white" />
            </div>
            Game Server Control
            {settings?.is_active && !settings?.maintenance_mode && (
              <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                <LivePulse size="sm" /> Online
              </Badge>
            )}
            {settings?.maintenance_mode && (
              <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/30">
                <AlertTriangle className="w-3 h-3 mr-1" /> Maintenance
              </Badge>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Control game server, rounds, and real-time game management
          </p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm">
          <RefreshCcw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Activity className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Active Rounds</p>
                <p className="text-2xl font-bold text-blue-500">{totalStats.activeRounds}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <BarChart3 className="w-5 h-5 text-purple-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">24h Rounds</p>
                <p className="text-2xl font-bold text-purple-500">{totalStats.totalRounds.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/20 rounded-lg">
                <Coins className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">24h Wagered</p>
                <p className="text-2xl font-bold text-amber-500">{totalStats.totalWagered.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Users className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">24h Players</p>
                <p className="text-2xl font-bold text-green-500">{totalStats.totalPlayers.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="w-full md:w-auto">
          <TabsTrigger value="overview">
            <Activity className="w-4 h-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings2 className="w-4 h-4 mr-2" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="live">
            <Zap className="w-4 h-4 mr-2" />
            Live Rounds
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {/* Server Status Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="w-5 h-5" />
                Server Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-12 h-12 rounded-full flex items-center justify-center",
                    settings?.is_active && !settings?.maintenance_mode
                      ? "bg-green-500/20"
                      : "bg-red-500/20"
                  )}>
                    <Power className={cn(
                      "w-6 h-6",
                      settings?.is_active && !settings?.maintenance_mode
                        ? "text-green-500"
                        : "text-red-500"
                    )} />
                  </div>
                  <div>
                    <p className="font-bold">{settings?.server_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {settings?.is_active && !settings?.maintenance_mode 
                        ? "All systems operational" 
                        : settings?.maintenance_mode 
                          ? "Under maintenance"
                          : "Server offline"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={settings?.is_active ? "destructive" : "default"}
                    size="sm"
                    onClick={() => updateSettings({ is_active: !settings?.is_active })}
                    disabled={saving}
                  >
                    {settings?.is_active ? (
                      <>
                        <Pause className="w-4 h-4 mr-1" /> Stop
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-1" /> Start
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateSettings({ maintenance_mode: !settings?.maintenance_mode })}
                    disabled={saving}
                  >
                    <AlertTriangle className="w-4 h-4 mr-1" />
                    {settings?.maintenance_mode ? "End Maintenance" : "Maintenance"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Game Stats by Category */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gamepad2 className="w-5 h-5" />
                Game Statistics (24h)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {roundStats.map((stat) => (
                  <motion.div
                    key={stat.game_id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-4 rounded-lg border bg-card hover:shadow-lg transition-all"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-2xl">{stat.game_emoji || '🎮'}</span>
                      <div>
                        <p className="font-bold">{stat.game_name || stat.game_id}</p>
                        {stat.active_rounds > 0 && (
                          <Badge className="bg-green-500/20 text-green-500 text-[10px]">
                            <LivePulse size="sm" /> {stat.active_rounds} active
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-muted-foreground text-xs">Rounds</p>
                        <p className="font-bold">{stat.total_rounds}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground text-xs">Players</p>
                        <p className="font-bold">{stat.total_players}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-muted-foreground text-xs">Wagered</p>
                        <p className="font-bold text-amber-500">{(stat.total_wagered || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}

                {roundStats.length === 0 && (
                  <div className="col-span-full text-center py-8 text-muted-foreground">
                    No game activity in the last 24 hours
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Global Game Settings</CardTitle>
              <CardDescription>Configure server-wide game parameters</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* House Edge */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Global House Edge</p>
                    <p className="text-sm text-muted-foreground">Default profit margin for all games</p>
                  </div>
                  <Badge className="bg-green-500/20 text-green-500">
                    {settings?.global_house_edge || 5}%
                  </Badge>
                </div>
                <Slider
                  value={[settings?.global_house_edge || 5]}
                  onValueChange={(val) => setSettings(s => s ? { ...s, global_house_edge: val[0] } : null)}
                  onValueCommit={(val) => updateSettings({ global_house_edge: val[0] })}
                  max={20}
                  min={1}
                  step={0.5}
                />
              </div>

              {/* Max Payout */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Max Payout Per Round</p>
                    <p className="text-sm text-muted-foreground">Maximum coins that can be won in a single round</p>
                  </div>
                </div>
                <Input
                  type="number"
                  value={settings?.max_total_payout_per_round || 10000000}
                  onChange={(e) => setSettings(s => s ? { ...s, max_total_payout_per_round: parseInt(e.target.value) || 0 } : null)}
                  onBlur={(e) => updateSettings({ max_total_payout_per_round: parseInt(e.target.value) || 10000000 })}
                />
              </div>

              {/* Timing Settings */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div>
                    <p className="font-medium">Round Interval (seconds)</p>
                    <p className="text-sm text-muted-foreground">Time between rounds</p>
                  </div>
                  <Input
                    type="number"
                    value={settings?.round_interval_seconds || 20}
                    onChange={(e) => setSettings(s => s ? { ...s, round_interval_seconds: parseInt(e.target.value) || 20 } : null)}
                    onBlur={(e) => updateSettings({ round_interval_seconds: parseInt(e.target.value) || 20 })}
                  />
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="font-medium">Betting Duration (seconds)</p>
                    <p className="text-sm text-muted-foreground">Time allowed for placing bets</p>
                  </div>
                  <Input
                    type="number"
                    value={settings?.betting_duration_seconds || 15}
                    onChange={(e) => setSettings(s => s ? { ...s, betting_duration_seconds: parseInt(e.target.value) || 15 } : null)}
                    onBlur={(e) => updateSettings({ betting_duration_seconds: parseInt(e.target.value) || 15 })}
                  />
                </div>
              </div>

              {/* Auto Process */}
              <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium">Auto Process Rounds</p>
                  <p className="text-sm text-muted-foreground">Automatically process game results</p>
                </div>
                <Switch
                  checked={settings?.auto_process_enabled}
                  onCheckedChange={(checked) => updateSettings({ auto_process_enabled: checked })}
                />
              </div>

              {/* Maintenance Message */}
              {settings?.maintenance_mode && (
                <div className="space-y-3">
                  <div>
                    <p className="font-medium">Maintenance Message</p>
                    <p className="text-sm text-muted-foreground">Message shown to users during maintenance</p>
                  </div>
                  <Input
                    value={settings?.maintenance_message || ''}
                    onChange={(e) => setSettings(s => s ? { ...s, maintenance_message: e.target.value } : null)}
                    onBlur={(e) => updateSettings({ maintenance_message: e.target.value })}
                    placeholder="Server under maintenance, please try again later..."
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Live Rounds Tab */}
        <TabsContent value="live" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                Active Game Rounds
                <Badge className="ml-2">{liveRounds.length} active</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <AnimatePresence>
                  {liveRounds.map((round) => (
                    <motion.div
                      key={round.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                          <Gamepad2 className="w-5 h-5 text-purple-500" />
                        </div>
                        <div>
                          <p className="font-medium">{round.game_id}</p>
                          <p className="text-sm text-muted-foreground">
                            Round #{round.round_number}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <div className="text-center">
                          <p className="text-muted-foreground text-xs">Players</p>
                          <p className="font-bold">{round.total_players}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-muted-foreground text-xs">Pool</p>
                          <p className="font-bold text-amber-500">{round.total_bet_amount.toLocaleString()}</p>
                        </div>
                        <Badge className="bg-green-500/20 text-green-500">
                          <LivePulse size="sm" /> {round.status}
                        </Badge>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>

                {liveRounds.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No active game rounds
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
