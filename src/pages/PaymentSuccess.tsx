import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle, XCircle, Loader2, Diamond, ArrowLeft, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { updateCachedBalance } from "@/hooks/useUserBalance";

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const orderId = searchParams.get("order_id");
  const gateway = searchParams.get("gateway");
  const [verifying, setVerifying] = useState(true);
  const [result, setResult] = useState<{
    success: boolean;
    total_coins?: number;
    base_coins?: number;
    bonus_coins?: number;
    already_processed?: boolean;
    error?: string;
  } | null>(null);

  useEffect(() => {
    const verifyPayment = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error("Not authenticated");

        // ═══ ZiniPay Gateway ═══
        if (gateway === "zinipay" && orderId) {
          console.log("[PaymentSuccess] ZiniPay order verification:", orderId);

          // Poll verify-zinipay-payment up to 5 times with delay
          // (ZiniPay IPN may arrive slightly after redirect)
          let verified = false;
          let lastData: any = null;

          for (let attempt = 1; attempt <= 5; attempt++) {
            console.log(`[PaymentSuccess] ZiniPay verify attempt ${attempt}/5`);

            const { data, error } = await supabase.functions.invoke("verify-zinipay-payment", {
              body: { order_id: orderId },
            });

            if (error) {
              console.error("[PaymentSuccess] ZiniPay verify error:", error);
              lastData = { success: false, error: error.message };
              break;
            }

            lastData = data;

            if (data?.status === "completed" || data?.status === "already_completed") {
              verified = true;
              setResult({
                success: true,
                total_coins: data.coins_credited,
                already_processed: data.status === "already_completed",
              });
              break;
            }

            // Wait 3 seconds before next attempt (IPN may be in transit)
            if (attempt < 5) {
              await new Promise(r => setTimeout(r, 3000));
            }
          }

          if (!verified) {
            // IPN hasn't arrived yet — show success with "processing" message
            setResult({
              success: true,
              total_coins: 0,
              error: undefined,
            });
          }

          // Refresh balance
          const { data: profile } = await supabase
            .from("profiles")
            .select("coins")
            .eq("id", session.user.id)
            .single();
          if (profile) {
            updateCachedBalance(profile.coins || 0);
          }
          window.dispatchEvent(new CustomEvent('balance-refresh'));
          return;
        }

        // ═══ Stripe Gateway (existing flow) ═══
        if (!sessionId) {
          setResult({ success: false, error: "No payment session found" });
          return;
        }

        const { data, error } = await supabase.functions.invoke("verify-stripe-payment", {
          body: { session_id: sessionId },
        });

        if (error) throw error;
        setResult(data);

        if (data?.success && data?.total_coins) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("coins")
            .eq("id", session.user.id)
            .single();
          if (profile) {
            updateCachedBalance(profile.coins || 0);
          }
        }
      } catch (err: any) {
        console.error("[PaymentSuccess] Verification error:", err);
        setResult({ success: false, error: err.message || "Verification failed" });
      } finally {
        setVerifying(false);
      }
    };

    verifyPayment();
  }, [sessionId, orderId, gateway]);

  const formatNumber = (n: number) => n.toLocaleString();

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center" 
      style={{ background: 'linear-gradient(180deg, #2d1045 0%, #1a0a2e 30%, #0d0618 100%)' }}>
      
      <div className="w-full max-w-sm mx-auto px-6">
        {verifying ? (
          <div className="text-center space-y-4">
            <div className="w-20 h-20 mx-auto rounded-full bg-white/10 flex items-center justify-center">
              <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
            </div>
            <h2 className="text-xl font-bold text-white">Verifying Payment...</h2>
            <p className="text-white/60 text-sm">Please wait while we confirm your payment</p>
          </div>
        ) : result?.success ? (
          <div className="text-center space-y-5">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center shadow-lg shadow-green-500/30">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white">
              {result.already_processed ? "Already Credited!" : 
               result.total_coins ? "Payment Successful! 🎉" : "Payment Processing..."}
            </h2>
            
            {result.total_coins ? (
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-5 border border-white/20 space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <Diamond className="w-6 h-6 text-cyan-400" />
                  <span className="text-3xl font-bold text-white">
                    {formatNumber(result.total_coins)}
                  </span>
                </div>
                <p className="text-white/60 text-sm">Diamonds credited to your account</p>
                
                {result.bonus_coins && result.bonus_coins > 0 && (
                  <div className="bg-amber-500/20 rounded-xl px-3 py-2 border border-amber-500/30">
                    <p className="text-amber-300 text-xs font-semibold">
                      🎁 Includes +{formatNumber(result.bonus_coins)} First Recharge Bonus!
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white/10 backdrop-blur-xl rounded-2xl p-5 border border-white/20 space-y-3">
                <p className="text-white/80 text-sm">
                  Your payment is being processed. Diamonds will be added to your account within a few moments.
                </p>
                <p className="text-white/50 text-xs">
                  You can check your balance on the home page.
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => navigate("/recharge")}
                variant="outline"
                className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Recharge
              </Button>
              <Button
                onClick={() => navigate("/")}
                className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white"
              >
                <Home className="w-4 h-4 mr-1" />
                Home
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center space-y-5">
            <div className="w-20 h-20 mx-auto rounded-full bg-gradient-to-br from-red-400 to-red-600 flex items-center justify-center shadow-lg shadow-red-500/30">
              <XCircle className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white">Payment Failed</h2>
            <p className="text-white/60 text-sm">{result?.error || "Something went wrong"}</p>
            
            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => navigate("/recharge")}
                className="flex-1 bg-gradient-to-r from-purple-500 to-pink-500 text-white"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Try Again
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentSuccess;
