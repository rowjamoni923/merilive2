
UPDATE agency_policy_settings SET section_title = 'Rules & Regulations', content = '{"items":["Agency code must not be shared with anyone","Each host must be managed properly","Agency name and branding must be maintained appropriately","All transactions must be conducted transparently"]}'::jsonb WHERE section_key = 'rules';

UPDATE agency_policy_settings SET section_title = 'Commission Policy', content = '{"items":["Commission is calculated weekly","Commission rate varies according to agency level","Commission is credited directly to the agency wallet","Minimum balance is required to withdraw commission"]}'::jsonb WHERE section_key = 'commission';

UPDATE agency_policy_settings SET section_title = 'Penalties & Sanctions', content = '{"items":["Warnings will be issued for rule violations","Repeated violations may result in agency suspension","Fraudulent activities will lead to permanent agency closure","Action will be taken for misconduct with hosts"]}'::jsonb WHERE section_key = 'penalties';

UPDATE agency_policy_settings SET section_title = 'Benefits', content = '{"items":["Agency dashboard access","Host performance tracking","Weekly and monthly reports","Premium support"]}'::jsonb WHERE section_key = 'benefits';

UPDATE agency_policy_settings SET section_title = 'Withdrawal Policy', content = '{"items":["Maximum one withdrawal per day","Minimum withdrawal amount is 100 diamonds","Withdrawal processing time is 1-3 business days","Withdrawals are only possible to verified payment methods"]}'::jsonb WHERE section_key = 'withdrawal';

UPDATE agency_policy_settings SET section_title = 'Host Management', content = '{"items":["An agency can have a maximum of 100 hosts","Every host must be verified","Host performance must be monitored","Non-performing hosts will be warned"]}'::jsonb WHERE section_key = 'host_management';

UPDATE agency_policy_settings SET section_title = 'Privacy Policy', content = '{"items":["Hosts personal information must be kept confidential","Agency information cannot be shared with third parties","All data must be stored securely","Information cannot be collected without user permission"]}'::jsonb WHERE section_key = 'privacy';
