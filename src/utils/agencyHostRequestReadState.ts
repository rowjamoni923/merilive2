const storageKey = (userId: string) => `agency_host_request_read_${userId}`;

export const getLocallyReadAgencyHostRequestIds = (userId: string): Set<string> => {
  if (!userId || typeof window === 'undefined') return new Set();

  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.map(String)) : new Set();
  } catch {
    return new Set();
  }
};

const saveIds = (userId: string, ids: Set<string>) => {
  if (!userId || typeof window === 'undefined') return;
  localStorage.setItem(storageKey(userId), JSON.stringify(Array.from(ids)));
};

export const markAgencyHostRequestAsRead = (userId: string, requestId: string) => {
  if (!userId || !requestId) return;
  const ids = getLocallyReadAgencyHostRequestIds(userId);
  ids.add(requestId);
  saveIds(userId, ids);
};

export const markAgencyHostRequestsAsRead = (userId: string, requestIds: string[]) => {
  if (!userId || requestIds.length === 0) return;
  const ids = getLocallyReadAgencyHostRequestIds(userId);
  requestIds.forEach((id) => id && ids.add(id));
  saveIds(userId, ids);
};
