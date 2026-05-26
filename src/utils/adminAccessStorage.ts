const ADMIN_ACCESS_KEY = 'meri_admin_access';
const OWNER_ACCESS_KEY = 'meri_owner_access';
const ADMIN_LINK_TOKEN_KEY = 'meri_admin_link_token';
const ADMIN_LINK_KIND_KEY = 'meri_admin_link_kind'; // 'owner' | 'sub_admin'
const ADMIN_LINK_CHALLENGE_KEY = 'meri_admin_link_challenge';
const ADMIN_LINK_TOKEN_PERSIST_KEY = 'meri_admin_link_token_persist';
const ADMIN_LINK_KIND_PERSIST_KEY = 'meri_admin_link_kind_persist';

export type AdminLinkKind = 'owner' | 'sub_admin';

const hasWindow = () => typeof window !== 'undefined';

const readFlag = (key: string): boolean => {
  if (!hasWindow()) return false;
  return window.sessionStorage.getItem(key) === 'true';
};

const writeFlag = (key: string, value: 'true' | 'false') => {
  if (!hasWindow()) return;
  window.sessionStorage.setItem(key, value);
  window.localStorage.removeItem(key);
};

const removeFlag = (key: string) => {
  if (!hasWindow()) return;
  window.sessionStorage.removeItem(key);
  window.localStorage.removeItem(key);
};

export const setAdminLinkToken = (token: string) => {
  if (!hasWindow()) return;
  const normalized = token.trim();
  if (!normalized) return;
  window.sessionStorage.setItem(ADMIN_LINK_TOKEN_KEY, normalized);
  window.localStorage.setItem(ADMIN_LINK_TOKEN_PERSIST_KEY, normalized);
  window.localStorage.removeItem(ADMIN_LINK_TOKEN_KEY);
};

export const getAdminLinkToken = (): string | null => {
  if (!hasWindow()) return null;
  const tabToken = window.sessionStorage.getItem(ADMIN_LINK_TOKEN_KEY);
  if (tabToken) return tabToken;
  const persisted = window.localStorage.getItem(ADMIN_LINK_TOKEN_PERSIST_KEY);
  if (persisted) {
    window.sessionStorage.setItem(ADMIN_LINK_TOKEN_KEY, persisted);
    return persisted;
  }
  return null;
};

export const setAdminLinkKind = (kind: AdminLinkKind) => {
  if (!hasWindow()) return;
  window.sessionStorage.setItem(ADMIN_LINK_KIND_KEY, kind);
  window.localStorage.setItem(ADMIN_LINK_KIND_PERSIST_KEY, kind);
  window.localStorage.removeItem(ADMIN_LINK_KIND_KEY);
};

export const getAdminLinkKind = (): AdminLinkKind | null => {
  if (!hasWindow()) return null;
  let v = window.sessionStorage.getItem(ADMIN_LINK_KIND_KEY);
  if (!v) {
    v = window.localStorage.getItem(ADMIN_LINK_KIND_PERSIST_KEY);
    if (v === 'owner' || v === 'sub_admin') window.sessionStorage.setItem(ADMIN_LINK_KIND_KEY, v);
  }
  return v === 'owner' || v === 'sub_admin' ? v : null;
};

export const setAdminLinkChallenge = (challenge: string | null | undefined) => {
  if (!hasWindow()) return;
  const normalized = String(challenge || '').trim();
  if (normalized.length >= 32) {
    window.sessionStorage.setItem(ADMIN_LINK_CHALLENGE_KEY, normalized);
  } else {
    window.sessionStorage.removeItem(ADMIN_LINK_CHALLENGE_KEY);
  }
  window.localStorage.removeItem(ADMIN_LINK_CHALLENGE_KEY);
};

export const getAdminLinkChallenge = (): string | null => {
  if (!hasWindow()) return null;
  const v = window.sessionStorage.getItem(ADMIN_LINK_CHALLENGE_KEY);
  return v && v.length >= 32 ? v : null;
};

/**
 * Keep sessionStorage in sync from persistent localStorage on fresh tabs/reloads.
 */
export const syncAdminAccessToSession = () => {
  if (!hasWindow()) return;
  // Secret-link unlock is tab-scoped only. Remove legacy persistent unlocks so
  // a bookmarked /admin URL can never reuse yesterday's access flag.
  window.localStorage.removeItem(ADMIN_ACCESS_KEY);
  window.localStorage.removeItem(OWNER_ACCESS_KEY);
  window.localStorage.removeItem(ADMIN_LINK_TOKEN_KEY);
  window.localStorage.removeItem(ADMIN_LINK_KIND_KEY);
  window.localStorage.removeItem(ADMIN_LINK_CHALLENGE_KEY);
  const persistedToken = window.localStorage.getItem(ADMIN_LINK_TOKEN_PERSIST_KEY);
  const persistedKind = window.localStorage.getItem(ADMIN_LINK_KIND_PERSIST_KEY);
  if (persistedToken && !window.sessionStorage.getItem(ADMIN_LINK_TOKEN_KEY)) {
    window.sessionStorage.setItem(ADMIN_LINK_TOKEN_KEY, persistedToken);
  }
  if ((persistedKind === 'owner' || persistedKind === 'sub_admin') && !window.sessionStorage.getItem(ADMIN_LINK_KIND_KEY)) {
    window.sessionStorage.setItem(ADMIN_LINK_KIND_KEY, persistedKind);
  }
};

export const hasAdminAccessFlag = (): boolean => {
  syncAdminAccessToSession();
  return readFlag(ADMIN_ACCESS_KEY) || readFlag(OWNER_ACCESS_KEY);
};

export const hasOwnerAccessFlag = (): boolean => {
  syncAdminAccessToSession();
  return readFlag(OWNER_ACCESS_KEY);
};

export const grantAdminAccess = (isOwner = false) => {
  writeFlag(ADMIN_ACCESS_KEY, 'true');
  if (isOwner) {
    writeFlag(OWNER_ACCESS_KEY, 'true');
    setAdminLinkKind('owner');
  } else {
    setAdminLinkKind('sub_admin');
  }
};

export const revokeAdminAccess = () => {
  removeFlag(ADMIN_ACCESS_KEY);
  removeFlag(OWNER_ACCESS_KEY);
  removeFlag(ADMIN_LINK_TOKEN_KEY);
  removeFlag(ADMIN_LINK_KIND_KEY);
  removeFlag(ADMIN_LINK_CHALLENGE_KEY);
};

