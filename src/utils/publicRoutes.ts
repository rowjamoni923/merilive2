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

export const isStandalonePublicPath = (path: string): boolean => (
  STANDALONE_PUBLIC_PREFIXES.some((route) => path === route || path.startsWith(`${route}/`))
);

export const isStandalonePublicLocation = (loc: Pick<Location, 'hostname' | 'pathname'> = window.location): boolean => (
  isLandingOnlyHostname(loc.hostname) || isStandalonePublicPath(loc.pathname)
);
