// Production admin links must use the main .com domain. The .top domain is only
// a landing/download host and must not be used for admin login links.
const FALLBACK_ADMIN_ORIGIN = 'https://merilive.com';

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
  const isProjectDomain = hostname === 'merilive.com' || hostname === 'www.merilive.com';
  const isBlockedHost = BLOCKED_HOST_PATTERNS.some((pattern) =>
    hostname === pattern || hostname.endsWith(`.${pattern}`),
  );

  if (isAdminRoute && isProjectDomain) {
    return origin;
  }

  return isBlockedHost || hostname === 'merilive.top' || hostname === 'www.merilive.top'
    ? FALLBACK_ADMIN_ORIGIN
    : origin;
};