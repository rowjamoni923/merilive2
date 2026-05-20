/**
 * AdminRealtimeSyncIndicator
 *
 * Tiny topbar pill showing real-time admin broadcast health:
 *  - Green dot + "Live" = channel SUBSCRIBED + last event recent
 *  - Amber  = channel SUBSCRIBED but no events for > 2 min (idle, still healthy)
 *  - Red    = channel error / closed (broadcast unreachable)
 *
 * Hover/click → popover with last topic, last event type, and exact timestamp
 * + age. Listens to the `admin-table-update` window event dispatched by
 * `useAdminBroadcastSync` (Pkg37) — zero extra subscriptions.
 */
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Activity, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "connecting" | "live" | "idle" | "error";

interface LastEvent {
  table: string;
  eventType: string;
  at: number; // ms epoch
}

function formatAge(ms: number): string {
  if (ms < 1000) return "just now";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function AdminRealtimeSyncIndicator() {
  const [status, setStatus] = useState<Status>("connecting");
  const [last, setLast] = useState<LastEvent | null>(null);
  const [, force] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // 1. Listen to admin-table-update — every successful broadcast fires this.
  useEffect(() => {
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail?.table) return;
      setLast({
        table: detail.table,
        eventType: detail.eventType ?? "UPDATE",
        at: Date.now(),
      });
      setStatus("live");
    };
    window.addEventListener("admin-table-update", onEvent);
    return () => window.removeEventListener("admin-table-update", onEvent);
  }, []);

  // 2. Independent presence channel — proves the realtime websocket itself is
  //    actually connected (not just that the broadcast hook mounted).
  useEffect(() => {
    const ch = supabase
      .channel("admin-sync-indicator-presence")
      .subscribe((s) => {
        if (s === "SUBSCRIBED") {
          setStatus((prev) => (prev === "error" ? "live" : prev === "connecting" ? "live" : prev));
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") {
          setStatus("error");
        }
      });
    channelRef.current = ch;
    return () => {
      try {
        supabase.removeChannel(ch);
      } catch {}
    };
  }, []);

  // 3. Tick every 10s to recompute idle state + re-render "age" label.
  useEffect(() => {
    const t = setInterval(() => {
      force((n) => n + 1);
      if (status === "live" && last && Date.now() - last.at > 2 * 60 * 1000) {
        setStatus("idle");
      }
    }, 10_000);
    return () => clearInterval(t);
  }, [status, last]);

  const meta = (() => {
    switch (status) {
      case "live":
        return {
          dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]",
          ring: "ring-emerald-400/30",
          icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />,
          label: "Live",
          textCls: "text-emerald-300",
        };
      case "idle":
        return {
          dot: "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.5)]",
          ring: "ring-amber-400/30",
          icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />,
          label: "Idle",
          textCls: "text-amber-300",
        };
      case "error":
        return {
          dot: "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.7)] animate-pulse",
          ring: "ring-rose-500/40",
          icon: <XCircle className="w-3.5 h-3.5 text-rose-400" />,
          label: "Offline",
          textCls: "text-rose-300",
        };
      default:
        return {
          dot: "bg-slate-500 animate-pulse",
          ring: "ring-slate-500/20",
          icon: <Activity className="w-3.5 h-3.5 text-slate-400" />,
          label: "Connecting…",
          textCls: "text-slate-400",
        };
    }
  })();

  const ageLabel = last ? formatAge(Date.now() - last.at) : "no events yet";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={`Realtime sync: ${meta.label} • last ${ageLabel}`}
          className={cn(
            "hidden md:inline-flex items-center gap-1.5 h-9 px-2.5 rounded-xl",
            "bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.06]",
            "ring-1 transition-colors",
            meta.ring
          )}
        >
          <span className={cn("w-1.5 h-1.5 rounded-full", meta.dot)} />
          <span className={cn("text-[11px] font-semibold tracking-wide", meta.textCls)}>
            {meta.label}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 p-0 bg-[#0a0a14]/95 backdrop-blur-2xl border border-white/[0.06] rounded-xl shadow-2xl"
      >
        <div className="p-3 border-b border-white/[0.06] flex items-center gap-2">
          {meta.icon}
          <div className="flex-1">
            <div className={cn("text-xs font-bold", meta.textCls)}>
              Realtime sync — {meta.label}
            </div>
            <div className="text-[10px] text-slate-500">
              admin_broadcast channel
            </div>
          </div>
        </div>
        <div className="p-3 space-y-2 text-[11px]">
          <Row label="Status" value={meta.label} valueCls={meta.textCls} />
          <Row
            label="Last event"
            value={last ? `${last.table} · ${last.eventType}` : "—"}
            valueCls="text-white"
            mono
          />
          <Row
            label="Received"
            value={
              last
                ? `${new Date(last.at).toLocaleTimeString()} (${ageLabel})`
                : "no events received yet"
            }
            valueCls="text-slate-300"
            mono
          />
          <Row
            label="Broadcast"
            value={
              status === "error"
                ? "FAILED — websocket closed"
                : status === "connecting"
                ? "connecting…"
                : "delivered"
            }
            valueCls={
              status === "error"
                ? "text-rose-300"
                : status === "connecting"
                ? "text-slate-400"
                : "text-emerald-300"
            }
          />
        </div>
        <div className="px-3 py-2 border-t border-white/[0.06] text-[10px] text-slate-500 leading-snug">
          {status === "error"
            ? "Broadcasts not reaching this client. Save/delete may not auto-refresh — use the manual Refresh button."
            : status === "idle"
            ? "Channel healthy, no admin activity in the last 2 minutes."
            : "Every admin save / delete / status change pushes here in under 1 second."}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Row({
  label,
  value,
  valueCls,
  mono,
}: {
  label: string;
  value: string;
  valueCls?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-slate-500 uppercase tracking-[0.1em] text-[9px] pt-0.5">
        {label}
      </span>
      <span
        className={cn(
          "text-right break-all",
          mono && "font-mono text-[10.5px]",
          valueCls ?? "text-white"
        )}
      >
        {value}
      </span>
    </div>
  );
}
