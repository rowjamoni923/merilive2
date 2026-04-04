/**
 * CENTRALIZED SHARE LINKS UTILITY
 * 
 * All shareable links in the app MUST use this utility to ensure:
 * 1. Production domain (merilive.com) is always used
 * 2. SmartLink system handles deep linking properly
 * 3. Deferred deep linking works for new users
 * 
 * When someone clicks a shared link:
 * - If app installed → Opens directly in app
 * - If app NOT installed → Redirects to Play Store
 * - After install → User lands on the intended destination
 */

// Production domain - NEVER use localhost or .top domain for sharing
export const PRODUCTION_DOMAIN = 'https://merilive.com';

// Play Store URL
export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.merilive.app';

// APK direct download URL
export const APK_DOWNLOAD_URL = 'https://merilive.com/download/merilive-latest.apk';

/**
 * Generate a SmartLink that handles deep linking properly
 * This link will open the app if installed, or redirect to Play Store
 */
export const generateSmartLink = (path: string, params?: Record<string, string>): string => {
  const queryParams = new URLSearchParams(params);
  queryParams.set('target', path);
  return `${PRODUCTION_DOMAIN}/link?${queryParams.toString()}`;
};

/**
 * Generate invitation/referral link
 * Used when inviting new users to join the app
 */
export const generateInvitationLink = (referralCode: string): string => {
  return `${PRODUCTION_DOMAIN}/link?ref=${referralCode}`;
};

/**
 * Generate agency join link
 * Used when inviting hosts to join an agency
 */
export const generateAgencyJoinLink = (agencyCode: string): string => {
  return `${PRODUCTION_DOMAIN}/link?code=${agencyCode}`;
};

/**
 * Generate sub-agent referral link
 * Used when recruiting sub-agents for an agency
 * This must use the `agency` param so SmartLink opens BrowserSubAgentForm.
 */
export const generateSubAgentLink = (agencyCode: string): string => {
  return `${PRODUCTION_DOMAIN}/link?agency=${agencyCode}`;
};

/**
 * Generate parent agency link
 * Used when creating sub-agencies under a parent
 */
export const generateParentAgencyLink = (parentAgencyCode: string): string => {
  return `${PRODUCTION_DOMAIN}/link?parent=${parentAgencyCode}`;
};

/**
 * Generate profile/host link
 * Used when sharing a host's profile
 */
export const generateProfileLink = (userId: string): string => {
  return `${PRODUCTION_DOMAIN}/link?host=${userId}`;
};

/**
 * Generate party room invitation link
 * Used when inviting users to join a party room
 */
export const generatePartyRoomLink = (roomId: string): string => {
  return `${PRODUCTION_DOMAIN}/link?target=/party/${roomId}`;
};

/**
 * Generate live stream invitation link
 * Used when sharing a live stream
 */
export const generateLiveStreamLink = (streamId: string): string => {
  return `${PRODUCTION_DOMAIN}/link?target=/live/${streamId}`;
};

/**
 * Generate reel share link
 * Used when sharing a reel video
 */
export const generateReelLink = (reelId: string): string => {
  return `${PRODUCTION_DOMAIN}/link?target=/reels/${reelId}`;
};

/**
 * Share link using native share API or clipboard fallback
 */
export const shareLink = async (
  url: string,
  options?: {
    title?: string;
    text?: string;
  }
): Promise<boolean> => {
  if (navigator.share) {
    try {
      await navigator.share({
        title: options?.title || 'MeriLive',
        text: options?.text || 'Join me on MeriLive!',
        url: url,
      });
      return true;
    } catch (err) {
      // User cancelled or share failed - fall back to clipboard
      console.log('[shareLinks] Native share failed, using clipboard');
    }
  }
  
  // Fallback to clipboard
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch (err) {
    console.error('[shareLinks] Clipboard write failed:', err);
    return false;
  }
};

/**
 * Copy link to clipboard
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('[shareLinks] Clipboard write failed:', err);
    return false;
  }
};
