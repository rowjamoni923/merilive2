-- Update notification templates to English
UPDATE notification_templates SET 
  title_template = '🔐 Agency Verification Code',
  message_template = 'Your agency verification code is: {{code}}

Use this code to create the {{agency_name}} agency.

⚠️ This code will expire in 10 minutes. Do not share it with anyone.',
  description = 'Template for agency UID verification code'
WHERE template_key = 'agency_verification_code';

UPDATE notification_templates SET 
  title_template = '🎉 Agency Created Successfully!',
  message_template = 'Congratulations! Your agency "{{agency_name}}" has been successfully created.

Agency Code: {{agency_code}}

You can now add hosts and manage your agency.',
  description = 'Success message after agency creation'
WHERE template_key = 'agency_created';

UPDATE notification_templates SET 
  title_template = '👋 Welcome!',
  message_template = 'Welcome to our app {{display_name}}! 

You can now watch live streams, send gifts, and enjoy other features.',
  description = 'Welcome message for new users'
WHERE template_key = 'welcome_message';

UPDATE notification_templates SET 
  title_template = '🎉 Agency Created!',
  message_template = 'Congratulations! Your agency "{{agency_name}}" has been successfully created.

Agency Code: {{agency_code}}

You can now invite hosts and earn commissions.',
  description = 'Notification sent when agency is approved'
WHERE template_key = 'agency_approved';

UPDATE notification_templates SET 
  title_template = '🎉 Joined Agency!',
  message_template = 'Congratulations! You have joined "{{agency_name}}" as a host. Start live streaming and earn now!',
  description = 'When a host joins an agency'
WHERE template_key = 'agency_host_added';