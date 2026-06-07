## লক্ষ্য
১০০% Chamet-grade behavior — Live / Party / Private call এ camera কখনো blank হবে না, কোথাও camera icon placeholder দেখা যাবে না, কোনো room auto-close হবে না।

## A. Camera blanking (5-10s এ blank) — root-cause fix

`LiveKitVideoPlayer.tsx` এ দুটি সম্ভাব্য কারণ identify করেছি:

1. **Stale-track re-render**: parent (LiveStream/PartyRoom) re-render হলে অনেক সময় একই underlying track-এর জন্য নতুন wrapper reference pass হয় → main `useEffect` cleanup `videoTrack.detach(el)` চালায় → 80-200ms blank → কখনো recover হয় না কারণ next attach এ track ended।
2. **Visibility-pause race**: Android WebView `visibilitychange=hidden` এ surface freeze করে; আমাদের stall watchdog সেটা skip করে কিন্তু track-end event আসলে cleanup চালিয়ে দেয়।

**Fix**:
- main attach effect এর dependency `[videoTrack]` থেকে stable id দিয়ে gate করব: `[videoTrack?.sid ?? videoTrack?.mediaStreamTrack?.id]`। একই underlying track হলে detach/re-attach হবে না।
- cleanup এ `detach()` শুধু তখনই চালাব যখন underlying mediaStreamTrack id পরিবর্তন হয়েছে বা component unmount হচ্ছে।
- track `ended` event এ এখন শুধু `onVideoStalled` কল হয়; সাথে SDK-level resubscribe trigger যোগ করব (`videoTrack.publication?.setSubscribed?.(true)` যদি available)।
- visibility-restore এ explicit `play()` + readiness re-check।

## B. Camera icon placeholder — সব জায়গা থেকে সরানো

1. **PreJoinDevicesDialog** (Live/Party শুরুর আগে): default camera নিয়ে instant publish করব, dialog skip করব — শুধু "Settings" থেকে manually open হলে দেখা যাবে।
2. **Viewer side placeholder**: `LiveKitVideoPlayer` এর shimmer + host avatar overlay দেখাব (camera lucide icon না), যতক্ষণ পর্যন্ত first frame না আসে।
3. **ActiveCallScreen (private call)**: accept এর পরে camera ready হওয়ার আগে যে `Camera` lucide icon দেখায়, সেটা remove করে loader/avatar রাখব।
4. **Party seat (video off)**: seat tile এ `Camera`/`VideoOff` icon hide করে শুধু avatar + name দেখাব।

## C. Auto-close prevention

1. **LiveStream**: `useEffect` cleanup-এ যেসব auto-leave call হয় (visibility hidden, beforeunload, route change), সেগুলোকে grace-period (≥30s) এর পেছনে রাখব — শুধু explicit user close-এ leave হবে।
2. **PartyRoom**: একই pattern — page visibility hidden এ leave call cancel করব।
3. **Private call**: `endCall` শুধু explicit hangup / partner-end / timeout এ trigger হবে, page blur বা component unmount-এ না।
4. **Background reconnect**: foreground এ ফিরলে LiveKit room state check করে auto-reconnect (LiveKit SDK এর built-in resumeConnection use করে)।

## D. Verification
- TypeScript type check।
- Manual: live open → ৫ মিনিট wait → camera live থাকা confirm।
- Manual: party room → background → foreground → still in room।
- Manual: viewer side → host video না আসা পর্যন্ত কোনো camera icon দেখা যাবে না।

## ঝুঁকি
এটা broadcasting pipeline-এর core। ভুল করলে সব stream ভেঙে যাবে। তাই প্রতিটা edit minimal + behind existing guards রাখব, এবং type check পাশ না করলে commit করব না।

Approve করলে A → B → C → D order এ একসাথে apply করব।