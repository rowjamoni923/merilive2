import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getAdminErrorLog,
  clearAdminErrorLog,
  ADMIN_ERROR_LOG_EVENT,
  type AdminErrorEntry,
} from "@/utils/adminErrorLog";
import { format } from "date-fns";

export default function AdminErrorLogPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<AdminErrorEntry[]>(getAdminErrorLog());

  const refresh = () => setEntries(getAdminErrorLog());

  useEffect(() => {
    // Push-only: re-render when a new admin error is recorded.
    window.addEventListener(ADMIN_ERROR_LOG_EVENT, refresh);
    return () => window.removeEventListener(ADMIN_ERROR_LOG_EVENT, refresh);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a14] admin-content">
      <div className="bg-gradient-to-r from-rose-700 via-red-600 to-orange-600 p-6 rounded-b-3xl shadow-lg">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => navigate("/admin")}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-white" />
            <div>
              <h1 className="font-bold text-xl text-white">Admin Error Log</h1>
              <p className="text-white/80 text-sm">
                Last {entries.length} failed admin queries / RPC / edge calls
              </p>
            </div>
          </div>
          <div className="ml-auto flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={refresh}
            >
              <RefreshCw className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20"
              onClick={() => {
                clearAdminErrorLog();
                refresh();
              }}
            >
              <Trash2 className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {entries.length === 0 ? (
          <div className="admin-empty-state">
            ✅ No admin errors recorded yet.
          </div>
        ) : (
          entries.map((e, i) => (
            <Card key={i} className="bg-[#13131f] border-white/5">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="destructive" className="uppercase text-[10px]">
                    {e.kind}
                  </Badge>
                  {e.status ? (
                    <Badge variant="outline" className="text-amber-400 border-amber-500/40">
                      {e.status}
                    </Badge>
                  ) : null}
                  <span className="text-xs text-white/50 ml-auto">
                    {format(new Date(e.ts), "HH:mm:ss")}
                  </span>
                </div>
                <div className="text-sm font-mono text-white/90 break-all">
                  {e.label}
                </div>
                <div className="text-xs text-rose-300 whitespace-pre-wrap break-words">
                  {e.message}
                </div>
                {e.detail ? (
                  <details className="text-[11px] text-white/40">
                    <summary className="cursor-pointer">raw</summary>
                    <pre className="whitespace-pre-wrap break-all mt-1">
                      {e.detail}
                    </pre>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
