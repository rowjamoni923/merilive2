import { memo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AdminStatCard — canonical Cloud White + 3D KPI tile.
 * Spec: docs/cloud-white-3d-admin-spec.md §3.3
 * No neon gradient, no colored glow, no sub-12px text.
 */
export interface AdminStatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  /** Accent hex/hsl string used for icon tint and left accent bar. */
  accent?: string;
  /** Percent trend vs previous period. */
  trend?: number;
  /** Optional subtitle rendered under the numeric value. */
  hint?: string;
  link?: string;
  className?: string;
}

export const AdminStatCard = memo(function AdminStatCard({
  title,
  value,
  icon: Icon,
  accent = "#2563eb",
  trend,
  hint,
  link,
  className,
}: AdminStatCardProps) {
  const body = (
    <div
      className={cn(
        "admin-card admin-card-hover relative overflow-hidden p-4 md:p-5",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1"
        style={{ background: accent }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide admin-ink-subtle">
            {title}
          </p>
          <p className="text-2xl md:text-3xl font-semibold tracking-tight tabular-nums admin-ink">
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {trend !== undefined && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
                trend >= 0
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-rose-50 text-rose-700 border-rose-200",
              )}
            >
              {trend >= 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {Math.abs(trend)}%
            </span>
          )}
          {hint && <p className="text-xs admin-ink-muted">{hint}</p>}
        </div>

        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl md:h-12 md:w-12"
          style={{
            background: `${accent}14`,
            border: `1px solid ${accent}33`,
          }}
        >
          <Icon className="h-5 w-5 md:h-6 md:w-6" style={{ color: accent }} />
        </div>
      </div>

      {link && (
        <div className="mt-3 flex items-center gap-1 text-xs font-medium admin-ink-muted transition-colors duration-150 group-hover:admin-ink">
          <span>View details</span>
          <ArrowRight className="h-3 w-3" />
        </div>
      )}
    </div>
  );

  if (!link) return body;
  return (
    <Link to={link} className="group block">
      {body}
    </Link>
  );
});

export default AdminStatCard;
