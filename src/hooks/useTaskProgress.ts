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

interface TaskProgressUpdate {
  taskType: 'first_live' | 'live_minutes' | 'viewers' | 'first_gift' | 'messages_sent';
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

  return {
    updateProgress,
    trackFirstLive,
    trackLiveMinutes,
    trackPeakViewers,
    trackFirstGift,
    trackMessageSent
  };
};

// Singleton instance for use outside of React components
let taskProgressInstance: ReturnType<typeof useTaskProgress> | null = null;

/**
 * Standalone task progress tracker for use outside React components
 * Useful in edge functions, callbacks, etc.
 */
export const trackTaskProgress = async (
  taskType: 'first_live' | 'live_minutes' | 'viewers' | 'first_gift' | 'messages_sent',
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
