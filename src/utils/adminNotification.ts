import { supabase } from "@/integrations/supabase/client";

/**
 * Send notification to a user from admin panel.
 * Uses admin_send_notification RPC which bypasses RLS.
 */
export async function adminSendNotification(
  userId: string,
  title: string,
  message: string,
  type: string = 'system',
  data?: Record<string, unknown>
): Promise<string | null> {
  const { data: notifId, error } = await supabase.rpc('admin_send_notification' as any, {
    _user_id: userId,
    _title: title,
    _message: message,
    _type: type,
    _data: data ?? null,
  });

  if (error) {
    console.error('[adminSendNotification] Error:', error.message);
    throw error;
  }

  return notifId as string | null;
}
