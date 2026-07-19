import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

interface PresenceMessage {
  type: 'online' | 'offline' | 'update-status' | 'heartbeat'
  odersId: string
  payload?: any
}

interface UserPresence {
  odersId: string
  name: string
  avatarUrl: string | null
  status: 'online' | 'busy' | 'in-call' | 'in-stream' | 'in-party'
  lastSeen: number
  currentActivity?: {
    type: 'call' | 'stream' | 'party'
    id: string
  }
}

// In-memory store for online users
const onlineUsers = new Map<string, {
  socket: WebSocket
  presence: UserPresence
  heartbeatTimeout?: number
}>()

function broadcastPresenceUpdate(presence: UserPresence, eventType: 'online' | 'offline' | 'update') {
  const message = JSON.stringify({
    type: 'presence-update',
    eventType,
    user: presence
  })
  
  // Broadcast to all connected users
  onlineUsers.forEach((user) => {
    if (user.socket.readyState === WebSocket.OPEN) {
      user.socket.send(message)
    }
  })
}

async function handleUserOffline(odersId: string) {
  const user = onlineUsers.get(odersId)
  if (!user) return
  
  // Clear heartbeat timeout
  if (user.heartbeatTimeout) {
    clearTimeout(user.heartbeatTimeout)
  }
  
  // Update database
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    await supabase
      .from('profiles')
      .update({
        is_online: false,
        last_seen_at: new Date().toISOString()
      })
      .eq('id', odersId)
  } catch (err) {
    console.error('Error updating offline status:', err)
  }
  
  const presence = user.presence
  onlineUsers.delete(odersId)
  
  // Broadcast offline status
  broadcastPresenceUpdate(presence, 'offline')
  
  console.log(`User ${odersId} is offline, total online: ${onlineUsers.size}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const upgrade = req.headers.get('upgrade') || ''
  
  if (upgrade.toLowerCase() === 'websocket') {
    const { socket, response } = Deno.upgradeWebSocket(req)
    
    let currentUserId: string | null = null
    
    socket.onopen = () => {
      console.log('Presence WebSocket opened')
    }
    
    socket.onmessage = async (event) => {
      try {
        const message: PresenceMessage = JSON.parse(event.data)
        const messageUserId = message.odersId
        
        switch (message.type) {
          case 'online': {
            currentUserId = messageUserId
            const { userName, avatarUrl } = message.payload || {}
            
            const presence: UserPresence = {
              odersId: messageUserId,
              name: userName || 'User',
              avatarUrl: avatarUrl || null,
              status: 'online',
              lastSeen: Date.now()
            }
            
            // Clear any existing heartbeat timeout
            const existing = onlineUsers.get(messageUserId)
            if (existing?.heartbeatTimeout) {
              clearTimeout(existing.heartbeatTimeout)
            }
            
            // Set heartbeat timeout (30 seconds)
            const heartbeatTimeout = setTimeout(() => {
              handleUserOffline(messageUserId)
            }, 30000) as unknown as number
            
            onlineUsers.set(messageUserId, {
              socket,
              presence,
              heartbeatTimeout
            })
            
            // Update database
            const supabaseUrl = Deno.env.get('SUPABASE_URL')!
            const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
            const supabase = createClient(supabaseUrl, supabaseKey)
            
            await supabase
              .from('profiles')
              .update({
                is_online: true,
                last_seen_at: new Date().toISOString()
              })
              .eq('id', messageUserId)
            
            // Send current online users to new user
            const onlineUsersList = Array.from(onlineUsers.values()).map(u => u.presence)
            socket.send(JSON.stringify({
              type: 'online-users',
              users: onlineUsersList
            }))
            
            // Broadcast to others
            broadcastPresenceUpdate(presence, 'online')
            
            console.log(`User ${messageUserId} is online, total online: ${onlineUsers.size}`)
            break
          }
          
          case 'heartbeat': {
            if (currentUserId) {
              const user = onlineUsers.get(currentUserId)
              if (user) {
                // Reset heartbeat timeout
                if (user.heartbeatTimeout) {
                  clearTimeout(user.heartbeatTimeout)
                }
                
                user.heartbeatTimeout = setTimeout(() => {
                  handleUserOffline(currentUserId!)
                }, 30000) as unknown as number
                
                user.presence.lastSeen = Date.now()
                
                // Send heartbeat acknowledgment
                socket.send(JSON.stringify({ type: 'heartbeat-ack' }))
              }
            }
            break
          }
          
          case 'update-status': {
            if (currentUserId) {
              const user = onlineUsers.get(currentUserId)
              if (user) {
                user.presence.status = message.payload.status
                user.presence.currentActivity = message.payload.currentActivity
                user.presence.lastSeen = Date.now()
                
                broadcastPresenceUpdate(user.presence, 'update')
              }
            }
            break
          }
          
          case 'offline': {
            if (currentUserId) {
              handleUserOffline(currentUserId)
            }
            break
          }
        }
      } catch (err) {
        console.error('Error processing presence message:', err)
      }
    }
    
    socket.onclose = () => {
      console.log('Presence WebSocket closed')
      if (currentUserId) {
        handleUserOffline(currentUserId)
      }
    }
    
    socket.onerror = (err) => {
      console.error('Presence WebSocket error:', err)
    }
    
    return response
  }
  
  // REST API endpoints
  const url = new URL(req.url)
  const path = url.pathname.split('/').pop()
  
  try {
    if (req.method === 'GET' && path === 'online-users') {
      const users = Array.from(onlineUsers.values()).map(u => u.presence)
      
      return new Response(
        JSON.stringify({ users, count: users.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    if (req.method === 'GET' && path === 'user-status') {
      const queryUserId = url.searchParams.get('userId')
      
      if (!queryUserId) {
        return new Response(
          JSON.stringify({ error: 'userId required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const user = onlineUsers.get(queryUserId)
      
      return new Response(
        JSON.stringify({
          odersId: queryUserId,
          isOnline: user !== undefined,
          presence: user?.presence || null
        }),
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
