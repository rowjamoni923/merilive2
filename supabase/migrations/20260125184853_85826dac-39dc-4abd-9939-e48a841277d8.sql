-- Add missing agency notification templates with correct column names
INSERT INTO notification_templates (template_key, title_template, message_template, description)
VALUES 
  ('agency_request_approved', 'Agency Request Approved! 🎉', 'Congratulations! Your request to join the agency has been approved. Welcome to the team!', 'Sent when agency approves a host join request'),
  ('agency_request_rejected', 'Agency Request Update', 'Your agency join request has been reviewed. Please contact the agency for more details.', 'Sent when agency rejects a host join request'),
  ('agency_host_removed', 'Agency Update', 'You have been removed from the agency. Contact support if you have questions.', 'Sent when host is removed from agency'),
  ('agency_host_transferred', 'Agency Transfer', 'You have been transferred to a new agency. Check your agency dashboard for details.', 'Sent when host is transferred between agencies')
ON CONFLICT (template_key) DO NOTHING;