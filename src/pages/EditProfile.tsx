import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { LoadingSpinner } from "@/components/common/LoadingSpinner";
import {
  ArrowLeft,
  ChevronRight,
  Copy,
  Camera,
  User,
  Phone,
  Mail,
  MapPin,
  Globe,
  Hash,
  Sparkles,
  Shield,
  Lock,
  Eye,
  EyeOff,
  Crown,
  Image,
  Palette,
  MessageCircle,
  Star,
} from "lucide-react";
import { ImageCropModal } from "@/components/profile/ImageCropModal";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { recordClientError } from "@/utils/clientErrorLog";

interface ProfileData {
  id: string;
  app_uid: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  bio: string | null;
  age: number | null;
  gender: string | null;
  country_name: string | null;
  country_code: string | null;
  country_flag: string | null;
  is_host?: boolean;
  host_status?: string | null;
  hide_location?: boolean;
}

const EditProfile = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Form states
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [age, setAge] = useState<number | null>(null);
  const [gender, setGender] = useState("");
  const [language, setLanguage] = useState("English");
  const [secondLanguage, setSecondLanguage] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [phone, setPhone] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [hideLocation, setHideLocation] = useState(false);

  // Modals
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [phoneVerifying, setPhoneVerifying] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkPassword, setLinkPassword] = useState("");
  const [showLinkPassword, setShowLinkPassword] = useState(false);
  const [emailLinking, setEmailLinking] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [showCropModal, setShowCropModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const { getCachedUser } = await import('@/utils/cachedAuth');
      const user = await getCachedUser();
      if (!user) {
        navigate("/auth");
        return;
      }

      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData);
        setDisplayName(profileData.display_name || "");
        setBio(profileData.bio || "");
        setAge(profileData.age);
        setGender(profileData.gender || "");
        setTags((profileData as any).tags || []);
        setHideLocation(profileData.hide_location || false);
      }

      setUserEmail(user.email || "");
      setPhone((user as any).phone || "");
      setLoading(false);
    };

    fetchProfile();
  }, [navigate]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !profile) return;

    if (!file.type.startsWith("image/")) {
      sonnerToast.error("Only images can be uploaded");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      sonnerToast.error("Image must be less than 10MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImage(e.target?.result as string);
      setShowCropModal(true);
    };
    reader.readAsDataURL(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleCropComplete = async (croppedImage: Blob, _filter: string) => {
    if (!profile) return;
    
    setShowCropModal(false);
    setUploading(true);

    try {
      const fileName = `${profile.id}/${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, croppedImage, { 
          upsert: true,
          contentType: "image/jpeg"
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", profile.id);

      if (updateError) throw updateError;

      setProfile({ ...profile, avatar_url: publicUrl });
      sonnerToast.success("Profile picture updated!");
    } catch (error) {
      console.error("Upload error:", error);
      recordClientError({ label: "EditProfile.fileName", message: error instanceof Error ? error.message : String(error) });
      sonnerToast.error("Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!profile) {
      sonnerToast.error("Profile not loaded");
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      sonnerToast.error("Please login");
      navigate("/auth");
      return;
    }

    if (user.id !== profile.id) {
      sonnerToast.error("Cannot update another user's profile");
      return;
    }

    setSaving(true);

    try {
      const updateData: Record<string, any> = {};

      if (displayName.trim()) {
        updateData.display_name = displayName.trim();
      }
      
      updateData.bio = bio.trim() || null;
      
      if (age && age >= 18 && age <= 100) {
        updateData.age = age;
      }

      if (gender && gender.toLowerCase() !== profile.gender?.toLowerCase()) {
        updateData.gender = gender.toLowerCase();
        // Note: is_host, host_status, is_face_verified are set automatically
        // by the auto_convert_account_by_gender database trigger (SECURITY DEFINER)
      }

      const { data, error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", user.id)
        .select()
        .single();

      if (error) throw error;
      
      if (data) {
        setProfile(data as ProfileData);
      }
      
      if (gender.toLowerCase() === "female" && profile.gender?.toLowerCase() !== "female") {
        sonnerToast.success("🎉 Profile updated! You are now a host.");
      } else {
        sonnerToast.success("✅ Profile saved!");
      }
    } catch (error: any) {
      console.error("Save error:", error);
      recordClientError({ label: "EditProfile.updateData", message: error instanceof Error ? error.message : String(error) });
      sonnerToast.error(error.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handlePhoneUpdate = async () => {
    if (!newPhone) {
      sonnerToast.error("Enter phone number");
      return;
    }
    
    setPhoneVerifying(true);
    try {
      const { error } = await supabase.auth.updateUser({ phone: newPhone });
      if (error) throw error;
      
      setPhone(newPhone);
      setShowPhoneModal(false);
      setNewPhone("");
      sonnerToast.success("Phone number updated!");
    } catch (error: any) {
      sonnerToast.error(error.message || "Phone update failed");
    } finally {
      setPhoneVerifying(false);
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      sonnerToast.error("Passwords do not match");
      return;
    }
    
    if (newPassword.length < 6) {
      sonnerToast.error("Password must be at least 6 characters");
      return;
    }
    
    setPasswordSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      
      setShowPasswordModal(false);
      setNewPassword("");
      setConfirmPassword("");
      sonnerToast.success("Password changed!");
    } catch (error: any) {
      sonnerToast.error(error.message || "Password change failed");
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleEmailLinking = async () => {
    if (!linkEmail.trim() || !linkPassword.trim()) {
      sonnerToast.error("Enter email and password");
      return;
    }
    
    if (linkPassword.length < 6) {
      sonnerToast.error("Password must be at least 6 characters");
      return;
    }
    
    setEmailLinking(true);
    try {
      const { error } = await supabase.auth.updateUser({
        email: linkEmail,
        password: linkPassword
      });
      
      if (error) throw error;
      
      setUserEmail(linkEmail);
      setHasPassword(true);
      setShowEmailModal(false);
      setLinkEmail("");
      setLinkPassword("");
      sonnerToast.success("Email and password set!");
    } catch (error: any) {
      sonnerToast.error(error.message || "Email linking failed");
    } finally {
      setEmailLinking(false);
    }
  };

  const copyId = () => {
    if (profile?.app_uid) {
      navigator.clipboard.writeText(profile.app_uid);
      sonnerToast.success("ID copied!");
    }
  };

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-gradient-to-b from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF] overflow-hidden">
      {/* Premium Dark Header */}
      <div 
        className="relative shrink-0 z-50"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-amber-50/90 via-white/95 to-pink-50/90 backdrop-blur-xl" />
        <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />
        <div className="relative flex items-center justify-between px-4 h-14">
          <button
            onClick={() => navigate(-1)}
            className="w-10 h-10 rounded-xl bg-white/80 border border-amber-200/60 flex items-center justify-center active:scale-95 transition-transform shadow-sm"
          >
            <ArrowLeft className="w-5 h-5 text-heading" />
          </button>
          <h1 className="text-lg font-bold text-heading">My Profile</h1>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 h-10 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-on-dark font-semibold text-sm flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
          >
            {saving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : "Save"}
          </button>
        </div>
      </div>

      {/* Scrollable Content */}
      <div 
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ 
          paddingBottom: 'var(--content-bottom-padding)',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {/* Avatar Hero Section */}
        <div className="relative pt-6 pb-8 px-4">
          <div className="absolute inset-0 bg-gradient-to-b from-amber-100/40 via-transparent to-transparent" />
          <div className="relative flex flex-col items-center">
            <div className="relative">
              <label className="cursor-pointer block">
                <div className="relative">
                  {/* Outer glow ring */}
                  <div className="absolute -inset-1 bg-gradient-to-r from-purple-600 via-pink-500 to-purple-600 rounded-full opacity-75 blur-sm animate-pulse" />
                  <Avatar className="relative w-28 h-28 ring-4 ring-amber-200 shadow-2xl">
                    <AvatarImage src={profile?.avatar_url || undefined} className="object-cover" />
                    <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-on-dark text-3xl font-bold">
                      {displayName?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  {/* Camera button */}
                  <div className="absolute bottom-0 right-0 w-9 h-9 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full flex items-center justify-center shadow-lg border-2 border-amber-200">
                    {uploading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4 text-heading" />
                    )}
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={uploading}
                />
              </label>
            </div>
            <h2 className="mt-4 text-xl font-bold text-heading">{displayName || "Set Nickname"}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-body">ID: {profile?.app_uid || "N/A"}</span>
              <button onClick={copyId} className="p-1 hover:bg-amber-100 rounded transition-colors">
                <Copy className="w-3.5 h-3.5 text-purple-400" />
              </button>
            </div>
            {profile?.is_host && (
              <div className="mt-3 flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-amber-600/20 to-orange-600/20 border border-amber-300/60 rounded-full">
                <Crown className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xs font-semibold text-amber-400">Host Account</span>
              </div>
            )}
          </div>
        </div>

        {/* Profile Settings */}
        <div className="px-4 space-y-4">
          {/* Basic Info Card */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl border border-amber-200/40 overflow-hidden">
            {/* My Avatar */}
            <label className="flex items-center justify-between px-4 py-4 border-b border-amber-200/40 active:bg-amber-50/70 cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                  <Camera className="w-5 h-5 text-purple-600" />
                </div>
                <span className="font-medium text-heading">My Avatar</span>
              </div>
              <div className="flex items-center gap-3">
                <Avatar className="w-9 h-9 ring-2 ring-purple-500/30">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-600 text-on-dark text-xs">
                    {displayName?.charAt(0) || "U"}
                  </AvatarFallback>
                </Avatar>
                <ChevronRight className="w-5 h-5 text-body" />
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileSelect}
                disabled={uploading}
              />
            </label>

            {/* My Poster */}
            <button
              onClick={() => navigate("/my-poster")}
              className="w-full flex items-center justify-between px-4 py-4 border-b border-amber-200/40 active:bg-amber-50/70"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-fuchsia-100 flex items-center justify-center">
                  <Image className="w-5 h-5 text-fuchsia-600" />
                </div>
                <span className="font-medium text-heading">My Poster</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-body">Upload photos</span>
                <ChevronRight className="w-5 h-5 text-body" />
              </div>
            </button>

            {/* ID */}
            <button
              onClick={copyId}
              className="w-full flex items-center justify-between px-4 py-4 border-b border-amber-200/40 active:bg-amber-50/70"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600/30 to-cyan-600/30 flex items-center justify-center">
                  <Hash className="w-5 h-5 text-blue-400" />
                </div>
                <span className="font-medium text-heading">ID</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-body font-mono">{profile?.app_uid || "N/A"}</span>
                <div className="px-3 py-1.5 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full">
                  <span className="text-xs font-semibold text-heading">Copy</span>
                </div>
              </div>
            </button>

            {/* Nickname */}
            <Sheet>
              <SheetTrigger asChild>
                <button className="w-full flex items-center justify-between px-4 py-4 border-b border-amber-200/40 active:bg-amber-50/70">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600/30 to-purple-600/30 flex items-center justify-center">
                      <User className="w-5 h-5 text-violet-400" />
                    </div>
                    <span className="font-medium text-heading">Nickname</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-body truncate max-w-[120px]">{displayName || "Set nickname"}</span>
                    <ChevronRight className="w-5 h-5 text-body" />
                  </div>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="bg-white border-t border-amber-200/40 rounded-t-3xl">
                <SheetHeader>
                  <SheetTitle className="text-heading text-center">Edit Nickname</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <Input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your nickname"
                    maxLength={20}
                    className="h-12 rounded-xl bg-white border-amber-200/60 text-heading placeholder:text-slate-600"
                  />
                  <p className="text-xs text-body text-center">{displayName.length}/20 characters</p>
                  <Button 
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90" 
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            {/* Gender - Only show edit option if not already set */}
            {profile?.gender && profile.gender.toLowerCase() !== "other" ? (
              // Gender already selected - show as read-only
              <div className="w-full flex items-center justify-between px-4 py-4 border-b border-amber-200/40">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-600/30 to-pink-600/30 flex items-center justify-center">
                    <User className="w-5 h-5 text-rose-400" />
                  </div>
                  <span className="font-medium text-heading">Gender</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${profile.gender.toLowerCase() === "female" ? "text-pink-400" : "text-blue-400"}`}>
                    {profile.gender.toLowerCase() === "female" ? "👩 Female" : "👨 Male"}
                  </span>
                  <div className="px-2 py-1 bg-white/5 rounded-full">
                    <Lock className="w-3.5 h-3.5 text-body" />
                  </div>
                </div>
              </div>
            ) : (
              // Gender not set - allow selection
              <Sheet>
                <SheetTrigger asChild>
                  <button className="w-full flex items-center justify-between px-4 py-4 border-b border-amber-200/40 active:bg-amber-50/70">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-600/30 to-pink-600/30 flex items-center justify-center">
                        <User className="w-5 h-5 text-rose-400" />
                      </div>
                      <span className="font-medium text-heading">Gender</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-amber-400 animate-pulse">⚠️ Required</span>
                      <ChevronRight className="w-5 h-5 text-body" />
                    </div>
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" className="bg-white border-t border-amber-200/40 rounded-t-3xl">
                  <SheetHeader>
                    <SheetTitle className="text-heading text-center">Select Gender (One-time only)</SheetTitle>
                  </SheetHeader>
                  <p className="text-center text-xs text-amber-400 mt-2">
                    ⚠️ This selection cannot be changed later
                  </p>
                  <div className="mt-6 flex gap-4">
                    <button
                      onClick={async () => {
                        setGender("Male");
                        if (profile) {
                          const { data: { user } } = await supabase.auth.getUser();
                          if (user) {
                            const { data } = await supabase
                              .from("profiles")
                              .update({ gender: "male" })
                              .eq("id", user.id)
                              .select()
                              .single();
                            if (data) setProfile(data as ProfileData);
                            localStorage.setItem(`gender_selected_${user.id}`, "true");
                            sonnerToast.success("Gender saved! This cannot be changed.");
                          }
                        }
                      }}
                      className={`flex-1 py-5 rounded-2xl border-2 transition-all ${
                        gender === "Male" 
                          ? "bg-blue-600/20 border-blue-500 text-blue-400" 
                          : "border-amber-200/40 hover:border-amber-200/60 text-muted-pro"
                      }`}
                    >
                      <span className="text-2xl mb-2 block">👨</span>
                      <p className="font-semibold">Male</p>
                      <p className="text-[10px] mt-1 text-body">User Account</p>
                    </button>
                    <button
                      onClick={async () => {
                        setGender("Female");
                        if (profile) {
                          const { data: { user } } = await supabase.auth.getUser();
                          if (user) {
                            const { data } = await supabase
                              .from("profiles")
                              .update({ gender: "female" })
                              .eq("id", user.id)
                              .select()
                              .single();
                            if (data) setProfile(data as ProfileData);
                            localStorage.setItem(`gender_selected_${user.id}`, "true");
                            sonnerToast.success("🎉 You are now a Host! This cannot be changed.");
                          }
                        }
                      }}
                      className={`flex-1 py-5 rounded-2xl border-2 transition-all ${
                        gender === "Female" 
                          ? "bg-pink-600/20 border-pink-500 text-pink-400" 
                          : "border-amber-200/40 hover:border-amber-200/60 text-muted-pro"
                      }`}
                    >
                      <span className="text-2xl mb-2 block">👩</span>
                      <p className="font-semibold">Female</p>
                      <p className="text-[10px] mt-1 text-amber-400 flex items-center justify-center gap-1">
                        <Crown className="w-3 h-3" /> Host Account
                      </p>
                    </button>
                  </div>
                  <p className="text-center text-xs text-body mt-4">
                    Selecting Female will automatically convert to Host account
                  </p>
                </SheetContent>
              </Sheet>
            )}

            {/* Age */}
            <Sheet>
              <SheetTrigger asChild>
                <button className="w-full flex items-center justify-between px-4 py-4 border-b border-amber-200/40 active:bg-amber-50/70">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600/30 to-orange-600/30 flex items-center justify-center">
                      <Star className="w-5 h-5 text-amber-400" />
                    </div>
                    <span className="font-medium text-heading">Age</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-body">{age || "Not set"}</span>
                    <ChevronRight className="w-5 h-5 text-body" />
                  </div>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="bg-white border-t border-amber-200/40 rounded-t-3xl">
                <SheetHeader>
                  <SheetTitle className="text-heading text-center">Enter Age</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <Input
                    type="number"
                    value={age || ""}
                    onChange={(e) => setAge(parseInt(e.target.value) || null)}
                    placeholder="Enter your age"
                    min={18}
                    max={100}
                    className="h-14 rounded-xl bg-white border-amber-200/60 text-heading text-center text-2xl placeholder:text-slate-600"
                  />
                  <Button 
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90" 
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            {/* Region */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-amber-200/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600/30 to-green-600/30 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-emerald-400" />
                </div>
                <span className="font-medium text-heading">Region</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-body">
                  {profile?.country_flag || "🌍"} {profile?.country_name || "Unknown"}
                </span>
                <ChevronRight className="w-5 h-5 text-body" />
              </div>
            </div>

            {/* Hide Location Toggle */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-amber-200/40">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600/30 to-orange-600/30 flex items-center justify-center">
                  {hideLocation ? (
                    <EyeOff className="w-5 h-5 text-red-400" />
                  ) : (
                    <Eye className="w-5 h-5 text-orange-400" />
                  )}
                </div>
                <div>
                  <span className="font-medium text-heading">Hide Location</span>
                  <p className="text-xs text-body mt-0.5">Others won't see your location</p>
                </div>
              </div>
              <Switch
                checked={hideLocation}
                onCheckedChange={async (checked) => {
                  setHideLocation(checked);
                  if (profile) {
                    try {
                      const { error } = await supabase
                        .from("profiles")
                        .update({ hide_location: checked })
                        .eq("id", profile.id);
                      
                      if (error) throw error;
                      sonnerToast.success(checked ? "Location hidden" : "Location visible");
                    } catch (error) {
                      setHideLocation(!checked);
                      sonnerToast.error("Update failed");
                    }
                  }
                }}
                className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-purple-600 data-[state=checked]:to-pink-600"
              />
            </div>

            {/* Language */}
            <Sheet>
              <SheetTrigger asChild>
                <button className="w-full flex items-center justify-between px-4 py-4 border-b border-amber-200/40 active:bg-amber-50/70">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-600/30 to-blue-600/30 flex items-center justify-center">
                      <Globe className="w-5 h-5 text-cyan-400" />
                    </div>
                    <span className="font-medium text-heading">Language</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-purple-400">{language}</span>
                    <ChevronRight className="w-5 h-5 text-body" />
                  </div>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="bg-white border-t border-amber-200/40 rounded-t-3xl">
                <SheetHeader>
                  <SheetTitle className="text-heading text-center">Select Language</SheetTitle>
                </SheetHeader>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  {["Bengali", "English", "Hindi", "Arabic", "Spanish", "Chinese"].map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setLanguage(lang)}
                      className={`py-3.5 rounded-xl font-semibold text-sm transition-all ${
                        language === lang 
                          ? "bg-gradient-to-r from-purple-600 to-pink-600 text-on-dark shadow-lg shadow-purple-500/25" 
                          : "bg-slate-100 text-heading hover:bg-slate-200 border border-amber-200/40"
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </SheetContent>
            </Sheet>

            {/* Second Language */}
            <Sheet>
              <SheetTrigger asChild>
                <button className="w-full flex items-center justify-between px-4 py-4 border-b border-amber-200/40 active:bg-amber-50/70">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600/30 to-violet-600/30 flex items-center justify-center">
                      <Globe className="w-5 h-5 text-purple-400" />
                    </div>
                    <span className="font-medium text-heading">Second Language</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-purple-400">{secondLanguage || "None"}</span>
                    <ChevronRight className="w-5 h-5 text-body" />
                  </div>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="bg-white border-t border-amber-200/40 rounded-t-3xl">
                <SheetHeader>
                  <SheetTitle className="text-heading text-center">Select Second Language</SheetTitle>
                </SheetHeader>
                <div className="mt-6 grid grid-cols-2 gap-3 max-h-[50vh] overflow-y-auto pb-4">
                  <button
                    onClick={() => setSecondLanguage("")}
                    className={`py-3.5 rounded-xl font-semibold text-sm transition-all ${
                      !secondLanguage 
                        ? "bg-gradient-to-r from-purple-600 to-pink-600 text-on-dark shadow-lg shadow-purple-500/25" 
                        : "bg-slate-100 text-heading hover:bg-slate-200 border border-amber-200/40"
                    }`}
                  >
                    None
                  </button>
                  {["Bengali", "English", "Hindi", "Arabic", "Spanish", "Chinese", "Japanese"].map((lang) => (
                    <button
                      key={lang}
                      onClick={() => setSecondLanguage(lang)}
                      className={`py-3.5 rounded-xl font-semibold text-sm transition-all ${
                        secondLanguage === lang 
                          ? "bg-gradient-to-r from-purple-600 to-pink-600 text-on-dark shadow-lg shadow-purple-500/25" 
                          : "bg-slate-100 text-heading hover:bg-slate-200 border border-amber-200/40"
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              </SheetContent>
            </Sheet>

            {/* Tags */}
            <button
              onClick={() => navigate("/tags")}
              className="w-full flex items-center justify-between px-4 py-4 border-b border-amber-200/40 active:bg-amber-50/70"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600/30 to-violet-600/30 flex items-center justify-center">
                  <Hash className="w-5 h-5 text-indigo-400" />
                </div>
                <span className="font-medium text-heading">Tags</span>
              </div>
              <div className="flex items-center gap-2">
                {tags.length > 0 ? (
                  <div className="flex gap-1">
                    {tags.slice(0, 2).map(tag => (
                      <span key={tag} className="text-xs font-semibold bg-gradient-to-r from-pink-500 to-rose-500 text-white px-2.5 py-0.5 rounded-full shadow-sm">{tag}</span>
                    ))}
                    {tags.length > 2 && <span className="text-xs text-body">+{tags.length - 2}</span>}
                  </div>
                ) : (
                  <span className="text-sm text-body">Add tags</span>
                )}
                <ChevronRight className="w-5 h-5 text-body" />
              </div>
            </button>

            {/* Bio */}
            <Sheet>
              <SheetTrigger asChild>
                <button className="w-full flex items-center justify-between px-4 py-4 border-b border-amber-200/40 active:bg-amber-50/70">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-teal-600/30 to-emerald-600/30 flex items-center justify-center">
                      <MessageCircle className="w-5 h-5 text-teal-400" />
                    </div>
                    <span className="font-medium text-heading">Self-introduction</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-body truncate max-w-[100px]">
                      {bio ? bio.slice(0, 15) + "..." : "Write about..."}
                    </span>
                    <ChevronRight className="w-5 h-5 text-body" />
                  </div>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="bg-white border-t border-amber-200/40 rounded-t-3xl h-[400px]">
                <SheetHeader>
                  <SheetTitle className="text-heading text-center">Self-introduction</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-4">
                  <Textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Write something about yourself..."
                    maxLength={200}
                    rows={5}
                    className="rounded-xl bg-white border-amber-200/60 text-heading placeholder:text-slate-600 resize-none"
                  />
                  <p className="text-xs text-body text-center">{bio.length}/200 characters</p>
                  <Button 
                    className="w-full h-12 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90" 
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Save"}
                  </Button>
                </div>
              </SheetContent>
            </Sheet>

            {/* Cosmetics */}
            <button 
              onClick={() => navigate("/level")}
              className="w-full flex items-center justify-between px-4 py-4 active:bg-amber-50/70"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-600/30 to-yellow-600/30 flex items-center justify-center">
                  <Palette className="w-5 h-5 text-amber-400" />
                </div>
                <span className="font-medium text-heading">Cosmetics</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
                  <Sparkles className="w-4 h-4 text-heading" />
                </div>
                <ChevronRight className="w-5 h-5 text-body" />
              </div>
            </button>
          </div>

          {/* Account Recovery Section */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl border border-amber-200/40 overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-purple-900/30 to-pink-900/30 border-b border-amber-200/40">
              <p className="text-xs font-semibold text-purple-400 uppercase tracking-wider">
                Account Recovery
              </p>
            </div>
            
            {/* Email */}
            <button 
              onClick={() => setShowEmailModal(true)}
              className="w-full flex items-center justify-between px-4 py-4 border-b border-amber-200/40 active:bg-amber-50/70"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600/30 to-indigo-600/30 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-blue-400" />
                </div>
                <span className="font-medium text-heading">Email</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-body truncate max-w-[140px]">
                  {userEmail || "Add email"}
                </span>
                <ChevronRight className="w-5 h-5 text-body" />
              </div>
            </button>

            {/* Phone */}
            <button 
              onClick={() => setShowPhoneModal(true)}
              className="w-full flex items-center justify-between px-4 py-4 active:bg-amber-50/70"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-600/30 to-emerald-600/30 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-green-400" />
                </div>
                <span className="font-medium text-heading">Phone</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-body">
                  {phone ? phone.replace(/(\d{3})(\d{4})(\d+)/, "$1****$3") : "Add phone"}
                </span>
                <ChevronRight className="w-5 h-5 text-body" />
              </div>
            </button>
          </div>

          {/* Account Security Section */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl border border-amber-200/40 overflow-hidden">
            <div className="px-4 py-3 bg-gradient-to-r from-blue-900/30 to-indigo-900/30 border-b border-amber-200/40">
              <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">
                Account Security
              </p>
            </div>
            
            <button 
              onClick={() => setShowPasswordModal(true)}
              className="w-full flex items-center justify-between px-4 py-4 active:bg-amber-50/70"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600/30 to-purple-600/30 flex items-center justify-center">
                  <Lock className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="text-left">
                  <span className="font-medium text-heading block">Change Password</span>
                  <span className="text-xs text-body">Secure your account</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-body" />
            </button>
          </div>

          {/* Security Notice Banner */}
          <div className="relative overflow-hidden rounded-2xl p-5">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 via-pink-600/20 to-purple-600/20" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/50" />
            <div className="absolute -inset-1 bg-gradient-to-r from-purple-500 via-pink-500 to-purple-500 opacity-20 blur-xl" />
            <div className="relative flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center backdrop-blur-sm border border-white/20 shadow-lg">
                <Shield className="w-7 h-7 text-white" />
              </div>
              <div className="flex-1">
                <p className="font-bold text-white text-lg drop-shadow">Keep Your Account Safe</p>
                <p className="text-white/90 text-sm mt-0.5 drop-shadow">
                  Add phone & password for better security
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Phone Modal */}
      <Dialog open={showPhoneModal} onOpenChange={setShowPhoneModal}>
        <DialogContent className="bg-white border border-amber-200/40 rounded-2xl max-w-[90vw] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-heading text-center flex items-center justify-center gap-2">
              <Phone className="w-5 h-5 text-green-400" />
              Add Phone Number
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label className="text-sm text-heading">Phone Number</Label>
              <Input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+880 1XXXXXXXXX"
                className="mt-2 h-12 rounded-xl bg-white border-amber-200/60 text-heading placeholder:text-slate-600"
              />
            </div>
            <Button 
              onClick={handlePhoneUpdate}
              disabled={phoneVerifying}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 hover:opacity-90"
            >
              {phoneVerifying ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : "Save Phone Number"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Password Modal */}
      <Dialog open={showPasswordModal} onOpenChange={setShowPasswordModal}>
        <DialogContent className="bg-white border border-amber-200/40 rounded-2xl max-w-[90vw] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-heading text-center flex items-center justify-center gap-2">
              <Lock className="w-5 h-5 text-indigo-400" />
              Change Password
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label className="text-sm text-heading">New Password</Label>
              <div className="relative mt-2">
                <Input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="h-12 rounded-xl bg-white border-amber-200/60 text-heading placeholder:text-slate-600 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showNewPassword ? <EyeOff className="w-5 h-5 text-body" /> : <Eye className="w-5 h-5 text-body" />}
                </button>
              </div>
            </div>
            <div>
              <Label className="text-sm text-heading">Confirm Password</Label>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="mt-2 h-12 rounded-xl bg-white border-amber-200/60 text-heading placeholder:text-slate-600"
              />
            </div>
            <Button 
              onClick={handlePasswordChange}
              disabled={passwordSaving}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90"
            >
              {passwordSaving ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : "Change Password"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Modal */}
      <Dialog open={showEmailModal} onOpenChange={setShowEmailModal}>
        <DialogContent className="bg-white border border-amber-200/40 rounded-2xl max-w-[90vw] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-heading text-center flex items-center justify-center gap-2">
              <Mail className="w-5 h-5 text-blue-400" />
              Link Email Account
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div>
              <Label className="text-sm text-heading">Email Address</Label>
              <Input
                type="email"
                value={linkEmail}
                onChange={(e) => setLinkEmail(e.target.value)}
                placeholder="your@email.com"
                className="mt-2 h-12 rounded-xl bg-white border-amber-200/60 text-heading placeholder:text-slate-600"
              />
            </div>
            <div>
              <Label className="text-sm text-heading">Set Password</Label>
              <div className="relative mt-2">
                <Input
                  type={showLinkPassword ? "text" : "password"}
                  value={linkPassword}
                  onChange={(e) => setLinkPassword(e.target.value)}
                  placeholder="Create a password"
                  className="h-12 rounded-xl bg-white border-amber-200/60 text-heading placeholder:text-slate-600 pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowLinkPassword(!showLinkPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showLinkPassword ? <EyeOff className="w-5 h-5 text-body" /> : <Eye className="w-5 h-5 text-body" />}
                </button>
              </div>
            </div>
            <Button 
              onClick={handleEmailLinking}
              disabled={emailLinking}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:opacity-90"
            >
              {emailLinking ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : "Link Email & Set Password"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Image Crop Modal */}
      {showCropModal && (
        <ImageCropModal
          isOpen={showCropModal}
          onClose={() => setShowCropModal(false)}
          imageSrc={selectedImage}
          onComplete={handleCropComplete}
        />
      )}
    </div>
  );
};

export default EditProfile;
