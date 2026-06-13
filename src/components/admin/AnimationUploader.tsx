/**
 * Pkg423 — Unified animation uploader for admin panel.
 *
 * Used across: AdminGifts, AdminEntryEffects, AdminEntryBanners, AdminEntryNameBars,
 * AdminVehicleEntrances, AdminAvatarFrames, AdminRoleFrames, AdminChatBubbles,
 * AdminShop, AdminPartyBackgrounds, AdminLevelAnimations.
 *
 * Supports every professional live-streaming animation format:
 *   - SVGA       (Bigo, YY, Inke standard)
 *   - VAP        (Tencent / Chamet / MICO premium HD with alpha, optional vapc.json)
 *   - PAG        (Tencent PAG)
 *   - Lottie     (After Effects export)
 *   - WebP/PNG/GIF
 *   - MP4/WebM   (plain video)
 *
 * Returns the three DB fields the consumer should save:
 *   { animation_url, animation_format, animation_config_url }
 *
 * Reuses the existing `gifts` storage bucket so no new bucket / RLS work needed.
 */

import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Upload, X, Loader2, FileVideo, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import UniversalAnimationPlayer from '@/components/common/UniversalAnimationPlayer';
import { cn } from '@/lib/utils';
import { isLikelyVapCompositeSize } from '@/utils/vapDetection';

export type AnimationFormat =
  | 'svga'
  | 'vap'
  | 'pag'
  | 'lottie'
  | 'webp'
  | 'png'
  | 'gif'
  | 'mp4'
  | 'webm';

export interface AnimationUploaderValue {
  animation_url: string;
  animation_format: AnimationFormat | null;
  animation_config_url: string | null;
}

interface Props {
  value: AnimationUploaderValue;
  onChange: (v: AnimationUploaderValue) => void;
  /** Storage bucket to upload to. Defaults to `gifts` (already exists). */
  bucket?: string;
  /** Folder prefix inside the bucket. Defaults to `unified`. */
  folder?: string;
  label?: string;
  className?: string;
}

const FORMAT_LIMITS_MB: Record<AnimationFormat, number> = {
  svga: 50,
  vap: 50,
  pag: 50,
  lottie: 10,
  webp: 50,
  png: 50,
  gif: 50,
  mp4: 50,
  webm: 50,
};

const FORMAT_LABEL: Record<AnimationFormat, string> = {
  svga: 'SVGA (Bigo / YY standard)',
  vap: 'VAP — HD MP4 + alpha (Chamet / MICO premium)',
  pag: 'PAG (Tencent — Chamet 2025+ / TikTok standard)',
  lottie: 'Lottie (After Effects JSON)',
  webp: 'Animated WebP',
  png: 'PNG (static)',
  gif: 'Animated GIF',
  mp4: 'MP4 (plain video, no alpha)',
  webm: 'WebM',
};

const FORMAT_ACCEPT: Record<AnimationFormat, string> = {
  svga: '.svga',
  vap: '.mp4',
  pag: '.pag',
  lottie: '.json,application/json',
  webp: '.webp,image/webp',
  png: '.png,image/png',
  gif: '.gif,image/gif',
  mp4: '.mp4,video/mp4',
  webm: '.webm,video/webm',
};

const ALL_ANIMATION_ACCEPT = Object.values(FORMAT_ACCEPT).join(',');

const detectFormatByExtension = (fileName: string): AnimationFormat | null => {
  const clean = fileName.toLowerCase().split('?')[0];
  if (clean.endsWith('.svga')) return 'svga';
  if (clean.endsWith('.pag')) return 'pag';
  if (clean.endsWith('.json')) return 'lottie';
  if (clean.endsWith('.webp')) return 'webp';
  if (clean.endsWith('.png')) return 'png';
  if (clean.endsWith('.gif')) return 'gif';
  if (clean.endsWith('.webm')) return 'webm';
  if (clean.endsWith('.mp4')) return 'mp4';
  return null;
};

const looksLikeSideBySideVap = async (file: File): Promise<boolean> => {
  if (!file.type.includes('video') && !file.name.toLowerCase().endsWith('.mp4')) return false;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    const cleanup = () => URL.revokeObjectURL(url);
    const finish = (value: boolean) => { cleanup(); resolve(value); };
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.onloadeddata = () => {
      try {
        // Size-based composite check — pixel-side detection can be null on a
        // blank first frame, which must NOT downgrade the file to plain mp4.
        finish(isLikelyVapCompositeSize(video.videoWidth, video.videoHeight));
      } catch {
        finish(false);
      }
    };
    video.onerror = () => finish(false);
    video.src = url;
    video.load();
  });
};

export const AnimationUploader: React.FC<Props> = ({
  value,
  onChange,
  bucket = 'gifts',
  folder = 'unified',
  label = 'Animation file',
  className,
}) => {
  const [uploading, setUploading] = useState<'file' | 'config' | null>(null);
  const mainRef = useRef<HTMLInputElement>(null);
  const configRef = useRef<HTMLInputElement>(null);

  const format: AnimationFormat = (value.animation_format as AnimationFormat) || 'svga';

  const uploadFile = async (file: File, kind: 'file' | 'config', uploadFormat: AnimationFormat = format): Promise<string> => {
    setUploading(kind);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
      const fileName = `${folder}/${kind}_${uploadFormat}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}.${ext}`;
      // Binary animation formats (SVGA, Lottie .lottie zip, VAP) have no
      // standard MIME type — browsers report application/octet-stream or empty,
      // which most admin asset buckets (shop-items, banners, etc.) reject with
      // "mime type application/octet-stream is not supported". Route those to
      // the shared `animations` bucket that explicitly whitelists binary mimes.
      const rawType = (file.type || '').toLowerCase().split(';')[0].trim();
      const isBinaryAnim =
        !rawType ||
        rawType === 'application/octet-stream' ||
        rawType === 'binary/octet-stream' ||
        rawType.includes('zip') ||
        ext === 'svga' ||
        ext === 'lottie';
      const effectiveBucket = isBinaryAnim ? 'animations' : bucket;
      const effectiveContentType = rawType || 'application/octet-stream';
      // Hard 90s timeout so the spinner never gets stuck if the storage
      // request stalls (Supabase SDK has no built-in timeout).
      const uploadPromise = supabase.storage.from(effectiveBucket).upload(fileName, file, {
        upsert: true,
        contentType: effectiveContentType,
        cacheControl: '2592000', // 30 days — animation assets are immutable
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Upload timed out after 90s — check network and retry.')), 90_000)
      );
      const { error } = await Promise.race([uploadPromise, timeoutPromise]) as Awaited<typeof uploadPromise>;
      if (error) throw error;
      const {
        data: { publicUrl },
      } = supabase.storage.from(effectiveBucket).getPublicUrl(fileName);
      return publicUrl;
    } finally {
      setUploading(null);
    }
  };

  const handleMainFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const detectedByExt = detectFormatByExtension(file.name);
    const detectedFormat = detectedByExt === 'mp4' && (format === 'vap' || await looksLikeSideBySideVap(file)) ? 'vap' : detectedByExt;
    const uploadFormat = detectedFormat || format;
    const limit = FORMAT_LIMITS_MB[uploadFormat];
    if (file.size > limit * 1024 * 1024) {
      toast.error(`${uploadFormat.toUpperCase()} files must be ≤ ${limit}MB (got ${(
        file.size /
        1024 /
        1024
      ).toFixed(1)}MB).`);
      return;
    }

    try {
      const url = await uploadFile(file, 'file', uploadFormat);
      onChange({
        ...value,
        animation_url: url,
        animation_format: uploadFormat,
        animation_config_url: uploadFormat === 'vap' ? value.animation_config_url : null,
      });
      toast.success(`${uploadFormat.toUpperCase()} uploaded.`);
    } catch (err: any) {
      toast.error(`Upload failed: ${err?.message || err}`);
    }
  };

  const handleConfigFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.size > 200 * 1024) {
      toast.error('vapc.json must be ≤ 200KB.');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.json')) {
      toast.error('Config must be a .json file (vapc.json).');
      return;
    }

    try {
      const url = await uploadFile(file, 'config', 'vap');
      onChange({ ...value, animation_config_url: url });
      toast.success('VAP config uploaded.');
    } catch (err: any) {
      toast.error(`Config upload failed: ${err?.message || err}`);
    }
  };

  const clear = () =>
    onChange({ animation_url: '', animation_format: null, animation_config_url: null });

  const canPreview = !!value.animation_url;

  return (
    <div className={cn('space-y-3 rounded-lg border border-border bg-card p-3', className)}>
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        {value.animation_url && (
          <Button type="button" size="sm" variant="ghost" onClick={clear}>
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Format selector */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Format</Label>
        <Select
          value={format}
          onValueChange={(v) =>
            onChange({
              ...value,
              animation_format: v as AnimationFormat,
              // Clear config when switching away from VAP
              animation_config_url: v === 'vap' ? value.animation_config_url : null,
            })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(FORMAT_LABEL) as AnimationFormat[]).map((f) => (
              <SelectItem key={f} value={f}>
                {FORMAT_LABEL[f]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Max size: {FORMAT_LIMITS_MB[format]}MB. File type is auto-detected on upload.
        </p>
      </div>

      {/* Main file upload */}
      <div className="space-y-2">
        <input
          ref={mainRef}
          type="file"
          accept={ALL_ANIMATION_ACCEPT}
          onChange={handleMainFile}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={uploading !== null}
          onClick={() => mainRef.current?.click()}
        >
          {uploading === 'file' ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : value.animation_url ? (
            <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
          ) : (
            <Upload className="h-4 w-4 mr-2" />
          )}
          {value.animation_url ? 'Replace file' : `Upload ${format.toUpperCase()} file`}
        </Button>
      </div>

      {/* VAP config upload */}
      {format === 'vap' && (
        <div className="space-y-2 rounded-md border border-dashed border-border p-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FileVideo className="h-3.5 w-3.5" />
            Optional <code className="px-1 bg-muted rounded">vapc.json</code> for custom VAP layout.
          </div>
          <input
            ref={configRef}
            type="file"
            accept=".json,application/json"
            onChange={handleConfigFile}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            disabled={uploading !== null}
            onClick={() => configRef.current?.click()}
          >
            {uploading === 'config' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : value.animation_config_url ? (
              <CheckCircle2 className="h-4 w-4 mr-2 text-green-500" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            {value.animation_config_url ? 'Replace vapc.json' : 'Upload vapc.json'}
          </Button>
        </div>
      )}

      {/* Live preview */}
      {canPreview && (
        <div className="rounded-md bg-muted/30 p-2">
          <div className="text-[11px] text-muted-foreground mb-1">Preview</div>
          <div className="aspect-square w-full max-w-[200px] mx-auto">
            <UniversalAnimationPlayer
              src={value.animation_url}
              type={format}
              configSrc={value.animation_config_url || undefined}
              className="w-full h-full"
              loop
              autoPlay
              muted
            />
          </div>
        </div>
      )}

      {value.animation_url && format === 'vap' && !value.animation_config_url && (
        <p className="text-xs text-muted-foreground">
          Standard side-by-side VAP MP4 works without config; upload vapc.json only for custom layouts.
        </p>
      )}
    </div>
  );
};

export default AnimationUploader;
