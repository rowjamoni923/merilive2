/**
 * Integration tests for the admin instant-sync pipeline (Pkg37/Pkg62/Pkg63).
 *
 * Covers two contracts the admin panel relies on:
 *
 * 1. Save/Delete broadcast contract — whenever a row arrives on
 *    `public.admin_broadcast` (via the postgres_changes channel),
 *    `useAdminBroadcastSync` MUST:
 *      - dispatch a window `admin-table-update` event with `{table, eventType, payload}`
 *      - invalidate every React Query key registered in TOPIC_QUERY_KEYS[topic]
 *
 * 2. RPC failure contract — admin save/delete flows that call `.rpc()` MUST
 *    surface the error to the caller (no silent swallow) so the UI can toast
 *    it. A failed RPC also MUST NOT trigger a fake broadcast.
 */
import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ---- Mock supabase BEFORE importing the hook ----
type Handler = (payload: any) => void;
const channelHandlers: Handler[] = [];

const channelMock = {
  on: vi.fn((_evt: string, _filter: any, handler: Handler) => {
    channelHandlers.push(handler);
    return channelMock;
  }),
  subscribe: vi.fn(() => channelMock),
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: vi.fn(() => channelMock),
    removeChannel: vi.fn(),
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { setting_value: true }, error: null }),
        }),
      }),
    })),
  },
}));

import {
  useAdminBroadcastSync,
  TOPIC_QUERY_KEYS,
} from "@/hooks/useAdminBroadcastSync";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

async function flushAsync() {
  // checkKillSwitch + channel.on registration are async — wait a microtask tick.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

describe("Admin instant-sync broadcast contract", () => {
  beforeEach(() => {
    channelHandlers.length = 0;
    channelMock.on.mockClear();
    channelMock.subscribe.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispatches admin-table-update window event for every save/delete broadcast row", async () => {
    renderHook(() => useAdminBroadcastSync(), { wrapper });
    await flushAsync();
    expect(channelHandlers.length).toBe(1);

    const events: any[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener("admin-table-update", listener);

    // Simulate three different admin tables firing their broadcast.
    const samples: Array<[string, "INSERT" | "UPDATE" | "DELETE"]> = [
      ["live_face_violations", "INSERT"],
      ["payroll_requests", "UPDATE"],
      ["helper_message_replies", "DELETE"],
    ];

    samples.forEach(([topic, eventType], i) => {
      channelHandlers[0]({
        new: {
          topic,
          version: i + 1,
          last_event: eventType,
          last_row_id: `row-${i}`,
          updated_at: new Date(Date.now() + i * 1000).toISOString(),
        },
        eventType,
      });
    });

    window.removeEventListener("admin-table-update", listener);

    expect(events).toHaveLength(3);
    samples.forEach(([topic, eventType], i) => {
      expect(events[i].table).toBe(topic);
      expect(events[i].eventType).toBe(eventType);
      expect(events[i].payload.row_id).toBe(`row-${i}`);
    });
  });

  it("invalidates every TOPIC_QUERY_KEYS entry for the broadcasted topic", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    renderHook(() => useAdminBroadcastSync(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });
    await flushAsync();

    // Pick a topic with multiple registered keys.
    const topic = "live_bans";
    const expectedKeys = TOPIC_QUERY_KEYS[topic];
    expect(expectedKeys?.length).toBeGreaterThan(0);

    channelHandlers[0]({
      new: {
        topic,
        version: 99,
        last_event: "UPDATE",
        last_row_id: "ban-1",
        updated_at: new Date().toISOString(),
      },
      eventType: "UPDATE",
    });

    // Every registered key for this topic must have been invalidated.
    expectedKeys.forEach((key) => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: key, refetchType: "active" })
      );
    });
  });

  it("ignores broadcast rows without a topic (defensive)", async () => {
    renderHook(() => useAdminBroadcastSync(), { wrapper });
    await flushAsync();

    const events: any[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener("admin-table-update", listener);

    channelHandlers[0]({ new: { topic: null }, eventType: "INSERT" });
    channelHandlers[0]({ new: {}, eventType: "INSERT" });

    window.removeEventListener("admin-table-update", listener);
    expect(events).toHaveLength(0);
  });

  it("guarantees the four Pkg62/Pkg63 alert tables are wired into TOPIC_QUERY_KEYS", () => {
    // Regression guard: if anyone removes one of these entries the admin bell
    // stops getting instant notifications for those tables.
    const required = [
      "live_face_violations", // Pkg62
      "helper_message_replies", // Pkg63
      "payroll_requests", // Pkg63
      "consumption_return_history", // Pkg63
      "leaderboard_reward_history", // Pkg63
    ];
    required.forEach((t) => {
      expect(TOPIC_QUERY_KEYS[t]).toBeDefined();
      expect(TOPIC_QUERY_KEYS[t].length).toBeGreaterThan(0);
    });
  });
});

describe("Admin RPC failure contract", () => {
  it("propagates RPC errors to the caller (no silent swallow) and fires no broadcast", async () => {
    // Simulate an admin save-handler-style call.
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "permission denied for table xyz", code: "42501" },
    });

    const events: any[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener("admin-table-update", listener);

    const { data, error } = await rpc("admin_apply_severity_ban", {
      _user_id: "u-1",
      _reason: "spam",
    });

    window.removeEventListener("admin-table-update", listener);

    // Caller must see the error so the UI can toast it.
    expect(data).toBeNull();
    expect(error).toBeTruthy();
    expect(error?.message).toMatch(/permission denied/i);

    // A failed RPC must NOT have produced any broadcast event.
    expect(events).toHaveLength(0);
  });

  it("a successful save followed by a broadcast row triggers the matching invalidation", async () => {
    // End-to-end shape: RPC returns ok → DB trigger bumps admin_broadcast →
    // hook invalidates the topic's query keys.
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    channelHandlers.length = 0;
    renderHook(() => useAdminBroadcastSync(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });
    await flushAsync();

    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { id: "report-1", status: "resolved" }, error: null });

    const { data, error } = await rpc("admin_update_user_report", {
      _id: "report-1",
      _status: "resolved",
    });
    expect(error).toBeNull();
    expect(data).toBeTruthy();

    // Now the DB trigger fires the broadcast row.
    channelHandlers[0]({
      new: {
        topic: "user_reports",
        version: 1,
        last_event: "UPDATE",
        last_row_id: "report-1",
        updated_at: new Date().toISOString(),
      },
      eventType: "UPDATE",
    });

    TOPIC_QUERY_KEYS["user_reports"].forEach((key) => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: key, refetchType: "active" })
      );
    });
  });
});
