# AI Chat Moderator — Deployment Guide (Bangla)

LiveKit-এর Agent Worker হিসেবে চলবে। তোমার VPS-এ (যেখানে `livekit.merilive.xyz` চলছে) deploy করতে হবে। সব AI logic Supabase edge function-এ — এই worker শুধু chat message forward করে।

---

## 1. Supabase সেটআপ (এটা আমি code-এ done করে দিয়েছি)

- ✅ Edge function `ai-moderator` deploy auto হয়ে যাবে।
- ✅ Config row seed হয়েছে: `live_moderation_settings.ai_moderator_config` (default `enabled: false` — সুরক্ষার জন্য)।

**তোমাকে যা করতে হবে Supabase-এ:**

1. Supabase Dashboard → Edge Function Secrets-এ একটা নতুন secret যোগ করো:
   ```
   MODERATOR_AGENT_TOKEN = <একটা strong random string, কমপক্ষে 32 chars>
   ```
   Generate করতে: `openssl rand -hex 32`

2. AI Moderator চালু করতে Supabase SQL Editor-এ:
   ```sql
   UPDATE live_moderation_settings
   SET setting_value = jsonb_set(setting_value, '{enabled}', 'true')
   WHERE setting_key = 'ai_moderator_config';
   ```

3. Prompt / thresholds tune করতে same row edit করো (`setting_value` jsonb field)।

---

## 2. VPS-এ Worker Deploy

SSH দিয়ে তোমার VPS-এ লগইন করো (যেখানে LiveKit server চলছে)।

### Step 2.1 — Files copy

```bash
sudo mkdir -p /opt/ai-moderator
sudo chown $USER:$USER /opt/ai-moderator
cd /opt/ai-moderator
```

`agents/moderator/` ফোল্ডারের সব file (`main.py`, `requirements.txt`, `.env.example`, `Dockerfile`, `ai-moderator.service`) এই directory-তে copy করো। উদাহরণ (local থেকে):

```bash
scp agents/moderator/* user@your-vps:/opt/ai-moderator/
```

### Step 2.2 — `.env` বানাও

```bash
cp /opt/ai-moderator/.env.example /opt/ai-moderator/.env
nano /opt/ai-moderator/.env
```

ফিল করো:
- `LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET` — তোমার LiveKit server-এর key/secret (Supabase secrets-এর সাথে same value)
- `MODERATOR_AGENT_TOKEN` — Step 1-এ যা Supabase-এ যোগ করেছ, **exact same value**
- বাকি default-ই ঠিক আছে

### Step 2.3 — Python virtualenv + install

```bash
cd /opt/ai-moderator
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### Step 2.4 — Test run (foreground)

```bash
cd /opt/ai-moderator
source venv/bin/activate
set -a; source .env; set +a
python main.py dev
```

Output-এ দেখবে:
```
INFO ai-moderator | registered worker ...
INFO ai-moderator | agent joining room=...
```

Ctrl+C দিয়ে stop করো।

### Step 2.5 — systemd service

```bash
# `livekit` user না থাকলে আগে বানাও:
sudo useradd -r -s /usr/sbin/nologin livekit || true
sudo chown -R livekit:livekit /opt/ai-moderator

sudo cp /opt/ai-moderator/ai-moderator.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable ai-moderator
sudo systemctl start ai-moderator

# Logs দেখো:
sudo journalctl -u ai-moderator -f
```

---

## 3. Test

1. App-এ live stream / party room খোলো।
2. একটা chat message পাঠাও — normal "hello" → কিছু হবে না।
3. একটা bad message পাঠাও (গালি বা phone number) → ১ সেকেন্ডে mute/kick হওয়া উচিত।
4. Audit log দেখো:
   - `chat_moderation_logs` — সব classification (allow সহ)
   - `livekit_moderation_log` — শুধু enforced actions

---

## 4. Cost & Performance

- প্রতি chat message-এ ১টা Gemini Flash call (~0.001¢ each)
- ১০০০ chat/min → ~$0.60/hour Lovable AI cost
- Latency: ~300-800ms (mostly Gemini)
- Worker memory: ~80MB per room

---

## 5. Disable / Off করা

```sql
UPDATE live_moderation_settings
SET setting_value = jsonb_set(setting_value, '{enabled}', 'false')
WHERE setting_key = 'ai_moderator_config';
```

Worker restart-এর দরকার নেই — edge function next request-এই respect করবে।

---

## 6. Troubleshooting

| Symptom | Fix |
|---------|-----|
| `401 invalid moderator token` | `MODERATOR_AGENT_TOKEN` Supabase + .env দুই জায়গায় same আছে কিনা check করো |
| `agent joining room` log আসে না | LiveKit API key/secret ভুল, বা LIVEKIT_URL ভুল |
| Classification হয় কিন্তু mute/kick হয় না | Supabase edge fn-এ `LIVEKIT_URL/KEY/SECRET` secrets set করা আছে কিনা check করো |
| Sometimes false positive | `system_prompt` SQL দিয়ে tune করো — restart লাগবে না |
