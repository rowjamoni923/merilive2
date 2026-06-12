import { Check } from "lucide-react";
import { SmartImage } from "@/components/ui/smart-image";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CampaignTemplate {
  id: string;
  name: string;
  thumbnail: string; // gradient CSS for preview
  popupBg: string;
  popupBorder: string;
  badgeBg: string;
  badgeText: string;
  titleColor: string;
  subtitleColor: string;
  priceColor: string;
  bonusColor: string;
  buttonBg: string;
  buttonText: string;
  timerBg: string;
  timerText: string;
  accentGlow: string;
  icon: string;
}

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  {
    id: "royal-gold",
    name: "Royal Gold",
    thumbnail: "linear-gradient(135deg, #1a1000, #3d2800, #1a1000)",
    popupBg: "linear-gradient(160deg, #1a1000 0%, #2d1f00 40%, #1a1000 100%)",
    popupBorder: "#f5a623",
    badgeBg: "linear-gradient(90deg, #f5a623, #ffd700)",
    badgeText: "#000",
    titleColor: "#ffd700",
    subtitleColor: "#c9a84c",
    priceColor: "#ffd700",
    bonusColor: "#4ade80",
    buttonBg: "linear-gradient(90deg, #f5a623, #ffd700, #f5a623)",
    buttonText: "#000",
    timerBg: "rgba(245, 166, 35, 0.15)",
    timerText: "#ffd700",
    accentGlow: "0 0 60px rgba(255, 215, 0, 0.3)",
    icon: "👑",
  },
  {
    id: "neon-purple",
    name: "Neon Purple",
    thumbnail: "linear-gradient(135deg, #0d0020, #2a0845, #0d0020)",
    popupBg: "linear-gradient(160deg, #0d0020 0%, #1a0533 40%, #0d0020 100%)",
    popupBorder: "#a855f7",
    badgeBg: "linear-gradient(90deg, #a855f7, #d946ef)",
    badgeText: "#fff",
    titleColor: "#e0b3ff",
    subtitleColor: "#a78bfa",
    priceColor: "#d8b4fe",
    bonusColor: "#34d399",
    buttonBg: "linear-gradient(90deg, #a855f7, #d946ef, #a855f7)",
    buttonText: "#fff",
    timerBg: "rgba(168, 85, 247, 0.15)",
    timerText: "#d8b4fe",
    accentGlow: "0 0 60px rgba(168, 85, 247, 0.3)",
    icon: "💎",
  },
  {
    id: "midnight-blue",
    name: "Midnight Blue",
    thumbnail: "linear-gradient(135deg, #000820, #001a4d, #000820)",
    popupBg: "linear-gradient(160deg, #000820 0%, #001233 40%, #000820 100%)",
    popupBorder: "#3b82f6",
    badgeBg: "linear-gradient(90deg, #3b82f6, #60a5fa)",
    badgeText: "#fff",
    titleColor: "#93c5fd",
    subtitleColor: "#60a5fa",
    priceColor: "#93c5fd",
    bonusColor: "#4ade80",
    buttonBg: "linear-gradient(90deg, #2563eb, #3b82f6, #2563eb)",
    buttonText: "#fff",
    timerBg: "rgba(59, 130, 246, 0.15)",
    timerText: "#93c5fd",
    accentGlow: "0 0 60px rgba(59, 130, 246, 0.3)",
    icon: "🌙",
  },
  {
    id: "ruby-red",
    name: "Ruby Red",
    thumbnail: "linear-gradient(135deg, #1a0005, #4a0010, #1a0005)",
    popupBg: "linear-gradient(160deg, #1a0005 0%, #330010 40%, #1a0005 100%)",
    popupBorder: "#ef4444",
    badgeBg: "linear-gradient(90deg, #ef4444, #f87171)",
    badgeText: "#fff",
    titleColor: "#fca5a5",
    subtitleColor: "#f87171",
    priceColor: "#fca5a5",
    bonusColor: "#fbbf24",
    buttonBg: "linear-gradient(90deg, #dc2626, #ef4444, #dc2626)",
    buttonText: "#fff",
    timerBg: "rgba(239, 68, 68, 0.15)",
    timerText: "#fca5a5",
    accentGlow: "0 0 60px rgba(239, 68, 68, 0.3)",
    icon: "🔥",
  },
  {
    id: "emerald-luxe",
    name: "Emerald Luxe",
    thumbnail: "linear-gradient(135deg, #001a0d, #003d1a, #001a0d)",
    popupBg: "linear-gradient(160deg, #001a0d 0%, #00331a 40%, #001a0d 100%)",
    popupBorder: "#10b981",
    badgeBg: "linear-gradient(90deg, #10b981, #34d399)",
    badgeText: "#000",
    titleColor: "#6ee7b7",
    subtitleColor: "#34d399",
    priceColor: "#6ee7b7",
    bonusColor: "#fbbf24",
    buttonBg: "linear-gradient(90deg, #059669, #10b981, #059669)",
    buttonText: "#fff",
    timerBg: "rgba(16, 185, 129, 0.15)",
    timerText: "#6ee7b7",
    accentGlow: "0 0 60px rgba(16, 185, 129, 0.3)",
    icon: "💚",
  },
  {
    id: "sunset-blaze",
    name: "Sunset Blaze",
    thumbnail: "linear-gradient(135deg, #1a0800, #4a1500, #1a0800)",
    popupBg: "linear-gradient(160deg, #1a0800 0%, #331000 40%, #1a0800 100%)",
    popupBorder: "#f97316",
    badgeBg: "linear-gradient(90deg, #f97316, #fb923c)",
    badgeText: "#000",
    titleColor: "#fdba74",
    subtitleColor: "#fb923c",
    priceColor: "#fdba74",
    bonusColor: "#a78bfa",
    buttonBg: "linear-gradient(90deg, #ea580c, #f97316, #ea580c)",
    buttonText: "#fff",
    timerBg: "rgba(249, 115, 22, 0.15)",
    timerText: "#fdba74",
    accentGlow: "0 0 60px rgba(249, 115, 22, 0.3)",
    icon: "🌅",
  },
  {
    id: "pink-diamond",
    name: "Pink Diamond",
    thumbnail: "linear-gradient(135deg, #1a000d, #4a0028, #1a000d)",
    popupBg: "linear-gradient(160deg, #1a000d 0%, #33001a 40%, #1a000d 100%)",
    popupBorder: "#ec4899",
    badgeBg: "linear-gradient(90deg, #ec4899, #f472b6)",
    badgeText: "#fff",
    titleColor: "#f9a8d4",
    subtitleColor: "#f472b6",
    priceColor: "#f9a8d4",
    bonusColor: "#38bdf8",
    buttonBg: "linear-gradient(90deg, #db2777, #ec4899, #db2777)",
    buttonText: "#fff",
    timerBg: "rgba(236, 72, 153, 0.15)",
    timerText: "#f9a8d4",
    accentGlow: "0 0 60px rgba(236, 72, 153, 0.3)",
    icon: "💖",
  },
  {
    id: "cyber-teal",
    name: "Cyber Teal",
    thumbnail: "linear-gradient(135deg, #001a1a, #003d3d, #001a1a)",
    popupBg: "linear-gradient(160deg, #001a1a 0%, #003333 40%, #001a1a 100%)",
    popupBorder: "#14b8a6",
    badgeBg: "linear-gradient(90deg, #14b8a6, #2dd4bf)",
    badgeText: "#000",
    titleColor: "#5eead4",
    subtitleColor: "#2dd4bf",
    priceColor: "#5eead4",
    bonusColor: "#fbbf24",
    buttonBg: "linear-gradient(90deg, #0d9488, #14b8a6, #0d9488)",
    buttonText: "#fff",
    timerBg: "rgba(20, 184, 166, 0.15)",
    timerText: "#5eead4",
    accentGlow: "0 0 60px rgba(20, 184, 166, 0.3)",
    icon: "⚡",
  },
  {
    id: "platinum-silver",
    name: "Platinum Silver",
    thumbnail: "linear-gradient(135deg, #0a0a0f, #1a1a2e, #0a0a0f)",
    popupBg: "linear-gradient(160deg, #0a0a0f 0%, #15152a 40%, #0a0a0f 100%)",
    popupBorder: "#94a3b8",
    badgeBg: "linear-gradient(90deg, #94a3b8, #cbd5e1)",
    badgeText: "#000",
    titleColor: "#e2e8f0",
    subtitleColor: "#94a3b8",
    priceColor: "#e2e8f0",
    bonusColor: "#a78bfa",
    buttonBg: "linear-gradient(90deg, #64748b, #94a3b8, #64748b)",
    buttonText: "#fff",
    timerBg: "rgba(148, 163, 184, 0.15)",
    timerText: "#e2e8f0",
    accentGlow: "0 0 60px rgba(148, 163, 184, 0.2)",
    icon: "✨",
  },
  {
    id: "aurora-mix",
    name: "Aurora Mix",
    thumbnail: "linear-gradient(135deg, #0d001a, #001a33, #001a0d, #0d001a)",
    popupBg: "linear-gradient(160deg, #0d001a 0%, #001a33 30%, #001a0d 60%, #0d001a 100%)",
    popupBorder: "#818cf8",
    badgeBg: "linear-gradient(90deg, #818cf8, #34d399, #fbbf24)",
    badgeText: "#000",
    titleColor: "#c7d2fe",
    subtitleColor: "#a5b4fc",
    priceColor: "#c7d2fe",
    bonusColor: "#34d399",
    buttonBg: "linear-gradient(90deg, #6366f1, #34d399, #6366f1)",
    buttonText: "#fff",
    timerBg: "rgba(129, 140, 248, 0.15)",
    timerText: "#c7d2fe",
    accentGlow: "0 0 60px rgba(129, 140, 248, 0.25)",
    icon: "🌈",
  },
];

interface TemplateSelectorProps {
  selectedId: string | null;
  onSelect: (template: CampaignTemplate) => void;
}

export function CampaignTemplateSelector({ selectedId, onSelect }: TemplateSelectorProps) {
  const selected = CAMPAIGN_TEMPLATES.find(t => t.id === selectedId) || CAMPAIGN_TEMPLATES[0];

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        🎨 Popup Template
      </h3>
      <p className="text-xs text-muted-foreground">
        Select a template — preview updates instantly
      </p>
      <Select
        value={selected.id}
        onValueChange={(id) => {
          const next = CAMPAIGN_TEMPLATES.find(t => t.id === id);
          if (next) onSelect(next);
        }}
      >
        <SelectTrigger className="w-full h-11">
          <SelectValue>
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-md border border-border/40 flex items-center justify-center text-sm flex-shrink-0"
                style={{ background: selected.thumbnail }}
              >
                <span>{selected.icon}</span>
              </div>
              <span className="font-medium">{selected.name}</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[320px]">
          {CAMPAIGN_TEMPLATES.map(t => {
            const isSelected = selected.id === t.id;
            return (
              <SelectItem key={t.id} value={t.id} className="py-2">
                <div className="flex items-center gap-3 pr-4">
                  <div
                    className="w-8 h-8 rounded-md border border-border/40 flex items-center justify-center text-base flex-shrink-0"
                    style={{ background: t.thumbnail }}
                  >
                    <span>{t.icon}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-medium" style={{ color: undefined }}>
                      {t.name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {isSelected ? "Currently selected" : "Tap to preview"}
                    </span>
                  </div>
                  {isSelected && (
                    <Check className="w-4 h-4 text-primary ml-auto" />
                  )}
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>
    </div>
  );
}


interface CampaignPopupPreviewProps {
  template: CampaignTemplate | null;
  campaignName: string;
  badgeText: string;
  diamondsAmount: number;
  bonusDiamonds: number;
  bonusPercentage: number;
  priceUsd: number;
  offerPriceUsd: number | null;
  durationMinutes: number;
  bannerImageUrl: string | null;
}

export function CampaignPopupPreview({
  template,
  campaignName,
  badgeText,
  diamondsAmount,
  bonusDiamonds,
  bonusPercentage,
  priceUsd,
  offerPriceUsd,
  durationMinutes,
  bannerImageUrl,
}: CampaignPopupPreviewProps) {
  const t = template || CAMPAIGN_TEMPLATES[0];

  const formatTimer = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) return `${h}h ${m > 0 ? `${m}m` : ""}`;
    return `${m}m`;
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        📱 Live Preview
      </h3>
      <div className="flex justify-center">
        {/* Phone frame */}
        <div className="relative w-[220px] rounded-[24px] border-2 border-border/50 bg-black/90 p-2 shadow-2xl">
          {/* Status bar */}
          <div className="flex items-center justify-between px-3 py-1 text-[8px] text-white/50">
            <span>9:41</span>
            <div className="flex gap-1">
              <span>●●●</span>
              <span>📶</span>
              <span>🔋</span>
            </div>
          </div>

          {/* Popup overlay */}
          <div className="relative mt-1 flex items-center justify-center min-h-[300px] bg-black/40 rounded-2xl backdrop-blur-sm">
            {/* Popup card */}
            <div
              className="w-[190px] rounded-2xl overflow-hidden relative"
              style={{
                background: t.popupBg,
                border: `1.5px solid ${t.popupBorder}`,
                boxShadow: t.accentGlow,
              }}
            >
              {/* Top shine */}
              <div
                className="absolute inset-x-0 top-0 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${t.popupBorder}40, transparent)` }}
              />

              {/* Banner image */}
              {bannerImageUrl && (
                <div className="h-16 overflow-hidden">
                  <SmartImage src={bannerImageUrl} alt="" className="w-full h-full object-cover" fallbackSrc="/placeholder.svg" />
                </div>
              )}

              {/* Content */}
              <div className="p-3 space-y-2">
                {/* Badge */}
                <div className="flex justify-center">
                  <span
                    className="text-[8px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: t.badgeBg, color: t.badgeText }}
                  >
                    {badgeText || "Limited Offer"}
                  </span>
                </div>

                {/* Title */}
                <div className="text-center">
                  <div className="text-[10px] font-extrabold" style={{ color: t.titleColor }}>
                    {campaignName || "Campaign Name"}
                  </div>
                </div>

                {/* Diamond display */}
                <div className="text-center space-y-0.5">
                  <div className="flex items-center justify-center gap-1">
                    <span className="text-xs">💎</span>
                    <span className="text-lg font-black" style={{ color: t.priceColor }}>
                      {diamondsAmount > 0 ? diamondsAmount.toLocaleString() : "5,000"}
                    </span>
                  </div>
                  {bonusDiamonds > 0 && (
                    <div className="text-[9px] font-bold" style={{ color: t.bonusColor }}>
                      +{bonusDiamonds.toLocaleString()} Bonus ({bonusPercentage}%)
                    </div>
                  )}
                </div>

                {/* Price */}
                <div className="text-center">
                  {offerPriceUsd && offerPriceUsd > 0 ? (
                    <div className="flex items-center justify-center gap-1">
                      <span className="text-[9px] line-through opacity-50" style={{ color: t.subtitleColor }}>
                        ${priceUsd.toFixed(2)}
                      </span>
                      <span className="text-xs font-bold" style={{ color: t.priceColor }}>
                        ${offerPriceUsd.toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs font-bold" style={{ color: t.priceColor }}>
                      ${priceUsd > 0 ? priceUsd.toFixed(2) : "0.00"}
                    </span>
                  )}
                </div>

                {/* Timer */}
                <div
                  className="flex items-center justify-center gap-1 rounded-lg py-1"
                  style={{ background: t.timerBg }}
                >
                  <span className="text-[8px]">⏰</span>
                  <span className="text-[9px] font-bold" style={{ color: t.timerText }}>
                    {formatTimer(durationMinutes)} remaining
                  </span>
                </div>

                {/* Buy button */}
                <button
                  className="w-full py-1.5 rounded-xl text-[10px] font-bold transition-all"
                  style={{ background: t.buttonBg, color: t.buttonText }}
                >
                  Buy Now
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
