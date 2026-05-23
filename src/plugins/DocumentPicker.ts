import { registerPlugin, Capacitor } from '@capacitor/core';

/**
 * Pkg261 — Storage Access Framework document picker.
 * For arbitrary file attachments (PDF, docs, audio, archives).
 * Pkg218 PhotoPicker handles images/videos.
 */
export interface PickedDocument {
  uri: string;
  name?: string;
  size?: number;
  mimeType?: string | null;
  base64?: string;
  readError?: string;
}

export interface DocumentPickerPlugin {
  pick(opts?: {
    mimeTypes?: string[];
    multiple?: boolean;
    readContent?: boolean;
  }): Promise<{ files: PickedDocument[]; cancelled: boolean }>;
  readUri(opts: { uri: string }): Promise<{ base64: string; size: number; mimeType: string | null }>;
}

const Native = registerPlugin<DocumentPickerPlugin>('DocumentPicker');

export const isDocumentPickerNative = () => Capacitor.getPlatform() === 'android';

export interface PickDocsOpts {
  mimeTypes?: string[];   // e.g. ['application/pdf','audio/*']
  multiple?: boolean;
  readContent?: boolean;  // inline base64 (≤50MB)
}

export async function pickDocuments(opts: PickDocsOpts = {}): Promise<PickedDocument[]> {
  if (isDocumentPickerNative()) {
    try {
      const r = await Native.pick(opts);
      return r.cancelled ? [] : r.files;
    } catch { return []; }
  }
  // Web fallback — <input type="file">
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = !!opts.multiple;
    if (opts.mimeTypes?.length) input.accept = opts.mimeTypes.join(',');
    input.onchange = async () => {
      const files = Array.from(input.files || []);
      const out: PickedDocument[] = [];
      for (const f of files) {
        const item: PickedDocument = {
          uri: URL.createObjectURL(f),
          name: f.name,
          size: f.size,
          mimeType: f.type || null,
        };
        if (opts.readContent && f.size <= 50 * 1024 * 1024) {
          try {
            const buf = await f.arrayBuffer();
            // @ts-ignore
            item.base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
          } catch (e: any) { item.readError = e?.message; }
        }
        out.push(item);
      }
      resolve(out);
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
}

/** Convert a picked document to a Blob (for upload to Supabase storage). */
export async function documentToBlob(doc: PickedDocument): Promise<Blob | null> {
  if (doc.base64) {
    try {
      const bin = atob(doc.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: doc.mimeType || 'application/octet-stream' });
    } catch { return null; }
  }
  if (isDocumentPickerNative()) {
    try {
      const r = await Native.readUri({ uri: doc.uri });
      const bin = atob(r.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: r.mimeType || doc.mimeType || 'application/octet-stream' });
    } catch { return null; }
  }
  // Web blob: URL
  try {
    const res = await fetch(doc.uri);
    return await res.blob();
  } catch { return null; }
}
