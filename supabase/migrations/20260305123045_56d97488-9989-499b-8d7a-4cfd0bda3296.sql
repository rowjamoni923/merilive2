UPDATE public.notifications
SET data = jsonb_set(
  COALESCE(data, '{}'::jsonb),
  '{action_url}',
  to_jsonb('/settings/customer-service'::text),
  true
)
WHERE type = 'support_reply'
  AND COALESCE(data->>'action_url', '') = '/support';