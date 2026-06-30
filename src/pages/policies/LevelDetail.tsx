import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { POLICY_LEVELS, getPolicyLevel } from "@/lib/policyLevels";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck, Sparkles, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface PolicyRow {
  level_code: string;
  title: string;
  subtitle: string | null;
  body_md: string;
  version: number;
  updated_at: string;
}

interface CsaSettings {
  min_purchase_usd: number;
  diamonds_per_usd: number;
  visibility_threshold_diamonds: number;
  owner_fallback_enabled: boolean;
  auto_credit_on_payment: boolean;
  withdrawal_bonus_rate_percent: number;
  withdrawal_bonus_enabled: boolean;
  bonus_trigger_status: string;
}

export default function LevelDetail() {
  const { levelCode = "L1" } = useParams();
  const meta = getPolicyLevel(levelCode);
  const [row, setRow] = useState<PolicyRow | null>(null);
  const [csa, setCsa] = useState<CsaSettings | null>(null);
  const isCsa = meta?.code === "L6";

  useEffect(() => {
    if (!meta) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("policy_documents" as any)
        .select("level_code, title, subtitle, body_md, version, updated_at")
        .eq("level_code", meta.code)
        .eq("is_published", true)
        .maybeSingle();
      if (active) setRow((data as any) || null);

      if (isCsa) {
        const { data: s } = await supabase
          .from("csa_diamond_settings" as any)
          .select("*")
          .eq("id", 1)
          .maybeSingle();
        if (active) setCsa((s as any) || null);
      }
    })();

    const channel = supabase
      .channel(`policy_documents_${meta.code}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "policy_documents", filter: `level_code=eq.${meta.code}` },
        (payload: any) => setRow(payload.new as PolicyRow)
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [meta?.code, isCsa]);

  const sections = useMemo(() => parseMarkdownSections(row?.body_md || ""), [row?.body_md]);

  if (!meta) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <div>
          <p className="text-muted-foreground mb-3">Unknown policy level.</p>
          <Button asChild>
            <Link to="/policies/levels">Back to hub</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-background text-foreground">

      {/* Hero banner */}
      <header className="relative overflow-hidden">
        <img
          src={meta.banner}
          alt=""
          width={1536}
          height={640}
          className="w-full h-[260px] md:h-[360px] object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/10" />
        <div className="absolute inset-0 flex items-end">
          <div className="max-w-4xl mx-auto px-4 pb-6 md:pb-10 w-full">
            <Button asChild variant="ghost" size="sm" className="mb-3 -ml-2">
              <Link to="/policies/levels">
                <ArrowLeft className="w-4 h-4 mr-1.5" /> All levels
              </Link>
            </Button>
            <div className="flex items-center gap-2 mb-2">
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border", meta.badge)}>
                {meta.code}
              </span>
              {isCsa && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded border bg-yellow-500/15 text-yellow-300 border-yellow-500/40 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> FLAGSHIP
                </span>
              )}
              {row && (
                <span className="text-[10px] text-muted-foreground">v{row.version}</span>
              )}
            </div>
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight">
              {row?.title || meta.longName}
            </h1>
            <p className="mt-1 text-sm md:text-base text-muted-foreground">
              {row?.subtitle || meta.tagline}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 md:py-12 space-y-6">
        {/* CSA live settings — only on L6 */}
        {isCsa && (
          <CsaLiveSettingsCard csa={csa} />
        )}

        {/* Body */}
        <article className="space-y-6">
          {sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Policy content is being prepared.</p>
          ) : (
            sections.map((sec, i) => (
              <section
                key={i}
                className="rounded-2xl border border-border/30 bg-card/40 backdrop-blur p-5 md:p-6"
              >
                {sec.heading && (
                  <h2 className="text-base md:text-lg font-semibold mb-3 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-primary" />
                    {sec.heading}
                  </h2>
                )}
                <div className="prose prose-invert prose-sm max-w-none">
                  {sec.lines.map((ln, j) => renderLine(ln, j))}
                </div>
              </section>
            ))
          )}
        </article>

        {/* Cross-link */}
        <div className="pt-4 border-t border-border/30 flex flex-wrap gap-2">
          {POLICY_LEVELS.filter((l) => l.code !== meta.code).map((l) => (
            <Button asChild key={l.code} variant="outline" size="sm">
              <Link to={`/policies/levels/${l.code}`}>
                {l.code} · {l.shortName}
              </Link>
            </Button>
          ))}
        </div>
      </main>
    </div>
  );
}

function CsaLiveSettingsCard({ csa }: { csa: CsaSettings | null }) {
  if (!csa) {
    return (
      <div className="rounded-2xl border border-yellow-500/30 bg-yellow-500/5 p-5 text-sm">
        <p className="text-yellow-300 font-semibold">Diamond Wallet Operations</p>
        <p className="text-muted-foreground mt-1">Not configured by admin yet.</p>
      </div>
    );
  }
  const rows: Array<[string, string]> = [
    ["Minimum Purchase (USD)", `$${Number(csa.min_purchase_usd).toLocaleString()}`],
    ["Diamonds per 1 USD", `${Number(csa.diamonds_per_usd).toLocaleString()} 💎`],
    [
      "Visibility Threshold",
      `${Number(csa.visibility_threshold_diamonds).toLocaleString()} 💎`,
    ],
    ["Owner Fallback", csa.owner_fallback_enabled ? "Enabled" : "Disabled"],
    ["Auto-credit on Payment", csa.auto_credit_on_payment ? "Enabled" : "Manual approval"],
    [
      "Withdrawal Bonus",
      csa.withdrawal_bonus_enabled
        ? `${Number(csa.withdrawal_bonus_rate_percent)}% on '${csa.bonus_trigger_status}'`
        : "Disabled",
    ],
  ];
  return (
    <div className="rounded-2xl border border-yellow-500/30 bg-gradient-to-br from-yellow-950/30 via-background to-amber-950/20 p-5 md:p-6">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="w-4 h-4 text-yellow-300" />
        <h2 className="text-base md:text-lg font-semibold text-yellow-100">
          Diamond Wallet Operations — Live from admin
        </h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Every value below is read live from the owner-managed CSA Diamond Wallet settings. They are never
        hardcoded — when the owner changes a value, this page reflects it instantly.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="rounded-xl bg-card/50 border border-border/30 px-3 py-2.5 flex items-center justify-between"
          >
            <span className="text-xs text-muted-foreground">{k}</span>
            <span className="text-sm font-semibold text-yellow-100">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- minimal markdown renderer (## headings + bullets + bold) ---------- */

interface ParsedSection {
  heading: string | null;
  lines: string[];
}

function parseMarkdownSections(md: string): ParsedSection[] {
  if (!md.trim()) return [];
  const sections: ParsedSection[] = [];
  let current: ParsedSection = { heading: null, lines: [] };
  md.split(/\r?\n/).forEach((raw) => {
    const line = raw.trimEnd();
    if (line.startsWith("## ")) {
      if (current.heading || current.lines.length) sections.push(current);
      current = { heading: line.slice(3).trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  });
  if (current.heading || current.lines.length) sections.push(current);
  return sections.filter((s) => s.heading || s.lines.some((l) => l.trim()));
}

function renderLine(line: string, key: number) {
  const trimmed = line.trim();
  if (!trimmed) return <div key={key} className="h-2" />;

  if (trimmed.startsWith("- ")) {
    return (
      <div key={key} className="flex gap-2 text-sm leading-relaxed text-foreground/85 my-1">
        <span className="text-primary mt-1.5 w-1 h-1 rounded-full bg-primary shrink-0" />
        <span dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed.slice(2)) }} />
      </div>
    );
  }
  return (
    <p
      key={key}
      className="text-sm leading-relaxed text-foreground/85 my-2"
      dangerouslySetInnerHTML={{ __html: inlineFormat(trimmed) }}
    />
  );
}

function inlineFormat(s: string): string {
  // Escape, then bold + backtick code spans
  const esc = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const formatted = esc
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, '<code class="px-1 py-0.5 rounded bg-muted/40 text-[12px]">$1</code>');
  return DOMPurify.sanitize(formatted, { ALLOWED_TAGS: ['strong', 'code'], ALLOWED_ATTR: ['class'] });
}
