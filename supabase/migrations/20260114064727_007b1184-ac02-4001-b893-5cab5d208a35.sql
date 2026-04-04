-- Add admin role to the new user
INSERT INTO public.user_roles (user_id, role)
VALUES ('b1a1469b-15e3-4068-90f9-5d53dd66c8cf', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;