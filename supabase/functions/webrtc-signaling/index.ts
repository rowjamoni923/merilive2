import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'join' | 'leave' | 'ready'
  callId: string
  userId: string
  targetUserId?: string
  payload?: any
}

// In-memory store for active connections (in production, use Redis or similar)
const activeConnections = new Map<string, Map<string, WebSocket>>()

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Check if this is a WebSocket upgrade request
  const upgrade = req.headers.get('upgrade') || ''
  
  if (upgrade.toLowerCase() === 'websocket') {
    const { socket, response } = Deno.upgradeWebSocket(req)
    
    let currentUserId: string | null = null
    let currentCallId: string | null = null
    
    socket.onopen = () => {
      console.log('WebSocket connection opened')
    }
    
    socket.onmessage = (event) => {
      try {
        const message: SignalingMessage = JSON.parse(event.data)
        console.log('Received message:', message.type, 'for call:', message.callId)
        
        switch (message.type) {
          case 'join':
            currentUserId = message.userId
            currentCallId = message.callId
            
            // Create room if doesn't exist
            if (!activeConnections.has(message.callId)) {
              activeConnections.set(message.callId, new Map())
            }
            
            // Add user to room
            activeConnections.get(message.callId)!.set(message.userId, socket)
            
            // Notify other users in the room
            const room = activeConnections.get(message.callId)!
            room.forEach((ws, oderId) => {
              if (oderId !== message.userId && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  type: 'user-joined',
                  userId: message.userId,
                  callId: message.callId
                }))
              }
            })
            
            // Send current participants to the new user
            const participants = Array.from(room.keys()).filter(id => id !== message.userId)
            socket.send(JSON.stringify({
              type: 'room-info',
              callId: message.callId,
              participants
            }))
            break
            
          case 'offer':
          case 'answer':
          case 'ice-candidate':
            // Forward to target user
            if (message.targetUserId && currentCallId) {
              const targetRoom = activeConnections.get(currentCallId)
              if (targetRoom) {
                const targetSocket = targetRoom.get(message.targetUserId)
                if (targetSocket && targetSocket.readyState === WebSocket.OPEN) {
                  targetSocket.send(JSON.stringify({
                    type: message.type,
                    userId: message.userId,
                    callId: currentCallId,
                    payload: message.payload
                  }))
                }
              }
            }
            break
            
          case 'ready':
            // User is ready for call, notify others
            if (currentCallId) {
              const readyRoom = activeConnections.get(currentCallId)
              if (readyRoom) {
                readyRoom.forEach((ws, oderId) => {
                  if (oderId !== message.userId && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                      type: 'peer-ready',
                      userId: message.userId,
                      callId: currentCallId
                    }))
                  }
                })
              }
            }
            break
            
          case 'leave':
            // Remove user from room
            if (currentCallId && currentUserId) {
              const leaveRoom = activeConnections.get(currentCallId)
              if (leaveRoom) {
                leaveRoom.delete(currentUserId)
                
                // Notify others
                leaveRoom.forEach((ws) => {
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                      type: 'user-left',
                      userId: currentUserId,
                      callId: currentCallId
                    }))
                  }
                })
                
                // Clean up empty rooms
                if (leaveRoom.size === 0) {
                  activeConnections.delete(currentCallId)
                }
              }
            }
            break
        }
      } catch (err) {
        console.error('Error processing message:', err)
      }
    }
    
    socket.onclose = () => {
      console.log('WebSocket connection closed')
      // Clean up on disconnect
      if (currentCallId && currentUserId) {
        const room = activeConnections.get(currentCallId)
        if (room) {
          room.delete(currentUserId)
          
          // Notify others
          room.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                type: 'user-left',
                userId: currentUserId,
                callId: currentCallId
              }))
            }
          })
          
          if (room.size === 0) {
            activeConnections.delete(currentCallId)
          }
        }
      }
    }
    
    socket.onerror = (err) => {
      console.error('WebSocket error:', err)
    }
    
    return response
  }
  
  // REST API for non-WebSocket requests
  const url = new URL(req.url)
  const path = url.pathname.split('/').pop()
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    if (req.method === 'POST' && path === 'create-room') {
      const { callId, hostId } = await req.json()
      
      // Initialize room in memory
      if (!activeConnections.has(callId)) {
        activeConnections.set(callId, new Map())
      }
      
      return new Response(
        JSON.stringify({ success: true, callId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    if (req.method === 'GET' && path === 'room-info') {
      const callId = url.searchParams.get('callId')
      
      if (!callId) {
        return new Response(
          JSON.stringify({ error: 'callId required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const room = activeConnections.get(callId)
      const participants = room ? Array.from(room.keys()) : []
      
      return new Response(
        JSON.stringify({ callId, participants, active: room !== undefined }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    if (req.method === 'GET' && path === 'ice-servers') {
      // Return TURN/STUN server configuration
      // In production, you should use your own TURN servers or a service like Twilio/Xirsys
      const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
      ]
      
      return new Response(
        JSON.stringify({ iceServers }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
    
  } catch (err) {
    console.error('Error:', err)
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
