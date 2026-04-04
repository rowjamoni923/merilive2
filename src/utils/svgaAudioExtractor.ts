/**
 * SVGA Audio Extractor
 * 
 * Extracts embedded audio directly from raw SVGA binary data.
 * 
 * SVGA files are either:
 * 1. ZIP archives containing movie.binary (SVGA 1.x)
 * 2. Raw zlib-compressed protobuf (SVGA 2.x) 
 * 
 * Audio is embedded as raw MP3/AAC/OGG bytes inside the protobuf images map.
 * The svgaplayerweb parser converts images to HTMLImageElement objects,
 * losing audio data in the process. This extractor bypasses the parser
 * and scans the raw binary for audio segments.
 */

import pako from 'pako';

export interface ExtractedAudio {
  data: Uint8Array;
  mimeType: string;
  format: string;
}

/**
 * Fetch an SVGA file and extract any embedded audio segments.
 * Returns array of audio segments found.
 */
export async function extractAudioFromSVGA(url: string): Promise<ExtractedAudio[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) return [];
    
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    // Decompress if zlib-compressed (SVGA 2.x format)
    let decompressed: Uint8Array;
    try {
      decompressed = pako.inflate(bytes);
    } catch {
      // Not zlib compressed - might be ZIP (SVGA 1.x) or raw protobuf
      decompressed = bytes;
    }
    
    // Scan for audio segments in the decompressed data
    return scanForAudioSegments(decompressed);
  } catch (e) {
    console.warn('[SVGAAudioExtractor] Failed to extract audio:', e);
    return [];
  }
}

/**
 * Scan binary data for known audio format signatures and extract complete segments.
 */
function scanForAudioSegments(data: Uint8Array): ExtractedAudio[] {
  const results: ExtractedAudio[] = [];
  const len = data.length;
  
  // 1. Find MP3 with ID3 tag (most common in SVGA)
  for (let i = 0; i < len - 10; i++) {
    if (data[i] === 0x49 && data[i + 1] === 0x44 && data[i + 2] === 0x33) {
      // ID3v2 tag found - calculate tag size
      const id3Size = getID3v2Size(data, i);
      if (id3Size > 0) {
        // Extract from ID3 tag start to end of MP3 data
        const mp3Data = extractMP3FromOffset(data, i);
        if (mp3Data && mp3Data.length > 1000) { // Min 1KB to be real audio
          results.push({ data: mp3Data, mimeType: 'audio/mpeg', format: 'mp3' });
          i += mp3Data.length - 1; // Skip past this segment
        }
      }
    }
  }
  
  // 2. Find MP3 frame sync without ID3 (less common)
  if (results.length === 0) {
    for (let i = 0; i < len - 4; i++) {
      if (data[i] === 0xFF && (data[i + 1] & 0xE0) === 0xE0 && data[i + 1] !== 0xFF) {
        // Verify this is actually an MP3 frame by checking for next frame
        const frameLen = getMP3FrameLength(data, i);
        if (frameLen > 0 && i + frameLen < len) {
          const nextByte = data[i + frameLen];
          const nextByte2 = data[i + frameLen + 1];
          if (nextByte === 0xFF && (nextByte2 & 0xE0) === 0xE0) {
            // Confirmed MP3 - extract to end of consecutive frames
            const mp3Data = extractMP3Frames(data, i);
            if (mp3Data && mp3Data.length > 1000) {
              results.push({ data: mp3Data, mimeType: 'audio/mpeg', format: 'mp3' });
              break;
            }
          }
        }
      }
    }
  }
  
  // 3. Find OGG Vorbis
  for (let i = 0; i < len - 4; i++) {
    if (data[i] === 0x4F && data[i + 1] === 0x67 && data[i + 2] === 0x67 && data[i + 3] === 0x53) {
      const oggData = extractOGG(data, i);
      if (oggData && oggData.length > 1000) {
        results.push({ data: oggData, mimeType: 'audio/ogg', format: 'ogg' });
        break;
      }
    }
  }
  
  // 4. Find AAC ADTS
  if (results.length === 0) {
    for (let i = 0; i < len - 7; i++) {
      if (data[i] === 0xFF && (data[i + 1] === 0xF1 || data[i + 1] === 0xF9)) {
        const aacData = extractAAC(data, i);
        if (aacData && aacData.length > 500) {
          results.push({ data: aacData, mimeType: 'audio/aac', format: 'aac' });
          break;
        }
      }
    }
  }
  
  // 5. Find M4A/MP4 container (ftyp box)
  if (results.length === 0) {
    for (let i = 0; i < len - 8; i++) {
      if (data[i + 4] === 0x66 && data[i + 5] === 0x74 && data[i + 6] === 0x79 && data[i + 7] === 0x70) {
        const m4aData = extractM4A(data, i);
        if (m4aData && m4aData.length > 1000) {
          results.push({ data: m4aData, mimeType: 'audio/mp4', format: 'mp4' });
          break;
        }
      }
    }
  }
  
  // 6. Find WAV (RIFF...WAVE)
  for (let i = 0; i < len - 12; i++) {
    if (data[i] === 0x52 && data[i + 1] === 0x49 && data[i + 2] === 0x46 && data[i + 3] === 0x46 &&
        data[i + 8] === 0x57 && data[i + 9] === 0x41 && data[i + 10] === 0x56 && data[i + 11] === 0x45) {
      const wavSize = (data[i + 4] | (data[i + 5] << 8) | (data[i + 6] << 16) | (data[i + 7] << 24)) + 8;
      if (wavSize > 100 && i + wavSize <= len) {
        results.push({ data: data.slice(i, i + wavSize), mimeType: 'audio/wav', format: 'wav' });
        break;
      }
    }
  }
  
  return results;
}

/** Parse ID3v2 tag size (synchsafe integer) */
function getID3v2Size(data: Uint8Array, offset: number): number {
  if (offset + 10 > data.length) return -1;
  // ID3v2 header: "ID3" + version(2B) + flags(1B) + size(4B synchsafe)
  const size = ((data[offset + 6] & 0x7F) << 21) |
               ((data[offset + 7] & 0x7F) << 14) |
               ((data[offset + 8] & 0x7F) << 7) |
                (data[offset + 9] & 0x7F);
  return size + 10; // Include header
}

/** Extract MP3 data starting from an ID3 tag offset */
function extractMP3FromOffset(data: Uint8Array, start: number): Uint8Array | null {
  const id3Size = getID3v2Size(data, start);
  if (id3Size <= 0) return null;
  
  // After ID3 tag, scan for MP3 frames
  let pos = start + id3Size;
  let lastValidFrame = pos;
  
  // Follow consecutive MP3 frames
  while (pos < data.length - 4) {
    if (data[pos] === 0xFF && (data[pos + 1] & 0xE0) === 0xE0 && data[pos + 1] !== 0xFF) {
      const frameLen = getMP3FrameLength(data, pos);
      if (frameLen > 0) {
        lastValidFrame = pos + frameLen;
        pos += frameLen;
        continue;
      }
    }
    // Not a frame - check if we already found enough frames
    if (lastValidFrame > start + id3Size + 100) break;
    pos++;
  }
  
  if (lastValidFrame <= start + id3Size) {
    // No MP3 frames found after ID3 - take a generous chunk
    const end = Math.min(start + id3Size + 500000, data.length);
    return data.slice(start, end);
  }
  
  return data.slice(start, lastValidFrame);
}

/** Calculate MP3 frame length from header */
function getMP3FrameLength(data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) return -1;
  
  const header = (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
  
  const versionBits = (header >> 19) & 3;
  const layerBits = (header >> 17) & 3;
  const bitrateBits = (header >> 12) & 0xF;
  const sampleRateBits = (header >> 10) & 3;
  const paddingBit = (header >> 9) & 1;
  
  if (versionBits === 1 || layerBits === 0 || bitrateBits === 0 || bitrateBits === 15 || sampleRateBits === 3) {
    return -1;
  }
  
  const bitrateTable: Record<string, number[]> = {
    '3-3': [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],  // V1, L1
    '3-2': [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],      // V1, L2
    '3-1': [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],       // V1, L3
  };
  
  const sampleRateTable: Record<number, number[]> = {
    3: [44100, 48000, 32000],  // V1
    2: [22050, 24000, 16000],  // V2
    0: [11025, 12000, 8000],   // V2.5
  };
  
  const key = `${versionBits}-${layerBits}`;
  const bitrates = bitrateTable[key];
  const sampleRates = sampleRateTable[versionBits];
  
  if (!bitrates || !sampleRates) return -1;
  
  const bitrate = bitrates[bitrateBits];
  const sampleRate = sampleRates[sampleRateBits];
  
  if (!bitrate || !sampleRate) return -1;
  
  if (layerBits === 3) { // Layer 1
    return Math.floor((12 * bitrate * 1000 / sampleRate + paddingBit) * 4);
  } else { // Layer 2, 3
    return Math.floor(144 * bitrate * 1000 / sampleRate + paddingBit);
  }
}

/** Extract consecutive MP3 frames */
function extractMP3Frames(data: Uint8Array, start: number): Uint8Array | null {
  let pos = start;
  while (pos < data.length - 4) {
    if (data[pos] === 0xFF && (data[pos + 1] & 0xE0) === 0xE0 && data[pos + 1] !== 0xFF) {
      const frameLen = getMP3FrameLength(data, pos);
      if (frameLen > 0) {
        pos += frameLen;
        continue;
      }
    }
    break;
  }
  if (pos <= start) return null;
  return data.slice(start, pos);
}

/** Extract OGG stream */
function extractOGG(data: Uint8Array, start: number): Uint8Array | null {
  let end = start;
  // Follow OGG pages (each starts with "OggS")
  while (end < data.length - 27) {
    if (data[end] === 0x4F && data[end + 1] === 0x67 && data[end + 2] === 0x67 && data[end + 3] === 0x53) {
      // OGG page header: 27 bytes + segment_table
      const numSegments = data[end + 26];
      let pageSize = 27 + numSegments;
      for (let s = 0; s < numSegments && end + 27 + s < data.length; s++) {
        pageSize += data[end + 27 + s];
      }
      end += pageSize;
    } else {
      break;
    }
  }
  if (end <= start) return null;
  return data.slice(start, end);
}

/** Extract AAC ADTS frames */
function extractAAC(data: Uint8Array, start: number): Uint8Array | null {
  let pos = start;
  while (pos < data.length - 7) {
    if (data[pos] === 0xFF && (data[pos + 1] === 0xF1 || data[pos + 1] === 0xF9)) {
      const frameLen = ((data[pos + 3] & 0x03) << 11) | (data[pos + 4] << 3) | ((data[pos + 5] >> 5) & 0x07);
      if (frameLen > 7 && pos + frameLen <= data.length) {
        pos += frameLen;
        continue;
      }
    }
    break;
  }
  if (pos <= start) return null;
  return data.slice(start, pos);
}

/** Extract M4A/MP4 container */
function extractM4A(data: Uint8Array, start: number): Uint8Array | null {
  // MP4 boxes: each has [4B size][4B type][...data]
  let pos = start;
  while (pos < data.length - 8) {
    const boxSize = (data[pos] << 24) | (data[pos + 1] << 16) | (data[pos + 2] << 8) | data[pos + 3];
    if (boxSize < 8 || pos + boxSize > data.length) break;
    pos += boxSize;
  }
  if (pos <= start + 8) return null;
  return data.slice(start, pos);
}
