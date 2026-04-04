import { useState, useEffect, useCallback, useRef } from 'react';

const WEBSOCKET_URL = 'wss://pppcwawjjpwwrmvezcdy.supabase.co/functions/v1/live-stream';

interface StreamMessage {
  type: string;
  streamId?: string;
  userId?: string;
  payload?: any;
  count?: number;
  viewerCount?: number;
  isLive?: boolean;
}

interface UseLiveStreamSocketOptions {
  streamId: string;
  userId: string;
  isHost?: boolean;
  onViewerJoined?: (userId: string, count: number) => void;
  onViewerLeft?: (userId: string, count: number) => void;
  onChat?: (userId: string, message: any) => void;
  onGift?: (userId: string, gift: any) => void;
  onLike?: (userId: string) => void;
  onStreamEnded?: () => void;
  onViewerCountUpdate?: (count: number) => void;
}

export function useLiveStreamSocket({
  streamId,
  userId,
  isHost = false,
  onViewerJoined,
  onViewerLeft,
  onChat,
  onGift,
  onLike,
  onStreamEnded,
  onViewerCountUpdate,
}: UseLiveStreamSocketOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    console.log('Connecting to live stream socket...');
    const ws = new WebSocket(WEBSOCKET_URL);

    ws.onopen = () => {
      console.log('Live stream socket connected');
      setIsConnected(true);
      
      // Join the stream
      ws.send(JSON.stringify({
        type: 'join-stream',
        streamId,
        userId,
        payload: { isHost }
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message: StreamMessage = JSON.parse(event.data);
        console.log('Stream message received:', message.type);

        switch (message.type) {
          case 'stream-info':
            setViewerCount(message.viewerCount || 0);
            break;

          case 'viewer-joined':
            if (message.viewerCount !== undefined) {
              setViewerCount(message.viewerCount);
              onViewerJoined?.(message.userId!, message.viewerCount);
            }
            break;

          case 'viewer-left':
            if (message.viewerCount !== undefined) {
              setViewerCount(message.viewerCount);
              onViewerLeft?.(message.userId!, message.viewerCount);
            }
            break;

          case 'viewer-count':
            if (message.count !== undefined) {
              setViewerCount(message.count);
              onViewerCountUpdate?.(message.count);
            }
            break;

          case 'chat':
            onChat?.(message.userId!, message.payload);
            break;

          case 'gift':
            onGift?.(message.userId!, message.payload);
            break;

          case 'like':
            onLike?.(message.userId!);
            break;

          case 'stream-ended':
            onStreamEnded?.();
            break;
        }
      } catch (error) {
        console.error('Error parsing stream message:', error);
      }
    };

    ws.onclose = () => {
      console.log('Live stream socket closed');
      setIsConnected(false);
      
      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        if (socketRef.current === ws) {
          connect();
        }
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('Live stream socket error:', error);
    };

    socketRef.current = ws;
  }, [streamId, userId, isHost, onViewerJoined, onViewerLeft, onChat, onGift, onLike, onStreamEnded, onViewerCountUpdate]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({
        type: 'leave-stream',
        streamId,
        userId
      }));
      socketRef.current.close();
      socketRef.current = null;
    }
    setIsConnected(false);
  }, [streamId, userId]);

  const sendChat = useCallback((message: string, senderName: string, senderAvatar?: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'chat',
        streamId,
        userId,
        payload: { message, senderName, senderAvatar, timestamp: Date.now() }
      }));
    }
  }, [streamId, userId]);

  const sendGift = useCallback((gift: { id: string; name: string; icon: string; value: number; animation: string }) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'gift',
        streamId,
        userId,
        payload: gift
      }));
    }
  }, [streamId, userId]);

  const sendLike = useCallback(() => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'like',
        streamId,
        userId
      }));
    }
  }, [streamId, userId]);

  useEffect(() => {
    if (streamId && userId) {
      connect();
    }
    
    return () => {
      disconnect();
    };
  }, [streamId, userId, connect, disconnect]);

  return {
    isConnected,
    viewerCount,
    sendChat,
    sendGift,
    sendLike,
    disconnect
  };
}
