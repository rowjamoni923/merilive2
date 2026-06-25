import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PhoneCall } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Chamet-style floating "Random Chat — Free" pill.
 * Docks to the left edge of the Home/Discover feed, ~28% from top.
 * Shows a stacked pair of live host avatars + an animated halo, and routes
 * to /match-call on tap. Pure presentation; no business logic.
 */
export default function FloatingRandomMatchPill({
  className = "",
}: { className?: string }) {
  const navigate = useNavigate();
  const [avatars, setAvatars] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Pull two random online host avatars for the pill (visual only)
        const { data } = await supabase
          .from("random_call_queue" as any)
          .select("user_id")
          .eq("role", "host")
          .eq("status", "waiting")
          .limit(8);
        const ids = (data as any[] | null)?.map((r) => r.user_id) ?? [];
        if (ids.length > 0) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("avatar_url")
            .in("id", ids.slice(0, 6));
          if (!cancelled) {
            const urls = (prof ?? [])
              .map((p: any) => p?.avatar_url)
              .filter(Boolean)
              .slice(0, 2);
            setAvatars(urls as string[]);
          }
        }
      } catch (_) { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <motion.button
      onClick={() => navigate("/match-call")}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      whileTap={{ scale: 0.95 }}
      aria-label="Open Random Match"
      className={`fixed left-0 top-[28%] z-40 flex items-center gap-2 pl-2 pr-3.5 h-12
        rounded-r-full bg-gradient-to-r from-fuchsia-500/95 via-purple-500/95 to-pink-500/95
        text-white shadow-[0_8px_28px_-6px_rgba(168,85,247,0.6)] backdrop-blur-md
        border border-white/15 ${className}`}
    >
      {/* Halo */}
      <span className="absolute -inset-0.5 -z-10 rounded-r-full bg-gradient-to-r from-fuchsia-400/40 via-purple-400/40 to-pink-400/40 blur-md animate-pulse" />
      {/* Avatar stack */}
      <span className="relative flex -space-x-2">
        {avatars[0] ? (
          <img src={avatars[0]} alt="" className="w-9 h-9 rounded-full border-2 border-white/80 object-cover" />
        ) : (
          <span className="w-9 h-9 rounded-full border-2 border-white/80 bg-gradient-to-br from-fuchsia-300 to-pink-300 grid place-items-center text-[10px] font-bold">F</span>
        )}
        <span className="w-7 h-7 rounded-full bg-rose-500 border-2 border-white/80 grid place-items-center shrink-0">
          <PhoneCall className="w-3.5 h-3.5 text-white" />
        </span>
      </span>
      <span className="flex flex-col items-start leading-tight pr-0.5">
        <span className="text-[12px] font-bold tracking-tight">Random Chat</span>
        <span className="text-[10px] uppercase tracking-wider opacity-90">Free</span>
      </span>
    </motion.button>
  );
}
