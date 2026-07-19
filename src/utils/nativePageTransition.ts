/**
 * Native Page Transition Engine
 * Provides iOS/Android-like page transition animations
 * for React Router navigations.
 */

export type TransitionType = 'slide-left' | 'slide-right' | 'slide-up' | 'fade' | 'none';

// Determine transition direction based on navigation
const routeOrder = [
  '/',
  '/discover',
  '/reels', 
  '/profile',
  '/chat',
  '/live',
  '/settings',
];

export function getTransitionDirection(from: string, to: string): TransitionType {
  // Back navigation detection
  if (to === '/' && from !== '/') return 'slide-right';
  
  // Settings/sub-pages always slide from right
  const subPages = ['/settings', '/edit-profile', '/level', '/vip', '/shop', '/agency'];
  if (subPages.some(p => to.startsWith(p))) return 'slide-left';
  if (subPages.some(p => from.startsWith(p)) && !subPages.some(p => to.startsWith(p))) return 'slide-right';
  
  // Live stream — slide up like a modal
  if (to.startsWith('/live-stream/') || to.startsWith('/go-live')) return 'slide-up';
  
  // Tab navigation — simple fade
  const fromIdx = routeOrder.indexOf(from);
  const toIdx = routeOrder.indexOf(to);
  if (fromIdx >= 0 && toIdx >= 0) return 'fade';
  
  return 'slide-left';
}

// Framer motion variants for each transition type
export const transitionVariants = {
  'slide-left': {
    initial: { x: '100%', opacity: 0.8 },
    animate: { x: 0, opacity: 1 },
    exit: { x: '-30%', opacity: 0.5 },
  },
  'slide-right': {
  },
  'slide-up': {
  },
  'fade': {
  },
  'none': {
  },
};

export const transitionConfig = {
  'slide-left': { type: 'spring' as const, damping: 30, stiffness: 300, mass: 0.8 },
  'slide-right': { type: 'spring' as const, damping: 30, stiffness: 300, mass: 0.8 },
  'slide-up': { type: 'spring' as const, damping: 28, stiffness: 280, mass: 0.9 },
  'fade': { duration: 0.15 },
  'none': { duration: 0 },
};
