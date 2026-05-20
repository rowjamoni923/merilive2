import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { processInstallReferrer } from '@/utils/installReferrer';
import { parseReferralPayload } from '@/utils/referralParsing';

/**
 * Component to handle deep links when the app is opened via a URL
 * Must be rendered inside BrowserRouter context
 */
const DeepLinkHandler = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const resolveSmartLink = (search: string) => {
    const params = new URLSearchParams(search);
    const ref = params.get('ref');
    const agencyCode = params.get('agency');
    const parent = params.get('parent');
    const code = params.get('code');
    const hostId = params.get('host');
    const target = params.get('target');

    // Explicit sub-agent agency link → go to become-sub-agent
    if (agencyCode) {
      localStorage.setItem('meri_pending_referral', agencyCode);
      return { pathname: '/become-sub-agent', searchParams: `?agency=${encodeURIComponent(agencyCode)}` };
    }

    if (ref) {
      localStorage.setItem('meri_pending_invitation_ref', ref);
      localStorage.setItem('meri_pending_referral', ref);
      return { pathname: '/auth', searchParams: `?ref=${encodeURIComponent(ref)}` };
    }

    if (parent) return { pathname: '/create-agency', searchParams: `?parent=${encodeURIComponent(parent)}` };

    if (code) {
      localStorage.setItem('meri_pending_referral', code);
      return { pathname: '/join-agency', searchParams: `?code=${encodeURIComponent(code)}` };
    }

    if (hostId) return { pathname: `/profile/${hostId}`, searchParams: '' };

    if (target) {
      const safeTarget = target.startsWith('/') ? target : `/${target}`;
      return { pathname: safeTarget, searchParams: '' };
    }

    return null;
  };

  const parseIncomingUrl = (incomingUrl: string) => {
    try {
      if (incomingUrl.startsWith('http')) {
        const url = new URL(incomingUrl);
        if (url.pathname === '/smart-link' || url.pathname === '/link') {
          return resolveSmartLink(url.search);
        }
        return { pathname: url.pathname, searchParams: url.search };
      }

      if (incomingUrl.startsWith('merilive://')) {
        const withoutScheme = incomingUrl.replace('merilive://', '');
        const [path = '', query = ''] = withoutScheme.split('?');
        const pathname = `/${path}`;
        const searchParams = query ? `?${query}` : '';

        if (pathname === '/smart-link' || pathname === '/link') {
          return resolveSmartLink(searchParams);
        }

        return { pathname, searchParams };
      }
    } catch (error) {
      console.error('[DeepLink] Error parsing URL:', error);
    }

    return null;
  };

  const checkDeferredDeepLink = () => {
    try {
      const pendingLink = localStorage.getItem('meri_pending_deep_link');
      if (!pendingLink) return false;

      const data = JSON.parse(pendingLink);
      const maxAge = 24 * 60 * 60 * 1000;
      if (Date.now() - data.timestamp >= maxAge) {
        localStorage.removeItem('meri_pending_deep_link');
        return false;
      }

      localStorage.removeItem('meri_pending_deep_link');

      if (data.ref) {
        localStorage.setItem('meri_pending_invitation_ref', data.ref);
        localStorage.setItem('meri_pending_referral', data.ref);
      }
      if (data.code) {
        localStorage.setItem('meri_pending_referral', data.code);
      }

      if (data.path && data.path !== '/' && location.pathname !== data.path) {
        navigate(data.path, { replace: true });
        return true;
      }
    } catch (error) {
      console.error('[DeepLink] Error checking deferred deep link:', error);
      localStorage.removeItem('meri_pending_deep_link');
    }

    return false;
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Pkg62 — On Android, ask Play Store for the deferred deep-link referrer
    // (utm/ref/agency) written when the user clicked the share link before
    // installing. Stores it in the same localStorage keys explicit deep links
    // use, so JoinAgency + Invitation tracking auto-fill on first signup.
    void processInstallReferrer();

    const handleAppUrlOpen = (event: { url: string }) => {
      const parsed = parseIncomingUrl(event.url);
      if (!parsed?.pathname) return;

      const fullPath = `${parsed.pathname}${parsed.searchParams || ''}`;
      if (location.pathname + location.search !== fullPath) {
        navigate(fullPath, { replace: true });
      }
    };

    const listener = App.addListener('appUrlOpen', handleAppUrlOpen);

    App.getLaunchUrl().then((result) => {
      if (result?.url) {
        handleAppUrlOpen({ url: result.url });
      } else {
        checkDeferredDeepLink();
      }
    });

    return () => {
      listener.then((l) => l.remove());
    };
  }, [navigate, location.pathname, location.search]);

  return null;
};

export default DeepLinkHandler;
