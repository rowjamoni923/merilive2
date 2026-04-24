UPDATE public.admin_users
SET 
  password_hash = extensions.crypt('Sazzad017', extensions.gen_salt('bf', 10)),
  must_change_password = false,
  password_set_at = now(),
  password_reset_at = now(),
  is_active = true,
  updated_at = now()
WHERE LOWER(email) IN ('smtv923@gmail.com', 'sazzadshifa776@gmail.com');