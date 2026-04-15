import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface WebRTCState {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  isConnected: boolean;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  connectionState: RTCPeerConnectionState | 'new';
}

interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'ready';
  payload?: RTCSessionDescriptionInit | RTCIceCandidateInit;
  sender_id: string;
  call_id: string;
}

export function useWebRTC(callId: string | null, userId: string | null, isHost: boolean) {
  const [state, setState] = useState<WebRTCState>({
    localStream: null,
    remoteStream: null,
    isConnected: false,
    isAudioEnabled: true,
    isVideoEnabled: true,
    connectionState: 'new',
  });

  const [remoteStreamVersion, setRemoteStreamVersion] = useState(0);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const isInitializedRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const hasRemoteDescRef = useRef(false);
  const hasSentOfferRef = useRef(false);
  const hasSentReadyRef = useRef(false);
  const offerAttemptCountRef = useRef(0);
  const disconnectedRecoveryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const iceRestartAttemptRef = useRef(0);
  
  // ✅ CRITICAL FIX: Store mutable values in refs so the init effect has ZERO unstable deps
  const callIdRef = useRef(callId);
  const userIdRef = useRef(userId);
  const isHostRef = useRef(isHost);
  // Track if call was intentionally ended to block re-init
  const callDeadRef = useRef(false);
  
  // Keep refs in sync
  useEffect(() => { callIdRef.current = callId; }, [callId]);
  useEffect(() => { userIdRef.current = userId; }, [userId]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  const iceServers: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
      {
        urls: 'turn:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject',
      },
    ],
    iceCandidatePoolSize: 20,
  };

  // Initialize local media stream - HD first with graceful fallback
  const initializeMedia = useCallback(async () => {
    console.log('[WebRTC] Initializing local media (HD profile)...');
    
    // Full HD camera — NO aspectRatio to avoid zoom/crop on Android WebView
    const constraints: MediaStreamConstraints[] = [
      {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: 'user',
        },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      },
      {
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: 'user',
        },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      },
      {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: 'user',
        },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      },
      {
        video: { facingMode: 'user' },
        audio: true
      },
      {
        video: false,
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      },
    ];

    for (let i = 0; i < constraints.length; i++) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints[i]);
        localStreamRef.current = stream;
        const hasVideoTrack = stream.getVideoTracks().length > 0;
        const hasAudioTrack = stream.getAudioTracks().length > 0;
        setState(prev => ({
          ...prev,
          localStream: stream,
          isVideoEnabled: hasVideoTrack,
          isAudioEnabled: hasAudioTrack,
        }));
        console.log('[WebRTC] ✅ Local media initialized, constraint set', i + 1, hasVideoTrack ? '(video+audio)' : '(audio-only)');
        return stream;
      } catch (error) {
        console.warn(`[WebRTC] Constraint set ${i + 1} failed:`, error);
      }
    }

    console.warn('[WebRTC] ⚠️ Media init failed, continuing in receive-only mode');
    localStreamRef.current = null;
    setState(prev => ({ ...prev, localStream: null, isVideoEnabled: false, isAudioEnabled: false }));
    return null;
  }, []);

  // Send signaling message via Supabase Realtime
  const sendSignaling = useCallback((message: SignalingMessage) => {
    if (channelRef.current) {
      console.log('[WebRTC] Sending signaling message:', message.type);
      channelRef.current.send({
        type: 'broadcast',
        event: 'signaling',
        payload: message,
      });
    }
  }, []);

  // Apply adaptive HD bitrate limits
  const applyBitrateLimits = useCallback(async () => {
    if (!peerConnectionRef.current) return;
    const senders = peerConnectionRef.current.getSenders();
    for (const sender of senders) {
      if (sender.track?.kind === 'video') {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = 3_500_000; // 3.5 Mbps for full HD portrait
        params.encodings[0].maxFramerate = 30;
        (params as any).degradationPreference = 'maintain-resolution';
        try {
          await sender.setParameters(params);
          console.log('[WebRTC] ✅ HD bitrate profile applied (1500kbps, 30fps)');
        } catch (e) {
          console.warn('[WebRTC] Could not set bitrate limits:', e);
        }
      } else if (sender.track?.kind === 'audio') {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) {
          params.encodings = [{}];
        }
        params.encodings[0].maxBitrate = 64_000;
        try { await sender.setParameters(params); } catch (_) { }
      }
    }
  }, []);

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('[WebRTC] Cleaning up WebRTC resources...');
    
    // ☠️ Mark as dead so init effect won't re-run
    callDeadRef.current = true;
    isInitializedRef.current = false;
    hasRemoteDescRef.current = false;
    hasSentOfferRef.current = false;
    hasSentReadyRef.current = false;
    offerAttemptCountRef.current = 0;
    iceRestartAttemptRef.current = 0;
    pendingCandidatesRef.current = [];

    if (disconnectedRecoveryTimerRef.current) {
      clearTimeout(disconnectedRecoveryTimerRef.current);
      disconnectedRecoveryTimerRef.current = null;
    }
    
    if (localStreamRef.current) {
      console.log('[WebRTC] Stopping local stream tracks');
      localStreamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log('[WebRTC] Stopped track:', track.kind);
      });
      localStreamRef.current = null;
    }
    
    if (remoteStreamRef.current) {
      console.log('[WebRTC] Stopping remote stream tracks');
      remoteStreamRef.current.getTracks().forEach(track => {
        track.stop();
      });
      remoteStreamRef.current = null;
    }
    
    if (peerConnectionRef.current) {
      console.log('[WebRTC] Closing peer connection, state:', peerConnectionRef.current.connectionState);
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.onconnectionstatechange = null;
      peerConnectionRef.current.oniceconnectionstatechange = null;
      peerConnectionRef.current.onicegatheringstatechange = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    
    if (channelRef.current) {
      console.log('[WebRTC] Removing signaling channel');
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    setState({
      localStream: null,
      remoteStream: null,
      isConnected: false,
      isAudioEnabled: true,
      isVideoEnabled: true,
      connectionState: 'new',
    });
    
    console.log('[WebRTC] Cleanup complete');
  }, []);

  // Toggle audio
  const toggleAudio = useCallback(() => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks();
      audioTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setState(prev => ({ ...prev, isAudioEnabled: audioTracks[0]?.enabled ?? false }));
    }
  }, []);

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      videoTracks.forEach(track => {
        track.enabled = !track.enabled;
      });
      setState(prev => ({ ...prev, isVideoEnabled: videoTracks[0]?.enabled ?? false }));
    }
  }, []);

  // ✅ CRITICAL FIX: Single stable init effect with ONLY primitive deps
  // All callbacks accessed via refs or defined inline to prevent teardown/reinit cycles
  useEffect(() => {
    if (!callId || !userId) {
      console.log('[WebRTC] Missing callId or userId, skipping init');
      return;
    }

    if (isInitializedRef.current) {
      console.log('[WebRTC] Already initialized, skipping');
      return;
    }

    // ✅ Reset dead flag for new call
    callDeadRef.current = false;
    isInitializedRef.current = true;

    // === ALL FUNCTIONS DEFINED INLINE TO AVOID DEPENDENCY ISSUES ===

    const sendSignalingMsg = (message: SignalingMessage) => {
      if (channelRef.current) {
        console.log('[WebRTC] Sending signaling message:', message.type);
        channelRef.current.send({
          type: 'broadcast',
          event: 'signaling',
          payload: message,
        });
      }
    };

    const applyBitrates = async () => {
      if (!peerConnectionRef.current) return;
      const senders = peerConnectionRef.current.getSenders();
      for (const sender of senders) {
        if (sender.track?.kind === 'video') {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
          params.encodings[0].maxBitrate = 1_500_000;
          params.encodings[0].maxFramerate = 30;
          try { await sender.setParameters(params); } catch (_) { }
        } else if (sender.track?.kind === 'audio') {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
          params.encodings[0].maxBitrate = 64_000;
          try { await sender.setParameters(params); } catch (_) { }
        }
      }
    };

    const processPending = async () => {
      if (!peerConnectionRef.current || !hasRemoteDescRef.current) return;
      console.log('[WebRTC] Processing pending candidates:', pendingCandidatesRef.current.length);
      for (const candidate of pendingCandidatesRef.current) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('[WebRTC] Error adding pending ICE candidate:', error);
        }
      }
      pendingCandidatesRef.current = [];
    };

    const sendOffer = async (force = false) => {
      if (!peerConnectionRef.current || !callIdRef.current || !userIdRef.current) return;
      if (hasSentOfferRef.current && !force) return;
      if (peerConnectionRef.current.signalingState !== 'stable') return;

      offerAttemptCountRef.current += 1;
      console.log(`[WebRTC] Creating offer... attempt #${offerAttemptCountRef.current}${force ? ' (forced)' : ''}`);
      hasSentOfferRef.current = true;

      try {
        const offer = await peerConnectionRef.current.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: true,
        });
        await peerConnectionRef.current.setLocalDescription(offer);
        await applyBitrates();
        
        sendSignalingMsg({
          type: 'offer',
          payload: offer,
          sender_id: userIdRef.current,
          call_id: callIdRef.current,
        });
      } catch (error) {
        hasSentOfferRef.current = false;
        console.error('[WebRTC] Error creating offer:', error);
      }
    };

    const handleSignaling = async (message: SignalingMessage) => {
      if (message.sender_id === userIdRef.current) return;
      if (callDeadRef.current) return;

      console.log('[WebRTC] Received signaling message:', message.type);

      try {
        if (message.type === 'ready') {
          if (!isHostRef.current && peerConnectionRef.current && !hasRemoteDescRef.current) {
            if (peerConnectionRef.current.signalingState === 'stable') {
              console.log('[WebRTC] Remote is ready, sending/re-sending offer...');
              await sendOffer(true);
            }
          }
        } else if (message.type === 'offer') {
          if (!peerConnectionRef.current) return;
          if (peerConnectionRef.current.signalingState !== 'stable') {
            console.warn('[WebRTC] Ignoring out-of-order offer. State:', peerConnectionRef.current.signalingState);
            return;
          }
          
          await peerConnectionRef.current.setRemoteDescription(
            new RTCSessionDescription(message.payload as RTCSessionDescriptionInit)
          );
          hasRemoteDescRef.current = true;
          await processPending();
          
          const answer = await peerConnectionRef.current.createAnswer();
          await peerConnectionRef.current.setLocalDescription(answer);
          await applyBitrates();
          
          sendSignalingMsg({
            type: 'answer',
            payload: answer,
            sender_id: userIdRef.current!,
            call_id: callIdRef.current!,
          });
        } else if (message.type === 'answer') {
          if (peerConnectionRef.current) {
            if (peerConnectionRef.current.signalingState !== 'have-local-offer') {
              console.warn('[WebRTC] Ignoring out-of-order answer. State:', peerConnectionRef.current.signalingState);
              return;
            }
            await peerConnectionRef.current.setRemoteDescription(
              new RTCSessionDescription(message.payload as RTCSessionDescriptionInit)
            );
            hasRemoteDescRef.current = true;
            hasSentOfferRef.current = false;
            offerAttemptCountRef.current = 0;
            await processPending();
          }
        } else if (message.type === 'ice-candidate') {
          if (peerConnectionRef.current && hasRemoteDescRef.current) {
            await peerConnectionRef.current.addIceCandidate(
              new RTCIceCandidate(message.payload as RTCIceCandidateInit)
            );
          } else {
            pendingCandidatesRef.current.push(message.payload as RTCIceCandidateInit);
          }
        }
      } catch (error) {
        console.error('[WebRTC] Error handling signaling message:', error);
      }
    };

    const init = async () => {
      try {
        console.log('[WebRTC] Initializing for callId:', callId, 'userId:', userId, 'isHost:', isHost);

        // Initialize media
        // Full HD camera — NO aspectRatio to avoid zoom/crop
        const mediaConstraints: MediaStreamConstraints[] = [
          { video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: 'user' }, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
          { video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 }, facingMode: 'user' }, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
          { video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: 'user' }, audio: { echoCancellation: true, noiseSuppression: true } },
          { video: { facingMode: 'user' }, audio: true },
          { video: false, audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
        ];

        let localStream: MediaStream | null = null;
        for (let i = 0; i < mediaConstraints.length; i++) {
          try {
            localStream = await navigator.mediaDevices.getUserMedia(mediaConstraints[i]);
            localStreamRef.current = localStream;
            const hasVideo = localStream.getVideoTracks().length > 0;
            const hasAudio = localStream.getAudioTracks().length > 0;
            // CRYSTAL CLEAR: Set contentHint for maximum sharpness
            if (hasVideo) {
              localStream.getVideoTracks().forEach(vt => {
                try { if ('contentHint' in vt) (vt as any).contentHint = 'detail'; } catch { /* ignore */ }
              });
            }
            setState(prev => ({ ...prev, localStream, isVideoEnabled: hasVideo, isAudioEnabled: hasAudio }));
            console.log('[WebRTC] ✅ Media initialized (set', i + 1, ')', hasVideo ? 'video+audio' : 'audio-only');
            break;
          } catch (e) {
            console.warn(`[WebRTC] Constraint set ${i + 1} failed:`, e);
          }
        }

        if (callDeadRef.current) return; // Check after async

        // Create peer connection
        const pc = new RTCPeerConnection({
          iceServers: [
            // ⚡ STUN servers for fastest NAT traversal
            { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
            { urls: ['stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302', 'stun:stun4.l.google.com:19302'] },
            // TURN relay for restrictive networks
            { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
          ],
          iceCandidatePoolSize: 25,
          bundlePolicy: 'max-bundle',
          rtcpMuxPolicy: 'require',
        });
        peerConnectionRef.current = pc;

        const remoteStream = new MediaStream();
        remoteStreamRef.current = remoteStream;
        setState(prev => ({ ...prev, remoteStream }));

        // Connection state handler - ☠️ DEAD FOREVER policy
        pc.onconnectionstatechange = () => {
          const connState = pc.connectionState;
          console.log('[WebRTC] Connection state:', connState);
          setState(prev => ({
            ...prev,
            connectionState: connState,
            isConnected: connState === 'connected',
          }));
          
          if (connState === 'connected') {
            if (disconnectedRecoveryTimerRef.current) {
              clearTimeout(disconnectedRecoveryTimerRef.current);
              disconnectedRecoveryTimerRef.current = null;
            }
            iceRestartAttemptRef.current = 0;
          }

          if (connState === 'failed' || connState === 'closed') {
            console.log('[WebRTC] ☠️ Connection DEAD - ending call path');
            // ActiveCallScreen handles end flow from state
          }
          
          if (connState === 'disconnected') {
            console.log('[WebRTC] ⚠️ Connection disconnected - attempting silent ICE recovery');

            // 1x fast ICE restart (silent, no reconnect UI)
            if (iceRestartAttemptRef.current < 1) {
              iceRestartAttemptRef.current += 1;
              try {
                pc.restartIce();
                if (!isHostRef.current && pc.signalingState === 'stable') {
                  void sendOffer(true);
                }
              } catch (e) {
                console.warn('[WebRTC] ICE restart failed:', e);
              }
            }

            if (disconnectedRecoveryTimerRef.current) {
              clearTimeout(disconnectedRecoveryTimerRef.current);
            }

            disconnectedRecoveryTimerRef.current = setTimeout(() => {
              if (peerConnectionRef.current?.connectionState === 'disconnected') {
                console.log('[WebRTC] ☠️ Still disconnected after recovery window - failing call');
                setState(prev => ({ ...prev, connectionState: 'failed', isConnected: false }));
              }
            }, 5000);
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log('[WebRTC] ICE connection state:', pc.iceConnectionState);
          if (pc.iceConnectionState === 'failed') {
            console.log('[WebRTC] ☠️ ICE failed');
            setState(prev => ({ ...prev, connectionState: 'failed', isConnected: false }));
          }
        };

        pc.onicegatheringstatechange = () => {
          console.log('[WebRTC] ICE gathering state:', pc.iceGatheringState);
        };

        pc.onicecandidate = (event) => {
          if (event.candidate && callIdRef.current && userIdRef.current) {
            sendSignalingMsg({
              type: 'ice-candidate',
              payload: event.candidate.toJSON(),
              sender_id: userIdRef.current,
              call_id: callIdRef.current,
            });
          }
        };

        // Handle incoming tracks
        pc.ontrack = (event) => {
          console.log('[WebRTC] Received remote track:', event.track.kind);
          
          if (event.streams && event.streams[0]) {
            const incomingStream = event.streams[0];
            if (remoteStreamRef.current?.id !== incomingStream.id) {
              remoteStreamRef.current = incomingStream;
            }
            
            event.streams[0].getTracks().forEach(track => {
              console.log('[WebRTC] Track details:', track.kind, track.enabled, track.readyState);
              track.onunmute = () => {
                console.log('[WebRTC] Track unmuted:', track.kind);
                setRemoteStreamVersion(v => v + 1);
              };
              track.onended = () => {
                console.log('[WebRTC] Track ended:', track.kind);
              };
            });
          } else {
            if (remoteStreamRef.current) {
              event.track.onunmute = () => {
                console.log('[WebRTC] Fallback track unmuted:', event.track.kind);
                setRemoteStreamVersion(v => v + 1);
              };
              remoteStreamRef.current.addTrack(event.track);
            }
          }
          
          setState(prev => ({
            ...prev,
            remoteStream: remoteStreamRef.current,
            isConnected: true,
          }));
          setRemoteStreamVersion(v => v + 1);
        };

        // Add local tracks
        if (localStreamRef.current) {
          console.log('[WebRTC] Adding local tracks to peer connection');
          localStreamRef.current.getTracks().forEach(track => {
            console.log('[WebRTC] Adding local track:', track.kind);
            pc.addTrack(track, localStreamRef.current!);
          });
        }

        if (callDeadRef.current) return; // Check after PC setup

        // Set up signaling channel
        channelRef.current = supabase.channel(`call-signaling-${callId}`, {
          config: { broadcast: { self: false } },
        });
        
        channelRef.current
          .on('broadcast', { event: 'signaling' }, ({ payload }) => {
            if (callDeadRef.current) return;
            handleSignaling(payload as SignalingMessage);
          })
          .subscribe(async (status) => {
            console.log('[WebRTC] Channel status:', status);
            if (status === 'SUBSCRIBED') {
              if (callDeadRef.current) return;
              
              if (!hasSentReadyRef.current) {
                hasSentReadyRef.current = true;
                sendSignalingMsg({
                  type: 'ready',
                  sender_id: userId,
                  call_id: callId,
                });
              }

              if (!isHost && !hasSentOfferRef.current) {
                console.log('[WebRTC] Caller sending initial offer');
                sendOffer(false);
              }
            }
          });
      } catch (error) {
        console.error('[WebRTC] Initialization error:', error);
      }
    };

    init();

    return () => {
      console.log('[WebRTC] Effect cleanup running');
      callDeadRef.current = true;
      isInitializedRef.current = false;
      hasRemoteDescRef.current = false;
      hasSentOfferRef.current = false;
      hasSentReadyRef.current = false;
      offerAttemptCountRef.current = 0;
      iceRestartAttemptRef.current = 0;
      pendingCandidatesRef.current = [];

      if (disconnectedRecoveryTimerRef.current) {
        clearTimeout(disconnectedRecoveryTimerRef.current);
        disconnectedRecoveryTimerRef.current = null;
      }
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
        localStreamRef.current = null;
      }
      if (remoteStreamRef.current) {
        remoteStreamRef.current.getTracks().forEach(track => track.stop());
        remoteStreamRef.current = null;
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.ontrack = null;
        peerConnectionRef.current.onicecandidate = null;
        peerConnectionRef.current.onconnectionstatechange = null;
        peerConnectionRef.current.oniceconnectionstatechange = null;
        peerConnectionRef.current.onicegatheringstatechange = null;
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      
      setState({
        localStream: null,
        remoteStream: null,
        isConnected: false,
        isAudioEnabled: true,
        isVideoEnabled: true,
        connectionState: 'new',
      });
    };
  }, [callId, userId, isHost]); // ✅ ONLY primitive deps - NO callback deps

  return {
    ...state,
    toggleAudio,
    toggleVideo,
    cleanup,
  };
}
