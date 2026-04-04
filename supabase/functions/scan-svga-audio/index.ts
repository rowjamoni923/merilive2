import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { urls } = await req.json();
    
    if (!urls || !Array.isArray(urls)) {
      return new Response(JSON.stringify({ error: "urls array required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const results = [];

    for (const url of urls.slice(0, 25)) {
      try {
        // Fetch the SVGA file
        const resp = await fetch(url, { 
          headers: { "Accept": "*/*" },
          signal: AbortSignal.timeout(30000),
        });
        
        if (!resp.ok) {
          results.push({ url: url.split('/').pop(), status: "fetch_error", httpStatus: resp.status });
          continue;
        }

        const buffer = await resp.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const sizeMB = (buffer.byteLength / (1024 * 1024)).toFixed(2);

        // SVGA files are ZIP archives containing a movie.binary protobuf
        // Check ZIP magic bytes
        const isZip = bytes[0] === 0x50 && bytes[1] === 0x4B;
        
        // Search for audio-related markers in the binary
        // SVGA 2.0 embeds audio as entries in the protobuf with keys like "audio_0", "audio_1"
        const textDecoder = new TextDecoder("utf-8", { fatal: false });
        const rawText = textDecoder.decode(bytes);
        
        // Look for audio markers
        const hasAudioKey = rawText.includes("audio_") || rawText.includes("audios");
        const hasMP3Magic = findMP3Magic(bytes);
        const hasOggMagic = findOggMagic(bytes);
        const hasWavMagic = findWavMagic(bytes);
        const hasAAC = findAACMagic(bytes);
        
        const audioFormats: string[] = [];
        if (hasMP3Magic) audioFormats.push("mp3");
        if (hasOggMagic) audioFormats.push("ogg");
        if (hasWavMagic) audioFormats.push("wav");
        if (hasAAC) audioFormats.push("aac/m4a");

        results.push({
          name: url.split('/').pop()?.substring(0, 50),
          sizeMB,
          isZip,
          hasAudioKey,
          hasEmbeddedAudio: audioFormats.length > 0,
          audioFormats,
          status: "scanned",
        });
      } catch (e) {
        results.push({ 
          name: url.split('/').pop()?.substring(0, 50), 
          status: "error", 
          error: String(e).substring(0, 100) 
        });
      }
    }

    return new Response(JSON.stringify({ results, total: results.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

function findMP3Magic(bytes: Uint8Array): boolean {
  // MP3 frame sync: 0xFF 0xFB/0xF3/0xF2/0xE0-0xFF
  // ID3 tag: 0x49 0x44 0x33
  for (let i = 0; i < bytes.length - 3; i++) {
    if (bytes[i] === 0x49 && bytes[i+1] === 0x44 && bytes[i+2] === 0x33) return true;
    if (bytes[i] === 0xFF && (bytes[i+1] & 0xE0) === 0xE0 && bytes[i+1] !== 0xFF) {
      // Verify it's likely MP3 and not random data
      if (i + 4 < bytes.length) return true;
    }
  }
  return false;
}

function findOggMagic(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes[i] === 0x4F && bytes[i+1] === 0x67 && bytes[i+2] === 0x67 && bytes[i+3] === 0x53) return true;
  }
  return false;
}

function findWavMagic(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes[i] === 0x52 && bytes[i+1] === 0x49 && bytes[i+2] === 0x46 && bytes[i+3] === 0x46) {
      if (i + 11 < bytes.length && bytes[i+8] === 0x57 && bytes[i+9] === 0x41 && bytes[i+10] === 0x56 && bytes[i+11] === 0x45) {
        return true;
      }
    }
  }
  return false;
}

function findAACMagic(bytes: Uint8Array): boolean {
  // AAC ADTS sync: 0xFF 0xF1 or 0xFF 0xF9
  // M4A/MP4 container: ftyp
  for (let i = 0; i < bytes.length - 7; i++) {
    if (bytes[i+4] === 0x66 && bytes[i+5] === 0x74 && bytes[i+6] === 0x79 && bytes[i+7] === 0x70) return true;
  }
  for (let i = 0; i < bytes.length - 2; i++) {
    if (bytes[i] === 0xFF && (bytes[i+1] === 0xF1 || bytes[i+1] === 0xF9)) return true;
  }
  return false;
}
