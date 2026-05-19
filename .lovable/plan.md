## লক্ষ্য

Helper (Level 1-4) দের **Trader Wallet Top-up** পেজে বর্তমান Binance / ePay manual proof flow সরিয়ে **MeriCash auto crypto gateway** add করা — যেটাতে helper crypto pay করলে automatically তাদের `topup_helpers.wallet_balance` এ diamonds credit হবে, admin approval ছাড়া।

User-facing `/recharge` পেজে MeriCash আগের মতোই থাকবে (remove করা হবে না)।

---

## পরিবর্তন সংক্ষেপ

### ১. Database
- নতুন column `recharge_transactions.target_type` ('user_diamond' | 'helper_wallet') — কাকে credit দিতে হবে চিহ্নিত করার জন্য
- নতুন column `recharge_transactions.target_helper_id` (nullable, FK→topup_helpers.id)
- `swift-pay-poll-deposits` / webhook এর crediting trigger কে update করা: target_type='helper_wallet' হলে `topup_helpers.wallet_balance` এ diamonds যোগ হবে (current logic: profile.diamonds এ যোগ হয়)
- `balance_audit_log` এ entry log হবে

### ২. Edge Function
- `swift-pay-create-deposit` কে extend করা: optional `target`