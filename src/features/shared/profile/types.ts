// Unified Profile Types for Small Style Card
export interface ProfileData {
  id: string;
  name: string;
  avatar: string;
  level?: number;
  coins?: number;
  beans?: number;
  isFollowing?: boolean;
  isVIP?: boolean;
  isVerified?: boolean;
  isHost?: boolean;
  totalGiftsSent?: number;
  totalGiftsReceived?: number;
  followers?: number;
  following?: number;
  country?: string;
  countryFlag?: string;
  bio?: string;
  uid?: string;
  frameId?: string | null;
}

export interface UnifiedProfileCardProps {
  profile: ProfileData | null;
  isOpen: boolean;
  onClose: () => void;
  
  // Actions - shown based on isHost
  onFollow?: (profileId: string) => void;
  onMessage?: (profileId: string) => void;
  onGift?: (profileId: string) => void;
  onCall?: (profileId: string) => void;
  onBlock?: (profileId: string) => void;
  onReport?: (profileId: string) => void;
  onViewFullProfile?: (profileId: string) => void;
  
  // Context
  context?: 'live' | 'party';
  currentUserId?: string;
}
