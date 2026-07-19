import { useState, useCallback, useRef, useTransition } from 'react';
import { useToast } from '@/hooks/use-toast';
import { hapticFeedback } from '@/utils/nativeUtils';

interface OptimisticActionOptions<T, R> {
  onAction: (args: T) => Promise<R>;
  onOptimisticUpdate?: (args: T) => void;
  onSuccess?: (result: R, args: T) => void;
  onError?: (error: any, args: T) => void;
  successMessage?: string;
  errorMessage?: string;
  enableHaptics?: boolean;
}

/**
 * 🚀 useOptimisticAction
 * 
 * High-performance hook for instant button feedback and high-priority interactions.
 * Features:
 * - Immediate UI state change before server request
 * - Debouncing to prevent double-clicks
 * - Automatic error handling and rollback hints
 * - Integrated toast notifications
 * - React 18 Transitions for smoother non-blocking renders
 */
export function useOptimisticAction<T = void, R = any>(options: OptimisticActionOptions<T, R>) {
  const [isPending, setIsActionPending] = useState(false);
  const [isTransitioning, startTransition] = useTransition();
  const { toast } = useToast();
  const lastActionTimeRef = useRef(0);
  const DEBOUNCE_MS = 350; // Performance: slightly faster response than default

  const execute = useCallback(async (args: T) => {
    const now = Date.now();
    if (now - lastActionTimeRef.current < DEBOUNCE_MS) return;
    lastActionTimeRef.current = now;

    // 1. Instant Haptic Feedback (Native feeling)
    if (options.enableHaptics !== false) {
      hapticFeedback('light');
    }

    // 2. Instant optimistic update in a Transition (Keeps UI responsive)
    if (options.onOptimisticUpdate) {
      startTransition(() => {
        options.onOptimisticUpdate!(args);
      });
    }

    setIsActionPending(true);

    try {
      // 3. Perform the actual action
      const result = await options.onAction(args);

      // 4. Success feedback
      if (options.successMessage) {
        toast({
          title: "Success",
          description: options.successMessage,
        });
      }

      if (options.onSuccess) {
        options.onSuccess(result, args);
      }
      
      return result;
    } catch (error: any) {
      // 5. Error feedback & Rollback hint
      console.error('[OptimisticAction] Failed:', error);
      
      const desc = options.errorMessage || error?.message || "Something went wrong. Please try again.";
      
      toast({
        variant: "destructive",
      });

      if (options.onError) {
        options.onError(error, args);
      }
      
      throw error;
    } finally {
      setIsActionPending(false);
    }
  }, [options, toast, startTransition]);

  return {
    execute,
    isPending: isPending || isTransitioning,
  };
}

