import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, X, Loader2 } from "lucide-react";
import { PageSkeleton } from "@/components/common/PageSkeleton";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";
import { recordClientError } from "@/utils/clientErrorLog";
import { ensureFreshSupabaseSession, isAuthSessionFailure, sessionExpiredUploadMessage } from "@/utils/sessionRecovery";

interface PosterImage {
  id: string;
  image_url: string;
  display_order: number;
  is_primary: boolean;
  media_type?: "image" | "video" | null;
}

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

const MyPoster = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [images, setImages] = useState<PosterImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchImages = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      setUserId(user.id);

      const { data, error } = await supabase
        .from("poster_images")
        .select("*")
        .eq("user_id", user.id)
        .order("display_order", { ascending: true });

      if (error) {
        console.error("Error fetching images:", error);
        recordClientError({ label: "MyPoster.fetchImages", message: error instanceof Error ? error.message : String(error) });
      } else {
        setImages(data || []);
      }
      setLoading(false);
    };

    fetchImages();
  }, [navigate]);

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !userId) return;

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      toast({ title: "Only photos or videos can be uploaded", variant: "destructive" });
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      toast({ title: "File must be less than 25MB", variant: "destructive" });
      return;
    }

    if (images.length >= 9) {
      toast({ title: "You can upload up to 9 items", variant: "destructive" });
      return;
    }

    setUploading(true);

    try {
      const session = await ensureFreshSupabaseSession({ expectedUserId: userId });
      const authUid = session?.user?.id;
      if (!authUid) {
        toast({ title: "Please sign in again to upload", variant: "destructive" });
        navigate("/auth");
        return;
      }

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const fileName = `${authUid}/${Date.now()}-${safeName}`;

      // Upload to Supabase Storage
      const uploadPoster = () => supabase.storage
        .from("posters")
        .upload(fileName, file, { upsert: true, contentType: file.type });

      let { error: uploadError } = await uploadPoster();
      if (uploadError && isAuthSessionFailure(uploadError)) {
        const recovered = await ensureFreshSupabaseSession({ expectedUserId: authUid, forceRefresh: true });
        if (!recovered) throw new Error(sessionExpiredUploadMessage);
        ({ error: uploadError } = await uploadPoster());
      }

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("posters")
        .getPublicUrl(fileName);

      // Save to database
      const insertPoster = () => supabase
        .from("poster_images")
        .insert({
          user_id: authUid,
          image_url: publicUrl,
          display_order: images.length,
          is_primary: images.length === 0,
          media_type: isVideo ? "video" : "image",
        } as any)
        .select()
        .single();

      let { data: newImage, error: dbError } = await insertPoster();
      if (dbError && isAuthSessionFailure(dbError)) {
        const recovered = await ensureFreshSupabaseSession({ expectedUserId: authUid, forceRefresh: true });
        if (!recovered) throw new Error(sessionExpiredUploadMessage);
        ({ data: newImage, error: dbError } = await insertPoster());
      }

      if (dbError) throw dbError;

      setImages([...images, newImage as PosterImage]);
      toast({ title: isVideo ? "Video uploaded!" : "Image uploaded!" });
    } catch (error) {
      console.error("Upload error:", error);
      recordClientError({ label: "MyPoster.fileName", message: error instanceof Error ? error.message : String(error) });
      const message = isAuthSessionFailure(error) ? sessionExpiredUploadMessage : error instanceof Error ? error.message : undefined;
      toast({ title: "Upload failed", description: message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDelete = async (imageId: string, imageUrl: string) => {
    try {
      // Delete from database
      const { error } = await supabase
        .from("poster_images")
        .delete()
        .eq("id", imageId);

      if (error) throw error;

      // Try to delete from storage (extract path from URL)
      const urlParts = imageUrl.split("/posters/");
      if (urlParts[1]) {
        await supabase.storage.from("posters").remove([urlParts[1]]);
      }

      setImages(images.filter(img => img.id !== imageId));
      toast({ title: "Image deleted" });
    } catch (error) {
      console.error("Delete error:", error);
      recordClientError({ label: "MyPoster.urlParts", message: error instanceof Error ? error.message : String(error) });
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  if (loading) {
    return <PageSkeleton rows={4} hero={false} />;
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 z-[60] bg-background border-b border-border shadow-sm">
        <div className="flex items-center justify-between px-4 h-14 safe-area-top">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="text-foreground hover:bg-muted"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold">My Poster</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>

      {/* Description */}
      <p className="text-center text-muted-foreground text-sm py-4">
        Upload clear photos or videos to show yourself
      </p>

      {/* Image Grid */}
      <div className="px-4 pb-8">
        <div className="grid grid-cols-3 gap-3">
          <AnimatePresence>
            {images.map((image, index) => {
              const isVideo =
                image.media_type === "video" ||
                /\.(mp4|webm|mov|m4v|ogg)(\?.*)?$/i.test(image.image_url);
              return (
                <motion.div
                  key={image.id}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="relative aspect-[3/4] rounded-xl overflow-hidden group bg-muted"
                >
                  {isVideo ? (
                    <video
                      src={image.image_url}
                      className="w-full h-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                      controls
                    />
                  ) : (
                    <img
                      loading="lazy"
                      decoding="async"
                      src={image.image_url}
                      alt={`Poster ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  )}
                  {/* Gradient border for primary */}
                  {index === 0 && (
                    <div
                      className="absolute inset-0 rounded-xl pointer-events-none"
                      style={{
                        background:
                          "linear-gradient(white, white) padding-box, linear-gradient(135deg, #f472b6, #a855f7, #fb923c) border-box",
                        border: "3px solid transparent",
                      }}
                    />
                  )}
                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(image.id, image.image_url)}
                    className="absolute top-2 right-2 w-6 h-6 bg-white/80 rounded-full flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    aria-label="Delete"
                  >
                    <X className="w-4 h-4 text-slate-800" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Add new image button */}
          {images.length < 9 && (
            <label className="aspect-[3/4] rounded-xl bg-muted flex items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors active:scale-95 touch-manipulation">
              {uploading ? (
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              ) : (
                <Plus className="w-8 h-8 text-primary" />
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploading}
              />
            </label>
          )}
        </div>
      </div>

      {/* Tips */}
      <div className="px-4 pb-8">
        <div className="bg-muted/50 rounded-xl p-4">
          <h4 className="font-medium mb-2">Tips:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• The first item will be shown as your main profile picture</li>
            <li>• You can upload up to 9 photos or videos</li>
            <li>• Max file size: 25MB (photo or video)</li>
            <li>• Upload clear and beautiful media</li>
          </ul>
        </div>
      </div>
      </div>
    </div>
  );
};

export default MyPoster;
