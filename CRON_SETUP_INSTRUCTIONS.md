# সাপ্তাহিক এজেন্সি ট্রান্সফার ক্রন জব সেটআপ (বাংলাদেশ টাইম)

এই ফাইলে সাপ্তাহিক অটোমেটিক ট্রান্সফার সেটআপ করার নির্দেশনা দেওয়া হয়েছে।

## Prerequisites
1. pg_cron এবং pg_net এক্সটেনশন ইতিমধ্যে enabled আছে।

## 🇧🇩 বাংলাদেশ টাইম ক্রন জব সেটআপ

Supabase Dashboard → SQL Editor এ গিয়ে নিচের SQL রান করুন:

```sql
-- প্রথমে পুরাতন ক্রন জব আনশিডিউল করুন (যদি থাকে)
SELECT cron.unschedule('weekly-agency-transfer');
SELECT cron.unschedule('weekly-agency-transfer-bd');

-- বাংলাদেশ টাইম অনুযায়ী নতুন ক্রন জব তৈরি করুন
-- বাংলাদেশ রাত ১২:০০ (Sunday 00:00 BST) = শনিবার সন্ধ্যা ৬:০০ UTC (Saturday 18:00 UTC)
SELECT cron.schedule(
  'weekly-agency-transfer-bd',
  '0 18 * * 6',  -- Every Saturday at 18:00 UTC = Sunday 00:00 Bangladesh time
  $$
  SELECT
    net.http_post(
        url:='https://pppcwawjjpwwrmvezcdy.supabase.co/functions/v1/agency-weekly-transfer',
        headers:=jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwcGN3YXdqanB3d3JtdmV6Y2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzQ4OTYsImV4cCI6MjA4MzkxMDg5Nn0.VUy58uiU63Kb3i4qj2ALK2s3arjBJ25CbnwCcvblpQw'
        ),
        body:=jsonb_build_object('time', now()::text, 'type', 'scheduled_bd_time', 'timezone', 'Asia/Dhaka')
    ) AS request_id;
  $$
);
```

## ⏰ টাইমজোন রেফারেন্স

| বাংলাদেশ সময় (BST) | UTC সময় |
|---------------------|----------|
| রবিবার রাত ১২:০০ | শনিবার ১৮:০০ |
| সোমবার রাত ১২:০০ | রবিবার ১৮:০০ |
| মঙ্গলবার রাত ১২:০০ | সোমবার ১৮:০০ |

## ক্রন জব চেক করুন

```sql
-- সব ক্রন জব দেখুন
SELECT * FROM cron.job;

-- ক্রন জব রান হিস্ট্রি দেখুন
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

## ক্রন জব ডিলিট করুন (প্রয়োজনে)

```sql
SELECT cron.unschedule('weekly-agency-transfer-bd');
```

## ম্যানুয়াল ট্রান্সফার

যদি এখনই ট্রান্সফার চালাতে চান:

```sql
SELECT process_weekly_agency_transfers();
```

## কীভাবে কাজ করে

1. **প্রতি রবিবার রাত ১২:০০ টা (বাংলাদেশ সময়)** - অটোমেটিক ট্রান্সফার শুরু হয়
2. **সকল অ্যাক্টিভ এজেন্সি** - লুপ করে প্রতিটি এজেন্সি চেক করে
3. **হোস্টদের আয়** - প্রতিটি হোস্টের `total_earnings` চেক করে
4. **কমিশন ক্যালকুলেশন** - টায়ার অনুযায়ী কমিশন ক্যালকুলেট করে
5. **ট্রান্সফার রেকর্ড** - `agency_earnings_transfers` টেবিলে রেকর্ড করে
6. **ব্যালেন্স আপডেট** - এজেন্সির `beans_balance` এ যোগ করে
7. **হোস্ট আপডেট** - হোস্টের `total_earnings` রিসেট করে `pending_earnings` এ মুভ করে

---

# সাপ্তাহিক হোস্ট লেভেল রিসেট ক্রন জব

হোস্টদের লেভেল প্রতি সপ্তাহে রিসেট হয়। যদি তারা এক সপ্তাহে পর্যাপ্ত আয় না করে, তাদের লেভেল 0 তে নেমে যাবে।

## ক্রন জব সেটআপ করুন

```sql
-- হোস্ট লেভেল সাপ্তাহিক রিসেট (বাংলাদেশ টাইম - প্রতিদিন রাত ১২:০০)
SELECT cron.schedule(
  'daily-host-level-reset-check-bd',
  '0 18 * * *', -- Every day at 18:00 UTC = 00:00 Bangladesh time
  $$
  SELECT reset_host_levels_weekly();
  $$
);
```

## গুরুত্বপূর্ণ তথ্য

- **ইউজার লেভেল**: স্থায়ী, কখনো কমে না। যত বেশি টপ-আপ, তত উপরে লেভেল।
- **হোস্ট লেভেল**: সাপ্তাহিক আয়ের উপর ভিত্তি করে। ৭ দিন পর রিসেট হয়, আবার আয় করলে আপগ্রেড হয়।
- **টাইমজোন**: সব সময় বাংলাদেশ টাইম (UTC+6) অনুযায়ী কাজ করে।

---

# সাপ্তাহিক কন্টাক্ট শেয়ারিং ভায়োলেশন রিসেট

প্রতি রবিবার রাত ১২:৩০ (BST) এ সমস্ত কন্টাক্ট শেয়ারিং রিপোর্ট (নাম্বার, ছবি, IMO, WhatsApp, Facebook) অটোমেটিক আর্কাইভ হয়ে যাবে এবং নতুন সপ্তাহে নতুন করে কাউন্টিং শুরু হবে।

## ক্রন জব সেটআপ করুন

```sql
-- প্রথমে পুরাতন জব আনশিডিউল করুন (যদি থাকে)
SELECT cron.unschedule('weekly-contact-violations-reset');

-- সাপ্তাহিক কন্টাক্ট ভায়োলেশন রিসেট (রবিবার রাত ১২:৩০ BST = শনিবার ১৮:৩০ UTC)
SELECT cron.schedule(
  'weekly-contact-violations-reset',
  '30 18 * * 6',  -- Every Saturday at 18:30 UTC = Sunday 00:30 Bangladesh time
  $$
  SELECT public.reset_weekly_contact_violations();
  $$
);
```

## কীভাবে কাজ করে

1. **প্রতি রবিবার রাত ১২:৩০ (BST)** - অটোমেটিক রিসেট শুরু হয়
2. **chat_moderation_logs** - contact_sharing, phone_number, social_media, image_contact টাইপের unreviewed ভায়োলেশনগুলো আর্কাইভ হয়
3. **host_contact_violations** - unreviewed ভায়োলেশনগুলো আর্কাইভ হয়
4. **নতুন সপ্তাহে** - নতুন ভায়োলেশনগুলো ফ্রেশ কাউন্টিং শুরু হয়

## ম্যানুয়াল রিসেট (প্রয়োজনে)

```sql
SELECT public.reset_weekly_contact_violations();
```

---

# এজেন্সি মিনিমাম হোস্ট চেক (অটো-ডিঅ্যাক্টিভেশন)

প্রতিদিন চেক করা হবে — যেসব এজেন্সি ১ মাস (৩০ দিন) পূর্ণ হয়েছে কিন্তু ১০টি অ্যাক্টিভ হোস্ট নেই, তাদের এজেন্সি অটোমেটিক বন্ধ হয়ে যাবে।

## ক্রন জব সেটআপ করুন

```sql
-- পুরাতন জব আনশিডিউল করুন (যদি থাকে)
SELECT cron.unschedule('daily-agency-host-check');

-- প্রতিদিন রাত ১:০০ BST (19:00 UTC) এ চেক করবে
SELECT cron.schedule(
  'daily-agency-host-check',
  '0 19 * * *',  -- Every day at 19:00 UTC = 01:00 AM Bangladesh time
  $$
  SELECT public.check_agency_minimum_hosts();
  $$
);
```

## ম্যানুয়াল চেক (প্রয়োজনে)

```sql
SELECT public.check_agency_minimum_hosts();
```

## কীভাবে কাজ করে

1. **প্রতিদিন রাত ১:০০ (BST)** - অটোমেটিক চেক শুরু হয়
2. **৩০ দিন পুরানো এজেন্সি** - শুধুমাত্র ১ মাস+ পুরানো এজেন্সি চেক করে
3. **অ্যাক্টিভ হোস্ট গণনা** - `agency_hosts` টেবিল থেকে status='active' হোস্ট গণনা করে
4. **১০ এর কম হলে** - এজেন্সি `is_active = false` করে দেয় এবং কারণ লিখে রাখে
5. **১০+ হোস্ট থাকলে** - কিছুই হয় না, এজেন্সি সচল থাকে
