import { useState, useEffect, lazy, Suspense } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Gamepad2, Settings2, Server, Globe, Trophy, Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";

// Lazy import the existing components
import AdminGameSettings from "./AdminGameSettings";
import AdminGameProviders from "./AdminGameProviders";
import AdminGameServer from "./AdminGameServer";
const AdminGameLeaderboard = lazy(() => import("./AdminGameLeaderboard"));

/**
 * UNIFIED GAME MANAGEMENT PAGE
 * 
 * Consolidates all game-related admin pages:
 * - Game Settings (individual game configs)
 * - Game Providers (third-party integrations)
 * - Game Server (server status & controls)
 * - Leaderboard & Rewards (rankings + reward sending)
 * 
 * Single Source of Truth: Edit here = Updates everywhere
 */
export default function AdminGameManagement() {
  const [activeTab, setActiveTab] = useState("settings");
  const [stats, setStats] = useState({
    activeGames: 0,
    providers: 0,
    serverStatus: "online"
  });

  useAdminRealtime(['game_settings', 'game_providers'], () => fetchStats());

  const fetchStats = async () => {
    const [gamesRes, providersRes] = await Promise.all([
      supabase.from('game_settings').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('game_providers').select('id', { count: 'exact', head: true }).eq('is_active', true)
    ]);

    setStats({
    });
  };

  return (
    <div className="admin-pro-shell p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500">
            <Gamepad2 className="w-6 h-6 text-slate-900" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Game Management</h1>
            <p className="text-slate-400 text-sm">
              Manage all game settings, providers, server & leaderboard
            </p>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="bg-white/50 border-slate-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Settings2 className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Active Games</p>
              <p className="text-slate-900 font-bold text-xl">{stats.activeGames}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-white/50 border-slate-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-green-500/20">
              <Globe className="w-5 h-5 text-green-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Providers</p>
              <p className="text-slate-900 font-bold text-xl">{stats.providers}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-white/50 border-slate-200">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-500/20">
              <Server className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Server</p>
              <p className="text-slate-900 font-bold text-xl capitalize">{stats.serverStatus}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-white/80 border border-slate-200 p-1 h-auto flex-wrap">
          <TabsTrigger 
            value="settings" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-purple-500 data-[state=active]:text-white gap-2"
          >
            <Settings2 className="w-4 h-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger 
            value="leaderboard" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-yellow-500 data-[state=active]:text-black gap-2"
          >
            <Trophy className="w-4 h-4" />
            Leaderboard
          </TabsTrigger>
          <TabsTrigger 
            value="providers" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white gap-2"
          >
            <Globe className="w-4 h-4" />
            Providers
          </TabsTrigger>
          <TabsTrigger 
            value="server" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-orange-500 data-[state=active]:to-red-500 data-[state=active]:text-white gap-2"
          >
            <Server className="w-4 h-4" />
            Server
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="mt-0">
          <Card className="bg-white/30 border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                <Settings2 className="w-5 h-5 text-blue-400" />
                Game Settings
                <Badge variant="outline" className="ml-2 text-blue-400 border-blue-500/50">
                  Native & External
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminGameSettings />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-0">
          <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-amber-400" /></div>}>
            <AdminGameLeaderboard />
          </Suspense>
        </TabsContent>

        <TabsContent value="providers" className="mt-0">
          <Card className="bg-white/30 border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                <Globe className="w-5 h-5 text-green-400" />
                Game Providers
                <Badge variant="outline" className="ml-2 text-green-400 border-green-500/50">
                  Third-Party APIs
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminGameProviders />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="server" className="mt-0">
          <Card className="bg-white/30 border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-slate-900">
                <Server className="w-5 h-5 text-orange-400" />
                Game Server
                <Badge variant="outline" className="ml-2 text-orange-400 border-orange-500/50">
                  Live Control
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminGameServer />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
