import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, UserX, ShieldOff, Search, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { recordClientError } from "@/utils/clientErrorLog";

interface BlockedUser {
  id: string;
  blocked_id: string;
  blocked_name: string;
  blocked_avatar: string | null;
  blocked_at: string;
}

const UserManagement = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchBlockedUsers();
  }, []);

  const fetchBlockedUsers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("blocked_users")
        .select("id, blocked_id, created_at")
        .eq("blocker_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const blockedIds = data.map(b => b.blocked_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", blockedIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        setBlockedUsers(data.map(b => ({
          id: b.id,
          blocked_id: b.blocked_id,
          blocked_name: profileMap.get(b.blocked_id)?.display_name || "Unknown User",
          blocked_avatar: profileMap.get(b.blocked_id)?.avatar_url || null,
          blocked_at: b.created_at,
        })));
      }
    } catch (error) {
      console.error("Error fetching blocked users:", error);
      recordClientError({ label: "UserManagement.profileMap", message: error instanceof Error ? error.message : String(error) });
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = async (blockedUserId: string, name: string) => {
    try {
      const { error } = await supabase
        .from("blocked_users")
        .delete()
        .eq("id", blockedUserId);

      if (error) throw error;

      setBlockedUsers(prev => prev.filter(u => u.id !== blockedUserId));
      toast({ title: "User Unblocked", description: `${name} has been unblocked.` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to unblock user.", variant: "destructive" });
    }
  };

  const filteredUsers = blockedUsers.filter(u =>
    u.blocked_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center h-14 px-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-amber-50 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold pr-7">User Management</h1>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 py-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" />
          <input
            type="text"
            placeholder="Search blocked users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-amber-50/50 border border-amber-200/60 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
      </div>

      {/* Content */}
      <div className="px-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-amber-50/30 border border-amber-200/60 rounded-xl p-3 text-center">
            <UserX className="w-5 h-5 mx-auto mb-1 text-destructive" />
            <p className="text-lg font-bold">{blockedUsers.length}</p>
            <p className="text-xs text-slate-600">Blocked Users</p>
          </div>
          <div className="bg-amber-50/30 border border-amber-200/60 rounded-xl p-3 text-center">
            <User className="w-5 h-5 mx-auto mb-1 text-primary" />
            <p className="text-lg font-bold">Active</p>
            <p className="text-xs text-slate-600">Account Status</p>
          </div>
        </div>

        <h2 className="text-sm font-semibold text-slate-600 mb-3 uppercase tracking-wider">
          Blocked Users ({filteredUsers.length})
        </h2>

        {loading ? (
          <LoadingSpinner text="Loading..." />
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-12">
            <ShieldOff className="w-12 h-12 mx-auto mb-3 text-slate-600/30" />
            <p className="text-slate-600">
              {searchQuery ? "No users found" : "No blocked users"}
            </p>
            <p className="text-xs text-slate-600/60 mt-1">
              {searchQuery ? "Try a different search" : "Users you block will appear here"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-3 bg-amber-50/20 border border-amber-200/60 rounded-xl"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center overflow-hidden">
                    {user.blocked_avatar ? (
                      <img src={user.blocked_avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-5 h-5 text-slate-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{user.blocked_name}</p>
                    <p className="text-xs text-slate-600">
                      Blocked {new Date(user.blocked_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUnblock(user.id, user.blocked_name)}
                  className="text-xs"
                >
                  Unblock
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserManagement;
