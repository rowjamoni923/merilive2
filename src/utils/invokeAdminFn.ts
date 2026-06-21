/**
 * Wrapper around supabase.functions.invoke() for the admin panel.
 * Logs every failure into the admin error log + toasts the admin.
 *
 * Usage:
 *   const { data, error } = await invokeAdminFn('admin-chat-inspector', { body: { ... } });
 */
import { adminSupabase } from "@/integrations/supabase/adminClient";
import { recordAdminError } from "@/utils/adminErrorLog";
import { maybeTriggerAuthGuardFromError } from "@/lib/authGuard";

export async function invokeAdminFn<T = unknown>(
  name: string,
  options?: { body?: unknown; headers?: Record<string, string> }
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const { data, error } = await adminSupabase.functions.invoke(name, options as any);
    if (error) {
      const status = (error as any)?.context?.status;
      if (status === 401) maybeTriggerAuthGuardFromError({ status: 401 });
      recordAdminError({
        kind: 'edge',
        label: `fn:${name}`,
        message: error.message || String(error),
        detail: (error as any)?.context ? JSON.stringify((error as any).context).slice(0, 1000) : undefined,
      });
      return { data: null, error: error as unknown as Error };
    }
    return { data: data as T, error: null };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    recordAdminError({
      kind: 'edge',
      label: `fn:${name}`,
      message: err.message,
      detail: err.stack?.slice(0, 1000),
    });
    return { data: null, error: err };
  }
}
