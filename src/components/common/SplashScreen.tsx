/**
 * Professional Native Splash Screen
 * Animated brand logo + name + version on app launch.
 */
import { useEffect, useState } from 'react';
// Bundled via Vite so the splash logo is hashed, fingerprinted, and served
// from the same chunk pipeline as the rest of the app — never broken by a
// stale service worker, missing /public file, or query-string cache bust.
import appLogo from '@/assets/app-logo.png';
import { APP_VERSION } from '@/lib/version';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { ImgHTMLAttributes } from 'react';

type PriorityImgProps = ImgHTMLAttributes<HTMLImageElement> & { fetchpriority?: 'high' | 'low' | 'auto' };

interface SplashScreenProps {
  onComplete: () => void;
  /** Minimum display time in ms */
  minDuration?: number;
}

export function SplashScreen({ onComplete, minDuration = 0 }: SplashScreenProps) {
  // ★ Live version: on native, pulled from the actual installed APK / IPA so
  //   the splash always matches what's on the device. Falls back to the JS
  //   APP_VERSION constant on web. The (build) code is appended on native.
  const [displayVersion, setDisplayVersion] = useState<string>(APP_VERSION);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!Capacitor.isNativePlatform()) return;
      try {
        const info = await CapacitorApp.getInfo();
        if (cancelled) return;
        if (info?.version) {
          setDisplayVersion(info.build ? `${info.version} (${info.build})` : info.version);
        }
      } catch {
        // keep fallback
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, minDuration);
    return () => clearTimeout(timer);
  }, [onComplete, minDuration]);

  return (
        <div
          className="fixed inset-0 z-[99999] flex flex-col items-center justify-center overflow-hidden"
          style={{
            background:
              'radial-gradient(ellipse at top, #FFFBF2 0%, #FAF5EA 55%, #F5EFDF 100%)',
          }}
        >
          {/* Glow halo */}
          <div
            className="absolute w-[420px] h-[420px] rounded-full pointer-events-none"
            style={{
              background:
                'radial-gradient(circle, rgba(236,72,153,0.35) 0%, rgba(168,85,247,0.18) 45%, transparent 75%)',
              filter: 'blur(20px)',
            }}
          />

          {/* Logo */}
          <div
            className="relative z-10"
          >
            <div
              className="relative w-32 h-32 rounded-full overflow-hidden bg-white"
              style={{
                boxShadow:
                  '0 20px 60px rgba(236,72,153,0.35), 0 0 0 1px rgba(236,72,153,0.22)',
              }}
            >
              <img 
                src={appLogo}
                alt="MeriLive"
                loading="eager"
                decoding="async"
                {...({ fetchpriority: 'high' } as PriorityImgProps)}
                onError={(e) => {
                  // Last-resort fallback: if the bundled chunk somehow 404s
                  // (offline cache miss, corrupted SW), fall back to the
                  // /public copy. Either way the user always sees the logo.
                  const img = e.currentTarget;
                  if (!img.dataset.fallback) {
                    img.dataset.fallback = '1';
                    img.src = '/app-logo.png';
                  }
                }}
                className="absolute inset-0 block h-full w-full object-cover"
                style={{ objectPosition: 'center center' }}/>
            </div>
          </div>

          {/* Brand name */}
          <div
            className="relative z-10 mt-6"
          >
            <h1
              className="text-[40px] font-extrabold tracking-normal text-transparent bg-clip-text"
              style={{
                backgroundImage:
                  'linear-gradient(110deg, #be185d 0%, #ec4899 25%, #a855f7 50%, #ec4899 75%, #be185d 100%)',
                backgroundSize: '100% auto',
                letterSpacing: '0',
              }}
            >
              MeriLive
            </h1>
          </div>

          {/* Tagline */}
          <p
            className="relative z-10 mt-1 text-[12px] text-slate-600 uppercase font-semibold"
          >
            Live · Connect · Earn
          </p>

          {/* Version */}
          <div
            className="absolute bottom-8 text-[11px] text-slate-500 tracking-wider font-medium"
          >
            Version {displayVersion}
          </div>
        </div>
  );
}

export default SplashScreen;
