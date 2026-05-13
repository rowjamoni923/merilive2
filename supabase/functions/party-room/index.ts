import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

interface PartyMessage {
  type: 'join' | 'leave' | 'chat' | 'gift' | 'reaction' | 'audio-state' | 'video-state' | 'kick' | 'mute' | 'update-seat'
  roomId: string
  odersId: string
  payload?: any
}

interface Participant {
odersId: string
  name: string
  avatarUrl: string | null
  level: number
  role: 'host' | 'co-host' | 'speaker' | 'listener'
  seatPosition: number | null
  isMuted: boolean
  hasVideo: boolean
  joinedAt: number
}

// In-memory store for party rooms
const partyRooms = new Map<string, {
  hostId: string
  participants: Map<string, { socket: WebSocket; info: Participant }>
  settings: {
    maxParticipants: number
    gameMode: string | null
    isPrivate: boolean
  }
}>()

function broadcastToRoom(roomId: string, message: any, excludeUserId?: string) {
  const room = partyRooms.get(roomId)
  if (!room) return

  const messageStr = JSON.stringify(message)
  room.participants.forEach((participant, odersId) => {
    if (odersId !== excludeUserId && participant.socket.readyState === WebSocket.OPEN) {
      participant.socket.send(messageStr)
    }
  })
}

function getParticipantsList(roomId: string): Participant[] {
  const room = partyRooms.get(roomId)
  if (!room) return []
  
  return Array.from(room.participants.values()).map(p => p.info)
}

function handleUserLeave(roomId: string | null, odersId: string | null) {
  if (!roomId || !odersId) return
  
  const room = partyRooms.get(roomId)
  if (!room) return
  
  room.participants.delete(odersId)
  
  // Notify others
  broadcastToRoom(roomId, {
    type: 'user-left',
    odersId: odersId,
    participantCount: room.participants.size
  })
  
  // If host left, assign new host or close room
  if (room.hostId === odersId) {
    if (room.participants.size > 0) {
      // Assign first participant as new host
      const newHostId = room.participants.keys().next().value
      if (newHostId) {
        room.hostId = newHostId
        
        const newHost = room.participants.get(newHostId)
        if (newHost) {
          newHost.info.role = 'host'
          
          broadcastToRoom(roomId, {
            type: 'host-changed',
            newHostId,
            newHostName: newHost.info.name
          })
        }
      }
    } else {
      // Room is empty, delete it
      partyRooms.delete(roomId)
      console.log(`Room ${roomId} deleted - no participants`)
    }
  }
  
  // Clean up empty rooms
  if (room.participants.size === 0) {
    partyRooms.delete(roomId)
  }
  
  console.log(`User ${odersId} left room ${roomId}, remaining: ${room.participants.size}`)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const upgrade = req.headers.get('upgrade') || ''
  
  if (upgrade.toLowerCase() === 'websocket') {
    const { socket, response } = Deno.upgradeWebSocket(req)
    
    let currentUserId: string | null = null
    let currentRoomId: string | null = null
    
    socket.onopen = () => {
      console.log('Party room WebSocket opened')
    }
    
    socket.onmessage = async (event) => {
      try {
        const message: PartyMessage = JSON.parse(event.data)
        const messageUserId = message.odersId
        console.log('Party message:', message.type, 'room:', message.roomId)
        
        switch (message.type) {
          case 'join': {
            currentUserId = messageUserId
            currentRoomId = message.roomId
            
            const { userName, avatarUrl, level, isHost } = message.payload || {}
            
            // Create room if doesn't exist
            if (!partyRooms.has(message.roomId)) {
              partyRooms.set(message.roomId, {
                hostId: isHost ? messageUserId : '',
                participants: new Map(),
                settings: {
                  maxParticipants: 8,
                  gameMode: null,
                  isPrivate: false
                }
              })
            }
            
            const room = partyRooms.get(message.roomId)!
            
            // Find available seat
            const usedSeats = new Set(
              Array.from(room.participants.values())
                .map(p => p.info.seatPosition)
                .filter(s => s !== null)
            )
            let availableSeat: number | null = null
            for (let i = 0; i < 8; i++) {
              if (!usedSeats.has(i)) {
                availableSeat = i
                break
              }
            }
            
            const participantInfo: Participant = {
              odersId: messageUserId,
              name: userName || 'User',
              avatarUrl: avatarUrl || null,
              level: level || 1,
              role: isHost ? 'host' : 'listener',
              seatPosition: availableSeat,
              isMuted: true,
              hasVideo: false,
              joinedAt: Date.now()
            }
            
            room.participants.set(messageUserId, {
              socket,
              info: participantInfo
            })
            
            // Send room info to joiner
            socket.send(JSON.stringify({
              type: 'room-joined',
              roomId: message.roomId,
              participants: getParticipantsList(message.roomId),
              yourSeat: availableSeat,
              isHost: room.hostId === messageUserId
            }))
            
            // Notify others
            broadcastToRoom(message.roomId, {
              type: 'user-joined',
              odersId: messageUserId,
              participant: participantInfo,
              participantCount: room.participants.size
            }, messageUserId)
            
            console.log(`User ${messageUserId} joined room ${message.roomId}, total: ${room.participants.size}`)
            break
          }
          
          case 'chat': {
            if (currentRoomId) {
              broadcastToRoom(currentRoomId, {
                type: 'chat',
                odersId: messageUserId,
                message: message.payload.message,
                userName: message.payload.userName,
                avatarUrl: message.payload.avatarUrl,
                timestamp: Date.now()
              })
            }
            break
          }
          
          case 'gift': {
            if (currentRoomId) {
              // Broadcast gift to everyone
              broadcastToRoom(currentRoomId, {
                type: 'gift',
                senderId: messageUserId,
                senderName: message.payload.senderName,
                receiverId: message.payload.receiverId,
                gift: message.payload.gift,
                timestamp: Date.now()
              })
            }
            break
          }
          
          case 'reaction': {
            if (currentRoomId) {
              broadcastToRoom(currentRoomId, {
                type: 'reaction',
                odersId: messageUserId,
                reaction: message.payload.reaction,
                timestamp: Date.now()
              })
            }
            break
          }
          
          case 'audio-state': {
            if (currentRoomId && currentUserId) {
              const room = partyRooms.get(currentRoomId)
              if (room) {
                const participant = room.participants.get(currentUserId)
                if (participant) {
                  participant.info.isMuted = message.payload.isMuted
                  
                  broadcastToRoom(currentRoomId, {
                    type: 'audio-state-changed',
                    odersId: currentUserId,
                    isMuted: message.payload.isMuted
                  })
                }
              }
            }
            break
          }
          
          case 'video-state': {
            if (currentRoomId && currentUserId) {
              const room = partyRooms.get(currentRoomId)
              if (room) {
                const participant = room.participants.get(currentUserId)
                if (participant) {
                  participant.info.hasVideo = message.payload.hasVideo
                  
                  broadcastToRoom(currentRoomId, {
                    type: 'video-state-changed',
                    odersId: currentUserId,
                    hasVideo: message.payload.hasVideo
                  })
                }
              }
            }
            break
          }
          
          case 'update-seat': {
            if (currentRoomId && currentUserId) {
              const room = partyRooms.get(currentRoomId)
              if (room) {
                const participant = room.participants.get(currentUserId)
                if (participant) {
                  participant.info.seatPosition = message.payload.seatPosition
                  participant.info.role = message.payload.role || participant.info.role
                  
                  broadcastToRoom(currentRoomId, {
                    type: 'seat-updated',
                    odersId: currentUserId,
                    seatPosition: message.payload.seatPosition,
                    role: participant.info.role
                  })
                }
              }
            }
            break
          }
          
          case 'kick': {
            if (currentRoomId) {
              const room = partyRooms.get(currentRoomId)
              if (room && room.hostId === messageUserId) {
                const targetUserId = message.payload.targetUserId
                const targetParticipant = room.participants.get(targetUserId)
                
                if (targetParticipant) {
                  targetParticipant.socket.send(JSON.stringify({
                    type: 'kicked',
                    reason: message.payload.reason || 'Removed by host'
                  }))
                  targetParticipant.socket.close()
                  room.participants.delete(targetUserId)
                  
                  broadcastToRoom(currentRoomId, {
                    type: 'user-kicked',
                    odersId: targetUserId
                  })
                }
              }
            }
            break
          }
          
          case 'mute': {
            if (currentRoomId) {
              const room = partyRooms.get(currentRoomId)
              if (room && (room.hostId === messageUserId)) {
                const targetUserId = message.payload.targetUserId
                const targetParticipant = room.participants.get(targetUserId)
                
                if (targetParticipant) {
                  targetParticipant.info.isMuted = true
                  targetParticipant.socket.send(JSON.stringify({
                    type: 'muted-by-host'
                  }))
                  
                  broadcastToRoom(currentRoomId, {
                    type: 'user-muted',
                    odersId: targetUserId
                  })
                }
              }
            }
            break
          }
          
          case 'leave': {
            handleUserLeave(currentRoomId, currentUserId)
            break
          }
        }
      } catch (err) {
        console.error('Error processing party message:', err)
      }
    }
    
    socket.onclose = () => {
      console.log('Party room WebSocket closed')
      handleUserLeave(currentRoomId, currentUserId)
    }
    
    socket.onerror = (err) => {
      console.error('Party room WebSocket error:', err)
    }
    
    return response
  }
  
  // REST API endpoints
  const url = new URL(req.url)
  const path = url.pathname.split('/').pop()
  
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    if (req.method === 'GET' && path === 'room-info') {
      const roomId = url.searchParams.get('roomId')
      
      if (!roomId) {
        return new Response(
          JSON.stringify({ error: 'roomId required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const room = partyRooms.get(roomId)
      
      return new Response(
        JSON.stringify({
          roomId,
          active: room !== undefined,
          participantCount: room?.participants.size || 0,
          participants: room ? getParticipantsList(roomId) : []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    if (req.method === 'GET' && path === 'active-rooms') {
      const rooms = Array.from(partyRooms.entries()).map(([roomId, room]) => ({
        roomId,
        hostId: room.hostId,
        participantCount: room.participants.size,
        settings: room.settings
      }))
      
      return new Response(
        JSON.stringify({ rooms }),
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
