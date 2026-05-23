# V4 — LiveKit Webhook Receiver (VPS-side)

High-performance Node.js webhook receiver running on the **same VPS as LiveKit SFU**.
Receives events over localhost (<5ms latency vs ~150ms via Supabase edge function),
validates the LiveKit signature, and logs to the same `livekit_room_events` table
your edge function uses.

- Endpoint: `POST /livekit/webhook`
- Health:   `GET  /healthz`
- Metrics:  `GET  /metrics` (Prometheus — V5 will scrape this)

---

## Step-by-step VPS deploy

> Assumes VPS already runs LiveKit SFU at `wss://livekit.merilive.xyz`.

### 1. SSH into VPS
```bash
ssh root@<your-vps-ip>
```

### 2. Install Node.js 20 (if missing)
```bash
node -v || (curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs)
```

### 3. Copy this folder to VPS
From your **local machine** (run in project root):
```bash
scp -r agents/webhook root@<your-vps-ip>:/opt/livekit-webhook
```

### 4. Install dependencies
```bash
cd /opt/livekit-webhook
npm install --omit=dev
```

### 5. Configure `.env`
```bash
cp .env.example .env
nano .env
```
Fill in:
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` — **same values** as your SFU's `livekit.yaml`
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase dashboard → Project Settings → API

### 6. Test run
```bash
node server.js
# should print: V4 webhook receiver listening { port: '8088' }
curl http://localhost:8088/healthz
# {"ok":true,"uptime":...}
```
Stop with Ctrl+C.

### 7. Install as systemd service
```bash
cp livekit-webhook.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now livekit-webhook
systemctl status livekit-webhook
```

### 8. Point LiveKit SFU at the local receiver
Edit `/etc/livekit/livekit.yaml` (or wherever your SFU config lives):
```yaml
webhook:
  api_key: <same LIVEKIT_API_KEY>
  urls:
    - http://127.0.0.1:8088/livekit/webhook
```
Then restart SFU:
```bash
systemctl restart livekit-server
```

### 9. Verify end-to-end
- Start a test live room in the app
- Watch logs: `journalctl -u livekit-webhook -f`
- Confirm rows arriving in Supabase: `livekit_room_events` table

### 10. (Optional) Keep Supabase edge function as backup
You can keep both URLs in `livekit.yaml`:
```yaml
urls:
  - http://127.0.0.1:8088/livekit/webhook
  - https://ayjdlvuurscxucatbbah.supabase.co/functions/v1/livekit-webhook
```
Both will receive every event — V4 fast-path, edge fn as redundancy.

---

## Maintenance

- Logs: `journalctl -u livekit-webhook -f`
- Restart: `systemctl restart livekit-webhook`
- Update: `scp` new `server.js` → `systemctl restart livekit-webhook`
- Metrics: `curl http://localhost:8088/metrics`

## Firewall
Port `8088` should **NOT** be open publicly — LiveKit talks to it over localhost only.
Verify: `ufw status` — no rule for 8088.
