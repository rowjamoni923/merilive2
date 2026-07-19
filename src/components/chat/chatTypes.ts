// Shared types for chat components

export interface Conversation {
  id: string;
  participant1_id: string;
  participant2_id: string;
  last_message_at: string | null;
  other_user: {
    display_name: string | null;
    avatar_url: string | null;
    is_online: boolean | null;
    is_verified: boolean | null;
    is_host: boolean | null;
    gender: string | null;
    user_level?: number | null;
    host_level?: number | null;
    max_user_level?: number | null;
    country_flag?: string | null;
    country_name?: string | null;
    city?: string | null;
    last_seen_at?: string | null;
    call_rate_per_minute?: number | null;
  } | null;
  last_message?: string;
  unread_count: number;
}

export interface Group {
  id: string;
  name: string;
  avatar_url: string | null;
  group_type: string;
  group_code: string;
  owner_id: string;
  member_count: number;
  is_owner: boolean;
}

export interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  is_read: boolean;
  message_type: string;
  status?: 'sending' | 'queued' | 'sent' | 'delivered' | 'read';
  delivered_at?: string | null;
  read_at?: string | null;
  reply_to_id?: string | null;
  _optimistic?: boolean;
}

export interface GroupMessage {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  message_type: string;
  sender?: {
    display_name: string | null;
    avatar_url: string | null;
    user_level?: number | null;
    host_level?: number | null;
    max_user_level?: number | null;
    gender?: string | null;
    is_host?: boolean | null;
  };
}
