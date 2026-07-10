import { useState, useRef, useEffect } from "react";
import { X, Upload, FileImage, Play, Music, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MediaUploaderProps {
  isOpen: boolean;
  onClose: () => void;
  onMediaSelect: (url: string, type: 'image' | 'video' | 'audio' | 'document', previewUrl?: string) => void;
  userId?: string | null;
  directGallery?: boolean;
}

const ALLOWED_TYPES = [
  // Images (incl. modern Samsung/Pixel formats)
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
  'image/heic', 'image/heif', 'image/avif', 'image/bmp',
  // Videos (incl. HEVC/H.265, 3GP, MKV, M4V common on Samsung One UI)
  'video/mp4', 'video/quicktime', 'video/webm', 'video/mov', 'video/avi', 'video/mkv',
  'video/x-matroska', 'video/3gpp', 'video/3gpp2', 'video/x-m4v',
  'video/hevc', 'video/h265', 'video/h264',
  // Audio
  'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg',
  'audio/aac', 'audio/m4a', 'audio/mp4', 'audio/x-m4a', 'audio/webm', 'audio/amr', 'audio/3gpp',
  // Documents
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
];

const EXT_TO_TYPE: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', bmp: 'image/bmp',
  mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm',
  mkv: 'video/x-matroska', avi: 'video/avi', '3gp': 'video/3gpp', '3g2': 'video/3gpp2', hevc: 'video/hevc',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac',
  m4a: 'audio/m4a', amr: 'audio/amr',
  pdf: 'application/pdf', doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
};

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

export const MediaUploader = ({ isOpen, onClose, onMediaSelect, userId, directGallery = true }: MediaUploaderProps) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-open gallery when component opens with directGallery enabled
  useEffect(() => {
    if (isOpen && directGallery && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [isOpen, directGallery]);

  if (!isOpen) return null;

  const resolveMime = (file: File): string => {
    if (file.type && file.type !== 'application/octet-stream') return file.type.toLowerCase();
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    return EXT_TO_TYPE[ext] || '';
  };

  const getFriendlyType = (mime: string) => {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'document';
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      onClose();
      return;
    }

    // Many Samsung/Android pickers return empty file.type — resolve via extension.
    const resolvedType = resolveMime(file);

    // Validate file type
    if (!resolvedType || !ALLOWED_TYPES.includes(resolvedType)) {
      toast.error(`"${file.name}" — file type not supported. Allowed: images (JPG, PNG, GIF, WEBP, HEIC, AVIF), videos (MP4, MOV, MKV, 3GP, WEBM), audio (MP3, M4A, WAV, AAC), and documents (PDF, DOC, XLS, PPT, TXT).`);
      onClose();
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Validate file size (max 100MB)
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      toast.error(`File size is ${sizeMB}MB — maximum allowed is 100MB. Please choose a smaller file.`);
      onClose();
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Upload to Supabase Storage
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const ownerId = userId || user?.id;
      if (!ownerId) throw new Error('Not authenticated');

      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${ownerId}/${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from('chat-media')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        // Try creating bucket if it doesn't exist
        if (uploadError.message.includes('Bucket not found')) {
          toast.error("Storage not configured. Please contact support.");
          onClose();
          return;
        }
        throw uploadError;
      }

      const mediaType = getFriendlyType(resolvedType);
      const previewUrl = mediaType === 'image' || mediaType === 'video' || mediaType === 'audio'
        ? URL.createObjectURL(file)
        : undefined;
      onMediaSelect(filePath, mediaType, previewUrl);
      onClose();
      toast.success("File uploaded successfully!");
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("File upload failed. Please try again.");
      onClose();
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // If directGallery is enabled, just show a hidden input and loading state
  if (directGallery) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept="image/*,video/*,audio/*,.heic,.heif,.avif,.mkv,.3gp,.m4v,.m4a,.amr"
        />
        {uploading && (
          <div className="fixed inset-0 bg-white/80 flex items-center justify-center z-50">
            <div className="bg-background rounded-xl p-6 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Uploading...</p>
            </div>
          </div>
        )}
      </>
    );
  }

  // Original UI for non-direct gallery mode
  return (
    <div className="absolute bottom-full left-0 mb-2 bg-background border border-border rounded-2xl shadow-2xl overflow-hidden z-50 animate-scale-in w-72">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-gradient-to-r from-blue-500/10 to-cyan-500/10">
        <span className="font-semibold text-sm">Send Media</span>
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileSelect}
        accept="image/*,video/*,audio/*"
      />

      {uploading && (
        <div className="p-6 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">Uploading...</p>
        </div>
      )}

      {/* Options */}
      {!uploading && (
        <div className="p-3 space-y-2">
          <button
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.accept = 'image/*';
                fileInputRef.current.click();
              }
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <FileImage className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <p className="font-medium">Photo</p>
              <p className="text-xs text-muted-foreground">Send images up to 10MB</p>
            </div>
          </button>

          <button
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.accept = 'video/*';
                fileInputRef.current.click();
              }
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Play className="w-6 h-6 text-white ml-0.5" fill="white" />
            </div>
            <div className="text-left">
              <p className="font-medium">Video</p>
              <p className="text-xs text-muted-foreground">Send videos up to 50MB</p>
            </div>
          </button>

          <button
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.accept = 'audio/*';
                fileInputRef.current.click();
              }
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Music className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <p className="font-medium">Audio</p>
              <p className="text-xs text-muted-foreground">Send audio up to 20MB</p>
            </div>
          </button>

          <button
            onClick={() => {
              if (fileInputRef.current) {
                fileInputRef.current.accept = 'image/*,video/*,audio/*';
                fileInputRef.current.click();
              }
            }}
            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted transition-colors group"
          >
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Upload className="w-6 h-6 text-white" />
            </div>
            <div className="text-left">
              <p className="font-medium">Gallery</p>
              <p className="text-xs text-muted-foreground">Choose from gallery</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
