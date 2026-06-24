import { useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getTaskDate } from "@/utils/taskDateUtils";

/**
 * Task Progress Tracking Hook
 * Tracks and updates daily task progress for users
 * 
 * Requirement types:
 * - first_live: User goes live for the first time today
 * - live_minutes: Total minutes streamed today
 * - viewers: Peak viewers in a single stream
 * - first_gift: Receive first gift today
 * - messages_sent: Number of messages sent today
 */

type TaskType =
  | 'first_live'
  | 'live_minutes'
  | 'viewers'
  | 'first_gift'
  | 'messages_sent'
  | 'followers'
  | 'watch_live'
  | 'send_gift'
  | 'share_app';

interface TaskProgressUpdate {
  taskType: TaskType;
  value?: number;
  increment?: number;
}


export const useTaskProgress = () => {
  const userIdRef = useRef<string | null>(null);
  const tasksRef = useRef<Map<string, { id: string; requirement_type: string; requirement_value: number }[]>>(new Map());

  // Initialize - fetch user and active tasks
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        userIdRef.current = user.id;
        
        // Fetch active tasks
        const { data: tasks } = await supabase
          .from('daily_tasks')
          .select('id, requirement_type, requirement_value')
          .eq('is_active', true);
        
        if (tasks) {
          tasks.forEach(task => {
            const existing = tasksRef.current.get(task.requirement_type) || [];
            existing.push({
              id: task.id,
              requirement_type: task.requirement_type,
              requirement_value: task.requirement_value
            });
            tasksRef.current.set(task.requirement_type, existing);
          });
        }
      }
    };
    
    init();
  }, []);

  /**
   * Update task progress for a specific task type
   */
  const updateProgress = useCallback(async (update: TaskProgressUpdate) => {
    const userId = userIdRef.current;
    if (!userId) {
      console.log('[TaskProgress] No user logged in');
      return;
    }

    try {
      const { data, error } = await supabase.rpc('update_task_progress', {
        _task_type: update.taskType,
        _value: update.value ?? null,
        _increment: update.increment ?? null
      });

      if (error) {
        console.error('[TaskProgress] RPC error:', error.message);
        return;
      }

      console.log('[TaskProgress] Server response:', update.taskType, data);
    } catch (error) {
      console.error('[TaskProgress] Error updating progress:', error);
    }
  }, []);

  // Convenience methods for each task type
  const trackFirstLive = useCallback(() => {
    updateProgress({ taskType: 'first_live', value: 1 });
  }, [updateProgress]);

  const trackLiveMinutes = useCallback((minutes: number) => {
    updateProgress({ taskType: 'live_minutes', increment: minutes });
  }, [updateProgress]);

  const trackPeakViewers = useCallback((viewers: number) => {
    updateProgress({ taskType: 'viewers', value: viewers });
  }, [updateProgress]);

  const trackFirstGift = useCallback(() => {
    updateProgress({ taskType: 'first_gift', value: 1 });
  }, [updateProgress]);

  const trackMessageSent = useCallback(() => {
    updateProgress({ taskType: 'messages_sent', increment: 1 });
  }, [updateProgress]);

  // Server derives from `followers` table — just trigger a recompute
  const trackFollowerGained = useCallback(() => {
    updateProgress({ taskType: 'followers' });
  }, [updateProgress]);

  // Server derives from `stream_viewers` table — call when user enters a live
  const trackWatchLive = useCallback(() => {
    updateProgress({ taskType: 'watch_live' });
  }, [updateProgress]);

  // Server derives from `gift_transactions` (sender_id) — call after a successful send
  const trackGiftSent = useCallback(() => {
    updateProgress({ taskType: 'send_gift' });
  }, [updateProgress]);

  // Idempotent share-tap log (server enforces 1/day)
  const trackShareApp = useCallback(() => {
    updateProgress({ taskType: 'share_app', increment: 1 });
  }, [updateProgress]);

  return {
    updateProgress,
    trackFirstLive,
    trackLiveMinutes,
    trackPeakViewers,
    trackFirstGift,
    trackMessageSent,
    trackFollowerGained,
    trackWatchLive,
    trackGiftSent,
    trackShareApp,
  };
};

// Singleton instance for use outside of React components
let taskProgressInstance: ReturnType<typeof useTaskProgress> | null = null;

/**
 * Standalone task progress tracker for use outside React components
 * Useful in edge functions, callbacks, etc.
 */
export const trackTaskProgress = async (
  taskType: TaskType,
  options?: { value?: number; increment?: number }
) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  try {
    const { data, error } = await supabase.rpc('update_task_progress', {
      _task_type: taskType,
      _value: options?.value ?? null,
      _increment: options?.increment ?? null
    });

    if (error) {
      console.error('[TaskProgress] RPC error:', error.message);
      return;
    }

    console.log('[TaskProgress] Server response:', taskType, data);
  } catch (error) {
    console.error('[TaskProgress] Error:', error);
  }
};

