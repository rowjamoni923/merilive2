import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle, Users, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useManagedBanner } from "@/hooks/useManagedBanner";

interface Props {
  agencyId: string;
}

type ActivationRow = {
  activation_status: "pending" | "active" | "closed";
  activation_deadline: string | null;
  active_host_count: number;
};

const REQUIRED_HOSTS = 10;

export default function AgencyActivationBanner({ agencyId }: Props) {
  const [row, setRow] = useState<ActivationRow | null>(null);
  const warningBanner = useManagedBanner("agency_activation_warning", {
    title: "Activation Required",
    body_md: `Activate **${REQUIRED_HOSTS} hosts** within 30 days of creation, or the agency will be automatically closed.`,
  });
  const closedBanner = useManagedBanner("agency_closed_notice", {
    title: "Agency Closed",
    body_md: `This agency did not activate ${REQUIRED_HOSTS} hosts within the 30-day window and has been automatically closed. Please contact support if you believe this is a mistake.`,
  });


  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const { data } = await supabase
        .from("agencies")
        .select("activation_status, activation_deadline, active_host_count")
        .eq("id", agencyId)
        .maybeSingle();
      if (mounted && data) setRow(data as ActivationRow);
    };
    load();

    const channel = supabase
      .channel(`agency-activation-${agencyId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "agencies", filter: `id=eq.${agencyId}` },
        (payload) => {
          const n = payload.new as ActivationRow;
          setRow({
            activation_status: n.activation_status,
            activation_deadline: n.activation_deadline,
            active_host_count: n.active_host_count,
          });
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [agencyId]);

  if (!row) return null;
  if (row.activation_status === "active") return null; // Requirement met — no banner

  const count = Math.min(row.active_host_count ?? 0, REQUIRED_HOSTS);
  const remaining = Math.max(0, REQUIRED_HOSTS - count);
  const deadline = row.activation_deadline ? new Date(row.activation_deadline) : null;
  const now = Date.now();
  const msLeft = deadline ? deadline.getTime() - now : 0;
  const daysLeft = Math.max(0, Math.ceil(msLeft / 86_400_000));
  const isClosed = row.activation_status === "closed" || (deadline && msLeft <= 0 && remaining > 0);
  const pct = Math.round((count / REQUIRED_HOSTS) * 100);

  if (isClosed) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-gradient-to-br from-red-500/10 to-red-700/10 p-4 text-white shadow-lg">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-red-500/20 p-2">
            <XCircle className="h-5 w-5 text-red-400" />
          </div>
          <div className="flex-1">
            <div className="text-sm font-semibold text-red-300">Agency Closed</div>
            <p className="mt-1 text-xs text-white/80 leading-relaxed">
              This agency did not activate {REQUIRED_HOSTS} hosts within the 30-day window and has been
              automatically closed. Please contact support if you believe this is a mistake.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-red-500/10 p-4 text-white shadow-lg">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-amber-500/20 p-2">
          <AlertTriangle className="h-5 w-5 text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold text-amber-200">Activation Required</div>
            <div className="flex items-center gap-1 text-[11px] text-amber-200/90">
              <Clock className="h-3 w-3" />
              {daysLeft} day{daysLeft === 1 ? "" : "s"} left
            </div>
          </div>
          <p className="mt-1 text-xs text-white/80 leading-relaxed">
            Activate <span className="font-semibold text-white">{REQUIRED_HOSTS} hosts</span> within
            30 days of creation, or the agency will be automatically closed.
          </p>

          {/* Progress */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-[11px] text-white/70 mb-1">
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> Active hosts
              </span>
              <span className="font-semibold text-white">
                {count}/{REQUIRED_HOSTS}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-red-400 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {remaining > 0 ? (
              <div className="mt-2 text-[11px] text-white/70">
                Need <span className="font-semibold text-amber-300">{remaining}</span> more active host
                {remaining === 1 ? "" : "s"} to permanently unlock this agency.
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-1 text-[11px] text-emerald-300">
                <CheckCircle2 className="h-3 w-3" /> Target reached — finalizing activation…
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
