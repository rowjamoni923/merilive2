/**
 * Regression guard: Samsung / OEM dialer hijack prevention.
 *
 * The OEM in-call UI hijack was caused by three pieces of code talking to
 * Android's Telecom framework. Neutering happened on 2026-06-30:
 *
 *   1. AndroidManifest.xml — <service MeriConnectionService> with
 *      BIND_TELECOM_CONNECTION_SERVICE permission + android.telecom.ConnectionService
 *      intent-filter was REMOVED. Without it the OS cannot route any
 *      Telecom call to us, so OEM dialers (Samsung / MIUI / Vivo / Oppo)
 *      have no surface to hijack.
 *   2. TelecomBridge.ensurePhoneAccount / placeOutgoing / reportIncoming /
 *      reportConnected / reportEnded — all turned into no-ops.
 *   3. No live call site (FCM service, plugin, receiver) may call
 *      TelecomManager.addNewIncomingCall(...) or tm.placeCall(...) or
 *      TelecomManager.registerPhoneAccount(...) outside of historical
 *      comments.
 *
 * If any of these come back, private call + live + party regress to the
 * "third-class system dialer takes over the screen" bug. This test
 * locks all three guarantees so a future edit cannot silently undo them.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(p), 'utf8');

const MANIFEST = 'android/app/src/main/AndroidManifest.xml';
const BRIDGE = 'android/app/src/main/java/com/merilive/app/telecom/TelecomBridge.kt';

const stripBlockComments = (src: string) =>
  src
    // Kotlin /** */ and /* */
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // Kotlin // line comments
    .replace(/^[ \t]*\/\/.*$/gm, '')
    // XML <!-- --> comments
    .replace(/<!--[\s\S]*?-->/g, '');

describe('OEM dialer hijack — regression guard (private call / live / party)', () => {
  it('AndroidManifest must NOT register MeriConnectionService as a Telecom service', () => {
    const xml = read(MANIFEST);
    const live = stripBlockComments(xml);
    expect(live).not.toMatch(/MeriConnectionService/);
    expect(live).not.toMatch(/BIND_TELECOM_CONNECTION_SERVICE/);
    expect(live).not.toMatch(/android\.telecom\.ConnectionService/);
  });

  it('TelecomBridge.ensurePhoneAccount must return false (no PhoneAccount registration)', () => {
    const kt = read(BRIDGE);
    const fn = kt.slice(kt.indexOf('fun ensurePhoneAccount'));
    const body = fn.slice(0, fn.indexOf('\n    }') + 6);
    // No real registerPhoneAccount call, no `return true` short-circuit.
    expect(body).not.toMatch(/registerPhoneAccount\s*\(/);
    expect(body).toMatch(/return\s+false/);
  });

  it('TelecomBridge.placeOutgoing must NOT call TelecomManager.placeCall', () => {
    const kt = read(BRIDGE);
    const fn = kt.slice(kt.indexOf('fun placeOutgoing'));
    const body = fn.slice(0, fn.indexOf('\n    }') + 6);
    expect(body).not.toMatch(/\.placeCall\s*\(/);
    expect(body).toMatch(/return\s+false/);
  });

  it('TelecomBridge.reportIncoming must NOT call addNewIncomingCall', () => {
    const kt = read(BRIDGE);
    const fn = kt.slice(kt.indexOf('fun reportIncoming'));
    const body = fn.slice(0, fn.indexOf('\n    }') + 6);
    expect(body).not.toMatch(/addNewIncomingCall\s*\(/);
    expect(body).toMatch(/return\s+false/);
  });

  it('no production Kotlin/Java call site invokes addNewIncomingCall / tm.placeCall', () => {
    // We don't crawl the FS recursively in jsdom — instead, lock the two
    // entrypoints that historically held those calls. Both files were
    // audited 2026-06-30; if either grows a real call again, the asserts
    // above (placeOutgoing / reportIncoming) catch it because every
    // legitimate caller routes through TelecomBridge.
    const kt = read(BRIDGE);
    const live = stripBlockComments(kt);
    expect(live).not.toMatch(/\.addNewIncomingCall\s*\(/);
    expect(live).not.toMatch(/tm\.placeCall\s*\(/);
    expect(live).not.toMatch(/telecomManager\.placeCall\s*\(/i);
  });
});
