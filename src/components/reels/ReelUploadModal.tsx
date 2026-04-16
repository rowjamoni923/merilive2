import { useState, useRef } from "react";
import { X, Upload, Music2, Film, Loader2, Disc3, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { SoundPickerModal } from "./SoundPickerModal";

interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
}

interface Sound {
  id: string;
  title: string;
  artist: string;
  audio_url: string;
  cover_image_url?: string;
  duration_seconds: number;
}

interface ReelUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  onUploadSuccess: () => void;
  preSelectedSound?: Sound | null;
}

export const ReelUploadModal = ({ 
  isOpen, 
  onClose, 
  categories, 
  onUploadSuccess,
  preSelectedSound 
}: ReelUploadModalProps) => {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [selectedSound, setSelectedSound] = useState<Sound | null>(preSelectedSound || null);
  const [showSoundPicker, setShowSoundPicker] = useState(false);
  const [categoryId, setCategoryId] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [agreedToPolicy, setAgreedToPolicy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      toast.error("Please select a video file");
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      toast.error("Video size must be less than 100MB");
      return;
    }

    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  const getVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        window.URL.revokeObjectURL(video.src);
        resolve(Math.round(video.duration));
      };
      video.src = URL.createObjectURL(file);
    });
  };

  const generateThumbnail = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      
      video.onloadeddata = () => {
        video.currentTime = 1;
      };
      
      video.onseeked = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx?.drawImage(video, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(URL.createObjectURL(blob));
          } else {
            reject(new Error('Failed to generate thumbnail'));
          }
        }, 'image/jpeg', 0.8);
      };
      
      video.onerror = reject;
      video.src = URL.createObjectURL(file);
    });
  };

  const handleUpload = async () => {
    if (!videoFile) {
      toast.error("Please select a video");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Please login to upload");
      return;
    }

    // Check agreement to content policy
    if (!agreedToPolicy) {
      toast.error("You must agree to the content policy before uploading");
      return;
    }

    setUploading(true);
    setUploadProgress(0);

    try {
      const duration = await getVideoDuration(videoFile);
      
      if (duration > 60) {
        toast.error("Video must be 60 seconds or less");
        setUploading(false);
        return;
      }

      setUploadProgress(20);

      // Upload video
      const sanitizedName = videoFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const videoFileName = `${user.id}/${Date.now()}_${sanitizedName}`;
      const { error: videoError } = await supabase.storage
        .from('reels')
        .upload(videoFileName, videoFile, {
          contentType: videoFile.type,
          upsert: false
        });

      if (videoError) throw videoError;
      setUploadProgress(60);

      const { data: videoUrlData } = supabase.storage
        .from('reels')
        .getPublicUrl(videoFileName);

      // Generate and upload thumbnail
      let thumbnailUrl = null;
      try {
        const thumbnailBlob = await fetch(await generateThumbnail(videoFile)).then(r => r.blob());
        const thumbnailFileName = `${user.id}/${Date.now()}_thumb.jpg`;
        
        const { error: thumbError } = await supabase.storage
          .from('reels')
          .upload(thumbnailFileName, thumbnailBlob, {
            contentType: 'image/jpeg',
            upsert: false
          });

        if (!thumbError) {
          const { data: thumbUrlData } = supabase.storage
            .from('reels')
            .getPublicUrl(thumbnailFileName);
          thumbnailUrl = thumbUrlData.publicUrl;
        }
      } catch (thumbErr) {
        console.error('Thumbnail generation failed:', thumbErr);
      }
      
      setUploadProgress(80);

      // Create reel record with sound info
      const { error: reelError } = await supabase
        .from('reels')
        .insert({
          user_id: user.id,
          video_url: videoUrlData.publicUrl,
          thumbnail_url: thumbnailUrl,
          caption: caption.trim() || null,
          category_id: categoryId || null,
          duration_seconds: duration,
          // Sound info (TikTok-style)
          sound_id: selectedSound?.id || null,
          sound_title: selectedSound?.title || 'Original Sound',
          sound_artist: selectedSound?.artist || null,
          sound_audio_url: selectedSound?.audio_url || null,
          is_original_sound: !selectedSound,
          // Legacy fields
          music_title: selectedSound?.title || null,
          music_artist: selectedSound?.artist || null,
        });

      if (reelError) throw reelError;

      setUploadProgress(100);
      
      // Reset form
      setVideoFile(null);
      setVideoPreview(null);
      setCaption("");
      setSelectedSound(null);
      setCategoryId("");
      setAgreedToPolicy(false);
      
      toast.success("Reel uploaded successfully!");
      onUploadSuccess();
    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error(error.message || "Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleClose = () => {
    if (uploading) return;
    setVideoFile(null);
    setVideoPreview(null);
    setCaption("");
    setSelectedSound(null);
    setCategoryId("");
    setAgreedToPolicy(false);
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md bg-background max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Film className="w-5 h-5 text-pink-500" />
              Upload Reel
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            {/* Video Upload */}
            <div 
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center min-h-[200px] cursor-pointer transition-all ${
                videoPreview ? 'border-pink-500 bg-pink-500/10' : 'border-muted-foreground/30 hover:border-pink-500/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={handleFileSelect}
                className="hidden"
                disabled={uploading}
              />
              
              {videoPreview ? (
                <div className="relative w-full">
                  <video
                    src={videoPreview}
                    className="w-full max-h-[300px] object-contain rounded-lg"
                    controls
                    muted
                  />
                  {!uploading && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setVideoFile(null);
                        setVideoPreview(null);
                      }}
                      className="absolute top-2 right-2 p-1 bg-black/60 rounded-full"
                    >
                      <X className="w-4 h-4 text-white" />
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <Upload className="w-12 h-12 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground text-center">
                    Tap to select video<br />
                    <span className="text-xs">Max 60 seconds, 100MB</span>
                  </p>
                </>
              )}
            </div>

            {/* Upload Progress */}
            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-gradient-to-r from-pink-500 to-purple-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Sound Picker - TikTok Style */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Music2 className="w-4 h-4" />
                Sound
              </Label>
              <button
                onClick={() => !uploading && setShowSoundPicker(true)}
                disabled={uploading}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors border border-border"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                  <Disc3 className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-sm">
                    {selectedSound ? selectedSound.title : "Original Sound"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {selectedSound ? selectedSound.artist : "Audio from your video"}
                  </p>
                </div>
                <span className="text-xs text-pink-500 font-medium">Change</span>
              </button>
            </div>

            {/* Caption */}
            <div className="space-y-2">
              <Label>Caption</Label>
              <Textarea
                placeholder="Write a caption..."
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                maxLength={500}
                rows={3}
                disabled={uploading}
              />
              <p className="text-xs text-muted-foreground text-right">{caption.length}/500</p>
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId} disabled={uploading}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent className="bg-background border">
                  {categories.filter(c => c.slug !== 'all').map(category => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.icon} {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 18+ Content Warning & Policy Agreement */}
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 space-y-2">
              <div className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="w-4 h-4 flex-shrink-0" />
                <p className="text-xs font-semibold">Content Policy Warning</p>
              </div>
              <p className="text-xs text-muted-foreground">
                ⛔ Uploading 18+ / Adult / Nude / Sexual content is <strong>strictly prohibited</strong>. 
                Violators will face <strong>permanent account ban</strong>, loss of all coins/diamonds, and level reset to 0.
              </p>
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={agreedToPolicy}
                  onChange={(e) => setAgreedToPolicy(e.target.checked)}
                  className="mt-0.5 accent-pink-500"
                  disabled={uploading}
                />
                <span className="text-xs text-muted-foreground">
                  I confirm this video does NOT contain any 18+, nude, or sexual content. I understand that violating this policy will result in a permanent ban.
                </span>
              </label>
            </div>

            {/* Submit Button */}
            <Button
              onClick={handleUpload}
              disabled={!videoFile || uploading || !agreedToPolicy}
              className="w-full bg-gradient-to-r from-pink-500 to-purple-500"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Post Reel
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sound Picker Modal */}
      <SoundPickerModal
        isOpen={showSoundPicker}
        onClose={() => setShowSoundPicker(false)}
        onSelectSound={setSelectedSound}
        selectedSound={selectedSound}
      />
    </>
  );
};
