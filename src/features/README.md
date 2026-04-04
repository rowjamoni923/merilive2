# MeriLive Modular Architecture

## 🎯 Core Principle

**One Link = One Change = All Places Updated**

This architecture ensures:
1. **Shared systems** (Gifting, Animations, Frames, Messaging) are centralized
2. **Feature modules** (Live, Party, Call, etc.) are isolated
3. Changes to shared systems update everywhere automatically
4. Changes to features only affect that specific feature

---

## 📁 Directory Structure

```
src/features/
├── shared/                    # SHARED SYSTEMS (One Link)
│   ├── index.ts              # Main shared exports
│   ├── gifting/              # 🎁 Unified Gifting System
│   │   ├── index.ts
│   │   └── GiftingService.ts
│   ├── animations/           # ✨ Unified Animation System
│   │   └── index.ts
│   ├── frames/               # 🖼️ Unified Frame System
│   │   └── index.ts
│   └── messaging/            # 💬 Unified Messaging System
│       └── index.ts
│
├── home/                     # 🏠 Home Page Feature
├── live/                     # 📺 Live Streaming Feature
├── party/                    # 🎉 Party Rooms Feature
├── call/                     # 📞 Private Calling Feature
├── chat/                     # 💬 Direct Messages Feature
├── profile/                  # 👤 User Profiles Feature
├── agency/                   # 🏢 Agency Management Feature
├── admin/                    # ⚙️ Admin Panel Feature
├── reels/                    # 🎬 Reels/Short Videos Feature
├── vip/                      # 👑 VIP Membership Feature
└── shop/                     # 🛒 Shop/Store Feature
```

---

## 🔗 Shared Systems (Change Once = Update Everywhere)

### 1. Gifting System (`/shared/gifting/`)
```typescript
import { GiftPanel, FlyingGiftAnimation, sendGift } from '@/features/shared';
```
**Used in:** Live, Party, Call, Chat, Profile

### 2. Animation System (`/shared/animations/`)
```typescript
import { SVGAPlayer, UniversalAnimationPlayer, EntranceAnimation } from '@/features/shared';
```
**Used in:** Live, Party, Gifts, Frames

### 3. Frame System (`/shared/frames/`)
```typescript
import { AvatarWithFrame, Premium3DFrame } from '@/features/shared';
```
**Used in:** Profile, Chat, Live, Party, Leaderboard

### 4. Messaging System (`/shared/messaging/`)
```typescript
import { ProfessionalChatMessage, EmojiPicker } from '@/features/shared';
```
**Used in:** Live Chat, Party Chat, Direct Messages

---

## 🔒 Isolated Features

| Feature | Path | Description |
|---------|------|-------------|
| **Home** | `/home/` | Home page, user cards, banners |
| **Live** | `/live/` | Go Live, stream viewing, PK battles |
| **Party** | `/party/` | Audio/Video/Game rooms |
| **Call** | `/call/` | Private calling, WebRTC |
| **Chat** | `/chat/` | Direct messages |
| **Profile** | `/profile/` | User profiles |
| **Agency** | `/agency/` | Agency dashboard |
| **Admin** | `/admin/` | Admin panel |
| **Reels** | `/reels/` | Short videos |
| **VIP** | `/vip/` | VIP membership |
| **Shop** | `/shop/` | Store, recharge |

---

## 🔄 Change Impact Matrix

| If You Change... | Affects... |
|------------------|------------|
| `/shared/gifting/` | Live, Party, Call, Chat, Profile |
| `/shared/animations/` | Live, Party, Gifts, Frames |
| `/shared/frames/` | Profile, Chat, Live, Party, Leaderboard |
| `/shared/messaging/` | Live Chat, Party Chat, Direct Messages |
| `/live/` | Only Live Streaming |
| `/party/` | Only Party Rooms |

---

## ⚠️ Rules

1. **NEVER** duplicate shared components in feature folders
2. **ALWAYS** use shared imports for Gifting, Animations, Frames, Messaging
3. **KEEP** feature-specific code in feature folders
4. **UPDATE** shared modules when you need global changes
