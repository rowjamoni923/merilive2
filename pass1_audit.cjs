const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const routes = fs.readFileSync('/tmp/browser/pass1/routes.txt', 'utf8').trim().split('\n');
const SHOTS = '/tmp/browser/pass1/shots';
const BASE = 'http://localhost:8080';

function slugify(route) {
  return route.replace(/^\//, '').replace(/\//g, '_') || 'root';
}

async function restoreSession(context, page) {
  const cookiesJson = process.env.LOVABLE_BROWSER_SUPABASE_COOKIES_JSON;
  const storageKey = process.env.LOVABLE_BROWSER_SUPABASE_STORAGE_KEY;
  const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;

  if (cookiesJson) {
    try {
      const cookies = JSON.parse(cookiesJson).map(c => ({ ...c, url: c.url || BASE }));
      await context.addCookies(cookies);
    } catch (e) {
      console.error('cookie restore failed', e.message);
    }
  }

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});

  if (storageKey && sessionJson) {
    await page.evaluate(({ key, val }) => {
      try { localStorage.setItem(key, val); } catch (e) {}
    }, { key: storageKey, val: sessionJson }).catch(()=>{});
  }
  return { hadCookies: !!cookiesJson, hadStorage: !!(storageKey && sessionJson) };
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: '/bin/chromium', args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
  const page = await context.newPage();

  const sessionInfo = await restoreSession(context, page);

  // Verify /admin loads without redirect
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(()=>{});
  const adminUrlAfter = page.url();
  fs.writeFileSync('/tmp/browser/pass1/session-check.json', JSON.stringify({
    sessionInfo, adminUrlAfter
  }, null, 2));

  const results = [];

  for (const route of routes) {
    const consoleErrors = [];
    const failedRequests = [];

    const onConsole = msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
    };
    const onResponse = resp => {
      const status = resp.status();
      if (status >= 400) {
        failedRequests.push(`${status} ${resp.url().slice(0, 200)}`);
      }
    };
    page.on('console', onConsole);
    page.on('response', onResponse);

    let notes = '';
    let navError = '';
    try {
      await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 20000 });
    } catch (e) {
      navError = 'networkidle-timeout';
      try {
        await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await page.waitForTimeout(3000);
      } catch (e2) {
        navError += '; domcontentloaded-failed: ' + e2.message.slice(0, 150);
      }
    }

    // wait a tiny bit more for react render
    await page.waitForTimeout(500);

    const slug = slugify(route);
    const screenshotPath = path.join(SHOTS, `${slug}.png`);
    try {
      await page.screenshot({ path: screenshotPath });
    } catch (e) {
      notes += `screenshot-failed:${e.message.slice(0,100)};`;
    }

    let data = {};
    try {
      data = await page.evaluate(() => {
        const body = document.body.innerText || '';
        const h1 = document.querySelector('h1');
        const statCards = document.querySelectorAll('div[class*="stat"], [data-stat-card]').length;
        const tables = document.querySelectorAll('table').length;
        const emptyStates = document.querySelectorAll('[class*="empty-state"], [data-empty-state], [class*="EmptyState"]').length;

        const allEls = Array.from(document.querySelectorAll('*'));
        let tinyTextCount = 0;
        let neonGradientCount = 0;
        let hardcodedWhiteOnWhite = 0;

        for (const el of allEls) {
          const cls = el.getAttribute('class') || '';
          if (/text-\[10px\]|text-\[11px\]/.test(cls)) tinyTextCount++;
          if (/border-gradient|from-\w+-500.*to-\w+-500/.test(cls)) neonGradientCount++;
          if (/bg-white/.test(cls) && /text-white/.test(cls)) hardcodedWhiteOnWhite++;
        }

        const isAccessDenied = /access denied/i.test(body);
        const isLoading = /loading\.\.\./i.test(body) && body.trim().length < 500;

        return {
          title: document.title || '',
          h1: h1 ? h1.textContent.trim().slice(0, 100) : '',
          statCards, tables, emptyStates,
          tinyTextCount, neonGradientCount, hardcodedWhiteOnWhite,
          isAccessDenied, isLoading,
          bodySnippet: body.slice(0, 80),
        };
      });
    } catch (e) {
      notes += `evaluate-failed:${e.message.slice(0,100)};`;
    }

    if (navError) notes += navError + ';';

    results.push({
      route,
      finalUrl: page.url(),
      title: data.title || '',
      h1: data.h1 || '',
      statCards: data.statCards ?? 0,
      tables: data.tables ?? 0,
      emptyStates: data.emptyStates ?? 0,
      tinyTextCount: data.tinyTextCount ?? 0,
      neonGradientCount: data.neonGradientCount ?? 0,
      hardcodedWhiteOnWhite: data.hardcodedWhiteOnWhite ?? 0,
      consoleErrors: consoleErrors.length,
      consoleErrorsSample: consoleErrors.slice(0,3).join(' | '),
      failedRequests: failedRequests.length,
      failedRequestsSample: failedRequests.slice(0,3).join(' | '),
      screenshotPath,
      isAccessDenied: !!data.isAccessDenied,
      isLoading: !!data.isLoading,
      notes: notes.trim(),
    });

    page.off('console', onConsole);
    page.off('response', onResponse);
    console.error(`done: ${route}`);
  }

  fs.writeFileSync('/tmp/browser/pass1/results.json', JSON.stringify(results, null, 2));
  await browser.close();
}

main().catch(e => { console.error('FATAL', e); process.exit(1); });
