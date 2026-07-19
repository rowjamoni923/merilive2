import { useState, useEffect, useRef } from "react";
import {
  Crown, Star, Shield, Gem, CheckCircle2, Loader2,
  MessageCircle, Send, DollarSign, Banknote,
  ArrowRight, Copy, Upload, CreditCard, MapPin, Sparkles, AlertTriangle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import SwiftPayDepositModal from "@/components/recharge/SwiftPayDepositModal";
import { Skeleton } from "@/components/Skeleton";

/** Minimum USD required for crypto auto-payment + on-chain verification. */
export const CRYPTO_PAYMENT_MIN_USD = 100;


interface TraderLevel {
  level_number: number;
  level_name: string;
  upgrade_cost_usd: number;
  commission_rate: number;
  badge_color: string;
  description: string;
}

interface PaymentMethod {
  id: string;
  method_name: string;
  method_type: string;
  account_name: string;
  account_number: string;
  bank_name: string | null;
  instructions: string | null;
}

interface HelperApplicationFormProps {
  agencyId?: string;
  onSuccess?: () => void;
  onClose?: () => void;
}

const HelperApplicationForm = ({ agencyId, onSuccess, onClose }: HelperApplicationFormProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [levels, setLevels] = useState<TraderLevel[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const [contactWhatsapp, setContactWhatsapp] = useState("");
  const [contactTelegram, setContactTelegram] = useState("");
  const [reason, setReason] = useState("");
  const [payrollRequested, setPayrollRequested] = useState(false);
  
  // Per-level diamonds-per-USD rate (admin-configured in `helper_diamond_packages`).
  // Key = level_number (1..5). Level 6 (Country Super Admin) intentionally absent → no diamond credit.
  const [levelDiamondRates, setLevelDiamondRates] = useState<Record<number, number>>({});

  // Crypto payment modal
  const [swiftPayOpen, setSwiftPayOpen] = useState(false);
  const [paidConfirmed, setPaidConfirmed] = useState(false);

  // Level 5 ID Verification fields
  const [idCardFront, setIdCardFront] = useState<File | null>(null);
  const [idCardFrontPreview, setIdCardFrontPreview] = useState<string | null>(null);
  const [idCardBack, setIdCardBack] = useState<File | null>(null);
  const [idCardBackPreview, setIdCardBackPreview] = useState<string | null>(null);
  const [idCardName, setIdCardName] = useState("");
  const [idCardNumber, setIdCardNumber] = useState("");
  const [fullAddress, setFullAddress] = useState("");
  const [country, setCountry] = useState("");
  const idFrontRef = useRef<HTMLInputElement>(null);
  const idBackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadLevels();
    loadDiamondRate();
  }, []);

  const loadLevels = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('trader_level_tiers')
        .select('*')
        .eq('is_active', true)
        .order('level_number', { ascending: true });
      
      if (data) {
        setLevels(data);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadDiamondRate = async () => {
    // Per-level admin-configured diamond pricing.
    // helper_diamond_packages rows are ordered 1..5 by display_order; each row holds
    // (diamond_amount, price_usd) — e.g. L1: 80,000 diamonds @ $18 → 4,444/USD.
    const { data } = await supabase
      .from('helper_diamond_packages')
      .select('diamond_amount, price_usd, description, display_order')
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    if (!data?.length) return;
    const rates: Record<number, number> = {};
    data.forEach((p, idx) => {
      // Prefer "Level N" parsed from description; fall back to display_order / index.
      const m = (p.description || "").match(/level\s*(\d+)/i);
      const level = m ? Number(m[1]) : (p.display_order ?? idx + 1);
      const price = Math.max(Number(p.price_usd) || 0, 0.0001);
      const amt = Number(p.diamond_amount) || 0;
      if (level >= 1 && amt > 0) rates[level] = amt / price;
    });
    setLevelDiamondRates(rates);
  };

  const getLevelIcon = (level: number) => {
    const iconClass = "w-4 h-4 text-white";
    switch (level) {
      case 1: return <Star className={iconClass} />;
      case 2: return <Star className={iconClass} />;
      case 3: return <Crown className={iconClass} />;
      case 4: return <Shield className={iconClass} />;
      case 5: return <Gem className={iconClass} />;
      default: return <Star className={iconClass} />;
    }
  };

  const getMethodIcon = (type: string) => {
    const lower = type.toLowerCase();
    if (lower.includes('binance') || lower.includes('crypto')) return '🟡';
    if (lower.includes('epay') || lower.includes('ewallet')) return '💚';
    if (lower.includes('bank')) return '🏦';
    return '💳';
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied! ✅", description: `${label} copied` });
  };

  // (file-screenshot upload removed; payment goes through MeriCash auto crypto gateway)

  const handleIdCardSelect = (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "File too large", description: "Max 5MB", variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      if (side === 'front') {
        setIdCardFront(file);
        reader.onloadend = () => setIdCardFrontPreview(reader.result as string);
      } else {
        setIdCardBack(file);
        reader.onloadend = () => setIdCardBackPreview(reader.result as string);
      }
      reader.readAsDataURL(file);
    }
  };

  const selectedLevelData = levels.find(l => l.level_number === selectedLevel);
  const upgradeCost = Number(selectedLevelData?.upgrade_cost_usd || 0);
  const isPaidLevel = upgradeCost > 0;
  const isFreeLevel = !isPaidLevel;
  // Country Super Admin tier (level 6) — appointment, NOT a diamond purchase.
  // No diamonds are credited; flow goes through a separate contract / verification path.
  const isCountrySuperAdmin = selectedLevel >= 6;
  // Pkg66: Charge EXACTLY the admin-configured per-level upgrade_cost_usd.
  const effectiveCost = isPaidLevel ? upgradeCost : 0;
  // Per-level rate from helper_diamond_packages (admin panel). Falls back to 0 → form
  // will surface "rate not loaded" guard instead of silently using wrong number.
  const perUsdForLevel = levelDiamondRates[selectedLevel] ?? 0;
  const diamondsForUpgrade = isCountrySuperAdmin
    ? 0
    : Math.floor(effectiveCost * perUsdForLevel);

  // Pkg76: Admin-misconfiguration guard.
  // Any PAID tier (level_number > 1) loaded from `trader_level_tiers` with
  // upgrade_cost_usd null / 0 / negative is treated as MISCONFIGURED:
  //   - chip is visually muted + non-selectable
  //   - submit is blocked for that level (see validateForm)
  //   - top-of-form red alert lists the affected levels so an admin who
  //     opens the form immediately sees the warning and can fix it in
  //     /admin/pricing-hub → Helper tab.
  const misconfiguredLevels = levels.filter(
    (l) =>
      l.level_number > 1 &&
      (l.upgrade_cost_usd === null ||
        l.upgrade_cost_usd === undefined ||
        Number(l.upgrade_cost_usd) <= 0),
  );
  const isLevelMisconfigured = (l: TraderLevel) =>
    l.level_number > 1 &&
    (l.upgrade_cost_usd === null ||
      l.upgrade_cost_usd === undefined ||
      Number(l.upgrade_cost_usd) <= 0);
  const selectedLevelMisconfigured = !!selectedLevelData && isLevelMisconfigured(selectedLevelData);

  // One-time console warning so admins / devs notice in browser logs.
  const warnedRef = useRef<string>("");
  useEffect(() => {
    if (misconfiguredLevels.length === 0) return;
    const key = misconfiguredLevels.map((l) => l.level_number).join(",");
    if (warnedRef.current === key) return;
    warnedRef.current = key;
    console.warn(
      "[HelperApplicationForm] trader_level_tiers misconfigured — paid tiers with 0/unset upgrade_cost_usd:",
      misconfiguredLevels.map((l) => ({
        level: l.level_number,
        name: l.level_name,
        upgrade_cost_usd: l.upgrade_cost_usd,
      })),
    );
  }, [misconfiguredLevels]);


  /** Validate the form (everything except the actual payment). */
  const validateForm = (): string | null => {
    if (!contactWhatsapp && !contactTelegram) {
      return "Provide WhatsApp or Telegram so we can reach you";
    }
    if (selectedLevel === 5) {
      if (!idCardFront || !idCardBack) return "Upload both front and back of your ID card";
      if (!idCardName.trim()) return "Enter the name on your ID card";
      if (!idCardNumber.trim()) return "Enter your ID card number";
      if (!fullAddress.trim()) return "Enter your full address";
      if (!country.trim()) return "Enter your country";
    }
    // Pkg76: hard-block selection of any misconfigured tier.
    if (selectedLevelMisconfigured) {
      return `Level ${selectedLevel} upgrade cost is not configured by admin. Please choose another level or contact admin.`;
    }
    if (isPaidLevel && !isCountrySuperAdmin && perUsdForLevel <= 0) {
      return "Diamond rate for this level is not configured yet — try again in a moment or contact admin";
    }
    if (isPaidLevel && effectiveCost <= 0) {
      return `Level ${selectedLevel} upgrade cost is not configured by admin yet`;
    }
    // Crypto gateway minimum: on-chain auto-verification requires ≥ $100.
    // Admin can set lower tier prices, but crypto payment is blocked below
    // this floor — user must pick a tier ≥ $100 or contact support.
    if (isPaidLevel && effectiveCost < CRYPTO_PAYMENT_MIN_USD) {
      return `Minimum crypto payment is $${CRYPTO_PAYMENT_MIN_USD}. Selected level costs only $${effectiveCost} — please choose a higher tier.`;
    }
    return null;
  };

  /** Open the crypto payment modal after validating the form. */
  const handlePayWithCrypto = async () => {
    const err = validateForm();
    if (err) {
      toast({ title: "Required", description: err, variant: "destructive" });
      return;
    }
    // Block if an application already exists
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: "Not logged in", variant: "destructive" });
      return;
    }
    const { data: existingApp } = await supabase
      .from('helper_applications')
      .select('id, status')
      .eq('user_id', user.id)
      .maybeSingle();
    if (existingApp) {
      toast({ title: "Application Exists", description: `Status: ${existingApp.status}`, variant: "destructive" });
      return;
    }
    setPaidConfirmed(false);
    setSwiftPayOpen(true);
  };

  /** Called after the user actually submits — for free level OR after crypto payment succeeds. */
  const submitApplication = async (paymentTopupId?: string) => {
    if (!paidConfirmed && isPaidLevel && !paymentTopupId) {
      // safety net
      toast({ title: "Payment not confirmed yet", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      // Upload ID card images for Level 5
      let idCardFrontUrl: string | null = null;
      let idCardBackUrl: string | null = null;
      if (selectedLevel === 5) {
        if (idCardFront) {
          const frontName = `helper-id-cards/${user.id}/${Date.now()}-front-${idCardFront.name}`;
          const { error: frontErr } = await supabase.storage
            .from('payment-screenshots')
            .upload(frontName, idCardFront);
          if (frontErr) throw frontErr;
          // payment-screenshots is private — use a long-lived signed URL so admin can preview it.
          const { data: frontSigned } = await supabase.storage
            .from('payment-screenshots')
            .createSignedUrl(frontName, 60 * 60 * 24 * 365 * 10);
          idCardFrontUrl = frontSigned?.signedUrl ?? frontName;
        }
        if (idCardBack) {
          const backName = `helper-id-cards/${user.id}/${Date.now()}-back-${idCardBack.name}`;
          const { error: backErr } = await supabase.storage
            .from('payment-screenshots')
            .upload(backName, idCardBack);
          if (backErr) throw backErr;
          const { data: backSigned } = await supabase.storage
            .from('payment-screenshots')
            .createSignedUrl(backName, 60 * 60 * 24 * 365 * 10);
          idCardBackUrl = backSigned?.signedUrl ?? backName;
        }
      }

      // Pkg65: Auto-detect granted level from on-chain verified deposit amount.
      // Source of truth = swift_pay_topups.price_usd of the credited topup row.
      // granted_level = highest active tier where upgrade_cost_usd <= verified amount.
      let verifiedAmountUsd: number = effectiveCost;
      let detectedLevel: number = selectedLevel;
      let autoLevelAdjusted = false;
      if (isPaidLevel && paymentTopupId && paymentTopupId !== 'swift_pay_auto') {
        try {
          const { data: topupRow } = await supabase
            .from('swift_pay_topups')
            .select('price_usd')
            .eq('id', paymentTopupId)
            .maybeSingle();
          if (topupRow?.price_usd != null) verifiedAmountUsd = Number(topupRow.price_usd);
        } catch { /* fall back to effectiveCost */ }
      }
      if (isPaidLevel) {
        // Re-read tiers fresh so admin cost edits are honoured at credit time.
        const { data: freshTiers } = await supabase
          .from('trader_level_tiers')
          .select('level_number, upgrade_cost_usd')
          .eq('is_active', true)
          .order('level_number', { ascending: true });
        const tiersList = (freshTiers && freshTiers.length ? freshTiers : levels.map(l => ({
          level_number: l.level_number, upgrade_cost_usd: l.upgrade_cost_usd
        })));
        const qualifying = tiersList
          .filter(t =>
            Number(t.upgrade_cost_usd) > 0 &&
            Number(t.upgrade_cost_usd) <= verifiedAmountUsd + 0.001 &&
            t.level_number >= 1 && t.level_number <= 5,
          )
          .sort((a, b) => b.level_number - a.level_number);
        if (qualifying.length > 0) detectedLevel = qualifying[0].level_number;
        autoLevelAdjusted = detectedLevel !== selectedLevel;
      }

      const grantedLevel = isPaidLevel ? detectedLevel : selectedLevel;
      const paymentDetails = isPaidLevel ? {
        method: 'swift_pay_crypto',
        method_name: 'MeriCash Crypto Gateway',
        topup_id: paymentTopupId || null,
        amount_usd: verifiedAmountUsd,
        diamonds_credited: diamondsForUpgrade,
        auto_verified: true,
        selected_level: selectedLevel,
        detected_level: detectedLevel,
        auto_level_adjusted: autoLevelAdjusted,
      } : null;

      // Pkg432: Paid path with on-chain verified crypto deposit → auto-grant the trader
      // wallet immediately. No admin queue, no pending state. RPC re-verifies that the
      // topup belongs to caller and was paid, then upserts topup_helpers (is_verified=true)
      // and writes an `approved` helper_applications audit row in one atomic step.
      if (isPaidLevel && paymentTopupId && paymentTopupId !== 'swift_pay_auto') {
        const { data: grantData, error: grantError } = await supabase.rpc(
          'auto_grant_helper_from_crypto_payment' as any,
          {
            _topup_id: paymentTopupId,
            _selected_level: selectedLevel,
            _contact_whatsapp: contactWhatsapp || null,
            _contact_telegram: contactTelegram || null,
            _reason: reason || null,
            _payroll_requested: grantedLevel === 5 ? payrollRequested : false,
          }
        );
        if (grantError) throw grantError;
        const grantResult = grantData as { success: boolean; error?: string; trader_level?: number };
        if (!grantResult?.success) {
          throw new Error(grantResult?.error || 'Auto-grant failed — please contact support');
        }
        const finalLevel = Number(grantResult.trader_level ?? grantedLevel);
        toast({
          title: "Trader Wallet Activated! ✅",
          description: `Level ${finalLevel} unlocked. ${diamondsForUpgrade.toLocaleString()} 💎 credited.`,
        });
        onSuccess?.();
        return;
      }

      // Free-tier (or legacy fallback) path — admin review queue.
      const { error } = await supabase
        .from('helper_applications')
        .insert({
          user_id: user.id,
          agency_id: agencyId || null,
          requested_level: grantedLevel,
          payroll_requested: grantedLevel === 5 ? payrollRequested : false,
          contact_phone: null,
          contact_whatsapp: contactWhatsapp || null,
          contact_telegram: contactTelegram || null,
          reason: reason || null,
          payment_method: isPaidLevel ? 'MeriCash Crypto Gateway' : null,
          payment_details: paymentDetails,
          payment_screenshot_url: null,
          payment_transaction_id: paymentTopupId || null,
          id_card_front_url: idCardFrontUrl,
          id_card_back_url: idCardBackUrl,
          id_card_name: grantedLevel === 5 ? idCardName || null : null,
          id_card_number: grantedLevel === 5 ? idCardNumber || null : null,
          full_address: grantedLevel === 5 ? fullAddress || null : null,
          country: grantedLevel === 5 ? country || null : null,
          status: 'pending'
        });

      if (error) throw error;

      toast({
        title: "Application Submitted! 🎉",
        description: isPaidLevel
          ? (autoLevelAdjusted
              ? `Deposit $${verifiedAmountUsd} auto-detected → Level ${grantedLevel}. ${diamondsForUpgrade.toLocaleString()} diamonds credited.`
              : `${diamondsForUpgrade.toLocaleString()} diamonds credited to your balance.`)
          : undefined,
      });
      onSuccess?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    if (isFreeLevel) {
      const err = validateForm();
      if (err) {
        toast({ title: "Required", description: err, variant: "destructive" });
        return;
      }
      await submitApplication();
    } else {
      // Paid path goes through the crypto modal
      await handlePayWithCrypto();
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col max-h-[75vh] overflow-hidden p-4 space-y-4">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
        <div className="space-y-3 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ))}
        </div>
        <Skeleton className="h-11 w-full rounded-md mt-2" />
      </div>
    );
  }

  return (
    <div 
      className="flex flex-col max-h-[75vh] overflow-hidden"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {/* Fixed Header */}
      <div className="text-center pb-3 flex-shrink-0">
        <div className="w-12 h-12 mx-auto bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-2">
          <Crown className="w-6 h-6 text-white" />
        </div>
        <h2 className="text-lg font-bold">Become a Helper</h2>
        <p className="text-xs text-muted-foreground">Apply to become a diamond trader</p>
      </div>

      {/* Scrollable Content */}
      <div 
        className="flex-1 overflow-y-auto overscroll-contain space-y-4 px-1 pb-4"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {/* Pkg76: Admin misconfiguration banner — visible to anyone (incl. admin)
            opening the form whenever a paid tier has 0/unset upgrade_cost_usd. */}
        {misconfiguredLevels.length > 0 && (
          <div
            role="alert"
 className="flex gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-red-700 "
          >
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-[12px] leading-snug">
              <div className="font-semibold">Admin: upgrade cost not configured</div>
              <div>
                Level{misconfiguredLevels.length > 1 ? "s" : ""}{" "}
                <span className="font-bold">
                  {misconfiguredLevels.map((l) => l.level_number).join(", ")}
                </span>{" "}
                {misconfiguredLevels.length > 1 ? "have" : "has"} <code>upgrade_cost_usd</code> set
                to 0 or empty. Submit is blocked for {misconfiguredLevels.length > 1 ? "these levels" : "this level"}.
                Fix in <span className="font-semibold">/admin/pricing-hub → Helper tab</span>.
              </div>
            </div>
          </div>
        )}

        {/* Level Selection */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Your Level</Label>
          <div className="space-y-1.5">
            {levels.map((level) => {
              const misconfigured = isLevelMisconfigured(level);
              return (
              <div 
                key={level.level_number}
                onClick={() => {
                  if (misconfigured) {
                    toast({
                      title: "Level not configured",
                      description: `Admin has not set an upgrade cost for Level ${level.level_number} yet.`,
                      variant: "destructive",
                    });
                    return;
                  }
                  setSelectedLevel(level.level_number);
                  if (level.level_number !== 5) setPayrollRequested(false);
                  setPaidConfirmed(false);
                }}
                aria-disabled={misconfigured}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl transition-all",
                  misconfigured
                    ? "opacity-50 cursor-not-allowed bg-muted/30 border border-red-500/30"
                    : "cursor-pointer active:scale-[0.98] " + (selectedLevel === level.level_number 
                        ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-2 border-pink-500" 
                        : "bg-card/50 border border-border/50 hover:border-muted-foreground/30")
                )}
              >
                <div 
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: level.badge_color }}
                >
                  {getLevelIcon(level.level_number)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-sm">{level.level_name}</span>
                    {level.level_number === 5 && (
                      <Badge className="bg-purple-500 text-white text-[9px] px-1.5 py-0">
                        Payroll
                      </Badge>
                    )}
                    {misconfigured && (
                      <Badge variant="destructive" className="text-[9px] px-1.5 py-0">
                        Not configured
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{level.description}</p>
                </div>
                <div className="flex-shrink-0">
                  {misconfigured ? (
                    <span className="text-[10px] font-semibold text-red-500">—</span>
                  ) : level.upgrade_cost_usd > 0 ? (
                    <span className="font-bold text-sm text-green-500">${level.upgrade_cost_usd}</span>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] px-2">Free</Badge>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>


        {/* Commission Rate - Show when paid level selected */}
        {selectedLevelData && selectedLevelData.commission_rate > 0 && (
          <div className="flex items-center justify-between bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2">
            <span className="text-xs text-muted-foreground">Commission Rate</span>
            <span className="font-bold text-green-500">{selectedLevelData.commission_rate}%</span>
          </div>
        )}

        {/* Payroll Option for Level 5 */}
        {selectedLevel === 5 && (
          <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <Banknote className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-sm">Payroll System</h4>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Enable payroll to receive agency withdrawal requests
                </p>
                <label className="flex items-center gap-2 mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={payrollRequested}
                    onChange={(e) => setPayrollRequested(e.target.checked)}
                    className="w-4 h-4 rounded accent-purple-500"
                  />
                  <span className="text-xs font-medium">Request Payroll Access</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* LEVEL 5 - ID VERIFICATION SECTION */}
        {selectedLevel === 5 && (
          <div className="space-y-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <CreditCard className="w-3.5 h-3.5 text-amber-500" />
              ID Card Verification (Required)
            </Label>

            {/* ID Card Name */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Full Name (as on ID Card) *</Label>
              <Input
                placeholder="Enter name exactly as on your ID"
                value={idCardName}
                onChange={(e) => setIdCardName(e.target.value)}
                className="h-10 bg-background/50 border-amber-500/30 text-sm"
              />
            </div>

            {/* ID Card Number */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">ID Card / NID Number *</Label>
              <Input
                placeholder="Enter your ID card number"
                value={idCardNumber}
                onChange={(e) => setIdCardNumber(e.target.value)}
                className="h-10 bg-background/50 border-amber-500/30 text-sm"
              />
            </div>

            {/* Country */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">Country *</Label>
              <Input
                placeholder="e.g. Bangladesh, India, Pakistan"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="h-10 bg-background/50 border-amber-500/30 text-sm"
              />
            </div>

            {/* Full Address */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                Full Address (as on ID Card) *
              </Label>
              <Textarea
                placeholder="House/Flat, Street, Area, City, District, Postal Code"
                value={fullAddress}
                onChange={(e) => setFullAddress(e.target.value)}
                rows={2}
                className="text-sm resize-none bg-background/50 border-amber-500/30"
              />
            </div>

            {/* ID Card Front */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">ID Card — Front Side *</Label>
              <input
                type="file"
                ref={idFrontRef}
                accept="image/*"
                onChange={(e) => handleIdCardSelect(e, 'front')}
                className="hidden"
              />
              {idCardFrontPreview ? (
                <div className="relative">
                  <img loading="lazy" decoding="async" 
                    src={idCardFrontPreview} 
                    alt="ID Front" 
                    className="w-full h-28 object-cover rounded-lg border border-amber-500/30" />
                  <button
                    type="button"
                    onClick={() => { setIdCardFront(null); setIdCardFrontPreview(null); }}
                    className="absolute top-1.5 right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => idFrontRef.current?.click()}
                  className="w-full h-16 border border-dashed border-amber-500/40 rounded-lg flex flex-col items-center justify-center gap-1 bg-background/30 active:bg-muted"
                >
                  <Upload className="w-4 h-4 text-amber-500" />
                  <span className="text-[10px] text-muted-foreground">Upload ID Front</span>
                </button>
              )}
            </div>

            {/* ID Card Back */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground">ID Card — Back Side *</Label>
              <input
                type="file"
                ref={idBackRef}
                accept="image/*"
                onChange={(e) => handleIdCardSelect(e, 'back')}
                className="hidden"
              />
              {idCardBackPreview ? (
                <div className="relative">
                  <img loading="lazy" decoding="async" 
                    src={idCardBackPreview} 
                    alt="ID Back" 
                    className="w-full h-28 object-cover rounded-lg border border-amber-500/30" />
                  <button
                    type="button"
                    onClick={() => { setIdCardBack(null); setIdCardBackPreview(null); }}
                    className="absolute top-1.5 right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => idBackRef.current?.click()}
                  className="w-full h-16 border border-dashed border-amber-500/40 rounded-lg flex flex-col items-center justify-center gap-1 bg-background/30 active:bg-muted"
                >
                  <Upload className="w-4 h-4 text-amber-500" />
                  <span className="text-[10px] text-muted-foreground">Upload ID Back</span>
                </button>
              )}
            </div>

            <div className="text-[11px] text-amber-500 bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-500/20">
              ⚠️ Your ID card details will be verified before Payroll access is granted
            </div>
          </div>
        )}

        {selectedLevelData && selectedLevelData.upgrade_cost_usd > 0 && (
          <div className="flex items-center justify-between bg-card border rounded-xl px-3 py-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-500" />
              <span className="text-sm font-medium">Level Upgrade Cost</span>
            </div>
            <span className="text-lg font-bold text-green-500">
              ${selectedLevelData.upgrade_cost_usd}
            </span>
          </div>
        )}

        {/* PAYMENT SECTION — Crypto auto gateway */}
        {isPaidLevel && (
          <div className="space-y-3 bg-gradient-to-br from-amber-500/10 to-yellow-500/10 rounded-xl p-3 border border-amber-500/30">
            <Label className="text-xs font-semibold flex items-center gap-1.5 text-amber-700">
              <Sparkles className="w-3.5 h-3.5" />
              Payment — MeriCash Crypto (Auto)
            </Label>
            <div className="bg-white/70 rounded-lg p-3 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-slate-600">Level cost</span>
                <span className="font-bold text-emerald-600">${effectiveCost}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-slate-600">
                  {isCountrySuperAdmin ? "Tier" : "Diamonds you receive"}
                </span>
                <span className="font-bold text-amber-600">
                  {isCountrySuperAdmin
                    ? "Country Super Admin"
                    : diamondsForUpgrade > 0
                      ? diamondsForUpgrade.toLocaleString()
                      : "…"}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 pt-1">
                {isCountrySuperAdmin
                  ? "Country Super Admin is an appointment, not a diamond purchase. No diamonds are credited — your $10,000 contract deposit unlocks country-wide payroll authority after verification."
                  : "Pay in crypto (USDT/BTC/ETH/BNB). Diamonds credit to your balance automatically once the blockchain confirms — no admin wait."}
              </p>
            </div>
            {paidConfirmed && (
              <div className="flex items-center gap-2 text-[11px] text-emerald-600 bg-emerald-500/10 px-2.5 py-1.5 rounded-lg border border-emerald-500/30">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Payment received — diamonds credited. Submitting application…
              </div>
            )}
          </div>
        )}

        {/* CONTACT SECTION — All levels */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold">Contact Information</Label>

          <div className="space-y-2">
            <div className="relative">
              <MessageCircle className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />
              <Input
                placeholder="WhatsApp Number"
                value={contactWhatsapp}
                onChange={(e) => setContactWhatsapp(e.target.value)}
                className="pl-10 h-10"
              />
            </div>

            <div className="relative">
              <Send className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />
              <Input
                placeholder="Telegram Username"
                value={contactTelegram}
                onChange={(e) => setContactTelegram(e.target.value)}
                className="pl-10 h-10"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[10px] text-muted-foreground">Message (Optional)</Label>
            <Textarea
              placeholder="Tell us about yourself..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="text-sm resize-none"
            />
          </div>
        </div>
      </div>

      {/* Fixed Footer */}
      <div className="pt-3 flex-shrink-0 space-y-2 border-t">
        <Button
          onClick={handleSubmit}
          disabled={submitting || selectedLevelMisconfigured}
          className="w-full h-11 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : isPaidLevel ? (
            <Sparkles className="w-4 h-4 mr-2" />
          ) : (
            <ArrowRight className="w-4 h-4 mr-2" />
          )}
          {isPaidLevel ? `Pay $${effectiveCost} with Crypto` : "Submit Application"}
        </Button>

        {onClose && (
          <Button variant="ghost" onClick={onClose} className="w-full h-10 text-sm">
            Cancel
          </Button>
        )}
      </div>

      {/* MeriCash Crypto Payment Modal */}
      <SwiftPayDepositModal
        open={swiftPayOpen}
        onOpenChange={setSwiftPayOpen}
        packages={[]}
        mode="user"
        userCustomDiamonds={diamondsForUpgrade}
        userCustomPriceUsd={effectiveCost}
        userCustomLabel={`Helper Level ${selectedLevel} Upgrade`}
        helperApplicationIntent={isPaidLevel ? {
          selected_level: selectedLevel,
          contact_whatsapp: contactWhatsapp || null,
          contact_telegram: contactTelegram || null,
          reason: reason || null,
          payroll_requested: selectedLevel === 5 ? payrollRequested : false,
        } : null}
        onCredited={async (_diamonds, topupId) => {
          setPaidConfirmed(true);
          // Close payment modal and submit application automatically.
          // Pass the real swift_pay_topups.id so Pkg65 auto-level-detection
          // reads the on-chain verified deposit amount. If the user closes the
          // app before this fires, Pkg433 cron will auto-grant from the stored
          // helper_application_intent so the Trader Wallet still activates.
          setSwiftPayOpen(false);
          await submitApplication(topupId || "swift_pay_auto");
        }}
      />
    </div>
  );
};


export default HelperApplicationForm;
