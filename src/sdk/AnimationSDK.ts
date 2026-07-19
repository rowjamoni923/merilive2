/**
 * =============================================================================
 * MeriLive Animation SDK
 * =============================================================================
 * 
 * High-performance animation utilities:
 * - Page Transitions
 * - Micro-interactions
 * - Loading Animations
 * - Gesture Animations
 * - Particle Effects
 * - Lottie Integration
 * 
 * =============================================================================
 */

// =============================================================================
// Types
// =============================================================================

export type EasingFunction = 
  | 'linear' 
  | 'easeIn' 
  | 'easeOut' 
  | 'easeInOut' 
  | 'spring' 
  | 'bounce';

export interface AnimationConfig {
  duration?: number;
  delay?: number;
  easing?: EasingFunction;
  onComplete?: () => void;
}

export interface ParticleConfig {
  count?: number;
  colors?: string[];
  size?: { min: number; max: number };
  speed?: { min: number; max: number };
  gravity?: number;
  spread?: number;
  lifetime?: number;
}

export interface PageTransitionConfig {
  type: 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'scale' | 'flip';
  duration?: number;
  easing?: EasingFunction;
}

// =============================================================================
// Easing Functions
// =============================================================================

const easings: Record<EasingFunction, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  spring: (t) => 1 - Math.cos(t * Math.PI * 2.5) * Math.exp(-t * 6),
  bounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

// =============================================================================
// Core Animation Engine
// =============================================================================

export class AnimationEngine {
  private animationId: number | null = null;

  animate(
    from: number,
    to: number,
    config: AnimationConfig,
    onUpdate: (value: number) => void
  ): () => void {
    const {
      duration = 300,
      delay = 0,
      easing = 'easeOut',
      onComplete,
    } = config;

    const easingFn = easings[easing];
    const startTime = performance.now() + delay;
    const diff = to - from;

    const tick = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      
      if (elapsed < 0) {
        this.animationId = requestAnimationFrame(tick);
        return;
      }

      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easingFn(progress);
      const currentValue = from + diff * easedProgress;

      onUpdate(currentValue);

      if (progress < 1) {
        this.animationId = requestAnimationFrame(tick);
      } else {
        onComplete?.();
      }
    };

    this.animationId = requestAnimationFrame(tick);

    return () => {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
      }
    };
  }

  animateMultiple(
    properties: Record<string, { from: number; to: number }>,
    config: AnimationConfig,
    onUpdate: (values: Record<string, number>) => void
  ): () => void {
    const {
      duration = 300,
      delay = 0,
      easing = 'easeOut',
      onComplete,
    } = config;

    const easingFn = easings[easing];
    const startTime = performance.now() + delay;

    const tick = (currentTime: number) => {
      const elapsed = currentTime - startTime;

      if (elapsed < 0) {
        this.animationId = requestAnimationFrame(tick);
        return;
      }

      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easingFn(progress);

      const values: Record<string, number> = {};
      for (const [key, { from, to }] of Object.entries(properties)) {
        values[key] = from + (to - from) * easedProgress;
      }

      onUpdate(values);

      if (progress < 1) {
        this.animationId = requestAnimationFrame(tick);
      } else {
        onComplete?.();
      }
    };

    this.animationId = requestAnimationFrame(tick);

    return () => {
      if (this.animationId) {
        cancelAnimationFrame(this.animationId);
      }
    };
  }
}

// =============================================================================
// Page Transitions
// =============================================================================

export class PageTransitions {
  private static container: HTMLElement | null = null;

  static setContainer(element: HTMLElement): void {
    this.container = element;
  }

  static async transition(
    from: HTMLElement,
    to: HTMLElement,
    config: PageTransitionConfig
  ): Promise<void> {
    const { type, duration = 300, easing = 'easeOut' } = config;

    const animations = this.getAnimationKeyframes(type);
    
    // Animate out
    await from.animate(animations.out, {
      duration,
      easing: this.getWebEasing(easing),
      fill: 'forwards',
    }).finished;

    from.style.display = 'none';
    to.style.display = 'block';

    // Animate in
    await to.animate(animations.in, {
      duration,
      easing: this.getWebEasing(easing),
      fill: 'forwards',
    }).finished;
  }

  private static getAnimationKeyframes(type: PageTransitionConfig['type']): {
    out: Keyframe[];
    in: Keyframe[];
  } {
    switch (type) {
      case 'fade':
        return {
          out: [{ opacity: 1 }, { opacity: 0 }],
          in: [{ opacity: 0 }, { opacity: 1 }],
        };
      case 'slide-left':
        return {
          out: [{ transform: 'translateX(0)' }, { transform: 'translateX(-100%)' }],
          in: [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }],
        };
      case 'slide-right':
        return {
          out: [{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }],
          in: [{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }],
        };
      case 'slide-up':
        return {
          out: [{ transform: 'translateY(0)' }, { transform: 'translateY(-100%)' }],
          in: [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
        };
      case 'slide-down':
        return {
          out: [{ transform: 'translateY(0)' }, { transform: 'translateY(100%)' }],
          in: [{ transform: 'translateY(-100%)' }, { transform: 'translateY(0)' }],
        };
      case 'scale':
        return {
          out: [
            { transform: 'scale(1)', opacity: 1 },
            { transform: 'scale(0.8)', opacity: 0 },
          ],
          in: [
            { transform: 'scale(1.2)', opacity: 0 },
            { transform: 'scale(1)', opacity: 1 },
          ],
        };
      case 'flip':
        return {
          out: [
            { transform: 'perspective(1000px) rotateY(0deg)' },
            { transform: 'perspective(1000px) rotateY(90deg)' },
          ],
          in: [
            { transform: 'perspective(1000px) rotateY(-90deg)' },
            { transform: 'perspective(1000px) rotateY(0deg)' },
          ],
        };
    }
  }

  private static getWebEasing(easing: EasingFunction): string {
    const map: Record<EasingFunction, string> = {
      linear: 'linear',
      easeIn: 'ease-in',
      easeOut: 'ease-out',
      easeInOut: 'ease-in-out',
      spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    };
    return map[easing];
  }
}

// =============================================================================
// Particle Effects
// =============================================================================

export class ParticleSystem {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private animationId: number | null = null;

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9999;
    `;
    this.ctx = this.canvas.getContext('2d')!;
    container.appendChild(this.canvas);

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  private resize = (): void => {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  };

  emit(x: number, y: number, config: ParticleConfig = {}): void {
    const {
      count = 30,
      colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'],
      size = { min: 5, max: 15 },
      speed = { min: 3, max: 8 },
      gravity = 0.15,
      spread = Math.PI * 2,
      lifetime = 2000,
    } = config;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * spread - spread / 2 - Math.PI / 2;
      const velocity = speed.min + Math.random() * (speed.max - speed.min);

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        size: size.min + Math.random() * (size.max - size.min),
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 1,
        decay: 1 / (lifetime / 16), // Assuming 60fps
        gravity,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
      });
    }

    if (!this.animationId) {
      this.animate();
    }
  }

  confetti(config?: ParticleConfig): void {
    const x = window.innerWidth / 2;
    const y = window.innerHeight / 2;
    this.emit(x, y, {
      count: 100,
      spread: Math.PI,
      ...config,
    });
  }

  private animate = (): void => {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.life -= p.decay;
      p.rotation += p.rotationSpeed;

      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate(p.rotation);
      this.ctx.globalAlpha = p.life;
      this.ctx.fillStyle = p.color;
      this.ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      this.ctx.restore();
    }

    if (this.particles.length > 0) {
      this.animationId = requestAnimationFrame(this.animate);
    } else {
      this.animationId = null;
    }
  };

  destroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    window.removeEventListener('resize', this.resize);
    this.canvas.remove();
  }
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  life: number;
  decay: number;
  gravity: number;
  rotation: number;
  rotationSpeed: number;
}

// =============================================================================
// Micro-interactions
// =============================================================================

export class MicroInteractions {
  static ripple(element: HTMLElement, event: MouseEvent | TouchEvent): void {
    const rect = element.getBoundingClientRect();
    const ripple = document.createElement('span');
    
    const x = 'touches' in event 
      ? event.touches[0].clientX - rect.left 
      : event.clientX - rect.left;
    const y = 'touches' in event 
      ? event.touches[0].clientY - rect.top 
      : event.clientY - rect.top;

    const size = Math.max(rect.width, rect.height) * 2;

    ripple.style.cssText = `
      position: absolute;
      width: ${size}px;
      height: ${size}px;
      left: ${x - size / 2}px;
      top: ${y - size / 2}px;
      background: currentColor;
      opacity: 0.3;
      border-radius: 50%;
      transform: scale(0);
      pointer-events: none;
      animation: ripple-effect 0.6s ease-out forwards;
    `;

    // Add keyframes if not exists
    if (!document.getElementById('ripple-styles')) {
      const style = document.createElement('style');
      style.id = 'ripple-styles';
      style.textContent = `
        @keyframes ripple-effect {
          to {
            transform: scale(1);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    element.style.position = 'relative';
    element.style.overflow = 'hidden';
    element.appendChild(ripple);

    setTimeout(() => ripple.remove(), 600);
  }

  static pulse(element: HTMLElement): void {
    element.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(1.05)' },
      { transform: 'scale(1)' },
    ], {
      duration: 200,
      easing: 'ease-in-out',
    });
  }

  static shake(element: HTMLElement): void {
    element.animate([
      { transform: 'translateX(0)' },
      { transform: 'translateX(-10px)' },
      { transform: 'translateX(10px)' },
      { transform: 'translateX(-10px)' },
      { transform: 'translateX(10px)' },
      { transform: 'translateX(0)' },
    ], {
      duration: 400,
      easing: 'ease-in-out',
    });
  }

  static bounce(element: HTMLElement): void {
    element.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(1.2)' },
      { transform: 'scale(0.9)' },
      { transform: 'scale(1.1)' },
      { transform: 'scale(1)' },
    ], {
      duration: 500,
      easing: 'ease-out',
    });
  }

  static heartbeat(element: HTMLElement): void {
    element.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(1.3)' },
      { transform: 'scale(1)' },
      { transform: 'scale(1.3)' },
      { transform: 'scale(1)' },
    ], {
      duration: 600,
      easing: 'ease-in-out',
    });
  }

  static float(element: HTMLElement, stop: boolean = false): void {
    if (stop) {
      element.getAnimations().forEach(a => a.cancel());
      return;
    }

    element.animate([
      { transform: 'translateY(0)' },
      { transform: 'translateY(-10px)' },
      { transform: 'translateY(0)' },
    ], {
      duration: 2000,
      iterations: Infinity,
      easing: 'ease-in-out',
    });
  }
}

// =============================================================================
// Loading Animations
// =============================================================================

export class LoadingAnimations {
  static skeleton(element: HTMLElement): () => void {
    element.classList.add('animate-pulse', 'bg-muted');
    
    return () => {
      element.classList.remove('animate-pulse', 'bg-muted');
    };
  }

  static shimmer(element: HTMLElement): () => void {
    const shimmer = document.createElement('div');
    shimmer.style.cssText = `
      position: absolute;
      top: 0;
      left: -100%;
      width: 100%;
      height: 100%;
      background: linear-gradient(
        90deg,
        transparent,
        rgba(255,255,255,0.3),
        transparent
      );
      animation: shimmer 1.5s infinite;
    `;

    if (!document.getElementById('shimmer-styles')) {
      const style = document.createElement('style');
      style.id = 'shimmer-styles';
      style.textContent = `
        @keyframes shimmer {
          to { left: 100%; }
        }
      `;
      document.head.appendChild(style);
    }

    element.style.position = 'relative';
    element.style.overflow = 'hidden';
    element.appendChild(shimmer);

    return () => shimmer.remove();
  }

  static spinner(container: HTMLElement, size: number = 40, color: string = 'currentColor'): () => void {
    const spinner = document.createElement('div');
    spinner.innerHTML = `
      <svg width="${size}" height="${size}" viewBox="0 0 50 50" style="animation: spin 1s linear infinite;">
        <circle cx="25" cy="25" r="20" fill="none" stroke="${color}" stroke-width="4" stroke-dasharray="80" stroke-linecap="round"/>
      </svg>
    `;
    spinner.style.cssText = 'display: flex; align-items: center; justify-content: center;';

    if (!document.getElementById('spinner-styles')) {
      const style = document.createElement('style');
      style.id = 'spinner-styles';
      style.textContent = `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    container.appendChild(spinner);

    return () => spinner.remove();
  }

  static dots(container: HTMLElement, color: string = 'currentColor'): () => void {
    const dots = document.createElement('div');
    dots.innerHTML = `
      <div style="display: flex; gap: 4px;">
        <div style="width: 8px; height: 8px; background: ${color}; border-radius: 50%; animation: bounce-dot 1.4s infinite ease-in-out both; animation-delay: -0.32s;"></div>
        <div style="width: 8px; height: 8px; background: ${color}; border-radius: 50%; animation: bounce-dot 1.4s infinite ease-in-out both; animation-delay: -0.16s;"></div>
        <div style="width: 8px; height: 8px; background: ${color}; border-radius: 50%; animation: bounce-dot 1.4s infinite ease-in-out both;"></div>
      </div>
    `;

    if (!document.getElementById('dots-styles')) {
      const style = document.createElement('style');
      style.id = 'dots-styles';
      style.textContent = `
        @keyframes bounce-dot {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }
      `;
      document.head.appendChild(style);
    }

    container.appendChild(dots);

    return () => dots.remove();
  }
}

// =============================================================================
// Number Counter
// =============================================================================

export class NumberCounter {
  private element: HTMLElement;
  private engine: AnimationEngine;
  private cancel: (() => void) | null = null;

  constructor(element: HTMLElement) {
    this.element = element;
    this.engine = new AnimationEngine();
  }

  countTo(
    target: number,
    config: AnimationConfig & { prefix?: string; suffix?: string; decimals?: number } = {}
  ): void {
    const { prefix = '', suffix = '', decimals = 0, ...animConfig } = config;
    const current = parseFloat(this.element.textContent?.replace(/[^0-9.-]/g, '') || '0');

    if (this.cancel) {
      this.cancel();
    }

    this.cancel = this.engine.animate(current, target, animConfig, (value) => {
      this.element.textContent = `${prefix}${value.toFixed(decimals)}${suffix}`;
    });
  }
}

// =============================================================================
// Exports
// =============================================================================

export const animationEngine = new AnimationEngine();

let particleSystemInstance: ParticleSystem | null = null;

export function getParticleSystem(): ParticleSystem {
  if (!particleSystemInstance) {
    particleSystemInstance = new ParticleSystem(document.body);
  }
  return particleSystemInstance;
}
