-- Add admin role to the user
INSERT INTO user_roles (user_id, role) 
VALUES ('303f6684-e8c1-43e1-b090-fc30ba15bdd9', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;