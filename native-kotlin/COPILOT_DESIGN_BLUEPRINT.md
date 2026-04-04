# 🎯 MeriLive Native Android — PIXEL-PERFECT DESIGN BLUEPRINT
## GitHub Copilot: Scan Our Web Codebase → Replicate in Native Kotlin/XML

> **INSTRUCTION**: You are building a native Android app (com.merilive.app) that must be a 1:1 clone of our web app.
> Our web codebase is in the same GitHub repo under `src/`. Scan every file referenced below.
> DO NOT guess designs — read the actual web source code and translate to native XML + Kotlin.

---

## 🎨 MASTER DESIGN SYSTEM (from `src/index.css`)

### Color Tokens (HSL → HEX for Android)
```xml
<!-- res/values/colors.xml -->
<color name="background">#09090B</color>          <!-- 240 20% 4% -->
<color name="foreground">#F2F2F2</color>          <!-- 0 0% 95% -->
<color name="card">#121218</color>                <!-- 240 15% 8% -->
<color name="card_foreground">#F2F2F2</color>     
<color name="primary">#E91E63</color>             <!-- 330 85% 55% - Vibrant Pink -->
<color name="primary_foreground">#FFFFFF</color>  
<color name="secondary">#7C3AED</color>           <!-- 270 70% 55% - Purple -->
<color name="secondary_foreground">#FFFFFF</color>
<color name="muted">#1E1E2A</color>               <!-- 240 10% 14% -->
<color name="muted_foreground">#8B97B0</color>    <!-- 215 16% 65% -->
<color name="accent">#F5A623</color>              <!-- 45 93% 58% - Gold -->
<color name="accent_foreground">#1A0F04</color>   
<color name="destructive">#EF4444</color>         <!-- 0 84% 60% -->
<color name="border">#252536</color>              <!-- 240 10% 18% -->
<color name="input">#252536</color>               
<color name="ring">#E91E63</color>                

<!-- Live Status Colors -->
<color name="live_red">#EF4444</color>
<color name="online_green">#22C55E</color>
<color name="busy_amber">#F59E0B</color>

<!-- Text Colors -->
<color name="text_primary">#F2F2F2</color>
<color name="text_secondary">#8B97B0</color>
<color name="text_hint">#4A4A5A</color>

<!-- Gradient Colors -->
<color name="gradient_pink_start">#E91E63</color>
<color name="gradient_pink_end">#A855F7</color>
<color name="gradient_purple_start">#7C3AED</color>
<color name="gradient_purple_end">#4F46E5</color>
<color name="gradient_red_start">#EF4444</color>
<color name="gradient_red_end">#EC4899</color>
<color name="gradient_gold_start">#F5A623</color>
<color name="gradient_gold_end">#D97706</color>
<color name="gradient_green_start">#22C55E</color>
<color name="gradient_green_end">#059669</color>
```

### Typography
```
Font: Inter (400, 500, 600, 700, 800, 900) + Poppins (500, 600, 700, 800)
Use Inter for body text, Poppins for headings/badges
```

### Corner Radius
```
Default: 16dp (1rem)
Cards: 16dp rounded-2xl
Buttons: 26dp (full round pills)
Badges: 999dp (full round)
Input fields: 12dp
Bottom Sheet: 24dp top corners
```

### Shadows & Glass-morphism
```
Card shadow: elevation 8dp + semi-transparent border (white 5% alpha)
Glass effect: background blur 24dp + white 8% alpha fill
Glow effects: Use colored shadows (e.g., pink shadow on live cards)
```

---

## 📱 PAGE-BY-PAGE DESIGN SPECIFICATION

---

### 1. HOME PAGE (Index) — `src/pages/Index.tsx`
**Native:** `HomeFragment.kt` + `fragment_home.xml`

#### Layout Structure:
```
┌─────────────────────────────┐
│ [🔍]  Popular|Live|New|Follow  [🏆] │  ← Header (glass background)
│  🌍 All | 🇧🇩 BD | 🇮🇳 IN | ...     │  ← Country filter (horizontal scroll)
├─────────────────────────────┤
│ ┌──────────┐ ┌──────────┐  │
│ │  Host 1   │ │  Host 2   │  │  ← 2-column grid
│ │ [Avatar]  │ │ [Avatar]  │  │     aspect ratio 3:4
│ │ LIVE 🔴   │ │ Online 🟢 │  │     rounded-2xl (16dp)
│ │ Name Lv.3 │ │ Name Lv.5 │  │
│ │      [📞] │ │      [📞] │  │  ← Call button (bottom-right)
│ └──────────┘ └──────────┘  │
│ ┌──────────┐ ┌──────────┐  │
│ │  Host 3   │ │  Host 4   │  │
│ └──────────┘ └──────────┘  │
│      [Banner Ad]            │  ← DynamicBanner after 6 cards
│ ┌──────────┐ ┌──────────┐  │
│ │  Host 5   │ │  Host 6   │  │
│ └──────────┘ └──────────┘  │
├─────────────────────────────┤
│ 🏠  👥  [+]  ▶️  👤        │  ← Bottom Navigation
└─────────────────────────────┘
```

#### Header Bar:
- **Background**: Glass effect (`rgba(0,0,0,0.7)` + `backdrop-blur`)
- **Left**: Search icon (🔍) — ghost button, `h-8 w-8`, `text-white/70`
- **Center**: Sub-tabs in pill container (`bg-white/5 rounded-full p-0.5`)
  - Each tab: `px-2.5 py-1 rounded-full text-xs font-medium`
  - Active tab: gradient background `linear-gradient(to right, #ec4899, #a855f7)`, white text
  - Inactive tab: `text-white/60`
  - "Live" tab has red dot (🔴 `w-1.5 h-1.5 bg-red-500 rounded-full`)
- **Right**: Trophy icon (🏆) — `text-amber-400`

#### Country Filter:
- Horizontal `ScrollView` under header
- Each chip: `px-2 py-1 rounded-full text-xs font-medium`
- Active: gradient `linear-gradient(to right, #ec4899, #a855f7)`, white text
- Inactive: `bg-white/10 text-white/70`
- Format: `[Flag emoji] [Country name]`

#### Host Card (UserCard):
**CRITICAL — Read `src/pages/Index.tsx` lines 400-529**
- Container: `rounded-2xl`, `bg-card/60`, border with conditional glow
- Image: `aspect-[3/4]`, `object-cover`, full bleed
- Gradient overlay: `bg-gradient-to-t from-black/80 via-black/10 to-transparent`
- **LIVE badge** (top-left):
  - `rounded-full bg-gradient-to-r from-red-500 to-rose-500`
  - `shadow-[0_2px_12px_rgba(239,68,68,0.5)]`
  - White pulsing dot + "LIVE" text (`text-[10px] font-extrabold tracking-wider`)
- **Online badge** (top-left, when not live):
  - Green gradient: `from-emerald-500/90 to-green-500/90`
  - Busy: amber gradient: `from-amber-500/90 to-orange-500/90`
- **Verified badge** (top-right):
  - `w-6 h-6 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-full`
  - White checkmark SVG inside
- **Bottom info** (absolute bottom):
  - AvatarWithFrame (24dp circle) + Name (`text-[13px] font-bold`) + LevelBadge + Country flag
  - Name has `text-shadow: 0 1px 6px rgba(0,0,0,0.6)`
- **Call button** (bottom-right, only for online female hosts):
  - Green phone icon button
  - Only visible when `is_online && !busy`
- **Border glow rules**:
  - Live: `border-red-500/40` + red shadow
  - Level ≥40: `border-amber-400/30` + gold shadow
  - Level ≥20: `border-purple-500/25` + purple shadow
  - Level ≥10: `border-blue-500/20` + blue shadow
  - Default: `border-white/[0.06]`

#### Sorting Logic:
1. LIVE hosts first (longest streaming = earliest `startedAt`)
2. ONLINE hosts next
3. Offline last

#### Pull to Refresh:
- Custom native pull-to-refresh via `SwipeRefreshLayout`

---

### 2. BOTTOM NAVIGATION — `src/components/layout/BottomNavigation.tsx`
**Native:** Include in `activity_main.xml`

#### Layout:
```
┌─────────────────────────────┐
│ 🏠    👥    [+]    ▶️    👤  │
│ Home  Party       Reels Profile│
└─────────────────────────────┘
```

#### Styling:
- **Background**: `rgba(0,0,0,0.7)` + `backdrop-blur-2xl`
- **Top border**: `transparent` (no visible line, subtle gradient glow `from-white/[0.04]`)
- **5 items**: Home, Party, Center (+), Reels, Profile
- **Active icon**: `text-white`, Inactive: `text-white/40`
- **Active label**: `text-white text-[10px]`, Inactive: `text-white/35 text-[10px]`
- **Center button**:
  - Elevated `-mt-5` above bar
  - `w-[52px] h-[52px] rounded-full`
  - Gradient: `linear-gradient(135deg, #d946ef, #7c3aed, #4f46e5)`
  - Shadow: `0 4px 24px rgba(147,51,234,0.5)`
  - Ring: `3px ring-black/80`
  - Inner glow: `from-white/25 via-transparent to-transparent`
  - Plus icon: `w-5 h-5 text-white strokeWidth-2.5`
  - When open: rotates to X icon (45deg animation)
- **Profile badge**: red dot with unread count
  - `min-w-[16px] h-4 bg-gradient-to-r from-red-500 to-pink-500`
  - `text-[8px] font-bold ring-2 ring-black`
- **Safe area**: `paddingBottom: max(env(safe-area-inset-bottom), 0px)`

#### Action Menu (when + pressed):
- **Backdrop**: `bg-black/80 backdrop-blur-sm` over full screen
- Two action cards stacked vertically:
  1. **Go Live**: `bg-gradient-to-r from-red-500 via-pink-500 to-rose-500`, `rounded-2xl`, `shadow-2xl shadow-pink-500/50`
     - Icon: Radio in `w-10 h-10 rounded-xl bg-white/20`
     - Text: "Go Live" + "Start streaming"
     - White pulsing dot on right
  2. **Create Party**: `bg-gradient-to-r from-purple-600 via-violet-500 to-indigo-500`, `rounded-2xl`, `shadow-2xl shadow-purple-500/50`
     - Icon: PartyPopper in `w-10 h-10 rounded-xl bg-white/20`
     - Text: "Create Party" + "Audio/Video Room"
- Spring animation on appear

---

### 3. PROFILE PAGE — `src/pages/Profile.tsx`
**Native:** `ProfileFragment.kt` + `fragment_profile.xml`

**CRITICAL — Read `src/pages/Profile.tsx` lines 900-2583 for full render**

#### Layout Structure:
```
┌─────────────────────────────┐
│                    [⚙️]     │  ← Settings icon (top-right)
│      [Avatar+Frame]         │  ← 80dp, with premium frame overlay
│   DisplayName ✓ VIP         │  ← Verified + VIP badges
│   UID: ABC123 | ♂ | Lv.5 🇧🇩│  ← Sub-info row
│   "Bio text here..."        │  ← Bio (centered, text-secondary)
├─────────────────────────────┤
│  Followers  Following  💎    🫘 │  ← Stats row (4 columns)
│    120       85      5000  1200│
├─────────────────────────────┤
│ [Edit Profile]  [💎 Wallet] │  ← Action buttons row
│ [🎙️ Host Dashboard]        │  ← Only for hosts
├─────────────────────────────┤
│ ┌─────┐ ┌─────┐ ┌─────┐   │  ← Profile Menu Grid
│ │ 💰  │ │ 📱  │ │ 🎁  │   │     3-column grid
│ │Earn │ │Tasks│ │Shop │   │     Each: icon + label
│ └─────┘ └─────┘ └─────┘   │
│ ┌─────┐ ┌─────┐ ┌─────┐   │
│ │ 🏆  │ │ 💬  │ │ ⭐  │   │
│ │Lead │ │Chat │ │Level│   │
│ └─────┘ └─────┘ └─────┘   │
│ ... more menu items ...     │
├─────────────────────────────┤
│ 🏠  👥  [+]  ▶️  👤        │
└─────────────────────────────┘
```

#### Avatar Section:
- **Avatar**: 80dp circle with `AvatarWithFrame` component
- **Frame overlay**: 90dp (slightly larger), loaded from `avatar_frames` table
- **Settings button**: 40dp, top-right, ghost style

#### Name + Badges:
- Display name: `textSize="20sp" textStyle="bold" textColor="@color/text_primary"`
- Verified badge (✓): 18dp blue gradient circle
- VIP badge: 24x18dp gold badge (only if VIP subscription active)

#### Sub-info Row:
- UID: `textSize="12sp" textColor="@color/text_secondary"`
- Gender icon: 16dp
- Level badge: `textSize="12sp" textColor="@color/accent"`
- Country flag emoji

#### Stats Row (4 equal columns):
- Each column: vertically centered number + label
- Number: `textSize="18sp" textStyle="bold" textColor="@color/text_primary"`
- Label: `textSize="12sp" textColor="@color/text_secondary"`
- Labels: "Followers", "Following", "💎 Diamonds", "🫘 Beans"
- Followers/Following are clickable (navigate to list)

#### Diamonds Display:
- Shows `profile.coins` (user's diamond balance)
- Uses cached balance from `useUserBalance` hook
- For hosts: beans = `pending_earnings + beans`
- For agency owners: beans = `agency.beans_balance`

#### Action Buttons:
- "Edit Profile": OutlinedButton, `cornerRadius="20dp"`, half-width
- "💎 Wallet": OutlinedButton, `cornerRadius="20dp"`, half-width
- "🎙️ Host Dashboard": Full-width, `backgroundTint="@color/accent"`, only visible for approved hosts

#### Profile Menu Grid:
**Read the menu items from `src/pages/Profile.tsx` render section**
3-column RecyclerView grid, each item:
- Card: `bg-card/60`, `rounded-2xl`, `border border-white/[0.06]`
- Icon: gradient colored (each menu item has unique gradient)
- Label: `text-[11px] text-muted-foreground`

Menu items include:
1. 💎 Recharge (navigate to /recharge)
2. 📋 Tasks (navigate to /tasks) — has red dot if unclaimed rewards
3. 🎁 Shop (navigate to /shop)
4. 🏆 Leaderboard (navigate to /leaderboard)
5. 💬 Chat (navigate to /chat) — has unread badge
6. ⭐ Level (navigate to /level)
7. 👑 VIP (navigate to /vip)
8. 🏢 Agency (navigate to /agency)
9. 🎙️ Host Apply (navigate to /host-application)
10. 📞 Call History (navigate to /call-history)
11. 📝 Transfer History (navigate to /transfer-history)
12. 🎬 My Reels (navigate to /reels with own content)
13. 🧾 Recharge History (navigate to /recharge-history)
14. 🏷️ Tags (navigate to /tags)
15. 📢 Invite Friends (navigate to /invitation)
16. ℹ️ About (navigate to /about)
17. ⚙️ Settings (navigate to /settings)

---

### 4. LIVE STREAM PAGE — `src/pages/LiveStream.tsx`
**Native:** `LiveStreamActivity.kt` or `LiveStreamFragment.kt`

**CRITICAL — This is 3574 lines. Read sections carefully from `src/pages/LiveStream.tsx`**

#### Layout Structure:
```
┌─────────────────────────────┐
│ [←] Host Avatar Name Lv.5   │  ← Top bar (over video)
│      [👥 123] [Follow]      │  ← Viewer count + Follow btn
├─────────────────────────────┤
│                             │
│     FULL SCREEN VIDEO       │  ← LiveKit/Agora video
│     (SurfaceView)           │
│                             │
│  [Entry animations layer]   │  ← SVGA/Lottie overlays
│  [Gift animations layer]    │  ← Flying gift banners
│  [Join notifications]       │  ← Bigo-style join banners
│                             │
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ Chat messages overlay   │ │  ← Semi-transparent chat
│ │ User1: Hello!           │ │     bottom-aligned
│ │ User2: ❤️ Nice!         │ │     scrollable
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ [💬 Type...] [🎁][❤️][⚔️][⋯]│  ← Bottom action bar
└─────────────────────────────┘
```

#### Top Bar (Host Info):
- **Back button**: `w-8 h-8 rounded-full bg-black/40`
- **Host avatar**: 36dp circle with frame
- **Host name**: `text-sm font-bold text-white` with text shadow
- **Level badge**: inline colored badge
- **Viewer count**: `👥 123` with eye icon, `bg-black/40 rounded-full`
- **Follow button**: `bg-gradient-to-r from-pink-500 to-purple-500`, `rounded-full`
- All elements have `text-shadow` for readability over video

#### Video Player:
- Full screen `SurfaceView` (LiveKit Android SDK)
- Support for both host camera and viewer modes
- Beauty filter overlay (DeepAR native)
- Face detection for content moderation

#### Chat Overlay:
- Semi-transparent background, bottom-aligned
- Each message: `[Avatar] [Name] [LevelBadge]: message`
- Name colors: different for host, VIP, regular users
- System messages in different style
- Gift messages show gift icon + amount
- Max visible: ~8 messages, auto-scroll

#### Bottom Action Bar:
- **Chat input**: `rounded-full bg-white/10`, placeholder "Say something..."
- **Gift button** (🎁): Opens `GiftPanel` bottom sheet
- **Heart button** (❤️): Floating hearts animation
- **PK Battle button** (⚔️): Opens PK panel (host only)
- **More button** (⋯): Shows additional options
- **For hosts**: Beauty filter, Sticker, Music, Game, Mic mute buttons

#### Gift Panel (`src/features/shared/gifting/`):
- Bottom sheet with swipeable gift grid
- Categories: tabs at top
- Each gift: icon + name + price
- Send button with count selector
- Gift animation plays full-screen (SVGA/Lottie)

#### PK Battle:
- Split screen (50/50) for two hosts
- Score bars with real-time updates
- Timer countdown
- Winner/Loser result overlay

---

### 5. GO LIVE PAGE — `src/pages/GoLive.tsx`
**Native:** `GoLiveActivity.kt` + `activity_go_live.xml`

#### Layout:
```
┌─────────────────────────────┐
│ [←]                [⚙️]     │  ← Top bar
│                             │
│   CAMERA PREVIEW            │  ← Full-screen camera
│   (with DeepAR overlay)     │
│                             │
│   [Face Verification]       │  ← Optional modal
│                             │
├─────────────────────────────┤
│ [Title input.............]  │  ← Stream title
│                             │
│ [✨ Beauty] [😊 Sticker] [🔄 Flip] │  ← Tools row
│                             │
│ ┌─────────────────────────┐ │
│ │      GO LIVE            │ │  ← Big red button
│ │   (gradient red pill)   │ │     bg-gradient from-red-500
│ └─────────────────────────┘ │
└─────────────────────────────┘
```

#### Camera Preview:
- Full-screen `SurfaceView` with DeepAR rendering
- Mirror mode by default (front camera)
- Grid overlay toggle (3x3)

#### Setup Controls:
- Title input: dark themed, `bg-input`, rounded
- Beauty button: opens `BeautyFilterPanel`
- Sticker button: opens AR sticker selector
- Flip camera: toggles front/back

#### Go Live Button:
- Full width, `h-52dp`
- `bg-gradient-to-r from-red-500 via-pink-500 to-rose-500`
- `cornerRadius="26dp"`
- Text: "Go Live", `textSize="18sp"`, white, not ALL CAPS

#### Live Controls (after starting):
- Replace setup section with live controls
- Show: Beauty, Sticker, Game, Music, Settings, End Stream
- Live indicator: "● LIVE" badge (top-left), `text-red bg-live-badge`
- Timer showing stream duration

---

### 6. PARTY/DISCOVER PAGE — `src/pages/Discover.tsx`
**Native:** `DiscoverFragment.kt` + `fragment_discover.xml`

#### Layout:
```
┌─────────────────────────────┐
│ [←] Party Rooms      [🔍]  │  ← Header
│ All|Audio|Video|Game        │  ← Category tabs
│ 🌍 All | 🇧🇩 BD | 🇮🇳 IN    │  ← Country filter
├─────────────────────────────┤
│ ┌─────────────────────────┐ │
│ │ 🎵 Room Name            │ │  ← Party room card
│ │ Host: Name  👥 5/8      │ │
│ │ [🔒] [🎮 Game]          │ │
│ └─────────────────────────┘ │
│ ┌─────────────────────────┐ │
│ │ 🎵 Another Room         │ │
│ └─────────────────────────┘ │
├─────────────────────────────┤
│ 🏠  👥  [+]  ▶️  👤        │
└─────────────────────────────┘
```

#### Room Card:
- `rounded-2xl bg-card border border-white/[0.06]`
- Room name: bold, white
- Host avatar + name + level
- Participant count: `👥 5/8`
- Private lock icon if `is_private`
- Game mode badge if applicable
- Background image if set (with dark overlay)

---

### 7. REELS PAGE — `src/pages/Reels.tsx`
**Native:** `ReelsFragment.kt` + `fragment_reels.xml`

**TikTok-style vertical swipe feed**

#### Layout:
```
┌─────────────────────────────┐
│ FULL SCREEN VIDEO           │  ← ExoPlayer
│ (vertical swipe to next)    │
│                             │
│                  [Avatar]   │  ← Right sidebar
│                  [❤️ 1.2K]  │
│                  [💬 48]    │
│                  [↗️ Share] │
│                  [🎁 Gift]  │
│                             │
│ @username                   │  ← Bottom overlay
│ Caption text here #tag      │
│ 🎵 Original Sound           │
├─────────────────────────────┤
│ 🏠  👥  [+]  ▶️  👤        │
└─────────────────────────────┘
```

#### Video:
- Full screen `ExoPlayer` with `ViewPager2` for vertical swipe
- Auto-play current, pause others
- Double-tap to like (heart animation)
- Progress bar at bottom (thin line)

#### Right Sidebar:
- Avatar: 40dp circle with border
- Like: heart icon + count, red when liked
- Comment: message icon + count
- Share: arrow icon
- Gift: gift icon (sends gift to reel creator)
- Each button: `48dp` touch target

#### Bottom Overlay:
- Username: bold white with text shadow
- Caption: white, max 2 lines with "more" expand
- Music: marquee animation if text overflows

#### Upload:
- FAB or top-right camera button
- Opens `ReelUploadModal` — video picker + caption + sound selector

---

### 8. AUTH PAGE — `src/pages/Auth.tsx`
**Native:** `AuthActivity.kt` + `activity_auth.xml`

#### Three Methods:
1. **Start (Guest)**: Branded button → generates device UUID → creates anonymous account
2. **WhatsApp OTP**: Phone input → calls `send-whatsapp-otp` edge function → OTP input → calls `otp-direct-signin`
3. **Email**: Email input → for existing users: password login; for new: OTP verification via `send-email-otp`

#### Design:
- Dark background with subtle gradient
- App logo at top (animated entrance with `OvershootInterpolator`)
- "Start" button: large, gradient pink-purple, full-width
- WhatsApp button: green themed
- Email section: outlined style
- All buttons: `rounded-full`, `h-52dp`
- Animated entrance: stagger from bottom

---

### 9. SETTINGS PAGE — `src/pages/Settings.tsx`
**Native:** `SettingsActivity.kt`

#### Menu Items:
- Language selection
- Notification settings
- Privacy settings
- Block list
- About
- Terms & Privacy Policy
- Delete Account
- Logout (red text)
- App Version display

---

### 10. LEADERBOARD — `src/pages/Leaderboard.tsx`
**Native:** `LeaderboardFragment.kt`

#### Tabs: Daily | Weekly | Monthly
#### Categories: Gifters | Receivers | Streamers
#### Top 3 with podium design (gold/silver/bronze)
#### List below with rank number + avatar + name + amount

---

### 11. CHAT PAGE — `src/pages/Chat.tsx`
**Native:** `ChatActivity.kt`

#### Conversation List:
- Avatar + Name + Last message preview + Time
- Unread badge (red circle with count)
- Online indicator (green dot on avatar)

#### Chat Detail:
- Message bubbles (sent = right/pink, received = left/gray)
- Image/video support
- Gift emoji animations
- Voice message support
- Typing indicator

---

### 12. PARTY ROOM — `src/pages/PartyRoom.tsx`
**Native:** `PartyRoomActivity.kt`

**Read `src/components/party/UnifiedPartyRoom.tsx` for full design**

#### Audio Room:
- Seat grid (4x2 or custom layout)
- Each seat: avatar circle + name + mic indicator
- Empty seats: "+" icon, tappable to join
- Background image (customizable)
- Bottom bar: mic, gift, chat, game, more

#### Video Room:
- Grid of participant videos
- Similar controls to audio room
- PIP support for speakers

---

### 13. ADDITIONAL PAGES TO IMPLEMENT

Each of these exists in `src/pages/` — scan and replicate:

| Web Page | Native Screen | Key Features |
|----------|--------------|--------------|
| `Recharge.tsx` | `RechargeActivity` | Diamond packages, Google Play Billing |
| `Shop.tsx` | `ShopActivity` | Avatar frames, entrance effects, vehicles |
| `VIP.tsx` | `VIPActivity` | VIP tier cards, subscription benefits |
| `Level.tsx` | `LevelActivity` | Level progress, tier list, rewards |
| `Tasks.tsx` | `TasksActivity` | Daily tasks, claim rewards |
| `Rewards.tsx` | `RewardsActivity` | Achievement rewards |
| `EditProfile.tsx` | `EditProfileActivity` | Avatar upload with crop, name, bio, gender |
| `Withdrawal.tsx` | `WithdrawalActivity` | Beans → Cash withdrawal |
| `HostDashboard.tsx` | `HostDashboardActivity` | Earnings, stats, call settings |
| `AgencyDashboard.tsx` | `AgencyDashboardActivity` | Agency management, host list |
| `HostApplication.tsx` | `HostApplicationActivity` | Apply to become host |
| `SearchUsers.tsx` | `SearchActivity` | Search users by name/UID |
| `FollowingList.tsx` | `FollowListActivity` | Followers/Following tabs |
| `CallHistory.tsx` | `CallHistoryActivity` | Past calls with duration/earnings |
| `ProfileDetail.tsx` | `UserProfileActivity` | View other user's profile |
| `Invitation.tsx` | `InviteActivity` | Share invite link |
| `FaceVerification.tsx` | `FaceVerifyActivity` | Camera-based face check |

---

## 🔧 IMPLEMENTATION RULES

### Architecture:
```
MVVM + Hilt DI + ViewBinding + Repository Pattern
NO Jetpack Compose — XML only
NO Firebase Auth — Supabase only
```

### Navigation:
```kotlin
// MainActivity with BottomNavigationView + NavController
// 4 main fragments: Home, Discover, Reels, Profile
// Center FAB for Go Live / Create Party
```

### Network:
```kotlin
// All API calls via Supabase Kotlin SDK
// io.github.jan.supabase:bom:3.1.4
// Ktor for HTTP, Kotlin Serialization for JSON
// ALL network calls on Dispatchers.IO
```

### Real-time:
```kotlin
// Supabase Realtime channels for:
// - Live stream chat
// - Viewer count
// - Gift events
// - Online presence
// - Party room state
```

### Media:
```kotlin
// LiveKit Android SDK for streaming
// ExoPlayer for video playback (Reels)
// Coil for image loading
// DeepAR for beauty filters
// SVGAPlayer for gift animations
// Lottie for UI animations
```

### Data Loading Pattern:
```kotlin
// 1. Show cached data instantly (Room DB or SharedPreferences)
// 2. Fetch fresh data from Supabase
// 3. Update UI with DiffUtil
// 4. Cache new data
```

---

## 🚨 CRASH PREVENTION CHECKLIST

1. ✅ `app/build.gradle.kts`: `java.setSrcDirs(listOf("src/main/java"))` — prevents kapt crash
2. ✅ All Supabase calls wrapped in `viewModelScope.launch(Dispatchers.IO)`
3. ✅ UI updates only on `Dispatchers.Main` or `withContext(Dispatchers.Main)`
4. ✅ Null-safe everywhere: `profile?.display_name ?: "User"`
5. ✅ Lifecycle-aware: check `isAdded` / `viewLifecycleOwner` before UI updates
6. ✅ ProGuard rules for Supabase/Ktor/Kotlin Serialization
7. ✅ Memory management: release camera/player in `onDestroyView`

---

## 📋 SCAN CHECKLIST

Before marking any screen as "done", verify against the web:

- [ ] Color tokens match exactly (compare hex values)
- [ ] Font sizes match (web px ≈ Android sp)
- [ ] Corner radius matches (web rem × 16 = Android dp)
- [ ] Gradient directions match (135deg, to-right, etc.)
- [ ] Spacing matches (web px ≈ Android dp on mobile)
- [ ] Icons match (Lucide → Material Icons or custom SVG)
- [ ] Animations exist (entrance, transitions, loading states)
- [ ] Dark theme is default (no light mode in app)
- [ ] Touch feedback (ripple effects, scale on press)
- [ ] Safe area handled (notch, navigation bar)
- [ ] RTL support considered
- [ ] Empty states match
- [ ] Loading skeletons/shimmer match
- [ ] Error states match
- [ ] Pull-to-refresh on scrollable screens

---

**HOW TO USE THIS PROMPT:**

1. Paste this entire file into GitHub Copilot Chat
2. Say: "Scan `src/pages/Index.tsx` and build HomeFragment.kt with fragment_home.xml matching exactly"
3. For each page, reference the specific web file
4. Ask ONE page at a time for best results
5. After each page, say: "Compare the native output with the web source and list any visual differences"
