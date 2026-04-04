import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

const Pulse = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse rounded-lg bg-white/10", className)} />
);

export const AdminDashboardSkeleton = () => (
  <div className="space-y-4 md:space-y-8 p-2 md:p-0">
    {/* Welcome Header Skeleton */}
    <div className="bg-gradient-to-r from-slate-800 via-slate-800/80 to-slate-800 p-4 md:p-6 rounded-2xl md:rounded-3xl border border-slate-700/30">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-2">
          <Pulse className="h-7 w-56" />
          <Pulse className="h-4 w-36" />
        </div>
        <div className="flex gap-2">
          <Pulse className="h-9 w-32 rounded-full" />
          <Pulse className="h-9 w-48 rounded-full hidden sm:block" />
        </div>
      </div>
    </div>

    {/* Primary Stats Grid Skeleton */}
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-5">
      {[...Array(4)].map((_, i) => (
        <Card key={i} className="border-0 bg-gradient-to-br from-slate-800/80 to-slate-900/80 overflow-hidden">
          <CardContent className="p-3 md:p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-2 md:space-y-3">
                <Pulse className="h-3 w-20" />
                <Pulse className="h-8 md:h-10 w-24" />
              </div>
              <Pulse className="w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-2xl" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>

    {/* Secondary Stats */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {[...Array(4)].map((_, i) => (
        <Card key={i} className="border-0 bg-gradient-to-br from-slate-800/80 to-slate-900/80 overflow-hidden">
          <CardContent className="p-3 md:p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-2 md:space-y-3">
                <Pulse className="h-3 w-24" />
                <Pulse className="h-8 md:h-10 w-20" />
              </div>
              <Pulse className="w-10 h-10 md:w-16 md:h-16 rounded-xl md:rounded-2xl" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>

    {/* Alert Cards Skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {[...Array(3)].map((_, i) => (
        <Card key={i} className="border border-slate-700/30 bg-slate-800/50">
          <CardContent className="p-6 flex items-center gap-4">
            <Pulse className="w-16 h-16 rounded-2xl flex-shrink-0" />
            <div className="space-y-2 flex-1">
              <Pulse className="h-8 w-16" />
              <Pulse className="h-4 w-32" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>

    {/* Quick Actions & Activity Skeleton */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-1 space-y-3">
        <Pulse className="h-6 w-36" />
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border-slate-700/30 bg-slate-800/50">
            <CardContent className="p-5 flex items-center gap-4">
              <Pulse className="w-14 h-14 rounded-2xl flex-shrink-0" />
              <div className="space-y-2 flex-1">
                <Pulse className="h-4 w-32" />
                <Pulse className="h-3 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="lg:col-span-2">
        <Card className="bg-slate-800/50 border-slate-700/30 h-full">
          <CardHeader className="border-b border-slate-700/30">
            <Pulse className="h-5 w-36" />
          </CardHeader>
          <CardContent className="p-0">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4 border-b border-slate-700/20 last:border-0">
                <Pulse className="w-3 h-3 rounded-full flex-shrink-0" />
                <div className="space-y-2 flex-1">
                  <Pulse className="h-4 w-40" />
                  <Pulse className="h-3 w-28" />
                </div>
                <Pulse className="h-5 w-16 rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
);

/** Generic page-level skeleton for admin sub-pages */
export const AdminPageSkeleton = () => (
  <div className="space-y-6">
    {/* Header */}
    <div className="bg-slate-800/60 rounded-2xl p-6 border border-slate-700/30">
      <div className="flex items-center gap-4">
        <Pulse className="w-14 h-14 rounded-xl" />
        <div className="space-y-2">
          <Pulse className="h-6 w-48" />
          <Pulse className="h-4 w-32" />
        </div>
      </div>
    </div>

    {/* Stats Row */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <Card key={i} className="bg-slate-800/40 border-slate-700/20">
          <CardContent className="p-4 text-center space-y-2">
            <Pulse className="w-8 h-8 mx-auto rounded-lg" />
            <Pulse className="h-7 w-16 mx-auto" />
            <Pulse className="h-3 w-20 mx-auto" />
          </CardContent>
        </Card>
      ))}
    </div>

    {/* Table Skeleton */}
    <Card className="bg-slate-800/40 border-slate-700/20">
      <CardHeader className="border-b border-slate-700/20">
        <div className="flex items-center justify-between">
          <Pulse className="h-5 w-36" />
          <Pulse className="h-9 w-24 rounded-lg" />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 p-4 border-b border-slate-700/10 last:border-0">
            <Pulse className="w-10 h-10 rounded-full flex-shrink-0" />
            <div className="space-y-2 flex-1">
              <Pulse className="h-4 w-40" />
              <Pulse className="h-3 w-56" />
            </div>
            <Pulse className="h-8 w-20 rounded-lg" />
          </div>
        ))}
      </CardContent>
    </Card>
  </div>
);

export default AdminDashboardSkeleton;
