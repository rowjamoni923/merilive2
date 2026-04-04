import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { reel_id } = await req.json()

  // Get reel info first
  const { data: reel } = await supabase
    .from('reels')
    .select('id, video_url, thumbnail_url, user_id')
    .eq('id', reel_id)
    .single()

  if (!reel) {
    return new Response(JSON.stringify({ error: 'Reel not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Delete from DB
  const { error } = await supabase.from('reels').delete().eq('id', reel_id)
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Clean up storage
  const filesToDelete: string[] = []
  if (reel.video_url) {
    const path = reel.video_url.split('/reels/')[1]
    if (path) filesToDelete.push(decodeURIComponent(path))
  }
  if (reel.thumbnail_url) {
    const path = reel.thumbnail_url.split('/reels/')[1]
    if (path) filesToDelete.push(decodeURIComponent(path))
  }

  if (filesToDelete.length > 0) {
    await supabase.storage.from('reels').remove(filesToDelete)
  }

  return new Response(JSON.stringify({ success: true, deleted_id: reel_id }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
