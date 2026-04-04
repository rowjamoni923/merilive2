INSERT INTO admin_users (email, role, display_name, is_active, accepted_at) 
VALUES ('sazzadshifa776@gmail.com', 'owner', 'Sazzad Shifa', true, now())
ON CONFLICT (email) DO UPDATE SET role = 'owner', is_active = true;