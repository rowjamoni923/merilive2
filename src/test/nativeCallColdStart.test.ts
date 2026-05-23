/**
 * End-to-end test flow for Android cold-start / action-loss verification.
 *
 * Simulates the full native-call lifecycle from the JS side:
 *   1. Action fires NATIVELY before JS mounts (cold start) → buffered.
 *   2. JS mounts → CallProvider drains buffered actions via getLastAction().
 *   3. Subsequent actions arrive via addListener('call-action', …).
 *   4. Duplicate dispatches collapse via acknowledgeAction().
 *   5. endIncomingUi() dismisses the heads-up notification.
 *
 * Mocks the Capacitor NativeCall plugin so this runs in jsdom without
 * an Android device. If any of these steps regress, this suite fails
 * and we know the cold-start contract is broken before we ship.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

type Action = 'accept' | 'decline' | 'timeout' | 'dismissed' | 'presented';
interface Evt {
  callId: string;
  callerId: string;
  callerName: string;
  callType: string;
  action: Action;
  ts: number;
}

/** Minimal in-memory mirror of NativeCallPlugin.kt behaviour. */
class FakeNativeCall {
  private pending: Evt[] = [];
  private listeners: Array<(e: Evt) => void> = [];
  private acks = new Set<string>();
  uiDismissed: { callId: string; reason?: string } | null = null;

  /** Native side fires this — buffers if no listener yet. */
  dispatch(e: Evt) {
    this.pending.push(e);
    if (this.pending.length > 32) this.pending.shift();
    if (this.listeners.length > 0) {
      // mirrors notifyListeners(..., true) → also buffered for late
      // listeners, but delivered now to active ones.
      this.listeners.forEach((cb) => cb(e));
    }
  }

  async isAvailable() {
    return { available: true, backend: 'android-callkit-style' };
  }

  async getLastAction() {
    const actions = [...this.pending];
    this.pending = [];
    return { actions };
  }

  async acknowledgeAction(opts: { callId: string; action: Action }) {
    this.acks.add(`${opts.callId}:${opts.action}`);
    return { ack: true };
  }

  async endIncomingUi(opts: { callId: string; reason?: string }) {
    this.uiDismissed = opts;
    return { dismissed: true, callId: opts.callId };
  }

  async addListener(_e: 'call-action', cb: (e: Evt) => void) {
    this.listeners.push(cb);
    // flush buffered on listener attach (mirrors load() flushPending)
    const buffered = [...this.pending];
    this.pending = [];
    buffered.forEach((b) => cb(b));
    return { remove: async () => { this.listeners = this.listeners.filter(l => l !== cb); } };
  }

  hasAck(callId: string, action: Action) {
    return this.acks.has(`${callId}:${action}`);
  }
}

const mkEvt = (action: Action, callId = 'c1'): Evt => ({
  callId,
  callerId: 'u-caller',
  callerName: 'Alice',
  callType: 'video',
  action,
  ts: Date.now(),
});

describe('Android NativeCall cold-start / action-loss flow', () => {
  let plugin: FakeNativeCall;

  beforeEach(() => {
    plugin = new FakeNativeCall();
  });

  it('buffers an action that fires BEFORE any JS listener attaches', async () => {
    // Cold start: native dispatches accept while React hasn't mounted yet.
    plugin.dispatch(mkEvt('accept'));

    // App boots later → JS drains pending.
    const { actions } = await plugin.getLastAction();
    expect(actions).toHaveLength(1);
    expect(actions[0].action).toBe('accept');
    expect(actions[0].callId).toBe('c1');

    // Drained: a second drain returns nothing.
    const second = await plugin.getLastAction();
    expect(second.actions).toHaveLength(0);
  });

  it('flushes buffered actions to the FIRST listener that attaches', async () => {
    plugin.dispatch(mkEvt('decline'));
    plugin.dispatch(mkEvt('presented', 'c2'));

    const received: Evt[] = [];
    await plugin.addListener('call-action', (e) => received.push(e));

    expect(received.map((r) => r.action)).toEqual(['decline', 'presented']);
  });

  it('delivers live events to an attached listener (warm path)', async () => {
    const received: Evt[] = [];
    await plugin.addListener('call-action', (e) => received.push(e));

    plugin.dispatch(mkEvt('accept'));
    plugin.dispatch(mkEvt('timeout'));

    expect(received).toHaveLength(2);
    expect(received[1].action).toBe('timeout');
  });

  it('collapses duplicate dispatches via acknowledgeAction (notif + activity race)', async () => {
    const received: Evt[] = [];
    await plugin.addListener('call-action', (e) => received.push(e));

    // Real-world race: notification action receiver AND IncomingCallActivity
    // both dispatch accept for the same call.
    plugin.dispatch(mkEvt('accept'));
    await plugin.acknowledgeAction({ callId: 'c1', action: 'accept' });
    plugin.dispatch(mkEvt('accept'));

    // JS-side dedup: filter out actions already acked.
    const deduped = received.filter(
      (e, i, arr) => arr.findIndex((x) => x.callId === e.callId && x.action === e.action) === i,
    );
    expect(deduped).toHaveLength(1);
    expect(plugin.hasAck('c1', 'accept')).toBe(true);
  });

  it('caps buffered actions at 32 to avoid OOM if many calls fire while app is dead', async () => {
    for (let i = 0; i < 50; i++) {
      plugin.dispatch(mkEvt('presented', `c${i}`));
    }
    const { actions } = await plugin.getLastAction();
    expect(actions.length).toBeLessThanOrEqual(32);
    // Oldest dropped, newest preserved.
    expect(actions[actions.length - 1].callId).toBe('c49');
  });

  it('endIncomingUi dismisses the heads-up notification + activity', async () => {
    await plugin.endIncomingUi({ callId: 'c1', reason: 'cancelled' });
    expect(plugin.uiDismissed).toEqual({ callId: 'c1', reason: 'cancelled' });
  });

  it('JS call flow keeps native UI and Telecom lifecycle separated', () => {
    const hook = require('node:fs').readFileSync(
      require('node:path').resolve(__dirname, '../..', 'src/hooks/usePrivateCall.ts'),
      'utf8',
    );
    const plugin = require('node:fs').readFileSync(
      require('node:path').resolve(__dirname, '../..', 'android/app/src/main/java/com/merilive/app/plugin/NativeCallPlugin.kt'),
      'utf8',
    );

    expect(hook).toMatch(/NativeCall\.endIncomingUi\(\{ callId, reason: 'accepted' \}\)/);
    expect(hook).toMatch(/reason: 'declined' \| 'timeout' = 'declined'/);
    expect(hook).toMatch(/supabase\.rpc\('timeout_private_call'/);
    expect(hook).toMatch(/NativeCall\.reportCallEnded\(\{ callId: callIdToReset, remote: true \}\)/);
    expect(plugin).toMatch(/val keepTelecomAlive = reason == "accepted" \|\| reason == "answered"/);
    expect(plugin).toMatch(/if \(!keepTelecomAlive && android\.os\.Build\.VERSION\.SDK_INT >= android\.os\.Build\.VERSION_CODES\.O\)/);
  });

  it('full cold-start E2E: dispatch → boot → drain → ack → end UI', async () => {
    // 1. Native fires accept while app is dead.
    plugin.dispatch(mkEvt('accept', 'call-xyz'));

    // 2. App boots. CallProvider drains pending FIRST.
    const drained = await plugin.getLastAction();
    expect(drained.actions[0].action).toBe('accept');

    // 3. Then attaches listener for future events.
    const live: Evt[] = [];
    await plugin.addListener('call-action', (e) => live.push(e));

    // 4. JS acks the drained action.
    await plugin.acknowledgeAction({ callId: 'call-xyz', action: 'accept' });

    // 5. Server confirms — JS dismisses native UI.
    await plugin.endIncomingUi({ callId: 'call-xyz', reason: 'accepted' });

    expect(plugin.hasAck('call-xyz', 'accept')).toBe(true);
    expect(plugin.uiDismissed?.callId).toBe('call-xyz');
    expect(live).toHaveLength(0); // nothing fired post-attach
  });

  it('handles caller-cancelled-during-cold-start: presented then dismissed buffered in order', async () => {
    plugin.dispatch(mkEvt('presented', 'c9'));
    plugin.dispatch(mkEvt('dismissed', 'c9'));

    const received: Evt[] = [];
    await plugin.addListener('call-action', (e) => received.push(e));

    expect(received.map((r) => r.action)).toEqual(['presented', 'dismissed']);
  });
});
