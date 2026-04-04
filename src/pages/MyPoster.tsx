import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, X, Loader2 } from "lucide-react";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { motion, AnimatePresence } from "framer-motion";

interface PosterImage {
  id: string;
  image_url: string;
  display_order: number;
  is_primary: boolean;
}

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

    // Validate file
    if (!file.type.startsWith("image/")) {
      toast({ title: "Only images can be uploaded", variant: "destructive" });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "Image must be less than 10MB", variant: "destructive" });
      return;
    }

    if (images.length >= 9) {
      toast({ title: "You can upload up to 9 images", variant: "destructive" });
      return;
    }

    setUploading(true);

    try {
      const fileName = `${userId}/${Date.now()}-${file.name}`;
      
      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("posters")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("posters")
        .getPublicUrl(fileName);

      // Save to database
      const { data: newImage, error: dbError } = await supabase
        .from("poster_images")
        .insert({
          user_id: userId,
          image_url: publicUrl,
          display_order: images.length,
          is_primary: images.length === 0
        })
        .select()
        .single();

      if (dbError) throw dbError;

      setImages([...images, newImage]);
      toast({ title: "Image uploaded!" });
    } catch (error) {
      console.error("Upload error:", error);
      toast({ title: "Upload failed", variant: "destructive" });
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
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 z-10 bg-background border-b border-border">
        <div className="flex items-center justify-between px-4 h-14 safe-area-top">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold">My Poster</h1>
          <div className="w-10" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: 'var(--content-bottom-padding)' }}>

      {/* Description */}
      <p className="text-center text-muted-foreground text-sm py-4">
        Upload clear and beautiful photos to show yourself
      </p>

      {/* Image Grid */}
      <div className="px-4 pb-8">
        <div className="grid grid-cols-3 gap-3">
          <AnimatePresence>
            {images.map((image, index) => (
              <motion.div
                key={image.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="relative aspect-[3/4] rounded-xl overflow-hidden group"
              >
                <img
                  src={image.image_url}
                  alt={`Poster ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                {/* Gradient border for primary */}
                {index === 0 && (
                  <div className="absolute inset-0 border-2 border-gradient-to-r from-pink-500 via-purple-500 to-orange-500 rounded-xl pointer-events-none" 
                    style={{
                      background: "linear-gradient(white, white) padding-box, linear-gradient(135deg, #f472b6, #a855f7, #fb923c) border-box",
                      border: "3px solid transparent"
                    }}
                  />
                )}
                {/* Delete button */}
                <button
                  onClick={() => handleDelete(image.id, image.image_url)}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-4 h-4 text-white" />
                </button>
              </motion.div>
            ))}
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
                accept="image/*"
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
            <li>• The first image will be shown as your main profile picture</li>
            <li>• You can upload up to 9 images</li>
            <li>• Upload clear and beautiful photos</li>
          </ul>
        </div>
      </div>
      </div>
    </div>
  );
};

export default MyPoster;
