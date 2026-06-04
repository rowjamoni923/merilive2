import { useState, useEffect } from "react";
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
  Zap,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
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

  const markShown = (force = false) => {
    try {
      // If force is true (applied), we mark it permanently shown.
      // Otherwise, we just mark it shown for this session to avoid nagging.
      if (force) {
        localStorage.setItem(`payroll_helper_modal_shown_${userId}_${agencyId}`, "true");
      } else {
        sessionStorage.setItem(`payroll_helper_modal_dismissed_${userId}_${agencyId}`, "true");
      }
    } catch (_) {
      /* storage disabled */
    }
  };

  const checkAndShowModal = async () => {
    // 1. Check permanent local storage (applied or explicitly finished onboarding)
    const shownKey = `payroll_helper_modal_shown_${userId}_${agencyId}`;
    let alreadyShown = false;
    try { alreadyShown = !!localStorage.getItem(shownKey); } catch (_) { /* ignore */ }
    if (alreadyShown) return;

    // 2. Check session storage (dismissed this session)
    const sessionKey = `payroll_helper_modal_dismissed_${userId}_${agencyId}`;
    let sessionDismissed = false;
    try { sessionDismissed = !!sessionStorage.getItem(sessionKey); } catch (_) { /* ignore */ }
    if (sessionDismissed) return;

    // 3. If the user is ALREADY a verified payroll helper, no need to show the welcome.
    const { data: helperData } = await supabase
      .from("topup_helpers")
      .select("id, is_verified, payroll_enabled")
      .eq("user_id", userId)
      .maybeSingle();

    if (helperData && helperData.is_verified === true && helperData.payroll_enabled === true) {
      markShown(true);
      return;
    }

    // Show the welcome banner with a slight delay for dramatic effect
    setTimeout(() => setIsOpen(true), 1200);
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
        markShown(true);
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
      markShown(true);
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
    markShown(false); // Only dismissed for session
    setIsOpen(false);
  };

  const benefits = [
    { icon: Coins, title: "Process Top-ups", desc: "Handle user diamond recharge requests", color: "text-warning-500", bg: "bg-warning-50/50" },
    { icon: Gift, title: "Manage Withdrawals", desc: "Process agency withdrawal requests", color: "text-success-500", bg: "bg-success-50/50" },
    { icon: DollarSign, title: "Diamond Operations", desc: "Manage diamond balance transactions", color: "text-info-500", bg: "bg-info-50/50" },
    { icon: TrendingUp, title: "Earn Commission", desc: "Get % on every transaction you process", color: "text-brand-500", bg: "bg-brand-50/50" },
    { icon: Globe, title: "Global Network", desc: "Serve users from multiple countries", color: "text-info-500", bg: "bg-info-50/50" },
    { icon: Star, title: "Level Up System", desc: "Higher levels = Higher commission rates", color: "text-brand-500", bg: "bg-brand-50/50" },
  ];

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-lg mx-auto p-0 overflow-hidden max-h-[90vh] border-none shadow-2xl bg-white/95 backdrop-blur-xl">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: "spring", damping: 20, stiffness: 300 }}
              className="relative w-full overflow-hidden rounded-3xl"
            >
              {/* Close Button Overlay */}
              <button 
                onClick={handleClose}
                className="absolute top-4 right-4 z-50 p-2 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-all hover:rotate-90"
              >
                <X className="w-4 h-4" />
              </button>

              {/* Hero Section with 3D depth */}
              <div className="relative h-48 overflow-hidden group">
                <motion.img 
                  initial={{ scale: 1.1 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 1.5 }}
                  src={payrollHeroImage} 
                  alt="Payroll Helper System" 
                  className="w-full h-full object-cover"/>
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                
                <div className="absolute bottom-0 left-0 right-0 p-5 space-y-1">
                  <motion.div
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                  >
                    <Badge className="bg-success-500 text-white border-0 text-[10px] font-bold uppercase tracking-wider px-2 shadow-lg shadow-success-500/30">
                      🏆 Elite Opportunity
                    </Badge>
                  </motion.div>
                  <motion.h2 
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-2xl font-black text-white drop-shadow-md leading-none"
                  >
                    Become a Payroll Helper
                  </motion.h2>
                  <motion.p 
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="text-white/90 text-sm font-medium"
                  >
                    Level Up your agency into a global financial partner
                  </motion.p>
                </div>
              </div>

              {/* Body Content */}
              <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar">
                
                {/* Benefits Grid - Interactive 3D Cards */}
                <div className="space-y-3">
                  <h3 className="font-bold text-sm flex items-center gap-2 text-slate-800">
                    <Sparkles className="w-4 h-4 text-warning-500 animate-pulse" />
                    Premium Capabilities
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {benefits.map((benefit, idx) => (
                      <motion.div 
                        key={idx}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.2 + idx * 0.05 }}
                        whileHover={{ y: -4, scale: 1.02 }}
                        className={`${benefit.bg} rounded-2xl p-3 border border-white shadow-sm ring-1 ring-slate-200/50 backdrop-blur-sm transition-all`}
                      >
                        <div className={`w-9 h-9 ${benefit.color} mb-2 bg-white rounded-xl flex items-center justify-center shadow-sm`}>
                          <benefit.icon className="w-5 h-5" />
                        </div>
                        <p className="text-xs font-bold text-slate-800 leading-tight">{benefit.title}</p>
                        <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{benefit.desc}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>

                {/* Key Advantages - HD Polish */}
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 }}
                  className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 rounded-2xl p-4 border border-indigo-100/50 shadow-inner relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 p-2 opacity-10">
                    <Shield className="w-16 h-16 text-indigo-500" />
                  </div>
                  <h4 className="font-bold text-sm mb-3 flex items-center gap-2 text-indigo-900 dark:text-indigo-100">
                    <Zap className="w-4 h-4 text-indigo-600 fill-indigo-600" />
                    Verified Partner Benefits
                  </h4>
                  <ul className="space-y-2 relative z-10">
                    {[
                      "Priority processing for all agency withdrawals",
                      "Exclusive 'Payroll Partner' badge on profile",
                      "Direct access to helper-only support channel",
                      "Unlock higher commission tiers up to 12%"
                    ].map((text, i) => (
                      <li key={i} className="flex items-start gap-2.5 text-xs text-indigo-800 dark:text-indigo-200 font-medium">
                        <CheckCircle2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
                        <span>{text}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>

                {/* Commission Tiers - Dynamic UI */}
                {helperTiers.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                    className="bg-slate-50 rounded-2xl p-4 border border-slate-200"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold text-sm flex items-center gap-2 text-slate-800">
                        <TrendingUp className="w-4 h-4 text-brand-500" />
                        Growth Path
                      </h4>
                      <Badge variant="outline" className="text-[10px] bg-white border-slate-200">
                        Tiered Earnings
                      </Badge>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                      {helperTiers.map((tier) => (
                        <div 
                          key={tier.level_number}
                          className="flex-shrink-0 bg-white border border-slate-200 rounded-xl px-3 py-2 text-center min-w-[70px] shadow-sm hover:border-brand-300 transition-colors"
                        >
                          <p className="text-[10px] font-bold text-slate-400">LEVEL {tier.level_number}</p>
                          <p className="text-sm font-black text-brand-600">{tier.commission_rate}%</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* CTA Actions - Premium 3D Buttons */}
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="ghost"
                    onClick={handleClose}
                    className="flex-1 text-slate-500 font-bold hover:bg-slate-100 rounded-xl"
                  >
                    Maybe Later
                  </Button>
                  <Button
                    onClick={handleApply}
                    disabled={isApplying}
                    className="flex-[2] bg-gradient-to-r from-success-500 to-success-600 hover:from-success-600 hover:to-success-700 text-white font-bold rounded-xl shadow-lg shadow-success-500/30 border-t border-white/20 h-12 transition-all active:scale-95"
                  >
                    {isApplying ? (
                      <div className="flex items-center gap-2">
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        >
                          <Zap className="w-4 h-4" />
                        </motion.div>
                        Processing...
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        Apply Now
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    )}
                  </Button>
                </div>

                <p className="text-[10px] text-center text-slate-400 font-medium">
                  Approved by MeritLive Global Governance Team
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
};

export default PayrollHelperWelcomeModal;

