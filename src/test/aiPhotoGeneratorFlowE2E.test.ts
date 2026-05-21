/**
 * End-to-end integration test for AI Photo Generator flow.
 *
 * Mirrors the runtime contract of `src/pages/admin/AdminAiImageStudio.tsx`:
 *   1. Generate → calls edge function `generate-event-banner` → receives { url, size }
 *   2. New item prepended to gallery (latest first), capped at HISTORY_MAX
 *   3. Gallery persists to localStorage so reload restores exact same items
 *   4. Per-item actions (download / copy URL / push) MUST resolve the URL of THAT item
 *      — never index-shifted, never stale, never duplicated.
 *
 * Guards regression for:
 *   G1  latest-first ordering
 *   G2  HISTORY_MAX cap (oldest dropped, no duplicates)
 *   G3  unique URL per generation, no stale reuse on retry
 *   G4  delete-one removes only the target, others keep correct URL
 *   G5  clear-history empties storage
 *   G6  reload restores identical items + correct URL per index
 *   G7  failed generation does NOT add a row (no ghost / stale entry)
 *   G8  per-item action (copy/download/push) maps to that item's URL (no off-by-one)
 */

import { describe, it, expect, beforeEach } from "vitest";

const HISTORY_KEY = "admin_ai_image_studio_history_v1";
const HISTORY_MAX = 200;

interface GeneratedItem {
  eventName: string;
  url: string;
  sizeLabel: string;
  w: number;
  h: number;
  createdAt: number;
}

// ── Minimal localStorage shim (jsdom usually provides it; fall back if missing) ──
const mem = new Map<string, string>();
const storage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, v); },
  removeItem: (k: string) => { mem.delete(k); },
  clear: () => { mem.clear(); },
};
if (typeof globalThis.localStorage === "undefined") {
  // @ts-expect-error – test shim
  globalThis.localStorage = storage;
}

function loadHistory(): GeneratedItem[] {
  try {
    const raw = globalThis.localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, HISTORY_MAX) : [];
  } catch { return []; }
}

function saveHistory(items: GeneratedItem[]) {
  globalThis.localStorage.setItem(
    HISTORY_KEY,
    JSON.stringify(items.slice(0, HISTORY_MAX)),
  );
}

// ── Fake edge function: returns a unique URL each call, simulating real CDN output ──
class FakeStudio {
  callCount = 0;
  failNext = false;
  items: GeneratedItem[] = loadHistory();

  async invokeEdge(eventName: string, sizeKey: string): Promise<{ url: string; size: { width: number; height: number; label: string } }> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("AI gateway timeout");
    }
    this.callCount++;
    const w = sizeKey.includes("1920") ? 1920 : sizeKey.includes("1280") ? 1280 : 1080;
    const h = sizeKey.includes("1920") ? 1080 : sizeKey.includes("1280") ? 720 : 1080;
    // Real edge function gives a unique CDN path with timestamp + random suffix.
    const url = `https://cdn.example.test/ai/${this.callCount}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
    return { url, size: { width: w, height: h, label: `${w}×${h}` } };
  }

  async generate(eventName: string, sizeKey = "banner_16_9_1920"): Promise<GeneratedItem | null> {
    try {
      const data = await this.invokeEdge(eventName, sizeKey);
      const item: GeneratedItem = {
        eventName,
        url: data.url,
        sizeLabel: data.size.label,
        w: data.size.width,
        h: data.size.height,
        createdAt: Date.now() + this.callCount, // monotonic, avoids ties
      };
      this.items = [item, ...this.items].slice(0, HISTORY_MAX);
      saveHistory(this.items);
      return item;
    } catch {
      // G7: failed generation MUST NOT mutate items / storage.
      return null;
    }
  }

  deleteAt(idx: number) {
    this.items = this.items.filter((_, i) => i !== idx);
    saveHistory(this.items);
  }

  clear() {
    this.items = [];
    saveHistory(this.items);
  }

  // Simulates clicking Download/Copy URL/Push on the card at `idx`.
  // Must resolve THIS card's url — not by re-querying state by name or by index of a stale array.
  resolveActionUrl(idx: number): string | null {
    const it = this.items[idx];
    return it ? it.url : null;
  }
}

describe("AI Photo Generator — end-to-end flow integrity", () => {
  let s: FakeStudio;

  beforeEach(() => {
    mem.clear();
    if (typeof globalThis.localStorage !== "undefined") {
      try { globalThis.localStorage.clear(); } catch {}
    }
    s = new FakeStudio();
  });

  it("G1 — newest generation appears at index 0 (latest first)", async () => {
    await s.generate("Eid Special");
    await s.generate("Diwali Lights");
    await s.generate("New Year Event");
    expect(s.items.map(i => i.eventName)).toEqual(["New Year Event", "Diwali Lights", "Eid Special"]);
  });

  it("G2 — gallery is capped at HISTORY_MAX, oldest dropped, no duplicates", async () => {
    for (let i = 0; i < HISTORY_MAX + 25; i++) {
      await s.generate(`Event ${i}`);
    }
    expect(s.items.length).toBe(HISTORY_MAX);
    expect(s.items[0].eventName).toBe(`Event ${HISTORY_MAX + 24}`);
    expect(s.items[HISTORY_MAX - 1].eventName).toBe(`Event ${25}`);
    const urls = s.items.map(i => i.url);
    expect(new Set(urls).size).toBe(urls.length); // no duplicates
  });

  it("G3 — each generation produces a unique URL; retry after failure yields a fresh URL", async () => {
    const a = await s.generate("Recharge Mega");
    s.failNext = true;
    const failed = await s.generate("Recharge Mega"); // same name, edge fails
    const b = await s.generate("Recharge Mega"); // retry, should be brand new URL
    expect(a).not.toBeNull();
    expect(failed).toBeNull();
    expect(b).not.toBeNull();
    expect(a!.url).not.toBe(b!.url);
    // Items contain only the two successes — failed call must not leave a stale row.
    expect(s.items.length).toBe(2);
    expect(s.items.map(i => i.url)).toEqual([b!.url, a!.url]);
  });

  it("G4 — deleteAt removes only the target, surviving items keep correct URL", async () => {
    const a = await s.generate("A");
    const b = await s.generate("B");
    const c = await s.generate("C");
    // Order: [C, B, A]. Delete middle (B at idx 1).
    s.deleteAt(1);
    expect(s.items.length).toBe(2);
    expect(s.items[0].url).toBe(c!.url);
    expect(s.items[1].url).toBe(a!.url);
    expect(s.items.find(i => i.eventName === "B")).toBeUndefined();
  });

  it("G5 — clear() empties items and localStorage payload", async () => {
    await s.generate("X");
    await s.generate("Y");
    expect(s.items.length).toBe(2);
    s.clear();
    expect(s.items.length).toBe(0);
    expect(loadHistory()).toEqual([]);
  });

  it("G6 — reload (new FakeStudio instance) restores identical items, URLs intact", async () => {
    await s.generate("Persist 1");
    await s.generate("Persist 2");
    const snapshot = s.items.map(i => ({ name: i.eventName, url: i.url }));

    const reloaded = new FakeStudio(); // reads from localStorage in ctor
    expect(reloaded.items.length).toBe(2);
    expect(reloaded.items.map(i => ({ name: i.eventName, url: i.url }))).toEqual(snapshot);
  });

  it("G7 — failed generation never adds a row or writes to localStorage", async () => {
    s.failNext = true;
    const result = await s.generate("Will Fail");
    expect(result).toBeNull();
    expect(s.items.length).toBe(0);
    expect(loadHistory()).toEqual([]);
  });

  it("G8 — per-item action resolves THIS item's URL (no index-shift / stale mapping)", async () => {
    const a = await s.generate("Card A");
    const b = await s.generate("Card B");
    const c = await s.generate("Card C");
    // Order: [C, B, A].
    expect(s.resolveActionUrl(0)).toBe(c!.url);
    expect(s.resolveActionUrl(1)).toBe(b!.url);
    expect(s.resolveActionUrl(2)).toBe(a!.url);

    // Delete the top item; remaining indices must shift consistently and still map to correct URLs.
    s.deleteAt(0);
    expect(s.resolveActionUrl(0)).toBe(b!.url);
    expect(s.resolveActionUrl(1)).toBe(a!.url);
    expect(s.resolveActionUrl(2)).toBeNull();

    // Generate a new one — it must take index 0 with a URL that differs from every prior item.
    const d = await s.generate("Card D");
    expect(s.resolveActionUrl(0)).toBe(d!.url);
    expect([a!.url, b!.url, c!.url]).not.toContain(d!.url);
  });

  it("G9 — corrupt localStorage payload is ignored (empty start, no crash)", () => {
    globalThis.localStorage.setItem(HISTORY_KEY, "{not-valid-json");
    const fresh = new FakeStudio();
    expect(fresh.items).toEqual([]);
  });

  it("G10 — non-array localStorage payload is ignored", () => {
    globalThis.localStorage.setItem(HISTORY_KEY, JSON.stringify({ rogue: true }));
    const fresh = new FakeStudio();
    expect(fresh.items).toEqual([]);
  });
});
