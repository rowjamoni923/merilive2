import { useState, useEffect, useRef } from "react";
import useAdminRealtime from "@/hooks/useAdminRealtime";
import { motion } from "framer-motion";
import { 
  Image, 
  Video, 
  Upload, 
  Save, 
  Eye,
  Type,
  Sparkles,
  RefreshCw,
  Check,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface BrandingSettings {
  id: string;
  logo_text_primary: string;
  logo_text_secondary: string;
  tagline: string;
  background_type: 'image' | 'video';
  background_url: string;
  logo_image_url: string | null;
}

export default function AdminBranding() {
  const [settings, setSettings] = useState<BrandingSettings>({
    id: 'default',
    logo_text_primary: 'meri',
    logo_text_secondary: 'LIVE',
    tagline: 'Connect • Chat • Share',
    background_type: 'image',
    background_url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800',
    logo_image_url: null
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  
  const logoInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  useAdminRealtime(['branding_settings'], () => fetchSettings());

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('branding_settings')
        .select('*')
        .eq('id', 'default')
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setSettings(data as BrandingSettings);
      }
    } catch (error) {
      console.error("Error fetching branding settings:", error);
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (file: File, type: 'logo' | 'background') => {
    if (!file) return;

    // Validate file type
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    
    if (type === 'background' && !isVideo && !isImage) {
      toast.error("Please upload an image or video only");
      return;
    }
    
    if (type === 'logo' && !isImage) {
      toast.error("Please upload an image only");
      return;
    }

    // File size check (50MB for video, 5MB for image)
    const maxSize = isVideo ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error(`File size cannot exceed ${isVideo ? '50MB' : '5MB'}`);
      return;
    }

    setUploading(type);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${type}-${Date.now()}.${fileExt}`;
      
      const { data, error } = await supabase.storage
        .from('branding')
        .upload(fileName, file, {
          upsert: true,
          contentType: file.type
        });

      if (error) throw error;

      const { data: urlData } = supabase.storage
        .from('branding')
        .getPublicUrl(fileName);

      if (type === 'logo') {
        setSettings(prev => ({
          ...prev,
          logo_image_url: urlData.publicUrl
        }));
      } else {
        setSettings(prev => ({
          ...prev,
          background_url: urlData.publicUrl,
          background_type: isVideo ? 'video' : 'image'
        }));
      }

      toast.success("Upload successful");
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('branding_settings')
        .upsert({
          id: 'default',
          logo_text_primary: settings.logo_text_primary,
          logo_text_secondary: settings.logo_text_secondary,
          tagline: settings.tagline,
          background_type: settings.background_type,
          background_url: settings.background_url,
          logo_image_url: settings.logo_image_url,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;

      toast.success("Settings saved!");
    } catch (error) {
      console.error("Save error:", error);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const removeLogo = () => {
    setSettings(prev => ({
      ...prev,
      logo_image_url: null
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Login Page Branding
          </h1>
          <p className="text-muted-foreground mt-1">
            Customize logo, text and background for the login page
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setShowPreview(!showPreview)}
          >
            <Eye className="w-4 h-4 mr-2" />
            Preview
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Settings Panel */}
        <div className="space-y-6">
          {/* Logo Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Type className="w-5 h-5" />
                Logo Settings
              </CardTitle>
              <CardDescription>
                Upload a logo image or use text logo
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Logo Image Upload */}
              <div className="space-y-2">
                <Label>Logo Image (Optional)</Label>
                <div className="flex items-center gap-4">
                  {settings.logo_image_url ? (
                    <div className="relative">
                      <img 
                        src={settings.logo_image_url} 
                        alt="Logo" 
                        className="w-20 h-20 object-contain rounded-lg border bg-muted"
                      />
                      <button
                        onClick={removeLogo}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 border-2 border-dashed rounded-lg flex items-center justify-center text-muted-foreground">
                      <Image className="w-8 h-8" />
                    </div>
                  )}
                  <div>
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'logo')}
                    />
                    <Button
                      variant="outline"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploading === 'logo'}
                    >
                      {uploading === 'logo' ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      Upload
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG (Max 5MB)</p>
                  </div>
                </div>
              </div>

              {/* Text Logo Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Primary Text</Label>
                  <Input
                    value={settings.logo_text_primary}
                    onChange={(e) => setSettings(prev => ({ ...prev, logo_text_primary: e.target.value }))}
                    placeholder="meri"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Secondary Text</Label>
                  <Input
                    value={settings.logo_text_secondary}
                    onChange={(e) => setSettings(prev => ({ ...prev, logo_text_secondary: e.target.value }))}
                    placeholder="LIVE"
                  />
                </div>
              </div>

              {/* Tagline */}
              <div className="space-y-2">
                <Label>Tagline</Label>
                <Input
                  value={settings.tagline}
                  onChange={(e) => setSettings(prev => ({ ...prev, tagline: e.target.value }))}
                  placeholder="Connect • Chat • Share"
                />
              </div>
            </CardContent>
          </Card>

          {/* Background Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Video className="w-5 h-5" />
                Background Settings
              </CardTitle>
              <CardDescription>
                Set an image or video as the background
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Background Type */}
              <div className="space-y-2">
                <Label>Background Type</Label>
                <RadioGroup
                  value={settings.background_type}
                  onValueChange={(v) => setSettings(prev => ({ ...prev, background_type: v as 'image' | 'video' }))}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="image" id="bg-image" />
                    <Label htmlFor="bg-image" className="flex items-center gap-1 cursor-pointer">
                      <Image className="w-4 h-4" /> Image
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="video" id="bg-video" />
                    <Label htmlFor="bg-video" className="flex items-center gap-1 cursor-pointer">
                      <Video className="w-4 h-4" /> Video
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Background Upload */}
              <div className="space-y-2">
                <Label>Background Upload</Label>
                <div className="space-y-3">
                  {settings.background_url && (
                    <div className="relative rounded-lg overflow-hidden border aspect-video bg-muted">
                      {settings.background_type === 'video' ? (
                        <video
                          src={settings.background_url}
                          className="w-full h-full object-cover"
                          muted
                          loop
                          autoPlay
                          playsInline
                        />
                      ) : (
                        <img
                          src={settings.background_url}
                          alt="Background"
                          className="w-full h-full object-cover"
                        />
                      )}
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <input
                      ref={backgroundInputRef}
                      type="file"
                      accept={settings.background_type === 'video' ? 'video/*' : 'image/*'}
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], 'background')}
                    />
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => backgroundInputRef.current?.click()}
                      disabled={uploading === 'background'}
                    >
                      {uploading === 'background' ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      {settings.background_type === 'video' ? 'Upload Video' : 'Upload Image'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {settings.background_type === 'video' 
                      ? 'MP4, WebM (Max 50MB) - Video will autoplay on mobile'
                      : 'PNG, JPG, WebP (Max 5MB)'}
                  </p>
                </div>
              </div>

              {/* URL Input */}
              <div className="space-y-2">
                <Label>Or enter URL</Label>
                <Input
                  value={settings.background_url}
                  onChange={(e) => setSettings(prev => ({ ...prev, background_url: e.target.value }))}
                  placeholder="https://..."
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview Panel */}
        <Card className="lg:sticky lg:top-6 h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5" />
              Live Preview
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative aspect-[9/16] max-h-[600px] rounded-2xl overflow-hidden shadow-2xl border">
              {/* Background */}
              {settings.background_type === 'video' ? (
                <video
                  src={settings.background_url}
                  className="absolute inset-0 w-full h-full object-cover"
                  muted
                  loop
                  autoPlay
                  playsInline
                />
              ) : (
                <div
                  className="absolute inset-0 bg-cover bg-center"
                  style={{ backgroundImage: `url('${settings.background_url}')` }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />

              {/* Content */}
              <div className="relative h-full flex flex-col justify-between p-6">
                {/* Logo */}
                <div className="pt-8 flex flex-col items-center">
                  {settings.logo_image_url ? (
                    <img 
                      src={settings.logo_image_url} 
                      alt="Logo" 
                      className="w-32 h-32 object-contain"
                    />
                  ) : (
                    <div className="flex flex-col items-center">
                      {/* Premium Primary Text */}
                      <div className="relative">
                        <h1 
                          className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-white to-gray-400 text-center uppercase tracking-[0.2em]"
                          style={{ 
                            fontFamily: 'Georgia, serif',
                            textShadow: '0 4px 20px rgba(255,255,255,0.3), 0 0 40px rgba(255,255,255,0.1)',
                            WebkitTextStroke: '0.5px rgba(255,255,255,0.3)'
                          }}
                        >
                          {settings.logo_text_primary}
                        </h1>
                        {/* Decorative diamond accents */}
                        <span className="absolute -left-4 top-1/2 -translate-y-1/2 text-white/60 text-xs">◆</span>
                        <span className="absolute -right-4 top-1/2 -translate-y-1/2 text-white/60 text-xs">◆</span>
                      </div>
                      
                      {/* Elegant Divider */}
                      <div className="flex items-center gap-3 my-2">
                        <div className="h-[1px] w-8 bg-gradient-to-r from-transparent via-white/60 to-white/60" />
                        <span className="text-white/80 text-[10px] tracking-[0.3em]">★</span>
                        <div className="h-[1px] w-8 bg-gradient-to-l from-transparent via-white/60 to-white/60" />
                      </div>
                      
                      {/* Premium Secondary Text */}
                      <h2 
                        className="text-2xl font-light text-white/90 tracking-[0.5em] uppercase"
                        style={{ 
                          fontFamily: 'Georgia, serif',
                          textShadow: '0 2px 10px rgba(255,255,255,0.2)'
                        }}
                      >
                        {settings.logo_text_secondary}
                      </h2>
                    </div>
                  )}
                  
                  {/* Elegant Tagline */}
                  <p 
                    className="text-white/50 text-[10px] mt-4 tracking-[0.4em] uppercase font-light"
                    style={{ fontFamily: 'Georgia, serif' }}
                  >
                    {settings.tagline}
                  </p>
                </div>

                {/* Buttons Preview */}
                <div className="space-y-3 pb-4">
                  <div className="bg-white/90 rounded-full py-3 text-center text-gray-700 font-medium">
                    Start
                  </div>
                  <div className="bg-gradient-to-r from-pink-500 to-rose-400 rounded-full py-3 text-center text-white font-medium flex items-center justify-center gap-2">
                    <span className="font-bold">G</span> Google
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
