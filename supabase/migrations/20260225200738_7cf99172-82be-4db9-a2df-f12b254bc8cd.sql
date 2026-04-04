INSERT INTO public.profiles (id, display_name, username)
VALUES (
  'b1a1469b-15e3-4068-90f9-5d53dd66c8cf',
  'Sazzad Shifa',
  'sazzadshifa_owner'
)
ON CONFLICT (id) DO NOTHING;