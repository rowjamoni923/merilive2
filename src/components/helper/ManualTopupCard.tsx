import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle, Crown, DollarSign, Gem, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import SwiftPayDepositModal from "@/components/recharge/SwiftPayDepositModal";

interface ManualTopupCardProps {
  helperId: string;
  traderLevel: number;
  /** Called after diamonds credited so the parent can refresh wallet display */
  onCredited?: (diamonds: number) => void;
  /** Auto-open the inline form on mount */
  defaultOpen?: boolean;
}

const getHelperPackageLevel = (
  pkg: { display_order?: number | null; description?: string | null },
  index: number
) => {
  const descriptionMatch = pkg.description?.match(/level\s*(\d+)/i);
  return pkg.display_order || (descriptionMatch ? Number(descriptionMatch[1]) : index + 1);
};

const DIAMOND_PACKAGES = [
  { diamonds: 500000, label: "5 Lakh", color: "from-emerald-500 to-teal-500" },
  { diamonds: 1000000, label: "10 Lakh", color: "from-cyan-500 to-blue-500" },
  { diamonds: 1500000, label: "15 Lakh", color: "from-blue-500 to-indigo-500" },
  { diamonds: 2000000, label: "20 Lakh", color: "from-indigo-500 to-purple-500" },
  { diamonds: 2500000, label: "25 Lakh", color: "from-purple-500 to-pink-500" },
  { diamonds: 3000000, label: "30 Lakh", color: "from-pink-500 to-rose-500" },
  { diamonds: 3500000, label: "35 Lakh", color: "from-rose-500 to-red-500" },
  { diamonds: 4000000, label: "40 Lakh", color: "from-orange-500 to-orange-500" },
  { diamonds: 4500000, label: "45 Lakh", color: "from-yellow-500 to-amber-500" },
  { diamonds: 5000000, label: "50 Lakh", color: "from-emerald-400 to-cyan-400" },
];

export default function ManualTopupCard({
  helperId,
  traderLevel,
  onCredited,
  defaultOpen = false,
}: ManualTopupCardProps) {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState<boolean>(defaultOpen);
  const [showCryptoModal, setShowCryptoModal] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [showPackages, setShowPackages] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customAmount, setCustomAmount] = useState("");
  const [levelPricing, setLevelPricing] = useState<{ diamond_amount: number; price_usd: number } | null>(null);

  // Load level-based diamond pricing
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("helper_diamond_packages")
        .select("diamond_amount, price_usd, display_order, description")
        .eq("is_active", true)
        .order("display_order", { ascending: true });
      if (!data) return;
      const pricing =
        data.find((pkg, i) => getHelperPackageLevel(pkg, i) === (traderLevel || 1)) || data[0];
      if (pricing) setLevelPricing(pricing);
    })();
  }, [traderLevel]);

  const calculateUSD = (diamonds: number): number => {
    if (levelPricing && levelPricing.diamond_amount > 0) {
      return (diamonds / levelPricing.diamond_amount) * levelPricing.price_usd;
    }
    return diamonds / 100;
  };

  const formatDiamonds = (num: number): string => {
    if (num >= 100000) return `${(num / 100000).toFixed(num % 100000 === 0 ? 0 : 1)} Lakh`;
    return num.toLocaleString();
  };

  const handleSelectPackage = (d: number) => {
    setSelectedPackage(d);
    setShowCustom(false);
    setCustomAmount("");
  };

  const handleCustomChange = (value: string) => {
    const cleaned = value.replace(/[^0-9]/g, "");
    setCustomAmount(cleaned ? Number(cleaned).toLocaleString() : "");
    setSelectedPackage(null);
  };

  const customDigits = parseInt((customAmount || "").replace(/,/g, "")) || 0;
  const effectiveCoins = selectedPackage || customDigits || 0;
  const ready = effectiveCoins >= 500000;

  return (
    <>
      <Card className="bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border-emerald-200/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-slate-900 text-base flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Manual Top-up
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-slate-700 text-sm">Add diamonds to your wallet by sending payment</p>

          {levelPricing && (
            <div className="p-3 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-xl border border-violet-200/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gem className="w-4 h-4 text-violet-600" />
                  <span className="text-slate-900 text-sm font-medium">
                    Your Level {traderLevel || 1} Rate
                  </span>
                </div>
                <Badge className="bg-gradient-to-r from-violet-600 to-purple-600 text-white font-semibold shadow-sm border-0">
                  {levelPricing.diamond_amount.toLocaleString()} 💎 = ${levelPricing.price_usd}
                </Badge>
              </div>
            </div>
          )}

          {!showForm ? (
            <Button
              onClick={() => setShowForm(true)}
              className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white h-11"
            >
              <Send className="w-4 h-4 mr-2" />
              Request Manual Top-up
            </Button>
          ) : (
            <div className="space-y-4 bg-slate-50 rounded-xl p-4">
              {levelPricing && (
                <div className="text-center p-2 bg-slate-50 rounded-lg">
                  <p className="text-xs text-slate-700">
                    Level {traderLevel || 1} Rate:{" "}
                    <span className="text-emerald-600 font-semibold">
                      {levelPricing.diamond_amount.toLocaleString()} 💎 = ${levelPricing.price_usd}
                    </span>
                  </p>
                </div>
              )}

              <div className="relative">
                <button
                  onClick={() => setShowPackages(!showPackages)}
                  className={cn(
                    "w-full p-4 rounded-xl border-2 transition-all flex items-center justify-between",
                    showPackages
                      ? "bg-slate-100 border-sky-200 ring-2 ring-cyan-500/20"
                      : selectedPackage
                      ? "bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border-sky-200/50"
                      : "bg-slate-50 border-slate-200 hover:border-sky-200/50"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center">
                      <Gem className="w-5 h-5 text-white" />
                    </div>
                    {selectedPackage ? (
                      <div className="text-left">
                        <span className="text-slate-900 font-bold text-base">
                          {formatDiamonds(selectedPackage)} 💎
                        </span>
                        <p className="text-emerald-600 text-sm font-medium">
                          ${calculateUSD(selectedPackage).toFixed(2)} USD
                        </p>
                      </div>
                    ) : (
                      <span className="text-slate-500 font-medium">Select Diamond Package 💎</span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center transition-transform duration-200",
                      showPackages && "rotate-180"
                    )}
                  >
                    <ArrowLeft className="w-4 h-4 text-slate-700 -rotate-90" />
                  </div>
                </button>

                {showPackages && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-slate-50 border-2 border-sky-200/50 rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-top-2 duration-200">
                    <div className="max-h-80 overflow-y-auto">
                      {DIAMOND_PACKAGES.map((pkg) => (
                        <button
                          key={pkg.diamonds}
                          onClick={() => {
                            handleSelectPackage(pkg.diamonds);
                            setShowPackages(false);
                          }}
                          className={cn(
                            "w-full p-3 flex items-center gap-3 transition-all border-b border-slate-200 last:border-b-0",
                            selectedPackage === pkg.diamonds
                              ? "bg-gradient-to-r from-cyan-500/30 to-blue-500/30"
                              : "hover:bg-slate-50"
                          )}
                        >
                          <div
                            className={cn(
                              "w-10 h-10 rounded-lg flex items-center justify-center text-xl",
                              `bg-gradient-to-r ${pkg.color}`
                            )}
                          >
                            💎
                          </div>
                          <div className="flex-1 text-left">
                            <span className="text-slate-900 font-bold text-sm">{pkg.label}</span>
                            <p className="text-slate-700 text-xs">
                              {pkg.diamonds.toLocaleString()} diamonds
                            </p>
                          </div>
                          <div className="text-right">
                            <span className="text-emerald-600 font-bold text-sm">
                              ${calculateUSD(pkg.diamonds).toFixed(2)}
                            </span>
                            {selectedPackage === pkg.diamonds && (
                              <div className="mt-1 flex justify-end">
                                <CheckCircle className="w-4 h-4 text-sky-600" />
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-slate-200 pt-4">
                <button
                  onClick={() => {
                    setShowCustom(!showCustom);
                    setSelectedPackage(null);
                  }}
                  className={cn(
                    "w-full p-3 rounded-xl border-2 border-dashed transition-all",
                    showCustom
                      ? "bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-violet-200"
                      : "bg-slate-50 border-slate-200 hover:border-violet-200/50"
                  )}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Crown className="w-5 h-5 text-violet-600" />
                    <span className="text-slate-900 font-semibold">Custom Amount</span>
                    <span className="text-slate-700 text-xs">(50 Lakh+)</span>
                  </div>
                </button>

                {showCustom && (
                  <div className="mt-3 space-y-2">
                    <Input
                      type="text"
                      placeholder="Enter diamonds (min: 5,00,000)"
                      value={customAmount}
                      onChange={(e) => handleCustomChange(e.target.value)}
                      className="bg-white border-purple-300 text-slate-900 text-center text-lg font-bold"
                    />
                    {customDigits >= 500000 && (
                      <div className="p-2 bg-gradient-to-r from-violet-500 to-violet-600 rounded-lg border border-white/20 shadow-md">
                        <p className="text-white text-sm text-center font-semibold">
                          💎 {formatDiamonds(customDigits)} = ${calculateUSD(customDigits).toFixed(2)}
                        </p>
                      </div>
                    )}
                    {customAmount && customDigits < 500000 && (
                      <p className="text-rose-600 text-xs text-center">
                        ⚠️ Minimum 5 Lakh (500,000) diamonds required
                      </p>
                    )}
                  </div>
                )}
              </div>

              {ready && (
                <div className="p-3 bg-gradient-to-r from-emerald-500/20 to-cyan-500/20 rounded-xl border border-emerald-200/30">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-700 text-sm">You will receive:</span>
                    <div className="text-right">
                      <p className="text-slate-900 font-bold text-lg">
                        {formatDiamonds(effectiveCoins)} 💎
                      </p>
                      <p className="text-emerald-600 text-xs">
                        ${calculateUSD(effectiveCoins).toFixed(2)} USD
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-xl border border-amber-200/60 bg-gradient-to-br from-amber-50 to-yellow-50 p-3">
                <p className="text-amber-700 text-xs font-semibold mb-1">⚡ Instant Auto Top-Up</p>
                <p className="text-slate-700 text-[11px] mb-2">
                  Pay with USDT / BTC / BNB / ETH — diamonds credit to your Trader Wallet
                  automatically on blockchain confirmation. No proof upload, no admin wait.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowForm(false)}
                  className="flex-1 border-slate-200 text-slate-500"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (!ready) {
                      toast({
                        title: "Select amount",
                        description: "Choose a package or enter a custom amount (min 5,00,000)",
                        variant: "destructive",
                      });
                      return;
                    }
                    if (!helperId) {
                      toast({
                        title: "Helper not loaded",
                        description: "Please refresh the page",
                        variant: "destructive",
                      });
                      return;
                    }
                    setShowCryptoModal(true);
                  }}
                  disabled={!ready}
                  className="flex-1 bg-gradient-to-r from-amber-500 to-yellow-600 text-slate-900 font-bold"
                >
                  ⚡ Pay with Crypto
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {helperId && (
        <SwiftPayDepositModal
          open={showCryptoModal}
          onOpenChange={setShowCryptoModal}
          packages={[]}
          mode="helper"
          helperId={helperId}
          helperCustomCoins={effectiveCoins}
          helperCustomPriceUsd={Number(calculateUSD(effectiveCoins).toFixed(2))}
          onCredited={(diamonds) => {
            onCredited?.(diamonds);
            setShowForm(false);
            setSelectedPackage(null);
            setCustomAmount("");
          }}
        />
      )}
    </>
  );
}
