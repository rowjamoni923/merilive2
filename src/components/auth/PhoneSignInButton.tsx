 import { useState, useEffect } from "react";
 import { Button } from "@/components/ui/button";
 import { Input } from "@/components/ui/input";
 import { Phone, ArrowRight, Check, Search, ChevronDown } from "lucide-react";
 import { useToast } from "@/hooks/use-toast";
 import { useFirebasePhoneAuth } from "@/hooks/useFirebasePhoneAuth";
 import {
   Dialog,
   DialogContent,
   DialogHeader,
   DialogTitle,
   DialogDescription,
 } from "@/components/ui/dialog";
 import { ScrollArea } from "@/components/ui/scroll-area";
 import { COUNTRY_CODES, getCountryByCode, CountryCode } from "@/data/countryCodes";
 
 interface PhoneSignInButtonProps {
   agreed: boolean;
   referralCode: string | null;
   onSuccess: () => void;
 }
 
 type PhoneStep = "phone" | "gender" | "name" | "otp";
 type Gender = "male" | "female";
 
// Initial placeholder - uses first country in list, will be replaced by IP detection
const DEFAULT_COUNTRY = COUNTRY_CODES[0];
 
 export const PhoneSignInButton = ({ agreed, referralCode, onSuccess }: PhoneSignInButtonProps) => {
   const { toast } = useToast();
   const { sendOtp, verifyOtp, loading, reset } = useFirebasePhoneAuth();
   
   const [showDialog, setShowDialog] = useState(false);
   const [step, setStep] = useState<PhoneStep>("phone");
   const [selectedCountry, setSelectedCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
   const [phoneNumber, setPhoneNumber] = useState("");
   const [otpCode, setOtpCode] = useState("");
   const [displayName, setDisplayName] = useState("");
   const [selectedGender, setSelectedGender] = useState<Gender | null>(null);
   const [showCountryPicker, setShowCountryPicker] = useState(false);
   const [searchQuery, setSearchQuery] = useState("");
   const [countryDetected, setCountryDetected] = useState(false);
 
   // Auto-detect user's country on mount with multiple fallback APIs
   useEffect(() => {
     if (countryDetected) return;
     
     const detectCountry = async () => {
       // Try API 1: ipapi.co
       try {
         const response = await fetch('https://ipapi.co/json/', { 
           signal: AbortSignal.timeout(4000) 
         });
         if (response.ok) {
           const data = await response.json();
           if (data.country_code && !data.error) {
             const country = getCountryByCode(data.country_code);
             if (country) {
               setSelectedCountry(country);
               setCountryDetected(true);
               console.log('[PhoneAuth] Auto-detected country (ipapi):', country.name);
               return;
             }
           }
         }
       } catch (e) {
         console.log('[PhoneAuth] ipapi.co failed, trying fallback...');
       }

       // Try API 2: ipwho.is (free, no rate limit)
       try {
         const response = await fetch('https://ipwho.is/', {
           signal: AbortSignal.timeout(4000)
         });
         if (response.ok) {
           const data = await response.json();
           if (data.success && data.country_code) {
             const country = getCountryByCode(data.country_code);
             if (country) {
               setSelectedCountry(country);
               setCountryDetected(true);
               console.log('[PhoneAuth] Auto-detected country (ipwho.is):', country.name);
               return;
             }
           }
         }
       } catch (e) {
         console.log('[PhoneAuth] ipwho.is failed, trying fallback...');
       }

       // Try API 3: freeipapi.com
       try {
         const response = await fetch('https://freeipapi.com/api/json', {
           signal: AbortSignal.timeout(4000)
         });
         if (response.ok) {
           const data = await response.json();
           if (data.countryCode) {
             const country = getCountryByCode(data.countryCode);
             if (country) {
               setSelectedCountry(country);
               setCountryDetected(true);
               console.log('[PhoneAuth] Auto-detected country (freeipapi):', country.name);
               return;
             }
           }
         }
       } catch (e) {
         console.log('[PhoneAuth] All APIs failed, using default');
       }
     };
     
     detectCountry();
   }, [countryDetected]);
 
   // Filter countries by search
   const filteredCountries = COUNTRY_CODES.filter(country => 
     country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
     country.code.includes(searchQuery) ||
     country.country.toLowerCase().includes(searchQuery.toLowerCase())
   );
 
   const handlePhoneClick = () => {
     if (!agreed) {
       toast({
         title: "Accept Terms",
         description: "Please agree to User Agreement and Privacy Policy to continue.",
         variant: "destructive",
       });
       return;
     }
     setShowDialog(true);
     setStep("phone");
   };
 
   const handleSendOtp = async () => {
     if (!phoneNumber || phoneNumber.length < 6) {
       toast({
         title: "Error",
         description: "Please enter a valid phone number",
         variant: "destructive",
       });
       return;
     }
 
     const fullNumber = selectedCountry.code + phoneNumber.replace(/^0+/, '');
     const result = await sendOtp(fullNumber);
     
     if (result.success) {
       setStep("gender");
     }
   };
 
   const handleGenderSelect = (gender: Gender) => {
     setSelectedGender(gender);
     setStep("name");
   };
 
   const handleNameSubmit = () => {
     if (!displayName.trim()) {
       toast({
         title: "Error",
         description: "Please enter your name",
         variant: "destructive",
       });
       return;
     }
     setStep("otp");
   };
 
   const handleVerifyOtp = async () => {
     if (otpCode.length !== 6) {
       toast({
         title: "Error",
         description: "Please enter the 6-digit code",
         variant: "destructive",
       });
       return;
     }
 
     if (!selectedGender) return;
 
     const result = await verifyOtp(otpCode, displayName, selectedGender);
     
     if (result.success) {
       if (referralCode && selectedGender === 'female') {
         localStorage.setItem("meri_pending_referral", referralCode);
       }
       setShowDialog(false);
       resetState();
       onSuccess();
     }
   };
 
   const resetState = () => {
     setStep("phone");
     setPhoneNumber("");
     setSearchQuery("");
     setShowCountryPicker(false);
     setOtpCode("");
     setDisplayName("");
     setSelectedGender(null);
     reset();
   };
 
   const closeDialog = () => {
     setShowDialog(false);
     resetState();
   };
 
   return (
     <>
       {/* Phone Button */}
       <Button
         onClick={handlePhoneClick}
         className="w-full h-11 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-600 hover:via-teal-600 hover:to-cyan-600 text-white text-sm font-semibold shadow-[0_6px_24px_-6px_rgba(16,185,129,0.5)] border border-emerald-400/30 transition-all duration-300 active:scale-[0.98] backdrop-blur-md"
         disabled={loading}
       >
         {loading ? (
           <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
         ) : (
           <>
             <Phone className="w-4 h-4 mr-2" />
             <span>Phone</span>
           </>
         )}
       </Button>
 
       {/* Phone Auth Dialog */}
       <Dialog open={showDialog} onOpenChange={closeDialog}>
         <DialogContent className="max-w-[90vw] sm:max-w-sm mx-auto bg-gradient-to-br from-[#FFFBF2] via-[#FAF5EA] to-[#F5EFDF] border border-amber-200/70 rounded-3xl shadow-2xl shadow-amber-900/10">
           
           {/* Step 1: Phone Number */}
           {step === "phone" && (
             <>
               <DialogHeader>
                 <div className="flex justify-center mb-4">
                     <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                       <Phone className="w-8 h-8 text-white" />
                     </div>
                 </div>
                 <DialogTitle className="text-slate-800 text-center text-xl">
                   Enter Phone Number
                 </DialogTitle>
                 <DialogDescription className="text-slate-600 text-center">
                   We'll send you a verification code
                 </DialogDescription>
               </DialogHeader>
               
               <div className="py-4 space-y-4">
                 {showCountryPicker ? (
                   <div className="space-y-3">
                     {/* Search Input */}
                     <div className="relative">
                       <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                       <Input
                         value={searchQuery}
                         onChange={(e) => setSearchQuery(e.target.value)}
                         placeholder="Search country..."
                         className="pl-10 h-12 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl"
                         autoFocus
                       />
                     </div>
                     
                     {/* Country List */}
                     <ScrollArea className="h-48 rounded-xl border border-amber-200 bg-white/80">
                       <div className="p-2 space-y-1">
                         {filteredCountries.map((country) => (
                           <button
                             key={country.country + country.code}
                             onClick={() => {
                               setSelectedCountry(country);
                               setShowCountryPicker(false);
                               setSearchQuery("");
                             }}
                              className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all ${
                                selectedCountry.code === country.code && selectedCountry.country === country.country
                                  ? 'bg-emerald-100 border border-emerald-300'
                                  : 'hover:bg-amber-50/70'
                              }`}
                           >
                             <span className="text-2xl">{country.flag}</span>
                             <div className="flex-1 text-left">
                               <span className="text-slate-800 font-medium text-sm">{country.name}</span>
                             </div>
                             <span className="text-slate-600 text-sm font-mono">{country.code}</span>
                           </button>
                         ))}
                         {filteredCountries.length === 0 && (
                           <div className="text-center text-slate-500 py-4">
                             No countries found
                           </div>
                         )}
                       </div>
                     </ScrollArea>
                     
                     <Button
                       onClick={() => setShowCountryPicker(false)}
                       variant="outline"
                       className="w-full h-10 border-slate-200 text-slate-700 hover:bg-slate-50"
                     >
                       Cancel
                     </Button>
                   </div>
                 ) : (
                   <>
                     {/* Country Code + Phone Number */}
                     <div className="flex gap-2">
                       <button
                         onClick={() => setShowCountryPicker(true)}
                         className="flex items-center gap-2 px-3 h-14 bg-white border border-slate-200 text-slate-900 rounded-xl hover:bg-amber-50/70 transition-colors"
                       >
                         <span className="text-xl">{selectedCountry.flag}</span>
                         <span className="text-sm font-medium">{selectedCountry.code}</span>
                         <ChevronDown className="w-4 h-4 text-slate-600" />
                       </button>
                       
                       <Input
                         type="tel"
                         value={phoneNumber}
                         onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                         placeholder="Phone number"
                         className="flex-1 h-14 text-lg bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl"
                         autoFocus
                       />
                     </div>
                     
                     <Button
                       onClick={handleSendOtp}
                       disabled={loading || phoneNumber.length < 6}
                       className="w-full h-12 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold rounded-xl"
                     >
                       {loading ? (
                         <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                       ) : (
                         <>
                           <span>Send OTP</span>
                           <ArrowRight className="w-5 h-5 ml-2" />
                         </>
                       )}
                     </Button>
                   </>
                 )}
               </div>
             </>
           )}
 
           {/* Step 2: Gender Selection */}
           {step === "gender" && (
             <>
               <DialogHeader>
                 <DialogTitle className="text-slate-800 text-center text-xl">
                   Select Gender
                 </DialogTitle>
                 <DialogDescription className="text-slate-600 text-center">
                   Choose your gender to continue
                 </DialogDescription>
               </DialogHeader>
               
               <div className="flex gap-4 py-6">
                 <button
                   onClick={() => handleGenderSelect("male")}
                   className="flex-1 p-6 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border-2 border-blue-500/30 hover:border-blue-400 hover:bg-blue-500/30 transition-all flex flex-col items-center gap-3"
                 >
                   <span className="text-5xl">👨</span>
                   <span className="text-slate-800 font-semibold">Male</span>
                 </button>
                 
                 <button
                   onClick={() => handleGenderSelect("female")}
                   className="flex-1 p-6 rounded-2xl bg-gradient-to-br from-pink-500/20 to-rose-500/20 border-2 border-pink-500/30 hover:border-pink-400 hover:bg-pink-500/30 transition-all flex flex-col items-center gap-3"
                 >
                   <span className="text-5xl">👩</span>
                   <span className="text-slate-800 font-semibold">Female</span>
                 </button>
               </div>
             </>
           )}
 
           {/* Step 3: Name Entry */}
           {step === "name" && (
             <>
               <DialogHeader>
                 <DialogTitle className="text-slate-800 text-center text-xl">
                   Your Name
                 </DialogTitle>
                 <DialogDescription className="text-slate-600 text-center">
                   This will be your display name
                 </DialogDescription>
               </DialogHeader>
               
               <div className="py-4 space-y-4">
                 <Input
                   value={displayName}
                   onChange={(e) => setDisplayName(e.target.value)}
                   placeholder="Enter your name"
                   className="h-14 text-lg bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl text-center"
                   autoFocus
                 />
                 
                 <Button
                   onClick={handleNameSubmit}
                   disabled={!displayName.trim()}
                   className="w-full h-12 bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 text-white font-bold rounded-xl"
                 >
                   <span>Next</span>
                   <ArrowRight className="w-5 h-5 ml-2" />
                 </Button>
               </div>
             </>
           )}
 
           {/* Step 4: OTP Verification */}
           {step === "otp" && (
             <>
               <DialogHeader>
                 <div className="flex justify-center mb-4">
                   <div className="w-16 h-16 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                     <Check className="w-8 h-8 text-white" />
                   </div>
                 </div>
                 <DialogTitle className="text-slate-800 text-center text-xl">
                   Enter OTP Code
                 </DialogTitle>
                 <DialogDescription className="text-slate-600 text-center">
                   Enter the 6-digit code sent to{" "}
                   <span className="text-emerald-400 font-medium">{selectedCountry.code}{phoneNumber}</span>
                 </DialogDescription>
               </DialogHeader>
               
               <div className="py-4 space-y-6">
                 <div className="flex justify-center">
                   <Input
                     type="text"
                     value={otpCode}
                     onChange={(e) => {
                       const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                       setOtpCode(value);
                     }}
                     placeholder="000000"
                     maxLength={6}
                     className="h-16 w-48 text-center text-3xl font-bold tracking-[0.5em] bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl"
                     autoFocus
                   />
                 </div>
                 
                 <Button
                   onClick={handleVerifyOtp}
                   disabled={loading || otpCode.length !== 6}
                   className="w-full h-12 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold rounded-xl"
                 >
                   {loading ? (
                     <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                   ) : (
                     <>
                       <Check className="w-5 h-5 mr-2" />
                       Verify & Continue
                     </>
                   )}
                 </Button>
                 
                 <div className="text-center">
                   <button
                     onClick={() => setStep("phone")}
                     className="text-slate-600 text-sm hover:text-slate-800 transition-colors"
                   >
                     Didn't receive code? <span className="text-emerald-400">Resend</span>
                   </button>
                 </div>
               </div>
             </>
           )}
         </DialogContent>
       </Dialog>
     </>
   );
 };
 
 export default PhoneSignInButton;