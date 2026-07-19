import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Cache-Control': 'public, max-age=300',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const url = new URL(req.url)
    const section = url.searchParams.get('section') // banners, frames, branding, icons, animations, all
    const category = url.searchParams.get('category') // optional filter

    const results: Record<string, any> = {}

    const fetchSection = async (key: string) => {
      switch (key) {
        case 'banners': {
          const { data } = await supabase
            .from('banners')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true })
          results.banners = data || []
          break
        }
        case 'party_banners': {
          const { data } = await supabase
            .from('party_room_banners')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true })
          results.party_banners = data || []
          break
        }
        case 'frames': {
          let query = supabase
            .from('avatar_frames')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true })
          if (category) query = query.eq('category', category)
          const { data } = await query
          results.frames = data || []
          break
        }
        case 'branding': {
          const { data } = await supabase
            .from('branding_settings')
            .select('*')
            .limit(1)
            .single()
          results.branding = data || null
          break
        }
        case 'icons': {
          let query = supabase
            .from('app_icon_registry')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true })
          if (category) query = query.eq('category', category)
          const { data } = await query
          results.icons = data || []
          break
        }
        case 'stickers': {
          const { data } = await supabase
            .from('ar_stickers')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true })
          results.stickers = data || []
          break
        }
        case 'filters': {
          const { data } = await supabase
            .from('beauty_filters')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true })
          results.filters = data || []
          break
        }
        case 'themes': {
          const { data } = await supabase
            .from('app_event_themes')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true })
          results.themes = data || []
          break
        }
        case 'music': {
          const { data } = await supabase
            .from('admin_music_library')
            .select('*')
            .eq('is_active', true)
            .order('display_order', { ascending: true })
          results.music = data || []
          break
        }
      }
    }

    if (!section || section === 'all') {
      // Fetch all sections in parallel
      await Promise.all([
        fetchSection('banners'),
        fetchSection('party_banners'),
        fetchSection('frames'),
        fetchSection('branding'),
        fetchSection('icons'),
        fetchSection('stickers'),
        fetchSection('filters'),
        fetchSection('themes'),
        fetchSection('music'),
      ])
    } else {
      // Fetch specific sections (comma-separated)
      const sections = section.split(',').map(s => s.trim())
      await Promise.all(sections.map(s => fetchSection(s)))
    }

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
    })
  }
})
