# LiveKit Media Stack — VPS Deploy Guide (M3)

Single Docker Compose stack that brings up **Egress** + **Ingress** + **Redis** on your existing VPS where the LiveKit SFU (`wss://livekit.merilive.xyz`) is already running.

This unlocks:
- ✅ **Pkg111** — Room Composite recording (host start/stop → S3/R2)
- ✅ **Pkg114** — RTMP simulcast (YouTube / Facebook / Twitch / custom)
- ✅ **Pkg113** — HLS egress (low-latency replay)
- ✅ **Pkg181a** — OBS / RTMP / WHIP ingest (pro hosts stream from desktop)

The Lovable client code is already 100% wired — this just lights up the backend so those features actually run.

---

## 1. Prerequisites on VPS

```bash
# Docker + compose
curl -fsSL https://get.docker.com | sh
sudo apt install docker-compose-plugin -y

# Verify
docker --version
docker compose version
```

Firewall (UFW example):
```bash
sudo ufw allow 1935/tcp   comment 'LiveKit Ingress RTMP'
sudo ufw allow 8080/tcp   comment 'LiveKit Ingress WHIP'
sudo ufw allow 7885/udp   comment 'LiveKit Ingress WHIP media'
sudo ufw allow 50000:60000/udp comment 'LiveKit Egress/Ingress media'
sudo ufw reload
```

(Optional) DNS A record: `ingress.merilive.xyz → <VPS IP>` — gives OBS users a friendly URL.

---

## 2. Cloudflare R2 — already done ✅

The R2 bucket is already created and these secrets are already in Supabase:
- `R2_ACCOUNT_ID`
- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`

All 4 egress edge functions (`livekit-egress`, `livekit-hls-egress`,
`livekit-track-egress`, `livekit-auto-record`) now read these `R2_*` secrets
automatically — **no extra Supabase secrets needed**.

You only need to copy the same 4 values into the VPS `.env` (next step) so the
Egress Docker container can upload recordings directly to R2.

---

## 3. Supabase secrets — already done ✅

`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and all 4 `R2_*` keys
are already configured. Nothing to add on the Supabase side.

---

## 4. Deploy on VPS

```bash
# On your VPS
mkdir -p ~/livekit-media && cd ~/livekit-media

# Copy the two files from this repo
scp agents/media-stack/docker-compose.yml user@vps:~/livekit-media/
scp agents/media-stack/.env.example user@vps:~/livekit-media/.env

# Edit .env — fill in real LIVEKIT_API_KEY/SECRET, REDIS_PASSWORD, S3 creds
nano .env

# Generate a strong Redis password
sed -i "s/change_me_to_a_long_random_string/$(openssl rand -hex 32)/" .env

# Pull + start
docker compose pull
docker compose up -d

# Verify
docker compose ps
docker compose logs -f egress ingress
```

Healthy logs:
- **egress**: `starting egress service` → `worker registered`
- **ingress**: `starting ingress service` → `RTMP listening on :1935` + `WHIP listening on :8080`
- **redis**: `Ready to accept connections`

---

## 5. Wire SFU to same Redis

Your existing LiveKit SFU `config.yaml` on the VPS must point at the same Redis so Egress/Ingress can dispatch jobs:

```yaml
# /etc/livekit/config.yaml (or wherever your SFU lives)
redis:
  address: 127.0.0.1:6379   # or redis:6379 if SFU is in the same compose
  password: <REDIS_PASSWORD from .env>
```

Restart SFU:
```bash
sudo systemctl restart livekit-server
# or: docker restart livekit-server
```

---

## 6. Flip kill-switches ON in Supabase

Run in Supabase SQL editor (or use Lovable's database migration):

```sql
UPDATE app_settings
SET value = jsonb_set(
  jsonb_set(
    jsonb_set(value::jsonb, '{egress}', 'true'),
    '{stream_egress}', 'true'
  ),
  '{ingress}', 'true'
)::text
WHERE key = 'livekit_signaling_enabled';
```

---

## 7. Smoke tests

### Recording (Pkg111)
1. Host goes Live → opens Settings → Auto-record ON
2. Stream for 30s → end stream
3. Check `/my-recordings` page → MP4 should appear with playback

### RTMP simulcast (Pkg114)
1. Host goes Live → opens SimulcastDialog
2. Paste YouTube RTMP URL: `rtmp://a.rtmp.youtube.com/live2/<key>`
3. Click Start → YouTube Studio should show LIVE within 10s

### OBS ingress (Pkg181a)
1. Host opens `/host/obs-stream` → toggle RTMP → Generate
2. Copy Server URL: `rtmp://<VPS IP>:1935/x` + Stream Key
3. OBS → Settings → Stream → Custom → paste → Start Streaming
4. Viewers see host stream in normal Live room within 5s

---

## 8. Monitoring

```bash
# Tail all
docker compose logs -f

# Resource usage
docker stats

# Egress active jobs
docker compose exec egress curl -s http://localhost:6789/healthz | jq

# Ingress active jobs
docker compose exec ingress curl -s http://localhost:9090/healthz | jq
```

For production: add Prometheus scraping on `:6789/metrics` (egress) and `:9090/metrics` (ingress) → Grafana dashboard (covered later in M7).

---

## 9. Updating

```bash
cd ~/livekit-media
docker compose pull
docker compose up -d
```

Zero downtime — ongoing recordings/streams finish on old container; new ones use new image.

---

## 10. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Egress logs: `redis: connection refused` | Wrong `REDIS_PASSWORD` in `.env` OR SFU not on same Redis |
| Egress logs: `failed to upload to s3` | Wrong S3 endpoint / region / creds → re-check R2 token scope |
| Ingress logs: `RTMP listener bind error` | Port 1935 already used (Nginx-RTMP?) → stop it: `sudo systemctl stop nginx-rtmp` |
| OBS connects but no video in app | Stream Key mismatch — regenerate in `/host/obs-stream` |
| RTMP push to YouTube fails | YouTube key expired (24h) OR account not live-enabled |
| MP4 too large / slow upload | Reduce `cpu_cost.room_composite_cpu_cost` in compose env, or bump VPS RAM |

---

## Done ✅

After step 7 passes all three smoke tests, M3 is fully live. Move on to **M5** (Moderator agent deploy) or **M2** (live captions UI) next.
