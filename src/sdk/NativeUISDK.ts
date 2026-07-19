/**
 * =============================================================================
 * MeriLive Native UI SDK
 * =============================================================================
 * 
 * Native-like UI utilities:
 * - Haptic Feedback
 * - Native Dialogs
 * - Toast Notifications
 * - Pull to Refresh
 * - Swipe Gestures
 * - Status Bar Control
 * - Keyboard Management
 * 
 * =============================================================================
 */

import { Capacitor } from '@capacitor/core';

// =============================================================================
// Types
// =============================================================================

export type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

export interface NativeDialogOptions {
  title: string;
  message: string;
  okButtonTitle?: string;
  cancelButtonTitle?: string;
}

export interface NativeActionSheetOption {
  title: string;
  icon?: string;
  destructive?: boolean;
}

export interface ToastOptions {
  message: string;
  duration?: 'short' | 'long';
  position?: 'top' | 'center' | 'bottom';
}

export interface SwipeGestureConfig {
  threshold?: number;
  direction?: 'horizontal' | 'vertical' | 'all';
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
}

// =============================================================================
// Haptic Feedback
// =============================================================================

export class HapticFeedback {
  private static isNative = Capacitor.isNativePlatform();

  static async impact(type: HapticType = 'medium'): Promise<void> {
    if (!this.isNative) {
      // Web fallback - vibrate API
      if ('vibrate' in navigator) {
        const patterns: Record<HapticType, number[]> = {
          light: [10],
          medium: [20],
          heavy: [30],
          success: [10, 50, 10],
          warning: [20, 100, 20],
          error: [50, 100, 50, 100, 50],
          selection: [5],
        };
        navigator.vibrate(patterns[type]);
      }
      return;
    }

    try {
      const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');

      switch (type) {
        case 'light':
          await Haptics.impact({ style: ImpactStyle.Light });
          break;
        case 'medium':
          await Haptics.impact({ style: ImpactStyle.Medium });
          break;
        case 'heavy':
          await Haptics.impact({ style: ImpactStyle.Heavy });
          break;
        case 'success':
          await Haptics.notification({ type: NotificationType.Success });
          break;
        case 'warning':
          await Haptics.notification({ type: NotificationType.Warning });
          break;
        case 'error':
          await Haptics.notification({ type: NotificationType.Error });
          break;
        case 'selection':
          await Haptics.selectionStart();
          await Haptics.selectionEnd();
          break;
      }
    } catch (error) {
      console.warn('[Haptic] Error:', error);
    }
  }

  static async vibrate(duration: number = 100): Promise<void> {
    if (this.isNative) {
      try {
        const { Haptics } = await import('@capacitor/haptics');
        await Haptics.vibrate({ duration });
      } catch {
        if ('vibrate' in navigator) {
          navigator.vibrate(duration);
        }
      }
    } else if ('vibrate' in navigator) {
      navigator.vibrate(duration);
    }
  }
}

// =============================================================================
// Native Dialogs
// =============================================================================

export class NativeDialogs {
  private static isNative = Capacitor.isNativePlatform();

  static async alert(options: NativeDialogOptions): Promise<void> {
    if (this.isNative) {
      try {
        const { Dialog } = await import('@capacitor/dialog');
        await Dialog.alert({
          title: options.title,
          message: options.message,
          buttonTitle: options.okButtonTitle || 'OK',
        });
        return;
      } catch (e) {
        console.warn('[Dialog] Native alert failed:', e);
      }
    }

    // Web fallback
    window.alert(`${options.title}\n\n${options.message}`);
  }

  static async confirm(options: NativeDialogOptions): Promise<boolean> {
    if (this.isNative) {
      try {
        const { Dialog } = await import('@capacitor/dialog');
        const result = await Dialog.confirm({
          okButtonTitle: options.okButtonTitle || 'Yes',
          cancelButtonTitle: options.cancelButtonTitle || 'No',
        });
        return result.value;
      } catch (e) {
        console.warn('[Dialog] Native confirm failed:', e);
      }
    }

    return window.confirm(`${options.title}\n\n${options.message}`);
  }

  static async prompt(options: NativeDialogOptions & { inputPlaceholder?: string }): Promise<string | null> {
    if (this.isNative) {
      try {
        const { Dialog } = await import('@capacitor/dialog');
        const result = await Dialog.prompt({
          inputPlaceholder: options.inputPlaceholder,
        });
        return result.cancelled ? null : result.value;
      } catch (e) {
        console.warn('[Dialog] Native prompt failed:', e);
      }
    }

    return window.prompt(`${options.title}\n\n${options.message}`);
  }

  static async actionSheet(
    options: NativeActionSheetOption[]
  ): Promise<number> {
    if (this.isNative) {
      try {
        const { ActionSheet, ActionSheetButtonStyle } = await import('@capacitor/action-sheet');
        const result = await ActionSheet.showActions({
          title,
            style: opt.destructive ? ActionSheetButtonStyle.Destructive : ActionSheetButtonStyle.Default,
          })),
        });
        return result.index;
      } catch (e) {
        console.warn('[ActionSheet] Native failed:', e);
      }
    }

    // Web fallback - simple prompt
    const optionText = options.map((o, i) => `${i + 1}. ${o.title}`).join('\n');
    const result = window.prompt(`${title}\n\n${optionText}\n\nEnter number:`);
    return result ? parseInt(result) - 1 : -1;
  }
}

// =============================================================================
// Status Bar Control
// =============================================================================

export class StatusBarControl {
  private static isNative = Capacitor.isNativePlatform();

  static async setStyle(style: 'dark' | 'light'): Promise<void> {
    if (!this.isNative) return;

    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({ style: style === 'dark' ? Style.Dark : Style.Light });
    } catch (e) {
      console.warn('[StatusBar] setStyle failed:', e);
    }
  }

  static async setBackgroundColor(color: string): Promise<void> {
    if (!this.isNative) return;

    try {
      const { StatusBar } = await import('@capacitor/status-bar');
      await StatusBar.setBackgroundColor({ color });
    } catch (e) {
      console.warn('[StatusBar] setBackgroundColor failed:', e);
    }
  }

  static async hide(): Promise<void> {
    if (!this.isNative) return;

    try {
      const { StatusBar } = await import('@capacitor/status-bar');
      await StatusBar.hide();
    } catch (e) {
      console.warn('[StatusBar] hide failed:', e);
    }
  }

  static async show(): Promise<void> {
    if (!this.isNative) return;

    try {
      const { StatusBar } = await import('@capacitor/status-bar');
      await StatusBar.show();
    } catch (e) {
      console.warn('[StatusBar] show failed:', e);
    }
  }

  static async setOverlaysWebView(overlay: boolean): Promise<void> {
    if (!this.isNative) return;

    try {
      const { StatusBar } = await import('@capacitor/status-bar');
      await StatusBar.setOverlaysWebView({ overlay });
    } catch (e) {
      console.warn('[StatusBar] setOverlaysWebView failed:', e);
    }
  }
}

// =============================================================================
// Native Toast
// =============================================================================

export class NativeToast {
  static async show(options: ToastOptions): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      try {
        const { Toast } = await import('@capacitor/toast');
        await Toast.show({
          text: options.message,
          duration: options.duration === 'long' ? 'long' : 'short',
          position: options.position || 'bottom',
        });
        return;
      } catch (e) {
        console.warn('[Toast] Native failed:', e);
      }
    }

    // Web fallback - custom toast
    this.showWebToast(options);
  }

  private static showWebToast(options: ToastOptions): void {
    const toast = document.createElement('div');
    toast.className = `
      fixed z-[9999] px-4 py-3 rounded-lg bg-gray-900 text-white text-sm
      shadow-lg transform transition-all duration-300
      ${options.position === 'top' ? 'top-4' : options.position === 'center' ? 'top-1/2 -translate-y-1/2' : 'bottom-4'}
      left-1/2 -translate-x-1/2 opacity-0
    `;
    toast.textContent = options.message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
    });

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, options.duration === 'long' ? 3500 : 2000);
  }
}

// =============================================================================
// Swipe Gesture Detector
// =============================================================================

export class SwipeGestureDetector {
  private element: HTMLElement;
  private config: SwipeGestureConfig;
  private startX: number = 0;
  private startY: number = 0;
  private isTracking: boolean = false;

  constructor(element: HTMLElement, config: SwipeGestureConfig) {
    this.element = element;
    this.config = {
      threshold: 50,
      direction: 'all',
      ...config,
    };

    this.bindEvents();
  }

  private bindEvents(): void {
    this.element.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    this.element.addEventListener('touchmove', this.handleTouchMove, { passive: true });
    this.element.addEventListener('touchend', this.handleTouchEnd, { passive: true });
  }

  private handleTouchStart = (e: TouchEvent): void => {
    this.startX = e.touches[0].clientX;
    this.startY = e.touches[0].clientY;
    this.isTracking = true;
  };

  private handleTouchMove = (_e: TouchEvent): void => {
    // Optional: Add visual feedback during swipe
  };

  private handleTouchEnd = (e: TouchEvent): void => {
    if (!this.isTracking) return;
    this.isTracking = false;

    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const diffX = endX - this.startX;
    const diffY = endY - this.startY;
    const threshold = this.config.threshold!;

    const isHorizontal = this.config.direction === 'horizontal' || this.config.direction === 'all';
    const isVertical = this.config.direction === 'vertical' || this.config.direction === 'all';

    if (isHorizontal && Math.abs(diffX) > threshold && Math.abs(diffX) > Math.abs(diffY)) {
      if (diffX > 0) {
        HapticFeedback.impact('light');
        this.config.onSwipeRight?.();
      } else {
        HapticFeedback.impact('light');
        this.config.onSwipeLeft?.();
      }
    }

    if (isVertical && Math.abs(diffY) > threshold && Math.abs(diffY) > Math.abs(diffX)) {
      if (diffY > 0) {
        HapticFeedback.impact('light');
        this.config.onSwipeDown?.();
      } else {
        HapticFeedback.impact('light');
        this.config.onSwipeUp?.();
      }
    }
  };

  destroy(): void {
    this.element.removeEventListener('touchstart', this.handleTouchStart);
    this.element.removeEventListener('touchmove', this.handleTouchMove);
    this.element.removeEventListener('touchend', this.handleTouchEnd);
  }
}

// =============================================================================
// Pull to Refresh
// =============================================================================

export class PullToRefresh {
  private element: HTMLElement;
  private onRefresh: () => Promise<void>;
  private threshold: number;
  private startY: number = 0;
  private currentY: number = 0;
  private isRefreshing: boolean = false;
  private indicator: HTMLElement | null = null;

  constructor(
    element: HTMLElement,
    onRefresh: () => Promise<void>,
    threshold: number = 80
  ) {
    this.element = element;
    this.onRefresh = onRefresh;
    this.threshold = threshold;

    this.createIndicator();
    this.bindEvents();
  }

  private createIndicator(): void {
    this.indicator = document.createElement('div');
    this.indicator.className = `
      fixed top-0 left-1/2 -translate-x-1/2 z-50
      w-10 h-10 rounded-full bg-primary/10 backdrop-blur
      flex items-center justify-center
      transform -translate-y-full transition-transform
    `;
    this.indicator.innerHTML = `
      <svg class="w-6 h-6 text-primary animate-spin hidden" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" stroke-dasharray="40" stroke-dashoffset="10"/>
      </svg>
      <svg class="w-6 h-6 text-primary arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 5v14M5 12l7-7 7 7"/>
      </svg>
    `;
    document.body.appendChild(this.indicator);
  }

  private bindEvents(): void {
    this.element.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    this.element.addEventListener('touchmove', this.handleTouchMove, { passive: false });
    this.element.addEventListener('touchend', this.handleTouchEnd, { passive: true });
  }

  private handleTouchStart = (e: TouchEvent): void => {
    if (this.element.scrollTop === 0 && !this.isRefreshing) {
      this.startY = e.touches[0].clientY;
    }
  };

  private handleTouchMove = (e: TouchEvent): void => {
    if (this.isRefreshing || this.element.scrollTop > 0) return;

    this.currentY = e.touches[0].clientY;
    const diff = this.currentY - this.startY;

    if (diff > 0) {
      e.preventDefault();
      const progress = Math.min(diff / this.threshold, 1);
      
      if (this.indicator) {
        this.indicator.style.transform = `translateX(-50%) translateY(${diff * 0.5}px)`;
        const arrow = this.indicator.querySelector('.arrow') as HTMLElement;
        if (arrow) {
          arrow.style.transform = `rotate(${progress * 180}deg)`;
        }
      }
    }
  };

  private handleTouchEnd = async (): Promise<void> => {
    const diff = this.currentY - this.startY;
    
    if (diff > this.threshold && !this.isRefreshing) {
      this.isRefreshing = true;
      HapticFeedback.impact('medium');

      if (this.indicator) {
        const spinner = this.indicator.querySelector('.animate-spin') as HTMLElement;
        const arrow = this.indicator.querySelector('.arrow') as HTMLElement;
        if (spinner) spinner.classList.remove('hidden');
        if (arrow) arrow.classList.add('hidden');
      }

      try {
        await this.onRefresh();
      } finally {
        this.isRefreshing = false;
        this.resetIndicator();
      }
    } else {
      this.resetIndicator();
    }

    this.startY = 0;
    this.currentY = 0;
  };

  private resetIndicator(): void {
    if (this.indicator) {
      this.indicator.style.transform = 'translateX(-50%) translateY(-100%)';
      const spinner = this.indicator.querySelector('.animate-spin') as HTMLElement;
      const arrow = this.indicator.querySelector('.arrow') as HTMLElement;
      if (spinner) spinner.classList.add('hidden');
      if (arrow) {
        arrow.classList.remove('hidden');
        arrow.style.transform = 'rotate(0deg)';
      }
    }
  }

  destroy(): void {
    this.element.removeEventListener('touchstart', this.handleTouchStart);
    this.element.removeEventListener('touchmove', this.handleTouchMove);
    this.element.removeEventListener('touchend', this.handleTouchEnd);
    this.indicator?.remove();
  }
}

// =============================================================================
// Keyboard Manager
// =============================================================================

export class KeyboardManager {
  private static isNative = Capacitor.isNativePlatform();

  static async hide(): Promise<void> {
    if (!this.isNative) {
      (document.activeElement as HTMLElement)?.blur();
      return;
    }

    try {
      const { Keyboard } = await import('@capacitor/keyboard');
      await Keyboard.hide();
    } catch (e) {
      (document.activeElement as HTMLElement)?.blur();
    }
  }

  static onShow(callback: (height: number) => void): () => void {
    if (!this.isNative) return () => {};

    let listenerHandle: any = null;

    import('@capacitor/keyboard').then(async ({ Keyboard }) => {
      listenerHandle = await Keyboard.addListener('keyboardWillShow', (info) => {
        callback(info.keyboardHeight);
      });
    });

    return () => listenerHandle?.remove();
  }

  static onHide(callback: () => void): () => void {
    if (!this.isNative) return () => {};

    let listenerHandle: any = null;

    import('@capacitor/keyboard').then(async ({ Keyboard }) => {
      listenerHandle = await Keyboard.addListener('keyboardWillHide', () => {
        callback();
      });
    });

    return () => listenerHandle?.remove();
  }
}

// =============================================================================
// Share Utility
// =============================================================================

export class NativeShare {
  static async share(options: {
    title?: string;
    text?: string;
    url?: string;
    files?: File[];
  }): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        const { Share } = await import('@capacitor/share');
        await Share.share({
          dialogTitle: 'Share',
        });
        return true;
      } catch (e) {
        console.warn('[Share] Native failed:', e);
      }
    }

    // Web fallback
    if (navigator.share) {
      try {
        await navigator.share(options);
        return true;
      } catch {
        return false;
      }
    }

    // Clipboard fallback
    if (options.url) {
      await navigator.clipboard.writeText(options.url);
      NativeToast.show({ message: 'Link copied' });
      return true;
    }

    return false;
  }
}

// =============================================================================
// Clipboard
// =============================================================================

export class NativeClipboard {
  static async copy(text: string): Promise<boolean> {
    if (Capacitor.isNativePlatform()) {
      try {
        const { Clipboard } = await import('@capacitor/clipboard');
        await Clipboard.write({ string: text });
        HapticFeedback.impact('light');
        return true;
      } catch (e) {
        console.warn('[Clipboard] Native failed:', e);
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  static async read(): Promise<string | null> {
    if (Capacitor.isNativePlatform()) {
      try {
        const { Clipboard } = await import('@capacitor/clipboard');
        const result = await Clipboard.read();
        return result.value;
      } catch (e) {
        console.warn('[Clipboard] Native failed:', e);
      }
    }

    try {
      return await navigator.clipboard.readText();
    } catch {
      return null;
    }
  }
}
