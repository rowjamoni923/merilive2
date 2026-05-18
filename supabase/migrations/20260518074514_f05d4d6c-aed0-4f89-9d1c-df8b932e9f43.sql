update storage.buckets
set
  public = true,
  allowed_mime_types = array['image/*', 'video/*']
where id in ('face-verification', 'host-verification');