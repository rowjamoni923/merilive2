import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-client-platform, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audio, language = 'bn' } = await req.json();
    
    if (!audio) {
      return new Response(
        JSON.stringify({ error: 'No audio data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Try ElevenLabs first, fallback to Lovable AI
    const ELEVENLABS_API_KEY = Deno.env.get('ELEVENLABS_API_KEY');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

    let transcription = '';

    if (ELEVENLABS_API_KEY) {
      console.log('[STT] Using ElevenLabs Speech-to-Text');
      
      try {
        // Decode base64 audio
        const binaryString = atob(audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        // Create form data for ElevenLabs API
        const formData = new FormData();
        const audioBlob = new Blob([bytes], { type: 'audio/webm' });
        formData.append('file', audioBlob, 'audio.webm');
        formData.append('model_id', 'scribe_v2');
        
        // Map language codes
        const langMap: Record<string, string> = {
          'bn': 'ben', // Bengali
          'en': 'eng', // English
          'hi': 'hin', // Hindi
          'ur': 'urd', // Urdu
          'ar': 'ara', // Arabic
        };
        
        if (langMap[language]) {
          formData.append('language_code', langMap[language]);
        }

        const response = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
          method: 'POST',
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
          },
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('[STT] ElevenLabs error:', response.status, errorText);
          throw new Error(`ElevenLabs API error: ${response.status}`);
        }

        const result = await response.json();
        transcription = result.text || '';
        console.log('[STT] ElevenLabs transcription:', transcription.substring(0, 100));
        
      } catch (elevenLabsError) {
        console.error('[STT] ElevenLabs failed, falling back to Lovable AI:', elevenLabsError);
        // Will fall through to Lovable AI below
      }
    }

    // Fallback to Lovable AI if ElevenLabs didn't work
    if (!transcription && LOVABLE_API_KEY) {
      console.log('[STT] Using Lovable AI for transcription');
      
      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: `You are a speech transcription assistant. Transcribe the audio content accurately. 
              Focus on detecting any phone numbers, contact information, or social media handles.
              Return ONLY the transcription text, nothing else.
              If the language is Bengali/Bangla, transcribe in Bengali script.`
            },
            {
                {
                  type: "text",
                  text: `Transcribe this audio. Language hint: ${language}`
                },
                {
                  input_audio: {
                    data: audio,
                    format: "wav"
                  }
                }
              ]
            }
          ],
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[STT] Lovable AI error:', response.status, errorText);
        
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded, please try again later' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        throw new Error(`Transcription failed: ${errorText}`);
      }

      const result = await response.json();
      transcription = result.choices?.[0]?.message?.content || '';
      console.log('[STT] Lovable AI transcription:', transcription.substring(0, 100));
    }

    if (!transcription && !ELEVENLABS_API_KEY && !LOVABLE_API_KEY) {
      throw new Error('No speech-to-text API configured');
    }

    return new Response(
      JSON.stringify({ 
        success: true 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[STT] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error', success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
