import { useState, useEffect } from "react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Eye, Search, RefreshCw, User, Star, Phone } from "lucide-react";
import { motion } from "framer-motion";
import useAdminRealtime from "@/hooks/useAdminRealtime";

interface OnlineUser {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  user_level: number | null;
  is_host: boolean | null;
  country_code: string | null;
  last_seen_at: string | null;
  app_uid: string | null;
}

export default function AdminOnlineUsers() {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchOnlineUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, user_level, is_host, country_code, last_seen_at, app_uid")
        .eq("is_online", true)
        .order("last_seen_at", { ascending: false })
        .limit(500);

      if (!error && data) setUsers(data);
    } catch (e) {
      console.error("Error fetching online users:", e);
    } finally {
      setLoading(false);
    }
  };

  
  useAdminRealtime(["profiles"], fetchOnlineUsers);

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (u.display_name?.toLowerCase().includes(q)) || (u.app_uid?.toLowerCase().includes(q));
  });

  const hosts = filtered.filter(u => u.is_host);
  const regular = filtered.filter(u => !u.is_host);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Eye className="w-6 h-6 text-emerald-400" />
            Online Users
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ml-2">
              {users.length} Online
            </Badge>
          </h1>
          <p className="text-sm text-slate-400 mt-1">Currently active users in the app</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search name or UID..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9 bg-slate-800 border-slate-700 text-white w-64"
            />
          </div>
          <Button onClick={fetchOnlineUsers} variant="outline" size="icon" className="border-slate-700">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Online Hosts */}
      {hosts.length > 0 && (
        <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-emerald-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-lg flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-400" />
              Online Hosts ({hosts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {hosts.map((user, i) => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-700/50 border border-slate-600/50 hover:border-emerald-500/40 transition-all"
                >
                  <div className="relative">
                    <Avatar className="w-10 h-10 ring-2 ring-emerald-500/50">
                      <AvatarImage src={user.avatar_url || ""} />
                      <AvatarFallback className="bg-emerald-900 text-emerald-300 text-xs">
                        {user.display_name?.[0] || "H"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-800" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{user.display_name || "Unknown"}</p>
                    <p className="text-[10px] text-slate-400">UID: {user.app_uid || "N/A"} • Lv.{user.user_level || 0}</p>
                  </div>
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px]">Host</Badge>
                </motion.div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Online Regular Users */}
      <Card className="bg-gradient-to-br from-slate-800 to-slate-900 border-slate-700/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-lg flex items-center gap-2">
            <User className="w-5 h-5 text-blue-400" />
            Online Users ({regular.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {regular.length === 0 && !loading ? (
            <p className="text-center text-slate-500 py-8">No regular users online</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {regular.map((user, i) => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.01 }}
                  className="flex items-center gap-3 p-3 rounded-xl bg-slate-700/50 border border-slate-600/50 hover:border-blue-500/40 transition-all"
                >
                  <div className="relative">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={user.avatar_url || ""} />
                      <AvatarFallback className="bg-slate-700 text-slate-300 text-xs">
                        {user.display_name?.[0] || "U"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-slate-800" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-white truncate">{user.display_name || "Unknown"}</p>
                    <p className="text-[10px] text-slate-400">UID: {user.app_uid || "N/A"} • Lv.{user.user_level || 0}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
