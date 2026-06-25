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
        // Use SECURITY DEFINER RPC — RLS on random_call_queue blocks direct
        // cross-user reads. The RPC returns only avatar_url (no user_id).
        const { data } = await supabase.rpc("get_random_pool_sample" as any, { _limit: 6 });
        if (!cancelled) {
          const urls = ((data as any[] | null) ?? [])
            .map((r) => r?.avatar_url)
            .filter(Boolean)
            .slice(0, 2);
          setAvatars(urls as string[]);
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
      whileTap={{ scale: 0.96 }}
      aria-label="Open Random Match"
      className={`fixed left-0 top-[28%] z-40 flex items-center gap-2.5 pl-1.5 pr-4 h-14
        rounded-r-full bg-gradient-to-r from-fuchsia-500 via-purple-500 to-pink-500
        text-white shadow-[0_12px_32px_-8px_rgba(168,85,247,0.55),0_4px_12px_-4px_rgba(236,72,153,0.4)]
        backdrop-blur-md border border-white/20 overflow-hidden ${className}`}
    >
      {/* Inner sheen */}
      <span aria-hidden className="pointer-events-none absolute inset-0 rounded-r-full bg-gradient-to-b from-white/25 via-transparent to-transparent" />
      {/* Soft pulsing halo — kept inside so it never bleeds off the viewport edge */}
      <span aria-hidden className="pointer-events-none absolute -right-1 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-pink-400/40 blur-xl animate-pulse" />

      {/* Avatar stack */}
      <span className="relative flex -space-x-2.5 shrink-0">
        {avatars[0] ? (
          <img src={avatars[0]} alt="" className="w-10 h-10 rounded-full border-2 border-white object-cover shadow" />
        ) : (
          <span className="w-10 h-10 rounded-full border-2 border-white bg-gradient-to-br from-fuchsia-300 to-pink-300 grid place-items-center text-[11px] font-extrabold shadow">F</span>
        )}
        <span className="w-8 h-8 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 border-2 border-white grid place-items-center shadow">
          <PhoneCall className="w-3.5 h-3.5 text-white" />
        </span>
      </span>

      <span className="relative flex flex-col items-start leading-tight">
        <span className="text-[13px] font-extrabold tracking-tight drop-shadow-sm">Random Chat</span>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/90">Free</span>
      </span>
    </motion.button>
  );
}
