import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { PartyPopper, Users, Sparkles, Image } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";

import { formatAdminError } from "@/utils/formatAdminError";
// Import existing components
import AdminPartyRooms from "./AdminPartyRooms";
import AdminPartyBanners from "./AdminPartyBanners";
import AdminPartyBackgrounds from "./AdminPartyBackgrounds";
import { recordAdminError } from "@/utils/adminErrorLog";

/**
 * UNIFIED PARTY MANAGEMENT PAGE
 * 
 * Consolidates all party room-related admin pages:
 * - Party Rooms (active rooms, moderation)
 * - Party Banners (promotional banners in rooms)
 * - Party Backgrounds (room background images)
 * 
 * Single Source of Truth: Edit here = Updates everywhere
 */
export default function AdminPartyManagement() {
  const [activeTab, setActiveTab] = useState("rooms");
  const [stats, setStats] = useState({
    activeRooms: 0,
    totalBanners: 0,
    totalBackgrounds: 0
  });

  useAdminRealtime(['party_rooms', 'party_room_participants'], () => fetchStats());

  const fetchStats = async () => {
    // Pkg6: single server-side aggregation RPC
    try {
      const { data, error } = await supabase.rpc('admin_party_management_stats');
      if (error) throw error;
      const s = (data as any) || {};
      setStats({
        activeRooms: s.activeRooms || 0,
        totalBanners: s.totalBanners || 0,
        totalBackgrounds: s.totalBackgrounds || 0
      });
    } catch (e) {
      console.error('Error fetching party management stats:', e);
      recordAdminError({ kind: "rpc", label: "AdminPartyManagement.s", message: formatAdminError(e)) });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-pink-950/20 to-slate-950 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-pink-500 to-purple-500">
            <PartyPopper className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Party Management</h1>
            <p className="text-slate-400 text-sm">
              Manage party rooms, banners, and backgrounds
            </p>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-pink-500/20">
              <Users className="w-5 h-5 text-pink-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Active Rooms</p>
              <p className="text-white font-bold text-xl">{stats.activeRooms}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Active Banners</p>
              <p className="text-white font-bold text-xl">{stats.totalBanners}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Image className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Backgrounds</p>
              <p className="text-white font-bold text-xl">{stats.totalBackgrounds}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-900/80 border border-slate-800 p-1 h-auto flex-wrap">
          <TabsTrigger 
            value="rooms" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-pink-500 data-[state=active]:to-rose-500 data-[state=active]:text-white gap-2"
          >
            <Users className="w-4 h-4" />
            Party Rooms
            {stats.activeRooms > 0 && (
              <Badge className="bg-pink-500/30 text-pink-300 ml-1">{stats.activeRooms}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="banners" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-violet-500 data-[state=active]:text-white gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Banners
          </TabsTrigger>
          <TabsTrigger 
            value="backgrounds" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white gap-2"
          >
            <Image className="w-4 h-4" />
            Backgrounds
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rooms" className="mt-0">
          <Card className="bg-slate-900/30 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-white">
                <Users className="w-5 h-5 text-pink-400" />
                Party Rooms
                <Badge variant="outline" className="ml-2 text-pink-400 border-pink-500/50">
                  Live Moderation
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminPartyRooms />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="banners" className="mt-0">
          <Card className="bg-slate-900/30 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-white">
                <Sparkles className="w-5 h-5 text-purple-400" />
                Party Banners
                <Badge variant="outline" className="ml-2 text-purple-400 border-purple-500/50">
                  Promotional
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminPartyBanners />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backgrounds" className="mt-0">
          <Card className="bg-slate-900/30 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-white">
                <Image className="w-5 h-5 text-blue-400" />
                Party Backgrounds
                <Badge variant="outline" className="ml-2 text-blue-400 border-blue-500/50">
                  Customization
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminPartyBackgrounds />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
