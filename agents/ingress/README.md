# LiveKit Ingress — VPS Deployment Guide (N3)

Your client-side UI + edge function are 100% ready (route `/host/obs-stream`).
The only remaining piece is the **`livekit-ingress` service** running on your VPS
alongside the LiveKit SFU.

Without this service, the edge function will fail to create ingresses.

---

## Architecture

```
OBS (host's desktop)
   │  RTMP push :1935 / WHIP push :8080
   ▼
livekit-ingress (Docker on your VPS)
   │  internal gRPC
   ▼
livekit-server (already running at livekit.merilive.xyz)
   │  WebRTC
   ▼
Viewers in app
```

---

## 1. Prerequisites on your VPS

- Docker installed
- Ports open in firewall:
  - **1935/tcp** — RTMP push
  - **7885/udp** — WHIP / WebRTC (UDP range)
  - **8080/tcp** — WHIP signaling
- Redis instance (LiveKit SFU already uses one — re-use it)
- The same `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` your SFU uses

---

## 2. Create `/opt/livekit-ingress/config.yaml`

```yaml
log_level: info
api_key: YOUR_LIVEKIT_API_KEY
api_secret: YOUR_LIVEKIT_API_SECRET
ws_url: wss://livekit.merilive.xyz

redis:
  address: 127.0.0.1:6379

rtmp_port: 1935
whip_port: 8080
http_relay_port: 9090

# Public hostnames advertised to encoders (must be reachable from internet)
rtmp_base_url: rtmp://livekit.merilive.xyz:1935/x
whip_base_url: https://livekit.merilive.xyz:8080/w
```

Replace `YOUR_LIVEKIT_API_KEY` / `YOUR_LIVEKIT_API_SECRET` with the same values
already configured in Supabase secrets.

---

## 3. Run as Docker container

```bash
docker run -d --name livekit-ingress \
  --restart unless-stopped \
  --network host \
  -v /opt/livekit-ingress/config.yaml:/config.yaml \
  -e INGRESS_CONFIG_FILE=/config.yaml \
  livekit/ingress:latest
```

Use `--network host` so the service can bind to ports 1935/8080 directly and
reach the local Redis without extra plumbing.

---

## 4. Verify

```bash
docker logs -f livekit-ingress
```

You should see:
```
starting ingress service
listening for RTMP on :1935
listening for WHIP on :8080
```

---

## 5. Open firewall (UFW example)

```bash
sudo ufw allow 1935/tcp
sudo ufw allow 8080/tcp
sudo ufw allow 7885:7990/udp   # WHIP media (UDP range)
```

If you're behind Cloudflare, do **not** proxy ports 1935 / 8080 — they must be
direct (gray-cloud, "DNS only").

---

## 6. End-to-end test

1. Open the app → log in as a host → go to **Host Dashboard → OBS**
2. Click **Generate RTMP credentials**
3. Copy Server URL + Stream Key into OBS Studio → Settings → Stream
4. OBS → **Start Streaming**
5. Open the app on another device → your live stream should appear with the
   OBS feed as host video.

---

## 7. Optional: systemd wrapper (if you prefer no-Docker)

Download the binary from <https://github.com/livekit/ingress/releases> and:

```ini
# /etc/systemd/system/livekit-ingress.service
[Unit]
Description=LiveKit Ingress
After=network.target redis.service

[Service]
ExecStart=/usr/local/bin/ingress --config /opt/livekit-ingress/config.yaml
Restart=on-failure
User=livekit
Group=livekit

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now livekit-ingress
```

---

## Cost

Zero additional cost — runs on your existing VPS. Bandwidth: ~1–3 Mbps per
active OBS stream (whatever your encoder is pushing).

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| App shows `ingress_disabled` | Already fixed — `app_settings.livekit_signaling_enabled.ingress = true`. If it returns, re-run the toggle migration. |
| OBS "Failed to connect to server" | Port 1935 not reachable. Check firewall + Cloudflare proxy is OFF. |
| OBS connects but no viewer sees video | `ws_url` in config.yaml wrong, or Redis not shared with SFU. |
| Stream key works once then fails | Each click of "Generate" creates a new ingress — old key dies. Click "Stop" first to release. |

That's it. Once the Docker container is up, the in-app UI works end-to-end.
