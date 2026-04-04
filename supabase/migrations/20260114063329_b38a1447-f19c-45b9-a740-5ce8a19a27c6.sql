-- প্রথম অ্যাডমিন যোগ করুন (প্রথম ইউজার)
INSERT INTO public.user_roles (user_id, role)
VALUES ('ab155d31-96d4-4a42-855d-b2c090ba0339', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;