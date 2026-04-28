import { ReactNode } from "react";
import { RefreshCw, LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AdminPageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  actions?: ReactNode;
  className?: string;
}

/**
 * AdminPageHeader — Pkg3 polished:
 *  - Luxurious gradient icon tile with subtle glow ring
 *  - Tight semantic title + subtitle hierarchy
 *  - Fade-in animation on mount for smooth page transitions
 *  - Wrap-friendly action area on small viewports
 */
export default function AdminPageHeader({
  title,
  subtitle,
  icon: Icon,
  onRefresh,
  isRefreshing = false,
  actions,
  className,
}: AdminPageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6 animate-fade-in",
        className,
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        {Icon && (
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-amber-400/30 via-fuchsia-500/20 to-violet-500/30 blur-md opacity-70" />
            <div className="relative p-2.5 rounded-xl bg-gradient-to-br from-amber-500/15 via-fuchsia-500/10 to-violet-500/15 border border-amber-400/20 shadow-[0_8px_24px_-12px_hsl(var(--admin-accent)/0.55)]">
              <Icon className="w-6 h-6 text-amber-400" />
            </div>
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">{title}</h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="gap-2 border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-amber-400/30 transition-all"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
            <span className="hidden sm:inline">{isRefreshing ? "Refreshing..." : "Refresh"}</span>
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
}
