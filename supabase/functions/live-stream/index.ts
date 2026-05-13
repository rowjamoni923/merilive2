import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

interface StreamMessage {
  type: 'join-stream' | 'leave-stream' | 'chat' | 'gift' | 'like' | 'viewer-count'
  streamId: string
  userId: string
  payload?: any
}

// In-memory store for active streams
const activeStreams = new Map<string, {
  hostSocket: WebSocket | null
  viewers: Map<string, WebSocket>
  viewerCount: number
}>()

function broadcastToStream(streamId: string, message: any) {
  const stream = activeStreams.get(streamId)
  if (!stream) return
  
  const messageStr = JSON.stringify(message)
  
  // Send to host
  if (stream.hostSocket && stream.hostSocket.readyState === WebSocket.OPEN) {
    stream.hostSocket.send(messageStr)
  }
  
  // Send to all viewers
  stream.viewers.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(messageStr)
    }
  })
}

function handleLeave(streamId: string | null, oderId: string | null, isHost: boolean) {
  if (!streamId || !oderId) return
  
  const stream = activeStreams.get(streamId)
  if (!stream) return
  
  if (isHost) {
    // Host left, end stream for everyone
    broadcastToStream(streamId, {
      type: 'stream-ended',
      streamId
    })
    activeStreams.delete(streamId)
  } else {
    // Viewer left
    stream.viewers.delete(oderId)
    stream.viewerCount = Math.max(0, stream.viewerCount - 1)
    
    // Notify about viewer count change
    broadcastToStream(streamId, {
      type: 'viewer-count',
      streamId,
      count: stream.viewerCount
    })
    
    // Notify host
    if (stream.hostSocket && stream.hostSocket.readyState === WebSocket.OPEN) {
      stream.hostSocket.send(JSON.stringify({
        type: 'viewer-left',
        oderId,
        viewerCount: stream.viewerCount
      }))
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const upgrade = req.headers.get('upgrade') || ''
  
  if (upgrade.toLowerCase() === 'websocket') {
    const { socket, response } = Deno.upgradeWebSocket(req)
    
    let currentUserId: string | null = null
    let currentStreamId: string | null = null
    let isHost = false
    
    socket.onopen = () => {
      console.log('Live stream WebSocket opened')
    }
    
    socket.onmessage = async (event) => {
      try {
        const message: StreamMessage = JSON.parse(event.data)
        console.log('Stream message:', message.type, 'stream:', message.streamId)
        
        switch (message.type) {
          case 'join-stream':
            currentUserId = message.userId
            currentStreamId = message.streamId
            isHost = message.payload?.isHost || false
            
            // Create stream room if doesn't exist
            if (!activeStreams.has(message.streamId)) {
              activeStreams.set(message.streamId, {
                hostSocket: null,
                viewers: new Map(),
                viewerCount: 0
              })
            }
            
            const stream = activeStreams.get(message.streamId)!
            
            if (isHost) {
              stream.hostSocket = socket
              console.log('Host joined stream:', message.streamId)
            } else {
              stream.viewers.set(message.userId, socket)
              stream.viewerCount++
              
              // Notify host about new viewer
              if (stream.hostSocket && stream.hostSocket.readyState === WebSocket.OPEN) {
                stream.hostSocket.send(JSON.stringify({
                  type: 'viewer-joined',
                  userId: message.userId,
                  viewerCount: stream.viewerCount
                }))
              }
              
              // Broadcast viewer count to all
              broadcastToStream(message.streamId, {
                type: 'viewer-count',
                streamId: message.streamId,
                count: stream.viewerCount
              })
            }
            
            // Send current stream info to joiner
            socket.send(JSON.stringify({
              type: 'stream-info',
              streamId: message.streamId,
              viewerCount: stream.viewerCount,
              isLive: stream.hostSocket !== null
            }))
            break
            
          case 'chat':
            // Broadcast chat to everyone in stream
            if (currentStreamId) {
              broadcastToStream(currentStreamId, {
                type: 'chat',
                userId: message.userId,
                payload: message.payload
              })
            }
            break
            
          case 'gift':
            // Broadcast gift animation to everyone
            if (currentStreamId) {
              broadcastToStream(currentStreamId, {
                type: 'gift',
                userId: message.userId,
                payload: message.payload
              })
            }
            break
            
          case 'like':
            // Broadcast like animation
            if (currentStreamId) {
              broadcastToStream(currentStreamId, {
                type: 'like',
                userId: message.userId
              })
            }
            break
            
          case 'leave-stream':
            handleLeave(currentStreamId, currentUserId, isHost)
            break
        }
      } catch (err) {
        console.error('Error processing stream message:', err)
      }
    }
    
    socket.onclose = () => {
      console.log('Live stream WebSocket closed')
      handleLeave(currentStreamId, currentUserId, isHost)
    }
    
    socket.onerror = (err) => {
      console.error('Stream WebSocket error:', err)
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
    
    if (req.method === 'POST' && path === 'start-stream') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const { title, description, thumbnailUrl } = await req.json()
      
      // Create stream in database
      const { data: streamData, error } = await supabase
        .from('live_streams')
        .insert({
          host_id: user.id,
          title: title || 'Live Stream',
          description: description || '',
          thumbnail_url: thumbnailUrl,
          is_active: true,
          started_at: new Date().toISOString(),
          viewer_count: 0
        })
        .select()
        .single()
      
      if (error) {
        console.error('Error creating stream:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to create stream' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Initialize stream room
      activeStreams.set(streamData.id, {
        hostSocket: null,
        viewers: new Map(),
        viewerCount: 0
      })

      // Auto-start recording via livekit-egress
      try {
        const egressUrl = `${supabaseUrl}/functions/v1/livekit-egress/start-recording`;
        const egressRes = await fetch(egressUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
          body: JSON.stringify({
            streamId: streamData.id,
            roomName: `stream-${streamData.id}`,
            hostId: user.id,
          }),
        });
        const egressData = await egressRes.json();
        console.log('Auto-recording started:', egressData);
      } catch (recErr) {
        console.error('Auto-recording failed (non-blocking):', recErr);
      }
      
      return new Response(
        JSON.stringify({ success: true, stream: streamData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    if (req.method === 'POST' && path === 'end-stream') {
      const authHeader = req.headers.get('Authorization')
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      const { streamId } = await req.json()
      
      // End stream in database
      const { error } = await supabase
        .from('live_streams')
        .update({
          is_active: false,
          ended_at: new Date().toISOString()
        })
        .eq('id', streamId)
        .eq('host_id', user.id)
      
      if (error) {
        console.error('Error ending stream:', error)
        return new Response(
          JSON.stringify({ error: 'Failed to end stream' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      // Notify all viewers that stream ended
      const activeStream = activeStreams.get(streamId)
      if (activeStream) {
        broadcastToStream(streamId, {
          type: 'stream-ended',
          streamId
        })
        activeStreams.delete(streamId)
      }

      // Auto-stop recording
      try {
        const { data: activeRec } = await supabase
          .from('stream_recordings')
          .select('recording_sid')
          .eq('stream_id', streamId)
          .eq('status', 'recording')
          .single()

        if (activeRec?.recording_sid) {
          const egressUrl = `${supabaseUrl}/functions/v1/livekit-egress/stop-recording`
          await fetch(egressUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseKey}` },
            body: JSON.stringify({ egressId: activeRec.recording_sid, streamId }),
          })
          console.log('Auto-recording stopped for stream:', streamId)
        }
      } catch (recErr) {
        console.error('Auto-stop recording failed (non-blocking):', recErr)
      }
      
      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    if (req.method === 'GET' && path === 'active-streams') {
      const { data: streams, error } = await supabase
        .from('live_streams')
        .select(`
          *,
          host:profiles!live_streams_host_id_fkey(
            id, display_name, avatar_url, user_level, is_verified, country_flag
          )
        `)
        .eq('is_active', true)
        .order('viewer_count', { ascending: false })
        .limit(50)
      
      if (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch streams' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      return new Response(
        JSON.stringify({ streams }),
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
