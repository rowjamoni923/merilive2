# 💎 Google Play Billing Complete Setup Guide

## 📋 সম্পূর্ণ সেটআপ গাইড - MeriLive Diamond/Coin Recharge

---

## ✅ Step 1: Google Play Console এ Products তৈরি করুন

আপনার Screenshot অনুযায়ী `diamonds-650000` তৈরি করা হয়েছে। বাকি প্রোডাক্টগুলো একই ফরম্যাটে তৈরি করুন:

### ⚠️ গুরুত্বপূর্ণ: দুটি আলাদা ID আছে!

Google Play Console এ **দুটি আলাদা ID** দিতে হয়:

| ধাপ | Field Name | Format | Example |
|-----|------------|--------|---------|
| **Step 1** | Product ID | underscore `_` | `diamonds_7000` |
| **Step 2** | Purchase Option ID | hyphen `-` | `diamonds-7000` |

**আমাদের SDK শুধু Product ID (underscore) ব্যবহার করে!**

### তৈরি করতে হবে:
| Product ID (Step 1) | Purchase Option ID (Step 2) | Coins | Price (USD) |
|---------------------|----------------------------|-------|-------------|
| `diamonds_7000` | `diamonds-7000` | 7,000 | $1.99 |
| `diamonds_13200` | `diamonds-13200` | 13,200 | $3.99 |
| `diamonds_56000` | `diamonds-56000` | 56,000 | $14.99 |
| `diamonds_169000` | `diamonds-169000` | 169,000 | $23.99 |
| `diamonds_470000` | `diamonds-470000` | 470,000 | $59.99 |
| `diamonds_650000` | `diamonds-650000` | 650,000 | $129.99 |

### প্রতিটি প্রোডাক্ট তৈরির ধাপ:
1. **Google Play Console** → **Monetize** → **Products** → **In-app products**
2. **Create product** ক্লিক করুন
3. **Product ID**: `diamonds_7000` (underscore `_` ব্যবহার করুন)
4. **Name**: `7000 Diamonds`
5. **Description**: `Get 7000 diamonds for use in MeriLive`
6. **Next** ক্লিক করুন
7. **Purchase Option ID**: `diamonds-7000` (hyphen `-` ব্যবহার করুন)
8. **দেশ এবং মূল্য** সেট করুন
9. **Activate** ক্লিক করুন

---

## ✅ Step 2: Android Studio তে build.gradle Setup

`android/app/build.gradle` এ নিম্নলিখিত dependencies যোগ করুন:

```gradle
dependencies {
    // ... existing dependencies
    
    // Google Play Billing (REQUIRED)
    implementation 'com.android.billingclient:billing:6.1.0'
}
```

---

## ✅ Step 3: PlayStoreBillingPlugin.java

আপনার প্রজেক্টে এটি অলরেডি আছে:
`android/app/src/main/java/com/merilive/app/PlayStoreBillingPlugin.java`

---

## ✅ Step 4: MainActivity.java তে Plugin Register করুন

```java
package com.merilive.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.codetrixstudio.capacitor.GoogleAuth.GoogleAuth;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register plugins BEFORE super.onCreate()
        registerPlugin(GoogleAuth.class);
        registerPlugin(PlayStoreBillingPlugin.class);  // এটি যোগ করুন
        
        super.onCreate(savedInstanceState);
    }
}
```

---

## ✅ Step 5: TypeScript SDK Setup

আপনার প্রজেক্টে অলরেডি আছে: `src/sdk/PlayStoreBillingSDK.ts`

### Usage Example:
```typescript
import { PlayStoreBillingSDK } from '@/sdk/PlayStoreBillingSDK';

// Initialize (app startup এ)
await PlayStoreBillingSDK.initialize();

// Get products
const products = await PlayStoreBillingSDK.getProducts([
  'diamonds_70',
  'diamonds_350',
  'diamonds_700',
  'diamonds_3500',
  'diamonds_7000',
  'diamonds_35000',
  'diamonds_650000'
]);

// Purchase a product
const result = await PlayStoreBillingSDK.purchase('diamonds_700');
if (result.success) {
  console.log('Purchase successful!', result.orderId);
  // Add coins to user's account
}
```

---

## ✅ Step 6: Recharge Page Integration

`src/pages/Recharge.tsx` এ integration করুন:

```typescript
import { PlayStoreBillingSDK } from '@/sdk/PlayStoreBillingSDK';
import { Capacitor } from '@capacitor/core';

// Check if running on native Android
const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';

// Initialize billing on mount
useEffect(() => {
  if (isNativeAndroid) {
    PlayStoreBillingSDK.initialize()
      .then(() => console.log('Billing initialized'))
      .catch(err => console.error('Billing init failed:', err));
  }
}, []);

// Purchase handler
const handlePurchase = async (packageId: string, coins: number) => {
  if (isNativeAndroid) {
    try {
      const productId = `diamonds_${coins}`;
      const result = await PlayStoreBillingSDK.purchase(productId);
      
      if (result.success) {
        // Update user's coin balance in database
        await supabase
          .from('profiles')
          .update({ 
            coins: userCoins + coins,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);
          
        // Record transaction
        await supabase
          .from('coin_transactions')
          .insert({
            user_id: userId,
            amount: coins,
            transaction_type: 'google_play_purchase',
            order_id: result.orderId,
            purchase_token: result.purchaseToken
          });
          
        toast({
          title: '✅ Purchase Successful!',
          description: `${coins} diamonds added to your account.`
        });
      }
    } catch (error) {
      console.error('Purchase error:', error);
      toast({
        title: 'Purchase Failed',
        description: error.message,
        variant: 'destructive'
      });
    }
  } else {
    // Web fallback - redirect to manual payment
    toast({
      title: 'Android Required',
      description: 'In-app purchases only available on Android app.'
    });
  }
};
```

---

## ✅ Step 7: Database Table - coin_transactions

এই টেবিল তৈরি করুন (যদি না থাকে):

```sql
CREATE TABLE public.coin_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,
  order_id TEXT,
  purchase_token TEXT,
  package_id TEXT,
  status TEXT DEFAULT 'completed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own transactions
CREATE POLICY "Users can view own transactions"
ON public.coin_transactions
FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Service role can insert
CREATE POLICY "Service can insert transactions"
ON public.coin_transactions
FOR INSERT
WITH CHECK (true);
```

---

## ✅ Step 8: Testing (Internal Testing Track)

### 8.1 Internal Testing Setup:
1. **Google Play Console** → **Testing** → **Internal testing**
2. **Create new release** ক্লিক করুন
3. আপনার signed APK/AAB আপলোড করুন
4. **Testers** ট্যাবে testers এর email যোগ করুন
5. **Copy link** - এই লিংকটি testers দের দিন

### 8.2 License Testing Setup:
1. **Google Play Console** → **Settings** → **License testing**
2. আপনার test email address যোগ করুন
3. **License response**: "RESPOND_NORMALLY" সিলেক্ট করুন
4. এই users রা real money ছাড়াই test purchase করতে পারবে

---

## ✅ Step 9: Build & Deploy Commands

```bash
# 1. Project pull করুন
git pull origin main

# 2. Dependencies install
npm install --legacy-peer-deps

# 3. Build project
npm run build

# 4. Sync to Android
npx cap sync android

# 5. Open Android Studio
npx cap open android
```

### Android Studio তে:
1. **Build** → **Generate Signed Bundle / APK**
2. **Android App Bundle (AAB)** সিলেক্ট করুন (Play Store এর জন্য)
3. Keystore সিলেক্ট করুন
4. **Release** build type সিলেক্ট করুন
5. **Finish** ক্লিক করুন

---

## ✅ Step 10: Upload to Play Console

1. **Google Play Console** → **Release** → **Production** (বা Internal testing)
2. **Create new release**
3. AAB ফাইল আপলোড করুন
4. **Release notes** যোগ করুন
5. **Review release** → **Start rollout**

---

## 📱 Product ID Mapping (Database সাথে Sync)

আপনার `coin_packages` টেবিলে Product ID mapping যোগ করতে হবে:

```sql
-- Add google_play_product_id column if not exists
ALTER TABLE coin_packages 
ADD COLUMN IF NOT EXISTS google_play_product_id TEXT;

-- Update existing packages with product IDs
UPDATE coin_packages SET google_play_product_id = 'diamonds_70' WHERE coins = 70;
UPDATE coin_packages SET google_play_product_id = 'diamonds_350' WHERE coins = 350;
UPDATE coin_packages SET google_play_product_id = 'diamonds_700' WHERE coins = 700;
UPDATE coin_packages SET google_play_product_id = 'diamonds_3500' WHERE coins = 3500;
UPDATE coin_packages SET google_play_product_id = 'diamonds_7000' WHERE coins = 7000;
UPDATE coin_packages SET google_play_product_id = 'diamonds_35000' WHERE coins = 35000;
UPDATE coin_packages SET google_play_product_id = 'diamonds_650000' WHERE coins = 650000;
```

---

## ⚠️ Important Notes

1. **Product ID Format**: Always use underscore `_` not hyphen `-`
   - ✅ `diamonds_700`
   - ❌ `diamonds-700`

2. **Testing**: Internal testing track এ upload করার পর 24-48 ঘণ্টা অপেক্ষা করুন products activate হতে

3. **Real Money**: License testing এ যোগ করা emails ছাড়া সবাই real money দিয়ে purchase করবে

4. **Refunds**: Google Play Console থেকে refund করতে পারবেন

5. **Server Verification**: Production এ server-side purchase verification যোগ করুন (optional but recommended)

---

## 🆘 Troubleshooting

### "Product not found" Error:
- Product ID সঠিকভাবে spell করা হয়েছে কিনা চেক করুন
- Product টি "Active" status এ আছে কিনা চেক করুন
- App signed AAB দিয়ে internal testing এ upload করা আছে কিনা চেক করুন

### "Billing client not ready" Error:
- `initialize()` call করা হয়েছে কিনা চেক করুন
- Device এ Google Play Services আছে কিনা চেক করুন

### Purchase completes but coins not added:
- Database update সঠিকভাবে হচ্ছে কিনা চেক করুন
- Error handling যোগ করুন
- Supabase connection চেক করুন

---

## ✅ Checklist

- [ ] Google Play Console এ সব products তৈরি করা হয়েছে
- [ ] Products সব "Active" status এ আছে
- [ ] build.gradle এ billing dependency যোগ করা হয়েছে
- [ ] MainActivity.java তে PlayStoreBillingPlugin register করা হয়েছে
- [ ] Internal testing track এ AAB upload করা হয়েছে
- [ ] License testing এ test emails যোগ করা হয়েছে
- [ ] Recharge page এ integration করা হয়েছে
- [ ] coin_transactions টেবিল তৈরি করা হয়েছে
