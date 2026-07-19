import { useState, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckSquare, X, Trash2, CheckCircle, XCircle, Download, MoreHorizontal, Square } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface BulkAction {
  label: string;
  icon: React.ElementType;
  onClick: (selectedIds: string[]) => void;
  variant?: "default" | "destructive" | "success" | "warning";
  requireConfirm?: boolean;
}

interface AdminBulkActionsProps {
  selectedIds: string[];
  totalItems: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  actions: BulkAction[];
  onExportCSV?: () => void;
  className?: string;
}

const variantStyles: Record<string, string> = {
  default: "bg-slate-700 hover:bg-slate-600 text-white",
  destructive: "bg-red-600/80 hover:bg-red-600 text-white",
  success: "bg-emerald-600/80 hover:bg-emerald-600 text-white",
  warning: "bg-amber-600/80 hover:bg-amber-600 text-white",
};

export const AdminBulkActions = memo(({
  selectedIds,
  totalItems,
  onSelectAll,
  onClearSelection,
  actions,
  onExportCSV,
  className,
}: AdminBulkActionsProps) => {
  const [confirmAction, setConfirmAction] = useState<BulkAction | null>(null);
  const count = selectedIds.length;

  const handleAction = useCallback((action: BulkAction) => {
    if (action.requireConfirm) {
      setConfirmAction(action);
    } else {
      action.onClick(selectedIds);
    }
  }, [selectedIds]);

  const confirmAndRun = useCallback(() => {
    if (confirmAction) {
      confirmAction.onClick(selectedIds);
      setConfirmAction(null);
    }
  }, [confirmAction, selectedIds]);

  return (
    <AnimatePresence>
      {count > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className={cn(
            "fixed bottom-6 left-1/2 -translate-x-1/2 z-50",
            "bg-slate-900/95 backdrop-blur-2xl border border-purple-500/30",
            "rounded-2xl shadow-2xl shadow-purple-500/10 px-5 py-3",
            "flex items-center gap-3 max-w-[95vw]",
            className
          )}
        >
          {/* Selection Info */}
          <div className="flex items-center gap-2 pr-3 border-r border-slate-700">
            <CheckSquare className="w-4 h-4 text-purple-400" />
            <Badge className="bg-purple-600 text-white border-0 font-bold text-xs px-2.5">
              {count}
            </Badge>
            <span className="text-xs text-slate-400 font-semibold hidden sm:inline">selected</span>
          </div>

          {/* Select All / Clear */}
          <div className="flex items-center gap-1.5">
            {count < totalItems && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSelectAll}
                className="h-8 px-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-700/50 font-bold gap-1.5"
              >
                <Square className="w-3.5 h-3.5" />
                All ({totalItems})
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearSelection}
              className="h-8 px-2.5 text-xs text-slate-400 hover:text-white hover:bg-slate-700/50 font-bold gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </Button>
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-slate-700" />

          {/* Primary Actions (first 2) */}
          {actions.slice(0, 2).map((action) => (
            <Button
              key={action.label}
              size="sm"
              onClick={() => handleAction(action)}
              className={cn(
                "h-8 px-3 text-xs font-bold gap-1.5 rounded-lg transition-all",
                variantStyles[action.variant || "default"]
              )}
            >
              <action.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{action.label}</span>
            </Button>
          ))}

          {/* More Actions Dropdown */}
          {(actions.length > 2 || onExportCSV) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-slate-400 hover:text-white hover:bg-slate-700/50"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="bg-slate-800 border-slate-700 text-white min-w-[180px]"
              >
                {actions.slice(2).map((action) => (
                  <DropdownMenuItem
                    key={action.label}
                    onClick={() => handleAction(action)}
                    className="text-xs font-semibold gap-2 hover:bg-slate-700"
                  >
                    <action.icon className="w-3.5 h-3.5" />
                    {action.label}
                  </DropdownMenuItem>
                ))}
                {onExportCSV && (
                  <>
                    <DropdownMenuSeparator className="bg-slate-700" />
                    <DropdownMenuItem
                      onClick={onExportCSV}
                      className="text-xs font-semibold gap-2 hover:bg-slate-700"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export Selected (CSV)
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Confirm Dialog */}
          <AnimatePresence>
            {confirmAction && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute -top-16 left-1/2 -translate-x-1/2 bg-slate-800 border border-red-500/40 rounded-xl px-4 py-2.5 flex items-center gap-3 shadow-2xl"
              >
                <span className="text-xs text-red-300 font-bold">
                  {confirmAction.label} {count} items?
                </span>
                <Button
                  size="sm"
                  onClick={confirmAndRun}
                  className="h-7 px-3 text-xs bg-red-600 hover:bg-red-500 text-white font-bold"
                >
                  Confirm
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirmAction(null)}
                  className="h-7 px-2 text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

AdminBulkActions.displayName = "AdminBulkActions";

// Hook for managing bulk selection state
export function useBulkSelection<T extends { id: string }>(items: T[]) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleItem = useCallback((id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(items.map(item => item.id));
  }, [items]);

  const clearSelection = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const isSelected = useCallback((id: string) => selectedIds.includes(id), [selectedIds]);

  return {
    selectedIds,
    toggleItem,
    selectAll,
    clearSelection,
    isSelected,
    selectedCount: selectedIds.length,
  };
}

// CSV Export utility
export function exportToCSV(data: Record<string, any>[], filename: string) {
  if (!data.length) return;

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(","),
    ...data.map(row =>
      headers.map(h => {
        const val = row[h];
        const str = val === null || val === undefined ? "" : String(val);
        return str.includes(",") || str.includes('"') || str.includes("\n")
          ? `"${str.replace(/"/g, '""')}"`
          : str;
      }).join(",")
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
