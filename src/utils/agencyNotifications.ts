/**
 * Agency Notification Utility
 * Sends notifications to agency owners for key events.
 */
import { supabase } from '@/integrations/supabase/client';

interface AgencyNotificationParams {
  agencyOwnerId: string;
  type: string;
  title: string;
  message: string;
  actionUrl?: string;
  data?: Record<string, unknown>;
}

export async function sendAgencyNotification({
  agencyOwnerId,
  type,
  title,
  message,
  actionUrl,
  data = {},
}: AgencyNotificationParams) {
  try {
    await supabase.from('notifications').insert({
      user_id: agencyOwnerId,
      type,
      title,
      message,
      data: {
        ...data,
        action_url: actionUrl || '/agency-dashboard',
      },
    });
  } catch (error) {
    console.warn('[AgencyNotif] Failed to send notification:', error);
  }
}

/**
 * Send host join request notification to agency owner.
 */
export async function notifyAgencyHostRequest(
  agencyId: string,
  hostName: string,
  hostUid?: string,
) {
  try {
    const { data: agency } = await supabase
      .from('agencies')
      .select('owner_id, name')
      .eq('id', agencyId)
      .single();

    if (!agency?.owner_id) return;

    await sendAgencyNotification({
      agencyOwnerId: agency.owner_id,
      type: 'agency_host_request',
      title: '🔔 New Host Join Request',
      message: `${hostName}${hostUid ? ` (UID: ${hostUid})` : ''} wants to join ${agency.name}. Tap to approve or reject.`,
      actionUrl: '/agency-dashboard',
      data: { agency_id: agencyId, host_name: hostName, host_uid: hostUid },
    });
  } catch (error) {
    console.warn('[AgencyNotif] Host request notification failed:', error);
  }
}

/**
 * Notify host about approval/rejection.
 */
export async function notifyHostApprovalResult(
  hostId: string,
  agencyName: string,
  approved: boolean,
) {
  try {
    await supabase.from('notifications').insert({
      user_id: hostId,
      type: approved ? 'agency_host_added' : 'agency_host_rejected',
      title: approved ? '✅ Agency Application Approved!' : '❌ Agency Application Rejected',
      message: approved
        ? `You have been approved to join ${agencyName}! Welcome aboard.`
        : `Your request to join ${agencyName} was declined.`,
      data: { action_url: approved ? '/agency-dashboard' : '/agency' },
    });
  } catch (error) {
    console.warn('[AgencyNotif] Host result notification failed:', error);
  }
}
