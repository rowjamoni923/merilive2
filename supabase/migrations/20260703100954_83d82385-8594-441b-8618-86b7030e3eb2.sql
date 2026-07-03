
ALTER TABLE public.profiles DISABLE TRIGGER tg_lock_profile_country;
ALTER TABLE public.profiles DISABLE TRIGGER trg_lock_profile_country;
ALTER TABLE public.profiles DISABLE TRIGGER trg_lock_user_location;
ALTER TABLE public.profiles DISABLE TRIGGER trg_lock_registration_country;
ALTER TABLE public.profiles DISABLE TRIGGER protect_sensitive_columns_trigger;
ALTER TABLE public.profiles DISABLE TRIGGER tr_check_profile_update_security;

UPDATE public.profiles p
SET country_code = f.cc,
    country_name = public.country_name_from_code(f.cc),
    country_flag = public.country_flag_from_code(f.cc),
    country_locked = true,
    country_locked_at = now()
FROM (VALUES
  ('1134eefd-e926-4464-a4fd-bbf2d18c0ec6'::uuid,'US'),
  ('57226b5f-060d-48b4-80e4-e057d57e0ead'::uuid,'NG'),
  ('d7416c99-5121-4c58-995d-92adb4871370'::uuid,'IN'),
  ('40dfaa79-8896-4fa5-b98d-ad770f8276f1'::uuid,'PK'),
  ('dba8b790-a726-4be7-87cf-e5936c12e828'::uuid,'NG'),
  ('4dff130e-2d18-4ac7-9225-4cd725331b0f'::uuid,'NG'),
  ('94d06383-5327-4f92-bba3-9ffb06350518'::uuid,'NG'),
  ('14e812e1-7399-4459-a874-772c9888f0f7'::uuid,'IN'),
  ('d8070141-df59-40e2-934b-a66f6816e446'::uuid,'TR'),
  ('bd1f65fb-0368-4eee-bea6-8feb4f687aec'::uuid,'NG'),
  ('b517aa5e-3409-49c0-81a4-73d83abd5bbe'::uuid,'NG'),
  ('0947c3cc-7a63-467e-a1ce-290c39c6cb34'::uuid,'DZ'),
  ('be0fc1e2-99c1-42a2-b230-8d257f0d5187'::uuid,'ET'),
  ('3bb98edf-e1f8-47e7-b33e-abe47453bbf3'::uuid,'TG'),
  ('327b141a-e116-4d93-94ba-f044368cde9e'::uuid,'JP'),
  ('bee1895c-e05c-4b83-a6d1-ab646f3b56b4'::uuid,'PH'),
  ('db45c32f-6e11-4a72-8357-08f5396fe00d'::uuid,'JP'),
  ('57a3aa6e-c455-4472-bbbe-893e35458504'::uuid,'US'),
  ('150e4b06-2d48-47d0-bfa7-1a7aad34d2d2'::uuid,'ID'),
  ('9ad587ce-1e0e-4d66-b303-d3172beeb869'::uuid,'IN'),
  ('4b017a92-7b0a-4ec2-bbea-92b3c4e6b65d'::uuid,'DZ')
) AS f(id, cc)
WHERE p.id = f.id;

ALTER TABLE public.profiles ENABLE TRIGGER tg_lock_profile_country;
ALTER TABLE public.profiles ENABLE TRIGGER trg_lock_profile_country;
ALTER TABLE public.profiles ENABLE TRIGGER trg_lock_user_location;
ALTER TABLE public.profiles ENABLE TRIGGER trg_lock_registration_country;
ALTER TABLE public.profiles ENABLE TRIGGER protect_sensitive_columns_trigger;
ALTER TABLE public.profiles ENABLE TRIGGER tr_check_profile_update_security;
