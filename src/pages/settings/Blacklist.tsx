import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, UserX, Trash2 } from "lucide-react";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface BlockedUser {
  id: string;
  blocked_id: string;
  created_at: string;
  blocked_profile: {
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  } | null;
}

const Blacklist = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockUserId, setUnblockUserId] = useState<string | null>(null);

  useEffect(() => {
    fetchBlockedUsers();
  }, []);

  const fetchBlockedUsers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data, error } = await supabase
        .from("user_blocks")
        .select("id, blocked_id, created_at")
        .eq("blocker_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        const blockedIds = data.map(b => b.blocked_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, username")
          .in("id", blockedIds);

        const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

        setBlockedUsers(data.map(b => ({
          id: b.id,
          blocked_id: b.blocked_id,
          created_at: b.created_at ?? '',
          blocked_profile: profileMap.get(b.blocked_id) ? {
            display_name: profileMap.get(b.blocked_id)!.display_name,
            avatar_url: profileMap.get(b.blocked_id)!.avatar_url,
            username: profileMap.get(b.blocked_id)!.username,
          } : null,
        })));
      } else {
        setBlockedUsers([]);
      }
    } catch (error) {
      console.error("Error fetching blocked users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = async (blockId: string) => {
    try {
      const { error } = await supabase
        .from("user_blocks")
        .delete()
        .eq("id", blockId);

      if (error) throw error;

      setBlockedUsers(prev => prev.filter(u => u.id !== blockId));
      toast({
        title: "Unblocked",
        description: "User has been unblocked successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to unblock user",
        variant: "destructive",
      });
    } finally {
      setUnblockUserId(null);
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex-shrink-0 sticky top-0 z-10 bg-background border-b safe-area-top">
        <div className="flex items-center h-14 px-4">
          <button 
            onClick={() => navigate(-1)}
            className="p-2 -ml-2 hover:bg-muted rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold pr-7">Block List</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
      {blockedUsers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-4">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mb-4">
            <UserX className="w-10 h-10 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold mb-2">No Blocked Users</h2>
          <p className="text-muted-foreground text-center text-sm">
            You haven't blocked anyone. You can block users from their profile if they bother you.
          </p>
        </div>
      ) : (
        <div className="divide-y">
          {blockedUsers.map((blocked) => (
            <div
              key={blocked.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={blocked.blocked_profile?.avatar_url} />
                  <AvatarFallback className="bg-gradient-to-br from-purple-400 to-pink-400 text-white">
                    {blocked.blocked_profile?.display_name?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">
                    {blocked.blocked_profile?.display_name || "Unknown User"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    @{blocked.blocked_profile?.username || blocked.blocked_id.slice(0, 8)}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30"
                onClick={() => setUnblockUserId(blocked.id)}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                Unblock
              </Button>
            </div>
          ))}
        </div>
      )}

      </div>

      {/* Unblock Confirmation */}
      <AlertDialog open={!!unblockUserId} onOpenChange={() => setUnblockUserId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unblock User?</AlertDialogTitle>
            <AlertDialogDescription>
              This user will be able to access your streams and party rooms.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => unblockUserId && handleUnblock(unblockUserId)}
            >
              Unblock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Blacklist;
