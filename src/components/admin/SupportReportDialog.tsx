/**
 * SupportReportDialog
 *
 * Lets a support admin (sub-admin or owner working live support) forward a
 * problem to the owner. Captures:
 *  - the ticket
 *  - the most recent user message (snapshotted by the RPC)
 *  - the support admin's display name
 *  - a free-text reason
 *
 * Also lets the current admin set their own "support display name" — the
 * public name shown on reports + (optionally) on chat replies.
 */
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldAlert, IdCard } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticketId: string | null;
  lastUserMessageId?: string | null;
  ticketSubject?: string | null;
  userAppUid?: string | null;
  userDisplayName?: string | null;
}

export function SupportReportDialog({
  open, onOpenChange, ticketId, lastUserMessageId,
  ticketSubject, userAppUid, userDisplayName,
}: Props) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [myName, setMyName] = useState("");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason("");
    (async () => {
      const { data, error } = await adminSupabase.rpc("admin_get_my_admin_user" as any).maybeSingle();
      if (error) throw error;
      setMyName((data as any)?.support_display_name ?? "");
    })().catch((error) => {
      console.warn("Could not load support display name", error);
      setMyName("");
    });
  }, [open]);

  const saveName = async () => {
    setSavingName(true);
    try {
      const { error } = await adminSupabase.rpc("admin_update_my_support_display_name" as any, { _name: myName });
      if (error) throw error;
      toast({ title: "Saved", description: "Support display name updated." });
    } catch (e: any) {
      toast({ title: "Could not save", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSavingName(false);
    }
  };

  const submit = async () => {
    if (!ticketId || !reason.trim()) return;
    setSubmitting(true);
    try {
      const { error } = await adminSupabase.rpc("support_admin_file_report" as any, {
        _ticket_id: ticketId,
        _message_id: lastUserMessageId ?? null,
        _reason: reason.trim(),
      });
      if (error) throw error;
      toast({ title: "Reported to owner", description: "The owner has been notified." });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Could not report", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" /> Forward to Owner
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border/40 p-3 text-xs space-y-1 bg-muted/20">
            <div><span className="text-muted-foreground">User:</span> {userDisplayName ?? "—"}</div>
            <div><span className="text-muted-foreground">User ID:</span> <span className="font-mono">{userAppUid ?? ticketId?.slice(0,8) ?? "—"}</span></div>
            <div><span className="text-muted-foreground">Ticket:</span> {ticketSubject ?? "—"}</div>
            <div className="text-[10px] text-muted-foreground pt-1">
              The user's most recent message will be attached automatically.
            </div>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-1 text-xs"><IdCard className="w-3 h-3" /> Your support name (shown to owner)</Label>
            <div className="flex gap-2">
              <Input
                value={myName}
                onChange={(e) => setMyName(e.target.value)}
                placeholder="e.g. Agent Sara"
                maxLength={60}
              />
              <Button size="sm" variant="outline" onClick={saveName} disabled={savingName}>
                {savingName ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs">Reason / what owner needs to know</Label>
            <Textarea
              rows={4}
              placeholder="Describe the issue the user is reporting, why you can't resolve it, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !reason.trim()}>
            {submitting && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            Send to Owner
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SupportReportDialog;
