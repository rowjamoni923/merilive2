const ADMIN_ACCESS_KEY = 'meri_admin_access';
const OWNER_ACCESS_KEY = 'meri_owner_access';
const ADMIN_LINK_TOKEN_KEY = 'meri_admin_link_token';

const hasWindow = () => typeof window !== 'undefined';

const readFlag = (key: string): boolean => {
  if (!hasWindow()) return false;
  return (
    window.sessionStorage.getItem(key) === 'true' ||
    window.localStorage.getItem(key) === 'true'
  );
};

const writeFlag = (key: string, value: 'true' | 'false') => {
  if (!hasWindow()) return;
  window.sessionStorage.setItem(key, value);
  window.localStorage.setItem(key, value);
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
  window.localStorage.setItem(ADMIN_LINK_TOKEN_KEY, normalized);
};

export const getAdminLinkToken = (): string | null => {
  if (!hasWindow()) return null;
  return (
    window.sessionStorage.getItem(ADMIN_LINK_TOKEN_KEY) ||
    window.localStorage.getItem(ADMIN_LINK_TOKEN_KEY)
  );
};

/**
 * Keep sessionStorage in sync from persistent localStorage on fresh tabs/reloads.
 */
export const syncAdminAccessToSession = () => {
  if (!hasWindow()) return;

  if (window.localStorage.getItem(ADMIN_ACCESS_KEY) === 'true') {
    window.sessionStorage.setItem(ADMIN_ACCESS_KEY, 'true');
  }

  if (window.localStorage.getItem(OWNER_ACCESS_KEY) === 'true') {
    window.sessionStorage.setItem(OWNER_ACCESS_KEY, 'true');
  }

  const adminLinkToken = window.localStorage.getItem(ADMIN_LINK_TOKEN_KEY);
  if (adminLinkToken) {
    window.sessionStorage.setItem(ADMIN_LINK_TOKEN_KEY, adminLinkToken);
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
  }
};

export const revokeAdminAccess = () => {
  removeFlag(ADMIN_ACCESS_KEY);
  removeFlag(OWNER_ACCESS_KEY);
  removeFlag(ADMIN_LINK_TOKEN_KEY);
};
