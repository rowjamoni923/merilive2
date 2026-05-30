import { useState, useEffect } from 'react';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { Capacitor } from '@capacitor/core';

export const useMobileOrientation = () => {
  const [isLandscape, setIsLandscape] = useState(
    typeof window !== 'undefined' ? window.innerWidth > window.innerHeight : false
  );
  const [dimensions, setDimensions] = useState({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  });

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      setIsLandscape(width > height);
      setDimensions({ width, height });
    };

    window.addEventListener('resize', handleResize);
    
    // Also listen for orientation changes via Capacitor if on native
    let orientationListener: any;
    if (Capacitor.isNativePlatform()) {
      orientationListener = ScreenOrientation.addListener('screenOrientationChange', (type) => {
        setIsLandscape(type.type.includes('landscape'));
      });
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (orientationListener) {
        orientationListener.remove();
      }
    };
  }, []);

  return {
    isLandscape,
    isPortrait: !isLandscape,
    ...dimensions,
    isSmallHeight: dimensions.height < 500,
    isVerySmallHeight: dimensions.height < 400,
  };
};
