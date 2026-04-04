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

export default function AdminPageHeader({
  title,
  subtitle,
  icon: Icon,
  onRefresh,
  isRefreshing = false,
  actions,
  className
}: AdminPageHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between mb-6", className)}>
      <div className="flex items-center gap-3">
        {Icon && (
         <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/15">
            <Icon className="w-6 h-6 text-amber-400" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="gap-2"
          >
            <RefreshCw className={cn("w-4 h-4", isRefreshing && "animate-spin")} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
}
