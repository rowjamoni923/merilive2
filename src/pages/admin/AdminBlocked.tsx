import { useState, useEffect } from "react";
import { getAdminCache, setAdminCache } from "@/utils/adminDataCache";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import {
  Ban,
  Search,
  Users,
  Building2,
  Unlock,
  Clock,
  AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface BlockedUser {
  id: string;
  display_name: string;
  avatar_url: string | null;
  blocked_at: string;
  blocked_reason: string | null;
  is_host: boolean;
}

interface BlockedAgency {
  id: string;
  name: string;
  agency_code: string;
  blocked_at: string;
  blocked_reason: string | null;
  total_hosts: number;
  owner: {
    display_name: string;
    avatar_url: string | null;
  } | null;
}

export default function AdminBlocked() {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>(() => getAdminCache<BlockedUser[]>('admin_blocked_users') || []);
  const [blockedAgencies, setBlockedAgencies] = useState<BlockedAgency[]>(() => getAdminCache<BlockedAgency[]>('admin_blocked_agencies') || []);
  const [loading, setLoading] = useState(() => !getAdminCache('admin_blocked_users'));
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("users");

  const fetchBlockedItems = async () => {
    if (blockedUsers.length === 0) setLoading(true);
    try {
      // Fetch blocked users
      const { data: users, error: usersError } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, blocked_at, blocked_reason, is_host")
        .eq("is_blocked", true)
        .order("blocked_at", { ascending: false });

      if (usersError) throw usersError;
      setBlockedUsers(users || []);

      // Fetch blocked agencies
      const { data: agencies, error: agenciesError } = await supabase
        .from("agencies")
        .select(`
          id, name, agency_code, blocked_at, blocked_reason, total_hosts,
          owner:profiles!agencies_owner_id_fkey(display_name, avatar_url)
        `)
        .eq("is_blocked", true)
        .order("blocked_at", { ascending: false });

      if (agenciesError) throw agenciesError;
      
      const formattedAgencies = (agencies || []).map(agency => ({
        ...agency,
        owner: Array.isArray(agency.owner) ? agency.owner[0] : agency.owner
      })) as BlockedAgency[];
      
      setBlockedAgencies(formattedAgencies);
    } catch (error) {
      console.error("Error fetching blocked items:", error);
      toast.error("Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useAdminRealtime(['profiles', 'agencies', 'banned_devices'], fetchBlockedItems, 'admin-blocked-rt');

  const handleUnblockUser = async (userId: string) => {
    try {
      const { error } = await supabase.rpc("admin_block_user", {
        _user_id: userId,
        _block: false
      });

      if (error) throw error;
      toast.success("User unblocked successfully");
      fetchBlockedItems();
    } catch (error) {
      toast.error("Failed to unblock user");
    }
  };

  const handleUnblockAgency = async (agencyId: string) => {
    try {
      const { error } = await supabase.rpc("admin_block_agency", {
        _agency_id: agencyId,
        _block: false
      });

      if (error) throw error;
      toast.success("Agency unblocked successfully");
      fetchBlockedItems();
    } catch (error) {
      toast.error("Failed to unblock agency");
    }
  };

  const filteredUsers = blockedUsers.filter(user =>
    user.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.id.includes(searchQuery)
  );

  const filteredAgencies = blockedAgencies.filter(agency =>
    agency.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    agency.agency_code?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-gradient-to-r from-red-500 via-rose-500 to-pink-600 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2 md:gap-3">
            <Ban className="w-5 h-5 md:w-7 md:h-7" />
            Block List
          </h1>
          <p className="text-white/80 text-xs md:text-sm mt-1">Blocked users and agencies</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <Card className="bg-gradient-to-br from-red-900/40 to-red-800/30 border-red-500/30 shadow-md">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-red-500 flex items-center justify-center shadow-lg">
                <Users className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <div>
                <p className="text-red-300 text-xs md:text-sm font-medium">Blocked Users</p>
                <p className="text-red-400 font-bold text-xl md:text-2xl">{blockedUsers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-orange-900/40 to-orange-800/30 border-orange-500/30 shadow-md">
          <CardContent className="p-3 md:p-4">
            <div className="flex items-center gap-2 md:gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-orange-500 flex items-center justify-center shadow-lg">
                <Building2 className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <div>
                <p className="text-orange-300 text-xs md:text-sm font-medium">Blocked Agencies</p>
                <p className="text-orange-400 font-bold text-xl md:text-2xl">{blockedAgencies.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card className="bg-slate-800/50 border-slate-700 shadow-sm">
        <CardContent className="p-3 md:p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search by name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-900/50 border-slate-600 text-white placeholder:text-slate-400 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800 border border-slate-700 p-1 w-full grid grid-cols-2 md:flex md:w-auto">
          <TabsTrigger value="users" className="data-[state=active]:bg-red-500 data-[state=active]:text-white text-slate-300 font-medium text-xs md:text-sm">
            <Users className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
            Users ({blockedUsers.length})
          </TabsTrigger>
          <TabsTrigger value="agencies" className="data-[state=active]:bg-red-500 data-[state=active]:text-white text-slate-300 font-medium text-xs md:text-sm">
            <Building2 className="w-3 h-3 md:w-4 md:h-4 mr-1 md:mr-2" />
            Agencies ({blockedAgencies.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <Card className="bg-slate-800/50 border-slate-700 shadow-md overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 bg-slate-800 hover:bg-slate-800">
                     <TableHead className="text-slate-300 font-semibold">User</TableHead>
                    <TableHead className="text-slate-300 font-semibold">Type</TableHead>
                    <TableHead className="text-slate-300 font-semibold">Block Reason</TableHead>
                    <TableHead className="text-slate-300 font-semibold">Blocked At</TableHead>
                    <TableHead className="text-slate-300 font-semibold text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-slate-400 py-10">
                         Loading...
                      </TableCell>
                    </TableRow>
                  ) : filteredUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-slate-400 py-10">
                        No blocked users
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredUsers.map((user) => (
                      <TableRow key={user.id} className="border-slate-700 hover:bg-slate-700/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-10 h-10 border-2 border-red-500/50">
                              <AvatarImage src={user.avatar_url || ""} />
                              <AvatarFallback className="bg-red-600 text-white">
                                {user.display_name?.charAt(0) || "U"}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="text-white font-medium">{user.display_name}</p>
                              <p className="text-slate-400 text-xs">{user.id.slice(0, 8)}...</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={user.is_host ? "bg-pink-600 text-white border-pink-500" : "bg-blue-600 text-white border-blue-500"}>
                            {user.is_host ? "Host" : "User"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-slate-300">
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                            {user.blocked_reason || "No reason specified"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-slate-400">
                            <Clock className="w-4 h-4" />
                            {user.blocked_at ? formatDistanceToNow(new Date(user.blocked_at), { addSuffix: true }) : "-"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            className="bg-green-500 hover:bg-green-600 text-white"
                            onClick={() => handleUnblockUser(user.id)}
                          >
                            <Unlock className="w-4 h-4 mr-1" />
                             Unblock
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="agencies" className="mt-4">
          <Card className="bg-slate-800/50 border-slate-700 shadow-md overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 bg-slate-800 hover:bg-slate-800">
                     <TableHead className="text-slate-300 font-semibold">Agency</TableHead>
                    <TableHead className="text-slate-300 font-semibold">Code</TableHead>
                    <TableHead className="text-slate-300 font-semibold">Host Count</TableHead>
                    <TableHead className="text-slate-300 font-semibold">Block Reason</TableHead>
                    <TableHead className="text-slate-300 font-semibold">Blocked At</TableHead>
                    <TableHead className="text-slate-300 font-semibold text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-slate-400 py-10">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : filteredAgencies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-slate-400 py-10">
                        No blocked agencies
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAgencies.map((agency) => (
                      <TableRow key={agency.id} className="border-slate-700 hover:bg-slate-700/50">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center">
                              <Building2 className="w-5 h-5 text-white" />
                            </div>
                            <div>
                              <p className="text-white font-medium">{agency.name}</p>
                              <p className="text-slate-400 text-xs">
                                Owner: {agency.owner?.display_name || "N/A"}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-purple-600 text-white border-purple-500">
                            {agency.agency_code}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-white font-medium">{agency.total_hosts}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-slate-300">
                            <AlertTriangle className="w-4 h-4 text-amber-400" />
                            {agency.blocked_reason || "No reason specified"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-slate-400">
                            <Clock className="w-4 h-4" />
                            {agency.blocked_at ? formatDistanceToNow(new Date(agency.blocked_at), { addSuffix: true }) : "-"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            className="bg-green-500 hover:bg-green-600 text-white"
                            onClick={() => handleUnblockAgency(agency.id)}
                          >
                            <Unlock className="w-4 h-4 mr-1" />
                            Unblock
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
