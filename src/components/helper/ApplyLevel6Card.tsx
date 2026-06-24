import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, ChevronRight, Lock, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ApplyLevel6CardProps {
  /** Current trader level of the helper (1-6). */
  currentLevel: number;
}

/**
 * Helper home tile that opens the Country Super Admin (Level 6) application.
 * Uses the Helper dashboard's amber/orange brand language so it visually
 * belongs to the same surface, not an off-brand purple block.
 */
export default function ApplyLevel6Card({ currentLevel }: ApplyLevel6CardProps) {
  const navigate = useNavigate();
  const unlocked = currentLevel >= 5 && currentLevel < 6;
  const alreadyL6 = currentLevel >= 6;

  return (
    <Card className="overflow-hidden border-0 shadow-lg bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500">
      <div className="p-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shrink-0 ring-1 ring-white/30">
          <Crown className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-white font-bold text-sm">Country Super Admin</h3>
            <Badge className="bg-white text-orange-700 text-[10px] h-4 px-1.5 font-bold hover:bg-white">
              LEVEL 6
            </Badge>
          </div>
          <p className="text-white/90 text-[11px] leading-snug mt-0.5">
            {alreadyL6
              ? "You are an active Country Super Admin."
              : unlocked
              ? "Apply to manage your country's payroll. Sign contract, earn up to 25% commission."
              : "Reach Level 5 first to unlock the Country Super Admin application."}
          </p>
        </div>
        {!alreadyL6 && (
          <Button
            variant="ghost"
            size="sm"
            disabled={!unlocked}
            onClick={() => navigate("/super-admin/apply")}
            className="!bg-white !text-orange-700 hover:!bg-orange-50 hover:!text-orange-800 disabled:!bg-white/30 disabled:!text-white h-9 px-3.5 font-bold text-xs shrink-0 rounded-lg shadow-[0_4px_12px_-2px_rgba(0,0,0,0.18)] border border-white/60"
          >
            {unlocked ? (
              <>
                Apply <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 mr-1" /> Locked
              </>
            )}
          </Button>
        )}
        {alreadyL6 && (
          <Badge className="bg-emerald-500 text-white text-[10px] h-6 px-2 font-bold flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> ACTIVE
          </Badge>
        )}
      </div>
    </Card>
  );
}
