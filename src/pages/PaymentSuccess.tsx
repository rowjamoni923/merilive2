import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, XCircle, Loader2, Diamond, ArrowLeft, Home, Upload, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { updateCachedBalance } from "@/hooks/useUserBalance";
import { recordClientError } from "@/utils/clientErrorLog";
import { toast } from "@/hooks/use-toast";

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const orderId = searchParams.get("order_id");
  const gateway = searchParams.get("gateway");
  const [verifying, setVerifying] = useState(true);
  const [result, setResult] = useState<{
    success: boolean;
    total_diamonds?: number;
    base_diamonds?: number;
    bonus_diamonds?: number;
    already_processed?: boolean;
    error?: string;
    needsManualProof?: boolean;
  } | null>(null);

  // Manual proof form state
  const [trxId, setTrxId] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [submittingProof, setSubmittingProof] = useState(false);
  const [proofSubmitted, setProofSubmitted] = useState(false);

  useEffect(() => {
    const verifyPayment = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");

        // Local gateway redirect (SSLCommerz / AamarPay) — credit already
        // applied server-side by local-payment-ipn. We just confirm the order.
        if (orderId) {
          const { data: order } = await supabase
            .from('helper_orders')
            .select('status, diamond_amount')
            .eq('id', orderId)
            .maybeSingle();

          if (order?.status === 'completed') {
            setResult({
            });
          } else if (order?.status === 'failed') {
            setResult({ success: false, error: 'Payment failed' });
          } else {
            // Still pending — let helper review manually
            setResult({
            });
          }

          const { data: profile } = await supabase
            .from("profiles").select("diamonds").eq("id", session.user.id).single();
          if (profile) updateCachedBalance(profile.diamonds || 0);
          window.dispatchEvent(new CustomEvent('balance-refresh'));
          return;
        }

        setResult({ success: false, error: "No payment session found" });
      } catch (err: any) {
        recordClientError({ label: "PaymentSuccess.verifyPayment", message: err instanceof Error ? err.message : String(err) });
        setResult({ success: false, error: err.message || "Verification failed" });
      } finally {
        setVerifying(false);
      }
    };
    verifyPayment();
  }, [sessionId, orderId, gateway, searchParams]);

  const handleFile = (f: File | null) => {
    setProofFile(f);
    if (f) {
      const r = new FileReader();
      r.onload = () => setProofPreview(r.result as string);
      r.readAsDataURL(f);
    } else {
      setProofPreview(null);
    }
  };

  const submitManualProof = async () => {
    if (!orderId) return;
    if (trxId.trim().length < 4) {
      toast({ title: "Transaction ID too short", description: "Enter at least 4 characters.", variant: "destructive" });
      return;
    }
    if (!proofFile) {
      toast({ title: "Screenshot required", description: "Please upload your payment screenshot.", variant: "destructive" });
      return;
    }
    setSubmittingProof(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      // Upload screenshot to private payment-proofs bucket
      const ext = proofFile.name.split('.').pop() || 'jpg';
      const path = `${session.user.id}/${orderId}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('payment-proofs')
        .upload(path, proofFile, { upsert: false });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage
        .from('payment-proofs').createSignedUrl(path, 60 * 60 * 24 * 30);
      const proofUrl = signed?.signedUrl || path;

      const { data, error } = await supabase.rpc('submit_manual_recharge_proof', {
        p_order_id: orderId,
        p_transaction_id: trxId.trim(),
        p_proof_url: proofUrl,
      });
      if (error) throw error;
      const r = data as any;
      if (r?.success === false) throw new Error(r?.error || 'Submission failed');

      setProofSubmitted(true);
      toast({ title: "✅ Submitted for review", description: "Helper will verify and credit your diamonds shortly." });
    } catch (err: any) {
      recordClientError({ label: "PaymentSuccess.submitManualProof", message: err instanceof Error ? err.message : String(err) });
      toast({ title: "Failed to submit", description: err.message || "Try again", variant: "destructive" });
    } finally {
      setSubmittingProof(false);
    }
  };

  const formatNumber = (n: number) => n.toLocaleString();

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center overflow-y-auto py-8"
      style={{ background: 'linear-gradient(180deg, #2d1045 0%, #1a0a2e 30%, #0d0618 100%)' }}>
      <div className="w-full max-w-sm mx-auto px-6">
        {verifying ? (
          <div className="text-center space-y-4">
            <div className="w-20 h-20 mx-auto rounded-full bg-white/10 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
            </div>
 <h2 className="text-xl font-bold text-slate-900">Verifying Payment...</h2>
            <p className="text-slate-500 text-sm">Please wait while we confirm your payment</p>
          </div>
        ) : result?.needsManualProof && !proofSubmitted ? (
          <div className="text-center space-y-5">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-amber-400 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-500/30">
 <Upload className="w-10 h-10 text-slate-900" />
            </div>
 <h2 className="text-2xl font-bold text-slate-900">Auto-verification Missed</h2>
            <p className="text-slate-600 text-sm">
              No worries — submit your Transaction ID and payment screenshot. Our helper will review and credit your diamonds within minutes.
            </p>

            <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-5 border border-amber-200/60 space-y-4 text-left">
              <div className="space-y-2">
 <Label className="text-slate-900 text-sm">Transaction ID *</Label>
                <Input
                  value={trxId}
                  onChange={(e) => setTrxId(e.target.value)}
                  placeholder="e.g. 8KX9A2B7"
 className="bg-white/10 border-amber-200/60 text-slate-900 placeholder:text-slate-400"
                />
              </div>
              <div className="space-y-2">
 <Label className="text-slate-900 text-sm">Payment Screenshot *</Label>
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                  <div className="cursor-pointer rounded-xl border-2 border-dashed border-amber-200/60 p-4 text-center hover:bg-white/5 transition">
                    {proofPreview ? (
                      <img loading="lazy" decoding="async" src={proofPreview} alt="proof" className="max-h-40 mx-auto rounded-lg" />
                    ) : (
                      <div className="flex flex-col items-center gap-2 text-slate-500">
                        <ImageIcon className="w-8 h-8" />
                        <span className="text-xs">Tap to upload screenshot</span>
                      </div>
                    )}
                  </div>
                </label>
              </div>
              <Button
                onClick={submitManualProof}
                disabled={submittingProof}
 className="w-full bg-gradient-to-r from-amber-500 to-orange-500 text-slate-900"
              >
                {submittingProof ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                Submit for Review
              </Button>
            </div>

            <Button
              onClick={() => navigate("/")}
              variant="outline"
 className="w-full bg-white/10 border-amber-200/60 text-slate-900"
            >
              <Home className="w-4 h-4 mr-1" /> I'll do this later
            </Button>
          </div>
        ) : result?.needsManualProof && proofSubmitted ? (
          <div className="text-center space-y-5">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center">
 <CheckCircle className="w-10 h-10 text-slate-900" />
            </div>
 <h2 className="text-2xl font-bold text-slate-900">Submitted for Review!</h2>
            <p className="text-slate-600 text-sm">
              Your Transaction ID and screenshot have been sent to the helper. You'll receive a notification when diamonds are credited.
            </p>
 <Button onClick={() => navigate("/")} className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white">
              <Home className="w-4 h-4 mr-1" /> Home
            </Button>
          </div>
        ) : result?.success ? (
          <div className="text-center space-y-5">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30">
 <CheckCircle className="w-10 h-10 text-slate-900" />
            </div>
 <h2 className="text-2xl font-bold text-slate-900">
              {result.already_processed ? "Already Credited!" : "Payment Successful! 🎉"}
            </h2>
            {result.total_diamonds ? (
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-5 border border-amber-200/60 space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <Diamond className="w-6 h-6 text-cyan-400" />
 <span className="text-3xl font-bold text-slate-900">{formatNumber(result.total_diamonds)}</span>
                </div>
                <p className="text-slate-500 text-sm">Diamonds credited to your account</p>
                {result.bonus_diamonds && result.bonus_diamonds > 0 && (
                  <div className="bg-amber-500/20 rounded-xl px-3 py-2 border border-amber-500/30">
                    <p className="text-amber-300 text-xs font-semibold">
                      🎁 Includes +{formatNumber(result.bonus_diamonds)} First Recharge Bonus!
                    </p>
                  </div>
                )}
              </div>
            ) : null}
            <div className="flex gap-3 pt-2">
              <Button onClick={() => navigate("/recharge")} variant="outline"
 className="flex-1 bg-white/10 border-amber-200/60 text-white hover:bg-white/20">
                <ArrowLeft className="w-4 h-4 mr-1" /> Recharge
              </Button>
              <Button onClick={() => navigate("/")}
 className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white">
                <Home className="w-4 h-4 mr-1" /> Home
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-5">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center">
 <XCircle className="w-10 h-10 text-slate-900" />
            </div>
 <h2 className="text-xl font-bold text-slate-900">Payment Failed</h2>
            <p className="text-slate-500 text-sm">{result?.error || "Something went wrong"}</p>
            <Button onClick={() => navigate("/recharge")}
 className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white">
              <ArrowLeft className="w-4 h-4 mr-1" /> Try Again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentSuccess;
