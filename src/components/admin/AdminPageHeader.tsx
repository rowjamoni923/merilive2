import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * AdminPageHeader — canonical page title block for admin routes.
 * Spec: docs/cloud-white-3d-admin-spec.md §3.3
 */
export interface AdminPageHeaderProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}

export function AdminPageHeader({
  title,
  description,
  icon,
  actions,
  meta,
  className,
}: AdminPageHeaderProps) {
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
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight admin-ink truncate">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm admin-ink-muted">{description}</p>
          )}
          {meta && <div className="mt-2">{meta}</div>}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

export default AdminPageHeader;
