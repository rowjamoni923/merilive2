const STANDALONE_PUBLIC_PREFIXES = [
  '/agency-policy',
  '/policies-benefits',
  '/helper-policy',
  '/policies',
  '/about',
  '/contact',
  '/support',
  '/agency-signup',
  '/create-agency',
  '/become-sub-agent',
  '/payroll-helper-guide',
  '/link',
  '/smart-link',
  '/share',
  '/privacy-policy',
  '/terms',
  '/privacy',
  '/google-library-order-rules',
  '/account-deletion',
  '/delete-account',
  '/unsubscribe',
  '/blog',
] as const;

const LANDING_ONLY_HOSTS = new Set([
  'merilive.top',
  'www.merilive.top',
  'marilive.top',
  'www.marilive.top',
  'perilive.top',
  'www.perilive.top',
]);

export const isLandingOnlyHostname = (host: string): boolean => LANDING_ONLY_HOSTS.has(host.toLowerCase());

/**
 * Main app domain — every landing-page CTA / public link MUST jump here so the
 * SmartLink + auth flow runs on the production domain, not on a landing host.
 */
export const MAIN_APP_ORIGIN = 'https://merilive.com';

/**
 * Force a path to open via the main app domain when called from a landing host.
 * On the main domain (or anywhere else), returns the same-origin path so SPA
 * navigation still works.
 */
export const mainAppHref = (path: string): string => {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (typeof window === 'undefined') return `${MAIN_APP_ORIGIN}${clean}`;
  return isLandingOnlyHostname(window.location.hostname) ? `${MAIN_APP_ORIGIN}${clean}` : clean;
};

export const isStandalonePublicPath = (path: string): boolean => (
  STANDALONE_PUBLIC_PREFIXES.some((route) => path === route || path.startsWith(`${route}/`))
);

export const isStandalonePublicLocation = (loc: Pick<Location, 'hostname' | 'pathname'> = window.location): boolean => (
  isLandingOnlyHostname(loc.hostname) || isStandalonePublicPath(loc.pathname)
);
