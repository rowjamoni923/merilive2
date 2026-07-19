/**
 * Automated tests for game bet/win flow (Roulette, Ferris Wheel, Teen Patti).
 *
 * These tests mock the Supabase client to simulate the server-side RPCs
 * (`place_game_bet`, `process_game_win`) and verify:
 *   1. Correct RPC name + payload (floored amount, game_id, game_name).
 *   2. Diamonds are deducted on bet (cached balance updated).
 *   3. Diamonds are credited on win (cached balance updated, multiplier passed).
 *   4. Insufficient balance is reported back with the server's real balance.
 *   5. Net per-round math (bet → win) reflects expected delta.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ---- Mocks ---------------------------------------------------------------

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

const updateCachedBalanceMock = vi.fn();
vi.mock("@/hooks/useUserBalance", () => ({
  updateCachedBalance: (n: number) => updateCachedBalanceMock(n),
}));

// Import after mocks are registered
import { placeBet, processWin } from "./gameBalanceService";

const USER_ID = "11111111-1111-1111-1111-111111111111";

beforeEach(() => {
  rpcMock.mockReset();
  updateCachedBalanceMock.mockReset();
});

// ---- Helpers -------------------------------------------------------------

/** Simulate a server-side wallet ledger driven by the RPC mock. */
function mockServerWallet(initial: number) {
  let balance = initial;
  rpcMock.mockImplementation(async (fn: string, params: any) => {
    if (fn === "place_game_bet") {
      const amt = Math.floor(params.p_amount);
      if (amt <= 0) return { data: { success: false, error: "Invalid bet amount" }, error: null };
      if (balance < amt) {
        return {
          data: { success: false, error: "Insufficient diamonds", balance },
          error: null,
        };
      }
      balance -= amt;
      return { data: { success: true, new_balance: balance, deducted: amt }, error: null };
    }
    if (fn === "process_game_win") {
      const amt = Math.floor(params.p_amount);
      if (amt <= 0) return { data: { success: false, error: "Invalid win amount" }, error: null };
      balance += amt;
      return { data: { success: true, new_balance: balance, added: amt }, error: null };
    }
    return { data: null, error: new Error("unknown rpc " + fn) };
  });
  return {
    get balance() {
      return balance;
    },
  };
}

// ---- Roulette ------------------------------------------------------------

describe("Roulette — place bet & process win", () => {
  it("deducts diamonds on bet and updates cached balance", async () => {
    const wallet = mockServerWallet(50_000);

    const res = await placeBet(USER_ID, "roulette", "Roulette", 5_000);

    expect(res.success).toBe(true);
    expect(res.newBalance).toBe(45_000);
    expect(wallet.balance).toBe(45_000);
    expect(rpcMock).toHaveBeenCalledWith("place_game_bet", {
      p_user_id: USER_ID,
      p_amount: 5_000,
      p_game_id: "roulette",
      p_game_name: "Roulette",
    });
    expect(updateCachedBalanceMock).toHaveBeenCalledWith(45_000);
  });

  it("credits diamonds on win with multiplier and updates cached balance", async () => {
    const wallet = mockServerWallet(45_000);

    const res = await processWin(USER_ID, "roulette", "Roulette", 18_000, 36);

    expect(res.success).toBe(true);
    expect(res.newBalance).toBe(63_000);
    expect(wallet.balance).toBe(63_000);
    expect(rpcMock).toHaveBeenCalledWith("process_game_win", {
      p_user_id: USER_ID,
      p_amount: 18_000,
      p_game_id: "roulette",
      p_game_name: "Roulette",
      p_multiplier: 36,
      p_is_jackpot: false,
    });
    expect(updateCachedBalanceMock).toHaveBeenLastCalledWith(63_000);
  });

  it("rejects bet when balance is insufficient and surfaces server balance", async () => {
    mockServerWallet(1_200);

    const res = await placeBet(USER_ID, "roulette", "Roulette", 5_000);

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/insufficient/i);
    expect(res.newBalance).toBe(1_200);
    expect(updateCachedBalanceMock).toHaveBeenCalledWith(1_200);
  });
});

// ---- Ferris Wheel --------------------------------------------------------

describe("Ferris Wheel — full round math (bet → win)", () => {
  it("yields the correct net delta when bet wins at 5x", async () => {
    const wallet = mockServerWallet(20_000);
    const BET = 2_000;
    const MULTIPLIER = 5;
    const WIN = BET * MULTIPLIER; // 10_000

    const bet = await placeBet(USER_ID, "ferris-wheel", "Ferris Wheel", BET);
    expect(bet.success).toBe(true);
    expect(bet.newBalance).toBe(18_000);

    const win = await processWin(
      USER_ID,
      "ferris-wheel",
      "Ferris Wheel",
      WIN,
      MULTIPLIER,
    );
    expect(win.success).toBe(true);
    expect(win.newBalance).toBe(28_000);

    // Net delta over the round = +8_000 (started 20k, ended 28k)
    expect(wallet.balance - 20_000).toBe(8_000);
  });

  it("yields a negative net delta when the bet loses (no win RPC fired)", async () => {
    const wallet = mockServerWallet(20_000);
    const BET = 2_000;

    const bet = await placeBet(USER_ID, "ferris-wheel", "Ferris Wheel", BET);
    expect(bet.success).toBe(true);

    // Loss: no processWin call
    expect(wallet.balance).toBe(18_000);
    expect(wallet.balance - 20_000).toBe(-BET);
  });

  it("floors non-integer bet amounts before deduction", async () => {
    mockServerWallet(10_000);

    await placeBet(USER_ID, "ferris-wheel", "Ferris Wheel", 1_234.99);

    expect(rpcMock).toHaveBeenCalledWith(
      "place_game_bet",
      expect.objectContaining({ p_amount: 1_234 }),
    );
  });
});

// ---- Teen Patti ----------------------------------------------------------

describe("Teen Patti — multiple bets across hands within a round", () => {
  it("deducts each per-hand bet atomically and credits final winning hand", async () => {
    const wallet = mockServerWallet(30_000);

    // User bets on Hand A and Hand B, 3_000 each
    const betA = await placeBet(USER_ID, "teen-patti", "Teen Patti", 3_000);
    const betB = await placeBet(USER_ID, "teen-patti", "Teen Patti", 3_000);
    expect(betA.success && betB.success).toBe(true);
    expect(wallet.balance).toBe(24_000); // 30k - 6k

    // Hand A wins 2x payout => win amount 6_000
    const win = await processWin(USER_ID, "teen-patti", "Teen Patti", 6_000, 2);
    expect(win.success).toBe(true);
    expect(wallet.balance).toBe(30_000);

    // Net delta = 0 (won back exactly what was wagered)
    expect(wallet.balance - 30_000).toBe(0);

    // Three transactions logged (2 bets + 1 win)
    expect(rpcMock).toHaveBeenCalledTimes(3);
  });

  it("blocks the second bet when the first drains the balance", async () => {
    const wallet = mockServerWallet(3_000);

    const first = await placeBet(USER_ID, "teen-patti", "Teen Patti", 3_000);
    expect(first.success).toBe(true);
    expect(wallet.balance).toBe(0);

    const second = await placeBet(USER_ID, "teen-patti", "Teen Patti", 3_000);
    expect(second.success).toBe(false);
    expect(second.error).toMatch(/insufficient/i);
    expect(second.newBalance).toBe(0);
  });

  it("rejects invalid (zero/negative) bet amounts before touching balance", async () => {
    const wallet = mockServerWallet(10_000);

    const res = await placeBet(USER_ID, "teen-patti", "Teen Patti", 0);

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/invalid/i);
    expect(wallet.balance).toBe(10_000);
  });
});
