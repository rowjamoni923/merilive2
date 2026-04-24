import { useState, useEffect } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Building2,
  Users,
  Coins,
  TrendingUp,
  Ban,
  CheckCircle,
  Calendar,
  Clock,
  Wallet,
  Activity,
  UserCheck,
  UserX,
  Search,
  Phone,
  Crown,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  UserMinus,
  Plus,
  Loader2,
  ArrowRightLeft,
  Trash2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { bn } from "date-fns/locale";

interface Agency {
  id: string;
  name: string;
  agency_code: string;
  level: string | null;
  total_hosts: number | null;
  total_agents: number | null;
  wallet_balance: number | null;
  commission_rate: number | null;
  is_active: boolean | null;
  is_blocked: boolean | null;
  blocked_reason: string | null;
  created_at: string | null;
  owner_id: string | null;
  owner?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    country_flag: string | null;
  };
}

interface AgencyHost {
  id: string;
  host_id: string;
  joined_at: string | null;
  status: string | null;
  joined_via: string | null;
  host?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    is_online: boolean | null;
    is_verified: boolean | null;
    total_earnings: number | null;
    weekly_earnings: number | null;
    beans: number | null;
    total_call_minutes: number | null;
    country_flag: string | null;
    app_uid?: string | null;
  };
}

interface Transaction {
  id: string;
  amount: number;
  receiver_id: string;
  created_at: string;
  status: string;
  note: string | null;
  receiver?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

interface OtherAgency {
  id: string;
  name: string;
  agency_code: string;
}

export default function AdminAgencyDetail() {
  const { agencyId } = useParams();
  const navigate = useNavigate();
  const [agency, setAgency] = useState<Agency | null>(null);
  const [hosts, setHosts] = useState<AgencyHost[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [hostSearchQuery, setHostSearchQuery] = useState("");
  
  // New state for modals
  const [showRemoveHostDialog, setShowRemoveHostDialog] = useState(false);
  const [showAddCoinsDialog, setShowAddCoinsDialog] = useState(false);
  const [showChangeLevelDialog, setShowChangeLevelDialog] = useState(false);
  const [showRemoveAllHostsDialog, setShowRemoveAllHostsDialog] = useState(false);
  const [showTransferHostDialog, setShowTransferHostDialog] = useState(false);
  const [selectedHost, setSelectedHost] = useState<AgencyHost | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [coinAmount, setCoinAmount] = useState("");
  const [coinNote, setCoinNote] = useState("");
  const [newLevel, setNewLevel] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  
  // Transfer host state
  const [otherAgencies, setOtherAgencies] = useState<OtherAgency[]>([]);
  const [targetAgencyId, setTargetAgencyId] = useState("");
  
  // Add host state
  const [showAddHostDialog, setShowAddHostDialog] = useState(false);
  const [addHostSearchQuery, setAddHostSearchQuery] = useState("");
  const [foundUser, setFoundUser] = useState<any>(null);
  const [searchingUser, setSearchingUser] = useState(false);
  const [addingHost, setAddingHost] = useState(false);

  useEffect(() => {
    if (agencyId) {
      fetchAgencyDetails();
    }
  }, [agencyId]);

  useAdminRealtime(['agencies', 'agency_hosts', 'agency_earnings_transfers'], () => { if (agencyId) fetchAgencyDetails(); });

  const fetchAgencyDetails = async () => {
    setLoading(true);
    try {
      // Fetch agency first without join to avoid FK issues with null owner_id
      const { data: agencyData, error: agencyError } = await supabase
        .from("agencies")
        .select("*")
        .eq("id", agencyId)
        .single();

      if (agencyError) throw agencyError;
      
      // Fetch owner separately if owner_id exists
      let owner = null;
      if (agencyData.owner_id) {
        const { data: ownerData } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, country_flag")
          .eq("id", agencyData.owner_id)
          .single();
        owner = ownerData;
      }
      
      const transformedAgency = {
        ...agencyData,
        owner
      };
      setAgency(transformedAgency);

      // Fetch agency hosts
      const { data: hostsData } = await supabase
        .from("agency_hosts")
        .select(`
          *,
          host:profiles!agency_hosts_host_id_fkey(
            id, display_name, avatar_url, is_online, is_verified, 
            total_earnings, weekly_earnings, beans, total_call_minutes, country_flag
          )
        `)
        .eq("agency_id", agencyId)
        .order("joined_at", { ascending: false });

      setHosts(hostsData || []);

      // Fetch transactions (transfers from this agency owner)
      if (agencyData?.owner_id) {
        const { data: txData } = await supabase
          .from("coin_transfers")
          .select("*")
          .eq("sender_id", agencyData.owner_id)
          .order("created_at", { ascending: false })
          .limit(50);

        if (txData && txData.length > 0) {
          // Fetch receiver profiles separately
          const receiverIds = txData.map(tx => tx.receiver_id);
          const { data: receivers } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url")
            .in("id", receiverIds);

          const txWithReceivers = txData.map(tx => ({
            ...tx,
            receiver: receivers?.find(r => r.id === tx.receiver_id) || null
          }));
          setTransactions(txWithReceivers);
        }
      }
    } catch (error) {
      console.error("Error fetching agency:", error);
      toast.error("Failed to load agency");
    } finally {
      setLoading(false);
    }
  };

  // Action handlers
  const handleRemoveHost = async () => {
    if (!selectedHost) return;
    
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc("admin_remove_host_from_agency", {
        _host_id: selectedHost.host_id,
        _reason: removeReason || null
      });

      if (error) throw error;

      toast.success("Host removed successfully");
      setShowRemoveHostDialog(false);
      setSelectedHost(null);
      setRemoveReason("");
      fetchAgencyDetails();
    } catch (error) {
      console.error("Error removing host:", error);
      toast.error("Failed to remove host");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddCoins = async () => {
    if (!agency || !coinAmount) return;
    
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc("admin_add_agency_coins", {
        _agency_id: agency.id,
        _amount: parseFloat(coinAmount),
        _note: coinNote || null
      });

      if (error) throw error;

      toast.success("Diamonds added successfully");
      setShowAddCoinsDialog(false);
      setCoinAmount("");
      setCoinNote("");
      fetchAgencyDetails();
    } catch (error) {
      console.error("Error adding coins:", error);
      toast.error("Failed to add diamonds");
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeLevel = async () => {
    if (!agency || !newLevel) return;
    
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc("admin_update_agency_level", {
        _agency_id: agency.id,
        _level: newLevel
      });

      if (error) throw error;

      toast.success("Level updated successfully");
      setShowChangeLevelDialog(false);
      setNewLevel("");
      fetchAgencyDetails();
    } catch (error) {
      console.error("Error changing level:", error);
      toast.error("Failed to update level");
    } finally {
      setActionLoading(false);
    }
  };

  // Remove all hosts from agency
  const handleRemoveAllHosts = async () => {
    if (!agency) return;
    
    setActionLoading(true);
    try {
      const activeHostIds = hosts.filter(h => h.status === 'active').map(h => h.host_id);
      
      for (const hostId of activeHostIds) {
        await supabase.rpc("admin_remove_host_from_agency", {
          _host_id: hostId,
          _reason: removeReason || "Remove all hosts"
        });
      }

      toast.success(`${activeHostIds.length} hosts removed`);
      setShowRemoveAllHostsDialog(false);
      setRemoveReason("");
      fetchAgencyDetails();
    } catch (error) {
      console.error("Error removing all hosts:", error);
      toast.error("Failed to remove hosts");
    } finally {
      setActionLoading(false);
    }
  };

  // Transfer host to another agency
  const handleTransferHost = async () => {
    if (!selectedHost || !targetAgencyId) return;
    
    setActionLoading(true);
    try {
      // First remove from current agency
      const { error: removeError } = await supabase.rpc("admin_remove_host_from_agency", {
        _host_id: selectedHost.host_id,
        _reason: "Transferred to another agency"
      });

      if (removeError) throw removeError;

      // Then add to new agency
      const { error: addError } = await supabase
        .from("agency_hosts")
        .insert({
          agency_id: targetAgencyId,
          host_id: selectedHost.host_id,
          status: 'active',
          joined_via: 'admin_transfer'
        });

      if (addError) throw addError;

      // Update host counts manually
      const { count: newAgencyCount } = await supabase
        .from("agency_hosts")
        .select("*", { count: "exact", head: true })
        .eq("agency_id", targetAgencyId)
        .eq("status", "active");
        
      await supabase
        .from("agencies")
        .update({ total_hosts: newAgencyCount || 0 })
        .eq("id", targetAgencyId);

      toast.success("Host transferred successfully");
      setShowTransferHostDialog(false);
      setSelectedHost(null);
      setTargetAgencyId("");
      fetchAgencyDetails();
    } catch (error) {
      console.error("Error transferring host:", error);
      toast.error("Failed to transfer host");
    } finally {
      setActionLoading(false);
    }
  };

  // Fetch other agencies for transfer
  const fetchOtherAgencies = async () => {
    const { data } = await supabase
      .from("agencies")
      .select("id, name, agency_code")
      .neq("id", agencyId || "")
      .eq("is_active", true)
      .eq("is_blocked", false)
      .order("name");
    
    setOtherAgencies(data || []);
  };

  // Search user by App UID for adding to agency
  const searchUserByUID = async () => {
    if (!addHostSearchQuery.trim()) return;
    
    setSearchingUser(true);
    setFoundUser(null);
    
    try {
      // First try exact app_uid match
      let { data: user } = await supabase
        .from("profiles")
        .select("id, display_name, avatar_url, app_uid, is_host, country_flag, agency_id")
        .eq("app_uid", addHostSearchQuery.trim())
        .maybeSingle();
      
      // If not found, try partial name search
      if (!user) {
        const { data: users } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, app_uid, is_host, country_flag, agency_id")
          .ilike("display_name", `%${addHostSearchQuery.trim()}%`)
          .limit(1);
        
        user = users?.[0] || null;
      }
      
      setFoundUser(user);
      
      if (!user) {
        toast.error("User not found");
      }
    } catch (error) {
      console.error("Error searching user:", error);
      toast.error("Failed to search user");
    } finally {
      setSearchingUser(false);
    }
  };

  // Add host to agency
  const handleAddHost = async () => {
    if (!foundUser || !agency) return;
    
    // Check if already in an agency
    if (foundUser.agency_id) {
      toast.error("This user is already in another agency");
      return;
    }
    
    // Check if already in this agency
    const existingHost = hosts.find(h => h.host_id === foundUser.id && h.status === 'active');
    if (existingHost) {
      toast.error("This user is already in this agency");
      return;
    }
    
    setAddingHost(true);
    try {
      // Insert into agency_hosts
      const { error: hostError } = await supabase
        .from("agency_hosts")
        .insert({
          agency_id: agency.id,
          host_id: foundUser.id,
          status: 'active',
          joined_via: 'admin_add'
        });

      if (hostError) throw hostError;
      
      // Ensure full User→Host conversion (gender/role sync) before agency assignment
      const { error: convertError } = await supabase.rpc('admin_update_user_gender', {
        _user_id: foundUser.id,
        _gender: 'female',
      });
      if (convertError) throw convertError;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ agency_id: agency.id })
        .eq("id", foundUser.id);

      if (profileError) throw profileError;
      
      // Update agency host count
      const newCount = (agency.total_hosts || 0) + 1;
      await supabase
        .from("agencies")
        .update({ total_hosts: newCount })
        .eq("id", agency.id);

      toast.success(`${foundUser.display_name} added successfully`);
      setShowAddHostDialog(false);
      setFoundUser(null);
      setAddHostSearchQuery("");
      fetchAgencyDetails();
    } catch (error) {
      console.error("Error adding host:", error);
      toast.error("Failed to add host");
    } finally {
      setAddingHost(false);
    }
  };

  const activeHosts = hosts.filter(h => h.host?.is_online && h.status === 'active');
  const inactiveHosts = hosts.filter(h => !h.host?.is_online && h.status === 'active');
  const removedHosts = hosts.filter(h => h.status === 'removed');
  const totalEarnings = hosts.reduce((sum, h) => sum + (h.host?.weekly_earnings || 0), 0);
  const totalCallMinutes = hosts.reduce((sum, h) => sum + (h.host?.total_call_minutes || 0), 0);
  const totalTransferred = transactions.reduce((sum, t) => sum + t.amount, 0);

  const filteredHosts = hosts.filter(h => 
    (h.host?.display_name?.toLowerCase().includes(hostSearchQuery.toLowerCase()) ||
    h.host_id.toLowerCase().includes(hostSearchQuery.toLowerCase())) &&
    h.status === 'active'
  );

  const getLevelColor = (level: string | null) => {
    switch (level) {
      case "platinum": return "from-gray-400 to-gray-500";
      case "gold": return "from-yellow-400 to-yellow-500";
      case "silver": return "from-gray-300 to-gray-400";
      default: return "from-amber-600 to-amber-700";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!agency) {
    return (
      <div className="text-center py-20">
        <Building2 className="w-16 h-16 text-white/30 mx-auto mb-4" />
        <p className="text-white/60">Agency not found</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/admin/agencies")}>
          Go Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/admin/agencies")}
          className="text-white/70 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            {agency.name}
            {agency.is_blocked && (
              <Badge variant="destructive" className="gap-1">
                <Ban className="w-3 h-3" /> Blocked
              </Badge>
            )}
          </h1>
          <p className="text-white/60">#{agency.agency_code}</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={fetchAgencyDetails}
          className="bg-white/5 border-white/10 text-white"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4 text-center">
            <Users className="w-6 h-6 text-blue-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-white">{hosts.length}</p>
            <p className="text-xs text-white/60">Total Hosts</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4 text-center">
            <UserCheck className="w-6 h-6 text-green-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-green-400">{activeHosts.length}</p>
            <p className="text-xs text-white/60">Online</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4 text-center">
            <UserX className="w-6 h-6 text-red-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-red-400">{inactiveHosts.length}</p>
            <p className="text-xs text-white/60">Offline</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4 text-center">
            <Coins className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-yellow-400">{agency.wallet_balance?.toLocaleString() || 0}</p>
            <p className="text-xs text-white/60">Wallet</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4 text-center">
            <TrendingUp className="w-6 h-6 text-purple-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-purple-400">{agency.commission_rate || 0}%</p>
            <p className="text-xs text-white/60">Commission</p>
          </CardContent>
        </Card>

        <Card className="bg-white/5 border-white/10">
          <CardContent className="p-4 text-center">
            <Phone className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
            <p className="text-2xl font-bold text-cyan-400">{totalCallMinutes.toLocaleString()}</p>
            <p className="text-xs text-white/60">Call Minutes</p>
          </CardContent>
        </Card>
      </div>

      {/* Agency Info & Owner */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agency Info */}
        <Card className="bg-white/5 border-white/10 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Agency Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/50 text-sm mb-1">Level</p>
                <Badge className={`bg-gradient-to-r ${getLevelColor(agency.level)} text-white border-0 capitalize`}>
                  {agency.level || "Bronze"}
                </Badge>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/50 text-sm mb-1">Status</p>
                <Badge className={agency.is_active ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}>
                  {agency.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/50 text-sm mb-1">Created</p>
                <p className="text-white text-sm">
                  {agency.created_at ? format(new Date(agency.created_at), "dd MMM yyyy") : "N/A"}
                </p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/50 text-sm mb-1">Duration</p>
                <p className="text-white text-sm">
                  {agency.created_at ? formatDistanceToNow(new Date(agency.created_at)) : "N/A"}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/50 text-sm mb-1">Total Host Earnings</p>
                <p className="text-green-400 font-bold text-xl">{totalEarnings.toLocaleString()} Coins</p>
              </div>
              <div className="bg-white/5 rounded-lg p-3">
                <p className="text-white/50 text-sm mb-1">Total Transfers</p>
                <p className="text-yellow-400 font-bold text-xl">{totalTransferred.toLocaleString()} Coins</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Owner Info */}
        <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Crown className="w-5 h-5 text-yellow-400" />
              Owner
            </CardTitle>
          </CardHeader>
          <CardContent>
            {agency.owner ? (
              <div className="text-center">
                <Avatar className="w-20 h-20 mx-auto mb-3 border-4 border-yellow-500/30">
                  <AvatarImage src={agency.owner.avatar_url || undefined} />
                  <AvatarFallback className="bg-yellow-500/20 text-yellow-400 text-2xl">
                    {agency.owner.display_name?.charAt(0) || "O"}
                  </AvatarFallback>
                </Avatar>
                <p className="text-white font-bold text-lg">{agency.owner.display_name || "Unknown"}</p>
                <p className="text-white/50 text-sm mb-3">{agency.owner.country_flag}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/5 border-white/10 text-white w-full"
                  onClick={() => navigate(`/admin/users?search=${agency.owner?.id}`)}
                >
                  View Profile
                </Button>
              </div>
            ) : (
              <p className="text-white/50 text-center">Owner info not found</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="hosts" className="w-full">
        <TabsList className="bg-white/5 border border-white/10">
          <TabsTrigger value="hosts" className="data-[state=active]:bg-primary text-white">
            Host List ({hosts.length})
          </TabsTrigger>
          <TabsTrigger value="transactions" className="data-[state=active]:bg-primary text-white">
            Transfer History ({transactions.length})
          </TabsTrigger>
        </TabsList>

        {/* Hosts Tab */}
        <TabsContent value="hosts" className="mt-4">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                <CardTitle className="text-white flex items-center gap-2">
                  Agency Hosts
                  <Badge className="bg-blue-500/20 text-blue-400">
                    Total {filteredHosts.length}
                  </Badge>
                </CardTitle>
                <div className="flex items-center gap-2 w-full md:w-auto flex-wrap">
                  <div className="relative flex-1 md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <Input
                      placeholder="Search host (name or ID)..."
                      value={hostSearchQuery}
                      onChange={(e) => setHostSearchQuery(e.target.value)}
                      className="pl-10 bg-white/5 border-white/10 text-white"
                    />
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setShowAddHostDialog(true)}
                    className="bg-green-600 hover:bg-green-700 whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                     Add Host
                  </Button>
                  {filteredHosts.length > 0 && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setShowRemoveAllHostsDialog(true)}
                      className="whitespace-nowrap"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                       Remove All
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      <TableHead className="text-white/60">Host</TableHead>
                      <TableHead className="text-white/60">Status</TableHead>
                      <TableHead className="text-white/60">Joined</TableHead>
                      <TableHead className="text-white/60">Earnings</TableHead>
                      <TableHead className="text-white/60 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHosts.map((h) => (
                      <TableRow 
                        key={h.id} 
                        className="border-white/10 cursor-pointer hover:bg-white/5"
                        onClick={() => navigate(`/profile/${h.host_id}`)}
                      >
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="relative">
                              <Avatar className="w-10 h-10">
                                <AvatarImage src={h.host?.avatar_url || undefined} />
                                <AvatarFallback className="bg-primary/20 text-primary">
                                  {h.host?.display_name?.charAt(0) || "H"}
                                </AvatarFallback>
                              </Avatar>
                              {h.host?.is_online && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900" />
                              )}
                            </div>
                            <div>
                              <p className="text-white font-medium flex items-center gap-1">
                                {h.host?.display_name || "Unknown"}
                                {h.host?.is_verified && (
                                  <CheckCircle className="w-3 h-3 text-blue-400" />
                                )}
                              </p>
                              <p className="text-white/50 text-xs">{h.host?.country_flag}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={h.host?.is_online ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}>
                            {h.host?.is_online ? "Online" : "Offline"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-white/60 text-xs">
                          {h.joined_at ? format(new Date(h.joined_at), "dd MMM") : "N/A"}
                        </TableCell>
                        <TableCell className="text-green-400 font-medium">
                          {(h.host?.weekly_earnings || 0).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                              title="Transfer to another agency"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedHost(h);
                                fetchOtherAgencies();
                                setShowTransferHostDialog(true);
                              }}
                            >
                              <ArrowRightLeft className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                              title="Remove from agency"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedHost(h);
                                setShowRemoveHostDialog(true);
                              }}
                            >
                              <UserMinus className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {filteredHosts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10 text-white/50">
                          No hosts found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Transactions Tab */}
        <TabsContent value="transactions" className="mt-4">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Coin Transfer History</CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <Table>
                  <TableHeader>
                    <TableRow className="border-white/10">
                      <TableHead className="text-white/60">Recipient</TableHead>
                      <TableHead className="text-white/60">Amount</TableHead>
                      <TableHead className="text-white/60">Date</TableHead>
                      <TableHead className="text-white/60">Status</TableHead>
                      <TableHead className="text-white/60">Note</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id} className="border-white/10">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={tx.receiver?.avatar_url || undefined} />
                              <AvatarFallback className="bg-primary/20 text-primary text-sm">
                                {tx.receiver?.display_name?.charAt(0) || "U"}
                              </AvatarFallback>
                            </Avatar>
                            <p className="text-white">{tx.receiver?.display_name || "Unknown"}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-yellow-400 font-bold">
                            <ArrowUpRight className="w-4 h-4" />
                            {tx.amount.toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell className="text-white/60">
                          {format(new Date(tx.created_at), "dd MMM yyyy, hh:mm a")}
                        </TableCell>
                        <TableCell>
                          <Badge className={tx.status === "completed" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}>
                            {tx.status === "completed" ? "Completed" : tx.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-white/50 max-w-[200px] truncate">
                          {tx.note || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                    {transactions.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-10 text-white/50">
                          No transfers found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Remove Host Dialog */}
      <Dialog open={showRemoveHostDialog} onOpenChange={setShowRemoveHostDialog}>
        <DialogContent className="bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Remove Host</DialogTitle>
            <DialogDescription className="text-white/60">
              Remove {selectedHost?.host?.display_name} from this agency?
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for removal (optional)"
            value={removeReason}
            onChange={(e) => setRemoveReason(e.target.value)}
            className="bg-white/5 border-white/10 text-white"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveHostDialog(false)}>Cancel</Button>
            <Button onClick={handleRemoveHost} disabled={actionLoading} className="bg-red-600 hover:bg-red-700">
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Coins Dialog */}
      <Dialog open={showAddCoinsDialog} onOpenChange={setShowAddCoinsDialog}>
        <DialogContent className="bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Add Coins</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              type="number"
              placeholder="Diamond amount"
              value={coinAmount}
              onChange={(e) => setCoinAmount(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
            />
            <Textarea
              placeholder="Note (optional)"
              value={coinNote}
              onChange={(e) => setCoinNote(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCoinsDialog(false)}>Cancel</Button>
            <Button onClick={handleAddCoins} disabled={actionLoading || !coinAmount}>
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Level Dialog */}
      <Dialog open={showChangeLevelDialog} onOpenChange={setShowChangeLevelDialog}>
        <DialogContent className="bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Change Agency Level</DialogTitle>
          </DialogHeader>
          <Select value={newLevel} onValueChange={setNewLevel}>
            <SelectTrigger className="bg-white/5 border-white/10 text-white">
              <SelectValue placeholder="Select level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bronze">Bronze</SelectItem>
              <SelectItem value="silver">Silver</SelectItem>
              <SelectItem value="gold">Gold</SelectItem>
              <SelectItem value="platinum">Platinum</SelectItem>
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowChangeLevelDialog(false)}>Cancel</Button>
            <Button onClick={handleChangeLevel} disabled={actionLoading || !newLevel}>
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove All Hosts Dialog */}
      <Dialog open={showRemoveAllHostsDialog} onOpenChange={setShowRemoveAllHostsDialog}>
        <DialogContent className="bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-red-400 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              Remove All Hosts
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Remove all hosts ({filteredHosts.length}) from this agency? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for removal (optional)"
            value={removeReason}
            onChange={(e) => setRemoveReason(e.target.value)}
            className="bg-white/5 border-white/10 text-white"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemoveAllHostsDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleRemoveAllHosts} 
              disabled={actionLoading} 
              className="bg-red-600 hover:bg-red-700"
            >
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Remove All ({filteredHosts.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer Host Dialog */}
      <Dialog open={showTransferHostDialog} onOpenChange={setShowTransferHostDialog}>
        <DialogContent className="bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="w-5 h-5 text-blue-400" />
              Transfer Host
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Transfer {selectedHost?.host?.display_name} to another agency
            </DialogDescription>
          </DialogHeader>
          
          {/* Current host info */}
          <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
            <Avatar className="w-12 h-12">
              <AvatarImage src={selectedHost?.host?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/20 text-primary">
                {selectedHost?.host?.display_name?.charAt(0) || "H"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-white font-medium">{selectedHost?.host?.display_name || "Unknown"}</p>
              <p className="text-white/50 text-sm">Current Agency: {agency?.name}</p>
            </div>
          </div>

          {/* Select target agency */}
          <div className="space-y-2">
            <p className="text-white/70 text-sm">Select new agency:</p>
            <Select value={targetAgencyId} onValueChange={setTargetAgencyId}>
              <SelectTrigger className="bg-white/5 border-white/10 text-white">
                <SelectValue placeholder="Select agency" />
              </SelectTrigger>
              <SelectContent>
                {otherAgencies.map((ag) => (
                  <SelectItem key={ag.id} value={ag.id}>
                    {ag.name} (#{ag.agency_code})
                  </SelectItem>
                ))}
                {otherAgencies.length === 0 && (
                  <div className="p-2 text-center text-muted-foreground text-sm">
                    No agencies found
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTransferHostDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleTransferHost} 
              disabled={actionLoading || !targetAgencyId}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {actionLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Host Dialog */}
      <Dialog open={showAddHostDialog} onOpenChange={(open) => {
        setShowAddHostDialog(open);
        if (!open) {
          setAddHostSearchQuery("");
          setFoundUser(null);
        }
      }}>
        <DialogContent className="bg-slate-900 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5 text-green-400" />
              Add Host
            </DialogTitle>
            <DialogDescription className="text-white/60">
              Search by App UID to add host to agency
            </DialogDescription>
          </DialogHeader>
          
          {/* Search input */}
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter App UID or name..."
                value={addHostSearchQuery}
                onChange={(e) => setAddHostSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && searchUserByUID()}
                className="bg-white/5 border-white/10 text-white flex-1"
              />
              <Button 
                onClick={searchUserByUID} 
                disabled={searchingUser || !addHostSearchQuery.trim()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {searchingUser ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
            </div>

            {/* Found user display */}
            {foundUser && (
              <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center gap-3">
                  <Avatar className="w-14 h-14 border-2 border-green-500/30">
                    <AvatarImage src={foundUser.avatar_url || undefined} />
                    <AvatarFallback className="bg-green-500/20 text-green-400 text-lg">
                      {foundUser.display_name?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1">
                    <p className="text-white font-medium text-lg">{foundUser.display_name || "Unknown"}</p>
                    <p className="text-white/50 text-sm">UID: {foundUser.app_uid} {foundUser.country_flag}</p>
                    {foundUser.agency_id && (
                      <Badge className="bg-yellow-500/20 text-yellow-400 mt-1">
                        Already in an Agency
                      </Badge>
                    )}
                    {foundUser.is_host && !foundUser.agency_id && (
                      <Badge className="bg-blue-500/20 text-blue-400 mt-1">
                        Host
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddHostDialog(false)}>Cancel</Button>
            <Button 
              onClick={handleAddHost} 
              disabled={addingHost || !foundUser || foundUser.agency_id}
              className="bg-green-600 hover:bg-green-700"
            >
              {addingHost && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Add to Agency
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}