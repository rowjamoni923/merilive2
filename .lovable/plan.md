# Pkg420 — App-wide Zero-Refresh Instant Data

## Current state (honest audit)

Global React Query config (`src/lib/queryClient.ts`) is already perfectly tuned for instant loading:
- `refetchOnMount: false`, `refetchOnWindowFocus: false`, `refetchOnReconnect: false`
- `staleTime: 2 min`, `gcTime: 2 hr`, `placeholderData: prev` (cached data shown instantly)
- 7-day localStorage persistence via `PersistQueryClientProvider` (App.tsx)

So any page using `useQuery` already renders instantly from cache.

**The actual problem**: 30+ pages still use the legacy `useState + useEffect + setLoading(true)` pattern. These bypass React Query entirely, show a spinner on every mount, and feel like a "refresh".

## Pages to migrate (priority order)

**Tier 1 — User-visible high-traffic** (this pkg):
1. `Profile.tsx`, `ProfileDetail.tsx` — own + other profile views
2. `Discover.tsx`, `Reels.tsx` — feed pages
3. `Agency.tsx`, `AgencyPolicy.tsx`, `AgencyHostManagement.tsx`, `JoinAgency.tsx`, `BecomeSubAgent.tsx`
4. `MyRecordings.tsx`, `HostBonusLedger.tsx`, `RatingProofHistory.tsx`
5. `PKLeaderboard.tsx`, `FaceVerification.tsx`
6. `settings/UserManagement.tsx`, `settings/NotificationSettings.tsx`, `settings/Blacklist.tsx`

**Tier 2 — Admin pages** (deferred to Pkg421): 13 admin pages already partially covered by Pkg362.

**Tier 3 — Auth/Reset/Debug** (won't touch): `Auth.tsx`, `ResetPassword.tsx`, `DebugReferrer.tsx` — one-time flows, spinner is correct.

## Migration pattern (per page)

Replace:
```ts
const [data, setData] = useState(null);
const [loading, setLoading] = useState(true);
useEffect(() => {
  setLoading(true);
  supabase.from(...).select(...).then(({data}) => { setData(data); setLoading(false); });
}, [id]);
if (loading) return <Spinner />;
```

With:
```ts
const { data, isLoading } = useQuery({
  queryKey: ['profile', id],
  queryFn: async () => (await supabase.from(...).select(...)).data,
});
// Render data immediately — cached or placeholder shown instantly,
// no spinner unless first-ever load on this device.
if (!data && isLoading) return <Spinner />;
```

Plus realtime invalidation where applicable (already wired for `profiles`, `live_streams`, `private_calls`, `party_rooms` via Pkg360/361 — just add `queryClient.invalidateQueries` in those subscribers).

## What stays the same

- Pkg356 no-auto-refresh rule (no visibility-refresh, no polling) — fully respected.
- LiveKit / Supabase Realtime push paths untouched.
- Pull-to-refresh, per-minute billing tick, countdown timers untouched.

## Result

After migration: navigating to any Tier-1 page shows last-cached data **instantly** (zero spinner on repeat visits), realtime push keeps it fresh in background. Only first-ever visit (cold cache) shows a brief skeleton.

## Effort

Tier-1 = ~17 files, each is a mechanical refactor (~5-15 min/file). Single pkg, one large diff.
