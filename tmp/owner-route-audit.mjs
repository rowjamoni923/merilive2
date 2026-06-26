import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const baseURL = process.env.AUDIT_BASE_URL || 'http://localhost:8080';
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const ownerPairs = [[process.env.OWNER_EMAIL_1, process.env.OWNER_PASSWORD_1], [process.env.OWNER_EMAIL_2, process.env.OWNER_PASSWORD_2]].filter(([e,p]) => e && p);
const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY || 'sb-ayjdlvuurscxucatbbah-auth-token';

const routes = [
  '/', '/auth', '/search', '/leaderboard', '/live', '/discover', '/create', '/go-live', '/create-party',
  '/reels', '/profile', '/profile/00000000-0000-0000-0000-000000000000', '/live-feed', '/match-call',
  '/party-rooms', '/chat', '/messages', '/call-history', '/recharge', '/top-up', '/my-beans', '/vip',
  '/level', '/shop', '/agency-dashboard', '/agency', '/agency-details', '/agency-withdrawal', '/agency-transfer-history',
  '/agency-commission-history', '/agency-host-management', '/invitation', '/tasks', '/edit-profile', '/settings', '/ai-chat', '/user-id'
];
function scrub(s) { return String(s || '').replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer ***').replace(/eyJ[A-Za-z0-9._-]+/g, 'jwt***').slice(0, 600); }
async function getSession() {
  if (process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON) { try { return JSON.parse(process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON); } catch {} }
  if (!supabaseUrl || !supabaseKey || ownerPairs.length === 0) throw new Error('Missing audit credentials/env');
  const sb = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const errors = [];
  for (const [email, password] of ownerPairs) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (data?.session) return data.session;
    errors.push(error?.message || 'no session');
  }
  throw new Error('Owner sign-in failed: ' + errors.join(' | '));
}
const session = await getSession();
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/bin/chromium' });
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 MeriLive-Audit' });
await context.addInitScript(({ storageKey, session }) => {
  localStorage.setItem(storageKey, JSON.stringify(session));
  localStorage.setItem('meri_onboarding_seen', 'true');
  sessionStorage.setItem('rating_popup_dismissed', 'true');
}, { storageKey, session });
const out = [];
for (const route of routes) {
  const page = await context.newPage();
  const errors = [], failed = [], responses = [];
  page.on('console', msg => { const t = msg.type(), text = msg.text(); if (['error','warning'].includes(t) && !/favicon|preload|Audit|Download the React DevTools/.test(text)) errors.push(`${t}: ${scrub(text)}`); });
  page.on('pageerror', err => errors.push(`pageerror: ${scrub(err.message)}`));
  page.on('requestfailed', req => { const url = req.url(); if (!/analytics|google|favicon|blob:|data:/.test(url)) failed.push(`${req.method()} ${url.replace(baseURL,'')} :: ${req.failure()?.errorText}`); });
  page.on('response', resp => { const st = resp.status(), url = resp.url(); if (st >= 400 && !/favicon|analytics|google|blob:|data:/.test(url)) responses.push(`${st} ${url.replace(baseURL,'')}`); });
  const t0 = Date.now(); let finalUrl = '', visibleText = '', blank = false;
  try { await page.goto(baseURL + route, { waitUntil: 'domcontentloaded', timeout: 18000 }); await page.waitForTimeout(1600); finalUrl = page.url().replace(baseURL, ''); visibleText = await page.locator('body').innerText({ timeout: 1500 }).catch(() => ''); blank = visibleText.trim().length < 15; }
  catch (e) { errors.push(`goto: ${scrub(e.message)}`); }
  out.push({ route, finalUrl, ms: Date.now() - t0, blank, text: scrub(visibleText.trim().replace(/\s+/g, ' ')).slice(0, 180), errors: errors.slice(0,5), failed: failed.slice(0,5), responses: responses.slice(0,8) });
  await page.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 2));
