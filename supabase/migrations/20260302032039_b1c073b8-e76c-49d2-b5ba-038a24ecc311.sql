-- Delete AI auto-escalated ticket messages first (foreign key constraint)
DELETE FROM support_messages WHERE ticket_id IN (
  SELECT id FROM support_tickets WHERE category != 'live_chat'
);

-- Delete AI auto-escalated tickets (non-live_chat tickets created by AI escalation)
DELETE FROM support_tickets WHERE category != 'live_chat';
