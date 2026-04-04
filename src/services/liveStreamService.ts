import { supabase } from '@/integrations/supabase/client';

const EDGE_FUNCTION_URL = 'https://pppcwawjjpwwrmvezcdy.supabase.co/functions/v1/live-stream';

export interface StreamData {
  id: string;
  host_id: string;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  is_active: boolean;
  viewer_count: number;
  started_at: string | null;
  host?: {
    id: string;
    display_name: string | null;
    avatar_url: string | null;
    user_level: number | null;
    is_verified: boolean | null;
    country_flag: string | null;
  };
}

export async function startStream(title: string, description?: string, thumbnailUrl?: string): Promise<{ success: boolean; stream?: StreamData; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    const response = await fetch(`${EDGE_FUNCTION_URL}/start-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ title, description, thumbnailUrl })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to start stream' };
    }

    return { success: true, stream: data.stream };
  } catch (error) {
    console.error('Error starting stream:', error);
    return { success: false, error: 'Network error' };
  }
}

export async function endStream(streamId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return { success: false, error: 'Not authenticated' };
    }

    const response = await fetch(`${EDGE_FUNCTION_URL}/end-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ streamId })
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to end stream' };
    }

    return { success: true };
  } catch (error) {
    console.error('Error ending stream:', error);
    return { success: false, error: 'Network error' };
  }
}

export async function getActiveStreams(): Promise<{ streams: StreamData[]; error?: string }> {
  try {
    const response = await fetch(`${EDGE_FUNCTION_URL}/active-streams`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (!response.ok) {
      return { streams: [], error: data.error || 'Failed to fetch streams' };
    }

    return { streams: data.streams || [] };
  } catch (error) {
    console.error('Error fetching active streams:', error);
    return { streams: [], error: 'Network error' };
  }
}

export async function getIceServers(): Promise<RTCIceServer[]> {
  try {
    const response = await fetch('https://pppcwawjjpwwrmvezcdy.supabase.co/functions/v1/webrtc-signaling/ice-servers', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    return data.iceServers || [];
  } catch (error) {
    console.error('Error fetching ICE servers:', error);
    // Return default STUN servers
    return [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ];
  }
}
