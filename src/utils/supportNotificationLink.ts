export const SUPPORT_CUSTOMER_SERVICE_PATH = "/settings/customer-service";

/**
 * Builds a deep-link for support reply notifications so users land directly
 * inside the relevant live chat ticket thread.
 */
export const buildSupportReplyLink = (data: any): string => {
  const ticketId = typeof data?.ticket_id === "string" ? data.ticket_id : "";
  const messageId = typeof data?.message_id === "string" ? data.message_id : "";

  if (!ticketId) {
    return SUPPORT_CUSTOMER_SERVICE_PATH;
  }

  const params = new URLSearchParams({
    mode: "live_chat",
    ticket_id: ticketId,
  });

  if (messageId) {
    params.set("message_id", messageId);
  }

  return `${SUPPORT_CUSTOMER_SERVICE_PATH}?${params.toString()}`;
};
