import { useState, useRef, useEffect } from "react";
import { X, Upload, FileImage, Film, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MediaUploaderProps {
  isOpen: boolean;
  onClose: () => void;
  onMediaSelect: (url: string, type: 'image' | 'video' | 'audio') => void;
  directGallery?: boolean;
}

export const MediaUploader = ({ isOpen, onClose, onMediaSelect, directGallery = true }: MediaUploaderProps) => {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-open gallery when component opens with directGallery enabled
  useEffect(() => {
    if (isOpen && directGallery && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [isOpen, directGallery]);

  if (!isOpen) return null;

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      onClose();
      return;
    }

    // Validate file type
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    const isAudio = file.type.startsWith('audio/');

    if (!isImage && !isVideo && !isAudio) {
      toast.error("Please select an image, video, or audio file");
      onClose();
      return;
    }

    // Validate file size (max 50MB for videos, 10MB for images, 20MB for audio)
    const maxSize = isVideo ? 50 * 1024 * 1024 : isAudio ? 20 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`File too large. Max size: ${isVideo ? '50MB' : isAudio ? '20MB' : '10MB'}`);
      onClose();
      return;
    }

    // Upload to Supabase Storage
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `chat-media/${fileName}`;

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

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('chat-media')
        .getPublicUrl(filePath);

      const mediaType = isImage ? 'image' : isVideo ? 'video' : 'audio';
      onMediaSelect(urlData.publicUrl, mediaType);
      onClose();
      toast.success("Media uploaded successfully!");
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error("Failed to upload media");
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
          accept="image/*,video/*,audio/*"
        />
        {uploading && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
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
              <Film className="w-6 h-6 text-white" />
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
