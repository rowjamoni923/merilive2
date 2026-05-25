const FALLBACK_ADMIN_ORIGIN = 'https://merilive.top';

const BLOCKED_HOST_PATTERNS = [
  'localhost',
  '127.0.0.1',
  'lovable.app',
  'lovableproject.com',
];

export const getAdminLinkOrigin = (): string => {
  if (typeof window === 'undefined') return FALLBACK_ADMIN_ORIGIN;

  const { origin, hostname } = window.location;
  const isBlockedHost = BLOCKED_HOST_PATTERNS.some((pattern) =>
    hostname === pattern || hostname.endsWith(`.${pattern}`),
  );

  return isBlockedHost ? FALLBACK_ADMIN_ORIGIN : origin;
};