import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { POLICY_LEVELS, type PolicyLevelMeta } from "@/lib/policyLevels";
import { ArrowRight, ShieldCheck, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface PolicyRow {
  level_code: string;
  title: string;
  subtitle: string | null;
  version: number;
  updated_at: string;
}

export default function LevelsHub() {
  const [rows, setRows] = useState<Record<string, PolicyRow>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("policy_documents" as any)
        .select("level_code, title, subtitle, version, updated_at")
        .eq("is_published", true);
      if (!active || !data) return;
      const map: Record<string, PolicyRow> = {};
      for (const r of data as any[]) map[r.level_code] = r as PolicyRow;
      setRows(map);
    })();

    const channel = supabase
      .channel(`policy_documents_hub-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "policy_documents" },
        (payload: any) => {
          const r = payload.new as PolicyRow | undefined;
          if (!r?.level_code) return;
          setRows((prev) => ({ ...prev, [r.level_code]: r }));
        }
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const flagship = POLICY_LEVELS.find((l) => l.code === "L6")!;
  const standard = POLICY_LEVELS.filter((l) => l.code !== "L6");

  return (
    <div className="dark min-h-screen bg-background text-foreground bg-gradient-to-b from-background via-background to-background/80">

      {/* Hero */}
      <header className="relative overflow-hidden border-b border-border/30">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-yellow-500/5" />
        <div className="relative max-w-6xl mx-auto px-4 py-12 md:py-16">
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5" /> Operator Policy Hub
          </div>
          <h1 className="mt-3 text-3xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/70 bg-clip-text text-transparent">
            Six Levels. One Standard of Excellence.
          </h1>
          <p className="mt-3 max-w-2xl text-sm md:text-base text-muted-foreground leading-relaxed">
            Every operator level on MeriLive is governed by a clear, published policy. Read the rules for your tier,
            or share the right link with anyone who needs it.
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-10 space-y-12">
        {/* Flagship L6 */}
        <FlagshipCard meta={flagship} row={rows[flagship.code]} />

        {/* L1–L5 grid */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">All Levels</h2>
            <span className="text-xs text-muted-foreground">{standard.length} tiers</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {standard.map((meta) => (
              <LevelCard key={meta.code} meta={meta} row={rows[meta.code]} />
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function FlagshipCard({ meta, row }: { meta: PolicyLevelMeta; row?: PolicyRow }) {
  return (
    <Link
      to={`/policies/levels/${meta.code}`}
      className="group block relative overflow-hidden rounded-3xl border border-yellow-500/30 bg-gradient-to-br from-yellow-950/30 via-background to-amber-950/20 hover:border-yellow-400/60 transition-all duration-300"
    >
      <div className="grid md:grid-cols-2">
        <div className="relative aspect-[4/3] md:aspect-auto overflow-hidden">
          <img
            src={meta.banner}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover scale-105 group-hover:scale-110 transition-transform duration-700"
          />
          <div className="absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-background via-background/40 to-transparent" />
        </div>
        <div className="p-6 md:p-10 flex flex-col justify-center gap-4">
          <div className="flex items-center gap-2">
            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border", meta.badge)}>
              {meta.code} · FLAGSHIP
            </span>
            <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
          </div>
          <h2 className="text-2xl md:text-4xl font-bold tracking-tight">
            {row?.title || meta.longName}
          </h2>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
            {row?.subtitle || meta.tagline}. Full diamond-wallet operations, country-level authority,
            sub-admin management, and payroll oversight — written in fine detail.
          </p>
          <div className="flex items-center gap-2 text-yellow-300 text-sm font-medium group-hover:gap-3 transition-all">
            Read the CSA policy <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </Link>
  );
}

function LevelCard({ meta, row }: { meta: PolicyLevelMeta; row?: PolicyRow }) {
  return (
    <Link
      to={`/policies/levels/${meta.code}`}
      className="group block relative overflow-hidden rounded-2xl border border-border/40 bg-card/40 backdrop-blur hover:border-primary/40 transition-all duration-300"
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        <img
          src={meta.banner}
          alt=""
          loading="lazy"
          width={1280}
          height={720}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className={cn("absolute inset-0 bg-gradient-to-t", meta.accent)} />
        <div className="absolute top-3 left-3">
          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded border", meta.badge)}>
            {meta.code}
          </span>
        </div>
      </div>
      <div className="p-4 space-y-1">
        <h3 className="font-semibold text-sm">{row?.title || meta.longName}</h3>
        <p className="text-xs text-muted-foreground line-clamp-2">{row?.subtitle || meta.tagline}</p>
        <div className="flex items-center gap-1 text-primary text-xs font-medium pt-1 group-hover:gap-2 transition-all">
          Read policy <ArrowRight className="w-3 h-3" />
        </div>
      </div>
    </Link>
  );
}
