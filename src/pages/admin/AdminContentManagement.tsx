import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { Video, Film, Play, Image, FileText } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";

// Import existing components
import AdminStreams from "./AdminStreams";
import AdminRecordings from "./AdminRecordings";
import AdminReels from "./AdminReels";
import AdminBanners from "./AdminBanners";
import AdminContent from "./AdminContent";

/**
 * UNIFIED CONTENT MANAGEMENT PAGE
 * 
 * Consolidates all content/media related admin pages:
 * - Live Streams (active streaming moderation)
 * - Recordings (stream recordings)
 * - Reels (short video content)
 * - Banners (promotional banners)
 * - Content Pages (static content)
 * 
 * Single Source of Truth: Edit here = Updates everywhere
 */
export default function AdminContentManagement() {
  const [activeTab, setActiveTab] = useState("streams");
  const [stats, setStats] = useState({
    activeStreams: 0,
    totalRecordings: 0,
    pendingReels: 0,
    activeBanners: 0
  });

  useAdminRealtime(['live_streams', 'stream_recordings', 'reels', 'banners'], () => fetchStats());

  const fetchStats = async () => {
    const [streamsRes, recordingsRes, reelsRes, bannersRes] = await Promise.all([
      supabase.from('live_streams').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('stream_recordings').select('id', { count: 'exact', head: true }),
      supabase.from('reels').select('id', { count: 'exact', head: true }).eq('is_approved', false),
      supabase.from('banners').select('id', { count: 'exact', head: true }).eq('is_active', true)
    ]);

    setStats({
      activeStreams: streamsRes.count || 0,
      totalRecordings: recordingsRes.count || 0,
      pendingReels: reelsRes.count || 0,
      activeBanners: bannersRes.count || 0
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-red-950/20 to-slate-950 p-4 md:p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-xl bg-gradient-to-br from-red-500 to-pink-500">
            <Video className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Content Management</h1>
            <p className="text-slate-400 text-sm">
              Manage streams, recordings, reels, banners & content
            </p>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-red-500/20">
              <Video className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Live Streams</p>
              <p className="text-white font-bold text-xl">{stats.activeStreams}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/20">
              <Film className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Recordings</p>
              <p className="text-white font-bold text-xl">{stats.totalRecordings}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <Play className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Pending Reels</p>
              <p className="text-white font-bold text-xl">{stats.pendingReels}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20">
              <Image className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-slate-400 text-xs">Active Banners</p>
              <p className="text-white font-bold text-xl">{stats.activeBanners}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-900/80 border border-slate-800 p-1 h-auto flex-wrap">
          <TabsTrigger 
            value="streams" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-red-500 data-[state=active]:to-rose-500 data-[state=active]:text-white gap-2"
          >
            <Video className="w-4 h-4" />
            Live Streams
            {stats.activeStreams > 0 && (
              <Badge className="bg-red-500/30 text-red-300 ml-1">{stats.activeStreams}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="recordings" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-blue-500 data-[state=active]:to-indigo-500 data-[state=active]:text-white gap-2"
          >
            <Film className="w-4 h-4" />
            Recordings
          </TabsTrigger>
          <TabsTrigger 
            value="reels" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-purple-500 data-[state=active]:to-violet-500 data-[state=active]:text-white gap-2"
          >
            <Play className="w-4 h-4" />
            Reels
            {stats.pendingReels > 0 && (
              <Badge className="bg-purple-500/30 text-purple-300 ml-1">{stats.pendingReels}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger 
            value="banners" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-amber-500 data-[state=active]:to-orange-500 data-[state=active]:text-white gap-2"
          >
            <Image className="w-4 h-4" />
            Banners
          </TabsTrigger>
          <TabsTrigger 
            value="content" 
            className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-green-500 data-[state=active]:to-emerald-500 data-[state=active]:text-white gap-2"
          >
            <FileText className="w-4 h-4" />
            Content Pages
          </TabsTrigger>
        </TabsList>

        <TabsContent value="streams" className="mt-0">
          <Card className="bg-slate-900/30 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-white">
                <Video className="w-5 h-5 text-red-400" />
                Live Streams
                <Badge variant="outline" className="ml-2 text-red-400 border-red-500/50">
                  Moderation
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminStreams />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recordings" className="mt-0">
          <Card className="bg-slate-900/30 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-white">
                <Film className="w-5 h-5 text-blue-400" />
                Stream Recordings
                <Badge variant="outline" className="ml-2 text-blue-400 border-blue-500/50">
                  Archive
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminRecordings />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="reels" className="mt-0">
          <Card className="bg-slate-900/30 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-white">
                <Play className="w-5 h-5 text-purple-400" />
                Reels Management
                <Badge variant="outline" className="ml-2 text-purple-400 border-purple-500/50">
                  Short Videos
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminReels />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="banners" className="mt-0">
          <Card className="bg-slate-900/30 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-white">
                <Image className="w-5 h-5 text-amber-400" />
                Promotional Banners
                <Badge variant="outline" className="ml-2 text-amber-400 border-amber-500/50">
                  Marketing
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminBanners />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="content" className="mt-0">
          <Card className="bg-slate-900/30 border-slate-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2 text-white">
                <FileText className="w-5 h-5 text-green-400" />
                Content Pages
                <Badge variant="outline" className="ml-2 text-green-400 border-green-500/50">
                  Static Content
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdminContent />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
