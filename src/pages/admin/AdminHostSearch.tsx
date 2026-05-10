import { useState, useEffect, useCallback } from "react";
import { useAdminRealtime } from "@/hooks/useAdminRealtime";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Search,
  Users,
  Building2,
  Phone,
  Calendar,
  Clock,
  Coins,
  CheckCircle,
  Ban,
  Crown,
  ArrowLeft,
  UserCheck,
  Activity
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { enUS } from "date-fns/locale";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
interface HostResult {
  id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  is_online: boolean | null;
  is_verified: boolean | null;
  is_host: boolean | null;
  is_blocked: boolean | null;
  total_earnings: number | null;
  total_call_minutes: number | null;
  total_calls_received: number | null;
  country_flag: string | null;
  created_at: string | null;
  agency_id: string | null;
}

interface AgencyInfo {
  id: string;
  name: string;
  agency_code: string;
  level: string | null;
  owner?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface AgencyHostInfo {
  joined_at: string | null;
  joined_via: string | null;
  status: string | null;
}

export default function AdminHostSearch() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get("uid") || "");
  const [host, setHost] = useState<HostResult | null>(null);
  const [agency, setAgency] = useState<AgencyInfo | null>(null);
  const [agencyHostInfo, setAgencyHostInfo] = useState<AgencyHostInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Realtime: auto-refresh search results when profiles change
  const refreshSearch = useCallback(() => {
    if (searched && searchQuery.trim()) handleSearch();
  }, [searched, searchQuery]);
  useAdminRealtime(['profiles'], refreshSearch, 'admin-host-search-rt');

  useEffect(() => {
    if (searchParams.get("uid")) {
      handleSearch();
    }
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter an ID");
      return;
    }

    setLoading(true);
    setSearched(true);
    setHost(null);
    setAgency(null);
    setAgencyHostInfo(null);

    try {
      const trimmedQuery = searchQuery.trim();
      let hostData = null;
      let hostError = null;

      // First try exact match on app_uid (for numeric UIDs like 1401318700)
      const { data: exactUidMatch, error: exactError } = await supabase
        .from("profiles")
        .select("*")
        .eq("is_host", true)
        .eq("app_uid", trimmedQuery)
        .limit(1)
        .maybeSingle();
      
      if (exactUidMatch) {
        hostData = exactUidMatch;
      } else {
        // Check if it's a full UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(trimmedQuery)) {
          const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("is_host", true)
            .eq("id", trimmedQuery)
            .limit(1)
            .maybeSingle();
          hostData = data;
          hostError = error;
        } else {
          // Search by partial app_uid, name, or username
          const { data, error } = await supabase
            .from("profiles")
            .select("*")
            .eq("is_host", true)
            .or(`app_uid.ilike.%${trimmedQuery}%,display_name.ilike.%${trimmedQuery}%,username.ilike.%${trimmedQuery}%`)
            .limit(1)
            .maybeSingle();
          hostData = data;
          hostError = error;
        }
      }

      if (hostError || !hostData) {
        toast.error("Host not found");
        setLoading(false);
        return;
      }

      setHost(hostData);

      // Fetch agency info if host has agency_id
      if (hostData.agency_id) {
        const { data: agencyData } = await supabase
          .from("agencies")
          .select(`
            id, name, agency_code, level,
            owner:profiles!agencies_owner_id_fkey(display_name, avatar_url)
          `)
          .eq("id", hostData.agency_id)
          .maybeSingle();

        // Transform owner from array to object
        const transformedAgency = agencyData ? {
          ...agencyData,
          owner: Array.isArray(agencyData.owner) ? agencyData.owner[0] : agencyData.owner
        } : null;
        setAgency(transformedAgency);

        // Fetch agency host join info
        const { data: joinData } = await supabase
          .from("agency_hosts")
          .select("joined_at, joined_via, status")
          .eq("host_id", hostData.id)
          .eq("agency_id", hostData.agency_id)
          .maybeSingle();

        setAgencyHostInfo(joinData);
      }
    } catch (error) {
      recordAdminError({ kind: "rpc", label: "AdminHostSearch.SearchError", message: formatAdminError(error)});
      toast.error("Search failed");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600 rounded-2xl p-6 shadow-lg">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/admin/agencies")}
            className="text-white/80 hover:text-white hover:bg-white/20"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-white">Host Search</h1>
            <p className="text-white/80">View complete host info by UID</p>
          </div>
        </div>
      </div>

      {/* Search Box */}
      <Card className="bg-slate-900 border-slate-700/50 shadow-lg">
        <CardContent className="p-6">
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <Input
                placeholder="Search by Host ID (UID) or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={handleKeyPress}
                className="pl-12 h-12 bg-slate-800 border-slate-600 text-white text-lg placeholder:text-slate-500"
              />
            </div>
            <Button
              onClick={handleSearch}
              disabled={loading}
              className="h-12 px-8 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 text-white"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Search className="w-5 h-5 mr-2" />
                  Search
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : searched && !host ? (
        <Card className="bg-slate-900 border-slate-700/50 shadow-lg">
          <CardContent className="flex flex-col items-center justify-center h-64 text-slate-400">
            <Users className="w-12 h-12 mb-4" />
            <p>No host found</p>
            <p className="text-sm mt-2 text-slate-500">Try a different ID</p>
          </CardContent>
        </Card>
      ) : host ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Host Profile Card */}
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Avatar */}
                <div className="text-center md:text-left">
                  <div className="relative inline-block">
                    <Avatar className="w-24 h-24 border-4 border-primary/30">
                      <AvatarImage src={host.avatar_url || undefined} />
                      <AvatarFallback className="bg-primary/20 text-primary text-3xl">
                        {host.display_name?.charAt(0) || "H"}
                      </AvatarFallback>
                    </Avatar>
                    {host.is_online && (
                      <div className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 rounded-full border-3 border-slate-900" />
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 space-y-4">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-2xl font-bold text-white">
                        {host.display_name || host.username || "Unknown"}
                      </h2>
                      {host.is_verified && (
                        <Badge className="bg-blue-500/20 text-blue-400 gap-1">
                          <CheckCircle className="w-3 h-3" /> Verified
                        </Badge>
                      )}
                      {host.is_blocked && (
                        <Badge variant="destructive" className="gap-1">
                          <Ban className="w-3 h-3" /> Blocked
                        </Badge>
                      )}
                      <Badge className={host.is_online ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}>
                        {host.is_online ? "Online" : "Offline"}
                      </Badge>
                    </div>
                    <p className="text-white/50 mt-1">{host.country_flag} {host.username}</p>
                  </div>

                  {/* Full ID */}
                  <div className="bg-white/5 rounded-lg p-3">
                    <p className="text-white/50 text-sm mb-1">Host ID (UID)</p>
                    <p className="text-white font-mono text-sm break-all">{host.id}</p>
                  </div>

                  {/* Stats Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <Coins className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                      <p className="text-white font-bold">{host.total_earnings?.toLocaleString() || 0}</p>
                      <p className="text-xs text-white/50">Total Earnings</p>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <Phone className="w-5 h-5 text-green-400 mx-auto mb-1" />
                      <p className="text-white font-bold">{host.total_calls_received || 0}</p>
                      <p className="text-xs text-white/50">Total Calls</p>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <Clock className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                      <p className="text-white font-bold">{host.total_call_minutes?.toLocaleString() || 0}</p>
                      <p className="text-xs text-white/50">Call Minutes</p>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 text-center">
                      <Calendar className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                      <p className="text-white font-bold text-sm">
                        {host.created_at ? format(new Date(host.created_at), "dd MMM yy", { locale: enUS }) : "N/A"}
                      </p>
                      <p className="text-xs text-white/50">Joined</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Agency Info Card */}
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Agency Info
              </CardTitle>
            </CardHeader>
            <CardContent>
              {agency ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center">
                      <Building2 className="w-7 h-7 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="text-white font-bold text-lg">{agency.name}</p>
                      <p className="text-white/50">#{agency.agency_code}</p>
                    </div>
                    <Badge className="bg-yellow-500/20 text-yellow-400 capitalize">
                      {agency.level || "Bronze"} Level
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/admin/agencies/${agency.id}`)}
                      className="bg-white/5 border-white/10 text-white"
                    >
                      View Agency
                    </Button>
                  </div>

                  {/* Join Details */}
                  {agencyHostInfo && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-white/5 rounded-lg p-4">
                        <p className="text-white/50 text-sm mb-1 flex items-center gap-2">
                          <Calendar className="w-4 h-4" /> Join Date
                        </p>
                        <p className="text-white font-medium">
                          {agencyHostInfo.joined_at 
                            ? format(new Date(agencyHostInfo.joined_at), "dd MMMM yyyy", { locale: enUS })
                            : "N/A"
                          }
                        </p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-4">
                        <p className="text-white/50 text-sm mb-1 flex items-center gap-2">
                          <Clock className="w-4 h-4" /> Duration
                        </p>
                        <p className="text-white font-medium">
                          {agencyHostInfo.joined_at 
                            ? formatDistanceToNow(new Date(agencyHostInfo.joined_at), { locale: enUS })
                            : "N/A"
                          }
                        </p>
                      </div>
                      <div className="bg-white/5 rounded-lg p-4">
                        <p className="text-white/50 text-sm mb-1 flex items-center gap-2">
                          <UserCheck className="w-4 h-4" /> Join Method
                        </p>
                        <p className="text-white font-medium capitalize">
                          {agencyHostInfo.joined_via || "Invitation"}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Agency Owner */}
                  {agency.owner && (
                    <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                      <Crown className="w-5 h-5 text-yellow-400" />
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={agency.owner.avatar_url || undefined} />
                        <AvatarFallback className="bg-yellow-500/20 text-yellow-400 text-sm">
                          {agency.owner.display_name?.charAt(0) || "O"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-white text-sm">{agency.owner.display_name || "Unknown"}</p>
                        <p className="text-xs text-white/50">Agency Owner</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-10 text-white/50">
                  <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>This host is not associated with any agency</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ) : null}
    </div>
  );
}