import { useState, useRef } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ensureFreshSupabaseSession, isAuthSessionFailure, sessionExpiredUploadMessage } from "@/utils/sessionRecovery";

interface AvatarUploadProps {
  userId: string;
  currentAvatarUrl: string | null;
  displayName: string | null;
  onUploadComplete: (url: string) => void;
}

export const AvatarUpload = ({
  userId,
  currentAvatarUrl,
  displayName,
  onUploadComplete,
}: AvatarUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Error",
        description: "Only images can be uploaded",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "Error",
        description: "Image size must be less than 5MB",
        variant: "destructive",
      });
      return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Upload to Supabase Storage
    setUploading(true);
    try {
      const session = await ensureFreshSupabaseSession({ expectedUserId: userId });
      const authUid = session?.user?.id;
      if (!authUid) {
        toast({
          title: "Upload Failed",
          description: "Please sign in again to upload your photo",
          variant: "destructive",
        });
        return;
      }

      const fileExt = file.name.split(".").pop();
      const fileName = `${authUid}/${Date.now()}.${fileExt}`;

      const uploadAvatar = () => supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true });

      let { error: uploadError } = await uploadAvatar();
      if (uploadError && isAuthSessionFailure(uploadError)) {
        const recovered = await ensureFreshSupabaseSession({ expectedUserId: authUid, forceRefresh: true });
        if (!recovered) throw new Error(sessionExpiredUploadMessage);
        ({ error: uploadError } = await uploadAvatar());
      }

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      // Update profile
      const updateProfile = () => supabase
        .from("profiles")
        .update({ avatar_url: publicUrl, profile_photo_url: publicUrl })
        .eq("id", authUid);

      let { error: updateError } = await updateProfile();
      if (updateError && isAuthSessionFailure(updateError)) {
        const recovered = await ensureFreshSupabaseSession({ expectedUserId: authUid, forceRefresh: true });
        if (!recovered) throw new Error(sessionExpiredUploadMessage);
        ({ error: updateError } = await updateProfile());
      }

      if (updateError) throw updateError;

      onUploadComplete(publicUrl);
      toast({
        title: "Success!",
        description: "Profile picture updated",
      });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload Failed",
        description: isAuthSessionFailure(error) ? sessionExpiredUploadMessage : error.message || "Failed to upload image",
        variant: "destructive",
      });
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  };

  const clearPreview = () => {
    setPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="relative inline-block">
      <Avatar className="w-28 h-28 border-4 border-background shadow-xl">
        <AvatarImage src={previewUrl || currentAvatarUrl || undefined} />
        <AvatarFallback className="gradient-primary text-white text-3xl">
          {displayName?.charAt(0) || "U"}
        </AvatarFallback>
      </Avatar>

      {/* Upload Button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        className="absolute bottom-0 right-0 w-9 h-9 rounded-full gradient-primary flex items-center justify-center shadow-lg hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {uploading ? (
          <Loader2 className="w-4 h-4 text-white animate-spin" />
        ) : (
          <ImagePlus className="w-4 h-4 text-white" />
        )}
      </button>

      {/* Clear Preview Button */}
      {previewUrl && !uploading && (
        <button
          onClick={clearPreview}
          className="absolute top-0 right-0 w-6 h-6 rounded-full bg-destructive flex items-center justify-center shadow-lg"
        >
          <X className="w-3 h-3 text-white" />
        </button>
      )}

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};
