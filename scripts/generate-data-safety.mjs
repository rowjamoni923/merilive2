#!/usr/bin/env node
/**
 * Pkg232 / M26 — Play Store Data Safety form helper
 *
 * Auto-generates a Markdown checklist matching the Play Console "Data safety"
 * questionnaire by inspecting:
 *   - android/app/src/main/AndroidManifest.xml  (permissions)
 *   - supabase schema knowledge baked below     (data types collected)
 *
 * Output: /mnt/documents/data-safety-form.md
 *
 * Run:  node scripts/generate-data-safety.mjs
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const manifestPath = resolve(root, 'android/app/src/main/AndroidManifest.xml');
const outPath = '/mnt/documents/data-safety-form.md';

const manifest = readFileSync(manifestPath, 'utf8');
const perms = [...manifest.matchAll(/uses-permission android:name="([^"]+)"/g)].map(m => m[1].replace('android.permission.', ''));

// Map manifest perms → Play Console "Data type" rows
const PERM_TO_DATATYPE = {
  CAMERA: { category: 'Photos and videos', type: 'Photos / Videos', purposes: ['App functionality', 'Account management'], shared: false, optional: true, ephemeral: false, note: 'Live streaming + profile photo + private video calls' },
  RECORD_AUDIO: { category: 'Audio files', type: 'Voice or sound recordings', purposes: ['App functionality'], shared: false, optional: true, ephemeral: true, note: 'Streamed live to other participants via LiveKit SFU; not stored unless user records' },
  ACCESS_FINE_LOCATION: { category: 'Location', type: 'Precise location', purposes: ['App functionality'], shared: false, optional: true, ephemeral: true, note: 'Only when user explicitly tags location on a post' },
  ACCESS_COARSE_LOCATION: { category: 'Location', type: 'Approximate location', purposes: ['App functionality', 'Analytics'], shared: false, optional: true, ephemeral: false, note: 'Country/region for content discovery' },
  READ_MEDIA_IMAGES: { category: 'Photos and videos', type: 'Photos', purposes: ['App functionality'], shared: false, optional: true, ephemeral: false, note: 'Uploaded to chat/feed/profile via Android 13+ Photo Picker' },
  READ_MEDIA_VIDEO: { category: 'Photos and videos', type: 'Videos', purposes: ['App functionality'], shared: false, optional: true, ephemeral: false, note: 'Uploaded to feed/chat' },
  READ_MEDIA_AUDIO: { category: 'Audio files', type: 'Music files / other audio files', purposes: ['App functionality'], shared: false, optional: true, ephemeral: false, note: 'Voice messages' },
  POST_NOTIFICATIONS: { category: 'App activity', type: 'In-app actions', purposes: ['App functionality'], shared: false, optional: true, ephemeral: true, note: 'Push notifications via FCM' },
  READ_PHONE_STATE: { category: 'Device or other IDs', type: 'Device or other IDs', purposes: ['App functionality'], shared: false, optional: false, ephemeral: false, note: 'Telecom / ConnectionService — to pause media during a real phone call' },
};

// Supabase-driven data types (manually curated — keep in sync with public schema)
const SUPABASE_DATA = [
  { category: 'Personal info', type: 'Name', purposes: ['Account management', 'App functionality'], shared: false, optional: true, note: 'profiles.full_name / display_name' },
  { category: 'Personal info', type: 'Email address', purposes: ['Account management'], shared: false, optional: false, note: 'auth.users.email for authentication and password recovery' },
  { category: 'Personal info', type: 'User IDs', purposes: ['Account management', 'App functionality', 'Analytics'], shared: false, optional: false, note: 'Supabase auth.uid for RLS' },
  { category: 'Personal info', type: 'Phone number', purposes: ['Account management'], shared: false, optional: true, note: 'Phone-OTP sign-in (optional)' },
  { category: 'Photos and videos', type: 'Photos', purposes: ['App functionality'], shared: false, optional: true, note: 'Profile photo + feed posts in storage buckets' },
  { category: 'Messages', type: 'Other in-app messages', purposes: ['App functionality'], shared: false, optional: true, ephemeral: false, note: 'DM + room chat in messages / chat_messages tables — end-to-end TLS, at-rest encryption by Supabase' },
  { category: 'Financial info', type: 'Purchase history', purposes: ['App functionality', 'Account management'], shared: false, optional: false, note: 'Coin / VIP purchase records (Google Play Billing). Card details NEVER touch our backend — handled by Google Play.' },
  { category: 'App activity', type: 'App interactions', purposes: ['Analytics', 'App functionality'], shared: false, optional: false, note: 'Stream joins, gift sends, room actions for leaderboard & analytics' },
  { category: 'App info and performance', type: 'Crash logs', purposes: ['Analytics'], shared: true, optional: true, note: 'Firebase Crashlytics — user opt-out via Settings → Privacy' },
  { category: 'App info and performance', type: 'Diagnostics', purposes: ['Analytics'], shared: true, optional: true, note: 'Firebase Analytics — user opt-out via Settings → Privacy' },
  { category: 'Device or other IDs', type: 'Device or other IDs', purposes: ['Analytics', 'App functionality'], shared: true, optional: false, note: 'FCM token + Android ID for push delivery' },
];

const rows = [
  ...Object.entries(PERM_TO_DATATYPE)
    .filter(([p]) => perms.includes(p))
    .map(([perm, d]) => ({ ...d, source: `perm:${perm}` })),
  ...SUPABASE_DATA.map(d => ({ ...d, source: 'supabase' })),
];

// Deduplicate by category+type
const dedup = new Map();
for (const r of rows) {
  const k = `${r.category}::${r.type}`;
  if (!dedup.has(k)) dedup.set(k, r);
  else {
    const ex = dedup.get(k);
    ex.purposes = [...new Set([...(ex.purposes || []), ...(r.purposes || [])])];
    ex.note = [ex.note, r.note].filter(Boolean).join(' | ');
  }
}
const final = [...dedup.values()].sort((a, b) =>
  (a.category + a.type).localeCompare(b.category + b.type),
);

const today = new Date().toISOString().slice(0, 10);
const lines = [
  `# Play Store Data Safety — auto-generated draft`,
  ``,
  `_Generated: ${today} by \`scripts/generate-data-safety.mjs\`_`,
  ``,
  `Copy these answers into **Play Console → App content → Data safety**. Review each row before submitting.`,
  ``,
  `## Security practices`,
  ``,
  `- [x] **Data is encrypted in transit** — All Supabase calls go over HTTPS / TLS 1.2+. LiveKit signalling + media use WSS / DTLS-SRTP.`,
  `- [x] **You can request that data be deleted** — Account deletion endpoint available in Settings → Account → Delete account.`,
  `- [x] **Committed to Play Families Policy** — N/A (18+ live-streaming app).`,
  `- [x] **Independent security review** — Supabase is SOC 2 Type 2 + HIPAA-eligible.`,
  ``,
  `## Data collection summary`,
  ``,
  `| Category | Data type | Collected | Shared | Optional | Ephemeral | Purposes | Notes |`,
  `|---|---|---|---|---|---|---|---|`,
  ...final.map(r =>
    `| ${r.category} | ${r.type} | ✅ | ${r.shared ? '✅' : '❌'} | ${r.optional ? '✅' : '❌'} | ${r.ephemeral ? '✅' : '❌'} | ${(r.purposes || []).join(', ')} | ${r.note || ''} |`,
  ),
  ``,
  `## Manifest permissions snapshot`,
  ``,
  '```',
  ...perms.sort().map(p => `android.permission.${p}`),
  '```',
  ``,
  `## Manual review checklist before submitting`,
  ``,
  `- [ ] Confirm no third-party SDK silently collects additional data (check FCM, LiveKit, Crashlytics, Play Billing).`,
  `- [ ] Add Privacy Policy URL: https://merilive.com/privacy`,
  `- [ ] If you ship advertising IDs in future, add **Advertising or marketing** purpose.`,
  `- [ ] Re-run this script whenever you add a new permission or Supabase table that stores user data.`,
  ``,
];

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, lines.join('\n'));
console.log(`✓ wrote ${outPath}  (${final.length} data rows, ${perms.length} manifest perms)`);
