import { useState, useEffect, useCallback } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import { Globe, Users } from "lucide-react";
import { adminSupabase as supabase } from "@/integrations/supabase/adminClient";
import { getCurrentAdminId } from "@/utils/adminSession";
import { cn } from "@/lib/utils";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { recordAdminError } from "@/utils/adminErrorLog";

import { formatAdminError } from "@/utils/formatAdminError";
interface CountryData {
  country_name: string | null;
  country_code: string | null;
  country_flag: string | null;
  count: number;
}

const AdminCountryDistribution = () => {
  const [countryStats, setCountryStats] = useState<CountryData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchCountryStats = useCallback(async () => {
    try {
      setIsLoading(true);
      setIsRefreshing(true);
      const adminId = getCurrentAdminId();
      if (!adminId) {
        setCountryStats([]);
        return;
      }
      const { data, error } = await supabase.rpc("admin_country_distribution", { _admin_id: adminId });
      if (error) throw error;
      const rows = (data || []).map((r: any) => ({
        country_name: r.country_name,
        country_code: r.country_code,
        country_flag: r.country_flag,
        count: Number(r.total ?? 0),
      })) as CountryData[];
      setCountryStats(rows);
    } catch (error) {
      recordAdminError({
        kind: "rpc",
        label: "admin_country_distribution",
        message: formatAdminError(error),
      });
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
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
      <AdminPageHeader
        title="Country Distribution"
        subtitle="Geographic spread of users across the platform"
        icon={Globe}
        onRefresh={fetchCountryStats}
        isRefreshing={isRefreshing}
        actions={
          <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--admin-border-light)/0.7)] bg-[hsl(var(--admin-card)/0.6)] px-3 py-2 text-xs font-semibold text-[hsl(var(--admin-text-secondary))]">
            <Users className="h-4 w-4 text-primary" />
            <span>{countryStats.length} countries</span>
            <span className="text-[hsl(var(--admin-text-muted))]">•</span>
            <span>{totalCountryUsers.toLocaleString()} users</span>
          </div>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="relative overflow-hidden rounded-2xl border border-[hsl(var(--admin-border-light)/0.8)] bg-[linear-gradient(180deg,hsl(var(--admin-card-alt)/0.92),hsl(var(--admin-card)/0.88))] p-5"
      >
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
        {isLoading ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-[hsl(var(--admin-card)/0.85)] animate-pulse" />
            ))}
          </div>
        ) : countryStats.length === 0 ? (
          <div className="admin-empty-state py-10">No country data available</div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
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
                    "group relative flex items-center gap-3 overflow-hidden rounded-xl border px-4 py-3 transition-all duration-300",
                    isTop3
                      ? "border-[hsl(var(--admin-gold)/0.28)] bg-[linear-gradient(90deg,hsl(var(--admin-gold)/0.08),transparent)] hover:border-[hsl(var(--admin-gold)/0.42)]"
                      : "border-[hsl(var(--admin-border-light)/0.7)] bg-[hsl(var(--admin-card)/0.55)] hover:border-[hsl(var(--admin-border)/0.95)] hover:bg-[hsl(var(--admin-card-alt)/0.78)]"
                  )}
                >
                  <div
                    className={cn(
                      "absolute left-0 top-0 bottom-0 transition-all duration-500",
                      isTop3 ? "bg-[hsl(var(--admin-gold)/0.08)]" : "bg-primary/5"
                    )}
                    style={{ width: `${Math.max(percentage, 2)}%` }}
                  />

                  <div className={cn(
                    "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                    index === 0 ? "bg-[linear-gradient(135deg,hsl(var(--admin-gold)),hsl(var(--accent)))] text-primary-foreground" :
                    index === 1 ? "bg-[hsl(var(--muted))] text-foreground" :
                    index === 2 ? "bg-[linear-gradient(135deg,hsl(var(--accent)),hsl(var(--primary)))] text-primary-foreground" :
                    "bg-[hsl(var(--muted)/0.55)] text-[hsl(var(--admin-text-secondary))]"
                  )}>
                    {index + 1}
                  </div>

                  <span className="relative shrink-0 text-xl">{country.country_flag || "🌍"}</span>

                  <div className="relative min-w-0 flex-1">
                    <p className={cn(
                      "truncate text-sm font-semibold",
                      isTop3 ? "text-[hsl(var(--admin-text))]" : "text-[hsl(var(--admin-text))]"
                    )}>
                      {country.country_name || country.country_code || "Unknown"}
                    </p>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[hsl(var(--admin-text-muted))]">
                      {country.country_code || "—"}
                    </p>
                  </div>

                  <div className="relative shrink-0 text-right">
                    <p className={cn(
                      "text-sm font-bold tabular-nums",
                      isTop3 ? "text-[hsl(var(--admin-gold))]" : "text-[hsl(var(--admin-text-secondary))]"
                    )}>
                      {country.count.toLocaleString()}
                    </p>
                    <p className="text-[10px] font-semibold text-[hsl(var(--admin-text-muted))]">
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
