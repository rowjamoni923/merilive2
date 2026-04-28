import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Lock, ShieldCheck, KeyRound, AlertTriangle, CheckCircle2 } from "lucide-react";
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { getAdminSession } from "@/utils/adminSession";
import { toast } from "sonner";

interface PinStatus {
  pin_set: boolean;
  locked: boolean;
  locked_until: string | null;
}

export default function VaultPinManager() {
  const session = getAdminSession();
  const isOwner = session?.is_owner === true;

  const [status, setStatus] = useState<PinStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // Form state
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  // Reset flow
  const [showResetFlow, setShowResetFlow] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [resetNewPin, setResetNewPin] = useState("");

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const { data, error } = await adminSupabase.rpc("admin_pin_status");
      if (error) throw error;
      setStatus(data as unknown as PinStatus);
    } catch (e: any) {
      console.error("[VaultPin] status error", e);
      toast.error("Failed to load PIN status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  if (!isOwner) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Lock className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground">Vault PIN management is restricted to Owners only.</p>
        </CardContent>
      </Card>
    );
  }

  const handleSetPin = async () => {
    if (!/^[0-9]{6}$/.test(newPin)) {
      toast.error("PIN must be exactly 6 digits");
      return;
    }
    if (newPin !== confirmPin) {
      toast.error("PIN and confirmation do not match");
      return;
    }
    if (status?.pin_set && !/^[0-9]{6}$/.test(currentPin)) {
      toast.error("Current PIN required (6 digits)");
      return;
    }

    setBusy(true);
    try {
      const { data, error } = await adminSupabase.rpc("admin_pin_set", {
        _admin_id: session!.admin_id,
        _new_pin: newPin,
        _current_pin: status?.pin_set ? currentPin : null,
      });
      if (error) throw error;
      const result = data as any;
      if (!result?.success) {
        toast.error(result?.error || "Failed to set PIN");
        return;
      }
      toast.success(status?.pin_set ? "Vault PIN updated successfully" : "Vault PIN set successfully");
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      await fetchStatus();
    } catch (e: any) {
      toast.error(e?.message || "Failed to set PIN");
    } finally {
      setBusy(false);
    }
  };

  const handleRequestReset = async () => {
    setBusy(true);
    try {
      const { data, error } = await adminSupabase.functions.invoke("admin-pin-reset", {
        body: { admin_id: session!.admin_id, action: "request" },
      });
      if (error) throw error;
      if (!(data as any)?.success) {
        toast.error((data as any)?.error || "Failed to send OTP");
        return;
      }
      toast.success("Reset OTP sent to owner email");
      setOtpSent(true);
    } catch (e: any) {
      toast.error(e?.message || "Failed to send OTP");
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmReset = async () => {
    if (!/^[0-9]{6}$/.test(otpCode)) {
      toast.error("OTP must be 6 digits");
      return;
    }
    if (!/^[0-9]{6}$/.test(resetNewPin)) {
      toast.error("New PIN must be 6 digits");
      return;
    }
    setBusy(true);
    try {
      const { data, error } = await adminSupabase.functions.invoke("admin-pin-reset", {
        body: {
          admin_id: session!.admin_id,
          action: "confirm",
          otp: otpCode,
          new_pin: resetNewPin,
        },
      });
      if (error) throw error;
      if (!(data as any)?.success) {
        toast.error((data as any)?.error || "Failed to reset PIN");
        return;
      }
      toast.success("Vault PIN reset successfully");
      setShowResetFlow(false);
      setOtpSent(false);
      setOtpCode("");
      setResetNewPin("");
      await fetchStatus();
    } catch (e: any) {
      toast.error(e?.message || "Failed to reset PIN");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header / Status */}
      <Card className="bg-gradient-to-br from-violet-500/10 to-fuchsia-500/5 border-violet-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-violet-400" />
            Vault PIN Security
            {status?.pin_set ? (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                <CheckCircle2 className="w-3 h-3 mr-1" /> Active
              </Badge>
            ) : (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                <AlertTriangle className="w-3 h-3 mr-1" /> Not Set
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            6-digit PIN required on every <strong>new device</strong> before the admin login form is revealed.
            Trusted devices are remembered permanently.
          </p>
          <p>5 wrong attempts → 15-minute lockout. Forgot PIN? Reset via owner email OTP.</p>
          {status?.locked && (
            <Alert className="border-red-500/30 bg-red-500/10">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              <AlertDescription className="text-red-300">
                PIN entry is locked until {status.locked_until ? new Date(status.locked_until).toLocaleString() : "—"}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Set / Change PIN */}
      {!showResetFlow && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="w-4 h-4" />
              {status?.pin_set ? "Change Vault PIN" : "Set Vault PIN"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading...</p>
            ) : (
              <>
                {status?.pin_set && (
                  <div>
                    <Label>Current PIN</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
                      maxLength={6}
                      value={currentPin}
                      onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
                      placeholder="••••••"
                      className="font-mono tracking-[0.4em] text-center"
                    />
                  </div>
                )}
                <div>
                  <Label>{status?.pin_set ? "New PIN" : "PIN"} (6 digits)</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••••"
                    className="font-mono tracking-[0.4em] text-center"
                  />
                </div>
                <div>
                  <Label>Confirm PIN</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••••"
                    className="font-mono tracking-[0.4em] text-center"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <Button onClick={handleSetPin} disabled={busy} className="bg-violet-600 hover:bg-violet-700">
                    <Lock className="w-4 h-4 mr-2" />
                    {status?.pin_set ? "Update PIN" : "Set PIN"}
                  </Button>
                  {status?.pin_set && (
                    <Button variant="outline" onClick={() => setShowResetFlow(true)} disabled={busy}>
                      Forgot PIN? Reset via Email
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reset flow */}
      {showResetFlow && (
        <Card className="border-amber-500/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-400">
              <AlertTriangle className="w-4 h-4" />
              Reset PIN via Email OTP
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!otpSent ? (
              <>
                <p className="text-sm text-muted-foreground">
                  A 6-digit OTP will be sent to your registered owner email. Use it within 10 minutes.
                </p>
                <div className="flex gap-2">
                  <Button onClick={handleRequestReset} disabled={busy}>
                    Send OTP to Owner Email
                  </Button>
                  <Button variant="ghost" onClick={() => setShowResetFlow(false)} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div>
                  <Label>OTP from Email</Label>
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••••"
                    className="font-mono tracking-[0.4em] text-center"
                  />
                </div>
                <div>
                  <Label>New PIN (6 digits)</Label>
                  <Input
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    value={resetNewPin}
                    onChange={(e) => setResetNewPin(e.target.value.replace(/\D/g, ""))}
                    placeholder="••••••"
                    className="font-mono tracking-[0.4em] text-center"
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleConfirmReset} disabled={busy} className="bg-amber-600 hover:bg-amber-700">
                    Confirm Reset
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setShowResetFlow(false);
                      setOtpSent(false);
                      setOtpCode("");
                      setResetNewPin("");
                    }}
                    disabled={busy}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
