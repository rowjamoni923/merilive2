import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { Button } from "@/components/ui/button";
import { Download, Smartphone, ArrowRight, Loader2 } from "lucide-react";
import meriliveLogo from "@/assets/merilive-logo.png";
import { PLAY_STORE_URL, APK_DOWNLOAD_URL } from "@/utils/shareLinks";
import { supabase } from "@/integrations/supabase/client";
import BrowserAgencyForm from "@/components/agency/BrowserAgencyForm";
import BrowserSubAgentForm from "@/components/agency/BrowserSubAgentForm";
import { useEnableBrowserPageInteraction } from "@/hooks/useEnableBrowserPageInteraction";
import { recordClientError } from "@/utils/clientErrorLog";

/**
 * Smart Link Landing Page
 * 
 * This page handles deep linking when users click shared links in browsers:
 * 1. For sub-agency links (parent=CODE) → Shows browser-based sub-agency form
 * 2. For sub-agent links (agency=CODE or ref=CODE) → Shows browser-based sub-agent form
 * 3. If app is installed → Opens the app directly
 * 4. If app is NOT installed → Shows download option and stores the deep link
 * 5. After app install → User opens app, stored link redirects them to the right place
 */
const SmartLink = () => {
  useEnableBrowserPageInteraction();
  const [searchParams] = useSearchParams();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showDownload, setShowDownload] = useState(false);

  // Get the intended destination from the URL
  const rawRef = searchParams.get("ref");
  const agencyParam = searchParams.get("agency");
  const parent = searchParams.get("parent");
  const code = searchParams.get("code");
  const target = searchParams.get("target"); // Custom target path
  const hostId = searchParams.get("host");

  // Check if we're in native app or web browser
  const isNativeApp = Capacitor.isNativePlatform();

  // ref is now treated as invitation-first; only use sub-agent form for explicit agency param
  // or when ref is verified to be an agency code.
  const [resolvedRefType, setResolvedRefType] = useState<"unknown" | "agency" | "invitation">("unknown");
  const [isCheckingRefType, setIsCheckingRefType] = useState(
    () => Boolean(rawRef && !agencyParam && !isNativeApp)
  );

  useEffect(() => {
    let isCancelled = false;

    const resolveRefType = async () => {
      if (isNativeApp) {
        setResolvedRefType(rawRef ? "invitation" : "unknown");
        setIsCheckingRefType(false);
        return;
      }

      if (agencyParam) {
        setResolvedRefType("agency");
        setIsCheckingRefType(false);
        return;
      }

      if (!rawRef) {
        setResolvedRefType("unknown");
        setIsCheckingRefType(false);
        return;
      }

      setIsCheckingRefType(true);

      try {
        const normalizedRef = rawRef.trim();

        const [inviterResult, agencyResult] = await Promise.all([
          supabase
            .from("profiles_public")
            .select("id")
            .eq("app_uid", normalizedRef)
            .maybeSingle(),
          supabase
            .from("agencies_public")
            .select("id")
            .eq("agency_code", normalizedRef.toUpperCase())
            .maybeSingle(),
        ]);

        if (isCancelled) return;

        if (inviterResult.data) {
          setResolvedRefType("invitation");
        } else if (agencyResult.data) {
          setResolvedRefType("agency");
        } else {
          // Default to invitation flow for unknown refs to avoid false "Agency Not Found"
          setResolvedRefType("invitation");
        }
      } catch (error) {
        console.error("[SmartLink] Failed to resolve ref type:", error);
        recordClientError({ label: "SmartLink.normalizedRef", message: error instanceof Error ? error.message : String(error) });
        if (!isCancelled) {
          setResolvedRefType("invitation");
        }
      } finally {
        if (!isCancelled) {
          setIsCheckingRefType(false);
        }
      }
    };

    resolveRefType();

    return () => {
      isCancelled = true;
    };
  }, [rawRef, agencyParam, isNativeApp]);

  const agencyRef = agencyParam || (rawRef && resolvedRefType === "agency" ? rawRef : null);
  const invitationRef = rawRef && !agencyParam && resolvedRefType !== "agency" ? rawRef : null;

  const shouldShowBrowserAgencyForm = Boolean(parent && !isNativeApp);
  const shouldShowBrowserSubAgentForm = Boolean(agencyRef && !isNativeApp);

  // Build the deep link path
  const getDeepLinkPath = () => {
    if (invitationRef) return `/auth?ref=${encodeURIComponent(invitationRef)}`;
    if (agencyRef) return `/become-sub-agent?ref=${encodeURIComponent(agencyRef)}`;
    if (parent) return `/create-agency?parent=${encodeURIComponent(parent)}`;
    if (code) return `/join-agency?code=${encodeURIComponent(code)}`;
    if (hostId) return `/profile/${hostId}`;
    if (target) return target;
    return "/";
  };

  const deepLinkPath = getDeepLinkPath();

  // Store pending deep link for deferred deep linking
  const storePendingDeepLink = () => {
    const pendingLink = {
      path: deepLinkPath,
      ref: rawRef,
      parent,
      code,
      hostId,
      timestamp: Date.now(),
      fullUrl: window.location.href,
    };
    localStorage.setItem("meri_pending_deep_link", JSON.stringify(pendingLink));
    console.log("[SmartLink] Stored pending deep link:", pendingLink);
  };

  // Try to open the app
  const tryOpenApp = () => {
    // Create the custom URL scheme link
    const customSchemeUrl = `merilive://${deepLinkPath.replace(/^\//, '')}`;

    // Create the Android intent URL with fallback to Play Store
    // S.browser_fallback_url ensures Play Store opens if app not installed
    const intentUrl = `intent://${deepLinkPath.replace(/^\//, '')}#Intent;scheme=merilive;package=com.merilive.app;S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`;

    console.log("[SmartLink] Attempting to open app...");
    console.log("[SmartLink] Custom scheme:", customSchemeUrl);
    console.log("[SmartLink] Intent URL:", intentUrl);

    // Store the deep link before attempting to open
    storePendingDeepLink();

    // Try to detect if app opened
    let appOpened = false;
    const startTime = Date.now();

    // Listen for visibility change (app opened = page goes to background)
    const visibilityHandler = () => {
      if (document.hidden && Date.now() - startTime < 3000) {
        appOpened = true;
        console.log("[SmartLink] App appears to have opened");
      }
    };
    document.addEventListener("visibilitychange", visibilityHandler);

    // Try Android Intent first (most reliable on Android)
    const isAndroid = /android/i.test(navigator.userAgent);
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

    if (isAndroid) {
      // Try intent URL - will automatically fallback to Play Store if app not installed
      window.location.href = intentUrl;
    } else if (isIOS) {
      // Try universal link first, then custom scheme
      window.location.href = customSchemeUrl;
    } else {
      // Desktop - try custom scheme
      window.location.href = customSchemeUrl;
    }

    // If app didn't open after 2.5 seconds, show download option
    setTimeout(() => {
      document.removeEventListener("visibilitychange", visibilityHandler);
      if (!appOpened && !document.hidden) {
        console.log("[SmartLink] App not detected, showing download option");
        setIsRedirecting(false);
        setShowDownload(true);
      }
    }, 2500);
  };

  // On component mount
  useEffect(() => {
    if (isCheckingRefType) return;

    // parent/agency flows stay in browser forms
    if (shouldShowBrowserAgencyForm || shouldShowBrowserSubAgentForm) {
      return;
    }

    // If already in the native app, navigate directly
    if (Capacitor.isNativePlatform()) {
      console.log("[SmartLink] Already in native app, this shouldn't happen");
      window.location.href = deepLinkPath;
      return;
    }

    // For invitation and other links, try to open the app automatically
    setIsRedirecting(true);
    tryOpenApp();
  }, [isCheckingRefType, shouldShowBrowserAgencyForm, shouldShowBrowserSubAgentForm, deepLinkPath]);

  // Build Play Store URL with referrer for deferred deep linking
  // Android Install Referrer API will pass this back to the app after install
  const getPlayStoreUrlWithReferrer = () => {
    const referrerParts: string[] = [];
    if (code) referrerParts.push(`agency_code=${code}`);
    if (rawRef) referrerParts.push(`ref=${rawRef}`);
    if (parent) referrerParts.push(`parent=${parent}`);
    if (hostId) referrerParts.push(`host=${hostId}`);
    if (target) referrerParts.push(`target=${encodeURIComponent(target)}`);
    
    if (referrerParts.length > 0) {
      const referrer = encodeURIComponent(referrerParts.join('&'));
      return `${PLAY_STORE_URL}&referrer=${referrer}`;
    }
    return PLAY_STORE_URL;
  };

  const playStoreUrl = getPlayStoreUrlWithReferrer();
  const apkDownloadUrl = APK_DOWNLOAD_URL;

  const [codeCopied, setCodeCopied] = useState(false);

  const handleDownload = () => {
    storePendingDeepLink();
    window.location.href = playStoreUrl;
  };

  const handleDirectDownload = () => {
    storePendingDeepLink();
    window.location.href = apkDownloadUrl;
  };

  const copyRefCode = () => {
    const codeToCopy = invitationRef || code || rawRef || '';
    navigator.clipboard.writeText(codeToCopy);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  if (isCheckingRefType && rawRef && !agencyParam && !isNativeApp) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-purple-800 to-orange-50 flex flex-col items-center justify-center p-6">
        <img src={meriliveLogo} alt="MeriLive" className="w-24 h-24 mb-6 animate-pulse" />
        <div className="flex items-center gap-3 text-white">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-lg">Checking your link...</span>
        </div>
      </div>
    );
  }

  if (shouldShowBrowserAgencyForm && parent) {
    return <BrowserAgencyForm parentAgencyCode={parent} />;
  }

  if (shouldShowBrowserSubAgentForm && agencyRef) {
    return <BrowserSubAgentForm agencyCode={agencyRef} />;
  }

  // For invitation links: show Play Store download page immediately with referral code
  // This ensures users download from Play Store and can enter their referral code after install
  if (invitationRef && !isNativeApp) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-purple-800 to-orange-50 flex flex-col items-center justify-center p-6 overflow-y-auto overflow-x-hidden">
        <img src={meriliveLogo} alt="MeriLive" className="w-28 h-28 mb-6" />
        <h1 className="text-3xl font-bold text-white mb-2">MeriLive</h1>
        <p className="text-slate-600 text-center mb-6 max-w-xs">
          Live streaming, video calls, party rooms and more!
        </p>

        <div className="w-full max-w-sm space-y-4">
          {/* Referral Code - Very Prominent */}
          <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 backdrop-blur-sm rounded-2xl p-5 border border-amber-400/30">
            <p className="text-amber-300 text-xs font-bold mb-1 text-center">🎁 YOUR REFERRAL CODE</p>
            <p className="text-amber-200/60 text-[11px] text-center mb-3">
              Copy this code → Download app → Enter code after signup
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-white/80 rounded-xl px-4 py-3.5 border border-amber-400/30">
                <p className="text-white font-mono text-2xl font-bold tracking-widest text-center">
                  {invitationRef}
                </p>
              </div>
              <button
                onClick={copyRefCode}
                className="w-14 h-14 bg-amber-500/30 hover:bg-amber-500/50 rounded-xl flex items-center justify-center text-xl transition-colors shrink-0"
              >
                {codeCopied ? '✅' : '📋'}
              </button>
            </div>
            <p className="text-green-300 text-[11px] mt-2 text-center font-medium">
              ✨ Enter this code after signup to get rewards!
            </p>
          </div>

          {/* Play Store Download - Primary CTA */}
          <Button
            onClick={handleDownload}
            className="w-full h-14 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-lg font-semibold rounded-xl shadow-lg shadow-green-500/30"
          >
            <Download className="w-5 h-5 mr-2" />
            Download from Play Store
          </Button>

          {/* Steps */}
          <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-amber-200/60 space-y-2.5">
            <p className="text-slate-700 text-xs font-semibold mb-2">📋 How to get rewards:</p>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
              <p className="text-slate-500 text-xs">Copy the referral code above</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
              <p className="text-slate-500 text-xs">Download & install MeriLive from Play Store</p>
            </div>
            <div className="flex items-start gap-2">
              <span className="w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
              <p className="text-slate-500 text-xs">Sign up and enter the referral code</p>
            </div>
          </div>

          {/* Second Play Store Button */}
          <Button
            onClick={handleDownload}
            variant="outline"
            className="w-full h-11 border-green-400/30 text-green-300 hover:bg-green-500/10 rounded-xl"
          >
            <Download className="w-4 h-4 mr-2" />
            Open Play Store
          </Button>

          {/* Already have app */}
          <button
            onClick={tryOpenApp}
            className="w-full text-center text-slate-500 hover:text-white text-sm py-2 flex items-center justify-center gap-1"
          >
            App already installed? Click here
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (isRedirecting) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-rose-50 via-purple-800 to-orange-50 flex flex-col items-center justify-center p-6">
        <img src={meriliveLogo} alt="MeriLive" className="w-24 h-24 mb-6 animate-pulse" />
        <div className="flex items-center gap-3 text-white">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-lg">Opening MeriLive...</span>
        </div>
        <p className="text-slate-500 text-sm mt-4">Redirecting to app...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-purple-800 to-orange-50 flex flex-col items-center justify-center p-6 overflow-y-auto overflow-x-hidden">
      <img src={meriliveLogo} alt="MeriLive" className="w-28 h-28 mb-6" />
      <h1 className="text-3xl font-bold text-white mb-2">MeriLive</h1>
      <p className="text-slate-600 text-center mb-8 max-w-xs">
        Live streaming, video calls, party rooms and more!
      </p>

      {showDownload && (
        <div className="w-full max-w-sm space-y-4">
          <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 border border-amber-200/60 mb-6">
            <div className="flex items-center gap-3 mb-2">
              <Smartphone className="w-6 h-6 text-amber-400" />
              <p className="text-white font-medium">Install the App</p>
            </div>
            <p className="text-slate-500 text-sm">
              Download MeriLive app to join via your referral link
            </p>
          </div>

          {(code || (rawRef && resolvedRefType === "agency")) && (
            <div className="bg-gradient-to-r from-amber-500/20 to-orange-500/20 backdrop-blur-sm rounded-2xl p-4 border border-amber-400/30">
              <p className="text-amber-300 text-xs font-medium mb-2">📋 Agency Code — Use in the app</p>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white/80 rounded-xl px-4 py-3 border border-amber-400/20">
                  <p className="text-white font-mono text-xl font-bold tracking-wider text-center">
                    {code || rawRef}
                  </p>
                </div>
                <button
                  onClick={copyRefCode}
                  className="w-12 h-12 bg-amber-500/30 hover:bg-amber-500/50 rounded-xl flex items-center justify-center text-xl transition-colors"
                >
                  {codeCopied ? '✅' : '📋'}
                </button>
              </div>
              <p className="text-amber-200/60 text-[11px] mt-2 text-center">
                Enter this code in "Join Agency" after installing the app
              </p>
            </div>
          )}

          <Button
            onClick={handleDownload}
            className="w-full h-14 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-lg font-semibold rounded-xl shadow-lg"
          >
            <Download className="w-5 h-5 mr-2" />
            Download from Play Store
          </Button>

          <Button
            onClick={handleDownload}
            variant="outline"
            className="w-full h-12 border-green-400/30 text-green-300 hover:bg-green-500/10 rounded-xl"
          >
            <Download className="w-4 h-4 mr-2" />
            Open Play Store
          </Button>

          <button
            onClick={tryOpenApp}
            className="w-full text-center text-slate-500 hover:text-white text-sm py-2 flex items-center justify-center gap-1"
          >
            App already installed? Click here
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {rawRef && !code && resolvedRefType !== "agency" && (
        <div className="mt-8 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 border border-amber-200/60">
          <p className="text-slate-500 text-xs">
            Referral Code: <span className="text-white font-mono font-bold">{rawRef}</span>
          </p>
        </div>
      )}
    </div>
  );
};

export default SmartLink;
