import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import React from "react";

// --- Mocks -------------------------------------------------------------
const removeChannel = vi.fn();
const channelInstances: Array<{ name: string }> = [];

vi.mock("@/integrations/supabase/client", () => {
  const makeChannel = (name: string) => {
    const ch = { name };
    channelInstances.push(ch);
    const api: any = {
      on: () => api,
      subscribe: () => ch,
    };
    return api;
  };
  return {
    supabase: {
      channel: (name: string) => makeChannel(name),
      removeChannel: (...args: any[]) => removeChannel(...args),
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({ order: () => Promise.resolve({ data: [] }) }),
            single: () => Promise.resolve({ data: null }),
            limit: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }),
          }),
        }),
      }),
      rpc: () => Promise.resolve({ data: null, error: null }),
    },
  };
});

vi.mock("@/utils/taskDateUtils", () => ({
  getTaskDate: () => "2026-05-18",
  getMsUntilNextReset: () => 60_000,
  getMsUntilNextHour: () => 1_000,
}));

vi.mock("@/hooks/useUserBalance", () => ({ updateCachedBalance: () => {} }));
vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {} } }));

import LiveTasksCard from "./LiveTasksCard";

describe("LiveTasksCard timer lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    removeChannel.mockClear();
    channelInstances.length = 0;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("clears hourly + reset timers on unmount and does not leak", () => {
    const { unmount } = render(<LiveTasksCard hostId="host-a" />);
    // One channel created.
    expect(channelInstances).toHaveLength(1);
    const activeBefore = vi.getTimerCount();
    expect(activeBefore).toBeGreaterThanOrEqual(2); // hourly + reset

    unmount();

    // After unmount all timers our effect owns must be cleared.
    expect(vi.getTimerCount()).toBe(0);
    expect(removeChannel).toHaveBeenCalledTimes(1);

    // Advancing time must NOT reschedule new timers (cancelled guard).
    vi.advanceTimersByTime(5_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("tears down old subscription + timers when hostId changes (no duplicates)", () => {
    const { rerender, unmount } = render(<LiveTasksCard hostId="host-a" />);
    expect(channelInstances).toHaveLength(1);
    expect(channelInstances[0].name).toContain("host-a");

    rerender(<LiveTasksCard hostId="host-b" />);

    // Old channel removed, new one created — never two channels live at once.
    expect(removeChannel).toHaveBeenCalledTimes(1);
    expect(channelInstances).toHaveLength(2);
    expect(channelInstances[1].name).toContain("host-b");

    // Active timers should be exactly the new effect's set (hourly + reset),
    // not doubled from the previous hostId.
    const count = vi.getTimerCount();
    expect(count).toBeGreaterThanOrEqual(2);
    expect(count).toBeLessThanOrEqual(3); // allow microtask scheduling slack

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("recursive hourly scheduler does not orphan a timer after unmount mid-fire", () => {
    const { unmount } = render(<LiveTasksCard hostId="host-a" />);
    // Fire the hourly tick (1s) then unmount — the scheduler must not
    // queue a new timer after cleanup sets cancelled = true.
    vi.advanceTimersByTime(1_000);
    unmount();
    vi.advanceTimersByTime(10_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
