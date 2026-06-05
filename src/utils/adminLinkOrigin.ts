// This Lovable project is published on merilive.top. Do not generate admin
// links for merilive.com: that domain is not connected to this project and can
// serve a stale/other frontend bundle that falsely rejects valid secret links.
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
  const isAdminRoute = window.location.pathname.startsWith('/admin');
  const isProjectDomain = hostname === 'merilive.top' || hostname === 'www.merilive.top';
  const isBlockedHost = BLOCKED_HOST_PATTERNS.some((pattern) =>
    hostname === pattern || hostname.endsWith(`.${pattern}`),
  );

  if (isAdminRoute && isProjectDomain) {
    return origin;
  }

  return isBlockedHost || hostname === 'merilive.com' || hostname === 'www.merilive.com'
    ? FALLBACK_ADMIN_ORIGIN
    : origin;
};