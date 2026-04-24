import { useState, useEffect, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import { Globe, Users } from "lucide-react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { cn } from "@/lib/utils";

interface CountryData {
  country_name: string | null;
  country_code: string | null;
  country_flag: string | null;
  count: number;
}

const AdminCountryDistribution = () => {
  const [countryStats, setCountryStats] = useState<CountryData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchCountryStats = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("country_name, country_code, country_flag")
        .not("country_name", "is", null);

      if (error) throw error;

      const countryMap = new Map<string, CountryData>();
      (data || []).forEach((profile: any) => {
        const key = profile.country_code || profile.country_name || "Unknown";
        if (countryMap.has(key)) {
          countryMap.get(key)!.count++;
        } else {
          countryMap.set(key, {
            country_name: profile.country_name,
            country_code: profile.country_code,
            country_flag: profile.country_flag,
            count: 1,
          });
        }
      });

      const sorted = Array.from(countryMap.values()).sort((a, b) => b.count - a.count);
      setCountryStats(sorted);
    } catch (error) {
      console.error("Error fetching country stats:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCountryStats();
  }, [fetchCountryStats]);

  useAdminRealtime(["profiles"], () => {
    fetchCountryStats();
  });

  const totalCountryUsers = countryStats.reduce((s, c) => s + c.count, 0);

  return (
    <div className="space-y-6">
      {/* Premium Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#0a0f1a] via-[#080d18] to-[#050810] p-6 shadow-[0_20px_60px_-20px_rgba(56,189,248,0.3)]"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.10),transparent_70%)]" />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-500/40 to-transparent" />
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-sky-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl" />

        <div className="relative flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 via-blue-500 to-indigo-600 shadow-lg shadow-sky-500/30 ring-2 ring-sky-400/20">
                <Globe className="h-7 w-7 text-white" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Country Distribution</h1>
              <p className="text-sm text-sky-300/60 font-medium">
                Geographic spread of users across the platform
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <Users className="w-4 h-4 text-sky-400" />
            <span className="text-xs text-sky-300 font-semibold">
              {countryStats.length} countries · {totalCountryUsers.toLocaleString()} users
            </span>
          </div>
        </div>
      </motion.div>

      {/* Country List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-br from-[#0d0f14] via-[#0a0c10] to-[#080910] p-5"
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-500/20 to-transparent" />
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />
            ))}
          </div>
        ) : countryStats.length === 0 ? (
          <div className="text-center py-10 text-white/30 text-sm">No country data available</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {countryStats.map((country, index) => {
              const percentage = totalCountryUsers > 0 ? (country.count / totalCountryUsers) * 100 : 0;
              const isTop3 = index < 3;

              return (
                <motion.div
                  key={country.country_code || index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className={cn(
                    "group relative flex items-center gap-3 px-4 py-3 rounded-xl border transition-all duration-300 overflow-hidden",
                    isTop3
                      ? "bg-gradient-to-r from-amber-500/[0.06] to-transparent border-amber-500/15 hover:border-amber-400/30"
                      : "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.12] hover:bg-white/[0.04]"
                  )}
                >
                  <div
                    className={cn(
                      "absolute left-0 top-0 bottom-0 transition-all duration-500",
                      isTop3 ? "bg-amber-500/[0.06]" : "bg-sky-500/[0.04]"
                    )}
                    style={{ width: `${Math.max(percentage, 2)}%` }}
                  />

                  <div className={cn(
                    "relative flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold",
                    index === 0 ? "bg-gradient-to-br from-amber-400 to-yellow-600 text-black" :
                    index === 1 ? "bg-gradient-to-br from-slate-300 to-slate-500 text-black" :
                    index === 2 ? "bg-gradient-to-br from-amber-600 to-amber-800 text-white" :
                    "bg-white/[0.06] text-white/40"
                  )}>
                    {index + 1}
                  </div>

                  <span className="relative text-xl flex-shrink-0">
                    {country.country_flag || "🌍"}
                  </span>

                  <div className="relative flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-semibold truncate",
                      isTop3 ? "text-amber-100" : "text-white/80"
                    )}>
                      {country.country_name || country.country_code || "Unknown"}
                    </p>
                    <p className="text-[10px] text-white/25 font-medium uppercase tracking-wider">
                      {country.country_code || "—"}
                    </p>
                  </div>

                  <div className="relative text-right flex-shrink-0">
                    <p className={cn(
                      "text-sm font-bold tabular-nums",
                      isTop3 ? "text-amber-300" : "text-white/60"
                    )}>
                      {country.count.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-white/25 font-semibold">
                      {percentage.toFixed(1)}%
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default AdminCountryDistribution;
