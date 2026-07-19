/**
 * Shared Viewer Types
 * Used across Live Streams and Party Rooms
 */

export interface Viewer {
  id: string;
  app_uid?: string | null;
  display_name: string | null;
  avatar_url: string | null;
  user_level: number;
  coins?: number;
  beans?: number;
  is_vip?: boolean;
  joined_at?: string;
}

export interface SeatApplicant {
  id: string;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  user_level: number;
  requested_at?: string;
}

export interface ViewerPanelProps {
  isOpen: boolean;
  onClose: () => void;
  
  // For Live Streams
  streamId?: string;
  viewerCount?: number;
  
  // For Party Rooms
  roomId?: string;
  viewers?: Viewer[];
  seatApplicants?: SeatApplicant[];
  isHost?: boolean;
  onInviteViewer?: (viewerId: string) => void;
  onAcceptApplicant?: (applicantId: string) => void;
  onRejectApplicant?: (applicantId: string) => void;
  onViewProfile?: (viewerId: string) => void;
  
  // Common
  roomType?: 'live' | 'party';
}
