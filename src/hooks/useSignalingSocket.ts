import { useState, useEffect, useCallback, useRef } from 'react';

const WEBSOCKET_URL = 'wss://pppcwawjjpwwrmvezcdy.supabase.co/functions/v1/webrtc-signaling';

interface SignalingMessage {
  type: string;
  callId?: string;
  userId?: string;
  targetUserId?: string;
  payload?: any;
  participants?: string[];
}

interface UseSignalingSocketOptions {
  callId: string;
  userId: string;
  onUserJoined?: (userId: string) => void;
  onUserLeft?: (userId: string) => void;
  onOffer?: (userId: string, offer: RTCSessionDescriptionInit) => void;
  onAnswer?: (userId: string, answer: RTCSessionDescriptionInit) => void;
  onIceCandidate?: (userId: string, candidate: RTCIceCandidateInit) => void;
  onPeerReady?: (userId: string) => void;
  onRoomInfo?: (participants: string[]) => void;
}

export function useSignalingSocket({
  callId,
  userId,
  onUserJoined,
  onUserLeft,
  onOffer,
  onAnswer,
  onIceCandidate,
  onPeerReady,
  onRoomInfo,
}: UseSignalingSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    console.log('Connecting to signaling socket...');
    const ws = new WebSocket(WEBSOCKET_URL);

    ws.onopen = () => {
      console.log('Signaling socket connected');
      setIsConnected(true);
      
      // Join the call room
      ws.send(JSON.stringify({
        type: 'join',
        callId,
        userId
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message: SignalingMessage = JSON.parse(event.data);
        console.log('Signaling message received:', message.type);

        switch (message.type) {
          case 'room-info':
            onRoomInfo?.(message.participants || []);
            break;

          case 'user-joined':
            onUserJoined?.(message.userId!);
            break;

          case 'user-left':
            onUserLeft?.(message.userId!);
            break;

          case 'offer':
            onOffer?.(message.userId!, message.payload);
            break;

          case 'answer':
            onAnswer?.(message.userId!, message.payload);
            break;

          case 'ice-candidate':
            onIceCandidate?.(message.userId!, message.payload);
            break;

          case 'peer-ready':
            onPeerReady?.(message.userId!);
            break;
        }
      } catch (error) {
        console.error('Error parsing signaling message:', error);
      }
    };

    ws.onclose = () => {
      console.log('Signaling socket closed');
      setIsConnected(false);
      
      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        if (socketRef.current === ws) {
          connect();
        }
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('Signaling socket error:', error);
    };

    socketRef.current = ws;
  }, [callId, userId, onUserJoined, onUserLeft, onOffer, onAnswer, onIceCandidate, onPeerReady, onRoomInfo]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({
        type: 'leave',
        callId,
        userId
      }));
      socketRef.current.close();
      socketRef.current = null;
    }
    setIsConnected(false);
  }, [callId, userId]);

  const sendOffer = useCallback((targetUserId: string, offer: RTCSessionDescriptionInit) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'offer',
        callId,
        userId,
        targetUserId,
        payload: offer
      }));
    }
  }, [callId, userId]);

  const sendAnswer = useCallback((targetUserId: string, answer: RTCSessionDescriptionInit) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'answer',
        callId,
        userId,
        targetUserId,
        payload: answer
      }));
    }
  }, [callId, userId]);

  const sendIceCandidate = useCallback((targetUserId: string, candidate: RTCIceCandidateInit) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'ice-candidate',
        callId,
        userId,
        targetUserId,
        payload: candidate
      }));
    }
  }, [callId, userId]);

  const sendReady = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'ready',
        callId,
        userId
      }));
    }
  }, [callId, userId]);

  useEffect(() => {
    if (callId && userId) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [callId, userId, connect, disconnect]);

  return {
    isConnected,
    sendOffer,
    sendAnswer,
    sendIceCandidate,
    sendReady,
    disconnect
  };
}
