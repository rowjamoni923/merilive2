import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { PageSkeleton } from "@/components/common/PageSkeleton";

import { 
  ArrowLeft, 
  Send,
  CheckCircle2,
  User,
  Search,
  Calendar,
  Filter
} from "lucide-react";
import { Skeleton as SkeletonPrim } from "@/components/Skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";

interface TransferRecord {
  id: string;
  receiver_id: string;
  receiver_name: string | null;
  receiver_avatar: string | null;
  amount: number;
  note: string | null;
  status: string;
  created_at: string;
}

const TransferHistory = () => {
  const navigate = useNavigate();
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [totalTransferred, setTotalTransferred] = useState(0);

  useEffect(() => {
    const fetchTransfers = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data } = await supabase
        .rpc("get_agency_transfer_history", { _limit: 100 });

      if (data) {
        const typedData = data as TransferRecord[];
        setTransfers(typedData);
        setTotalTransferred(typedData.reduce((sum, t) => sum + t.amount, 0));
      }

      setIsLoading(false);
    };

    fetchTransfers();

    // Pkg83-ext: removed static `transfer-history` channel (diamond_transfers
    // not in publication). Visibility refetch.
    const refetch = async () => {
      const { data } = await supabase.rpc("get_agency_transfer_history", { _limit: 100 });
      if (data) {
        const typed = data as TransferRecord[];
        setTransfers(typed);
        setTotalTransferred(typed.reduce((sum, t) => sum + t.amount, 0));
      }
    };
    // No-auto-refresh: initial fetch only.

  }, [navigate]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  };

  const filteredTransfers = transfers.filter(t => 
    (t.receiver_name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
    t.receiver_id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedTransfers = filteredTransfers.reduce((groups, transfer) => {
    const date = new Date(transfer.created_at).toLocaleDateString("en-US", {
    });
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(transfer);
    return groups;
  }, {} as Record<string, TransferRecord[]>);

  if (isLoading) {
    return <PageSkeleton className="fixed inset-0 flex flex-col bg-background overflow-hidden" rows={6} hero />;
  }


  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex-shrink-0 sticky top-0 z-10 bg-gradient-to-r from-emerald-500 to-teal-600 text-white safe-area-top">
        <div className="flex items-center h-14 px-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors touch-manipulation"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold pr-7">Transfer History</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>

      {/* Stats Card */}
      <div className="mx-4 mt-4 bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Total Transfers</p>
            <p className="text-2xl font-bold text-emerald-400">{transfers.length}</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Total Diamonds Sent</p>
            <p className="text-2xl font-bold text-orange-400">{totalTransferred.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mx-4 mt-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search by name or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Transfer List */}
      <div className="mx-4 mt-4 space-y-4">
        {Object.keys(groupedTransfers).length === 0 ? (
          <div className="bg-white/5 rounded-2xl p-8 text-center border border-white/10">
            <Send className="w-16 h-16 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-foreground font-medium">No transfers found</p>
            <p className="text-sm text-muted-foreground mt-1">Your transfer history will appear here</p>
          </div>
        ) : (
          Object.entries(groupedTransfers).map(([date, dayTransfers]) => (
            <div key={date} className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2 bg-white/5 border-b border-white/10">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{date}</span>
                <Badge variant="secondary" className="ml-auto text-xs">
                  {dayTransfers.length} transfers
                </Badge>
              </div>
              
              <div className="divide-y divide-white/5">
                {dayTransfers.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3 p-4">
                    <Avatar className="w-12 h-12 border-2 border-white/10">
                      <AvatarImage src={tx.receiver_avatar || ""} />
                      <AvatarFallback className="bg-gradient-to-br from-emerald-500/20 to-teal-500/20">
                        <User className="w-6 h-6 text-emerald-400" />
                      </AvatarFallback>
                    </Avatar>
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">
                        {tx.receiver_name || "Unknown User"}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        ID: {tx.receiver_id.slice(0, 12)}...
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        {new Date(tx.created_at).toLocaleTimeString("en-US", {
                        })}
                      </p>
                    </div>
                    
                    <div className="text-right">
                      <p className="font-bold text-lg text-orange-400">
                        -{tx.amount.toLocaleString()}
                      </p>
                      <Badge 
                        variant="outline" 
                        className={`text-[10px] ${
                          tx.status === "completed" 
                            ? "text-green-400 border-green-500/30 bg-green-500/10" 
                            : "text-yellow-400 border-yellow-500/30 bg-yellow-500/10"
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3 mr-0.5" />
                        {tx.status === "completed" ? "Completed" : "Pending"}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
      </div>
    </div>
  );
};

export default TransferHistory;
