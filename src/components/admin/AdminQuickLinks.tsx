import { useState } from "react";
import { FileText, Globe, Building2, Users, ShieldCheck, ChevronDown, ChevronUp, ExternalLink, Copy, Check, Link2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface QuickLink {
  label: string;
  url: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  emoji: string;
}

const QUICK_LINKS: QuickLink[] = [
  {
    label: "About MeriLive",
    url: "https://merilive.com/about",
    icon: <Globe className="w-4 h-4" />,
    color: "from-blue-500/20 to-blue-600/10 border-blue-500/30",
    description: "Official website, bio & company info",
    emoji: "🌐",
  },
  {
    label: "App Policy & Benefits",
    url: "https://merilive.com/policies-benefits",
    icon: <FileText className="w-4 h-4" />,
    color: "from-purple-500/20 to-purple-600/10 border-purple-500/30",
    description: "User policies, terms of service & app benefits",
    emoji: "📄",
  },
  {
    label: "Agency Policy",
    url: "https://merilive.com/agency-policy",
    icon: <Building2 className="w-4 h-4" />,
    color: "from-amber-500/20 to-amber-600/10 border-amber-500/30",
    description: "Agency rules, commission structure & guidelines",
    emoji: "🏢",
  },
  {
    label: "Create Agency",
    url: "https://merilive.com/agency-signup",
    icon: <Users className="w-4 h-4" />,
    color: "from-green-500/20 to-green-600/10 border-green-500/30",
    description: "Register a new agency & start earning",
    emoji: "👥",
  },
  {
    label: "Become Sub-Agent",
    url: "https://merilive.com/become-sub-agent",
    icon: <Users className="w-4 h-4" />,
    color: "from-orange-500/20 to-orange-600/10 border-orange-500/30",
    description: "Join as a sub-agent under an existing agency",
    emoji: "🤝",
  },
  {
    label: "Helper Policy",
    url: "https://merilive.com/helper-policy",
    icon: <ShieldCheck className="w-4 h-4" />,
    color: "from-cyan-500/20 to-cyan-600/10 border-cyan-500/30",
    description: "Payroll helper rules & verification process",
    emoji: "🛡️",
  },
  {
    label: "6-Level Policy Hub",
    url: "https://merilive.com/policies/levels",
    icon: <ShieldCheck className="w-4 h-4" />,
    color: "from-yellow-500/20 to-amber-600/10 border-yellow-500/30",
    description: "L1 Helper → L6 CSA — full operator policies with live wallet config",
    emoji: "👑",
  },
  {
    label: "Payroll Helper Guide",
    url: "https://merilive.com/payroll-helper-guide",
    icon: <FileText className="w-4 h-4" />,
    color: "from-teal-500/20 to-teal-600/10 border-teal-500/30",
    description: "Complete guide for payroll helpers",
    emoji: "📋",
  },
  {
    label: "Play Store",
    url: "https://play.google.com/store/apps/details?id=com.merilive.app",
    icon: <ExternalLink className="w-4 h-4" />,
    color: "from-emerald-500/20 to-emerald-600/10 border-emerald-500/30",
    description: "Download MeriLive from Google Play Store",
    emoji: "🔗",
  },
];

interface AdminQuickLinksProps {
  /** When provided, clicking a card inserts a formatted message with the link */
  onInsertLink?: (formattedMessage: string) => void;
  /** Compact mode for inline usage */
  compact?: boolean;
}

export default function AdminQuickLinks({ onInsertLink, compact = false }: AdminQuickLinksProps) {
  const [expanded, setExpanded] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const formatLinkMessage = (link: QuickLink) => {
    return `${link.emoji} *${link.label}*\n${link.description}\n🔗 ${link.url}`;
  };

  const handleClick = (link: QuickLink, idx: number) => {
    const formatted = formatLinkMessage(link);
    if (onInsertLink) {
      onInsertLink(formatted);
      toast.success(`"${link.label}" link inserted into reply`);
      // Auto-collapse after inserting
      setExpanded(false);
    } else {
      navigator.clipboard.writeText(formatted);
      setCopiedIdx(idx);
      toast.success("Link copied to clipboard!");
      setTimeout(() => setCopiedIdx(null), 2000);
    }
  };

  return (
    <div className="w-full">
      <Button
        variant="ghost"
        size="sm"
        className="w-full h-8 text-xs gap-1.5 text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/20"
        onClick={() => setExpanded(!expanded)}
      >
        <Link2 className="w-3.5 h-3.5" />
        📋 Quick Share Links
        {expanded ? <ChevronUp className="w-3.5 h-3.5 ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 ml-auto" />}
      </Button>

      {expanded && (
        <div
          className="mt-2 max-h-[220px] overflow-y-auto overscroll-contain pr-1 [touch-action:pan-y]"
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <div className={`grid ${compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'} gap-2 animate-in slide-in-from-top-2 duration-200 pb-1`}>
            {QUICK_LINKS.map((link, idx) => (
              <button
                key={idx}
                onClick={() => handleClick(link, idx)}
                className={`
                  flex items-start gap-3 p-3 rounded-xl border text-left
                  bg-gradient-to-r ${link.color}
                  hover:opacity-90 hover:scale-[1.01] active:scale-[0.99]
                  transition-all duration-150 group
                `}
              >
                <div className="shrink-0 mt-0.5 text-lg">{link.emoji}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold leading-tight text-foreground">
                    {link.label}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-snug mt-0.5">
                    {link.description}
                  </p>
                  <p className="text-[9px] text-primary/70 font-mono mt-1 truncate">
                    {link.url.replace('https://', '')}
                  </p>
                </div>
                <div className="shrink-0 mt-0.5">
                  {copiedIdx === idx ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : onInsertLink ? (
                    <Send className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 transition-opacity" />
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
