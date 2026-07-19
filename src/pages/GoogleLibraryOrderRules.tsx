import { useEffect, useState } from "react";
import { ArrowLeft, Clock, Gift, Users, MessageCircle, Radio, AlertTriangle, Headphones, Star, Flame, Trophy, Sparkles, Send, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/Skeleton";
import BeansIcon from "@/components/common/BeansIcon";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { recordClientError } from "@/utils/clientErrorLog";

const TICKET_CATEGORIES = [
  { key: "task_issue", label: "Task Issue", icon: "📋", orb: "radial-gradient(120% 120% at 30% 20%, #bfdbfe 0%, #3b82f6 55%, #1e3a8a 100%)" },
  { key: "bonus_issue", label: "Bonus Issue", icon: "🎁", orb: "radial-gradient(120% 120% at 30% 20%, #fde68a 0%, #f59e0b 55%, #b45309 100%)" },
  { key: "payment_issue", label: "Payment Issue", icon: "💰", orb: "radial-gradient(120% 120% at 30% 20%, #bbf7d0 0%, #10b981 55%, #065f46 100%)" },
  { key: "bug_report", label: "Bug Report", icon: "🐛", orb: "radial-gradient(120% 120% at 30% 20%, #fecaca 0%, #ef4444 55%, #7f1d1d 100%)" },
  { key: "account_issue", label: "Account Issue", icon: "👤", orb: "radial-gradient(120% 120% at 30% 20%, #ddd6fe 0%, #8b5cf6 55%, #4c1d95 100%)" },
  { key: "other", label: "Other", icon: "💬", orb: "radial-gradient(120% 120% at 30% 20%, #e2e8f0 0%, #64748b 55%, #1e293b 100%)" },
];

const HOURLY_LIVE_BONUS_BEANS = 10000;
const MAX_LIVE_BONUS_HOURS = 5;
const TOTAL_LIVE_BONUS_BEANS = HOURLY_LIVE_BONUS_BEANS * MAX_LIVE_BONUS_HOURS;

// Premium 3D orb section configs
const orbAmber = "radial-gradient(120% 120% at 30% 20%, #fef3c7 0%, #f59e0b 50%, #b45309 100%)";
const orbPurple = "radial-gradient(120% 120% at 30% 20%, #e9d5ff 0%, #a855f7 50%, #581c87 100%)";
const orbYellow = "radial-gradient(120% 120% at 30% 20%, #fef9c3 0%, #eab308 50%, #854d0e 100%)";
const orbGreen = "radial-gradient(120% 120% at 30% 20%, #bbf7d0 0%, #10b981 50%, #064e3b 100%)";

const SectionCard = ({
  accent,
  orb,
  icon,
  title,
  subtitle,
  children,
}: {
  accent: string;
  orb: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) => (
  <motion.div
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35, ease: "easeOut" }}
    className="relative rounded-2xl overflow-hidden bg-white/95 backdrop-blur-sm"
    style={{
      boxShadow: `0 14px 30px -10px ${accent}, 0 2px 6px -2px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.9)`,
      border: "1px solid rgba(255,255,255,0.6)",
    }}
  >
    {/* glossy top sheen */}
    <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
    <div className="relative bg-gradient-to-b from-white to-slate-50/60 px-4 py-3.5 border-b border-slate-200/70 flex items-center gap-3">
      <div
        className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: orb,
          boxShadow: `0 6px 14px -4px ${accent}, inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.18)`,
        }}
      >
        <div className="absolute inset-x-1 top-1 h-2 rounded-full bg-white/40 blur-[2px]" />
        <div className="relative text-white" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }}>{icon}</div>
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-slate-900 truncate">{title}</h2>
        <p className="text-[10.5px] text-slate-500 truncate">{subtitle}</p>
      </div>
    </div>
    {children}
  </motion.div>
);

const GoogleLibraryOrderRules = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<{ title: string; content: string } | null>(null);
  const [showSupportDialog, setShowSupportDialog] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    const fetchContent = async () => {
      const { data } = await supabase
        .from("app_content")
        .select("title, content")
        .eq("page_key", "google_library_order_rules")
        .eq("is_active", true)
        .maybeSingle();
      setContent(data);
      setLoading(false);
    };
    fetchContent();
  }, []);

  const handleSubmitTicket = async () => {
    if (!selectedCategory || !subject.trim()) {
      toast.error("Please select a category and enter a subject");
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error("Please login first");
        return;
      }

      const { data: ticket, error: ticketError } = await supabase
        .from("support_tickets")
        .insert({
          user_id: user.id,
          subject: subject.trim(),
          category: selectedCategory,
          user_email: user.email || null,
        })
        .select("id")
        .single();

      if (ticketError) throw ticketError;

      if (description.trim() && ticket) {
        await supabase.from("support_messages").insert({
          ticket_id: ticket.id,
          sender_id: user.id,
          sender_type: "user",
          content: description.trim(),
        });
      }

      setSubmitted(true);
      setTimeout(() => {
        setShowSupportDialog(false);
        setSubmitted(false);
        setSelectedCategory(null);
        setSubject("");
        setDescription("");
      }, 2000);
    } catch (error: any) {
      console.error("Ticket error:", error);
      recordClientError({ label: "GoogleLibraryOrderRules.handleSubmitTicket", message: error instanceof Error ? error.message : String(error) });
      toast.error("Failed to submit ticket");
    } finally {
      setSubmitting(false);
    }
  };

  const bonusRows = Array.from({ length: MAX_LIVE_BONUS_HOURS }, (_, index) => ({
    hour: `${index + 1} Hour${index === 0 ? "" : "s"}`,
    beans: HOURLY_LIVE_BONUS_BEANS.toLocaleString(),
  }));

  const dailyTasks = [
    { icon: <Radio className="w-4 h-4" />, task: "First Live", req: "Go live for the first time", beans: "50", diamonds: "10", orb: "radial-gradient(120% 120% at 30% 20%, #fecaca 0%, #ef4444 55%, #7f1d1d 100%)", accent: "rgba(239,68,68,0.35)" },
    { icon: <Users className="w-4 h-4" />, task: "5 Viewers", req: "Get 5 viewers in your stream", beans: "75", diamonds: "15", orb: "radial-gradient(120% 120% at 30% 20%, #bfdbfe 0%, #3b82f6 55%, #1e3a8a 100%)", accent: "rgba(59,130,246,0.35)" },
    { icon: <Gift className="w-4 h-4" />, task: "First Gift", req: "Receive your first gift", beans: "30", diamonds: "5", orb: "radial-gradient(120% 120% at 30% 20%, #fbcfe8 0%, #ec4899 55%, #831843 100%)", accent: "rgba(236,72,153,0.35)" },
    { icon: <MessageCircle className="w-4 h-4" />, task: "Message 5 People", req: "Send messages to 5 people", beans: "25", diamonds: "5", orb: "radial-gradient(120% 120% at 30% 20%, #bbf7d0 0%, #10b981 55%, #064e3b 100%)", accent: "rgba(16,185,129,0.35)" },
  ];

  const rules = [
    { icon: <Clock className="w-4 h-4" />, text: "All tasks reset daily at 12:00 AM" },
    { icon: <Star className="w-4 h-4" />, text: 'Tap the "Receive" button to claim your reward' },
    { icon: <Sparkles className="w-4 h-4" />, text: "Live bonus is only for face-verified hosts" },
    { icon: <Trophy className="w-4 h-4" />, text: "Each task reward can be claimed once per day" },
    { icon: <Flame className="w-4 h-4" />, text: "Task progress updates in real-time" },
  ];

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden" style={{ background: "linear-gradient(180deg, #faf5ff 0%, #fdf2f8 40%, #fff7ed 100%)" }}>
      {/* Premium Header */}
      <div
        className="flex-shrink-0 relative py-4 px-4 flex items-center gap-3 z-50 safe-area-top"
        style={{
          background: "radial-gradient(140% 180% at 30% 0%, #c084fc 0%, #ec4899 45%, #7c3aed 100%)",
          boxShadow: "0 10px 28px -10px rgba(168,85,247,0.55), inset 0 -1px 0 rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.35)",
        }}
      >
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
        <motion.button
          whileHover={{ y: -1, scale: 1.05 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate(-1)}
          className="relative w-9 h-9 rounded-full flex items-center justify-center text-white"
          style={{
            background: "rgba(255,255,255,0.18)",
            backdropFilter: "blur(8px)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.15), 0 4px 10px -2px rgba(0,0,0,0.25)",
            border: "1px solid rgba(255,255,255,0.25)",
          }}
        >
          <ArrowLeft className="w-5 h-5" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }} />
        </motion.button>
        <h1 className="text-lg font-bold text-white truncate" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}>
          {content?.title || "MeriLive — Task Center Rules"}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch", paddingBottom: "var(--content-bottom-padding)" }}>
        <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
          {loading ? (
            <div className="space-y-4 py-2" aria-busy="true">
              <Skeleton className="h-32 w-full rounded-2xl" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 rounded-2xl bg-card border border-border space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-5/6" />
                </div>
              ))}
            </div>

          ) : (
            <>
              {/* Hero Title */}
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center pt-1"
              >
                <p className="text-2xl font-extrabold bg-gradient-to-r from-purple-600 via-pink-500 to-amber-500 bg-clip-text text-transparent tracking-tight">
                  🎯 Task Center Rules
                </p>
                <p className="text-slate-500 text-xs mt-1.5">Earn rewards by completing daily tasks</p>
              </motion.div>

              {/* New Host Live Bonus */}
              <SectionCard
                accent="rgba(245,158,11,0.28)"
                orb={orbAmber}
                icon={<Gift className="w-5 h-5" />}
                title="New Host Live Bonus"
                subtitle={`Stream & earn up to ${TOTAL_LIVE_BONUS_BEANS.toLocaleString()} Beans/day`}
              >
                <div className="p-4 space-y-3">
                  <p className="text-slate-600 text-xs leading-relaxed">
                    Newly verified hosts can earn bonus <BeansIcon size={11} /> Beans by streaming up to{" "}
                    <span className="text-amber-600 font-semibold">5 hours</span> per day.
                  </p>
                  <div
                    className="rounded-xl overflow-hidden"
                    style={{
                      border: "1px solid rgba(226,232,240,0.9)",
                      boxShadow: "0 4px 12px -4px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
                    }}
                  >
                    <div className="grid grid-cols-2 bg-gradient-to-b from-slate-50 to-slate-100/60 px-4 py-2.5 border-b border-slate-200">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">Hour</span>
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider text-right">Reward</span>
                    </div>
                    {bonusRows.map((row, i) => (
                      <div
                        key={i}
                        className={`grid grid-cols-2 px-4 py-2.5 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"} border-t border-slate-100`}
                      >
                        <span className="text-sm text-slate-700 flex items-center gap-1.5">
                          <span className="text-amber-500 text-xs">⏱</span> {row.hour}
                        </span>
                        <span className="text-sm text-right flex items-center justify-end gap-1">
                          <BeansIcon size={12} />
                          <span className="text-amber-600 font-bold">{row.beans}</span>
                        </span>
                      </div>
                    ))}
                    <div
                      className="grid grid-cols-2 px-4 py-3 border-t border-amber-200/80"
                      style={{ background: "linear-gradient(90deg, #fef3c7 0%, #fed7aa 100%)" }}
                    >
                      <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5 text-amber-600" /> Total
                      </span>
                      <span className="text-sm font-bold text-right flex items-center justify-end gap-1">
                        <BeansIcon size={13} />
                        <span className="text-amber-700">{TOTAL_LIVE_BONUS_BEANS.toLocaleString()}</span>
                        <span className="text-slate-500 text-xs">/day</span>
                      </span>
                    </div>
                  </div>
                  <div
                    className="flex items-start gap-2.5 rounded-xl px-3.5 py-2.5"
                    style={{
                      background: "linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)",
                      border: "1px solid rgba(147,197,253,0.6)",
                      boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
                    }}
                  >
                    <Clock className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-800 leading-relaxed">
                      This bonus is available for the first{" "}
                      <span className="text-blue-900 font-bold">3 days</span> after face verification.
                    </p>
                  </div>
                </div>
              </SectionCard>

              {/* Daily Task List */}
              <SectionCard
                accent="rgba(168,85,247,0.28)"
                orb={orbPurple}
                icon={<Star className="w-5 h-5" />}
                title="Daily Task List"
                subtitle="For Everyone"
              >
                <div className="p-3 space-y-2.5">
                  {dailyTasks.map((t, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      whileHover={{ y: -1 }}
                      className="relative rounded-xl p-3 flex items-center gap-3 bg-white"
                      style={{
                        border: "1px solid rgba(226,232,240,0.9)",
                        boxShadow: `0 6px 14px -6px ${t.accent}, inset 0 1px 0 rgba(255,255,255,0.95)`,
                      }}
                    >
                      <div
                        className="relative w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white"
                        style={{
                          background: t.orb,
                          boxShadow: `0 4px 10px -2px ${t.accent}, inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.18)`,
                        }}
                      >
                        <div className="absolute inset-x-1 top-1 h-1.5 rounded-full bg-white/40 blur-[2px]" />
                        <div className="relative" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }}>
                          {t.icon}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-slate-900 truncate">{t.task}</p>
                        <p className="text-[11px] text-slate-500 truncate">{t.req}</p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="flex items-center gap-1 text-xs">
                          <BeansIcon size={11} />
                          <span className="text-amber-600 font-bold">{t.beans}</span>
                        </span>
                        <span className="flex items-center gap-1 text-[11px]">
                          <span className="text-cyan-500">💎</span>
                          <span className="text-cyan-600 font-bold">{t.diamonds}</span>
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </SectionCard>

              {/* Important Rules */}
              <SectionCard
                accent="rgba(234,179,8,0.28)"
                orb={orbYellow}
                icon={<AlertTriangle className="w-5 h-5" />}
                title="Important Rules"
                subtitle="Read carefully before starting"
              >
                <div className="p-4 space-y-2">
                  {rules.map((rule, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.04 }}
                      className="flex items-start gap-3 rounded-lg px-3 py-2.5"
                      style={{
                        background: "linear-gradient(135deg, #fefce8 0%, #ffffff 100%)",
                        border: "1px solid rgba(254,240,138,0.7)",
                        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
                      }}
                    >
                      <div className="text-yellow-600 mt-0.5 shrink-0">{rule.icon}</div>
                      <p className="text-xs text-slate-700 leading-relaxed">{rule.text}</p>
                    </motion.div>
                  ))}
                </div>
              </SectionCard>

              {/* Support Button — 3D orb CTA */}
              <motion.button
                whileHover={{ y: -2, scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowSupportDialog(true)}
                className="relative w-full rounded-2xl overflow-hidden p-4 flex items-center gap-3 bg-white"
                style={{
                  border: "1px solid rgba(167,243,208,0.7)",
                  boxShadow: "0 14px 30px -10px rgba(16,185,129,0.4), inset 0 1px 0 rgba(255,255,255,0.95)",
                }}
              >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent" />
                <div
                  className="relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-white"
                  style={{
                    background: orbGreen,
                    boxShadow: "0 6px 14px -2px rgba(16,185,129,0.5), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.2)",
                  }}
                >
                  <div className="absolute inset-x-1 top-1 h-1.5 rounded-full bg-white/40 blur-[2px]" />
                  <Headphones className="relative w-5 h-5" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }} />
                </div>
                <div className="text-left flex-1">
                  <h3 className="text-sm font-bold text-slate-900">Need Help?</h3>
                  <p className="text-[11px] text-slate-500">Tap to submit a support ticket</p>
                </div>
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 2px 4px rgba(16,185,129,0.2)",
                  }}
                >
                  <Send className="w-4 h-4 text-emerald-700" />
                </div>
              </motion.button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="text-center py-6">
          <p className="text-slate-400 text-xs">© MeriLive — All Rights Reserved</p>
        </div>
      </div>

      {/* Support Ticket Dialog — premium */}
      <Dialog open={showSupportDialog} onOpenChange={setShowSupportDialog}>
        <DialogContent
          className="bg-white border-0 text-slate-900 max-w-[380px] rounded-2xl p-0 overflow-hidden [&>button]:hidden"
          style={{
            boxShadow: "0 30px 60px -20px rgba(16,185,129,0.35), 0 14px 30px -10px rgba(15,23,42,0.18), inset 0 1px 0 rgba(255,255,255,0.95)",
            border: "1px solid rgba(167,243,208,0.6)",
          }}
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-[2px] bg-gradient-to-r from-transparent via-emerald-500/70 to-transparent" />

          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-8 flex flex-col items-center gap-4"
              >
                <div
                  className="relative w-20 h-20 rounded-full flex items-center justify-center text-white"
                  style={{
                    background: orbGreen,
                    boxShadow: "0 10px 24px -4px rgba(16,185,129,0.55), inset 0 2px 0 rgba(255,255,255,0.5), inset 0 -2px 6px rgba(0,0,0,0.2)",
                  }}
                >
                  <div className="absolute inset-x-2 top-2 h-2 rounded-full bg-white/40 blur-[3px]" />
                  <CheckCircle2 className="relative w-10 h-10" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }} />
                </div>
                <h3 className="text-lg font-bold text-slate-900">Ticket Submitted!</h3>
                <p className="text-slate-500 text-sm text-center">Our team will review and respond soon.</p>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-5 pt-6">
                <DialogHeader className="space-y-2 mb-5">
                  <DialogTitle className="text-slate-900 flex items-center gap-2.5 text-lg">
                    <div
                      className="relative w-10 h-10 rounded-xl flex items-center justify-center text-white"
                      style={{
                        background: orbGreen,
                        boxShadow: "0 4px 10px -2px rgba(16,185,129,0.45), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.18)",
                      }}
                    >
                      <div className="absolute inset-x-1 top-1 h-1.5 rounded-full bg-white/40 blur-[2px]" />
                      <Headphones className="relative w-5 h-5" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }} />
                    </div>
                    Support Ticket
                  </DialogTitle>
                  <DialogDescription className="text-slate-500 text-sm">
                    Tell us about your issue and we'll help you
                  </DialogDescription>
                </DialogHeader>

                {/* Category Selection — 3D orb tiles */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {TICKET_CATEGORIES.map((cat) => {
                    const isSelected = selectedCategory === cat.key;
                    return (
                      <motion.button
                        key={cat.key}
                        whileHover={{ y: -2, scale: 1.03 }}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => setSelectedCategory(cat.key)}
                        className={cn(
                          "relative flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all overflow-hidden",
                          isSelected ? "text-white" : "text-slate-700 bg-white"
                        )}
                        style={
                          isSelected
                            ? {
                                background: cat.orb,
                                boxShadow: "0 8px 18px -4px rgba(15,23,42,0.3), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.2)",
                                border: "1px solid rgba(255,255,255,0.35)",
                              }
                            : {
                                border: "1px solid rgba(226,232,240,0.9)",
                                boxShadow: "0 2px 6px -2px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.9)",
                              }
                        }
                      >
                        {isSelected && (
                          <div className="pointer-events-none absolute inset-x-1 top-1 h-2 rounded-full bg-white/40 blur-[2px]" />
                        )}
                        <span className="relative text-xl" style={isSelected ? { filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" } : undefined}>
                          {cat.icon}
                        </span>
                        <span
                          className={cn("relative text-[10px] font-semibold leading-tight text-center")}
                          style={isSelected ? { textShadow: "0 1px 2px rgba(0,0,0,0.35)" } : undefined}
                        >
                          {cat.label}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>

                {/* Subject */}
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject (e.g., Task reward not received)"
                  className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl mb-3 text-sm h-11 shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)]"
                  maxLength={100}
                />

                {/* Description */}
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your issue in detail (optional)..."
                  className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 min-h-[80px] resize-none rounded-xl mb-4 text-sm shadow-[inset_0_1px_2px_rgba(15,23,42,0.06)]"
                  maxLength={1000}
                />

                <div className="space-y-2.5">
                  <motion.button
                    whileHover={{ y: -1, scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSubmitTicket}
                    disabled={!selectedCategory || !subject.trim() || submitting}
                    className="relative w-full h-12 text-white font-bold rounded-xl overflow-hidden disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{
                      background: orbGreen,
                      boxShadow: "0 10px 22px -6px rgba(16,185,129,0.5), inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 4px rgba(0,0,0,0.2)",
                    }}
                  >
                    <div className="pointer-events-none absolute inset-x-2 top-1 h-2 rounded-full bg-white/40 blur-[2px]" />
                    {submitting ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4 relative" style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))" }} />
                        <span className="relative" style={{ textShadow: "0 1px 2px rgba(0,0,0,0.35)" }}>
                          Submit Ticket
                        </span>
                      </>
                    )}
                  </motion.button>
                  <Button
                    variant="ghost"
                    onClick={() => setShowSupportDialog(false)}
                    className="w-full h-10 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl text-sm"
                  >
                    Cancel
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GoogleLibraryOrderRules;
