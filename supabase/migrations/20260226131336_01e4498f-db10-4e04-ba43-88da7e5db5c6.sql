
-- Fix agency banner to use internal navigation instead of broken external URL
UPDATE banners 
SET link_type = 'internal', link_url = '/agency-signup' 
WHERE id = '5f6e8cac-f0de-4d16-9065-eaf3b1b84eca';
