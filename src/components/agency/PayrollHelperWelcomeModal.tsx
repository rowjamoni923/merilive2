import { useState, useEffect, forwardRef } from "react";
import { 
  Wallet, 
  Users, 
  DollarSign, 
  Shield, 
  Globe, 
  TrendingUp,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Coins,
  Gift,
  Clock,
  Star,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import payrollHeroImage from "@/assets/payroll-helper-hero.png";

interface PayrollHelperWelcomeModalProps {
  agencyId: string;
  userId: string;
}

const PayrollHelperWelcomeModal = ({ agencyId, userId }: PayrollHelperWelcomeModalProps) => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [helperTiers, setHelperTiers] = useState<Array<{level_number: number; level_name: string; commission_rate: number}>>([]);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    checkAndShowModal();
    fetchHelperTiers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId, userId]);

  const markShown = () => {
    try {
      // Per-AGENCY key (not just per-user) so creating a new agency re-triggers the welcome.
      localStorage.setItem(`payroll_helper_modal_shown_${userId}_${agencyId}`, "true");
    } catch (_) {
      /* storage disabled */
    }
  };

  const checkAndShowModal = async () => {
    const shownKey = `payroll_helper_modal_shown_${userId}_${agencyId}`;
    let alreadyShown = false;
    try { alreadyShown = !!localStorage.getItem(shownKey); } catch (_) { /* ignore */ }
    if (alreadyShown) return;

    // If the user is ALREADY a verified payroll helper, no need to show the welcome.
    // (Pending / unverified rows should still see it so they remember to complete onboarding.)
    const { data: helperData } = await supabase
      .from("topup_helpers")
      .select("id, is_verified, payroll_enabled")
      .eq("user_id", userId)
      .maybeSingle();

    if (helperData && helperData.is_verified === true && helperData.payroll_enabled === true) {
      markShown();
      return;
    }

    // Show the welcome banner — no time-window restriction. Only suppressed once
    // the user actually interacts with it (Apply / Maybe Later) or already a verified helper.
    setTimeout(() => setIsOpen(true), 800);
  };

  const fetchHelperTiers = async () => {
    const { data } = await supabase
      .from("helper_level_config")
      .select("level_number, level_name, commission_rate")
      .eq("is_enabled", true)
      .order("level_number", { ascending: true });

    if (data) {
      setHelperTiers(data);
    }
  };

  const handleApply = async () => {
    setIsApplying(true);
    try {
      const { data: existing } = await supabase
        .from("topup_helpers")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (existing) {
        toast({
          title: "Already Applied",
          description: "You have already applied for Payroll Helper access",
        });
        markShown();
        setIsOpen(false);
        return;
      }

      const { error } = await supabase
        .from("topup_helpers")
        .insert({
          user_id: userId,
          is_verified: false,
          trader_level: 1,
          payroll_enabled: false
        });

      if (error) throw error;

      toast({
        title: "Application Submitted! 🎉",
        description: "Your Payroll Helper application is pending approval",
      });
      markShown();
      setIsOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit application",
        variant: "destructive"
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleClose = () => {
    markShown();
    setIsOpen(false);
  };

  if (!isOpen) return null;

  const benefits = [
    { icon: Coins, title: "Process Top-ups", desc: "Handle user diamond recharge requests", color: "text-amber-500" },
    { icon: Gift, title: "Manage Withdrawals", desc: "Process agency withdrawal requests", color: "text-emerald-500" },
    { icon: DollarSign, title: "Diamond Operations", desc: "Manage diamond balance transactions", color: "text-cyan-500" },
    { icon: TrendingUp, title: "Earn Commission", desc: "Get % on every transaction you process", color: "text-purple-500" },
    { icon: Globe, title: "Global Network", desc: "Serve users from multiple countries", color: "text-blue-500" },
    { icon: Star, title: "Level Up System", desc: "Higher levels = Higher commission rates", color: "text-pink-500" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-lg mx-auto p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        {/* Hero Image */}
        <div className="relative">
          <img 
            src={payrollHeroImage} 
            alt="Payroll Helper System" 
            className="w-full h-44 object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-amber-50 via-rose-50 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <div className="flex items-center gap-2 mb-1">
              <Badge className="bg-emerald-500/90 text-white border-0 text-xs">
                💰 Exclusive Opportunity
              </Badge>
            </div>
            <h2 className="text-xl font-bold text-white">Become a Payroll Helper</h2>
            <p className="text-slate-700 text-sm">
              Earn commission by processing transactions for our global user base!
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Benefits Grid */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              What You Can Do
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {benefits.map((benefit, idx) => (
                <div 
                  key={idx}
                  className="bg-muted/50 rounded-lg p-2.5 border border-border hover:bg-muted/80 transition-colors"
                >
                  <benefit.icon className={`w-5 h-5 ${benefit.color} mb-1`} />
                  <p className="text-xs font-medium">{benefit.title}</p>
                  <p className="text-[10px] text-muted-foreground">{benefit.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Key Advantages */}
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800">
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2 text-emerald-900 dark:text-emerald-100">
              <Zap className="w-4 h-4 text-emerald-600" />
              Key Advantages
            </h4>
            <ul className="space-y-1.5 text-emerald-800 dark:text-emerald-200">
              <li className="flex items-start gap-2 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                <span>Earn commission on every top-up, withdrawal, and diamond transaction</span>
              </li>
              <li className="flex items-start gap-2 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                <span>Receive diamond rewards for completing withdrawal orders</span>
              </li>
              <li className="flex items-start gap-2 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                <span>Level up by processing more orders and unlock higher commissions</span>
              </li>
              <li className="flex items-start gap-2 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                <span>Access orders from users worldwide - no geographical limits</span>
              </li>
              <li className="flex items-start gap-2 text-xs">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                <span>Trusted role with verified badge and priority support</span>
              </li>
            </ul>
          </div>

          {/* Commission Tiers */}
          {helperTiers.length > 0 && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 rounded-xl p-3 border border-amber-200 dark:border-amber-800">
              <h4 className="font-medium text-sm mb-2 flex items-center gap-2 text-amber-900 dark:text-amber-100">
                <TrendingUp className="w-4 h-4 text-amber-600" />
                Commission Tiers (Level Up & Earn More!)
              </h4>
              <div className="flex gap-1.5 flex-wrap">
                {helperTiers.map((tier) => (
                  <Badge 
                    key={tier.level_number}
                    variant="outline" 
                    className="bg-white dark:bg-white/80 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-[10px]"
                  >
                    L{tier.level_number}: {tier.commission_rate}%
                  </Badge>
                ))}
              </div>
              <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-2">
                Start at Level 1 and progress by completing more transactions!
              </p>
            </div>
          )}

          {/* Responsibilities */}
          <div className="bg-muted/30 rounded-xl p-3 border border-border">
            <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-500" />
              Your Responsibilities
            </h4>
            <ul className="grid grid-cols-1 gap-1">
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                Process orders promptly within 24 hours
              </li>
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="w-3 h-3" />
                Maintain professional communication with users
              </li>
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <Shield className="w-3 h-3" />
                Follow platform guidelines and security protocols
              </li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={handleClose}
              className="flex-1"
            >
              Maybe Later
            </Button>
            <Button
              onClick={handleApply}
              disabled={isApplying}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
            >
              {isApplying ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Applying...
                </>
              ) : (
                <>
                  Apply Now
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </div>

          <p className="text-[10px] text-center text-muted-foreground">
            Your application will be reviewed by our admin team within 24-48 hours
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PayrollHelperWelcomeModal;
