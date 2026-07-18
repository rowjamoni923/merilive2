import type { ReactNode, ComponentType, SVGProps } from "react";
import { isValidElement, createElement } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AdminPageHeader — canonical page title block for admin routes.
 * Spec: docs/cloud-white-3d-admin-spec.md §3.3
 *
 * Backward compat: legacy pages pass `subtitle` and `icon={LucideIcon}` as a
 * component reference. Both are supported alongside the new `description` +
 * ReactNode icon API.
 */
export interface AdminPageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Legacy alias for `description`. */
  subtitle?: ReactNode;
  /** Lucide component OR a rendered ReactNode. */
  icon?: ReactNode | ComponentType<SVGProps<SVGSVGElement>>;
  actions?: ReactNode;
  meta?: ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}

function renderIcon(icon: AdminPageHeaderProps["icon"]) {
  if (!icon) return null;
  if (isValidElement(icon)) return icon;
  if (typeof icon === "function") {
    return createElement(icon as ComponentType<SVGProps<SVGSVGElement>>, {
      className: "h-5 w-5",
    });
  }
  return icon as ReactNode;
}

export function AdminPageHeader({
  title,
  description,
  subtitle,
  icon,
  actions,
  meta,
  onRefresh,
  isRefreshing,
  className,
}: AdminPageHeaderProps) {
  const desc = description ?? subtitle;
  return (
    <div
      className={cn(
        "admin-card flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:p-6",
        className,
      )}
    >
      <div className="flex items-start gap-3 min-w-0">
        {icon && (
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            {renderIcon(icon)}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight admin-ink truncate">
            {title}
          </h1>
          {desc && <p className="mt-1 text-sm admin-ink-muted">{desc}</p>}
          {meta && <div className="mt-2">{meta}</div>}
        </div>
      </div>
      {(actions || onRefresh) && (
        <div className="flex flex-wrap items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium admin-ink hover:bg-muted disabled:opacity-50 transition-colors duration-150"
            >
              <RefreshCw
                className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
              />
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </button>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}

export default AdminPageHeader;
