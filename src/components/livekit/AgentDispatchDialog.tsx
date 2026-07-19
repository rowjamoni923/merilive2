/**
 * Pkg117 UI — Agent Dispatch Dialog.
 *
 * Hosts or admins dispatch a registered LiveKit Agent worker into the
 * current room. Lists active dispatches and allows cancellation.
 *
 * Backend: livekit-agent edge function (Pkg117).
 * Kill-switch: app_settings.livekit_signaling_enabled.agent
 */
import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Bot,
  Loader2,
  Send,
  XCircle,
  RefreshCw,
  Radio,
} from "lucide-react";
import {
  dispatchAgent,
  cancelAgentDispatch,
  listAgentDispatches,
  type AgentScope,
} from "@/lib/livekitAgent";
import { isLiveKitEnabled } from "@/lib/livekitSignaling";

interface AgentDispatch {
  dispatchId: string;
  agentName: string;
  status: string;
  createdAt?: string;
}

interface AgentDispatchDialogProps {
  open: boolean;
  onClose: () => void;
  roomName: string;
  scope?: AgentScope;
}

export function AgentDispatchDialog({
  open,
  onClose,
  roomName,
  scope = "live",
}: AgentDispatchDialogProps) {
  const [agentName, setAgentName] = useState("");
  const [busy, setBusy] = useState(false);
  const [dispatches, setDispatches] = useState<AgentDispatch[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [killSwitchOn, setKillSwitchOn] = useState<boolean | null>(null);

  const fetchDispatches = useCallback(async () => {
    if (!roomName) return;
    setLoadingList(true);
    try {
      const res = await listAgentDispatches(roomName);
      if (res.ok && Array.isArray(res.dispatches)) {
        setDispatches(res.dispatches as AgentDispatch[]);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingList(false);
    }
  }, [roomName]);

  useEffect(() => {
    if (!open) return;
    setAgentName("");
    fetchDispatches();
    isLiveKitEnabled("agent")
      .then((on) => setKillSwitchOn(on))
      .catch(() => setKillSwitchOn(false));
  }, [open, fetchDispatches]);

  const handleDispatch = async () => {
    if (!agentName.trim() || !roomName) return;
    if (killSwitchOn === false) {
      toast.error("Agent dispatch is disabled by admin.");
      return;
    }
    setBusy(true);
    try {
      const res = await dispatchAgent({
        scope,
        roomName,
        agentName: agentName.trim(),
      });
      if (res.ok) {
        toast.success(`Agent "${agentName.trim()}" dispatched.`);
        setAgentName("");
        await fetchDispatches();
      } else {
        toast.error(res.error || "Dispatch failed");
      }
    } catch (e: any) {
      toast.error(e?.message || "Dispatch failed");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async (dispatchId: string) => {
    if (!roomName) return;
    try {
      const res = await cancelAgentDispatch({ dispatchId, roomName });
      if (res.ok) {
        toast.success("Agent dispatch cancelled.");
        await fetchDispatches();
      } else {
        toast.error(res.error || "Cancel failed");
      }
    } catch (e: any) {
      toast.error(e?.message || "Cancel failed");
    }
  };

  const scopeLabel = scope === "call" ? "Call" : scope === "party" ? "Party" : "Live";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white border-slate-200 text-slate-900 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot className="w-5 h-5 text-indigo-400" />
            Dispatch AI Agent
            <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">
              {scopeLabel}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {killSwitchOn === false && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-2 text-xs text-amber-300 flex items-center gap-2">
              <Radio className="w-3.5 h-3.5" />
              Agent dispatch is currently disabled by admin.
            </div>
          )}

          <div className="flex gap-2">
            <Input
              placeholder="Agent worker name (e.g. translator-v1)"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDispatch()}
              className="bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
            />
            <Button
              size="sm"
              onClick={handleDispatch}
              disabled={busy || !agentName.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white shrink-0"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-400">Active dispatches</p>
            <Button
              size="sm"
              variant="ghost"
              onClick={fetchDispatches}
              disabled={loadingList}
              className="h-7 text-slate-400 hover:text-white"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingList ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {dispatches.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-4">
              {loadingList ? "Loading…" : "No active agents in this room."}
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {dispatches.map((d) => (
                <div
                  key={d.dispatchId}
                  className="flex items-center justify-between bg-slate-800 rounded-lg p-2.5"
                >
                  <div className="min-w-1 flex-1">
                    <div className="flex items-center gap-2">
                      <Bot className="w-3.5 h-3.5 text-indigo-400" />
                      <span className="text-sm text-white font-medium truncate">
                        {d.agentName}
                      </span>
                      <Badge
                        className={`text-[10px] ${
                          d.status === "dispatched" || d.status === "active"
                            ? "bg-emerald-600 text-white"
                            : d.status === "pending"
                            ? "bg-amber-600 text-white"
                            : "bg-slate-600 text-white"
                        }`}
                      >
                        {d.status}
                      </Badge>
                    </div>
                    {d.createdAt && (
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {new Date(d.createdAt).toLocaleString()}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleCancel(d.dispatchId)}
                    className="h-7 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 shrink-0"
                  >
                    <XCircle className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
