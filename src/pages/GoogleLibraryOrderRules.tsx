import { useEffect, useState } from "react";
import { ArrowLeft, Clock, Gift, Users, MessageCircle, Radio, AlertTriangle, Headphones, Star, Flame, Trophy, Sparkles, Send, CheckCircle2, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
  { key: "task_issue", label: "Task Issue", icon: "📋", color: "from-blue-500/20 to-cyan-500/10", border: "border-blue-500/25", selectedBorder: "border-blue-400/60" },
  { key: "bonus_issue", label: "Bonus Issue", icon: "🎁", color: "from-amber-500/20 to-orange-500/10", border: "border-amber-500/25", selectedBorder: "border-amber-400/60" },
  { key: "payment_issue", label: "Payment Issue", icon: "💰", color: "from-green-500/20 to-emerald-500/10", border: "border-green-500/25", selectedBorder: "border-green-400/60" },
  { key: "bug_report", label: "Bug Report", icon: "🐛", color: "from-red-500/20 to-rose-500/10", border: "border-red-500/25", selectedBorder: "border-red-400/60" },
  { key: "account_issue", label: "Account Issue", icon: "👤", color: "from-purple-500/20 to-violet-500/10", border: "border-purple-500/25", selectedBorder: "border-purple-400/60" },
  { key: "other", label: "Other", icon: "💬", color: "from-gray-500/20 to-slate-500/10", border: "border-gray-500/25", selectedBorder: "border-gray-400/60" },
];

const HOURLY_LIVE_BONUS_BEANS = 10000;
const MAX_LIVE_BONUS_HOURS = 5;
const TOTAL_LIVE_BONUS_BEANS = HOURLY_LIVE_BONUS_BEANS * MAX_LIVE_BONUS_HOURS;

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

      // Insert ticket
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

      // Insert first message if description provided
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
    { icon: <Radio className="w-4 h-4 text-red-400" />, task: "First Live", req: "Go live for the first time", beans: "50", diamonds: "10", color: "from-red-500/20 to-orange-500/10" },
    { icon: <Users className="w-4 h-4 text-blue-400" />, task: "5 Viewers", req: "Get 5 viewers in your stream", beans: "75", diamonds: "15", color: "from-blue-500/20 to-cyan-500/10" },
    { icon: <Gift className="w-4 h-4 text-pink-400" />, task: "First Gift", req: "Receive your first gift", beans: "30", diamonds: "5", color: "from-pink-500/20 to-purple-500/10" },
    { icon: <MessageCircle className="w-4 h-4 text-green-400" />, task: "Message 5 People", req: "Send messages to 5 people", beans: "25", diamonds: "5", color: "from-green-500/20 to-emerald-500/10" },
  ];

  const rules = [
    { icon: <Clock className="w-4 h-4" />, text: "All tasks reset daily at 12:00 AM" },
    { icon: <Star className="w-4 h-4" />, text: 'Tap the "Receive" button to claim your reward' },
    { icon: <Sparkles className="w-4 h-4" />, text: "Live bonus is only for face-verified hosts" },
    { icon: <Trophy className="w-4 h-4" />, text: "Each task reward can be claimed once per day" },
    { icon: <Flame className="w-4 h-4" />, text: "Task progress updates in real-time" },
  ];

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#1a1025] via-[#130d1e] to-[#0d0a14] overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 py-4 px-4 flex items-center gap-3 z-50 shadow-lg shadow-purple-900/30 safe-area-top">
        <button onClick={() => navigate(-1)} className="text-white hover:bg-white/10 rounded-full p-1 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-white truncate">
          {content?.title || "MeriLive — Task Center Rules"}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>
      <div className="max-w-lg mx-auto px-4 py-5 space-y-5">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Section Title */}
            <div className="text-center">
              <p className="text-2xl font-bold bg-gradient-to-r from-purple-300 via-pink-300 to-amber-300 bg-clip-text text-transparent">
                🎯 Task Center Rules
              </p>
              <p className="text-white/50 text-xs mt-1">Earn rewards by completing daily tasks</p>
            </div>

            {/* ======= New Host Live Bonus Section ======= */}
            <div className="rounded-2xl overflow-hidden border border-amber-500/20 bg-gradient-to-br from-amber-900/20 via-[#1e1530] to-purple-900/20 shadow-lg shadow-amber-900/10">
              <div className="bg-gradient-to-r from-amber-600/30 via-orange-500/20 to-red-500/20 px-4 py-3 border-b border-amber-500/15 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-md shadow-amber-500/30">
                  <Gift className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-amber-200">New Host Live Bonus</h2>
                  <p className="text-[10px] text-amber-300/60">Stream & earn up to {TOTAL_LIVE_BONUS_BEANS.toLocaleString()} Beans/day</p>
                </div>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-white/70 text-xs leading-relaxed">
                  Newly verified hosts can earn bonus <BeansIcon size={11} /> Beans by streaming up to <span className="text-amber-300 font-semibold">5 hours</span> per day.
                </p>
                <div className="rounded-xl overflow-hidden border border-purple-500/15">
                  <div className="grid grid-cols-2 bg-purple-800/30 px-4 py-2.5">
                    <span className="text-[11px] font-semibold text-purple-300 uppercase tracking-wider">Hour</span>
                    <span className="text-[11px] font-semibold text-purple-300 uppercase tracking-wider text-right">Reward</span>
                  </div>
                  {bonusRows.map((row, i) => (
                    <div key={i} className={`grid grid-cols-2 px-4 py-2.5 ${i % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent"} border-t border-purple-500/10`}>
                      <span className="text-sm text-white/80 flex items-center gap-1.5">
                        <span className="text-amber-400 text-xs">⏱</span> {row.hour}
                      </span>
                      <span className="text-sm text-right flex items-center justify-end gap-1">
                        <BeansIcon size={12} />
                        <span className="text-amber-300 font-medium">{row.beans}</span>
                      </span>
                    </div>
                  ))}
                  <div className="grid grid-cols-2 px-4 py-3 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-t border-amber-500/20">
                    <span className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5 text-amber-400" /> Total
                    </span>
                    <span className="text-sm font-bold text-right flex items-center justify-end gap-1">
                      <BeansIcon size={13} />
                       <span className="text-amber-300">{TOTAL_LIVE_BONUS_BEANS.toLocaleString()}</span>
                      <span className="text-white/50 text-xs">/day</span>
                    </span>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 bg-blue-500/8 border border-blue-500/15 rounded-xl px-3.5 py-2.5">
                  <Clock className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-200/80 leading-relaxed">
                    This bonus is available for the first <span className="text-blue-300 font-semibold">3 days</span> after face verification.
                  </p>
                </div>
              </div>
            </div>

            {/* ======= Daily Task List Section ======= */}
            <div className="rounded-2xl overflow-hidden border border-purple-500/20 bg-gradient-to-br from-purple-900/20 via-[#1e1530] to-indigo-900/20 shadow-lg shadow-purple-900/10">
              <div className="bg-gradient-to-r from-purple-600/25 via-indigo-500/15 to-blue-500/15 px-4 py-3 border-b border-purple-500/15 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-md shadow-purple-500/30">
                  <Star className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-purple-200">Daily Task List</h2>
                  <p className="text-[10px] text-purple-300/60">For Everyone</p>
                </div>
              </div>
              <div className="p-3 space-y-2.5">
                {dailyTasks.map((t, i) => (
                  <div key={i} className={`bg-gradient-to-r ${t.color} border border-white/[0.06] rounded-xl p-3 flex items-center gap-3`}>
                    <div className="w-9 h-9 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0 border border-white/[0.06]">
                      {t.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-white truncate">{t.task}</p>
                      <p className="text-[11px] text-white/50 truncate">{t.req}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                      <span className="flex items-center gap-1 text-xs">
                        <BeansIcon size={11} />
                        <span className="text-amber-300 font-medium">{t.beans}</span>
                      </span>
                      <span className="flex items-center gap-1 text-[11px]">
                        <span className="text-cyan-400">💎</span>
                        <span className="text-cyan-300 font-medium">{t.diamonds}</span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* ======= Important Rules Section ======= */}
            <div className="rounded-2xl overflow-hidden border border-yellow-500/15 bg-gradient-to-br from-yellow-900/10 via-[#1e1530] to-orange-900/10 shadow-lg">
              <div className="bg-gradient-to-r from-yellow-600/20 via-amber-500/15 to-orange-500/15 px-4 py-3 border-b border-yellow-500/15 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-500 to-amber-600 flex items-center justify-center shadow-md shadow-yellow-500/20">
                  <AlertTriangle className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-yellow-200">Important Rules</h2>
                  <p className="text-[10px] text-yellow-300/60">Read carefully before starting</p>
                </div>
              </div>
              <div className="p-4 space-y-2">
                {rules.map((rule, i) => (
                  <div key={i} className="flex items-start gap-3 bg-white/[0.02] rounded-lg px-3 py-2.5 border border-white/[0.04]">
                    <div className="text-yellow-400 mt-0.5 shrink-0">{rule.icon}</div>
                    <p className="text-xs text-white/75 leading-relaxed">{rule.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ======= Support Button ======= */}
            <button
              onClick={() => setShowSupportDialog(true)}
              className="w-full rounded-2xl overflow-hidden border border-green-500/20 bg-gradient-to-r from-green-900/20 to-emerald-900/15 p-4 flex items-center gap-3 active:scale-[0.98] transition-transform"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-md shadow-green-500/20 shrink-0">
                <Headphones className="w-5 h-5 text-white" />
              </div>
              <div className="text-left flex-1">
                <h3 className="text-sm font-bold text-green-200">Need Help?</h3>
                <p className="text-[11px] text-white/50">Tap to submit a support ticket</p>
              </div>
              <Send className="w-4 h-4 text-green-400/60" />
            </button>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="text-center py-6">
        <p className="text-white/30 text-xs">© MeriLive — All Rights Reserved</p>
      </div>

      {/* ======= Support Ticket Dialog ======= */}
      <Dialog open={showSupportDialog} onOpenChange={setShowSupportDialog}>
        <DialogContent className="bg-gradient-to-b from-[#1a0a2e]/98 via-[#0f0520]/98 to-[#0a0318]/98 backdrop-blur-3xl border border-white/[0.08] text-white max-w-[380px] rounded-2xl p-0 overflow-hidden shadow-2xl shadow-purple-900/40 [&>button]:hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-[2px] bg-gradient-to-r from-transparent via-green-500/60 to-transparent" />

          <AnimatePresence mode="wait">
            {submitted ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-8 flex flex-col items-center gap-4"
              >
                <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-400" />
                </div>
                <h3 className="text-lg font-bold text-white">Ticket Submitted!</h3>
                <p className="text-white/50 text-sm text-center">Our team will review and respond soon.</p>
              </motion.div>
            ) : (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-5 pt-6">
                <DialogHeader className="space-y-2 mb-5">
                  <DialogTitle className="text-white flex items-center gap-2.5 text-lg">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-600/10 border border-green-500/30 flex items-center justify-center">
                      <Headphones className="w-5 h-5 text-green-400" />
                    </div>
                    Support Ticket
                  </DialogTitle>
                  <DialogDescription className="text-white/50 text-sm">
                    Tell us about your issue and we'll help you
                  </DialogDescription>
                </DialogHeader>

                {/* Category Selection */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {TICKET_CATEGORIES.map((cat) => {
                    const isSelected = selectedCategory === cat.key;
                    return (
                      <button
                        key={cat.key}
                        onClick={() => setSelectedCategory(cat.key)}
                        className={cn(
                          "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all",
                          `bg-gradient-to-br ${cat.color}`,
                          isSelected ? cat.selectedBorder : cat.border,
                          isSelected && "ring-1 ring-white/10"
                        )}
                      >
                        <span className="text-xl">{cat.icon}</span>
                        <span className={cn("text-[10px] font-medium leading-tight text-center", isSelected ? "text-white" : "text-white/60")}>
                          {cat.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Subject */}
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject (e.g., Task reward not received)"
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/25 rounded-xl mb-3 text-sm h-11"
                  maxLength={100}
                />

                {/* Description */}
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe your issue in detail (optional)..."
                  className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-white/25 min-h-[80px] resize-none rounded-xl mb-4 text-sm"
                  maxLength={1000}
                />

                <div className="space-y-2.5">
                  <Button
                    onClick={handleSubmitTicket}
                    disabled={!selectedCategory || !subject.trim() || submitting}
                    className="w-full h-12 bg-gradient-to-r from-green-600 via-emerald-500 to-green-600 hover:from-green-500 hover:via-emerald-400 hover:to-green-500 text-white font-semibold rounded-xl shadow-lg shadow-green-500/20 transition-all disabled:opacity-40"
                  >
                    {submitting ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Submit Ticket
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => setShowSupportDialog(false)}
                    className="w-full h-10 text-white/50 hover:text-white/80 hover:bg-white/[0.04] rounded-xl text-sm"
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
    </div>
  );
};

export default GoogleLibraryOrderRules;
