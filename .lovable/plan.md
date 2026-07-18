## Goal
Agency Dashboard-এর **Total Earnings** card-এ agency host earnings + weekly withdraw দুটোই একসাথে দেখাবে (আলাদা কোথাও না), এবং সমস্ত commission % (app + landing + policy + payroll guide) admin panel-এর `agency_level_tiers` টেবিল থেকে instant read হবে — কোথাও কোনো hardcoded 3/5/7/10/12% থাকবে না।

## Scope — কী কী file পরিবর্তন হবে

### 1. Agency Dashboard — Total Earnings consolidation
`src/pages/AgencyDashboard.tsx`
- আজকের UI-এ host `total_earnings` আর `totalWithdrawn` আলাদা জায়গায় বসে আছে।
- একটাই **Total Earnings** card থাকবে যেটা দেখাবে: `all-host-earnings + all-weekly-withdrawn` (agency এর সব host + sub-agency মিলিয়ে)।
- Breakdown tooltip/sub-line: "Hosts: $X • Withdrawn: $Y"।
- অন্য duplicate "Withdrawn total" card গুলা সরাবে।

### 2. Commission % — admin single source of truth
নিচের সব জায়গায় hardcoded % সরানো হবে, সরাসরি `agency_level_tiers` থেকে fetch হবে + Realtime subscription যোগ হবে (admin edit করলেই instant reflect):

| File | কী পরিবর্তন |
|------|------------|
| `src/pages/PayrollHelperGuide.tsx` | "up to 12%+" ও অন্যান্য fixed % → dynamic top-tier থেকে |
| `src/pages/AgencyPolicy.tsx` | Example calculation "A4 (10%)", "$55×10%", "10%-4%", "10%-3%" → top tier % + real neighbor gaps থেকে dynamic |
| `src/components/landing/AgencyCard.tsx` | ✅ ইতিমধ্যেই dynamic হয়ে গেছে (আগের turn-এ) |
| `src/components/landing/HostProgramCard.tsx` | কোনো hardcoded rate নাই — শুধু generic copy। Skip |
| `src/pages/LandingPage.tsx` (Merilive) | Scan করে যেকোনো hardcoded rate থাকলে dynamic করা হবে |

### 3. Backend logic verification (কোনো code change নয়, শুধু confirm)
`process_agency_commission_distribution` function ইতিমধ্যেই `agency_level_tiers` থেকে rate নেয় (আগের turn-এ hardcoded 12% override সরানো হয়েছে)। এটাই confirm করে report দেব যে A→Z path admin panel থেকেই compute হচ্ছে।

## Technical Details

- Data source: `agency_level_tiers (level_code, level_name, commission_rate, min_weekly_income, max_weekly_income, is_active)` — order by `commission_rate ASC`।
- Realtime: প্রতি page-এ একটা channel subscription (`postgres_changes` on `agency_level_tiers`) — admin save করলে auto-refetch, refresh লাগবে না।
- Payroll Guide-এ "up to X%+" এবং AgencyPolicy example-এ tier gap গুলা runtime-এ compute হবে: `topRate = max(commission_rate)`, gap = `(parentRate - childRate)`।
- Cleanup: `supabase.removeChannel(channel)` in `useEffect` return।
- কোনো fallback default number থাকবে না — data না এলে "Not configured by admin" guard।

## যা থাকবে না (out of scope)
- কোনো business rule / calculation formula change — শুধু display + data source।
- Design change — শুধু existing card-এ Total Earnings-এ withdrawn merge।
- Backend function / migration — আগের turn-এ done।

## Verification plan
1. Owner account দিয়ে login → Agency Dashboard খুলে Total Earnings-এ hosts + withdrawn দুটোই merged আছে কিনা screenshot।
2. Admin panel-এ কোনো tier % change করে → PayrollHelperGuide, AgencyPolicy, LandingPage, AgencyCard চারটাতেই instant reflect হচ্ছে কিনা screenshot।
3. `rg` দিয়ে final check: কোনো "3%|5%|7%|10%|12%" hardcoded UI string বাকি নেই।
