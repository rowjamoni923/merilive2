import { useState, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

interface OptimisticActionOptions<T, R> {
  onAction: (args: T) => Promise<R>;
  onOptimisticUpdate?: (args: T) => void;
  onSuccess?: (result: R, args: T) => void;
  onError?: (error: any, args: T) => void;
  successMessage?: string;
  errorMessage?: string;
}

/**
 * 🚀 useOptimisticAction
 * 
 * High-performance hook for instant button feedback.
 * Features:
 * - Immediate UI state change before server request
 * - Debouncing to prevent double-clicks
 * - Automatic error handling and rollback hints
 * - Integrated toast notifications
 */
export function useOptimisticAction<T = void, R = any>(options: OptimisticActionOptions<T, R>) {
  const [isPending, setIsActionPending] = useState(false);
  const { toast } = useToast();
  const lastActionTimeRef = useRef(0);
  const DEBOUNCE_MS = 400; // Prevent rapid double taps

  const execute = useCallback(async (args: T) => {
    const now = Date.now();
    if (now - lastActionTimeRef.current < DEBOUNCE_MS) return;
    lastActionTimeRef.current = now;

    // 1. Instant optimistic update
    if (options.onOptimisticUpdate) {
      options.onOptimisticUpdate(args);
    }

    setIsActionPending(true);

    try {
      // 2. Perform the actual action
      const result = await options.onAction(args);

      // 3. Success feedback
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
      // 4. Error feedback & Rollback hint
      console.error('[OptimisticAction] Failed:', error);
      
      const desc = options.errorMessage || error?.message || "Something went wrong. Please try again.";
      
      toast({
        title: "Action Failed",
        description: desc,
        variant: "destructive",
      });

      if (options.onError) {
        options.onError(error, args);
      }
      
      throw error;
    } finally {
      setIsActionPending(false);
    }
  }, [options, toast]);

  return {
    execute,
    isPending,
  };
}
