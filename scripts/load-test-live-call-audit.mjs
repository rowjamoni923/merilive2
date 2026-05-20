#!/usr/bin/env node
/**
 * Pkg60 — Live/Call/Party Poll-Interval Load Test
 * --------------------------------------------------
 * Simulates N concurrent users polling live/call/party tables at a
 * configurable interval, then projects per-minute DB read load,
 * monthly Supabase egress and the Pkg53 realtime cost guard headroom.
 *
 * It does NOT hit production. It models the cost so we can audit a
 * proposed poll-interval change BEFORE shipping it.
 *
 * Usage:
 *   node scripts/load-test-live-call-audit.mjs                 # default: 10k users
 *   node scripts/load-test-live-call-audit.mjs --users=25000 --interval=30000
 *   node scripts/load-test-live-call-audit.mjs --interval=800  # ⚠ reproduces the $1400 bug
 *   node scripts/load-test-live-call-audit.mjs --json          # machine readable
 *
 * Flags:
 *   --users         concurrent online users           (default 10000)
 *   --interval      poll interval in ms               (default 30000, Pkg57 baseline)
 *   --duration      simulated minutes                 (default 60)
 *   --avgRowBytes   avg bytes per polled row          (default 380)
 *   --rtThrottleHz  per-topic realtime cap (Pkg53)    (default 2)   // 500ms throttle => 2 evt/s
 *   --rtHourlyCap   hourly realtime event hard cap    (default 50000)
 *   --json          emit JSON only
 */

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);

const USERS         = Number(args.users ?? 10_000);
const INTERVAL_MS   = Number(args.interval ?? 30_000);
const DURATION_MIN  = Number(args.duration ?? 60);
const AVG_ROW_BYTES = Number(args.avgRowBytes ?? 380);
const RT_HZ         = Number(args.rtThrottleHz ?? 2);
const RT_HOURLY_CAP = Number(args.rtHourlyCap ?? 50_000);
const AS_JSON       = !!args.json;

// Workload mix per online user (calibrated against our prod telemetry).
// Each entry: avg rows returned per poll, fraction of users that poll it.
const TABLES = {
  live_streams:       { rows: 12, fraction: 0.55 }, // browsing feed
  private_calls:       { rows: 1,  fraction: 0.08 }, // active/ringing
  party_rooms:         { rows: 8,  fraction: 0.30 }, // party listing
  party_room_members:  { rows: 14, fraction: 0.18 }, // inside a party
  gift_transactions:   { rows: 6,  fraction: 0.12 }, // gift feed tail
};

// ── Derive load ──────────────────────────────────────────────────────────────
const pollsPerUserPerMin = 60_000 / INTERVAL_MS;
const totalUserPollsPerMin = USERS * pollsPerUserPerMin;

let readsPerMin = 0;
let rowsPerMin  = 0;
const perTable  = {};

for (const [name, def] of Object.entries(TABLES)) {
  const polls = totalUserPollsPerMin * def.fraction;
  const rows  = polls * def.rows;
  perTable[name] = {
    polls_per_min: Math.round(polls),
    rows_per_min:  Math.round(rows),
    bytes_per_min: Math.round(rows * AVG_ROW_BYTES),
  };
  readsPerMin += polls;
  rowsPerMin  += rows;
}

const egressBytesPerMin   = rowsPerMin * AVG_ROW_BYTES;
const egressGBPerMonth    = (egressBytesPerMin * 60 * 24 * 30) / 1024 ** 3;
const realtimeEvtPerHour  = Math.min(
  USERS * RT_HZ * 3600,   // theoretical max if every user emitted at cap
  RT_HOURLY_CAP * 1,      // Pkg53 hourly hard cap (per topic)
);
const killSwitchTrip      = (USERS * RT_HZ * 3600) > RT_HOURLY_CAP;

// Reference baselines for context
const BASELINE_30S = (USERS * (60_000 / 30_000));
const ratioVsBaseline = totalUserPollsPerMin / BASELINE_30S;

// ── Threshold checks ─────────────────────────────────────────────────────────
const warnings = [];
if (INTERVAL_MS < 5_000)
  warnings.push(`Poll interval ${INTERVAL_MS}ms is below 5s — reproduces the Pkg57 $1400 bill pattern.`);
if (readsPerMin > 100_000)
  warnings.push(`Reads/min (${Math.round(readsPerMin).toLocaleString()}) exceeds 100k — Pkg59 cost_monitor will alert.`);
if (egressGBPerMonth > 250)
  warnings.push(`Projected egress ${egressGBPerMonth.toFixed(1)} GB/mo exceeds Supabase Pro 250 GB free tier.`);
if (killSwitchTrip)
  warnings.push(`Realtime fanout would trip Pkg53 hourly cap (${RT_HOURLY_CAP}/h) — kill switch auto-OFF.`);
if (ratioVsBaseline > 6)
  warnings.push(`Load is ${ratioVsBaseline.toFixed(1)}× the 30s baseline — review before shipping.`);

// ── Output ───────────────────────────────────────────────────────────────────
const report = {
  config: { USERS, INTERVAL_MS, DURATION_MIN, AVG_ROW_BYTES, RT_HZ, RT_HOURLY_CAP },
  totals: {
    polls_per_min:      Math.round(totalUserPollsPerMin),
    reads_per_min:      Math.round(readsPerMin),
    rows_per_min:       Math.round(rowsPerMin),
    egress_mb_per_min:  +(egressBytesPerMin / 1024 ** 2).toFixed(2),
    egress_gb_per_month:+egressGBPerMonth.toFixed(2),
    realtime_evt_per_hr:realtimeEvtPerHour,
    ratio_vs_30s_baseline: +ratioVsBaseline.toFixed(2),
    pkg53_kill_switch_trip: killSwitchTrip,
  },
  per_table: perTable,
  warnings,
};

if (AS_JSON) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(warnings.length ? 1 : 0);
}

const fmt = (n) => Number(n).toLocaleString();
console.log("");
console.log("┌─ Pkg60 Live/Call/Party Poll-Interval Load Test ─────────────────┐");
console.log(`│  Users: ${fmt(USERS).padEnd(8)}  Poll interval: ${INTERVAL_MS}ms`.padEnd(67) + "│");
console.log(`│  Duration: ${DURATION_MIN} min          Row size: ${AVG_ROW_BYTES} B`.padEnd(67) + "│");
console.log("├──────────────────────────────────────────────────────────────────┤");
console.log(`│  Polls/min        : ${fmt(report.totals.polls_per_min).padStart(14)}`.padEnd(67) + "│");
console.log(`│  Reads/min        : ${fmt(report.totals.reads_per_min).padStart(14)}`.padEnd(67) + "│");
console.log(`│  Rows/min         : ${fmt(report.totals.rows_per_min).padStart(14)}`.padEnd(67) + "│");
console.log(`│  Egress           : ${(report.totals.egress_mb_per_min + " MB/min").padStart(14)}`.padEnd(67) + "│");
console.log(`│  Egress           : ${(report.totals.egress_gb_per_month + " GB/mo").padStart(14)}`.padEnd(67) + "│");
console.log(`│  Realtime evt/hr  : ${fmt(report.totals.realtime_evt_per_hr).padStart(14)}`.padEnd(67) + "│");
console.log(`│  vs 30s baseline  : ${(report.totals.ratio_vs_30s_baseline + "×").padStart(14)}`.padEnd(67) + "│");
console.log("├──────────────────────────────────────────────────────────────────┤");
for (const [name, t] of Object.entries(perTable)) {
  console.log(`│  ${name.padEnd(20)} ${fmt(t.reads_per_min ?? t.polls_per_min).padStart(10)} reads/min  ${fmt(t.rows_per_min).padStart(10)} rows`.padEnd(67) + "│");
}
console.log("└──────────────────────────────────────────────────────────────────┘");

if (warnings.length) {
  console.log("\n⚠  Warnings:");
  for (const w of warnings) console.log("   • " + w);
  process.exit(1);
} else {
  console.log("\n✓ Within safe operating envelope.");
}
