const DEFAULT_LOCK_MS = 1600;

const mutationLocks = new Map<string, number>();
let cleanupTimer: ReturnType<typeof setTimeout> | null = null;

const normalizeTableName = (table: string) => table.trim().toLowerCase();

const clearExpiredLocks = () => {
  const now = Date.now();

  for (const [table, expiresAt] of mutationLocks.entries()) {
    if (expiresAt <= now) {
      mutationLocks.delete(table);
    }
  }
};

const scheduleCleanup = () => {
  if (cleanupTimer) {
    clearTimeout(cleanupTimer);
    cleanupTimer = null;
  }

  let nextExpiry = Number.POSITIVE_INFINITY;
  for (const expiresAt of mutationLocks.values()) {
    nextExpiry = Math.min(nextExpiry, expiresAt);
  }

  if (!Number.isFinite(nextExpiry)) return;

  const delay = Math.max(40, nextExpiry - Date.now() + 20);
  cleanupTimer = setTimeout(() => {
    clearExpiredLocks();
    scheduleCleanup();
  }, delay);
};

export const lockAdminRealtimeTables = (
  tables: Array<string | null | undefined>,
  durationMs = DEFAULT_LOCK_MS,
) => {
  const expiresAt = Date.now() + Math.max(250, durationMs);

  for (const table of tables) {
    if (!table) continue;
    const normalized = normalizeTableName(table);
    const existingExpiry = mutationLocks.get(normalized) ?? 0;
    mutationLocks.set(normalized, Math.max(existingExpiry, expiresAt));
  }

  clearExpiredLocks();
  scheduleCleanup();
};

export const getAdminRealtimeLockRemaining = (tables: string[]) => {
  clearExpiredLocks();

  const now = Date.now();
  let remainingMs = 0;

  for (const table of tables) {
    const expiresAt = mutationLocks.get(normalizeTableName(table)) ?? 0;
    remainingMs = Math.max(remainingMs, expiresAt - now);
  }

  return Math.max(0, remainingMs);
};