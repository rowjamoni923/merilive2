import { useState, useCallback, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { ADMIN_REALTIME_EVENT, dispatchAdminTableUpdate, type AdminTableUpdateEvent } from "@/hooks/useAdminRealtime";
import { toast } from "sonner";
import {
  Search, Loader2, User, Crown, Ban, Unlock,
  MinusCircle, PlusCircle, ScanFace, KeyRound, Building2,
  CheckCircle, XCircle, Copy, ArrowLeftRight,
  AlertTriangle, RefreshCw
} from "lucide-react";

interface UserResult {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  app_uid: string | null;
  is_host: boolean | null;
  is_verified: boolean | null;
  is_blocked: boolean | null;
  blocked_reason: string | null;
  coins: number | null;
  user_level: number | null;
  host_level: number | null;
  gender: string | null;
  country_flag: string | null;
  country_name: string | null;
  is_face_verified: boolean | null;
  agency_id: string | null;
  total_earnings: number | null;
  created_at: string | null;
}

interface AgencyInfo {
  id: string;
  name: string;
  agency_code: string;
  is_blocked: boolean | null;
  diamond_balance: number;
  total_hosts: number | null;
}

interface FaceVerification {
  id: string;
  status: string;
  verification_type: string;
  admin_notes: string | null;
  created_at: string;
}

const PROFILE_SELECT_FIELDS = "id, display_name, avatar_url, app_uid, is_host, is_verified, is_blocked, blocked_reason, coins, user_level, host_level, gender, country_flag, country_name, is_face_verified, agency_id, total_earnings, created_at";

export default function UserSupportTool() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<UserResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserResult | null>(null);
  const [agencyInfo, setAgencyInfo] = useState<AgencyInfo | null>(null);
  const [faceVerification, setFaceVerification] = useState<FaceVerification | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Dialog states
  const [showDiamondDialog, setShowDiamondDialog] = useState(false);
  const [diamondAction, setDiamondAction] = useState<"add" | "remove">("add");
  const [diamondAmount, setDiamondAmount] = useState("");
  const [diamondNote, setDiamondNote] = useState("");

  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [blockReason, setBlockReason] = useState("");

  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState(false);

  const emitInstantAdminSync = useCallback((tables: string[]) => {
    const uniqueTables = Array.from(new Set(tables));
    uniqueTables.forEach((table) => {
      dispatchAdminTableUpdate({ table, eventType: "UPDATE" });
    });
    window.dispatchEvent(new CustomEvent("admin-badge-refresh"));
  }, []);

  const loadUserContext = useCallback(async (userId: string, agencyId?: string | null) => {
    const agencyPromise = agencyId
      ? supabase
          .from("agencies")
          .select("id, name, agency_code, is_blocked, diamond_balance, total_hosts")
          .eq("id", agencyId)
          .maybeSingle()
      : Promise.resolve({ data: null } as any);

    const [profileRes, agencyRes, faceRes] = await Promise.all([
      supabase.from("profiles").select(PROFILE_SELECT_FIELDS).eq("id", userId).maybeSingle(),
      agencyPromise,
      supabase
        .from("face_verification_submissions")
        .select("id, status, verification_type, admin_notes, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (profileRes.data) {
      setSelectedUser(profileRes.data);
      setResults((prev) => {
        const exists = prev.some((item) => item.id === profileRes.data!.id);
        if (!exists) return prev;
        return prev.map((item) => (item.id === profileRes.data!.id ? profileRes.data! : item));
      });
    }

    setAgencyInfo(agencyRes?.data || null);
    setFaceVerification(faceRes.data || null);
  }, []);

  // Search user by UID, name, or raw UUID
  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;

    setSearching(true);
    setHasSearched(true);
    setSelectedUser(null);
    setAgencyInfo(null);
    setFaceVerification(null);

    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q);

      // 1) Exact UID
      let { data } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT_FIELDS)
        .eq("app_uid", q)
        .limit(1);

      // 2) Exact UUID/ID (only if query is valid UUID)
      if (!data?.length && isUuid) {
        const { data: idData } = await supabase
          .from("profiles")
          .select(PROFILE_SELECT_FIELDS)
          .eq("id", q)
          .limit(1);
        data = idData;
      }

      // 3) Partial UID
      if (!data?.length) {
        const { data: partialData } = await supabase
          .from("profiles")
          .select(PROFILE_SELECT_FIELDS)
          .ilike("app_uid", `%${q}%`)
          .limit(20);
        data = partialData;
      }

      // 4) Name search
      if (!data?.length) {
        const { data: nameData } = await supabase
          .from("profiles")
          .select(PROFILE_SELECT_FIELDS)
          .ilike("display_name", `%${q}%`)
          .limit(20);
        data = nameData;
      }

      setResults(data || []);
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Search failed");
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  // Select a user and load extra info
  const selectUser = async (user: UserResult) => {
    setSelectedUser(user);
    await loadUserContext(user.id, user.agency_id);
  };

  // Refresh selected user data
  const refreshUser = async () => {
    if (!selectedUser) return;
    await loadUserContext(selectedUser.id, selectedUser.agency_id);
  };

  useEffect(() => {
    const userId = selectedUser?.id;
    const agencyId = selectedUser?.agency_id;
    if (!userId) return;

    const sync = () => {
      void loadUserContext(userId, agencyId);
    };

    const handleSupportSync = (event: Event) => {
      const table = (event as CustomEvent<AdminTableUpdateEvent>).detail?.table;
      if (table === 'profiles' || table === 'face_verification_submissions' || table === 'agencies') sync();
    };
    window.addEventListener(ADMIN_REALTIME_EVENT, handleSupportSync);

    return () => {
      window.removeEventListener(ADMIN_REALTIME_EVENT, handleSupportSync);
    };
  }, [selectedUser?.id, selectedUser?.agency_id, loadUserContext]);

  // === ACTIONS ===

  // Diamond Add/Remove
  const handleDiamondAction = async () => {
    if (!selectedUser || !diamondAmount || actionLoading) return;
    setActionLoading(true);
    try {
      const amount = parseInt(diamondAmount);
      if (isNaN(amount) || amount <= 0) throw new Error("Invalid amount");

      if (diamondAction === "add") {
        const { error } = await supabase.rpc("admin_add_user_coins", {
          _user_id: selectedUser.id,
          _amount: amount,
          _note: diamondNote || "Support action",
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("deduct_coins_from_user", {
          p_user_id: selectedUser.id,
          p_amount: amount,
        });
        if (error) throw error;
      }

      emitInstantAdminSync(["profiles"]);
      toast.success(`💎 ${diamondAction === "add" ? "Added" : "Removed"} ${amount} diamonds`);
      setShowDiamondDialog(false);
      setDiamondAmount("");
      setDiamondNote("");
      await refreshUser();
    } catch (error: any) {
      toast.error(error.message || "Failed");
    } finally {
      setActionLoading(false);
    }
  };

  // Block / Unblock
  const handleBlockAction = async () => {
    if (!selectedUser || actionLoading) return;
    setActionLoading(true);
    try {
      const { error } = await supabase.rpc("admin_block_user", {
        _user_id: selectedUser.id,
        _block: !selectedUser.is_blocked,
        _reason: blockReason || null
      });
      if (error) throw error;
      toast.success(selectedUser.is_blocked ? "✅ User unblocked" : "🚫 User blocked");
      setShowBlockDialog(false);
      setBlockReason("");
      emitInstantAdminSync(["profiles", "banned_devices", "notifications"]);
      await refreshUser();
    } catch (error) {
      toast.error("Failed");
    } finally {
      setActionLoading(false);
    }
  };

  // Convert User <-> Host
  const handleConvertRole = async () => {
    if (!selectedUser || actionLoading) return;
    setActionLoading(true);
    try {
      const targetGender = selectedUser.is_host ? "male" : "female";
      const { error } = await supabase.rpc("admin_update_user_gender", {
        _user_id: selectedUser.id,
        _gender: targetGender,
      });
      if (error) throw error;

      if (!selectedUser.is_host) {
        await supabase.from("notifications").insert({
          user_id: selectedUser.id,
          type: "system",
          title: "🎤 Host Account Activated!",
          message: "Your account has been converted to Host. You can now go live!",
          data: { action: "converted_to_host" },
        });
      }

      emitInstantAdminSync(["profiles", "notifications"]);
      toast.success(selectedUser.is_host ? "👤 Converted to User" : "🎤 Converted to Host");
      await refreshUser();
    } catch (error) {
      toast.error("Failed");
    } finally {
      setActionLoading(false);
    }
  };

  // Toggle Verification
  const handleToggleVerification = async () => {
    if (!selectedUser || actionLoading) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("profiles") // guard-ok: admin-only selected-user verification update via adminSupabase + server-side admin session RLS
        .update({ is_verified: !selectedUser.is_verified })
        .eq("id", selectedUser.id);
      if (error) throw error;
      emitInstantAdminSync(["profiles"]);
      toast.success(selectedUser.is_verified ? "Verification removed" : "✅ User verified");
      await refreshUser();
    } catch (error) {
      toast.error("Failed");
    } finally {
      setActionLoading(false);
    }
  };

  // Complete Face Verification
  const handleCompleteFaceVerification = async () => {
    if (!selectedUser || actionLoading) return;
    setActionLoading(true);
    try {
      if (faceVerification?.id) {
        const { data, error } = await supabase.rpc("admin_process_face_verification", {
          _submission_id: faceVerification.id,
          _action: "approve",
          _reason: "Manually approved by admin via Support Tool",
          _approve_as: selectedUser.is_host ? "host" : "user",
          _set_gender: selectedUser.gender || (selectedUser.is_host ? "female" : "male"),
        });
        if (error) throw error;
        if ((data as any)?.pending) {
          toast.success("⏳ Submitted for Owner Approval");
          await refreshUser();
          return;
        }
        if ((data as any)?.success === false) throw new Error((data as any)?.error || 'Failed');
      } else {
        const { data, error } = await supabase.rpc("admin_toggle_face_verification", {
          _user_id: selectedUser.id,
          _verified: true,
        });
        if (error) throw error;
        if ((data as any)?.success === false) throw new Error((data as any)?.error || 'Failed');
      }

      emitInstantAdminSync(["profiles", "face_verification_submissions"]);
      toast.success("✅ Face verification completed");
      await refreshUser();
    } catch (error) {
      toast.error("Failed");
    } finally {
      setActionLoading(false);
    }
  };

  // Reset Password
  const handleResetPassword = async () => {
    if (!selectedUser || actionLoading) return;
    setActionLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-reset-user-password', {
        body: { user_id: selectedUser.id },
      });

      if (error) throw new Error(error.message || "Failed");
      if (!data?.success) throw new Error(data?.error || "Failed");

      setTempPassword(data.temp_password);
      toast.success("🔐 Password reset successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4 pb-4">
      {/* Search Bar */}
      <Card className="bg-card border-border">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by UID, Name, or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9"
              />
            </div>
            <Button onClick={handleSearch} disabled={searching || !searchQuery.trim()}>
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Search Results */}
        <div className="lg:col-span-1">
          <Card className="bg-card border-border">
            <CardHeader className="p-3">
              <CardTitle className="text-sm text-muted-foreground">
                {hasSearched ? `Results (${results.length})` : "Search to find users"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[60vh] min-h-[360px] max-h-[560px]">
                {results.length === 0 && hasSearched ? (
                  <div className="p-6 text-center text-muted-foreground">
                    <User className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No users found</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {results.map((user) => (
                      <div
                        key={user.id}
                        onClick={() => selectUser(user)}
                        className={`p-3 cursor-pointer transition-colors hover:bg-muted/50 ${
                          selectedUser?.id === user.id ? "bg-primary/10 border-l-2 border-l-primary" : ""
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.avatar_url || ""} />
                            <AvatarFallback className="text-xs bg-muted">
                              {(user.display_name || "?")[0]}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="text-sm font-medium truncate">{user.display_name || "Unknown"}</span>
                              {user.is_host && <Crown className="h-3 w-3 text-pink-500 shrink-0" />}
                              {user.is_verified && <CheckCircle className="h-3 w-3 text-blue-500 shrink-0" />}
                              {user.is_blocked && <Ban className="h-3 w-3 text-destructive shrink-0" />}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>UID: {user.app_uid}</span>
                              {user.country_flag && <span>{user.country_flag}</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* User Detail & Actions */}
        <div className="lg:col-span-2">
          {selectedUser ? (
            <div className="space-y-4">
              {/* Profile Card */}
              <Card className="bg-card border-border">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarImage src={selectedUser.avatar_url || ""} />
                      <AvatarFallback className="text-lg bg-muted">
                        {(selectedUser.display_name || "?")[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-lg font-bold">{selectedUser.display_name || "Unknown"}</h2>
                        {selectedUser.is_host ? (
                          <Badge className="bg-pink-500/20 text-pink-400 border-pink-500/30">🎤 Host</Badge>
                        ) : (
                          <Badge variant="secondary">👤 User</Badge>
                        )}
                        {selectedUser.is_verified && <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">✓ Verified</Badge>}
                        {selectedUser.is_blocked && <Badge variant="destructive">🚫 Blocked</Badge>}
                        {selectedUser.is_face_verified && <Badge className="bg-green-500/20 text-green-400 border-green-500/30">🔐 Face OK</Badge>}
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">UID:</span>
                          <span className="ml-1 font-mono">{selectedUser.app_uid}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">💎 Diamonds:</span>
                          <span className="ml-1 font-bold text-cyan-400">{(selectedUser.coins || 0).toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Level:</span>
                          <span className="ml-1">{selectedUser.is_host ? `H${selectedUser.host_level || 0}` : `U${selectedUser.user_level || 0}`}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Country:</span>
                          <span className="ml-1">{selectedUser.country_flag} {selectedUser.country_name || "N/A"}</span>
                        </div>
                      </div>
                      {selectedUser.is_blocked && selectedUser.blocked_reason && (
                        <div className="mt-2 p-2 bg-destructive/10 rounded text-sm text-destructive">
                          <AlertTriangle className="h-3 w-3 inline mr-1" />
                          Block reason: {selectedUser.blocked_reason}
                        </div>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" onClick={refreshUser} title="Refresh">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Agency Info */}
              {agencyInfo && (
                <Card className="bg-card border-border">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-purple-400" />
                      <span className="font-medium text-sm">Agency: {agencyInfo.name}</span>
                      <Badge variant="outline" className="text-xs">{agencyInfo.agency_code}</Badge>
                      {agencyInfo.is_blocked && <Badge variant="destructive" className="text-xs">Blocked</Badge>}
                      <span className="text-xs text-muted-foreground ml-auto">
                        💎 {agencyInfo.diamond_balance.toLocaleString()} • {agencyInfo.total_hosts || 0} hosts
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Face Verification Status */}
              {faceVerification && (
                <Card className="bg-card border-border">
                  <CardContent className="p-3">
                    <div className="flex items-center gap-2">
                      <ScanFace className="h-4 w-4 text-green-400" />
                      <span className="text-sm font-medium">Face Verification:</span>
                      <Badge className={
                        faceVerification.status === "approved" ? "bg-green-500/20 text-green-400" :
                        faceVerification.status === "rejected" ? "bg-red-500/20 text-red-400" :
                        "bg-yellow-500/20 text-yellow-400"
                      }>
                        {faceVerification.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        ({faceVerification.verification_type})
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Quick Actions Grid */}
              <Card className="bg-card border-border">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">⚡ Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {/* Add Diamonds */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-start text-xs h-9 border-green-500/30 text-green-400 hover:bg-green-500/10"
                      onClick={() => { setDiamondAction("add"); setShowDiamondDialog(true); }}
                    >
                      <PlusCircle className="h-3.5 w-3.5 mr-1.5" />
                      Add Diamonds
                    </Button>

                    {/* Remove Diamonds */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-start text-xs h-9 border-red-500/30 text-red-400 hover:bg-red-500/10"
                      onClick={() => { setDiamondAction("remove"); setShowDiamondDialog(true); }}
                    >
                      <MinusCircle className="h-3.5 w-3.5 mr-1.5" />
                      Remove Diamonds
                    </Button>

                    {/* Block / Unblock */}
                    <Button
                      variant="outline"
                      size="sm"
                      className={`justify-start text-xs h-9 ${
                        selectedUser.is_blocked
                          ? "border-green-500/30 text-green-400 hover:bg-green-500/10"
                          : "border-destructive/30 text-destructive hover:bg-destructive/10"
                      }`}
                      onClick={() => setShowBlockDialog(true)}
                    >
                      {selectedUser.is_blocked ? (
                        <><Unlock className="h-3.5 w-3.5 mr-1.5" /> Unblock User</>
                      ) : (
                        <><Ban className="h-3.5 w-3.5 mr-1.5" /> Block User</>
                      )}
                    </Button>

                    {/* Convert Role */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-start text-xs h-9 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
                      onClick={handleConvertRole}
                      disabled={actionLoading}
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5 mr-1.5" />
                      {selectedUser.is_host ? "→ Convert to User" : "→ Convert to Host"}
                    </Button>

                    {/* Toggle Verification */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-start text-xs h-9 border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                      onClick={handleToggleVerification}
                      disabled={actionLoading}
                    >
                      {selectedUser.is_verified ? (
                        <><XCircle className="h-3.5 w-3.5 mr-1.5" /> Remove Verify</>
                      ) : (
                        <><CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Verify User</>
                      )}
                    </Button>

                    {/* Complete Face Verification */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-start text-xs h-9 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                      onClick={handleCompleteFaceVerification}
                      disabled={actionLoading || !!selectedUser.is_face_verified}
                    >
                      <ScanFace className="h-3.5 w-3.5 mr-1.5" />
                      {selectedUser.is_face_verified ? "Face ✓ Done" : "Complete Face"}
                    </Button>

                    {/* Reset Password */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-start text-xs h-9 border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
                      onClick={() => { setTempPassword(null); setShowPasswordDialog(true); }}
                    >
                      <KeyRound className="h-3.5 w-3.5 mr-1.5" />
                      Reset Password
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card className="bg-card border-border">
              <CardContent className="p-12 text-center text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p className="text-lg font-medium">User Support Tool</p>
                <p className="text-sm mt-1">Search by UID or name to manage user issues</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Diamond Dialog */}
      <Dialog open={showDiamondDialog} onOpenChange={setShowDiamondDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {diamondAction === "add" ? <PlusCircle className="h-5 w-5 text-green-400" /> : <MinusCircle className="h-5 w-5 text-red-400" />}
              {diamondAction === "add" ? "Add Diamonds" : "Remove Diamonds"}
            </DialogTitle>
            <DialogDescription>
              {selectedUser?.display_name} • Current: 💎 {(selectedUser?.coins || 0).toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              type="number"
              placeholder="Amount"
              value={diamondAmount}
              onChange={(e) => setDiamondAmount(e.target.value)}
            />
            <Textarea
              placeholder="Note (optional)"
              value={diamondNote}
              onChange={(e) => setDiamondNote(e.target.value)}
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowDiamondDialog(false)}>Cancel</Button>
            <Button
              onClick={handleDiamondAction}
              disabled={actionLoading || !diamondAmount}
              className={diamondAction === "add" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block Dialog */}
      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {selectedUser?.is_blocked ? "Unblock User" : "Block User"}
            </DialogTitle>
            <DialogDescription>
              {selectedUser?.display_name} (UID: {selectedUser?.app_uid})
            </DialogDescription>
          </DialogHeader>
          {!selectedUser?.is_blocked && (
            <Textarea
              placeholder="Block reason..."
              value={blockReason}
              onChange={(e) => setBlockReason(e.target.value)}
              rows={2}
            />
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowBlockDialog(false)}>Cancel</Button>
            <Button
              onClick={handleBlockAction}
              disabled={actionLoading}
              variant={selectedUser?.is_blocked ? "default" : "destructive"}
            >
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : selectedUser?.is_blocked ? "Unblock" : "Block"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Password Reset Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-orange-400" />
              Reset Password
            </DialogTitle>
            <DialogDescription>
              {selectedUser?.display_name} (UID: {selectedUser?.app_uid})
            </DialogDescription>
          </DialogHeader>
          {tempPassword ? (
            <div className="space-y-3">
              <p className="text-sm text-green-400">✅ Password reset successful!</p>
              <div className="flex items-center gap-2 p-2 bg-muted rounded">
                <code className="flex-1 text-sm font-mono">{tempPassword}</code>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    navigator.clipboard.writeText(tempPassword);
                    toast.success("Copied!");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">Share this temporary password with the user</p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                This will generate a new temporary password for this user.
              </p>
              <Button onClick={handleResetPassword} disabled={actionLoading} className="w-full">
                {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
                Generate Temporary Password
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
