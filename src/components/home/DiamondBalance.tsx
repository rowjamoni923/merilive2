import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Diamond3DIcon from "@/components/common/Diamond3DIcon";

interface DiamondBalanceProps {
  balance: number;
  onRecharge?: () => void;
}

export const DiamondBalance = ({ balance, onRecharge }: DiamondBalanceProps) => {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 bg-gradient-to-r from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 rounded-full px-3 py-1.5">
        <Diamond3DIcon size={16} />
        <span className="text-sm font-bold text-cyan-400">
          {balance.toLocaleString()}
        </span>
      </div>
      <Button
        size="icon"
        className="w-7 h-7 rounded-full gradient-primary shadow-glow hover:opacity-90"
        onClick={onRecharge}
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
};
