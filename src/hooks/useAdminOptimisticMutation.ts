import { useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * 🚀 Admin Optimistic Mutation Hook
 * 
 * Provides instant UI feedback for admin actions (ban, approve, delete, update).
 * Changes reflect immediately while the backend processes in the background.
 * On failure, automatically rolls back to the previous state.
 * 
 * Usage:
 * ```tsx
 * const { optimisticUpdate, optimisticDelete, optimisticInsert } = useAdminOptimisticMutation<User>();
 * 
 * // Ban a user — instant UI update
 * await optimisticUpdate({
 *   table: 'profiles',
 *   id: userId,
 *   updates: { is_banned: true },
 *   setData: setUsers,
 *   successMessage: 'User banned',
 * });
 * ```
 */

type SetDataFn<T> = React.Dispatch<React.SetStateAction<T[]>>;

interface OptimisticUpdateOptions<T> {
  table: string;
  id: string;
  updates: Partial<T>;
  setData: SetDataFn<T>;
  idField?: keyof T;
  successMessage?: string;
  errorMessage?: string;
  /** Extra match filters beyond the id */
  matchFilters?: Record<string, any>;
  /** Called after successful backend confirmation */
  onSuccess?: (data: T) => void;
}

interface OptimisticDeleteOptions<T> {
  table: string;
  id: string;
  setData: SetDataFn<T>;
  idField?: keyof T;
  successMessage?: string;
  errorMessage?: string;
  matchFilters?: Record<string, any>;
  onSuccess?: () => void;
}

interface OptimisticInsertOptions<T> {
  table: string;
  newItem: Partial<T>;
  setData: SetDataFn<T>;
  /** Where to insert: 'start' (default) or 'end' */
  position?: 'start' | 'end';
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: (data: T) => void;
}

export function useAdminOptimisticMutation<T extends Record<string, any>>() {
  const pendingOps = useRef(new Set<string>());

  const optimisticUpdate = useCallback(async (options: OptimisticUpdateOptions<T>) => {
    const {
      table, id, updates, setData,
      idField = 'id' as keyof T,
      successMessage = 'Updated successfully',
      errorMessage = 'Update failed — reverted',
      matchFilters = {},
      onSuccess,
    } = options;

    const opKey = `update-${table}-${id}`;
    if (pendingOps.current.has(opKey)) return;
    pendingOps.current.add(opKey);

    // Snapshot for rollback
    let snapshot: T[] = [];

    // 1. Instant UI update
    setData(prev => {
      snapshot = prev;
      return prev.map(item =>
        String(item[idField]) === id ? { ...item, ...updates } : item
      );
    });

    try {
      // 2. Backend mutation
      let query = (supabase as any).from(table).update(updates).eq(idField as string, id);
      for (const [key, value] of Object.entries(matchFilters)) {
        query = query.eq(key, value);
      }
      const { data, error } = await query.select().single();
      if (error) throw error;

      toast.success(successMessage);
      onSuccess?.(data as T);
    } catch (err) {
      // 3. Rollback
      setData(snapshot);
      toast.error(errorMessage, {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      pendingOps.current.delete(opKey);
    }
  }, []);

  const optimisticDelete = useCallback(async (options: OptimisticDeleteOptions<T>) => {
    const {
      table, id, setData,
      idField = 'id' as keyof T,
      successMessage = 'Deleted successfully',
      errorMessage = 'Delete failed — restored',
      matchFilters = {},
      onSuccess,
    } = options;

    const opKey = `delete-${table}-${id}`;
    if (pendingOps.current.has(opKey)) return;
    pendingOps.current.add(opKey);

    let snapshot: T[] = [];

    setData(prev => {
      snapshot = prev;
      return prev.filter(item => String(item[idField]) !== id);
    });

    try {
      let query = (supabase as any).from(table).delete().eq(idField as string, id);
      for (const [key, value] of Object.entries(matchFilters)) {
        query = query.eq(key, value);
      }
      const { error } = await query;
      if (error) throw error;

      toast.success(successMessage);
      onSuccess?.();
    } catch (err) {
      setData(snapshot);
      toast.error(errorMessage, {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      pendingOps.current.delete(opKey);
    }
  }, []);

  const optimisticInsert = useCallback(async (options: OptimisticInsertOptions<T>) => {
    const {
      table, newItem, setData,
      position = 'start',
      successMessage = 'Created successfully',
      errorMessage = 'Creation failed — removed',
      onSuccess,
    } = options;

    const tempId = `temp-${Date.now()}`;
    const tempItem = { ...newItem, id: tempId } as unknown as T;

    const opKey = `insert-${table}-${tempId}`;
    pendingOps.current.add(opKey);

    // Instant UI
    setData(prev =>
      position === 'start' ? [tempItem, ...prev] : [...prev, tempItem]
    );

    try {
      const { id: _skipTempId, ...insertData } = newItem as any;
      const { data, error } = await (supabase as any).from(table).insert(insertData).select().single();
      if (error) throw error;

      // Replace temp item with real data
      setData(prev =>
        prev.map(item => (item as any).id === tempId ? (data as T) : item)
      );

      toast.success(successMessage);
      onSuccess?.(data as T);
    } catch (err) {
      // Remove temp item
      setData(prev => prev.filter(item => (item as any).id !== tempId));
      toast.error(errorMessage, {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      pendingOps.current.delete(opKey);
    }
  }, []);

  return { optimisticUpdate, optimisticDelete, optimisticInsert };
}
