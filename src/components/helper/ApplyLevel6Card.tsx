import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, ChevronRight, Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface ApplyLevel6CardProps {
  /** Current trader level of the helper (1-6). */
  currentLevel: number;
}

/**
 * Compact card matching the dashboard's other tile style (agency/orders/methods/history/inbox).
 * Level 6 (Country Super Admin) has NO dashboard — this card is the single entry point that
 * sends helpers to the secret admin application link.
 */
export default function ApplyLevel6Card({ currentLevel }: ApplyLevel6CardProps) {
  const navigate = useNavigate();
  const unlocked = currentLevel >= 5 && currentLevel < 6;
  const alreadyL6 = currentLevel >= 6;

  return (
    <Card className="overflow-hidden border-0 shadow-lg bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600">
      <div className="p-4 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center shrink-0">
          <Crown className="w-6 h-6 text-amber-200" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-white font-bold text-sm truncate">Level 6 — Country Super Admin</h3>
            <Badge className="bg-amber-300 text-amber-950 text-[9px] h-4 px-1.5 font-bold">L6</Badge>
          </div>
          <p className="text-white/85 text-[11px] leading-snug mt-0.5">
            {alreadyL6
              ? "You are a Country Super Admin."
              : unlocked
              ? "Sign contract, upload NID & deposit to manage your country's payroll."
              : "Reach Level 5 first to unlock the Country Super Admin contract."}
          </p>
        </div>
        {!alreadyL6 && (
          <Button
            size="sm"
            disabled={!unlocked}
            onClick={() => navigate("/super-admin/apply")}
            className="bg-white text-purple-700 hover:bg-white/90 disabled:bg-white/30 disabled:text-white/70 h-9 px-3 font-semibold text-xs shrink-0"
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
      </div>
    </Card>
  );
}
