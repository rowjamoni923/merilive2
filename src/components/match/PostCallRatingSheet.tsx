import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Flag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Post-call rating sheet (G5, Chamet-tier).
 * Shown after random-match calls that lasted >= 10s. Rater chooses 1-5
 * stars + optional tag chips. Trigger updates ratee profile aggregate.
 * Auto-dismisses after 8s of inactivity.
 */
interface Props {
  open: boolean;
  sessionId: string | null;
  rateeName?: string;
  onClose: () => void;
}

const POSITIVE_TAGS = [
  { id: "friendly", label: "Friendly" },
  { id: "clear_video", label: "Clear video" },
  { id: "fun", label: "Fun" },
  { id: "polite", label: "Polite" },
];

const NEGATIVE_TAGS = [
  { id: "boring", label: "Boring" },
  { id: "no_video", label: "No video" },
  { id: "rude", label: "Rude" },
  { id: "inappropriate", label: "Inappropriate" },
];

export default function PostCallRatingSheet({ open, sessionId, rateeName, onClose }: Props) {
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (open) return;
    setStars((prev) => (prev === 0 ? prev : 0));
    setTags((prev) => (prev.length === 0 ? prev : []));
    setSubmitting(false);
  }, [open]);

  // Auto-dismiss after 8s of inactivity. Resets whenever the user interacts
  // with the sheet (stars or tags) so we never close mid-decision.
  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => onCloseRef.current(), 8000);
    return () => window.clearTimeout(t);
  }, [open, stars, tags]);

  const submit = async () => {
    if (!sessionId || !stars || submitting) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("random-call-rate", {
        body: { session_id: sessionId, stars, tags },
      });
      if (error) throw error;
      if ((data as any)?.ok) {
        toast.success("Thanks for the feedback!");
      }
    } catch (_) {
      toast.error("Could not submit rating.");
    } finally {
      setSubmitting(false);
      onClose();
    }
  };

  const report = async () => {
    if (!sessionId) return;
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u?.user) return;
      await supabase.rpc("report_random_match" as any, {
        p_session_id: sessionId,
        p_reporter_id: u.user.id,
        p_reason: "post_call_report",
        p_detail: null,
      });
      toast.success("Report submitted.");
    } catch (_) {
      toast.error("Could not submit report.");
    } finally {
      onClose();
    }
  };

  const availableTags = stars >= 4 ? POSITIVE_TAGS : stars > 0 ? NEGATIVE_TAGS : [];

  return (
    <AnimatePresence>
      {open && sessionId && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", damping: 24 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-white/10 text-white p-5 shadow-2xl pb-[max(env(safe-area-inset-bottom),20px)]"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold">Rate your match{rateeName ? ` with ${rateeName}` : ""}</h3>
              <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10" aria-label="Close">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Stars */}
            <div className="flex justify-center gap-2 mb-4">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setStars(n)}
                  className="p-1.5 transition-transform active:scale-90"
                  aria-label={`${n} stars`}
                >
                  <Star
                    className={`w-9 h-9 ${n <= stars ? "fill-amber-400 text-amber-400" : "text-white/30"}`}
                  />
                </button>
              ))}
            </div>

            {/* Tags */}
            {availableTags.length > 0 && (
              <div className="flex flex-wrap gap-2 justify-center mb-4">
                {availableTags.map((t) => {
                  const active = tags.includes(t.id);
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTags((prev) => active ? prev.filter((x) => x !== t.id) : [...prev, t.id])}
                      className={`px-3 h-8 rounded-full text-xs font-medium border transition
                        ${active ? "bg-white text-slate-900 border-white"
                          : "bg-white/5 text-white/80 border-white/15 hover:bg-white/10"}`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* CTA */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={report}
                className="flex-1 h-11 rounded-xl border-rose-400/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
              >
                <Flag className="w-4 h-4 mr-1.5" /> Report
              </Button>
              <Button
                onClick={submit}
                disabled={!stars || submitting}
                className="flex-1 h-11 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 font-bold disabled:opacity-50"
              >
                {submitting ? "Sending…" : "Submit"}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
