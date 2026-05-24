create or replace function public.is_public_profile_media_key(_key text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key text := nullif(btrim(_key), '');
  v_base text := 'https://ayjdlvuurscxucatbbah.supabase.co';
  v_proxy text;
  v_proxy_encoded text;
  v_public text;
  v_signed_prefix text;
begin
  if v_key is null or length(v_key) > 1024 or position('..' in v_key) > 0 or position(chr(0) in v_key) > 0 then
    return false;
  end if;

  v_proxy := v_base || '/functions/v1/public-profile-avatar/' || v_key;
  v_proxy_encoded := v_base || '/functions/v1/public-profile-avatar/' || replace(v_key, ' ', '%20');
  v_public := v_base || '/storage/v1/object/public/face-verification/' || v_key;
  v_signed_prefix := v_base || '/storage/v1/object/sign/face-verification/' || v_key;

  return exists (
    select 1
    from public.profiles p
    where p.avatar_url in (v_proxy, v_proxy_encoded, v_public)
       or p.cover_url in (v_proxy, v_proxy_encoded, v_public)
       or p.avatar_url like v_signed_prefix || '%'
       or p.cover_url like v_signed_prefix || '%'
       or (p.host_photos is not null and (p.host_photos @> array[v_proxy]::text[] or p.host_photos @> array[v_proxy_encoded]::text[] or p.host_photos @> array[v_public]::text[]))
  )
  or exists (
    select 1
    from public.poster_images pi
    where pi.image_url in (v_proxy, v_proxy_encoded, v_public)
       or pi.image_url like v_signed_prefix || '%'
  )
  or exists (
    select 1
    from public.live_streams ls
    where ls.thumbnail_url in (v_proxy, v_proxy_encoded, v_public)
       or ls.thumbnail_url like v_signed_prefix || '%'
  )
  or exists (
    select 1
    from public.face_verification_submissions fvs
    where fvs.status = 'approved'
      and (
        fvs.profile_photo_url in (v_proxy, v_proxy_encoded, v_public)
        or fvs.video_url in (v_proxy, v_proxy_encoded, v_public)
        or fvs.profile_photo_url like v_signed_prefix || '%'
        or fvs.video_url like v_signed_prefix || '%'
        or (fvs.host_photos is not null and (fvs.host_photos @> array[v_proxy]::text[] or fvs.host_photos @> array[v_proxy_encoded]::text[] or fvs.host_photos @> array[v_public]::text[]))
      )
  );
end;
$$;

revoke all on function public.is_public_profile_media_key(text) from public;
grant execute on function public.is_public_profile_media_key(text) to anon, authenticated, service_role;