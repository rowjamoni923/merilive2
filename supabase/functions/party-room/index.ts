// Party Room WebSocket — Section #12 hardened
// SECURITY: all client-supplied user identifiers ignored; user identity is
// derived exclusively from the verified Supabase JWT. Host status is verified
// from the database, never trusted from the client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

interface PartyMessage {
  type: 'join' | 'leave' | 'chat' | 'gift' | 'reaction' | 'audio-state' | 'video-state' | 'kick' | 'mute' | 'update-seat'
  roomId: string
  payload?: any
}

interface Participant {
  userId: string
  name: string
  avatarUrl: string | null
  level: number
  role: 'host' | 'co-host' | 'speaker' | 'listener'
  seatPosition: number | null
  isMuted: boolean
  hasVideo: boolean
  joinedAt: number
}

const partyRooms = new Map<string, {
  hostId: string
  participants: Map<string, { socket: WebSocket; info: Participant }>
  settings: { maxParticipants: number; gameMode: string | null; isPrivate: boolean }
}>()

function broadcastToRoom(roomId: string, message: any, excludeUserId?: string) {
  const room = partyRooms.get(roomId)
  if (!room) return
  const messageStr = JSON.stringify(message)
  room.participants.forEach((p, uid) => {
    if (uid !== excludeUserId && p.socket.readyState === WebSocket.OPEN) {
      p.socket.send(messageStr)
    }
  })
}

function getParticipantsList(roomId: string): Participant[] {
  const room = partyRooms.get(roomId)
  if (!room) return []
  return Array.from(room.participants.values()).map(p => p.info)
}

function handleUserLeave(roomId: string | null, userId: string | null) {
  if (!roomId || !userId) return
  const room = partyRooms.get(roomId)
  if (!room) return
  room.participants.delete(userId)
  broadcastToRoom(roomId, { type: 'user-left', userId, participantCount: room.participants.size })
  if (room.hostId === userId) {
    if (room.participants.size > 0) {
      const newHostId = room.participants.keys().next().value
      if (newHostId) {
        room.hostId = newHostId
        const newHost = room.participants.get(newHostId)
        if (newHost) {
          newHost.info.role = 'host'
          broadcastToRoom(roomId, { type: 'host-changed', newHostId, newHostName: newHost.info.name })
        }
      }
    } else {
      partyRooms.delete(roomId)
    }
  }
  if (room.participants.size === 0) partyRooms.delete(roomId)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const upgrade = req.headers.get('upgrade') || ''

  if (upgrade.toLowerCase() === 'websocket') {
    // --- SECURITY: verify JWT before upgrade ---
    // Token can come in Authorization header OR ?token= query (browsers can't set headers on WS).
    const url = new URL(req.url)
    const headerAuth = req.headers.get('authorization') || ''
    const headerToken = headerAuth.toLowerCase().startsWith('bearer ')
      ? headerAuth.slice(7).trim()
      : ''
    const queryToken = url.searchParams.get('token') || ''
    const jwt = headerToken || queryToken

    if (!jwt) {
      return new Response(JSON.stringify({ error: 'auth required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    })
    const { data: userResult, error: userErr } = await authClient.auth.getUser(jwt)
    if (userErr || !userResult?.user?.id) {
      return new Response(JSON.stringify({ error: 'invalid token' }), {
      })
    }
    const authedUserId = userResult.user.id
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey)

    const { socket, response } = Deno.upgradeWebSocket(req)
    let currentRoomId: string | null = null

    socket.onmessage = async (event) => {
      try {
        const message: PartyMessage = JSON.parse(event.data)
        // IGNORE any client-supplied userId. Always use authedUserId.
        switch (message.type) {
          case 'join': {
            currentRoomId = message.roomId
            const { userName, avatarUrl, level } = message.payload || {}

            // Verify room exists + active + caller's authoritative host status from DB.
            const { data: roomRow } = await serviceClient
              .from('party_rooms')
              .select('host_id, max_participants, is_active')
              .eq('id', message.roomId)
              .maybeSingle()

            if (!roomRow || !roomRow.is_active) {
              socket.send(JSON.stringify({ type: 'error', error: 'Room not found or inactive' }))
              socket.close()
              return
            }
            const isHost = roomRow.host_id === authedUserId

            if (!partyRooms.has(message.roomId)) {
              partyRooms.set(message.roomId, {
                hostId: roomRow.host_id,
                participants: new Map(),
                settings: { maxParticipants: roomRow.max_participants ?? 8, gameMode: null, isPrivate: false },
              })
            }
            const room = partyRooms.get(message.roomId)!

            if (room.participants.size >= (room.settings.maxParticipants || 8)) {
              socket.send(JSON.stringify({ type: 'error', error: 'Room full' }))
              socket.close()
              return
            }

            const usedSeats = new Set(
              Array.from(room.participants.values()).map(p => p.info.seatPosition).filter(s => s !== null),
            )
            let availableSeat: number | null = null
            for (let i = 0; i < 8; i++) {
              if (!usedSeats.has(i)) { availableSeat = i; break }
            }

            const info: Participant = {
              userId: authedUserId,
              name: typeof userName === 'string' ? userName.slice(0, 80) : 'User',
              avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null,
              level: Number.isFinite(level) ? Number(level) : 1,
              role: isHost ? 'host' : 'listener',
              seatPosition: availableSeat,
              isMuted: true,
              hasVideo: false,
              joinedAt: Date.now(),
            }
            room.participants.set(authedUserId, { socket, info })

            socket.send(JSON.stringify({
              type: 'room-joined',
              roomId: message.roomId,
              yourSeat: availableSeat,
              isHost,
            }))
            broadcastToRoom(message.roomId, {
              participant: info,
              participantCount: room.participants.size,
            }, authedUserId)
            break
          }
          case 'chat': {
            if (currentRoomId && partyRooms.get(currentRoomId)?.participants.has(authedUserId)) {
              broadcastToRoom(currentRoomId, {
                message: String(message.payload?.message ?? '').slice(0, 500),
                timestamp: Date.now(),
              })
            }
            break
          }
          case 'gift': {
            if (currentRoomId && partyRooms.get(currentRoomId)?.participants.has(authedUserId)) {
              broadcastToRoom(currentRoomId, {
                senderId: authedUserId,
                receiverId: message.payload?.receiverId,
                gift: message.payload?.gift,
              })
            }
            break
          }
          case 'reaction': {
            if (currentRoomId && partyRooms.get(currentRoomId)?.participants.has(authedUserId)) {
              broadcastToRoom(currentRoomId, {
                reaction: message.payload?.reaction,
              })
            }
            break
          }
          case 'audio-state':
          case 'video-state': {
            const room = currentRoomId ? partyRooms.get(currentRoomId) : null
            const me = room?.participants.get(authedUserId)
            if (room && me) {
              if (message.type === 'audio-state') me.info.isMuted = !!message.payload?.isMuted
              else me.info.hasVideo = !!message.payload?.hasVideo
              broadcastToRoom(currentRoomId!, {
              })
            }
            break
          }
          case 'update-seat': {
            const room = currentRoomId ? partyRooms.get(currentRoomId) : null
            const me = room?.participants.get(authedUserId)
            if (room && me) {
              me.info.seatPosition = message.payload?.seatPosition ?? null
              // role can only be self-downgraded (host cannot self-promote here);
              // host changes flow through DB-level RPCs.
              if (me.info.role !== 'host' && ['speaker', 'listener'].includes(message.payload?.role)) {
                me.info.role = message.payload.role
              }
              broadcastToRoom(currentRoomId!, {
              })
            }
            break
          }
          case 'kick':
          case 'mute': {
            // Only the DB-authoritative host (verified at join) can perform these.
            const room = currentRoomId ? partyRooms.get(currentRoomId) : null
            if (room && room.hostId === authedUserId) {
              const targetUserId = message.payload?.targetUserId
              if (typeof targetUserId !== 'string' || targetUserId === authedUserId) break
              const target = room.participants.get(targetUserId)
              if (!target) break
              if (message.type === 'kick') {
                target.socket.send(JSON.stringify({ type: 'kicked', reason: message.payload?.reason || 'Removed by host' }))
                try { target.socket.close() } catch { /* ignore */ }
                room.participants.delete(targetUserId)
                broadcastToRoom(currentRoomId!, { type: 'user-kicked', userId: targetUserId })
              } else {
                target.info.isMuted = true
                target.socket.send(JSON.stringify({ type: 'muted-by-host' }))
                broadcastToRoom(currentRoomId!, { type: 'user-muted', userId: targetUserId })
              }
            }
            break
          }
          case 'leave': {
            handleUserLeave(currentRoomId, authedUserId)
            break
          }
        }
      } catch (err) {
        console.error('party-room ws error:', err)
      }
    }

    socket.onclose = () => handleUserLeave(currentRoomId, authedUserId)
    socket.onerror = (err) => console.error('party-room ws err:', err)
    return response
  }

  // No public REST surface anymore (was leaking participant lists).
  return new Response(JSON.stringify({ error: 'Not found' }), {
  })
})
