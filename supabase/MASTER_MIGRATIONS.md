# 🗄️ Master Migration Documentation

এই ফাইলে সমস্ত ডাটাবেস মাইগ্রেশনের তালিকা ও বিস্তারিত রাখা হয়েছে।

---

## 📋 Migration List

### Core Tables

| Migration | Description | Date |
|-----------|-------------|------|
| `profiles` | ইউজার প্রোফাইল টেবিল - display_name, avatar, coins, beans, level, host status | Initial |
| `agencies` | এজেন্সি ম্যানেজমেন্ট - agency_code, diamond_balance, commission | Initial |
| `agency_hosts` | এজেন্সি-হোস্ট সম্পর্ক | Initial |
| `gifts` | গিফট আইটেম - name, coin_value, icon_url, animation_url, category | Initial |
| `gift_transactions` | গিফট পাঠানোর লেনদেন | Initial |
| `live_streams` | লাইভ স্ট্রিম সেশন | Initial |
| `party_rooms` | পার্টি রুম | Initial |
| `conversations` | ব্যক্তিগত চ্যাট কনভার্সেশন | Initial |
| `messages` | চ্যাট মেসেজ | Initial |
| `groups` | গ্রুপ চ্যাট | Initial |
| `notifications` | নোটিফিকেশন | Initial |

### Authentication & Security

| Migration | Description | Date |
|-----------|-------------|------|
| `face_verification_submissions` | ফেস ভেরিফিকেশন | Initial |
| `host_applications` | হোস্ট আবেদন | Initial |
| `chat_moderation_logs` | চ্যাট মডারেশন লগ | Initial |

### Financial

| Migration | Description | Date |
|-----------|-------------|------|
| `coin_packages` | কয়েন প্যাকেজ | Initial |
| `coin_transfers` | কয়েন ট্রান্সফার | Initial |
| `agency_withdrawals` | এজেন্সি উইথড্রয়াল | Initial |
| `topup_helpers` | টপআপ হেল্পার | Initial |

### Admin & Settings

| Migration | Description | Date |
|-----------|-------------|------|
| `admin_logs` | এডমিন একশন লগ | Initial |
| `app_settings` | অ্যাপ সেটিংস | Initial |
| `banners` | ব্যানার ম্যানেজমেন্ট | Initial |
| `level_privileges` | লেভেল প্রিভিলেজ | Initial |

---

## 🔄 Recent Updates

### 2026-01-15: Gift Category System
```sql
-- gifts টেবিলে category কলাম যোগ
ALTER TABLE gifts ADD COLUMN category TEXT DEFAULT 'popular';

-- animation_url কলাম যোগ (GIF/MP4/Lottie সাপোর্ট)
ALTER TABLE gifts ADD COLUMN animation_url TEXT;

-- animation_type কলাম যোগ
ALTER TABLE gifts ADD COLUMN animation_type TEXT DEFAULT 'emoji';
```

### 2026-01-15: Phone Detection Alert System
```sql
-- chat_moderation_logs টেবিলে violation_type আপডেট
-- phone_detection_alert নোটিফিকেশন টাইপ যোগ
```

---

## 📝 Schema Overview

### profiles
```sql
id UUID PRIMARY KEY
email TEXT
display_name TEXT
avatar_url TEXT
bio TEXT
age INTEGER
gender TEXT
coins INTEGER DEFAULT 0
beans INTEGER DEFAULT 0
level INTEGER DEFAULT 1
xp INTEGER DEFAULT 0
is_host BOOLEAN DEFAULT FALSE
host_status TEXT
is_verified BOOLEAN DEFAULT FALSE
is_online BOOLEAN DEFAULT FALSE
country_code TEXT
created_at TIMESTAMP
updated_at TIMESTAMP
```

### gifts
```sql
id UUID PRIMARY KEY
name TEXT NOT NULL
coin_value INTEGER NOT NULL
icon_url TEXT
animation_url TEXT
animation_type TEXT DEFAULT 'emoji'
category TEXT DEFAULT 'popular'
display_order INTEGER
is_active BOOLEAN DEFAULT TRUE
created_at TIMESTAMP
```

### gift_transactions
```sql
id UUID PRIMARY KEY
gift_id UUID REFERENCES gifts
sender_id UUID REFERENCES profiles
receiver_id UUID REFERENCES profiles
stream_id UUID REFERENCES live_streams
coin_amount INTEGER NOT NULL
created_at TIMESTAMP
```

### notifications
```sql
id UUID PRIMARY KEY
user_id UUID REFERENCES profiles
type TEXT NOT NULL
title TEXT NOT NULL
message TEXT NOT NULL
data JSONB
is_read BOOLEAN DEFAULT FALSE
created_at TIMESTAMP
```

---

## 🔐 RLS Policies Summary

| Table | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| profiles | Public | Own | Own | - |
| gifts | Public | Admin | Admin | Admin |
| gift_transactions | Participants | Auth | - | - |
| messages | Participants | Auth | Own | - |
| notifications | Own | Auth | Own | - |
| live_streams | Public | Host | Host | Host |

---

## 📌 Notes

1. **মাইগ্রেশন নিয়ম**: প্রতিটি নতুন স্কিমা পরিবর্তন একটি নতুন মাইগ্রেশন ফাইল হিসেবে তৈরি হবে
2. **ব্যাকআপ**: বড় পরিবর্তনের আগে সবসময় ডাটাবেস ব্যাকআপ নিন
3. **RLS**: সমস্ত টেবিলে Row Level Security সক্রিয় আছে
4. **টাইমস্ট্যাম্প**: সব টেবিলে `created_at` এবং প্রয়োজনে `updated_at` আছে

---

## 🛠️ How to Add New Migration

1. Lovable এ মাইগ্রেশন টুল ব্যবহার করুন
2. SQL লিখুন
3. ইউজার অ্যাপ্রুভ করলে অটো রান হবে
4. এই ফাইলে ডকুমেন্ট করুন

---

*Last Updated: 2026-01-15*
