/**
 * Admin-only "Reset Face Verification" action.
 *
 * Use when a user reports they mistakenly completed face verification on the
 * wrong account and want to verify on another account instead. This wipes
 * every face verification submission for the user, clears the profile's face
 * fields, and removes the user's entries from the duplicate-detection index
 * (so the same face can now be indexed under a different account).
 *
 * Drop into any admin surface (AdminFaceVerification detail modal, support
 * ticket detail, UserSupportTool, etc.).
 */
import { useState } from "react";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";

type Props = {
  userId: string;
  userLabel?: string | null;
  onDone?: () => void;
  variant?: "outline" | "destructive" | "ghost";
  size?: "sm" | "default";
  className?: string;
  buttonLabel?: string;
};

export default function ResetFaceVerificationButton({
  userId,
  userLabel,
  onDone,
  variant = "outline",
  size = "sm",
  className,
  buttonLabel = "Reset Face Verification",
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [processing, setProcessing] = useState(false);

  const handleReset = async () => {
    if (processing) return;
    setProcessing(true);
    try {
      const { data, error } = await supabase.rpc("admin_reset_user_face_verification", {
        _user_id: userId,
        _reason: reason.trim() || null,
      });
      if (error) throw error;
      const stats = (data || {}) as Record<string, unknown>;
      toast({
        title: "✅ Face Verification Reset",
        description: `Removed ${Number(stats.deleted_submissions ?? 0)} submissions and ${Number(stats.deleted_face_records ?? 0) + Number(stats.deleted_shards ?? 0)} face-index entries. User can now verify on another account.`,
      });
      setOpen(false);
      setReason("");
      onDone?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unknown error";
      toast({ title: "Reset failed", description: message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className ?? "border-red-500/50 text-red-600 hover:bg-red-50"}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="w-4 h-4 mr-2" />
        {buttonLabel}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Reset Face Verification
            </DialogTitle>
            <DialogDescription className="space-y-2 pt-2">
              <span className="block">
                {userLabel ? (
                  <>
                    This will completely wipe face verification for{" "}
                    <strong>{userLabel}</strong>.
                  </>
                ) : (
                  <>This will completely wipe face verification for this user.</>
                )}
              </span>
              <span className="block text-xs text-slate-500">User ID: {userId}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
              <p className="font-semibold">This action will:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Delete every face verification submission for this user</li>
                <li>Clear the profile's face-verified flag, image, and hash</li>
                <li>Remove the face from the duplicate-detection index</li>
                <li>Allow the SAME face to be re-verified on another account</li>
              </ul>
              <p className="pt-1 font-medium">
                Host status is NOT changed automatically. Adjust separately if needed.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="reset-reason" className="text-xs">
                Reason (optional, saved to admin log)
              </Label>
              <Textarea
                id="reset-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. User verified on wrong account by mistake — support ticket #123"
                className="min-h-[70px] text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={processing}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReset}
              disabled={processing}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Resetting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" /> Confirm Reset
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
