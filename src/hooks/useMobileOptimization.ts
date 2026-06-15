/**
 * Universal Mobile Optimization Hook
 * 
 * Handles all mobile-specific optimizations including:
 * - Safe area detection (notch, status bar, gesture navigation)
 * - Viewport height calculation (100vh fix for mobile browsers)
 * - Screen size detection
 * - Orientation detection
 * - Dynamic insets for all phone types
 */

import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';

interface MobileInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface MobileInfo {
  isNative: boolean;
  isMobile: boolean;
  isTablet: boolean;
  isLandscape: boolean;
  screenWidth: number;
  screenHeight: number;
  viewportHeight: number; // Actual visible height (100vh fix)
  safeAreaInsets: MobileInsets;
  hasNotch: boolean;
  hasGestureNav: boolean; // For phones with gesture navigation (no physical buttons)
}

export function useMobileOptimization(): MobileInfo {
  const [mobileInfo, setMobileInfo] = useState<MobileInfo>(() => getInitialMobileInfo());

  useEffect(() => {
    const updateMobileInfo = () => {
      setMobileInfo(getInitialMobileInfo());
    };

    // Update on resize and orientation change
    window.addEventListener('resize', updateMobileInfo);
    window.addEventListener('orientationchange', updateMobileInfo);
    
    // Initial update
    updateMobileInfo();

    return () => {
      window.removeEventListener('resize', updateMobileInfo);
      window.removeEventListener('orientationchange', updateMobileInfo);
    };
  }, []);

  return mobileInfo;
}

function getInitialMobileInfo(): MobileInfo {
  const isNative = Capacitor.isNativePlatform();
  const screenWidth = window.innerWidth;
  const screenHeight = window.innerHeight;
  
  // Detect if mobile or tablet
  const isMobile = screenWidth < 768;
  const isTablet = screenWidth >= 768 && screenWidth < 1024;
  const isLandscape = screenWidth > screenHeight;

  // Get actual viewport height (fixes 100vh issue on mobile browsers)
  const viewportHeight = window.visualViewport?.height || window.innerHeight;

  // Calculate safe area insets
  const safeAreaInsets = getSafeAreaInsets();
  
  // Detect notch (iPhone X+, modern Android phones)
  const hasNotch = safeAreaInsets.top > 24;
  
  // Detect gesture navigation (modern phones without physical buttons)
  const hasGestureNav = safeAreaInsets.bottom > 20;

  return {
    isNative,
    isMobile,
    isTablet,
    isLandscape,
    screenWidth,
    screenHeight,
    viewportHeight,
    safeAreaInsets,
    hasNotch,
    hasGestureNav,
  };
}

function getSafeAreaInsets(): MobileInsets {
  // Try to get CSS env() values
  const computedStyle = getComputedStyle(document.documentElement);
  
  // Parse safe area insets from CSS (set by browser/native)
  const parseInset = (value: string): number => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Create a temporary element to measure safe-area-inset values
  const measureElement = document.createElement('div');
  measureElement.style.cssText = `
    position: fixed;
    top: env(safe-area-inset-top, 0px);
    bottom: env(safe-area-inset-bottom, 0px);
    left: env(safe-area-inset-left, 0px);
    right: env(safe-area-inset-right, 0px);
    visibility: hidden;
    pointer-events: none;
  `;
  document.body.appendChild(measureElement);
  
  const rect = measureElement.getBoundingClientRect();
  document.body.removeChild(measureElement);

  // Calculate insets based on element position
  const top = rect.top;
  const bottom = window.innerHeight - rect.bottom;
  const left = rect.left;
  const right = window.innerWidth - rect.right;

  // Apply minimum defaults for common devices
  return {
    top: Math.max(top, getDefaultTopInset()),
    bottom: Math.max(bottom, getDefaultBottomInset()),
    left: Math.max(left, 0),
    right: Math.max(right, 0),
  };
}

function getDefaultTopInset(): number {
  const screenHeight = window.screen.height;
  const screenWidth = window.screen.width;
  const aspectRatio = screenHeight / screenWidth;
  
  // iPhone X+ detection (aspect ratio ~2.16+)
  if (aspectRatio > 2.0 && screenWidth <= 430) {
    return 47; // iPhone notch height
  }
  
  // Modern Android with notch (aspect ratio ~2.0+)
  if (aspectRatio > 1.9 && screenWidth <= 480) {
    return 32; // Android status bar + notch
  }
  
  // Standard phones
  return 24; // Standard status bar
}

function getDefaultBottomInset(): number {
  const screenHeight = window.screen.height;
  const screenWidth = window.screen.width;
  const aspectRatio = screenHeight / screenWidth;
  
  // iPhone with home indicator (iPhone X+)
  if (aspectRatio > 2.0 && screenWidth <= 430) {
    return 34; // iPhone home indicator
  }
  
  // Modern Android with gesture nav
  if (aspectRatio > 1.9 && screenWidth <= 480) {
    return 24; // Android gesture nav bar
  }
  
  return 0;
}

/**
 * Hook to get dynamic CSS variables for safe areas
 */
export function useMobileSafeAreaCSS() {
  const { safeAreaInsets, hasNotch, hasGestureNav, viewportHeight } = useMobileOptimization();

  return {
    '--safe-top': `${safeAreaInsets.top}px`,
    '--safe-bottom': `${safeAreaInsets.bottom}px`,
    '--safe-left': `${safeAreaInsets.left}px`,
    '--safe-right': `${safeAreaInsets.right}px`,
    '--viewport-height': `${viewportHeight}px`,
    '--has-notch': hasNotch ? '1' : '0',
    '--has-gesture-nav': hasGestureNav ? '1' : '0',
  } as React.CSSProperties;
}

/**
 * Get the actual full screen height (for fullscreen components like Live/Party)
 */
export function useFullScreenHeight(): string {
  const { viewportHeight, safeAreaInsets, isNative } = useMobileOptimization();
  
  if (isNative) {
    // Native app - use 100% of screen
    return '100vh';
  }
  
  // Mobile browser - use visualViewport height
  return `${viewportHeight}px`;
}

export default useMobileOptimization;
