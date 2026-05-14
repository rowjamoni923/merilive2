import { forwardRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ShieldAlert, AlertTriangle, MessageSquareWarning, Skull, Bug, UserX, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const REPORT_CATEGORIES = [
  {
    key: "sexual_content",
    label: "Sexual Content",
    icon: ShieldAlert,
    gradient: "from-pink-500/20 via-rose-500/10 to-pink-600/5",
    borderColor: "border-pink-500/30",
    selectedGradient: "from-pink-500/30 via-rose-500/20 to-pink-600/15",
    selectedBorder: "border-pink-400/60",
    iconColor: "text-pink-400",
    glowColor: "shadow-pink-500/20",
  },
  {
    key: "harassment_bullying",
    label: "Harassment / Bullying",
    icon: MessageSquareWarning,
    gradient: "from-red-500/20 via-red-500/10 to-red-600/5",
    borderColor: "border-red-500/30",
    selectedGradient: "from-red-500/30 via-red-500/20 to-red-600/15",
    selectedBorder: "border-red-400/60",
    iconColor: "text-red-400",
    glowColor: "shadow-red-500/20",
  },
  {
    key: "hate_speech",
    label: "Hate Speech",
    icon: AlertTriangle,
    gradient: "from-orange-500/20 via-amber-500/10 to-orange-600/5",
    borderColor: "border-orange-500/30",
    selectedGradient: "from-orange-500/30 via-amber-500/20 to-orange-600/15",
    selectedBorder: "border-orange-400/60",
    iconColor: "text-orange-400",
    glowColor: "shadow-orange-500/20",
  },
  {
    key: "violence_threats",
    label: "Violence / Threats",
    icon: Skull,
    gradient: "from-red-600/20 via-rose-600/10 to-red-700/5",
    borderColor: "border-red-600/30",
    selectedGradient: "from-red-600/30 via-rose-600/20 to-red-700/15",
    selectedBorder: "border-red-500/60",
    iconColor: "text-red-500",
    glowColor: "shadow-red-600/20",
  },
  {
    key: "spam_scam",
    label: "Spam / Scam",
    icon: Bug,
    gradient: "from-amber-500/20 via-yellow-500/10 to-amber-600/5",
    borderColor: "border-amber-500/30",
    selectedGradient: "from-amber-500/30 via-yellow-500/20 to-amber-600/15",
    selectedBorder: "border-amber-400/60",
    iconColor: "text-amber-400",
    glowColor: "shadow-amber-500/20",
  },
  {
    key: "impersonation",
    label: "Impersonation",
    icon: UserX,
    gradient: "from-purple-500/20 via-violet-500/10 to-purple-600/5",
    borderColor: "border-purple-500/30",
    selectedGradient: "from-purple-500/30 via-violet-500/20 to-purple-600/15",
    selectedBorder: "border-purple-400/60",
    iconColor: "text-purple-400",
    glowColor: "shadow-purple-500/20",
  },
] as const;

interface ReportUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportedUserId: string;
  reporterUserId: string;
  contextType?: "chat" | "profile" | "stream" | "room" | "general";
  contextId?: string;
}

export const ReportUserDialog = forwardRef<HTMLDivElement, ReportUserDialogProps>(function ReportUserDialog({
  open,
  onOpenChange,
  reportedUserId,
  reporterUserId,
  contextType = "general",
  contextId,
}, ref) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedCategory) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("user_reports").insert({
        reporter_id: reporterUserId,
        reported_user_id: reportedUserId,
        report_category: selectedCategory,
        description: description.trim() || null,
        context_type: contextType,
        context_id: contextId || null,
      });
      if (error) throw error;
      toast.success("Report submitted successfully");
      setSelectedCategory(null);
      setDescription("");
      onOpenChange(false);
    } catch (error: any) {
      console.error("Report error:", error);
      toast.error("Failed to submit report");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent ref={ref} className="bg-gradient-to-b from-[#1a0a2e]/98 via-[#0f0520]/98 to-[#0a0318]/98 backdrop-blur-3xl border border-white/[0.08] text-white max-w-[360px] rounded-2xl p-0 overflow-hidden shadow-2xl shadow-purple-900/40 [&>button]:hidden">
        
        {/* Decorative top glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-[2px] bg-gradient-to-r from-transparent via-red-500/60 to-transparent" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-8 bg-red-500/10 blur-2xl" />
        
        <div className="p-5 pt-6">
          <DialogHeader className="space-y-2 mb-5">
            <DialogTitle className="text-white flex items-center gap-2.5 text-lg">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/30 flex items-center justify-center shadow-lg shadow-red-500/10">
                <ShieldAlert className="w-5 h-5 text-red-400" />
              </div>
              Report User
            </DialogTitle>
            <DialogDescription className="text-slate-500 text-sm">
              Select a reason for reporting this user
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-2.5 mb-5">
            {REPORT_CATEGORIES.map((cat, index) => {
              const Icon = cat.icon;
              const isSelected = selectedCategory === cat.key;
              return (
                <motion.button
                  key={cat.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.25 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSelectedCategory(cat.key)}
                  className={cn(
                    "relative flex items-center gap-2.5 p-3.5 rounded-xl border text-left transition-all duration-200",
                    "bg-gradient-to-br backdrop-blur-sm",
                    isSelected ? cat.selectedGradient : cat.gradient,
                    isSelected ? cat.selectedBorder : cat.borderColor,
                    isSelected && `shadow-lg ${cat.glowColor}`,
                  )}
                >
                  {/* Selected check indicator */}
                  <AnimatePresence>
                    {isSelected && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shadow-md shadow-green-500/30"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  <div className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-all",
                    isSelected ? "bg-white/[0.12]" : "bg-white/[0.06]"
                  )}>
                    <Icon className={cn("w-4 h-4", cat.iconColor)} />
                  </div>
                  <span className={cn(
                    "font-medium text-xs leading-tight transition-colors",
                    isSelected ? "text-white" : "text-slate-600"
                  )}>
                    {cat.label}
                  </span>
                </motion.button>
              );
            })}
          </div>

          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Additional details (optional)..."
            className="bg-white/[0.04] border-white/[0.08] text-white placeholder:text-slate-400 min-h-[80px] resize-none rounded-xl focus:border-purple-500/40 focus:ring-1 focus:ring-purple-500/20 transition-all mb-4 text-sm"
          />

          <div className="space-y-2.5">
            <Button
              onClick={handleSubmit}
              disabled={!selectedCategory || submitting}
              className="w-full h-12 bg-gradient-to-r from-red-600 via-rose-500 to-red-600 hover:from-red-500 hover:via-rose-400 hover:to-red-500 text-white font-semibold rounded-xl shadow-lg shadow-red-500/20 transition-all disabled:opacity-40 disabled:shadow-none"
            >
              {submitting ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-amber-200/60 border-t-white rounded-full"
                />
              ) : "Submit Report"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="w-full h-10 text-slate-500 hover:text-slate-700 hover:bg-white/[0.04] rounded-xl text-sm"
            >
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
});
