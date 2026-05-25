import { useState } from "react";
import { Search, Gift, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SmartImage } from "@/components/ui/smart-image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Label } from "@/components/ui/label";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";

interface UserSearchResult {
  id: string;
  display_name: string | null;
  app_uid: string | null;
  avatar_url: string | null;
  is_host: boolean | null;
}

interface GiftFrameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  frameId: string;
  frameName: string;
  framePreviewUrl?: string | null;
  /** which table the frame lives in: 'avatar_frames' (default) or 'role_frames' */
  sourceTable?: "avatar_frames" | "role_frames";
}

const GiftFrameDialog = ({
  open,
  onOpenChange,
  frameId,
  frameName,
  framePreviewUrl,
  sourceTable = "avatar_frames",
}: GiftFrameDialogProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [expiresInDays, setExpiresInDays] = useState<string>("");
  const [gifting, setGifting] = useState(false);

  const reset = () => {
    setSearchQuery("");
    setSearchResults([]);
    setSelectedUser(null);
    setExpiresInDays("");
  };

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;
    setSearching(true);
    try {
      // exact UID first
      const { data: exact } = await adminSupabase
        .from("profiles")
        .select("id, display_name, app_uid, avatar_url, is_host")
        .eq("app_uid", q)
        .limit(5);

      if (exact && exact.length > 0) {
        setSearchResults(exact as UserSearchResult[]);
        return;
      }

      const { data } = await adminSupabase
        .from("profiles")
        .select("id, display_name, app_uid, avatar_url, is_host")
        .or(`display_name.ilike.%${q}%,app_uid.ilike.%${q}%`)
        .limit(10);

      setSearchResults((data || []) as UserSearchResult[]);
    } catch (err: any) {
      toast.error(err?.message || "Search failed");
    } finally {
      setSearching(false);
    }
  };

  const handleGift = async () => {
    if (!selectedUser) {
      toast.error("Please select a user first");
      return;
    }
    setGifting(true);
    try {
      const expiresAt =
        expiresInDays && Number(expiresInDays) > 0
          ? new Date(Date.now() + Number(expiresInDays) * 86400 * 1000).toISOString()
          : null;

      const { data, error } = await adminSupabase.rpc("admin_gift_frame_to_user", {
        p_user_id: selectedUser.id,
        p_frame_id: frameId,
        p_source_table: sourceTable,
        p_expires_at: expiresAt,
        p_notes: `Gifted via admin (${frameName})`,
      });

      if (error) throw error;

      const result = data as any;
      if (result?.success === false) {
        throw new Error(result?.error || "Gift failed");
      }

      toast.success(
        `🎁 "${frameName}" gifted to ${selectedUser.display_name || selectedUser.app_uid}! Auto-equipped on their profile.`
      );
      reset();
      onOpenChange(false);
    } catch (err: any) {
      console.error("Gift frame error:", err);
      toast.error(err?.message || "Failed to gift frame");
    } finally {
      setGifting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="w-5 h-5 text-pink-500" />
            Gift Frame to User
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Frame info */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted">
            {framePreviewUrl ? (
              <SmartImage
                src={framePreviewUrl}
                alt={frameName}
                className="w-12 h-12 rounded object-contain bg-black/20" onError={(e) => { const t = e.currentTarget; if (t.src.indexOf('/placeholder.svg') === -1) t.src = '/placeholder.svg'; }} />
            ) : (
              <div className="w-12 h-12 rounded bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-xs">
                Frame
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{frameName}</p>
              <p className="text-xs text-muted-foreground">
                Source: {sourceTable}
              </p>
            </div>
          </div>

          {/* User search */}
          {!selectedUser ? (
            <>
              <Label>Search user (App UID or display name)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. 1000234 or Sazzad"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-1 max-h-60 overflow-y-auto border rounded-lg p-2">
                  {searchResults.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => setSelectedUser(u)}
                      className="w-full flex items-center gap-3 p-2 rounded hover:bg-muted text-left"
                    >
                      <Avatar className="w-9 h-9">
                        <AvatarImage src={u.avatar_url || undefined} />
                        <AvatarFallback>
                          {(u.display_name || "U")[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {u.display_name || "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          UID: {u.app_uid || "—"} {u.is_host && "• Host"}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchResults.length === 0 && searchQuery && !searching && (
                <p className="text-sm text-muted-foreground">No users found.</p>
              )}
            </>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-lg border-2 border-primary/40 bg-primary/5">
              <Avatar className="w-10 h-10">
                <AvatarImage src={selectedUser.avatar_url || undefined} />
                <AvatarFallback>
                  {(selectedUser.display_name || "U")[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">
                  {selectedUser.display_name || "Unknown"}
                </p>
                <p className="text-xs text-muted-foreground">
                  UID: {selectedUser.app_uid || "—"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSelectedUser(null)}
                title="Change user"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          )}

          {/* Optional expiry */}
          {selectedUser && (
            <div>
              <Label>Expires in (days, optional)</Label>
              <Input
                type="number"
                min="0"
                placeholder="Leave empty for permanent"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                The frame auto-equips on the user's profile and appears in
                their VIP → My Privileges. They can change to another frame
                whenever they want.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={gifting}>
            Cancel
          </Button>
          <Button
            onClick={handleGift}
            disabled={!selectedUser || gifting}
            className="bg-gradient-to-r from-pink-500 to-purple-500"
          >
            {gifting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Gifting...
              </>
            ) : (
              <>
                <Gift className="w-4 h-4 mr-2" />
                Gift Frame
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GiftFrameDialog;
