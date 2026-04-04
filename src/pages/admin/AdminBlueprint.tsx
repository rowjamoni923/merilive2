import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Image, Loader2 } from "lucide-react";
import html2canvas from "html2canvas";

const BLUEPRINT_HTML = `<!-- Full Blueprint Content -->
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
@import url('https://fonts.googleapis.com/css2?family=Architects+Daughter&family=Patrick+Hand&display=swap');
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#faf8f5; font-family:'Patrick Hand',cursive; color:#2c2c2c; }
.sketch-bg { background-image:repeating-linear-gradient(0deg,transparent,transparent 28px,rgba(200,190,180,0.3) 28px,rgba(200,190,180,0.3) 29px),repeating-linear-gradient(90deg,transparent,transparent 28px,rgba(200,190,180,0.15) 28px,rgba(200,190,180,0.15) 29px); }
.hero { text-align:center; padding:40px 20px 30px; background:linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%); color:#fff; }
.hero h1 { font-family:'Architects Daughter',cursive; font-size:2.2em; margin-bottom:8px; }
.hero p { font-size:1.1em; opacity:0.8; }
.hero .badge { display:inline-block; background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.3); border-radius:20px; padding:4px 16px; margin-top:10px; font-size:0.9em; }
.stats-bar { display:flex; justify-content:center; gap:20px; padding:15px; background:#1a1a2e; flex-wrap:wrap; }
.stat-item { text-align:center; color:#fff; }
.stat-item .num { font-size:1.8em; font-weight:bold; color:#ff6b9d; }
.stat-item .label { font-size:0.8em; opacity:0.7; }
.section { padding:25px 15px; max-width:1200px; margin:0 auto; }
.section-title { font-family:'Architects Daughter',cursive; font-size:1.8em; text-align:center; margin-bottom:20px; position:relative; padding-bottom:10px; }
.section-title::after { content:''; position:absolute; bottom:0; left:50%; transform:translateX(-50%); width:80px; height:3px; background:linear-gradient(90deg,transparent,#e91e63,transparent); }
.screens-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:20px; }
.screen-card { background:#fff; border:2px solid #ddd; border-radius:16px; overflow:hidden; box-shadow:4px 4px 0 rgba(0,0,0,0.05); }
.card-header { background:linear-gradient(135deg,#1a1a2e,#16213e); color:#fff; padding:12px 16px; font-size:1em; display:flex; justify-content:space-between; align-items:center; }
.route { background:rgba(255,255,255,0.15); padding:2px 10px; border-radius:12px; font-size:0.75em; }
.card-body { padding:15px; }
.wireframe { background:#fefefe; border:2px dashed #ccc; border-radius:12px; padding:15px; position:relative; margin-bottom:10px; }
.w-header { display:flex; justify-content:space-between; padding:8px 12px; background:#e8e8e8; border-radius:8px; margin-bottom:8px; font-size:0.85em; }
.w-row { display:flex; gap:8px; flex-wrap:wrap; margin:6px 0; align-items:center; }
.w-pill { background:#f0f0f0; padding:3px 10px; border-radius:12px; font-size:0.8em; }
.w-pill.active { background:#1a1a2e; color:#fff; }
.w-pill.gold { background:#fff3e0; }
.w-card { background:#f5f5f5; border:1px solid #e0e0e0; border-radius:8px; padding:10px; margin:6px 0; font-size:0.85em; }
.w-card.gold { background:#fff8e1; border-color:#ffc107; }
.w-card.pink { background:#fce4ec; border-color:#e91e63; }
.w-card.purple { background:#f3e5f5; border-color:#9c27b0; }
.w-card.blue { background:#e3f2fd; border-color:#2196f3; }
.w-card.green { background:#e8f5e9; border-color:#4caf50; }
.w-btn { display:inline-block; background:#1a1a2e; color:#fff; padding:4px 12px; border-radius:15px; font-size:0.8em; cursor:pointer; }
.w-btn.purple { background:#9c27b0; }
.w-btn.blue { background:#2196f3; }
.w-btn.green { background:#4caf50; }
.w-btn.gold { background:#ff8f00; }
.w-label { font-weight:bold; font-size:0.85em; display:block; margin:6px 0 3px; }
.w-text { font-size:0.85em; color:#555; margin:4px 0; }
.w-divider { border-top:1px dashed #ccc; margin:8px 0; }
.w-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.w-grid-3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
.w-grid-4 { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
.w-seat { background:#e8e8e8; border:1px dashed #999; border-radius:8px; padding:15px; text-align:center; font-size:0.8em; }
.db-map { background:#e8f5e9; border:1px solid #a5d6a7; border-radius:8px; padding:10px; margin-top:8px; font-size:0.8em; }
.db-map code { background:#c8e6c9; padding:1px 4px; border-radius:3px; font-size:0.85em; }
.flow-desc { background:#e3f2fd; border:1px solid #90caf9; border-radius:8px; padding:10px; margin:8px 0; font-size:0.85em; }
.toc { background:#fff; border:2px solid #e91e63; border-radius:16px; padding:20px; }
.toc h3 { text-align:center; margin-bottom:12px; }
.toc-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(200px,1fr)); gap:6px; }
.toc-grid a { color:#1a1a2e; text-decoration:none; padding:6px 10px; border-radius:8px; background:#f5f5f5; font-size:0.85em; display:block; }
.separator { border-top:2px dashed #e91e63; margin:10px 0; }
@media print { body { background:#fff !important; } .section { break-inside:avoid; } .screen-card { break-inside:avoid; } .screens-grid { grid-template-columns:repeat(2,1fr) !important; } }
</style>
</head>
<body class="sketch-bg">
<div class="hero">
  <h1>📐 MeriLive Complete Blueprint</h1>
  <p>Complete A-Z Wireframe Map — Real Data + DB Mapping</p>
  <div class="badge">🗓 March 2026 • v9.0 • 70+ Screens • Supabase Backend</div>
</div>
<div class="stats-bar">
  <div class="stat-item"><div class="num">70+</div><div class="label">Total Screens</div></div>
  <div class="stat-item"><div class="num">10</div><div class="label">Feature Modules</div></div>
  <div class="stat-item"><div class="num">60+</div><div class="label">Admin Pages</div></div>
  <div class="stat-item"><div class="num">50+</div><div class="label">DB Tables</div></div>
  <div class="stat-item"><div class="num">5</div><div class="label">Bottom Nav Tabs</div></div>
</div>

<div class="section">
  <div class="toc">
    <h3>📋 Complete Feature Map (Table of Contents)</h3>
    <div class="toc-grid">
      <a>🏠 Home (Popular/Live/New/Follow)</a>
      <a>🔍 Search Users</a>
      <a>🏆 Leaderboard</a>
      <a>🎉 Party Rooms</a>
      <a>🎭 Party Room Inside</a>
      <a>➕ Create (Live/Party)</a>
      <a>📺 Go Live</a>
      <a>📡 Live Stream View</a>
      <a>🎬 Reels</a>
      <a>👤 Profile</a>
      <a>📋 Profile Menu</a>
      <a>✏️ Edit Profile</a>
      <a>📊 Level System</a>
      <a>👑 VIP Membership</a>
      <a>🛍️ Shop</a>
      <a>💬 Chat/Messages</a>
      <a>💰 Diamond & Beans</a>
      <a>🏢 Agency</a>
      <a>📊 Agency Dashboard</a>
      <a>📧 Invitation</a>
      <a>📝 Tasks</a>
      <a>⚙️ Settings</a>
      <a>🎮 Games</a>
      <a>🔐 Auth</a>
      <a>🔧 Admin Panel</a>
    </div>
  </div>
</div>

<!-- HOME -->
<div class="section">
  <div class="section-title"><span>🏠</span> Home Page</div>
  <div class="screens-grid">
    <div class="screen-card">
      <div class="card-header">📱 Home - Main Screen<span class="route">/</span></div>
      <div class="card-body">
        <div class="flow-desc"><strong>Navigation Flow:</strong><br>🔍 Search Icon → /search<br>🏆 Trophy Icon → /leaderboard<br>User Card → /live/:id (Live) or /profile/:id<br>📞 Call Icon → Call Confirm Modal<br>Bottom: Home | Party | Create | Reels | Profile</div>
        <div class="db-map"><strong>📦 DB Tables:</strong><br><code>profiles</code> → User cards (avatar, name, level, country)<br><code>live_streams</code> → Active streams (is_live=true)<br><code>banners</code> → Dynamic banner carousel<br><code>categories</code> → Country filter tabs</div>
      </div>
    </div>
    <div class="screen-card">
      <div class="card-header">📑 Home Tabs System<span class="route">/</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-header"><span>🔍</span><span>Popular · 🔴Live · New · Follow</span><span>🏆</span></div>
          <div class="w-row"><span class="w-pill active">🌍 All</span><span class="w-pill">🇧🇩 Bangladesh</span><span class="w-pill">🇮🇳 India</span><span class="w-pill">🇵🇰 Pakistan</span></div>
          <div class="w-divider"></div>
          <span class="w-label">📋 Tab Details:</span>
          <div class="w-card gold"><strong>Popular:</strong> Online hosts sorted by activity duration<br><strong>Live:</strong> Currently streaming hosts only<br><strong>New:</strong> Recently registered hosts<br><strong>Follow:</strong> Hosts you follow (requires auth)</div>
          <div class="w-card"><strong>Country Filter:</strong> Dynamic from profiles.country_code</div>
          <div class="w-card pink"><strong>Banner:</strong> "GO LIVE 5 HOURS - EARN $10"<br>Auto-carousel from <code>banners</code> table</div>
        </div>
      </div>
    </div>
    <div class="screen-card">
      <div class="card-header">👤 Host/User Card<span class="route">Component</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-text">● Online Badge: from <code>profiles.is_online</code><br>● Verified ✓: from <code>profiles.is_verified</code><br>● Level: from <code>profiles.user_level</code><br>● Flag: from <code>profiles.country_code</code><br>● Call: Opens CallConfirmModal → <code>private_calls</code></div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- SEARCH -->
<div class="section">
  <div class="section-title"><span>🔍</span> Search Users</div>
  <div class="screens-grid">
    <div class="screen-card">
      <div class="card-header">🔍 Search Page<span class="route">/search</span></div>
      <div class="card-body">
        <div class="flow-desc"><strong>Features:</strong><br>🔍 Search by App ID or Display Name<br>🆔 ID Toggle Button (orange) - search by numeric UID<br>🔽 Filter button - filter by tags, country, gender<br>← Back → Home</div>
        <div class="db-map"><code>profiles</code> → Search by display_name, app_uid<br><code>user_tags</code> → Filter by tags</div>
      </div>
    </div>
  </div>
</div>

<!-- LEADERBOARD -->
<div class="section">
  <div class="section-title"><span>🏆</span> Leaderboard</div>
  <div class="screens-grid">
    <div class="screen-card">
      <div class="card-header">🏆 Leaderboard<span class="route">/leaderboard</span></div>
      <div class="card-body">
        <div class="wireframe">
          <span class="w-label">Tabs:</span>
          <div class="w-row"><span class="w-pill gold">👑 Wealth</span><span class="w-pill active">🎮 Game</span><span class="w-pill gold">🎁 Charm</span><span class="w-pill gold">⚔️ PK</span></div>
          <div class="w-row"><span class="w-pill active">Day</span><span class="w-pill gold">Week</span><span class="w-pill gold">Month</span></div>
          <div class="w-card gold">Top 3: Gold/Silver/Bronze crown badges<br>Rankings: Avatar + Name + Level + Score</div>
        </div>
        <div class="db-map"><code>leaderboard_entries</code> → Rankings data<br><code>profiles</code> → User details<br><code>gift_transactions</code> → Wealth/Charm calculation</div>
      </div>
    </div>
  </div>
</div>

<!-- PARTY -->
<div class="section">
  <div class="section-title"><span>🎉</span> Party Rooms</div>
  <div class="screens-grid">
    <div class="screen-card">
      <div class="card-header">🎉 Party Rooms List<span class="route">/party-rooms</span></div>
      <div class="card-body">
        <div class="flow-desc"><strong>Features:</strong><br>🔍 Search rooms by name<br>📋 Tabs: All | 📹 Video | 🎙 Audio | 🎮 Game<br>🌍 Country: All | 🇧🇩 Bangladesh | 🇮🇳 India | 🇵🇰 Pakistan<br>✨ Active Rooms count + Room cards<br>🔄 Refresh button</div>
        <div class="db-map"><code>party_rooms</code> → Room list<br><code>party_room_participants</code> → Participant count<br><code>profiles</code> → Host info</div>
      </div>
    </div>
    <div class="screen-card">
      <div class="card-header">🎭 Party Room Inside (Video)<span class="route">/party/:roomId</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-header"><span>👤 Host Avatar + Frame</span><span>VIDEO PARTY</span><span>✕</span></div>
          <div class="w-grid-2"><div class="w-seat">Host Seat</div><div class="w-seat">🛋 Empty</div><div class="w-seat">🛋 Empty</div><div class="w-seat">🛋 Empty</div></div>
          <div class="w-divider"></div>
          <div class="w-row" style="justify-content:center;"><span>✨ Effects</span><span class="w-btn purple">((●)) Let's Party</span><span>😊 Emoji</span></div>
        </div>
        <div class="db-map"><code>party_rooms</code> → Room details<br><code>party_room_participants</code> → Seated users<br><code>party_room_seat_requests</code> → Seat queue<br>Realtime: Supabase Broadcast channels</div>
      </div>
    </div>
  </div>
</div>

<!-- CREATE -->
<div class="section">
  <div class="section-title"><span>➕</span> Create (Go Live / Party)</div>
  <div class="screens-grid">
    <div class="screen-card">
      <div class="card-header">➕ Create Options<span class="route">/create-party</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-card pink"><strong>((●)) Go Live</strong><br>Start Stream → /go-live</div>
          <div class="w-card purple"><strong>🎉 Create Party</strong><br>Room Type → /create-party</div>
        </div>
        <div class="flow-desc"><strong>Go Live:</strong> Camera preview + Beauty/Sticker + Settings → Start<br><strong>Create Party:</strong> Choose Video/Audio/Game type → Set room name → Create</div>
      </div>
    </div>
    <div class="screen-card">
      <div class="card-header">📺 Go Live Preview<span class="route">/go-live</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-card"><strong>Camera Preview (Full Screen)</strong><br>📷 Front camera with beauty filter</div>
          <div class="w-row" style="justify-content:center;"><span class="w-btn purple">✨ Beauty</span><span class="w-btn">😊 Sticker</span><span class="w-btn blue">⚙️ More</span></div>
          <div style="text-align:center;margin-top:10px;"><span class="w-btn" style="padding:12px 60px;">Go Live</span></div>
        </div>
        <div class="db-map"><code>live_streams</code> → Create stream record<br><code>beauty_filters</code> → Beauty filter options<br><code>ar_stickers</code> → AR sticker library</div>
      </div>
    </div>
  </div>
</div>

<!-- LIVE STREAM -->
<div class="section">
  <div class="section-title"><span>📡</span> Live Stream View</div>
  <div class="screens-grid">
    <div class="screen-card">
      <div class="card-header">📡 Live Stream Viewer<span class="route">/live/:id</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-header"><span>👤 Host Info</span><span>👥 Viewers: 42</span><span>✕</span></div>
          <div class="w-card" style="min-height:100px;text-align:center;padding-top:40px;">📹 Full Screen Video Stream<br><small>(Agora RTC)</small></div>
          <div class="w-card blue"><strong>💬 Chat Overlay</strong></div>
          <div class="w-row"><span class="w-btn">💬 Chat</span><span class="w-btn purple">🎁 Gift</span><span class="w-btn gold">⚔️ PK</span><span class="w-btn blue">👥 Viewers</span><span class="w-btn green">🎮 Game</span></div>
        </div>
        <div class="flow-desc"><strong>Actions:</strong><br>🎁 Gift Panel → Send gifts (coins deducted)<br>⚔️ PK Battle → Challenge another host<br>👥 Viewer List → See all viewers<br>🎮 Game → In-stream games<br>⬅️➡️ Swipe → Next/Previous stream</div>
        <div class="db-map"><code>live_streams</code> → Stream data<br><code>live_stream_viewers</code> → Viewer tracking<br><code>gift_transactions</code> → Gift sends<br><code>gifts</code> → Gift catalog<br><code>pk_battles</code> → PK system</div>
      </div>
    </div>
    <div class="screen-card">
      <div class="card-header">🎁 Gift Panel<span class="route">Component</span></div>
      <div class="card-body">
        <div class="wireframe">
          <span class="w-label">Gift Categories:</span>
          <div class="w-row"><span class="w-pill active">Popular</span><span class="w-pill">Classic</span><span class="w-pill">Premium</span><span class="w-pill">Luxury</span></div>
          <div class="w-grid-4">
            <div class="w-card" style="text-align:center;padding:6px;">🌹<br><small>Rose</small><br><small>💎1</small></div>
            <div class="w-card" style="text-align:center;padding:6px;">❤️<br><small>Heart</small><br><small>💎5</small></div>
            <div class="w-card" style="text-align:center;padding:6px;">💍<br><small>Ring</small><br><small>💎100</small></div>
            <div class="w-card" style="text-align:center;padding:6px;">🏎️<br><small>Car</small><br><small>💎5000</small></div>
          </div>
        </div>
        <div class="db-map"><code>gifts</code> → Gift catalog<br><code>gift_transactions</code> → Send records<br><code>profiles.coins</code> → Sender balance<br><code>profiles.beans</code> → Receiver beans</div>
      </div>
    </div>
    <div class="screen-card">
      <div class="card-header">⚔️ PK Battle<span class="route">Component</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-card pink">
            <div class="w-grid-2">
              <div style="text-align:center;"><strong>Host A</strong><br>Score: 1,250</div>
              <div style="text-align:center;"><strong>Host B</strong><br>Score: 980</div>
            </div>
            <div style="text-align:center;margin-top:8px;">⏱ Time: 04:30 remaining</div>
          </div>
        </div>
        <div class="db-map"><code>pk_battles</code> → Battle records<br><code>pk_battle_scores</code> → Real-time scores</div>
      </div>
    </div>
  </div>
</div>

<!-- REELS -->
<div class="section">
  <div class="section-title"><span>🎬</span> Reels</div>
  <div class="screens-grid">
    <div class="screen-card">
      <div class="card-header">🎬 Reels Feed<span class="route">/reels</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-card"><strong>Full Screen Video (Vertical Swipe)</strong></div>
          <div class="w-text"><strong>@Leon Navarro</strong> ✓ <span class="w-pill gold">Lv1</span></div>
        </div>
        <div class="flow-desc"><strong>+ Upload:</strong> Record/Upload video → Add sound → Add caption → Post<br><strong>Actions:</strong> Like, Comment, Share, Gift, Follow</div>
        <div class="db-map"><code>reels</code> → Video data<br><code>reel_likes</code> → Like records<br><code>reel_comments</code> → Comments<br><code>profiles</code> → Creator info</div>
      </div>
    </div>
  </div>
</div>

<!-- PROFILE -->
<div class="section">
  <div class="section-title"><span>👤</span> Profile</div>
  <div class="screens-grid">
    <div class="screen-card">
      <div class="card-header">👤 My Profile<span class="route">/profile</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-card purple" style="text-align:center;"><strong>official admin</strong><br><span class="w-pill" style="background:#e91e63;color:#fff;">ID 97220825</span></div>
          <div class="w-grid-3" style="text-align:center;"><div><strong>1</strong><br><small>Friends</small></div><div><strong>4</strong><br><small>Following</small></div><div><strong>12</strong><br><small>Followers</small></div></div>
          <div class="w-grid-2"><div class="w-card purple">My Diamonds<br><strong>36,474,709</strong> 💎</div><div class="w-card gold">My Beans<br><strong>12</strong> 🫘</div></div>
          <div class="w-card pink">Trader Wallet<br><strong>8,139,276</strong> 💠</div>
        </div>
        <div class="db-map"><code>profiles</code> → All profile data<br><code>profiles.coins</code> → Diamond balance<br><code>profiles.beans</code> → Beans balance<br><code>follows</code> → Friends/Following/Followers<br><code>agencies</code> → Trader wallet</div>
      </div>
    </div>
    <div class="screen-card">
      <div class="card-header">📋 Profile Menu<span class="route">/profile (scroll)</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-card">💬 Messages → /chat</div>
          <div class="w-card gold">👑 My Level → /level</div>
          <div class="w-card purple">💎 VIP Membership → /vip</div>
          <div class="w-card pink">🛍️ Shop → /shop</div>
          <div class="w-card">🏢 Agency Dashboard → /agency-dashboard</div>
          <div class="w-card">📧 My Invitation → /invitation</div>
          <div class="w-card">📝 My Tasks → /tasks</div>
          <div class="w-card">👤 My Profile → /edit-profile</div>
          <div class="w-card">⚙️ Settings → /settings</div>
        </div>
      </div>
    </div>
    <div class="screen-card">
      <div class="card-header">✏️ Edit Profile<span class="route">/edit-profile</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-header"><span>←</span><span>Edit Profile</span><span>Save</span></div>
          <div class="w-card"><span class="w-label">Display Name</span></div>
          <div class="w-card"><span class="w-label">Bio</span></div>
          <div class="w-card"><span class="w-label">Gender</span><div class="w-row"><span class="w-pill active">Male</span><span class="w-pill">Female</span></div></div>
          <div class="w-card"><span class="w-label">Birthday</span></div>
          <div class="w-card"><span class="w-label">Tags</span></div>
        </div>
        <div class="db-map"><code>profiles</code> → Update display_name, bio, gender, birthday, avatar_url<br><code>user_tags</code> → Tag associations<br>Storage: <code>avatars</code> bucket</div>
      </div>
    </div>
  </div>
</div>

<!-- LEVEL / VIP / SHOP -->
<div class="section">
  <div class="section-title"><span>📊</span> Level / VIP / Shop</div>
  <div class="screens-grid">
    <div class="screen-card">
      <div class="card-header">📊 Level System<span class="route">/level</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-card gold" style="text-align:center;"><strong>Level 20</strong><br><small>75% to Level 21</small></div>
          <span class="w-label">Level Privileges:</span>
          <div class="w-grid-3">
            <div class="w-card" style="text-align:center;font-size:0.8em;">🖼️ Avatar Frame<br><small>Lv5+</small></div>
            <div class="w-card" style="text-align:center;font-size:0.8em;">💬 Chat Bubble<br><small>Lv10+</small></div>
            <div class="w-card" style="text-align:center;font-size:0.8em;">🚗 Vehicle Entry<br><small>Lv15+</small></div>
          </div>
        </div>
        <div class="db-map"><code>profiles.user_level</code>, <code>profiles.user_exp</code><br><code>level_tiers</code> → Level thresholds<br><code>level_privileges</code> → Unlockable items</div>
      </div>
    </div>
    <div class="screen-card">
      <div class="card-header">👑 VIP Membership<span class="route">/vip</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-grid-2">
            <div class="w-card gold" style="text-align:center;">VIP 1<br><small>💎 500/mo</small></div>
            <div class="w-card gold" style="text-align:center;">VIP 2<br><small>💎 1500/mo</small></div>
            <div class="w-card gold" style="text-align:center;">VIP 3<br><small>💎 5000/mo</small></div>
            <div class="w-card gold" style="text-align:center;">VIP 4<br><small>💎 15000/mo</small></div>
          </div>
        </div>
        <div class="db-map"><code>vip_subscriptions</code> → Active VIP status<br><code>vip_privileges</code> → VIP tier benefits</div>
      </div>
    </div>
    <div class="screen-card">
      <div class="card-header">🛍️ Shop<span class="route">/shop</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-row"><span class="w-pill active">Frames</span><span class="w-pill">Chat Bubbles</span><span class="w-pill">Entry Effects</span><span class="w-pill">Name Bars</span></div>
          <div class="w-grid-3">
            <div class="w-card purple" style="text-align:center;font-size:0.8em;">🖼️ Gold Frame<br><small>💎 200</small></div>
            <div class="w-card purple" style="text-align:center;font-size:0.8em;">🖼️ Diamond Frame<br><small>💎 500</small></div>
            <div class="w-card purple" style="text-align:center;font-size:0.8em;">🖼️ Royal Frame<br><small>💎 1000</small></div>
          </div>
        </div>
        <div class="db-map"><code>avatar_frames</code> → Frame catalog<br><code>shop_items</code> → All shop items<br><code>user_purchased_items</code> → Purchase records</div>
      </div>
    </div>
  </div>
</div>

<!-- CHAT -->
<div class="section">
  <div class="section-title"><span>💬</span> Chat / Messages</div>
  <div class="screens-grid">
    <div class="screen-card">
      <div class="card-header">💬 Chat List<span class="route">/chat</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-card">🔍 Search conversations...</div>
          <div class="w-card"><strong>Rose</strong> <span class="w-pill gold">Lv5</span><br><small>Hello! How are you? · 2m ago</small></div>
          <div class="w-card"><strong>Admin Bot</strong><br><small>Welcome to MeriLive! · 1d ago</small></div>
        </div>
        <div class="db-map"><code>conversations</code> → Chat threads<br><code>messages</code> → Message content</div>
      </div>
    </div>
    <div class="screen-card">
      <div class="card-header">💬 Chat Detail<span class="route">/chat/:id</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-header"><span>← Rose</span><span>📞 📹</span></div>
          <div class="w-card blue" style="margin-left:20%;text-align:right;">Hi! How are you? 😊</div>
          <div class="w-card pink" style="margin-right:20%;">I'm good, thanks! 🎉</div>
          <div class="w-card gold" style="text-align:center;">🎁 You sent Rose × 5 (💎 5)</div>
          <div class="w-row"><span>😊 Emoji</span><span>🎁 Gift</span><span>📷 Photo</span><span class="w-btn">Send</span></div>
        </div>
        <div class="db-map"><code>messages</code> → text, image_url, gift_data<br><code>gift_transactions</code> → In-chat gifts<br>Realtime: Supabase Realtime subscriptions</div>
      </div>
    </div>
  </div>
</div>

<!-- WALLET -->
<div class="section">
  <div class="section-title"><span>💰</span> Wallet / Recharge / Withdrawal</div>
  <div class="screens-grid">
    <div class="screen-card">
      <div class="card-header">💎 Recharge (Top Up)<span class="route">/recharge</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-card purple" style="text-align:center;">Current Balance: <strong>36,474,709 💎</strong></div>
          <span class="w-label">Select Package:</span>
          <div class="w-grid-3">
            <div class="w-card" style="text-align:center;">💎 60<br><small>$0.99</small></div>
            <div class="w-card" style="text-align:center;">💎 300<br><small>$4.99</small></div>
            <div class="w-card purple" style="text-align:center;">💎 600<br><small>$9.99</small></div>
            <div class="w-card" style="text-align:center;">💎 1200<br><small>$19.99</small></div>
            <div class="w-card" style="text-align:center;">💎 3000<br><small>$49.99</small></div>
            <div class="w-card gold" style="text-align:center;">💎 6000<br><small>$99.99</small></div>
          </div>
          <span class="w-label">Payment Methods:</span>
          <div class="w-row"><span class="w-pill">bKash</span><span class="w-pill">Nagad</span><span class="w-pill">Card</span><span class="w-pill">Trader</span></div>
        </div>
        <div class="db-map"><code>recharge_packages</code> → Package options<br><code>recharge_orders</code> → Order records<br><code>profiles.coins</code> → Add diamonds after payment</div>
      </div>
    </div>
    <div class="screen-card">
      <div class="card-header">💸 Withdrawal<span class="route">/withdrawal</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-card gold">Available Beans: <strong>12 🫘</strong><br><small>Conversion: 10 Beans = $1</small></div>
          <div class="w-card"><span class="w-label">Payment Method</span><div class="w-row"><span class="w-pill active">bKash</span><span class="w-pill">Nagad</span></div></div>
        </div>
        <div class="db-map"><code>agency_withdrawals</code> → Withdrawal requests<br><code>profiles.beans</code> → Deduct beans</div>
      </div>
    </div>
  </div>
</div>

<!-- AGENCY -->
<div class="section">
  <div class="section-title"><span>🏢</span> Agency System</div>
  <div class="screens-grid">
    <div class="screen-card">
      <div class="card-header">🏢 Agency Home<span class="route">/agency</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-card pink" style="text-align:center;"><strong>Join or Create Agency</strong></div>
          <div class="w-card">📊 Agency Dashboard → /agency-dashboard</div>
          <div class="w-card">👥 Host Management → /agency-host-management</div>
          <div class="w-card">💰 Coin Exchange → /agency-coin-exchange</div>
          <div class="w-card">💸 Withdrawal → /agency-withdrawal</div>
          <div class="w-card">📈 Commission History → /agency-commission-history</div>
        </div>
        <div class="db-map"><code>agencies</code> → Agency details<br><code>agency_hosts</code> → Host-agency mapping<br><code>agency_level_tiers</code> → Commission rates</div>
      </div>
    </div>
    <div class="screen-card">
      <div class="card-header">📊 Agency Dashboard<span class="route">/agency-dashboard</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-card gold">
            <div class="w-grid-2"><div style="text-align:center;"><strong>Total Hosts</strong><br>24</div><div style="text-align:center;"><strong>Weekly Income</strong><br>$1,250</div></div>
          </div>
          <div class="w-card"><strong>Agency Level:</strong> Gold<br><strong>Commission Rate:</strong> 15%<br><strong>Diamond Balance:</strong> 8,139,276 💠</div>
        </div>
        <div class="db-map"><code>agencies</code> → diamond_balance, commission_rate<br><code>agency_performance</code> → total_income<br><code>agency_hosts</code> → Host list</div>
      </div>
    </div>
  </div>
</div>

<!-- INVITATION & TASKS -->
<div class="section">
  <div class="section-title"><span>📧</span> Invitation & Tasks</div>
  <div class="screens-grid">
    <div class="screen-card">
      <div class="card-header">📧 Invitation<span class="route">/invitation</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-card gold" style="text-align:center;"><strong>Your Invite Code</strong><br><span style="font-size:1.5em;letter-spacing:4px;">MRL97220</span></div>
          <div class="w-card"><strong>Rewards:</strong><br>🎁 Each invite → 50 💎<br>🎁 Invite hosts → 200 💎 extra</div>
        </div>
        <div class="db-map"><code>invitation_codes</code> → User invite codes<br><code>invitation_rewards</code> → Reward records</div>
      </div>
    </div>
    <div class="screen-card">
      <div class="card-header">📝 Daily Tasks<span class="route">/tasks</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-card green">✅ Daily Login → 10 💎 <span class="w-btn green">Claimed</span></div>
          <div class="w-card">⬜ Send 5 gifts → 20 💎 <span class="w-btn">2/5</span></div>
          <div class="w-card">⬜ Watch 3 streams → 15 💎 <span class="w-btn">1/3</span></div>
          <div class="w-card">⬜ Go Live 30 min → 50 💎 <span class="w-btn">0/30m</span></div>
        </div>
        <div class="db-map"><code>daily_tasks</code> → Task definitions<br><code>user_task_progress</code> → Completion tracking</div>
      </div>
    </div>
  </div>
</div>

<!-- SETTINGS -->
<div class="section">
  <div class="section-title"><span>⚙️</span> Settings</div>
  <div class="screens-grid">
    <div class="screen-card">
      <div class="card-header">⚙️ Settings<span class="route">/settings</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div class="w-card">🔔 Notifications</div>
          <div class="w-card">🌐 Language → English/Hindi</div>
          <div class="w-card">🚫 Blacklist</div>
          <div class="w-card">🔒 Privacy Policy</div>
          <div class="w-card">📜 User Agreement</div>
          <div class="w-card">ℹ️ About Us</div>
          <div class="w-card">💬 Customer Service</div>
          <div class="w-card">🗑️ Delete Account</div>
        </div>
        <div class="db-map"><code>app_settings</code> → App configuration<br><code>app_content</code> → Legal pages<br><code>blocked_users</code> → Blacklist</div>
      </div>
    </div>
  </div>
</div>

<!-- GAMES -->
<div class="section">
  <div class="section-title"><span>🎮</span> Games</div>
  <div class="screens-grid">
    <div class="screen-card">
      <div class="card-header">🎰 Roulette<span class="route">/games/roulette</span></div>
      <div class="card-body"><div class="wireframe"><div class="w-card gold" style="text-align:center;">🎡 Lucky Roulette<br>Spin to win diamonds!<br><span class="w-btn gold">Spin (💎 10)</span></div></div></div>
    </div>
    <div class="screen-card">
      <div class="card-header">🎡 Ferris Wheel<span class="route">/games/ferris-wheel</span></div>
      <div class="card-body"><div class="wireframe"><div class="w-card purple" style="text-align:center;">🎡 Ferris Wheel<br>Prize multipliers!</div></div></div>
    </div>
    <div class="screen-card">
      <div class="card-header">🃏 Teen Patti<span class="route">/games/teen-patti</span></div>
      <div class="card-body"><div class="wireframe"><div class="w-card pink" style="text-align:center;">🃏 Teen Patti<br>Card game battles!</div></div></div>
    </div>
  </div>
</div>

<!-- AUTH -->
<div class="section">
  <div class="section-title"><span>🔐</span> Authentication</div>
  <div class="screens-grid">
    <div class="screen-card">
      <div class="card-header">🔐 Login / Signup<span class="route">/auth</span></div>
      <div class="card-body">
        <div class="wireframe">
          <div style="text-align:center;padding:20px 0;"><strong style="font-size:1.5em;">MeriLive</strong><br><small>Connect, Stream, Earn</small></div>
          <div style="text-align:center;">
            <div class="w-btn" style="display:block;margin:8px auto;max-width:250px;">👤 Continue as Guest</div>
            <div class="w-btn purple" style="display:block;margin:8px auto;max-width:250px;">📱 Login with WhatsApp</div>
            <div class="w-btn blue" style="display:block;margin:8px auto;max-width:250px;">📧 Login with Gmail</div>
          </div>
          <div class="w-card"><strong>Auth Methods:</strong><br>1. Guest → Hardware UUID based<br>2. WhatsApp OTP → Edge Function<br>3. Gmail → Supabase Email/Password</div>
        </div>
        <div class="db-map"><code>auth.users</code> → Supabase Auth<br><code>profiles</code> → Auto-created on signup<br>Edge Function: <code>send-whatsapp-otp</code></div>
      </div>
    </div>
  </div>
</div>

<!-- ADMIN PANEL -->
<div class="section">
  <div class="section-title"><span>🔧</span> Admin Panel (60+ Pages)</div>
  <div class="wireframe" style="max-width:1200px;margin:0 auto 20px;">
    <span class="w-label">🔧 Admin Panel Structure — /admin/*</span>
    <div class="w-text">Protected by AdminAccessGuard + AdminRouteGuard + Sub-Admin permissions</div>
    <div class="separator"></div>
    <div class="w-grid-3">
      <div class="w-card blue"><strong>👥 User Hub</strong><br>• User Management<br>• Online Users<br>• Blocked Users<br>• User Reports<br>• Face Verification<br>• Host Applications<br>• Host Search<br>• Hosts List</div>
      <div class="w-card purple"><strong>🏢 Agency Hub</strong><br>• Agencies List<br>• Agency Policy<br>• Commission Calculator<br>• Withdrawals<br>• Transfer History<br>• Transfer Scheduler</div>
      <div class="w-card gold"><strong>💰 Finance Hub</strong><br>• Manual Top-up<br>• Top-up System<br>• Payment Methods<br>• Diamonds Management<br>• Payment Gateways<br>• Balance Deduction<br>• Recharge History</div>
      <div class="w-card green"><strong>📝 Content Hub</strong><br>• Banners<br>• Popup Banners<br>• Party Banners<br>• Content Pages<br>• Landing Page<br>• Branding<br>• Room Welcome Messages</div>
      <div class="w-card pink"><strong>🎨 Visual Assets</strong><br>• Gifts<br>• Animation Store<br>• Avatar Frames<br>• Role Frames<br>• Chat Bubbles<br>• VIP Medals<br>• Noble Cards<br>• Vehicle Entrances<br>• Entry Effects</div>
      <div class="w-card"><strong>⚙️ App Settings</strong><br>• General Settings<br>• Call Settings<br>• Game Settings<br>• Device Management<br>• Level Tiers<br>• VIP Privileges<br>• App Version<br>• Theme Manager<br>• Agora Settings</div>
      <div class="w-card" style="border-color:#ff5722;background:#fff3e0;"><strong>📺 Live & Party</strong><br>• Active Streams<br>• Recordings<br>• Party Rooms<br>• Party Backgrounds<br>• Live Bans<br>• Moderation</div>
      <div class="w-card" style="border-color:#00bcd4;background:#e0f7fa;"><strong>💱 Coin Trader Hub</strong><br>• Coin Traders<br>• Trader Orders<br>• Trader Transactions</div>
      <div class="w-card" style="border-color:#607d8b;background:#eceff1;"><strong>📋 Other Admin</strong><br>• Dashboard<br>• Sub-Admins<br>• Admin Logs<br>• Error Logs<br>• Reports<br>• Reels Management<br>• Notifications<br>• Support Tickets<br>• Chat Inspector</div>
    </div>
  </div>
</div>

<!-- BOTTOM NAV -->
<div class="section">
  <div class="section-title"><span>📱</span> Bottom Navigation Bar</div>
  <div style="max-width:500px;margin:0 auto;">
    <div class="wireframe">
      <div style="display:flex;justify-content:space-around;text-align:center;padding:10px 0;">
        <div>🏠<br><strong>Home</strong><br><small>/</small></div>
        <div>👥<br><strong>Party</strong><br><small>/party-rooms</small></div>
        <div style="font-size:1.5em;">+<br><strong style="font-size:0.6em;">Create</strong></div>
        <div>▶️<br><strong>Reels</strong><br><small>/reels</small></div>
        <div>👤<br><strong>Profile</strong><br><small>/profile</small></div>
      </div>
    </div>
  </div>
</div>

<!-- ROUTE MAP -->
<div class="section">
  <div class="section-title"><span>🗺️</span> Complete Route Map</div>
  <div class="wireframe" style="max-width:1000px;margin:0 auto;">
    <span class="w-label">📋 All 70+ App Routes:</span>
    <div class="w-grid-2" style="font-size:0.85em;">
      <div>
        <strong>🔓 Public:</strong><br>/auth — Login/Signup<br>/auth/callback — OAuth callback<br>/about — About page<br>/agency-policy — Policy page<br>/landing — Landing page<br><br>
        <strong>🏠 Main:</strong><br>/ — Home<br>/discover — Discover<br>/live/:id — Stream view<br>/chat — Messages<br>/profile — My profile<br>/reels — Reels feed<br>/party-rooms — Party list<br>/party/:roomId — Party room<br><br>
        <strong>➕ Create:</strong><br>/go-live — Go live<br>/create-party — Create party<br><br>
        <strong>👤 Profile:</strong><br>/edit-profile — Edit profile<br>/profile/:userId — User profile<br>/level — Level system<br>/vip — VIP membership<br>/shop — Shop<br>/search — Search users
      </div>
      <div>
        <strong>💰 Finance:</strong><br>/recharge — Top up<br>/recharge-history — History<br>/withdrawal — Withdraw<br>/transfer-history — Transfers<br>/call-history — Call history<br><br>
        <strong>🏢 Agency:</strong><br>/agency — Agency home<br>/agency-dashboard — Dashboard<br>/agency-host-management — Hosts<br>/agency-coin-exchange — Exchange<br>/agency-withdrawal — Withdraw<br>/agency-transfer-history — Transfers<br>/agency-commission-history — Commission<br>/create-agency — Create<br>/join-agency — Join<br><br>
        <strong>📋 Other:</strong><br>/invitation — Invite system<br>/tasks — Daily tasks<br>/rewards — Rewards<br>/leaderboard — Rankings<br>/settings — Settings<br><br>
        <strong>🎮 Games:</strong><br>/games/roulette<br>/games/ferris-wheel<br>/games/teen-patti
      </div>
    </div>
  </div>
</div>

<div style="text-align:center;padding:30px;background:#1a1a2e;color:#fff;">
  <h2 style="font-family:'Architects Daughter',cursive;">MeriLive Blueprint v9.0</h2>
  <p>📐 Complete App Architecture • 70+ Screens • Real DB Mapping</p>
  <p style="opacity:0.5;font-size:0.85em;">Generated March 2026 • Supabase Project: pppcwawjjpwwrmvezcdy</p>
</div>
</body>
</html>`;

export default function AdminBlueprint() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleDownloadPDF = () => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      iframe.contentWindow.print();
    }
  };

  const handleDownloadHTML = () => {
    const blob = new Blob([BLUEPRINT_HTML], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "MeriLive_Blueprint_v9.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadPNG = async () => {
    const iframe = iframeRef.current;
    if (!iframe?.contentDocument?.body) return;
    
    setIsCapturing(true);
    try {
      const canvas = await html2canvas(iframe.contentDocument.body, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#faf8f5',
        width: iframe.contentDocument.body.scrollWidth,
        height: iframe.contentDocument.body.scrollHeight,
        windowWidth: iframe.contentDocument.body.scrollWidth,
        windowHeight: iframe.contentDocument.body.scrollHeight,
      });
      
      const link = document.createElement("a");
      link.download = "MeriLive_Blueprint_v9.png";
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch (err) {
      console.error("PNG capture failed:", err);
    } finally {
      setIsCapturing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">App Blueprint</h1>
          <p className="text-sm text-muted-foreground">Complete A-Z wireframe map with DB mapping — Admin only</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={handleDownloadPNG} variant="default" className="gap-2" disabled={isCapturing}>
            {isCapturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
            {isCapturing ? "Capturing..." : "Download PNG"}
          </Button>
          <Button onClick={handleDownloadPDF} variant="secondary" className="gap-2">
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
          <Button onClick={handleDownloadHTML} variant="outline" className="gap-2">
            <FileText className="h-4 w-4" />
            Download HTML
          </Button>
        </div>
      </div>
      <div className="border rounded-lg overflow-hidden bg-background" style={{ height: "calc(100vh - 160px)" }}>
        <iframe
          ref={iframeRef}
          srcDoc={BLUEPRINT_HTML}
          className="w-full h-full border-0"
          title="MeriLive Blueprint"
        />
      </div>
    </div>
  );
}
