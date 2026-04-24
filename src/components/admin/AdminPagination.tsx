/**
 * AdminPagination — lightweight pagination control used across admin tables.
 * Pairs with useAdminPagination hook.
 */
import React, { memo } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdminPaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  refreshing?: boolean;
  onPageChange: (page: number) => void;
  className?: string;
}

const AdminPagination: React.FC<AdminPaginationProps> = ({
  page,
  totalPages,
  totalCount,
  pageSize,
  refreshing,
  onPageChange,
  className,
}) => {
  if (totalCount === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount);

  return (
    <div className={cn(
      'flex items-center justify-between gap-2 px-3 py-2 text-xs text-slate-400',
      className
    )}>
      <div className="flex items-center gap-2">
        <span>
          {from.toLocaleString()}–{to.toLocaleString()} of {totalCount.toLocaleString()}
        </span>
        {refreshing && <Loader2 className="w-3 h-3 animate-spin text-slate-500" />}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-xs px-2 tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

export default memo(AdminPagination);
