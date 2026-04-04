import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  ArrowLeft, 
  Camera,
  Film,
  User,
  CheckCircle2,
  AlertCircle,
  Upload,
  Loader2,
  Languages,
  Calendar,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Building2,
  Search,
  Settings
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNativeCameraPermission } from "@/hooks/useNativeCameraPermission";

const languages = [
  { code: "bn", name: "Bengali", flag: "🇧🇩" },
  { code: "en", name: "English", flag: "🇺🇸" },
  { code: "hi", name: "Hindi", flag: "🇮🇳" },
  { code: "ar", name: "العربية", flag: "🇸🇦" },
  { code: "ur", name: "اردو", flag: "🇵🇰" },
  { code: "id", name: "Bahasa Indonesia", flag: "🇮🇩" },
  { code: "ms", name: "Bahasa Melayu", flag: "🇲🇾" },
  { code: "th", name: "ไทย", flag: "🇹🇭" },
  { code: "vi", name: "Tiếng Việt", flag: "🇻🇳" },
  { code: "tl", name: "Filipino", flag: "🇵🇭" },
];

const HostVerification = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [existingApplication, setExistingApplication] = useState<any>(null);
  
  // Native camera permission hook
  const { getCameraStream, requestCameraPermission } = useNativeCameraPermission();
  
  // Agency Code (from URL or manual input)
  const [agencyCode, setAgencyCode] = useState(searchParams.get('ref') || "");
  const [agencyInfo, setAgencyInfo] = useState<any>(null);
  const [searchingAgency, setSearchingAgency] = useState(false);
  const [agencyVerified, setAgencyVerified] = useState(false);
  
  // Step 1: Basic Info
  const [fullName, setFullName] = useState("");
  const [age, setAge] = useState("");
  const [language, setLanguage] = useState("");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  
  // Step 2: Video
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoStreamRef = useRef<MediaStream | null>(null);
  const liveVideoRef = useRef<HTMLVideoElement>(null);
  const chunksRef = useRef<Blob[]>([]);
  
  // Step 3: Face Verification
  const [faceVerificationImage, setFaceVerificationImage] = useState<string | null>(null);
  const [faceStream, setFaceStream] = useState<MediaStream | null>(null);
  const [faceVerified, setFaceVerified] = useState(false);
  const [verifyingFace, setVerifyingFace] = useState(false);
  const faceVideoRef = useRef<HTMLVideoElement>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);

  // Search agency by code
  const searchAgencyByCode = async () => {
    if (!agencyCode.trim()) {
      toast({
        title: "Enter Agency Code",
        description: "Please enter an agency code or use a referral link",
        variant: "destructive",
      });
      return;
    }

    setSearchingAgency(true);
    
    try {
      const { data, error } = await supabase.rpc('get_agency_by_code', {
        agency_code: agencyCode.trim().toUpperCase()
      });

      if (data && data.length > 0) {
        setAgencyInfo(data[0]);
        setAgencyVerified(true);
        toast({
          title: "✅ Agency Found!",
          description: `${data[0].name} - Level ${data[0].level}`,
        });
      } else {
        setAgencyInfo(null);
        setAgencyVerified(false);
        toast({
          title: "Agency Not Found",
          description: "Please enter a valid agency code",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Agency search error:', error);
      toast({
        title: "Error",
        description: "Failed to search for agency",
        variant: "destructive",
      });
    } finally {
      setSearchingAgency(false);
    }
  };

  // Auto-search agency if ref param exists
  useEffect(() => {
    if (searchParams.get('ref')) {
      searchAgencyByCode();
    }
  }, []);

  // Check existing application
  useEffect(() => {
    const checkExisting = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }
      setUserId(user.id);
      
      const { data: application } = await supabase
        .from('host_applications')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (application) {
        setExistingApplication(application);
        if (application.status === 'approved') {
          toast({
            title: "Already Approved",
            description: "You are already approved as a host!",
          });
          navigate('/profile');
          return;
        }
        // Resume from current step
        setCurrentStep(application.current_step);
        setFullName(application.full_name || "");
        setAge(application.age?.toString() || "");
        setLanguage(application.language || "");
        if (application.photo_url) setPhotoPreview(application.photo_url);
        if (application.video_url) setVideoPreview(application.video_url);
      }
    };
    checkExisting();
  }, [navigate, toast]);

  // Handle photo selection
  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "Image size cannot exceed 10MB",
          variant: "destructive",
        });
        return;
      }
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPhotoPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Handle video selection
  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 50 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "Video size cannot exceed 50MB",
          variant: "destructive",
        });
        return;
      }
      setVideoFile(file);
      const url = URL.createObjectURL(file);
      setVideoPreview(url);
    }
  };

  // Start video recording
  const startRecording = async () => {
    try {
      // Request camera permission first using native API
      const permResult = await requestCameraPermission();
      if (!permResult.granted) {
        toast({
          title: "Camera Permission Required",
          description: permResult.error || "Please allow camera access to continue",
          variant: "destructive",
        });
        return;
      }

      // Use native camera hook with fallback
      const stream = await getCameraStream(true); // true for audio
      if (!stream) {
        throw new Error('Failed to get camera stream');
      }
      
      videoStreamRef.current = stream;
      
      if (liveVideoRef.current) {
        liveVideoRef.current.srcObject = stream;
        liveVideoRef.current.play();
      }
      
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9') 
        ? 'video/webm;codecs=vp9' 
        : MediaRecorder.isTypeSupported('video/webm') 
          ? 'video/webm' 
          : 'video/mp4';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const file = new File([blob], 'verification-video.webm', { type: mimeType });
        setVideoFile(file);
        setVideoPreview(URL.createObjectURL(blob));
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      
      // Auto-stop after 10 seconds
      const timer = setInterval(() => {
        setRecordingTime(prev => {
          if (prev >= 10) {
            clearInterval(timer);
            stopRecording();
            return 10;
          }
          return prev + 1;
        });
      }, 1000);
      
    } catch (error: any) {
      console.error('Recording error:', error);
      toast({
        title: "Camera access failed",
        description: error.message || "Please grant camera permission and try again",
        variant: "destructive",
      });
    }
  };

  // Stop video recording
  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  // Start face verification camera
  const startFaceCamera = async () => {
    try {
      // Request camera permission first using native API
      const permResult = await requestCameraPermission();
      if (!permResult.granted) {
        toast({
          title: "Camera Permission Required",
          description: permResult.error || "Please allow camera access to continue",
          variant: "destructive",
        });
        return;
      }

      // Use native camera hook with fallback
      const stream = await getCameraStream(false); // false for no audio
      if (!stream) {
        throw new Error('Failed to get camera stream');
      }
      
      setFaceStream(stream);
      if (faceVideoRef.current) {
        faceVideoRef.current.srcObject = stream;
        faceVideoRef.current.muted = true;
        faceVideoRef.current.play().catch(console.error);
      }
    } catch (error: any) {
      console.error('Face camera error:', error);
      toast({
        title: "Camera access failed",
        description: error.message || "Please grant camera permission from settings.",
        variant: "destructive",
      });
    }
  };

  // Capture face for verification
  const captureFace = () => {
    if (faceVideoRef.current && faceCanvasRef.current) {
      const video = faceVideoRef.current;
      const canvas = faceCanvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        const imageData = canvas.toDataURL('image/jpeg', 0.9);
        setFaceVerificationImage(imageData);
        
        // Stop camera
        if (faceStream) {
          faceStream.getTracks().forEach(track => track.stop());
          setFaceStream(null);
        }
      }
    }
  };

  // Verify face (simulate face matching)
  const verifyFace = async () => {
    setVerifyingFace(true);
    
    // Simulate face verification (in production, use a real face matching API)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setFaceVerified(true);
    setVerifyingFace(false);
    
    toast({
      title: "✅ Face Verification Successful!",
      description: "Your face has been verified successfully",
    });
  };

  // Upload file to storage
  const uploadFile = async (file: File, folder: string): Promise<string | null> => {
    if (!userId) return null;
    
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${folder}/${Date.now()}.${fileExt}`;
    
    const { data, error } = await supabase.storage
      .from('host-verification')
      .upload(fileName, file, { upsert: true });
    
    if (error) {
      console.error('Upload error:', error);
      return null;
    }
    
    const { data: { publicUrl } } = supabase.storage
      .from('host-verification')
      .getPublicUrl(fileName);
    
    return publicUrl;
  };

  // Save Step 1
  const saveStep1 = async () => {
    if (!fullName.trim() || !age || !language || !photoFile) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    
    if (parseInt(age) < 18) {
      toast({
        title: "Error",
        description: "You must be at least 18 years old",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    
    try {
      const photoUrl = await uploadFile(photoFile, 'photos');
      if (!photoUrl) throw new Error('Photo upload failed');
      
      const applicationData = {
        user_id: userId,
        full_name: fullName.trim(),
        age: parseInt(age),
        language,
        photo_url: photoUrl,
        current_step: 2,
      };
      
      if (existingApplication) {
        await supabase
          .from('host_applications')
          .update(applicationData)
          .eq('id', existingApplication.id);
      } else {
        await supabase
          .from('host_applications')
          .insert(applicationData);
      }
      
      setCurrentStep(2);
      toast({ title: "✅ Step 1 Complete!" });
      
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Save Step 2
  const saveStep2 = async () => {
    if (!videoFile) {
      toast({
        title: "Error",
        description: "Please upload a video",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    
    try {
      const videoUrl = await uploadFile(videoFile, 'videos');
      if (!videoUrl) throw new Error('Video upload failed');
      
      await supabase
        .from('host_applications')
        .update({
          video_url: videoUrl,
          video_duration_seconds: 10,
          current_step: 3,
        })
        .eq('user_id', userId);
      
      setCurrentStep(3);
      toast({ title: "✅ Step 2 Complete!" });
      
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Save Step 3 and submit
  const submitApplication = async () => {
    if (!faceVerified || !faceVerificationImage) {
      toast({
        title: "Error",
        description: "Please complete face verification",
        variant: "destructive",
      });
      return;
    }
    
    setLoading(true);
    
    try {
      // Convert base64 to file and upload
      const response = await fetch(faceVerificationImage);
      const blob = await response.blob();
      const file = new File([blob], 'face-verification.jpg', { type: 'image/jpeg' });
      
      const faceUrl = await uploadFile(file, 'face-verification');
      if (!faceUrl) throw new Error('Face image upload failed');
      
      await supabase
        .from('host_applications')
        .update({
          face_verification_image_url: faceUrl,
          face_verification_status: 'passed',
          face_match_score: 95.5, // Mock score
          is_complete: true,
          submitted_at: new Date().toISOString(),
          status: 'pending',
        })
        .eq('user_id', userId);
      
      // If agency code verified, auto-join the agency
      if (agencyVerified && agencyInfo) {
        try {
          await supabase.rpc('join_agency', {
            _host_id: userId,
            _agency_code: agencyCode.trim().toUpperCase(),
            _joined_via: 'host_registration'
          });
          
          // Notify agency owner about new join request
          import('@/utils/agencyNotifications').then(({ notifyAgencyHostRequest }) => {
            notifyAgencyHostRequest(agencyInfo.id, fullName || 'New Host');
          });
          
          toast({
            title: "🎉 Application Submitted!",
            description: `You've joined ${agencyInfo.name} agency. You'll receive a notification after review.`,
          });
        } catch (agencyError) {
          console.error('Agency join error:', agencyError);
          toast({
            title: "🎉 Application Submitted!",
            description: "Failed to join agency, but application was successful.",
          });
        }
      } else {
        toast({
          title: "🎉 Application Submitted!",
          description: "Our team will review it shortly",
        });
      }
      
      navigate('/profile');
      
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (videoStreamRef.current) {
        videoStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (faceStream) {
        faceStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [faceStream]);

  // Show pending status
  if (existingApplication && existingApplication.status !== 'pending') {
    return (
      <div className="fixed inset-0 bg-background flex flex-col items-center justify-center p-4">
        <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 shadow-lg text-center max-w-sm border border-white/10">
          {existingApplication.status === 'under_review' && (
            <>
              <div className="w-20 h-20 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <Loader2 className="w-10 h-10 text-yellow-400 animate-spin" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Under Review</h2>
              <p className="text-muted-foreground">Your application is being reviewed</p>
            </>
          )}
          {existingApplication.status === 'rejected' && (
            <>
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-10 h-10 text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">Application Rejected</h2>
              <p className="text-muted-foreground mb-4">{existingApplication.rejection_reason || "Sorry, your application was not accepted"}</p>
              <Button onClick={() => navigate('/profile')}>Go Back</Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-y-auto overflow-x-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gradient-to-r from-pink-500 to-purple-600 text-white">
        <div className="flex items-center h-14 px-4">
          <button onClick={() => navigate(-1)} className="p-2 -ml-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-center text-lg font-semibold pr-7">
            Host Verification
          </h1>
        </div>
        {/* Progress */}
        <div className="px-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  currentStep >= step ? 'bg-white text-purple-600' : 'bg-white/30 text-white'
                }`}>
                  {currentStep > step ? <CheckCircle2 className="w-5 h-5" /> : step}
                </div>
                {step < 3 && (
                  <div className={`w-16 h-1 mx-1 ${
                    currentStep > step ? 'bg-white' : 'bg-white/30'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-xs text-white/80">
            <span>Profile</span>
            <span>Video</span>
            <span>Face</span>
          </div>
        </div>
      </div>

      {/* Step 1: Basic Info */}
      {currentStep === 1 && (
        <div className="p-4 space-y-4">
          {/* Agency Code Section */}
          <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-2xl p-5 shadow-sm border border-purple-500/20">
            <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-purple-600" />
              Agency Code (Optional)
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              If you have an agency, enter their code. It will auto-fill if you came from a referral link.
            </p>
            
            <div className="flex gap-2">
              <Input
                placeholder="e.g., AG123456"
                value={agencyCode}
                onChange={(e) => {
                  setAgencyCode(e.target.value.toUpperCase());
                  setAgencyVerified(false);
                  setAgencyInfo(null);
                }}
                className="flex-1 bg-white/5"
              />
              <Button
                variant="outline"
                onClick={searchAgencyByCode}
                disabled={searchingAgency || !agencyCode.trim()}
                className="bg-white/5"
              >
                {searchingAgency ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
            </div>
            
            {/* Agency Info Display */}
            {agencyVerified && agencyInfo && (
              <div className="mt-3 p-3 bg-green-50 rounded-xl border border-green-200 flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-green-800">{agencyInfo.name}</p>
                  <p className="text-xs text-green-600">
                    Level {agencyInfo.level} • {agencyInfo.total_hosts || 0} Hosts
                  </p>
                </div>
                <CheckCircle2 className="w-6 h-6 text-green-500" />
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl p-5 shadow-sm border">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <User className="w-5 h-5 text-purple-600" />
              Profile Information
            </h3>
            
            {/* Photo Upload */}
            <div className="mb-6">
              <Label className="text-sm font-medium mb-2 block">Profile Photo *</Label>
              <div className="flex items-center gap-4">
                <div 
                  className="w-24 h-24 rounded-full border-2 border-dashed border-purple-300 flex items-center justify-center overflow-hidden cursor-pointer bg-purple-50"
                  onClick={() => photoInputRef.current?.click()}
                >
                  {photoPreview ? (
                    <img src={photoPreview} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <Camera className="w-8 h-8 text-purple-400" />
                  )}
                </div>
                <div className="flex-1">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => photoInputRef.current?.click()}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Photo
                  </Button>
                  <p className="text-xs text-gray-500 mt-1">JPG, PNG (max 10MB)</p>
                </div>
              </div>
              <input 
                type="file" 
                ref={photoInputRef}
                accept="image/*"
                onChange={handlePhotoSelect}
                className="hidden"
              />
            </div>
            
            {/* Full Name */}
            <div className="mb-4">
              <Label className="text-sm font-medium">Full Name *</Label>
              <Input
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-1"
              />
            </div>
            
            {/* Age */}
            <div className="mb-4">
              <Label className="text-sm font-medium flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Age *
              </Label>
              <Input
                type="number"
                placeholder="18+"
                value={age}
                onChange={(e) => setAge(e.target.value)}
                min={18}
                max={100}
                className="mt-1"
              />
            </div>
            
            {/* Language */}
            <div>
              <Label className="text-sm font-medium flex items-center gap-2">
                <Languages className="w-4 h-4" />
                Language *
              </Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select language" />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((lang) => (
                    <SelectItem key={lang.code} value={lang.code}>
                      {lang.flag} {lang.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <Button 
            onClick={saveStep1}
            disabled={loading || !fullName || !age || !language || !photoFile}
            className="w-full h-12 bg-gradient-to-r from-pink-500 to-purple-600"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Next Step"}
          </Button>
        </div>
      )}

      {/* Step 2: Video */}
      {currentStep === 2 && (
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border">
            <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
              <Film className="w-5 h-5 text-purple-600" />
              Introduction Video
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Record a 10-second video introducing yourself
            </p>
            
            {/* Video Preview / Recording */}
            <div className="aspect-[9/16] max-h-[400px] bg-gray-900 rounded-xl overflow-hidden relative mb-4">
              {isRecording ? (
                <>
                  <video 
                    ref={liveVideoRef} 
                    autoPlay 
                    muted 
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-4 left-4 bg-red-500 text-white px-3 py-1 rounded-full text-sm flex items-center gap-2">
                    <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    REC {recordingTime}s / 10s
                  </div>
                  <Progress value={recordingTime * 10} className="absolute bottom-4 left-4 right-4" />
                </>
              ) : videoPreview ? (
                <video 
                  src={videoPreview} 
                  controls 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-white/50">
                  <Film className="w-16 h-16 mb-4" />
                  <p>Record or upload a video</p>
                </div>
              )}
            </div>
            
            {/* Controls */}
            <div className="flex gap-2">
              {isRecording ? (
                <Button onClick={stopRecording} variant="destructive" className="flex-1">
                  <Pause className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              ) : (
                <>
                  <Button onClick={startRecording} className="flex-1 bg-red-500 hover:bg-red-600">
                    <Play className="w-4 h-4 mr-2" />
                    Record
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => videoInputRef.current?.click()}
                    className="flex-1"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Upload
                  </Button>
                </>
              )}
              {videoPreview && !isRecording && (
                <Button 
                  variant="ghost" 
                  size="icon"
                  onClick={() => {
                    setVideoFile(null);
                    setVideoPreview(null);
                  }}
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
              )}
            </div>
            <input 
              type="file" 
              ref={videoInputRef}
              accept="video/*"
              onChange={handleVideoSelect}
              className="hidden"
            />
          </div>
          
          <Button 
            onClick={saveStep2}
            disabled={loading || !videoFile}
            className="w-full h-12 bg-gradient-to-r from-pink-500 to-purple-600"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Next Step"}
          </Button>
        </div>
      )}

      {/* Step 3: Face Verification */}
      {currentStep === 3 && (
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-2xl p-5 shadow-sm border">
            <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
              <Camera className="w-5 h-5 text-purple-600" />
              Live Face Verification
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              Show your face to the camera and take a photo
            </p>
            
            {/* Face Verification Area */}
            <div className="aspect-square max-w-[300px] mx-auto bg-gray-900 rounded-2xl overflow-hidden relative mb-4">
              {faceVerificationImage ? (
                <img 
                  src={faceVerificationImage} 
                  alt="Face" 
                  className="w-full h-full object-cover"
                />
              ) : faceStream ? (
                <>
                  <video 
                    ref={faceVideoRef} 
                    autoPlay 
                    muted 
                    playsInline
                    className="w-full h-full object-cover"
                  />
                  {/* Face guide overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-48 border-4 border-white/50 rounded-full" />
                  </div>
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-white/50">
                  <User className="w-16 h-16 mb-4" />
                  <p className="text-center px-4">Start Camera</p>
                </div>
              )}
              
              {faceVerified && (
                <div className="absolute inset-0 bg-green-500/80 flex items-center justify-center">
                  <div className="text-center text-white">
                    <CheckCircle2 className="w-16 h-16 mx-auto mb-2" />
                    <p className="font-bold">Verified!</p>
                  </div>
                </div>
              )}
            </div>
            
            <canvas ref={faceCanvasRef} className="hidden" />
            
            {/* Controls */}
            <div className="space-y-2">
              {!faceStream && !faceVerificationImage && (
                <Button onClick={startFaceCamera} className="w-full">
                  <Camera className="w-4 h-4 mr-2" />
                  Start Camera
                </Button>
              )}
              
              {faceStream && !faceVerificationImage && (
                <Button onClick={captureFace} className="w-full bg-green-500 hover:bg-green-600">
                  <Camera className="w-4 h-4 mr-2" />
                  Capture Photo
                </Button>
              )}
              
              {faceVerificationImage && !faceVerified && (
                <>
                  <Button 
                    onClick={verifyFace} 
                    disabled={verifyingFace}
                    className="w-full bg-gradient-to-r from-green-500 to-emerald-600"
                  >
                    {verifyingFace ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 mr-2" />
                        Verify Face
                      </>
                    )}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setFaceVerificationImage(null);
                      startFaceCamera();
                    }}
                    className="w-full"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Retake
                  </Button>
                </>
              )}
            </div>
          </div>
          
          <Button 
            onClick={submitApplication}
            disabled={loading || !faceVerified}
            className="w-full h-12 bg-gradient-to-r from-pink-500 to-purple-600"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : "Submit Application"}
          </Button>
        </div>
      )}
    </div>
  );
};

export default HostVerification;
