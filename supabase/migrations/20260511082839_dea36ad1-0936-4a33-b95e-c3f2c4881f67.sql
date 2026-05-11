-- Delete AI-seeded empty animation entries (description='lottie' with NULL animation_url)
DELETE FROM public.level_animations
WHERE description = 'lottie' AND animation_url IS NULL;