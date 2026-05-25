import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SmartImage } from "@/components/ui/smart-image";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { toast } from "sonner";
import {
  Skull, AlertTriangle, AlertCircle, Search,
  ShieldAlert, Smartphone, Globe, ScanFace, Clock, Ban
} from "lucide-react";
import { format } from "date-fns";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { cn } from "@/lib/utils";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
type Severity = "medium" | "high" | "urgent";

interface SeverityBan {
  id: string;
  user_id: string;
  display_name: string | null;
  app_uid: string | null;
  avatar_url: string | null;
  ban_reason: string;
  severity: Severity;
  ban_start: string;
  ban_end: string | null;
  is_active: boolean;
  device_banned: boolean;
  ip_banned: boolean;
  face_hash_banned: boolean;
}

const SEVERITY_CONFIG: Record<Severity, {
  label: string;
  icon: typeof AlertCircle;
  color: string;
  ring: string;
  bg: string;
  text: string;
  description: string;
  durationLabel: string;
  durationUnit: string;
}> = {
  medium: {
    label: "Medium",
    icon: AlertCircle,
    color: "from-yellow-500 to-amber-600",
    ring: "ring-yellow-500/30",
    bg: "bg-yellow-500/10 border-yellow-500/30",
    text: "text-yellow-400",
    description: "Account suspended for X days. Device, IP, and face are NOT blocked.",
    durationLabel: "Duration (days)",
    durationUnit: "days",
  },
  high: {
    label: "High",
    icon: AlertTriangle,
    color: "from-orange-500 to-red-600",
    ring: "ring-orange-500/30",
    bg: "bg-orange-500/10 border-orange-500/30",
    text: "text-orange-400",
    description: "Account suspended for X hours. Device, IP, and face are NOT blocked.",
    durationLabel: "Duration (hours)",
    durationUnit: "hours",
  },
  urgent: {
    label: "Urgent",
    icon: Skull,
    color: "from-rose-600 to-red-800",
    ring: "ring-rose-500/40",
    bg: "bg-rose-500/10 border-rose-500/40",
    text: "text-rose-400",
    description: "LIFETIME ban. Account + Device ID + IP Address + Face Hash all permanently blocked. Factory-reset proof.",
    durationLabel: "(Permanent)",
    durationUnit: "lifetime",
  },
};

export default function AdminPermanentBan() {
  const [activeSeverity, setActiveSeverity] = useState<Severity>("medium");
  const [bans, setBans] = useState<SeverityBan[]>([]);
  const [loading, setLoading] = useState(false);

  // Form
  const [searchUid, setSearchUid] = useState("");
  const [searchedUser, setSearchedUser] = useState<any>(null);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [durationValue, setDurationValue] = useState<string>("7");
  const [submitting, setSubmitting] = useState(false);

  // Detail
  const [selectedBan, setSelectedBan] = useState<SeverityBan | null>(null);

  const fetchBans = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("admin_list_severity_bans" as any, {
        _severity: activeSeverity,
        _limit: 200,
      });
      if (error) throw error;
      setBans((data as any[]) || []);
    } catch (e: any) {
      recordAdminError({ kind: "rpc", label: "AdminPermanentBan", message: formatAdminError(e) });
      toast.error("Failed to load bans");
    } finally {
      setLoading(false);
    }
  }, [activeSeverity]);

  useEffect(() => { fetchBans(); }, [fetchBans]);

  useAdminRealtime(["live_bans"], () => fetchBans());

  // Reset duration default when severity changes
  useEffect(() => {
    if (activeSeverity === "high") setDurationValue("24");
    else if (activeSeverity === "medium") setDurationValue("7");
    else setDurationValue("0");
  }, [activeSeverity]);

  const handleSearchUser = async () => {
    if (!searchUid.trim()) return;
    setSearchedUser(null);
    const q = searchUid.trim();
    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, avatar_url, app_uid, is_blocked, role, device_id, last_ip, face_hash")
      .or(`app_uid.eq.${q},id.eq.${q}`)
      .maybeSingle();
    if (error || !data) {
      toast.error("User not found");
      return;
    }
    setSearchedUser(data);
  };

  const handleApplyBan = async () => {
    if (!searchedUser) {
      toast.error("Search a user first");
      return;
    }
    if (!reason.trim()) {
      toast.error("Reason is required");
      return;
    }

    let durationInt: number | null = null;
    if (activeSeverity !== "urgent") {
      const v = parseInt(durationValue, 10);
      if (!Number.isFinite(v) || v < 1) {
        toast.error("Enter a valid positive duration");
        return;
      }
      durationInt = v;
    }

    if (activeSeverity === "urgent") {
      if (!confirm(
        `🚨 URGENT BAN — LIFETIME\n\nThis will PERMANENTLY block:\n• User account (${searchedUser.display_name})\n• Device ID\n• IP Address\n• Face Hash\n\nThe user will NEVER be able to create another account from this device, IP, or face — even after a factory reset.\n\nProceed?`
      )) return;
    }

    setSubmitting(true);
    const evidenceArr = evidence.trim()
      ? evidence.split("\n").filter(Boolean).map((line) => ({ note: line }))
      : [];

    const { data, error } = await supabase.rpc("admin_apply_severity_ban" as any, {
      _target_user_id: searchedUser.id,
      _severity: activeSeverity,
      _duration_value: durationInt ?? 0,
      _reason: reason.trim(),
      _evidence: evidenceArr,
    });

    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    const summary = data as any;
    if (activeSeverity === "urgent") {
      toast.success(
        `🚨 URGENT BAN APPLIED — Permanently blocked: ${summary?.devices_banned || 0} device, ${summary?.ips_banned || 0} IP, ${summary?.faces_banned || 0} face hash.`
      );
    } else {
      toast.success(`${SEVERITY_CONFIG[activeSeverity].label} ban applied — ends ${summary?.ban_end ? format(new Date(summary.ban_end), "PP p") : "—"}`);
    }

    setSearchUid("");
    setSearchedUser(null);
    setReason("");
    setEvidence("");
    fetchBans();
  };

  const cfg = SEVERITY_CONFIG[activeSeverity];
  const SeverityIcon = cfg.icon;

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 via-red-600 to-rose-800 shadow-lg shadow-rose-500/30 ring-2 ring-rose-400/20">
          <Skull className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Permanent Ban Center</h1>
          <p className="text-sm text-muted-foreground">
            Severity-based banning — Medium (days) · High (hours) · Urgent (lifetime + device/IP/face block)
          </p>
        </div>
      </div>

      {/* Severity tabs */}
      <Tabs value={activeSeverity} onValueChange={(v) => setActiveSeverity(v as Severity)}>
        <TabsList className="grid w-full grid-cols-3 h-auto">
          {(Object.keys(SEVERITY_CONFIG) as Severity[]).map((sev) => {
            const c = SEVERITY_CONFIG[sev];
            const Icon = c.icon;
            return (
              <TabsTrigger
                key={sev}
                value={sev}
                className={cn(
                  "flex items-center gap-2 py-3 data-[state=active]:bg-gradient-to-br",
                  activeSeverity === sev && `data-[state=active]:${c.color}`
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="font-semibold">{c.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {(Object.keys(SEVERITY_CONFIG) as Severity[]).map((sev) => (
          <TabsContent key={sev} value={sev} className="space-y-4 mt-4">
            {/* Severity description card */}
            <Card className={cn("border", cfg.bg)}>
              <CardContent className="pt-4 flex items-start gap-3">
                <SeverityIcon className={cn("h-5 w-5 mt-0.5", cfg.text)} />
                <div className="flex-1">
                  <p className={cn("font-semibold text-sm", cfg.text)}>{cfg.label} Severity</p>
                  <p className="text-xs text-muted-foreground mt-1">{cfg.description}</p>
                </div>
              </CardContent>
            </Card>

            {/* Apply ban form */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Ban className="h-5 w-5" />
                  Apply {cfg.label} Ban
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="App UID or User UUID (e.g., 1645256350)"
                    value={searchUid}
                    onChange={(e) => setSearchUid(e.target.value)}
                  />
                  <Button onClick={handleSearchUser} variant="secondary">
                    <Search className="h-4 w-4 mr-1" /> Search
                  </Button>
                </div>

                {searchedUser && (
                  <div className="rounded-lg border border-border bg-muted/40 p-3 flex items-center gap-3">
                    <SmartImage
                      src={searchedUser.avatar_url || "/placeholder.svg"}
                      className="h-10 w-10 rounded-full object-cover"
                      alt="" onError={(e) => { const t = e.currentTarget; if (t.src.indexOf('/placeholder.svg') === -1) t.src = '/placeholder.svg'; }} />
                    <div className="flex-1">
                      <div className="font-semibold">{searchedUser.display_name}</div>
                      <div className="text-xs text-muted-foreground">
                        UID: {searchedUser.app_uid} • Role: {searchedUser.role}
                      </div>
                      {sev === "urgent" && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {searchedUser.device_id && (
                            <Badge variant="outline" className="text-[10px]">
                              <Smartphone className="h-3 w-3 mr-1" /> Device tracked
                            </Badge>
                          )}
                          {searchedUser.last_ip && (
                            <Badge variant="outline" className="text-[10px]">
                              <Globe className="h-3 w-3 mr-1" /> IP tracked
                            </Badge>
                          )}
                          {searchedUser.face_hash && (
                            <Badge variant="outline" className="text-[10px]">
                              <ScanFace className="h-3 w-3 mr-1" /> Face hash tracked
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    {searchedUser.is_blocked && <Badge variant="destructive">Already blocked</Badge>}
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label>Reason *</Label>
                    <Textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={3}
                      placeholder="e.g., Diamond fraud / chargeback abuse / harassment"
                    />
                  </div>
                  <div>
                    <Label>Evidence (one per line)</Label>
                    <Textarea
                      value={evidence}
                      onChange={(e) => setEvidence(e.target.value)}
                      rows={3}
                      placeholder="Tx ID, screenshot URL, report ID, etc."
                    />
                  </div>
                </div>

                {sev !== "urgent" && (
                  <div className="flex items-center gap-3">
                    <Label className="text-sm whitespace-nowrap">{cfg.durationLabel}</Label>
                    <Input
                      type="number"
                      min={1}
                      className="w-32"
                      value={durationValue}
                      onChange={(e) => setDurationValue(e.target.value)}
                    />
                    <span className="text-xs text-muted-foreground">{cfg.durationUnit}</span>
                  </div>
                )}

                {sev === "urgent" && (
                  <div className="rounded-lg border border-rose-500/40 bg-rose-500/5 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-rose-400 font-semibold text-sm">
                      <Skull className="h-4 w-4" /> URGENT — Lifetime block enforced on:
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-2 text-rose-300/80">
                        <Smartphone className="h-3.5 w-3.5" /> Device ID
                      </div>
                      <div className="flex items-center gap-2 text-rose-300/80">
                        <Globe className="h-3.5 w-3.5" /> IP Address
                      </div>
                      <div className="flex items-center gap-2 text-rose-300/80">
                        <ScanFace className="h-3.5 w-3.5" /> Face Hash
                      </div>
                      <div className="flex items-center gap-2 text-rose-300/80">
                        <Ban className="h-3.5 w-3.5" /> User Account
                      </div>
                    </div>
                    <p className="text-[11px] text-rose-300/60 pt-1 border-t border-rose-500/20">
                      Factory reset will NOT bypass this block. The user will never be able to create another account from these credentials.
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleApplyBan}
                  disabled={submitting || !searchedUser || !reason.trim()}
                  className={cn("w-full bg-gradient-to-r text-white", cfg.color)}
                >
                  <SeverityIcon className="h-4 w-4 mr-2" />
                  {submitting ? "Applying…" : `Apply ${cfg.label} Ban`}
                </Button>
              </CardContent>
            </Card>

            {/* Active bans list */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5" />
                    {cfg.label} Bans ({bans.length})
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center text-muted-foreground py-8">Loading…</div>
                ) : bans.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">No {cfg.label.toLowerCase()} bans yet</div>
                ) : (
                  <div className="space-y-2">
                    {bans.map((b) => (
                      <button
                        key={b.id}
                        onClick={() => setSelectedBan(b)}
                        className="w-full text-left rounded-lg border border-border bg-card hover:bg-muted/40 p-3 transition flex items-center gap-3"
                      >
                        <SmartImage
                          src={b.avatar_url || "/placeholder.svg"}
                          className="h-10 w-10 rounded-full object-cover"
                          alt="" onError={(e) => { const t = e.currentTarget; if (t.src.indexOf('/placeholder.svg') === -1) t.src = '/placeholder.svg'; }} />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{b.display_name || b.user_id}</div>
                          <div className="text-xs text-muted-foreground truncate">{b.ban_reason}</div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-1 flex-wrap">
                            <Clock className="h-3 w-3" />
                            {format(new Date(b.ban_start), "PP p")}
                            {b.ban_end && ` → ${format(new Date(b.ban_end), "PP p")}`}
                            {b.device_banned && (
                              <Badge variant="outline" className="text-[9px] py-0 h-4">
                                <Smartphone className="h-2.5 w-2.5 mr-0.5" /> Device
                              </Badge>
                            )}
                            {b.ip_banned && (
                              <Badge variant="outline" className="text-[9px] py-0 h-4">
                                <Globe className="h-2.5 w-2.5 mr-0.5" /> IP
                              </Badge>
                            )}
                            {b.face_hash_banned && (
                              <Badge variant="outline" className="text-[9px] py-0 h-4">
                                <ScanFace className="h-2.5 w-2.5 mr-0.5" /> Face
                              </Badge>
                            )}
                          </div>
                        </div>
                        <Badge variant={b.is_active ? "destructive" : "secondary"}>
                          {b.is_active ? "Active" : "Lifted"}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      {/* Detail dialog */}
      <Dialog open={!!selectedBan} onOpenChange={(o) => !o && setSelectedBan(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Skull className="h-5 w-5 text-rose-500" /> Ban Details
            </DialogTitle>
            <DialogDescription>
              {selectedBan && (
                <Badge variant="outline" className={SEVERITY_CONFIG[selectedBan.severity]?.bg || ""}>
                  {SEVERITY_CONFIG[selectedBan.severity]?.label || selectedBan.severity}
                </Badge>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedBan && (
            <div className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">User:</span> {selectedBan.display_name} ({selectedBan.app_uid})</div>
              <div><span className="text-muted-foreground">Reason:</span> {selectedBan.ban_reason}</div>
              <div><span className="text-muted-foreground">Started:</span> {format(new Date(selectedBan.ban_start), "PPpp")}</div>
              <div><span className="text-muted-foreground">Ends:</span> {selectedBan.ban_end ? format(new Date(selectedBan.ban_end), "PPpp") : "Never (lifetime)"}</div>
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className={cn("rounded-lg border p-2 text-center", selectedBan.device_banned ? "border-rose-500/40 bg-rose-500/10" : "border-border bg-muted/30")}>
                  <Smartphone className={cn("h-4 w-4 mx-auto mb-1", selectedBan.device_banned ? "text-rose-400" : "text-muted-foreground")} />
                  <p className="text-[10px] font-semibold">Device</p>
                  <p className="text-[9px] text-muted-foreground">{selectedBan.device_banned ? "Blocked" : "—"}</p>
                </div>
                <div className={cn("rounded-lg border p-2 text-center", selectedBan.ip_banned ? "border-rose-500/40 bg-rose-500/10" : "border-border bg-muted/30")}>
                  <Globe className={cn("h-4 w-4 mx-auto mb-1", selectedBan.ip_banned ? "text-rose-400" : "text-muted-foreground")} />
                  <p className="text-[10px] font-semibold">IP</p>
                  <p className="text-[9px] text-muted-foreground">{selectedBan.ip_banned ? "Blocked" : "—"}</p>
                </div>
                <div className={cn("rounded-lg border p-2 text-center", selectedBan.face_hash_banned ? "border-rose-500/40 bg-rose-500/10" : "border-border bg-muted/30")}>
                  <ScanFace className={cn("h-4 w-4 mx-auto mb-1", selectedBan.face_hash_banned ? "text-rose-400" : "text-muted-foreground")} />
                  <p className="text-[10px] font-semibold">Face Hash</p>
                  <p className="text-[9px] text-muted-foreground">{selectedBan.face_hash_banned ? "Blocked" : "—"}</p>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedBan(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
