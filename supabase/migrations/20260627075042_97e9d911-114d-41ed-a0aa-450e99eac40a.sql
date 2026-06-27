UPDATE public.face_verification_submissions
SET status='pending',
    admin_notes='Auto-healed: reprocessing after CPU fix',
    updated_at=now()
WHERE id IN (
  'e41426bf-5364-4be7-8859-707fdf54de67',
  '902851b2-a902-4bc6-a1ae-1dafdd50ed79',
  'a467f855-5166-4a18-a82d-12cad38f076f'
);