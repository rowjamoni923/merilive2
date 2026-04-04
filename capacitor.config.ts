import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.merilive.app',
  appName: 'MeriLive',
  webDir: 'dist',
  
  // =====================================================
  // PRODUCTION: merilive.com দিয়ে সমস্ত কিছু লোড হবে
  // নেটিভ অ্যাপে সরাসরি merilive.com থেকে কন্টেন্ট সার্ভ হবে
  // =====================================================
  // =====================================================
  // LOCAL-FIRST: অ্যাপ সম্পূর্ণ local dist/ থেকে চলবে
  // কোনো browser redirect নেই — সব কিছু WebView এর ভিতরে
  // =====================================================
  server: {
    androidScheme: 'https',
  },
  
  android: {
    allowMixedContent: true,
    appendUserAgent: 'MeriLive-Android-Native',
    webContentsDebuggingEnabled: false,
    initialFocus: true,
    // Allow OAuth and API calls within WebView
    allowNavigation: [
      // Production domains (primary + fallback)
      'merilive.com',
      'www.merilive.com',
      '*.merilive.com',
      // Admin panel
      'merilive.top',
      '*.merilive.top',
      // Dev/preview
      'merilive.lovable.app',
      '*.lovable.app',
      // Supabase backend
      '*.supabase.co',
      '*.supabase.com',
      'pppcwawjjpwwrmvezcdy.supabase.co',
      // Payment gateways
      '*.bkash.com',
      '*.nagad.com.bd',
      '*.stripe.com',
      // CDN and assets
      '*.unsplash.com',
      '*.cloudinary.com',
      '*.lottiefiles.com'
    ]
    // NOTE: Google OAuth domains removed because we use native Google Sign-In SDK
    // which doesn't require browser at all
  },
  ios: {
    scheme: 'merilive',
    appendUserAgent: 'MeriLive-iOS-Native',
    contentInset: 'automatic',
    limitsNavigationsToAppBoundDomains: false,
    preferredContentMode: 'mobile',
    scrollEnabled: true,
    allowsLinkPreview: false
  },
  // Only include these plugins - excludes capacitor-purchases (uses deprecated jcenter)
  includePlugins: [
    '@capacitor/app',
    '@capacitor/camera',
    '@capacitor/browser',
    '@capacitor/clipboard',
    '@capacitor/device',
    '@capacitor/dialog',
    '@capacitor/geolocation',
    '@capacitor/haptics',
    '@capacitor/keyboard',
    '@capacitor/network',
    '@capacitor/preferences',
    '@capacitor/push-notifications',
    '@capacitor/screen-orientation',
    '@capacitor/share',
    '@capacitor/splash-screen',
    '@capacitor/status-bar',
    '@capacitor/toast',
    '@capacitor/action-sheet',
    '@capawesome/capacitor-app-update',
    '@capacitor-firebase/authentication'
  ],
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#0a0a0f',
      showSpinner: false,
      androidSpinnerStyle: 'small',
      spinnerColor: '#e91e63',
      splashFullScreen: true,
      splashImmersive: true
    },
    // Firebase Authentication Configuration
    // REQUIRED: providers array for Google Sign-In to work
    FirebaseAuthentication: {
      skipNativeAuth: false,
      providers: ['google.com']
    },
    // Native push notifications
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    // Native camera access
    Camera: {
      // Permissions handled natively
    },
    // Native location
    Geolocation: {
      // High accuracy GPS
    },
    // Keyboard handling
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    },
    // Status bar customization
    StatusBar: {
      style: 'dark',
      backgroundColor: '#0a0a0f'
    },
    // Local notifications
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#e91e63'
    },
    // Haptic feedback
    Haptics: {
      // Native vibration
    },
    // App Plugin for Deep Linking
    App: {
      // Handle incoming URLs when app is opened via deep link
    }
  }
};

export default config;
