const getStorageKey = (userId: string) => `official_notice_read_ids:${userId}`;

const readStoredIds = (userId: string): Set<string> => {
  if (typeof window === 'undefined') return new Set();

  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) return new Set();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();

    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
};

const writeStoredIds = (userId: string, ids: Set<string>) => {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(Array.from(ids)));
  } catch {
    // ignore storage write issues
  }
};

export const getLocallyReadOfficialNoticeIds = (userId: string): Set<string> => {
  return readStoredIds(userId);
};

export const markOfficialNoticeAsReadLocally = (userId: string, noticeId: string) => {
  if (!noticeId) return;

  const ids = readStoredIds(userId);
  ids.add(noticeId);
  writeStoredIds(userId, ids);
};

export const markOfficialNoticesAsReadLocally = (userId: string, noticeIds: string[]) => {
  if (!noticeIds.length) return;

  const ids = readStoredIds(userId);
  noticeIds.forEach((noticeId) => {
    if (noticeId) ids.add(noticeId);
  });
  writeStoredIds(userId, ids);
};
