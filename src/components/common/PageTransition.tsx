/**
 * Native Android-style page transition wrapper
 * Slide-in from right for sub-pages, fade for root pages
 * Mimics Chamet/WhatsApp native feel
 */
import { motion } from 'framer-motion';
import { ReactNode, useMemo } from 'react';
import { useLocation } from 'react-router-dom';

interface PageTransitionProps {
  children: ReactNode;
  className?: string;
  /** Override transition direction */
  direction?: 'slide' | 'fade' | 'up';
}

const ROOT_PAGES = ['/', '/discover', '/live', '/chat', '/profile'];

// Native Android Material Design 3 easing
const NATIVE_EASE = [0.4, 0.0, 0.2, 1] as [number, number, number, number];

const slideVariants = {
  initial: { x: '30%', opacity: 0 },
  animate: { x: 0, opacity: 1 },
  exit: { x: '-15%', opacity: 0 },
};

const fadeVariants = {
  initial: { opacity: 0, scale: 0.97 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.97 },
};

const slideUpVariants = {
  initial: { y: '100%', opacity: 1 },
  animate: { y: 0, opacity: 1 },
  exit: { y: '100%', opacity: 1 },
};

export const PageTransition = ({ children, className, direction }: PageTransitionProps) => {
  const location = useLocation();
  
  const isRootPage = ROOT_PAGES.includes(location.pathname);
  const effectiveDirection = direction || (isRootPage ? 'fade' : 'slide');
  
  const variants = useMemo(() => {
    switch (effectiveDirection) {
      case 'slide': return slideVariants;
      case 'up': return slideUpVariants;
      default: return fadeVariants;
    }
  }, [effectiveDirection]);

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      transition={{
        type: 'tween',
        ease: NATIVE_EASE,
        duration: effectiveDirection === 'up' ? 0.3 : 0.22,
      }}
      className={className}
      style={{ willChange: 'auto', contain: 'layout style' }}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;
