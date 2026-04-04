-- Add host_contact_violations to realtime publication for instant updates
ALTER PUBLICATION supabase_realtime ADD TABLE host_contact_violations;

-- Set REPLICA IDENTITY FULL for proper realtime event data
ALTER TABLE host_contact_violations REPLICA IDENTITY FULL;