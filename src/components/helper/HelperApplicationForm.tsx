import { useState, useEffect, useRef } from "react";
import { 
  Crown, Star, Shield, Gem, CheckCircle2, Loader2,
  MessageCircle, Send, DollarSign, Banknote,
  ArrowRight, Copy, Upload, CreditCard, MapPin, Sparkles
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
  
  // Payment fields for Level 2-5
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [transactionId, setTransactionId] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null);
  const [uploadingScreenshot, setUploadingScreenshot] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    loadPaymentMethods();
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

  const loadPaymentMethods = async () => {
    try {
      const { data } = await supabase
        .from('topup_payment_methods')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });
      
      if (data) {
        setPaymentMethods(data);
      }
    } catch (error) {
      console.error(error);
    }
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "File too large", description: "Max 5MB", variant: "destructive" });
        return;
      }
      setScreenshot(file);
      const reader = new FileReader();
      reader.onloadend = () => setScreenshotPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

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

  const isFreeLevel = selectedLevel === 1;
  const isPaidLevel = selectedLevel >= 2 && selectedLevel <= 5;
  const selectedLevelData = levels.find(l => l.level_number === selectedLevel);

  const handleSubmit = async () => {
    if (isFreeLevel && !contactWhatsapp && !contactTelegram) {
      toast({ title: "Contact Required", description: "Provide WhatsApp or Telegram", variant: "destructive" });
      return;
    }
    
    if (isPaidLevel) {
      if (!selectedPaymentMethod) {
        toast({ title: "Payment Method Required", variant: "destructive" });
        return;
      }
      if (!transactionId.trim()) {
        toast({ title: "Transaction ID Required", variant: "destructive" });
        return;
      }
      if (!screenshot) {
        toast({ title: "Screenshot Required", variant: "destructive" });
        return;
      }
    }

    // Level 5 specific validations
    if (selectedLevel === 5) {
      if (!idCardFront || !idCardBack) {
        toast({ title: "ID Card Required", description: "Upload both front and back of your ID card", variant: "destructive" });
        return;
      }
      if (!idCardName.trim()) {
        toast({ title: "Name Required", description: "Enter the name on your ID card", variant: "destructive" });
        return;
      }
      if (!idCardNumber.trim()) {
        toast({ title: "ID Number Required", description: "Enter your ID card number", variant: "destructive" });
        return;
      }
      if (!fullAddress.trim()) {
        toast({ title: "Address Required", description: "Enter your full address", variant: "destructive" });
        return;
      }
      if (!country.trim()) {
        toast({ title: "Country Required", variant: "destructive" });
        return;
      }
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const { data: existingApp } = await supabase
        .from('helper_applications')
        .select('id, status')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingApp) {
        toast({ title: "Application Exists", description: `Status: ${existingApp.status}`, variant: "destructive" });
        return;
      }

      let screenshotUrl = null;
      
      if (isPaidLevel && screenshot) {
        setUploadingScreenshot(true);
        const fileName = `helper-applications/${user.id}/${Date.now()}-${screenshot.name}`;
        const { error: uploadError } = await supabase.storage
          .from('payment-screenshots')
          .upload(fileName, screenshot);
        
        if (uploadError) throw uploadError;
        
        const { data: urlData } = supabase.storage
          .from('payment-screenshots')
          .getPublicUrl(fileName);
        
        screenshotUrl = urlData.publicUrl;
        setUploadingScreenshot(false);
      }

      // Upload ID card images for Level 5
      let idCardFrontUrl = null;
      let idCardBackUrl = null;
      
      if (selectedLevel === 5) {
        if (idCardFront) {
          const frontName = `helper-id-cards/${user.id}/${Date.now()}-front-${idCardFront.name}`;
          const { error: frontErr } = await supabase.storage
            .from('payment-screenshots')
            .upload(frontName, idCardFront);
          if (frontErr) throw frontErr;
          const { data: frontUrl } = supabase.storage.from('payment-screenshots').getPublicUrl(frontName);
          idCardFrontUrl = frontUrl.publicUrl;
        }
        if (idCardBack) {
          const backName = `helper-id-cards/${user.id}/${Date.now()}-back-${idCardBack.name}`;
          const { error: backErr } = await supabase.storage
            .from('payment-screenshots')
            .upload(backName, idCardBack);
          if (backErr) throw backErr;
          const { data: backUrl } = supabase.storage.from('payment-screenshots').getPublicUrl(backName);
          idCardBackUrl = backUrl.publicUrl;
        }
      }

      const paymentDetails = isPaidLevel ? {
        method_id: selectedPaymentMethod?.id,
        method_name: selectedPaymentMethod?.method_name,
        transaction_id: transactionId,
        screenshot_url: screenshotUrl,
        amount_usd: selectedLevelData?.upgrade_cost_usd || 0
      } : null;

      const { error } = await supabase
        .from('helper_applications')
        .insert({
          user_id: user.id,
          agency_id: agencyId || null,
          requested_level: selectedLevel,
          payroll_requested: selectedLevel === 5 ? payrollRequested : false,
          contact_phone: null,
          contact_whatsapp: isFreeLevel ? contactWhatsapp || null : null,
          contact_telegram: isFreeLevel ? contactTelegram || null : null,
          reason: isFreeLevel ? reason || null : null,
          payment_method: isPaidLevel ? selectedPaymentMethod?.method_name : null,
          payment_details: paymentDetails,
          payment_screenshot_url: screenshotUrl,
          payment_transaction_id: isPaidLevel ? transactionId : null,
          // Level 5 ID verification fields
          id_card_front_url: idCardFrontUrl,
          id_card_back_url: idCardBackUrl,
          id_card_name: selectedLevel === 5 ? idCardName || null : null,
          id_card_number: selectedLevel === 5 ? idCardNumber || null : null,
          full_address: selectedLevel === 5 ? fullAddress || null : null,
          country: selectedLevel === 5 ? country || null : null,
          status: 'pending'
        });

      if (error) throw error;

      toast({ title: "Application Submitted! 🎉" });
      onSuccess?.();
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
      setUploadingScreenshot(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
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
        {/* Level Selection */}
        <div className="space-y-2">
          <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Your Level</Label>
          <div className="space-y-1.5">
            {levels.map((level) => (
              <div 
                key={level.level_number}
                onClick={() => {
                  setSelectedLevel(level.level_number);
                  if (level.level_number !== 5) setPayrollRequested(false);
                  setSelectedPaymentMethod(null);
                  setTransactionId("");
                  setScreenshot(null);
                  setScreenshotPreview(null);
                }}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all active:scale-[0.98]",
                  selectedLevel === level.level_number 
                    ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-2 border-pink-500" 
                    : "bg-card/50 border border-border/50 hover:border-muted-foreground/30"
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
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{level.description}</p>
                </div>
                <div className="flex-shrink-0">
                  {level.upgrade_cost_usd > 0 ? (
                    <span className="font-bold text-sm text-green-500">${level.upgrade_cost_usd}</span>
                  ) : (
                    <Badge variant="secondary" className="text-[10px] px-2">Free</Badge>
                  )}
                </div>
              </div>
            ))}
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
                  <img 
                    src={idCardFrontPreview} 
                    alt="ID Front" 
                    className="w-full h-28 object-cover rounded-lg border border-amber-500/30"
                  />
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
                  <img 
                    src={idCardBackPreview} 
                    alt="ID Back" 
                    className="w-full h-28 object-cover rounded-lg border border-amber-500/30"
                  />
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

        {/* PAYMENT SECTION - Level 2-5 */}
        {isPaidLevel && (
          <div className="space-y-3 bg-white rounded-xl p-3 border border-amber-200/60">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              💳 Payment Information
            </Label>
            
            {/* Payment Methods */}
            <div className="grid grid-cols-2 gap-2">
              {paymentMethods.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setSelectedPaymentMethod(method)}
                  className={cn(
                    "p-2.5 rounded-lg border text-xs transition-all flex items-center gap-2 active:scale-95",
                    selectedPaymentMethod?.id === method.id
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : "bg-white border-amber-200/60 hover:border-emerald-500"
                  )}
                >
                  <span className="text-base">{getMethodIcon(method.method_type)}</span>
                  <span className="font-medium truncate">{method.method_name}</span>
                </button>
              ))}
            </div>

            {/* Payment Details */}
            {selectedPaymentMethod && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3 space-y-2">
                <p className="font-semibold text-emerald-600 text-sm">
                  {selectedPaymentMethod.method_name}
                </p>
                
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center bg-white rounded-lg px-2.5 py-2">
                    <span className="text-[10px] text-slate-500">Account:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-white">{selectedPaymentMethod.account_name}</span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedPaymentMethod.account_name, "Account")}
                        className="p-1 rounded bg-emerald-500/20 active:bg-emerald-500/40"
                      >
                        <Copy className="w-3 h-3 text-emerald-600" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="flex justify-between items-center bg-white rounded-lg px-2.5 py-2">
                    <span className="text-[10px] text-slate-500">ID/Number:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono text-emerald-600 max-w-[140px] truncate">
                        {selectedPaymentMethod.account_number}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(selectedPaymentMethod.account_number, "Number")}
                        className="p-1 rounded bg-emerald-500/20 active:bg-emerald-500/40"
                      >
                        <Copy className="w-3 h-3 text-emerald-600" />
                      </button>
                    </div>
                  </div>

                  {selectedPaymentMethod.instructions && (
                    <p className="text-[10px] text-slate-500 pt-1">
                      {selectedPaymentMethod.instructions}
                    </p>
                  )}
                </div>

                <div className="text-[11px] text-orange-600 bg-orange-500/10 px-2.5 py-1.5 rounded-lg border border-orange-500/20">
                  ⚠️ Pay exactly <span className="font-bold">${selectedLevelData?.upgrade_cost_usd}</span> to this account
                </div>
              </div>
            )}

            {/* Transaction ID */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-slate-500">Transaction ID *</Label>
              <Input
                placeholder="Enter transaction ID"
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
                className="h-10 bg-white border-amber-200/60 text-sm"
              />
            </div>

            {/* Screenshot */}
            <div className="space-y-1.5">
              <Label className="text-[10px] text-slate-500">Payment Screenshot *</Label>
              <input
                type="file"
                ref={fileInputRef}
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {screenshotPreview ? (
                <div className="relative">
                  <img 
                    src={screenshotPreview} 
                    alt="Screenshot" 
                    className="w-full h-24 object-cover rounded-lg border border-amber-200/60"
                  />
                  <button
                    type="button"
                    onClick={() => { setScreenshot(null); setScreenshotPreview(null); }}
                    className="absolute top-1.5 right-1.5 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-16 border border-dashed border-slate-600 rounded-lg flex flex-col items-center justify-center gap-1 bg-white active:bg-slate-100"
                >
                  <Upload className="w-4 h-4 text-slate-500" />
                  <span className="text-[10px] text-slate-500">Upload screenshot</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* CONTACT SECTION - Level 1 Only */}
        {isFreeLevel && (
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
        )}
      </div>

      {/* Fixed Footer */}
      <div className="pt-3 flex-shrink-0 space-y-2 border-t">
        <Button
          onClick={handleSubmit}
          disabled={submitting || uploadingScreenshot}
          className="w-full h-11 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold"
        >
          {submitting || uploadingScreenshot ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <ArrowRight className="w-4 h-4 mr-2" />
          )}
          {uploadingScreenshot ? "Uploading..." : "Submit Application"}
        </Button>

        {onClose && (
          <Button variant="ghost" onClick={onClose} className="w-full h-10 text-sm">
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
};

export default HelperApplicationForm;
