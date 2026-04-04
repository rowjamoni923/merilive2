-- Set up smtv923@gmail.com as Owner
-- First, we need to find if this user exists in auth.users

INSERT INTO public.admin_users (
    email,
    display_name,
    role,
    is_active,
    accepted_at
) VALUES (
    'smtv923@gmail.com',
    'Owner',
    'owner',
    true,
    now()
);

-- Note: user_id will be updated when they login to admin panel