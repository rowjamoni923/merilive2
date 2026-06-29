import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Palette, Image, MessageSquare, Gift, ShoppingBag, UserCog, Zap, Wand2 } from "lucide-react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";

import { formatAdminError } from "@/utils/formatAdminError";
// Import existing components as tab content
import AdminFrames from "./AdminFrames";
import AdminRoleFrames from "./AdminRoleFrames";
import AdminChatBubbles from "./AdminChatBubbles";

import AdminGifts from "./AdminGifts";
import AdminShop from "./AdminShop";
import AdminEntryEffects from "./AdminEntryEffects";
import AdminBeautyFilters from "./AdminBeautyFilters";
import { recordAdminError } from "@/utils/adminErrorLog";

const AdminVisualAssetsHub = () => {
  const [activeTab, setActiveTab] = useState("frames");
  const [stats, setStats] = useState({
    frames: 0,
    roleFrames: 0,
    chatBubbles: 0,
    animations: 0,
    gifts: 0,
    shopItems: 0
  });

  useAdminRealtime(['avatar_frames', 'role_frames', 'gifts', 'shop_items', 'entry_banners'], () => fetchStats());

  const fetchStats = async () => {
    // Pkg10: single RPC replaces 6 separate count queries
    const { data, error } = await supabase.rpc('admin_visual_assets_stats' as any);
    if (error || !data) {
      recordAdminError({ kind: "rpc", label: "AdminVisualAssetsHub.AdminvisualassetsstatsFailed", message: formatAdminError(error)});
      return;
    }
    const s: any = data;
    setStats({
      frames: Number(s.frames || 0),
      roleFrames: Number(s.role_frames || 0),
      chatBubbles: Number(s.chat_bubbles || 0),
      animations: Number(s.entry_banners || 0),
      gifts: Number(s.gifts || 0),
      shopItems: Number(s.shop_items || 0),
    });
  };

  return (
    <div className="admin-pro-shell space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center">
            <Palette className="w-8 h-8 text-slate-900" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Visual Assets Hub</h1>
            <p className="text-slate-700">Frames, Animations, Gifts & Shop Items</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-3 text-center">
            <Image className="w-6 h-6 mx-auto mb-1 text-blue-400" />
            <p className="text-xl font-bold text-foreground">{stats.frames}</p>
            <p className="text-[10px] text-muted-foreground">Frames</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-500/20">
          <CardContent className="p-3 text-center">
            <UserCog className="w-6 h-6 mx-auto mb-1 text-purple-400" />
            <p className="text-xl font-bold text-foreground">{stats.roleFrames}</p>
            <p className="text-[10px] text-muted-foreground">Role Frames</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/20">
          <CardContent className="p-3 text-center">
            <MessageSquare className="w-6 h-6 mx-auto mb-1 text-cyan-400" />
            <p className="text-xl font-bold text-foreground">{stats.chatBubbles}</p>
            <p className="text-[10px] text-muted-foreground">Chat Bubbles</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardContent className="p-3 text-center">
            <Gift className="w-6 h-6 mx-auto mb-1 text-amber-400" />
            <p className="text-xl font-bold text-foreground">{stats.gifts}</p>
            <p className="text-[10px] text-muted-foreground">Gifts</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-3 text-center">
            <ShoppingBag className="w-6 h-6 mx-auto mb-1 text-green-400" />
            <p className="text-xl font-bold text-foreground">{stats.shopItems}</p>
            <p className="text-[10px] text-muted-foreground">Shop Items</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-7 bg-white/50 p-1 h-auto">
          <TabsTrigger 
            value="frames" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-cyan-500 data-[state=active]:text-white py-2 text-[10px] sm:text-xs"
          >
            <Image className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
            <span className="hidden sm:inline">Frames</span>
          </TabsTrigger>
          <TabsTrigger 
            value="role-frames" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-pink-500 data-[state=active]:text-white py-2 text-[10px] sm:text-xs"
          >
            <UserCog className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
            <span className="hidden sm:inline">Roles</span>
          </TabsTrigger>
          <TabsTrigger 
            value="bubbles" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-cyan-500 data-[state=active]:to-teal-500 data-[state=active]:text-white py-2 text-[10px] sm:text-xs"
          >
            <MessageSquare className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
            <span className="hidden sm:inline">Bubbles</span>
          </TabsTrigger>
          <TabsTrigger 
            value="gifts" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white py-2 text-[10px] sm:text-xs"
          >
            <Gift className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
            <span className="hidden sm:inline">Gifts</span>
          </TabsTrigger>
          <TabsTrigger 
            value="shop" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white py-2 text-[10px] sm:text-xs"
          >
            <ShoppingBag className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
            <span className="hidden sm:inline">Shop</span>
          </TabsTrigger>
          <TabsTrigger 
            value="entry-effects" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-indigo-500 data-[state=active]:to-violet-500 data-[state=active]:text-white py-2 text-[10px] sm:text-xs"
          >
            <Zap className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
            <span className="hidden sm:inline">Entry</span>
          </TabsTrigger>
          <TabsTrigger 
            value="beauty" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-fuchsia-500 data-[state=active]:to-purple-500 data-[state=active]:text-white py-2 text-[10px] sm:text-xs"
          >
            <Wand2 className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
            <span className="hidden sm:inline">Beauty</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="frames" className="mt-0">
          <AdminFrames />
        </TabsContent>

        <TabsContent value="role-frames" className="mt-0">
          <AdminRoleFrames />
        </TabsContent>

        <TabsContent value="bubbles" className="mt-0">
          <AdminChatBubbles />
        </TabsContent>


        <TabsContent value="gifts" className="mt-0">
          <AdminGifts />
        </TabsContent>

        <TabsContent value="shop" className="mt-0">
          <AdminShop />
        </TabsContent>

        <TabsContent value="entry-effects" className="mt-0">
          <AdminEntryEffects />
        </TabsContent>

        <TabsContent value="beauty" className="mt-0">
          <AdminBeautyFilters />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminVisualAssetsHub;
