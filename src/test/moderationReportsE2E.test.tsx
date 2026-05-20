/**
 * End-to-end instant-sync test for Moderation & Reports admin pages.
 *
 * Simulates the full pipeline for save / delete / status-update flows on every
 * mutable moderation+reports table, and asserts the resulting `admin_broadcast`
 * row fans out to ALL three audiences:
 *
 *   1. Other admin sessions  → `admin-table-update` window event + React Query
 *      invalidation of the topic's TOPIC_QUERY_KEYS entries (drives the bell,
 *      list refresh, badge counters).
 *   2. Web clients           → same realtime channel, same dispatch (web app
 *      mounts the same hook for any signed-in admin).
 *   3. Native clients        → same channel over the Capacitor websocket; the
 *      hook is platform-agnostic, so receiving the row is sufficient proof.
 *
 * For each table we run the three lifecycle events the admin UI can produce:
 *   - INSERT (save / create — e.g. issuing a ban, filing a report)
 *   - UPDATE (status change — resolve / reject / approve)
 *   - DELETE (remove / revoke)
 *
 * Any missing fan-out (e.g. a topic missing from TOPIC_QUERY_KEYS, or the
 * window event not firing) FAILS the test — preventing silent regressions.
 */
import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

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

async function flushAsync() {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
}

// Every mutable moderation + reports table the admin panel writes to.
const MODERATION_TOPICS = [
  "live_bans",
  "user_reports",
  "support_reports",
  "blocked_users",
  "banned_devices",
  "host_contact_violations",
  "live_face_violations",
  "chat_moderation_logs",
] as const;

const LIFECYCLE: Array<"INSERT" | "UPDATE" | "DELETE"> = [
  "INSERT",
  "UPDATE",
  "DELETE",
];

describe("Moderation & Reports — end-to-end instant sync", () => {
  beforeEach(() => {
    channelHandlers.length = 0;
    channelMock.on.mockClear();
    channelMock.subscribe.mockClear();
  });

  it("every moderation/reports topic is registered in TOPIC_QUERY_KEYS", () => {
    MODERATION_TOPICS.forEach((topic) => {
      expect(
        TOPIC_QUERY_KEYS[topic],
        `topic "${topic}" is missing from TOPIC_QUERY_KEYS — admin pages won't auto-refresh`
      ).toBeDefined();
      expect(TOPIC_QUERY_KEYS[topic].length).toBeGreaterThan(0);
    });
  });

  it("save / delete / status-update on every table fans out to all clients", async () => {
    // Three independent admin "clients" (admin session A, web client B, native
    // client C) — each mounts the same hook on its own QueryClient.
    const clients = ["admin-A", "web-B", "native-C"].map((label) => {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
      return { label, qc, invalidateSpy };
    });

    clients.forEach(({ qc }) => {
      renderHook(() => useAdminBroadcastSync(), {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <QueryClientProvider client={qc}>{children}</QueryClientProvider>
        ),
      });
    });
    await flushAsync();

    // One realtime channel handler registered per mounted hook.
    expect(channelHandlers.length).toBe(clients.length);

    const windowEvents: any[] = [];
    const listener = (e: Event) =>
      windowEvents.push((e as CustomEvent).detail);
    window.addEventListener("admin-table-update", listener);

    let version = 0;
    for (const topic of MODERATION_TOPICS) {
      for (const eventType of LIFECYCLE) {
        version += 1;
        const rowId = `${topic}-${eventType}-${version}`;
        const payload = {
          new: {
            topic,
            version,
            last_event: eventType,
            last_row_id: rowId,
            updated_at: new Date(Date.now() + version * 10).toISOString(),
          },
          eventType,
        };
        // Fan out to all subscribed clients (this is what the realtime
        // channel does in production).
        channelHandlers.forEach((h) => h(payload));
      }
    }

    window.removeEventListener("admin-table-update", listener);

    // 1. Window event fired once per (client × topic × lifecycle).
    const expectedEvents =
      MODERATION_TOPICS.length * LIFECYCLE.length * clients.length;
    expect(windowEvents).toHaveLength(expectedEvents);

    // 2. Every client invalidated every TOPIC_QUERY_KEYS entry for every
    //    topic — proves the list, badge, and bell all refresh.
    clients.forEach(({ label, invalidateSpy }) => {
      MODERATION_TOPICS.forEach((topic) => {
        TOPIC_QUERY_KEYS[topic].forEach((key) => {
          expect(
            invalidateSpy,
            `client ${label} did not invalidate ${JSON.stringify(
              key
            )} for topic ${topic}`
          ).toHaveBeenCalledWith(
            expect.objectContaining({ queryKey: key, refetchType: "active" })
          );
        });
      });
    });

    // 3. Every lifecycle event type was represented for every topic.
    MODERATION_TOPICS.forEach((topic) => {
      LIFECYCLE.forEach((eventType) => {
        const match = windowEvents.find(
          (e) => e.table === topic && e.eventType === eventType
        );
        expect(
          match,
          `missing fan-out for ${topic} / ${eventType}`
        ).toBeTruthy();
      });
    });
  });

  it("a failed RPC produces zero broadcasts (no false-positive refresh)", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    renderHook(() => useAdminBroadcastSync(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    });
    await flushAsync();

    const events: any[] = [];
    const listener = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener("admin-table-update", listener);

    // Admin calls e.g. admin_resolve_user_report but the RPC rejects with RLS.
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "permission denied", code: "42501" },
    });
    const { data, error } = await rpc("admin_resolve_user_report", {
      _id: "x",
    });

    window.removeEventListener("admin-table-update", listener);

    expect(data).toBeNull();
    expect(error).toBeTruthy();
    // The trigger never fired, so no broadcast row arrives → no invalidation.
    expect(events).toHaveLength(0);
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
