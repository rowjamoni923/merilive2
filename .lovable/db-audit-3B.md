# Sub-wave 3B — Public bucket listing lockdown

## Risk
8 public storage buckets had broad `SELECT USING (bucket_id = 'X')` policies on `storage.objects` with no path restriction. This let any anonymous client call `supabase.storage.from('X').list()` and enumerate every filename in the bucket — useful for harvesting URLs, scanning for unintended uploads, or mapping user IDs from file paths.

## Why removing these policies is safe
- All affected buckets are `public=true`. Public buckets serve files via the `/object/public/{bucket}/{path}` CDN endpoint, which **bypasses RLS entirely** — it only checks the bucket-level `public` flag.
- `getPublicUrl()` in the React app uses that CDN endpoint, so image/video/animation rendering is unaffected.
- Codebase grep confirmed **zero** `storage.from(...).list(...)` calls in `src/` or `supabase/functions/`. Nothing in the app enumerates buckets.

## Policies dropped (broad anon listing)
| Policy | Affected buckets |
|---|---|
| `Public read access for all public buckets` | avatars, cover-images, host-photos, gifts, banners, animations, app-assets, shop-items, reels |
| `Public read for public buckets` | every `public=true` bucket |
| `Public read access for level-assets` | level-assets |
| `Public read banners-media` | banners-media |
| `Public can view media files` | media-files |
| `Anyone can view content media` | content-media |
| `Channel logos are publicly accessible` | channel-logos |
| `Pkg368 public read app-assets` | app-assets |
| `Pkg368 public read branding assets` | branding |

## Preserved (intentional)
- All `authenticated`-scoped policies on private buckets (`chat-media`, `payment-proofs`, `face-verification`, `host-verification`, `rating-screenshots`, `helper-screenshots`, `payment-screenshots`, `support-attachments`, `live-recordings`).
- Admin-session-only policies for moderation access.
- Bucket-level `public=true` flag — keeps CDN URL serving intact.
