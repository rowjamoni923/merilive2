// R2-C6: DEPRECATED — this WebSocket edge function held per-room state in a
// module-level `Map` inside a stateless Deno isolate. Different isolates served
// the same room could not see each other's participants, causing invisible
// ghost users + privilege drift. Frontend has fully migrated to LiveKit +
// Supabase Realtime; nothing in `src/` invokes this endpoint anymore.
// Returning 410 Gone closes the attack surface (and any future stray client).
//
// If a party-room server side feature is needed again, replace with Supabase
// Realtime Presence (auto-leave on socket drop) or a LiveKit room participant
// handler — NEVER reintroduce in-process state for a stateless isolate.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  return new Response(
    JSON.stringify({
      error: 'gone',
      message:
        'party-room edge function is deprecated. Use LiveKit + Supabase Realtime for party rooms.',
    }),
    {
      status: 410,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
});
