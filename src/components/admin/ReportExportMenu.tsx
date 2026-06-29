import { Download, FileText, FileCode2, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  exportReportPDF,
  exportReportHTML,
  exportReportCSV,
  type ReportRow,
  type ReportColumn,
  type ReportMeta,
} from "@/utils/reportExport";
import { toast } from "sonner";

interface Props {
  rows: ReportRow[];
  columns: ReportColumn[];
  meta: ReportMeta;
  /** Optional: small / sm / default sized trigger button */
  size?: "sm" | "default";
  /** Optional: button label override */
  label?: string;
  disabled?: boolean;
}

export const ReportExportMenu = ({
  rows,
  columns,
  meta,
  size = "sm",
  label = "Export",
  disabled,
}: Props) => {
  const handle = (fmt: "pdf" | "html" | "csv") => {
    try {
      if (fmt === "pdf") exportReportPDF(rows, columns, meta);
      else if (fmt === "html") exportReportHTML(rows, columns, meta);
      else exportReportCSV(rows, columns, meta);
      toast.success(`${fmt.toUpperCase()} export ready (${rows.length} rows)`);
    } catch (e) {
      console.error("[ReportExportMenu]", e);
      toast.error(`${fmt.toUpperCase()} export failed`);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={size}
          variant="outline"
          disabled={disabled || !columns.length}
          className="gap-2 bg-white border-slate-200 text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 shadow-sm"
        >
          <Download className="h-4 w-4" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 bg-white border-slate-200 shadow-lg">
        <DropdownMenuLabel className="text-slate-500 text-xs uppercase tracking-wide">
          Download report
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => handle("pdf")} className="gap-2 cursor-pointer">
          <FileText className="h-4 w-4 text-rose-600" />
          <span>PDF document</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handle("html")} className="gap-2 cursor-pointer">
          <FileCode2 className="h-4 w-4 text-blue-600" />
          <span>HTML (print-ready)</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handle("csv")} className="gap-2 cursor-pointer">
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
          <span>CSV spreadsheet</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ReportExportMenu;
