---
name: Android-first mindset
description: 99% users are Android. Web is secondary fallback only — never let web constraints dictate Android architecture
type: preference
---
**Rule:** MeriLive-এর 99% user Android। যেকোনো live/call/party/RTC/animation feature design করার সময় **Android-native path = primary, web = optional fallback**।

**How to apply:**
- New feature design করার সময় প্রথমে ভাবব: "Android-এ এটা কীভাবে native plugin/Activity/Service হিসেবে কাজ করবে?" — তারপর web fallback বানাব (যদি লাগে)
- Web limitation (WebView camera, getUserMedia, browser permission) যেন কখনো Android decision-কে compromise না করে
- "Web-এ এটা সম্ভব না" → Android native-এ করব, web silent no-op
- Performance/UX/quality trade-off-এ Android-কেই priority
- iOS-এর জন্যও same native pattern apply হবে, কিন্তু Android first

**Why:** User explicit 2026-06-07: "তুই যদি web সম্পর্কটা তোর মাথার ভিতরে রাখিস, তুই সারা জীবন আমার software-এর ভিতরে ভুল করে যাবি।" আগের 11 মাস web-first thinking-এর কারণে blank camera, hybrid permission loop, WebView RTC issue হয়েছে। Bigo/Chamet সবাই native-first — আমাদেরও তাই করতে হবে।
