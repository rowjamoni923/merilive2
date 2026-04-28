import { useState, useEffect, useMemo, useCallback } from "react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Eye, Search, RefreshCw, User, Star } from "lucide-react";
import { motion } from "framer-motion";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import AdminPagination from "@/components/admin/AdminPagination";

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

const PAGE_SIZE = 60;

export default function AdminOnlineUsers() {
  const [users, setUsers] = useState<OnlineUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Pkg9: server-side pagination + search via admin_list_online_users RPC.
  // Eliminates the 500-row direct profiles SELECT cap.
  const fetchOnlineUsers = useCallback(async () => {
    if (users.length === 0) setLoading(true);
    else setRefreshing(true);
    try {
      const { data, error } = await supabase.rpc("admin_list_online_users", {
        _search: search || null,
        _limit: PAGE_SIZE,
        _offset: (page - 1) * PAGE_SIZE,
      });
      if (error) throw error;
      const payload = (data as any) || {};
      setUsers((payload.rows || []) as OnlineUser[]);
      setTotal(Number(payload.total) || 0);
    } catch (e) {
      console.error("Error fetching online users:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, page, users.length]);

  // Debounce search input → search state
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    void fetchOnlineUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page]);

  useAdminRealtime(["profiles"], () => { void fetchOnlineUsers(); });

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hosts = useMemo(() => users.filter(u => u.is_host), [users]);
  const regular = useMemo(() => users.filter(u => !u.is_host), [users]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2">
            <Eye className="w-6 h-6 text-emerald-400" />
            Online Users
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 ml-2">
              {total.toLocaleString()} Online
            </Badge>
          </h1>
          <p className="text-sm text-slate-400 mt-1">Currently active users in the app</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search name or UID..."
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              className="pl-9 bg-slate-800 border-slate-700 text-white w-64"
            />
          </div>
          <Button onClick={() => void fetchOnlineUsers()} variant="outline" size="icon" className="border-slate-700">
            <RefreshCw className={`w-4 h-4 ${loading || refreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Online Hosts (current page) */}
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

      {/* Online Regular Users (current page) */}
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
          <AdminPagination
            page={page}
            totalPages={totalPages}
            totalCount={total}
            pageSize={PAGE_SIZE}
            refreshing={refreshing}
            onPageChange={setPage}
            className="mt-4"
          />
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
