
INSERT INTO public.admin_sections (section_key, section_name, section_name_bn, description, icon_name, hub_key, display_order, is_active)
SELECT 'country_super_admin',
       'Country Super Admin (L6)',
       'কান্ট্রি সুপার অ্যাডমিন (L6)',
       'Per-country payroll managers — application review, deposit confirmation, commission setup.',
       'Crown',
       'trader-hub',
       750,
       true
WHERE NOT EXISTS (SELECT 1 FROM public.admin_sections WHERE section_key = 'country_super_admin');
