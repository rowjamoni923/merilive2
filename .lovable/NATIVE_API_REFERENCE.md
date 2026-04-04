# 🔥 MeriLive Native Android App - Complete API Reference
# Gemini Prompt: Build Every Section with Correct Data Sources

**Supabase URL:** `https://pppcwawjjpwwrmvezcdy.supabase.co`
**Anon Key:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwcGN3YXdqanB3d3JtdmV6Y2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzQ4OTYsImV4cCI6MjA4MzkxMDg5Nn0.VUy58uiU63Kb3i4qj2ALK2s3arjBJ25CbnwCcvblpQw`
**Edge Function Base:** `https://pppcwawjjpwwrmvezcdy.supabase.co/functions/v1/`

> **RULE:** All authenticated requests require `Authorization: Bearer {access_token}` header.
> **RULE:** All Supabase REST queries require `apikey: {anon_key}` header.
> **RULE:** Use `profiles_public` VIEW for reading other users' data. Use `profiles` TABLE only for the authenticated user's own data.

---

## 📱 SECTION 1: HOME PAGE (Route: `/`)

### 1.1 Banners (Top Carousel)
```
TABLE: banners
QUERY: SELECT * FROM banners WHERE is_active = true AND (start_date IS NULL OR start_date <= now()) AND (end_date IS NULL OR end_date >= now()) ORDER BY display_order ASC
```

### 1.2 Popup Banner (Auto-show on app open)
```
TABLE: banners (filter link_type = 'popup' or use admin_notices)
TABLE: admin_notices
QUERY: SELECT * FROM admin_notices WHERE is_active = true AND (expires_at IS NULL OR expires_at > now()) ORDER BY priority DESC
```

### 1.3 Country Filter Tabs
```
TABLE: profiles_public
QUERY: SELECT DISTINCT country_flag, country FROM profiles_public WHERE is_online = true
-- Or hardcode common countries, then filter streams by country
```

### 1.4 Live Streams List (Popular/Live/New/Follow tabs)
```
⚠️ DO NOT query live_streams table directly!
EDGE FUNCTION: GET {base}/live-stream/active-streams
Headers: Content-Type: application/json

Response: {
  "streams": [{
    "id": "uuid",
    "host_id": "uuid",
    "title": "string",
    "thumbnail_url": "string",
    "is_active": true,
    "viewer_count": number,
    "started_at": "timestamp",
    "host": {
      "id": "uuid",
      "display_name": "string",
      "avatar_url": "string",
      "country_flag": "string",
      "user_level": number,
      "is_verified": boolean
    }
  }]
}
```

### 1.5 Follow Tab (Streams from followed users)
```
TABLE: follows
QUERY: SELECT following_id FROM follows WHERE follower_id = {current_user_id}
-- Then filter active-streams response by host_id IN followed_ids
```

### 1.6 Search Users
```
TABLE: profiles_public
QUERY: SELECT id, display_name, avatar_url, app_uid, country_flag, user_level, is_online, is_verified
       FROM profiles_public
       WHERE display_name ILIKE '%{query}%' OR app_uid ILIKE '%{query}%'
       LIMIT 20
```

---

## 🎥 SECTION 2: LIVE STREAMING

### 2.1 Join/Watch Live Stream
```
EDGE FUNCTION: POST {base}/livekit-token
Headers: Authorization: Bearer {access_token}, Content-Type: application/json
Body: {
  "roomName": "live_{stream_id}",
  "roomType": "viewer_stream",
  "participantName": "{user_display_name}"
}
Response: { "token": "livekit_jwt", "url": "wss://livekit-server-url" }
-- Use this token with LiveKit SDK to connect
```

### 2.2 Go Live (Host starts stream)
```
EDGE FUNCTION: POST {base}/live-stream/start-stream
Headers: Authorization: Bearer {access_token}, Content-Type: application/json
Body: { "title": "Stream Title", "description": "optional", "thumbnailUrl": "optional" }

Then get LiveKit token:
POST {base}/livekit-token
Body: { "roomName": "live_{stream_id}", "roomType": "host_stream" }
```

### 2.3 End Stream
```
EDGE FUNCTION: POST {base}/live-stream/end-stream
Headers: Authorization: Bearer {access_token}
Body: { "streamId": "{stream_id}" }
```

### 2.4 Stream Chat (Real-time)
```
SUPABASE BROADCAST CHANNEL: "stream:{stream_id}"
Events: chat, gift, like, viewer-joined, viewer-left, stream-ended
-- Use Supabase Realtime Broadcast for sub-100ms messaging
```

### 2.5 Send Gift in Stream
```
EDGE FUNCTION: POST {base}/gift-service
Headers: Authorization: Bearer {access_token}
Body: {
  "recipientId": "{host_id}",
  "giftId": "{gift_id}",
  "quantity": 1,
  "context": "live",
  "contextId": "{stream_id}"
}
```

### 2.6 Gift Catalog
```
TABLE: gifts
QUERY: SELECT * FROM gifts WHERE is_active = true ORDER BY category, display_order ASC
```

---

## 🎉 SECTION 3: PARTY ROOMS

### 3.1 List Party Rooms
```
EDGE FUNCTION: POST {base}/party-room
Body: { "action": "list-rooms" }
-- OR --
TABLE: party_rooms
QUERY: SELECT * FROM party_rooms WHERE is_active = true ORDER BY created_at DESC
```

### 3.2 Join Party Room
```
EDGE FUNCTION: POST {base}/livekit-token
Body: { "roomName": "party_{room_id}", "roomType": "party", "participantName": "{name}" }
Response: { "token": "...", "url": "wss://..." }
```

### 3.3 Create Party Room
```
EDGE FUNCTION: POST {base}/party-room
Headers: Authorization: Bearer {access_token}
Body: { "action": "create-room", "name": "Room Name", "type": "audio|video|game", "maxSeats": 9 }
```

### 3.4 Party Room Messages
```
TABLE: party_room_messages
QUERY: SELECT * FROM party_room_messages WHERE room_id = '{room_id}' ORDER BY created_at DESC LIMIT 50
-- Real-time: Subscribe to Supabase Broadcast channel "party:{room_id}"
```

### 3.5 Party Banners
```
TABLE: party_banners
QUERY: SELECT * FROM party_banners WHERE is_active = true ORDER BY display_order ASC
```

### 3.6 Party Backgrounds
```
TABLE: party_backgrounds
QUERY: SELECT * FROM party_backgrounds WHERE is_active = true ORDER BY display_order ASC
```

---

## 👤 SECTION 4: PROFILE

### 4.1 My Profile Data
```
TABLE: profiles (own data, authenticated)
QUERY: SELECT * FROM profiles WHERE id = {current_user_id}
-- Returns: display_name, avatar_url, bio, gender, coins, beans, diamond_balance,
--          user_level, host_level, is_verified, country, country_flag, app_uid,
--          frame_id, vip_tier, total_followers, total_following, total_friends,
--          is_host, host_status, call_rate_per_minute, etc.
```

### 4.2 Other User's Profile
```
VIEW: profiles_public
QUERY: SELECT * FROM profiles_public WHERE id = '{target_user_id}'
```

### 4.3 Friends / Following / Followers Count
```
TABLE: follows
QUERY (Followers): SELECT COUNT(*) FROM follows WHERE following_id = '{user_id}'
QUERY (Following): SELECT COUNT(*) FROM follows WHERE follower_id = '{user_id}'
TABLE: friendships
QUERY (Friends): SELECT COUNT(*) FROM friendships WHERE (user_id_1 = '{user_id}' OR user_id_2 = '{user_id}') AND status = 'accepted'
```

### 4.4 My Diamonds & Beans
```
From profiles table (own profile):
- diamond_balance (column)
- beans (column)
- coins (column, used for spending)
```

### 4.5 Edit Profile
```
TABLE: profiles
UPDATE: UPDATE profiles SET display_name = '{name}', bio = '{bio}', avatar_url = '{url}' WHERE id = {user_id}

Avatar Upload:
STORAGE BUCKET: "avatars"
Upload to: avatars/{user_id}/avatar.jpg
```

### 4.6 Poster Images (Profile Gallery)
```
TABLE: poster_images
QUERY: SELECT * FROM poster_images WHERE user_id = '{user_id}' ORDER BY display_order ASC

Upload:
STORAGE BUCKET: "poster-images"
```

### 4.7 Follow/Unfollow User
```
TABLE: follows
INSERT (Follow): INSERT INTO follows (follower_id, following_id) VALUES ({me}, {them})
DELETE (Unfollow): DELETE FROM follows WHERE follower_id = {me} AND following_id = {them}
```

---

## 💬 SECTION 5: MESSAGES / CHAT

### 5.1 Conversation List
```
TABLE: conversations
QUERY: SELECT * FROM conversations
       WHERE participant_1 = '{user_id}' OR participant_2 = '{user_id}'
       ORDER BY last_message_at DESC
-- Join with profiles_public to get other participant's info
```

### 5.2 Messages in Conversation
```
TABLE: messages
QUERY: SELECT * FROM messages WHERE conversation_id = '{conv_id}' ORDER BY created_at ASC
-- Real-time: Subscribe to postgres_changes on messages table filtered by conversation_id
```

### 5.3 Send Message
```
TABLE: messages
INSERT: INSERT INTO messages (conversation_id, sender_id, content, message_type) VALUES (...)
-- Also update conversations.last_message_at

EDGE FUNCTION (Push notification): POST {base}/notify-new-message
Body: { "recipientId": "{other_user_id}", "senderName": "{name}", "message": "{text}" }
```

---

## 📞 SECTION 6: PRIVATE CALLS

### 6.1 Call Rate Settings
```
TABLE: app_settings
QUERY: SELECT setting_value FROM app_settings WHERE setting_key = 'call_rates'
-- Returns: { "default_rate": 60, "min_rate": 30, "max_rate": 500, "host_commission_percent": 70 }
```

### 6.2 Initiate Call
```
TABLE: private_calls
INSERT: INSERT INTO private_calls (caller_id, receiver_id, call_type, status, rate_per_minute)
        VALUES ({caller_id}, {host_id}, 'video', 'ringing', {rate})

LiveKit Token:
POST {base}/livekit-token
Body: { "roomName": "call_{call_id}", "roomType": "call" }
```

### 6.3 Call History
```
TABLE: private_calls
QUERY: SELECT * FROM private_calls
       WHERE caller_id = '{user_id}' OR receiver_id = '{user_id}'
       ORDER BY created_at DESC
-- Join with profiles_public for other user info
```

### 6.4 Call Events
```
TABLE: call_events
QUERY: SELECT * FROM call_events WHERE call_id = '{call_id}' ORDER BY created_at ASC
```

---

## 🏆 SECTION 7: LEADERBOARD

### 7.1 Gift Leaderboard (Senders & Receivers)
```
TABLE: gift_transactions
QUERY (Top Senders - Daily):
  SELECT sender_id, SUM(coin_cost) as total
  FROM gift_transactions
  WHERE created_at >= '{today_start}'
  GROUP BY sender_id ORDER BY total DESC LIMIT 50

QUERY (Top Receivers - Daily):
  SELECT recipient_id, SUM(coin_cost) as total
  FROM gift_transactions
  WHERE created_at >= '{today_start}'
  GROUP BY recipient_id ORDER BY total DESC LIMIT 50

-- Weekly: filter by current week
-- Monthly: filter by current month
-- Join results with profiles_public for display_name, avatar_url, etc.
```

### 7.2 Agency Rankings
```
TABLE: agency_rankings
QUERY: SELECT * FROM agency_rankings
       WHERE period_type = '{daily|weekly|monthly}'
       AND period_start = '{period_start}'
       ORDER BY rank_position ASC
```

### 7.3 PK Competitions
```
TABLE: pk_competitions
QUERY: SELECT * FROM pk_competitions WHERE status = 'active' ORDER BY created_at DESC
TABLE: pk_competition_entries
TABLE: pk_competition_rewards
```

---

## 🎖️ SECTION 8: LEVELS & VIP

### 8.1 My Level Page
```
TABLE: user_level_tiers
QUERY: SELECT * FROM user_level_tiers WHERE is_active = true ORDER BY level_number ASC
-- Compare with user's user_level from profiles

TABLE: feature_level_requirements
QUERY: SELECT * FROM feature_level_requirements WHERE is_active = true ORDER BY display_order ASC
```

### 8.2 VIP Membership
```
TABLE: vip_tiers
QUERY: SELECT * FROM vip_tiers WHERE is_active = true ORDER BY tier_level ASC

TABLE: vip_privileges
QUERY: SELECT * FROM vip_privileges WHERE is_active = true ORDER BY display_order ASC
```

### 8.3 Level Privileges
```
TABLE: level_privileges
QUERY: SELECT * FROM level_privileges WHERE is_active = true ORDER BY display_order ASC
```

---

## 🛍️ SECTION 9: SHOP

### 9.1 Shop Items (Frames, Vehicles, Chat Bubbles, etc.)
```
TABLE: avatar_frames
QUERY: SELECT * FROM avatar_frames WHERE is_active = true ORDER BY display_order ASC

TABLE: chat_bubbles (if exists)
TABLE: vehicle_entrances (if exists)
TABLE: entry_effects (if exists)
TABLE: noble_cards (if exists)
TABLE: vip_medals (if exists)

TABLE: shop_items (generic shop)
QUERY: SELECT * FROM shop_items WHERE is_active = true ORDER BY category, display_order ASC
```

### 9.2 Purchase Item
```
Update user's profile (deduct coins/diamonds), then assign item.
TABLE: user_purchased_items or update profiles.frame_id, etc.
```

---

## 💰 SECTION 10: RECHARGE / TOP-UP

### 10.1 Coin Packages
```
TABLE: coin_packages
QUERY: SELECT * FROM coin_packages WHERE is_active = true ORDER BY display_order ASC
```

### 10.2 Create Payment (Stripe)
```
EDGE FUNCTION: POST {base}/create-stripe-payment
Headers: Authorization: Bearer {access_token}
Body: { "packageId": "{coin_package_id}", "coins": 1000, "amount": 9.99 }
```

### 10.3 Create Payment (Local/ZiniPay)
```
EDGE FUNCTION: POST {base}/create-zinipay-payment
EDGE FUNCTION: POST {base}/create-local-payment
```

### 10.4 Google Play Billing Verification
```
EDGE FUNCTION: POST {base}/verify-google-purchase
Headers: Authorization: Bearer {access_token}
Body: { "purchaseToken": "...", "productId": "...", "packageName": "..." }
```

### 10.5 Recharge History
```
TABLE: recharge_history
QUERY: SELECT * FROM recharge_history WHERE user_id = '{user_id}' ORDER BY created_at DESC
```

---

## 🏢 SECTION 11: AGENCY

### 11.1 Agency Dashboard
```
TABLE: agencies
QUERY: SELECT * FROM agencies WHERE owner_id = '{user_id}'

TABLE: agency_hosts
QUERY: SELECT * FROM agency_hosts WHERE agency_id = '{agency_id}' AND status = 'active'
-- Join with profiles_public for host details

TABLE: agency_performance
QUERY: SELECT * FROM agency_performance WHERE agency_id = '{agency_id}' ORDER BY period_start DESC

TABLE: agency_level_tiers
QUERY: SELECT * FROM agency_level_tiers WHERE is_active = true ORDER BY display_order ASC
```

### 11.2 Join Agency (Apply)
```
TABLE: agency_hosts
INSERT: INSERT INTO agency_hosts (agency_id, host_id, status, referral_code) VALUES ('{agency_id}', '{user_id}', 'pending', '{code}')
```

### 11.3 Agency Withdrawal
```
TABLE: agency_withdrawals
INSERT: INSERT INTO agency_withdrawals (agency_id, amount, payment_method, payment_details, status)
        VALUES ('{agency_id}', {amount}, '{method}', '{details}', 'pending')
```

### 11.4 Agency Commission History
```
TABLE: agency_commission_history
QUERY: SELECT * FROM agency_commission_history WHERE agency_id = '{agency_id}' ORDER BY created_at DESC
```

### 11.5 Agency Earnings Transfers
```
TABLE: agency_earnings_transfers
QUERY: SELECT * FROM agency_earnings_transfers WHERE agency_id = '{agency_id}' ORDER BY created_at DESC
```

### 11.6 Agency Diamond Transactions
```
TABLE: agency_diamond_transactions
QUERY: SELECT * FROM agency_diamond_transactions WHERE agency_id = '{agency_id}' ORDER BY created_at DESC
```

---

## 🎫 SECTION 12: INVITATION

### 12.1 Invitation System
```
TABLE: user_referrals
QUERY: SELECT * FROM user_referrals WHERE referrer_id = '{user_id}' ORDER BY created_at DESC

User's referral code: profiles.referral_code
```

---

## 📹 SECTION 13: REELS

### 13.1 Fetch Reels
```
TABLE: reels
QUERY: SELECT * FROM reels WHERE is_active = true ORDER BY created_at DESC LIMIT 20
-- Join with profiles_public for creator info

TABLE: reel_likes
TABLE: reel_comments
```

### 13.2 Like/Unlike Reel
```
TABLE: reel_likes
INSERT/DELETE based on current state
```

### 13.3 Upload Reel
```
STORAGE BUCKET: "reels"
Upload video, then INSERT into reels table
```

---

## ⚙️ SECTION 14: SETTINGS

### 14.1 Settings Page
```
TABLE: profiles (for notification preferences, privacy settings)
TABLE: app_content (for policy pages)
QUERY: SELECT * FROM app_content WHERE page_key IN ('privacy_policy', 'user_agreement', 'about_us') AND is_active = true
```

### 14.2 Blacklist
```
TABLE: blocked_users
QUERY: SELECT * FROM blocked_users WHERE blocker_id = '{user_id}'
-- Join with profiles_public for blocked user info
```

### 14.3 Customer Service / Support
```
EDGE FUNCTION: POST {base}/support-chat
-- Or use AI chat:
EDGE FUNCTION: POST {base}/ai-chat
```

---

## 🔔 SECTION 15: NOTIFICATIONS

### 15.1 Notification List
```
TABLE: notifications
QUERY: SELECT * FROM notifications WHERE user_id = '{user_id}' ORDER BY created_at DESC LIMIT 50
```

### 15.2 Mark as Read
```
TABLE: notifications
UPDATE: UPDATE notifications SET is_read = true WHERE id = '{notification_id}' AND user_id = '{user_id}'
```

### 15.3 Push Notification Token Registration
```
EDGE FUNCTION: POST {base}/push-on-notification
Body: { "token": "{fcm_token}", "platform": "android" }
```

---

## 🌍 SECTION 16: COUNTRY DETECTION

### 16.1 Auto-detect Country
```
EDGE FUNCTION: GET {base}/detect-country
Response: { "country": "BD", "countryName": "Bangladesh", "flag": "🇧🇩" }
```

---

## 🔐 SECTION 17: AUTHENTICATION

### 17.1 Sign Up / Sign In
```
Supabase Auth SDK:
- supabase.auth.signUp({ email, password })
- supabase.auth.signInWithPassword({ email, password })
- supabase.auth.signInWithOtp({ phone })  -- via edge function
```

### 17.2 OTP Login (Phone)
```
EDGE FUNCTION: POST {base}/otp-direct-signin
Body: { "phone": "+880...", "action": "send" }
-- Then verify:
Body: { "phone": "+880...", "action": "verify", "otp": "123456" }
```

### 17.3 Google Sign-In
```
Supabase Auth SDK: supabase.auth.signInWithOAuth({ provider: 'google' })
```

---

## 🎮 SECTION 18: GAMES

### 18.1 Game List
```
TABLE: app_settings (key: 'game_providers')
-- Or fetch from game provider edge function
EDGE FUNCTION: POST {base}/game-provider
Body: { "action": "get-games" }
```

### 18.2 Built-in Games
```
Routes: /games/roulette, /games/ferris-wheel, /games/teen-patti
-- These use HTML5/WebView with JS bridge to sync coins
```

---

## 🖼️ SECTION 19: VISUAL ASSETS (Frames, Effects, Animations)

### 19.1 Avatar Frames
```
TABLE: avatar_frames
QUERY: SELECT * FROM avatar_frames WHERE is_active = true ORDER BY display_order ASC
```

### 19.2 Entry Effects
```
TABLE: entry_effects (if exists)
```

### 19.3 SVGA Animations (Gift animations)
```
Gift animation URLs are in the gifts table: animation_url column
-- Use SVGA player library for Android to render
```

### 19.4 Branding (Dynamic Logo & Background)
```
TABLE: branding_settings
QUERY: SELECT * FROM branding_settings LIMIT 1
-- Returns: logo_image_url, background_url, logo_text_primary, tagline
```

---

## 📊 SECTION 20: GLOBAL SETTINGS (Load on App Start)

### 20.1 All App Settings (MUST load at startup)
```
TABLE: app_settings
QUERY: SELECT setting_key, setting_value FROM app_settings

KEY SETTINGS:
- 'call_rates' → call pricing config
- 'beans_to_usd_rate' → currency conversion
- 'beans_to_diamond_rate' → exchange rate
- 'minimum_withdrawal_amount' → withdrawal config
- 'maintenance_mode' → { enabled: boolean, message: string }
- 'app_version' → version check
- 'exchange_rates' → currency rates by country
```

### 20.2 Level Tiers
```
TABLE: user_level_tiers → User levels
TABLE: agency_level_tiers → Agency levels
TABLE: vip_tiers → VIP levels
TABLE: helper_level_config → Helper levels
TABLE: trader_level_tiers → Trader levels
```

### 20.3 Event Themes (Dynamic UI theming)
```
TABLE: app_event_themes
QUERY: SELECT * FROM app_event_themes WHERE is_active = true AND (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at >= now()) ORDER BY display_order ASC LIMIT 1
```

### 20.4 App Version Check
```
TABLE: app_version_settings
QUERY: SELECT * FROM app_version_settings WHERE platform = 'android'
-- Compare current_version_code with app's versionCode
-- If app version < min_version_code AND force_update = true → Force update dialog
```

---

## 🔄 SECTION 21: REAL-TIME SUBSCRIPTIONS

### 21.1 Online Presence
```
EDGE FUNCTION: POST {base}/presence
Body: { "status": "online" }
-- Call every 30 seconds to maintain online status
```

### 21.2 Real-time Channels to Subscribe
```
1. Profile changes: postgres_changes on profiles WHERE id = {user_id}
2. New messages: postgres_changes on messages WHERE conversation_id IN (user's conversations)
3. Notifications: postgres_changes on notifications WHERE user_id = {user_id}
4. Live stream events: Broadcast channel "stream:{stream_id}"
5. Party room events: Broadcast channel "party:{room_id}"
6. Call signaling: Broadcast channel "call:{call_id}"
```

---

## 🎯 SECTION 22: HOST FEATURES

### 22.1 Host Application
```
TABLE: host_applications
INSERT: INSERT INTO host_applications (user_id, real_name, age, country, selfie_url, status)
        VALUES (...)
```

### 22.2 Host Dashboard
```
TABLE: profiles → total_earnings, beans, call_rate_per_minute
TABLE: gift_transactions → earnings from gifts
TABLE: private_calls → earnings from calls
TABLE: agency_hosts → agency info
```

### 22.3 Host Verification (Face Check)
```
EDGE FUNCTION: POST {base}/face-check
-- Or: POST {base}/auto-face-verify
Body: { "selfieUrl": "...", "referenceUrl": "..." }
```

---

## 📋 SECTION 23: TASKS / DAILY REWARDS

### 23.1 Daily Tasks
```
TABLE: daily_tasks_config
QUERY: SELECT * FROM daily_tasks_config WHERE is_active = true ORDER BY display_order ASC

TABLE: user_daily_task_progress
QUERY: SELECT * FROM user_daily_task_progress WHERE user_id = '{user_id}' AND task_date = '{today}'
```

### 23.2 Daily Login Rewards
```
TABLE: daily_login_rewards_config
QUERY: SELECT * FROM daily_login_rewards_config WHERE is_active = true ORDER BY day_number ASC

TABLE: user_login_streaks
QUERY: SELECT * FROM user_login_streaks WHERE user_id = '{user_id}'

TABLE: daily_login_claims
QUERY: SELECT * FROM daily_login_claims WHERE user_id = '{user_id}' ORDER BY created_at DESC LIMIT 1
```

---

## 🏗️ ARCHITECTURE NOTES FOR GEMINI

### Data Loading Priority (App Startup):
1. **FIRST:** `app_settings` → All config
2. **FIRST:** `branding_settings` → Logo, background
3. **FIRST:** `app_version_settings` → Version check
4. **SECOND:** `profiles` → Current user data
5. **SECOND:** `app_event_themes` → UI theme
6. **THIRD:** Active streams, party rooms, notifications

### Caching Strategy:
- `app_settings`: Cache for 5 minutes, refresh on app resume
- `profiles` (own): Cache for 30 seconds
- `profiles_public` (others): Cache for 2 minutes
- `gifts`: Cache for 10 minutes
- Streams list: NO CACHE (always fresh)

### Error Handling:
- All Supabase queries should handle `{ data, error }` pattern
- Network errors → Show cached data if available
- Auth errors (401/403) → Refresh token, retry once
- RLS errors → User not authorized, show appropriate message
