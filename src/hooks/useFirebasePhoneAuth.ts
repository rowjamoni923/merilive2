 import { useState, useCallback } from 'react';
 import { Capacitor } from '@capacitor/core';
 import { supabase } from '@/integrations/supabase/client';
 import { useToast } from '@/hooks/use-toast';
 
 interface PhoneAuthResult {
   success: boolean;
   error?: string;
   verificationId?: string;
 }
 
// Store verification ID globally for the plugin callback
let storedVerificationId: string | null = null;

 /**
  * Firebase Phone Authentication Hook
  * Uses native Firebase SDK on Android/iOS
  * Syncs with Supabase after verification
  */
 export const useFirebasePhoneAuth = () => {
   const [loading, setLoading] = useState(false);
   const [verificationId, setVerificationId] = useState<string | null>(null);
  const [pendingPhoneNumber, setPendingPhoneNumber] = useState<string | null>(null);
   const { toast } = useToast();
 
   // Send OTP to phone number
   const sendOtp = useCallback(async (phoneNumber: string): Promise<PhoneAuthResult> => {
     setLoading(true);
     
     try {
       const isNative = Capacitor.isNativePlatform();
       console.log('[PhoneAuth] Platform:', isNative ? 'Native' : 'Web');
       console.log('[PhoneAuth] Sending OTP to:', phoneNumber);
       
       if (isNative) {
         // Native platform - use Capacitor Firebase plugin
         try {
           const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
           
          // Set up listener for code sent event
          FirebaseAuthentication.addListener('phoneCodeSent', (event) => {
            console.log('[PhoneAuth] Code sent, verificationId:', event.verificationId);
            storedVerificationId = event.verificationId;
            setVerificationId(event.verificationId);
           });
           
          // Initiate phone verification
          console.log('[PhoneAuth] Verification initiated for:', phoneNumber);
          setPendingPhoneNumber(phoneNumber);
          
          await FirebaseAuthentication.signInWithPhoneNumber({
            phoneNumber: phoneNumber,
          });
           
           toast({
             title: "OTP Sent! 📱",
             description: `Verification code sent to ${phoneNumber}`,
           });
           
          // Wait a moment for the listener to receive the verification ID
          await new Promise(resolve => setTimeout(resolve, 1000));
          
           return { 
             success: true, 
            verificationId: storedVerificationId || phoneNumber 
           };
           
         } catch (nativeError: any) {
           console.error('[PhoneAuth] Native error:', nativeError);
           
           if (nativeError.message?.includes('invalid') || 
               nativeError.message?.includes('format')) {
             throw new Error('Please enter a valid phone number with country code');
           }
           
           if (nativeError.message?.includes('quota') || 
               nativeError.message?.includes('limit')) {
             throw new Error('Too many attempts. Please try again later.');
           }
           
           throw nativeError;
         }
       } else {
         // Web platform - show message
         toast({
           title: "📱 Native App Only",
           description: "Phone OTP only works in the native app. Use Start button or download the app.",
         });
         
         return { success: false, error: 'Web preview - use native app' };
       }
     } catch (error: any) {
       console.error('[PhoneAuth] Error:', error);
       
       toast({
         title: "Error",
         description: error.message || "Failed to send OTP",
         variant: "destructive",
       });
       
       return { success: false, error: error.message };
     } finally {
       setLoading(false);
     }
   }, [toast]);
 
   // Verify OTP code
   const verifyOtp = useCallback(async (
     code: string,
     displayName: string,
     gender: 'male' | 'female'
   ): Promise<PhoneAuthResult> => {
     setLoading(true);
     
     try {
       const isNative = Capacitor.isNativePlatform();
       
       if (!isNative) {
         return { success: false, error: 'Web not supported' };
       }
       
       if (!verificationId) {
         throw new Error('Please request OTP first');
       }
       
       console.log('[PhoneAuth] Verifying OTP...');
       
       const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
       
       // Use confirmVerificationCode with the stored verification ID
       const confirmResult = await FirebaseAuthentication.confirmVerificationCode({
         verificationId: storedVerificationId || verificationId,
         verificationCode: code,
       });
       
       console.log('[PhoneAuth] Confirm result:', confirmResult?.user?.uid);
       
       if (!confirmResult?.user) {
         throw new Error('Verification failed');
       }
       
       // Sign in with Supabase using the Firebase token
       const phoneNumber = confirmResult.user.phoneNumber || pendingPhoneNumber || '';
       
       // Create anonymous Supabase session and link phone
       const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
       
       if (anonError) {
         throw anonError;
       }
       
       if (anonData.user) {
         // Update profile with phone number and details
         const isHost = gender === 'female';
         
         const { data: existingProfile } = await supabase
           .from('profiles')
           .select('id')
           .eq('id', anonData.user.id)
           .maybeSingle();
         
         if (existingProfile) {
           await supabase
             .from('profiles')
             .update({
               phone_number: phoneNumber,
               display_name: displayName,
               gender: gender,
               is_host: isHost,
               host_status: isHost ? 'approved' : null,
               phone_verified: true,
             })
             .eq('id', anonData.user.id);
         } else {
           await supabase
             .from('profiles')
             .insert({
               id: anonData.user.id,
               phone_number: phoneNumber,
               display_name: displayName,
               gender: gender,
               is_host: isHost,
               host_status: isHost ? 'approved' : null,
               phone_verified: true,
               coins: 0,
               total_earnings: 0,
               pending_earnings: 0,
               level: 1,
               consumption_coins: 0,
             });
         }
         
         toast({
           title: "Welcome! 🎉",
           description: `${displayName}, your account has been created!`,
         });
         
         return { success: true };
       }
       
       throw new Error('Session creation failed');
       
     } catch (error: any) {
       console.error('[PhoneAuth] Verify error:', error);
       
       let errorMessage = 'Failed to verify OTP';
       
       if (error.message?.includes('invalid') || 
           error.message?.includes('wrong') ||
           error.message?.includes('incorrect')) {
         errorMessage = 'Invalid code. Please try again.';
       } else if (error.message?.includes('expired')) {
         errorMessage = 'Code expired. Please request a new one.';
       }
       
       toast({
         title: "Error",
         description: errorMessage,
         variant: "destructive",
       });
       
       return { success: false, error: errorMessage };
     } finally {
       setLoading(false);
     }
   }, [verificationId, toast]);
 
   // Reset state
   const reset = useCallback(() => {
     setVerificationId(null);
   }, []);
 
   return {
     sendOtp,
     verifyOtp,
     reset,
     loading,
     verificationId,
     hasVerificationPending: !!verificationId,
   };
 };
 
 export default useFirebasePhoneAuth;