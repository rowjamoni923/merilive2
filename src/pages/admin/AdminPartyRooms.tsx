import { useState, useEffect } from "react";
import { getAdminCache, setAdminCache } from "@/utils/adminDataCache";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import {
  Search,
  Filter,
  MoreVertical,
  Ban,
  Eye,
  PartyPopper,
  Users,
  Video,
  Mic,
  Gamepad2,
  ChevronLeft,
  ChevronRight,
  XCircle,
  Clock,
  Crown
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
interface PartyRoom {
  id: string;
  name: string;
  room_type: string;
  room_code: string;
  game_mode: string | null;
  is_active: boolean | null;
  is_private: boolean | null;
  current_participants: number | null;
  max_participants: number | null;
  created_at: string | null;
  host_id: string;
  host?: {
    display_name: string | null;
    avatar_url: string | null;
  };
}

export default function AdminPartyRooms() {
  const [rooms, setRooms] = useState<PartyRoom[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalRooms, setTotalRooms] = useState(0);
  const [selectedRoom, setSelectedRoom] = useState<PartyRoom | null>(null);
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [inactiveRoomCount, setInactiveRoomCount] = useState(0);
  
  const pageSize = 20;

  // Initial load only - manual refresh via button
  useEffect(() => {
    fetchRooms();
  }, []);

  // Refetch when filters change (but not on every keystroke)
  useEffect(() => {
    const debounce = setTimeout(() => {
      fetchRooms();
    }, 300);
    return () => clearTimeout(debounce);
  }, [currentPage, filterType, searchQuery]);

  useAdminRealtime(['party_rooms', 'party_room_participants'], () => fetchRooms());

  const fetchRooms = async () => {
    if (!rooms || rooms.length === 0) setLoading(true);
    try {
      let query = supabase
        .from("party_rooms")
        .select(`
          *,
          host:profiles!party_rooms_host_id_fkey(display_name, avatar_url)
        `, { count: "exact" });

      if (filterType === "active") {
        query = query.eq("is_active", true);
      } else if (filterType === "inactive") {
        query = query.eq("is_active", false);
      } else if (filterType === "video") {
        query = query.eq("room_type", "video");
      } else if (filterType === "audio") {
        query = query.eq("room_type", "audio");
      } else if (filterType === "game") {
        query = query.eq("room_type", "game");
      }

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,room_code.ilike.%${searchQuery}%`);
      }

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;
      
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) throw error;
      setRooms(data || []);
      setTotalRooms(count || 0);

      // Fetch inactive room count for warning banner
      const { count: inactiveC } = await supabase
        .from("party_rooms")
        .select("id", { count: "exact", head: true })
        .eq("is_active", false);
      setInactiveRoomCount(inactiveC || 0);
    } catch (error) {
      console.error("Error fetching rooms:", error);
      recordAdminError({ kind: "rpc", label: "AdminPartyRooms.to", message: formatAdminError(error) });
      toast.error("Failed to load party rooms");
    } finally {
      setLoading(false);
    }
  };

  const handleEndRoom = async () => {
    if (!selectedRoom) return;
    
    setActionLoading(true);
    try {
      // Pkg78/Pkg81b/Pkg89 audit: Supabase `party-room-close-${roomId}` broadcast REMOVED.
      // Listener was deleted in Pkg81b — sending here was a dead channel open ($1400-rule waste).
      // Host + viewers detect admin force-close via their existing 20s `party_rooms.is_active` poll.

      // STEP 1: Update database
      const { error } = await supabase
        .from("party_rooms")
        .update({ 
          is_active: false,
          ended_at: new Date().toISOString()
        })
        .eq("id", selectedRoom.id);

      if (error) throw error;
      
      // STEP 2: Mark all participants as left
      await supabase
        .from('party_room_participants')
        .update({ left_at: new Date().toISOString(), position: null })
        .eq('room_id', selectedRoom.id)
        .is('left_at', null);

      // Pkg99: server-side LiveKit room termination — instantly evicts everyone.
      try {
        const { adminLiveKitDisconnectRoom } = await import('@/admin/livekitModerate');
        void adminLiveKitDisconnectRoom(`party_${selectedRoom.id}`, 'admin_force_close');
      } catch { /* non-fatal */ }

      toast.success("Party room closed");
      setShowEndDialog(false);
      setSelectedRoom(null);
      fetchRooms();
    } catch (error) {
      console.error("Error ending room:", error);
      recordAdminError({ kind: "rpc", label: "AdminPartyRooms.closeChannel", message: formatAdminError(error) });
      toast.error((error as any)?.message || "Operation failed");
    } finally {
      setActionLoading(false);
    }
  };

  const getRoomTypeIcon = (type: string) => {
    switch (type) {
      case "video": return Video;
      case "audio": return Mic;
      case "game": return Gamepad2;
      default: return PartyPopper;
    }
  };

  const getRoomTypeColor = (type: string) => {
    switch (type) {
      case "video": return "from-green-500 to-emerald-500";
      case "audio": return "from-blue-500 to-cyan-500";
      case "game": return "from-purple-500 to-pink-500";
      default: return "from-primary to-purple-500";
    }
  };

  const totalPages = Math.ceil(totalRooms / pageSize);

  return (
    <div className="space-y-4 md:space-y-6 px-2 md:px-0">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 via-pink-500 to-rose-500 rounded-xl md:rounded-2xl p-4 md:p-6 shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
              <PartyPopper className="w-5 h-5 md:w-7 md:h-7" />
              Party Room Management
            </h1>
            <p className="text-white/80 text-xs md:text-sm mt-1">Total {totalRooms} party rooms</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-white border-slate-200 shadow-md">
        <CardContent className="p-3 md:p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Search by name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 text-sm"
              />
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full md:w-40 bg-slate-50 border-slate-200 text-slate-900 text-sm">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter" />
              </SelectTrigger>
               <SelectContent className="bg-white border-slate-200">
                <SelectItem value="all">All Rooms</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive {inactiveRoomCount > 0 && `(${inactiveRoomCount})`}</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="audio">Audio</SelectItem>
                <SelectItem value="game">Game</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

       {/* Inactive Rooms Warning Banner */}
       {inactiveRoomCount > 0 && filterType !== "inactive" && (
         <div 
           className="flex items-center gap-3 p-3 rounded-xl bg-red-100 border border-red-200 cursor-pointer hover:bg-red-200/70 transition-colors"
           onClick={() => setFilterType("inactive")}
         >
           <XCircle className="w-5 h-5 text-red-500" />
           <div className="flex-1">
              <p className="text-sm font-medium text-red-700">
                {inactiveRoomCount} Closed/Inactive party rooms
              </p>
              <p className="text-xs text-red-500/70">Click to view</p>
           </div>
           <Badge className="bg-red-500 text-white">{inactiveRoomCount}</Badge>
         </div>
       )}

       {/* Rooms Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rooms.length === 0 ? (
        <Card className="bg-white border-slate-200 shadow-md">
          <CardContent className="flex flex-col items-center justify-center h-64 text-slate-500">
            <PartyPopper className="w-12 h-12 mb-4" />
            <p>No party rooms found</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((room, i) => {
            const TypeIcon = getRoomTypeIcon(room.room_type);
            
            return (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <Card className="bg-white border-slate-200 hover:border-pink-400 transition-all overflow-hidden shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-12 h-12 rounded-xl bg-gradient-to-br flex items-center justify-center",
                          getRoomTypeColor(room.room_type)
                        )}>
                          <TypeIcon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <p className="text-slate-900 font-bold">{room.name}</p>
                          <p className="text-sm text-slate-500">#{room.room_code}</p>
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-slate-500 hover:text-slate-900">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-white border-slate-200">
                          <DropdownMenuItem 
                            className="text-slate-700 hover:text-slate-900"
                            onClick={() => {
                              setSelectedRoom(room);
                              setShowDetailDialog(true);
                            }}
                          >
                            <Eye className="w-4 h-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          {room.is_active && (
                            <>
                              <DropdownMenuSeparator className="bg-slate-200" />
                              <DropdownMenuItem 
                                className="text-red-500"
                                onClick={() => {
                                  setSelectedRoom(room);
                                  setShowEndDialog(true);
                                }}
                              >
                                <XCircle className="w-4 h-4 mr-2" />
                                Close Room
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    {/* Host Info */}
                    <div className="flex items-center gap-2 mb-4 p-2 bg-slate-50 rounded-lg">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={room.host?.avatar_url || undefined} />
                        <AvatarFallback className="bg-primary/20 text-primary text-sm">
                          {room.host?.display_name?.charAt(0) || "H"}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-slate-900 text-sm flex items-center gap-1">
                          <Crown className="w-3 h-3 text-yellow-500" />
                          {room.host?.display_name || "Unknown"}
                        </p>
                        <p className="text-xs text-slate-500">Host</p>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4 text-slate-500" />
                        <span className="text-slate-900 text-sm">
                          {room.current_participants || 0}/{room.max_participants || 0}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-slate-500" />
                        <span className="text-slate-500 text-sm">
                          {room.created_at ? new Date(room.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "-"}
                        </span>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="mt-4 flex items-center justify-between">
                      <Badge className={cn(
                        "bg-gradient-to-r text-white border-0 capitalize",
                        getRoomTypeColor(room.room_type)
                      )}>
                        <TypeIcon className="w-3 h-3 mr-1" />
                        {room.room_type}
                      </Badge>
                      <Badge className={room.is_active ? "bg-green-100 text-green-600 border-green-200" : "bg-red-100 text-red-600 border-red-200"}>
                        {room.is_active ? "Active" : "Closed"}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="icon"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(p => p - 1)}
            className="bg-white border-slate-200 text-slate-700"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-slate-600 px-4">
            {currentPage} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(p => p + 1)}
            className="bg-white border-slate-200 text-slate-700"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* End Room Dialog */}
      <Dialog open={showEndDialog} onOpenChange={setShowEndDialog}>
        <DialogContent className="bg-slate-900 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Close Party Room</DialogTitle>
            <DialogDescription className="text-slate-400">
              Are you sure you want to close "{selectedRoom?.name}"? All participants will be removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowEndDialog(false)}
              className="bg-slate-800 border-slate-600 text-slate-300"
            >
              Cancel
            </Button>
            <Button
              onClick={handleEndRoom}
              disabled={actionLoading}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {actionLoading ? "Please wait..." : "Close Room"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="bg-slate-900 border-slate-700 max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Party Room Details</DialogTitle>
          </DialogHeader>
          {selectedRoom && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-16 h-16 rounded-xl bg-gradient-to-br flex items-center justify-center",
                  getRoomTypeColor(selectedRoom.room_type)
                )}>
                  {(() => {
                    const Icon = getRoomTypeIcon(selectedRoom.room_type);
                    return <Icon className="w-8 h-8 text-white" />;
                  })()}
                </div>
                <div>
                  <p className="text-white font-bold text-lg">{selectedRoom.name}</p>
                  <p className="text-slate-400">#{selectedRoom.room_code}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800 rounded-lg p-3">
                  <p className="text-slate-400 text-sm">Type</p>
                  <p className="text-white font-bold capitalize">{selectedRoom.room_type}</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-3">
                  <p className="text-slate-400 text-sm">Participants</p>
                  <p className="text-white font-bold">{selectedRoom.current_participants}/{selectedRoom.max_participants}</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-3">
                  <p className="text-slate-400 text-sm">Game Mode</p>
                  <p className="text-white font-bold">{selectedRoom.game_mode || "-"}</p>
                </div>
                <div className="bg-slate-800 rounded-lg p-3">
                  <p className="text-slate-400 text-sm">Status</p>
                  <p className={selectedRoom.is_active ? "text-green-400 font-bold" : "text-red-400 font-bold"}>
                    {selectedRoom.is_active ? "Active" : "Closed"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                <Avatar className="w-10 h-10">
                  <AvatarImage src={selectedRoom.host?.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/20 text-primary">
                    {selectedRoom.host?.display_name?.charAt(0) || "H"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-white font-medium">{selectedRoom.host?.display_name || "Unknown"}</p>
                  <p className="text-xs text-white/50">Room Host</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
