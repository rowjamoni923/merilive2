# Modal Light-Premium Audit

_Generated 2026-05-14 23:55 UTC_

- **Files with findings:** 36
- **Total findings:** 340

## Rules

| Rule | Description | Count |
|------|-------------|------:|
| **M1** | Pure dark surface in modal | 23 |
| **M2** | Glass white/5-10 with light text | 13 |
| **M3** | Faint body text (slate-400/gray-400/zinc-400/muted/50) | 44 |
| **M4** | Mixed light→dark→light gradient | 0 |
| **M5** | Pale 300/400 accent icon | 234 |
| **M6** | Glass border on dialog | 26 |

## Top files

| File | Findings | Breakdown |
|------|---------:|-----------|
| `src/pages/Level5HelperDashboard.tsx` | 55 | M5:55 |
| `src/components/games/CompactGameFooter.tsx` | 30 | M5:22 M1:3 M3:1 M6:2 M2:2 |
| `src/pages/EditProfile.tsx` | 28 | M5:28 |
| `src/pages/Auth.tsx` | 27 | M5:14 M3:13 |
| `src/components/games/GameFooterNew.tsx` | 26 | M5:21 M1:2 M6:1 M2:2 |
| `src/pages/AgentRank.tsx` | 22 | M5:20 M3:1 M6:1 |
| `src/pages/LiveStream.tsx` | 19 | M5:8 M1:2 M6:7 M2:2 |
| `src/pages/HelperDashboard.tsx` | 16 | M3:1 M5:15 |
| `src/pages/Chat.tsx` | 15 | M5:10 M3:5 |
| `src/components/party/PartyGiftPanel.tsx` | 12 | M6:4 M5:5 M2:2 M3:1 |
| `src/components/rewards/DailyLoginPopup.tsx` | 11 | M5:8 M3:3 |
| `src/pages/Reels.tsx` | 9 | M1:2 M2:2 M5:3 M6:2 |
| `src/components/party/ProfessionalBottomBar.tsx` | 7 | M1:1 M5:3 M2:1 M6:2 |
| `src/pages/Tasks.tsx` | 6 | M5:4 M6:2 |
| `src/components/report/ReportUserDialog.tsx` | 6 | M5:5 M3:1 |
| `src/components/games/LiveGameSelector.tsx` | 5 | M1:1 M5:2 M2:1 M6:1 |
| `src/pages/Leaderboard.tsx` | 4 | M3:4 |
| `src/components/auth/PhoneSignInButton.tsx` | 4 | M3:4 |
| `src/components/profile/ProfileReelsSection.tsx` | 4 | M1:4 |
| `src/components/profile/ProfileReelsTab.tsx` | 4 | M1:4 |
| `src/components/rewards/RatingRewardPopup.tsx` | 4 | M5:4 |
| `src/pages/GoogleLibraryOrderRules.tsx` | 3 | M3:3 |
| `src/pages/Settings.tsx` | 3 | M5:3 |
| `src/pages/AgencyHostManagement.tsx` | 2 | M3:2 |
| `src/pages/AgencyWithdrawal.tsx` | 2 | M6:2 |
| `src/pages/Profile.tsx` | 2 | M3:2 |
| `src/pages/SearchUsers.tsx` | 2 | M3:2 |
| `src/components/auth/BanPopupDialog.tsx` | 2 | M5:2 |
| `src/components/games/GlobalGameOverlay.tsx` | 2 | M1:1 M6:1 |
| `src/components/party/AdvancedPartyBottomBar.tsx` | 2 | M1:1 M5:1 |

## Findings by file

### `src/pages/Level5HelperDashboard.tsx` — 55

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 1412 | M5 | Pale 300/400 accent icon | `<Building2 className="w-4 h-4 text-orange-400" />` |
| 1422 | M5 | Pale 300/400 accent icon | `<p className="text-cyan-400 text-xs text-center">` |
| 1463 | M5 | Pale 300/400 accent icon | `<Building2 className="w-5 h-5 text-orange-400" />` |
| 1554 | M5 | Pale 300/400 accent icon | `<Loader2 className="w-4 h-4 animate-spin text-orange-400" />` |
| 1556 | M5 | Pale 300/400 accent icon | `<p className="text-orange-400 text-xs font-medium">` |
| 1559 | M5 | Pale 300/400 accent icon | `<p className="text-orange-300 text-sm font-bold">` |
| 1570 | M5 | Pale 300/400 accent icon | `<p className="text-blue-400 text-xs flex items-center justify-center gap-1">` |
| 1587 | M5 | Pale 300/400 accent icon | `<Package className="w-4 h-4 text-blue-400" />` |
| 1590 | M5 | Pale 300/400 accent icon | `<Badge className="bg-blue-500/20 text-blue-400 text-xs">` |
| 1620 | M5 | Pale 300/400 accent icon | `<AvatarFallback className="bg-blue-500/20 text-blue-400">` |
| 1662 | M5 | Pale 300/400 accent icon | `<span className="text-yellow-400 font-mono text-sm font-bold">` |
| 1669 | M5 | Pale 300/400 accent icon | `<span className="inline-block px-2 py-0.5 rounded bg-amber-100 border border-amber-500/40 text-amber-300 text-[10px] font-bold">` |
| 1696 | M5 | Pale 300/400 accent icon | `className="w-full text-xs text-blue-400 border-blue-500/50"` |
| 1786 | M5 | Pale 300/400 accent icon | `className="flex-1 text-red-400 border-red-500/50 hover:bg-red-500/20 text-xs"` |
| 1888 | M5 | Pale 300/400 accent icon | `<Badge className="bg-amber-100 text-amber-300 text-[10px] px-1.5 py-0">⚡ Merchant</Badge>` |
| 1900 | M5 | Pale 300/400 accent icon | `className="text-red-400 hover:bg-red-500/20"` |
| 1968 | M5 | Pale 300/400 accent icon | `<Gem className="w-4 h-4 text-cyan-400" />` |
| 1969 | M5 | Pale 300/400 accent icon | `<span className="text-xs text-cyan-400">+{request.diamond_reward.toLocaleString()} diamonds reward</span>` |
| 2015 | M5 | Pale 300/400 accent icon | `<Badge className="bg-blue-500/20 text-blue-400 text-[10px]">{method.country_code}</Badge>` |
| 2053 | M5 | Pale 300/400 accent icon | `className="text-red-400 hover:text-red-300 hover:bg-red-500/20 flex-shrink-0"` |
| 2070 | M5 | Pale 300/400 accent icon | `<Clock className="w-4 h-4 text-cyan-400" />` |
| 2073 | M5 | Pale 300/400 accent icon | `<Badge className="bg-cyan-500/20 text-cyan-400 text-xs">` |
| 2093 | M5 | Pale 300/400 accent icon | `<p className="text-xs text-orange-400 font-medium">💰 Agency Withdrawal History</p>` |
| 2113 | M5 | Pale 300/400 accent icon | `amount: 'text-blue-400',` |
| 2119 | M5 | Pale 300/400 accent icon | `amount: 'text-red-400',` |
| 2131 | M5 | Pale 300/400 accent icon | `<AvatarFallback className="bg-slate-200 text-orange-400">` |
| 2145 | M5 | Pale 300/400 accent icon | `<span className="text-yellow-400 text-[10px] font-mono truncate max-w-[130px]">` |
| 2155 | M5 | Pale 300/400 accent icon | `<p className="text-cyan-400 text-[10px]">Net diamonds after admin fee</p>` |
| 2171 | M5 | Pale 300/400 accent icon | `<p className="text-xs text-blue-400 font-medium mt-4">📦 Payroll Orders</p>` |
| 2178 | M5 | Pale 300/400 accent icon | `<AvatarFallback className="bg-blue-500/20 text-blue-400">` |
| 2364 | M5 | Pale 300/400 accent icon | `<User className="w-3 h-3 text-cyan-400" />` |
| 2370 | M5 | Pale 300/400 accent icon | `reply.sender_type === 'helper' ? "text-cyan-400" : "text-purple-700"` |
| 2571 | M5 | Pale 300/400 accent icon | `<Label htmlFor="is-merchant-legacy" className="text-amber-300 font-medium text-sm cursor-pointer">` |
| 2629 | M5 | Pale 300/400 accent icon | `<Gem className="w-5 h-5 text-cyan-400" />` |
| 2630 | M5 | Pale 300/400 accent icon | `<span className="text-cyan-400 font-semibold">` |
| 2757 | M5 | Pale 300/400 accent icon | `<p className="text-green-300 font-semibold">Approved!</p>` |
| 2903 | M5 | Pale 300/400 accent icon | `⚡ {g.name} <span className="text-[10px] text-amber-300/70 ml-1">(Auto Pay)</span>` |
| 2995 | M5 | Pale 300/400 accent icon | `<p className="text-emerald-300 font-semibold text-sm">ZiniPay Auto Pay Setup</p>` |
| 3043 | M5 | Pale 300/400 accent icon | `<p className="text-[10px] text-yellow-300">` |
| 3117 | M5 | Pale 300/400 accent icon | `<p className="text-cyan-300 font-semibold text-sm">` |
| 3121 | M5 | Pale 300/400 accent icon | `<p className="text-xs text-cyan-400/70 mb-2">` |
| 3153 | M5 | Pale 300/400 accent icon | `<p className="text-[10px] text-cyan-400/50 mb-2">🔒 Gateway Credentials (hidden from users)</p>` |
| 3177 | M5 | Pale 300/400 accent icon | `<p className="text-[10px] text-yellow-300">` |
| 3248 | M5 | Pale 300/400 accent icon | `<Label htmlFor="is-merchant-country" className="text-amber-300 font-medium text-sm cursor-pointer">` |
| 3295 | M5 | Pale 300/400 accent icon | `<Building2 className="w-5 h-5 text-orange-400" />` |
| 3307 | M5 | Pale 300/400 accent icon | `<Building2 className="w-6 h-6 text-orange-400" />` |
| 3346 | M5 | Pale 300/400 accent icon | `<CreditCard className="w-4 h-4 text-cyan-400" />` |
| 3355 | M5 | Pale 300/400 accent icon | `<span className="text-yellow-400 font-mono text-lg font-bold">` |
| 3382 | M5 | Pale 300/400 accent icon | `<span className="text-pink-300 font-bold text-sm">` |
| 3419 | M5 | Pale 300/400 accent icon | `<span className="text-cyan-400 font-bold">` |
| 3450 | M5 | Pale 300/400 accent icon | `<Copy className="w-3.5 h-3.5 text-cyan-400" />` |
| 3483 | M5 | Pale 300/400 accent icon | `<Eye className="w-4 h-4 text-blue-400" />` |
| 3587 | M5 | Pale 300/400 accent icon | `<Clock className="w-8 h-8 text-blue-400 mx-auto mb-2" />` |
| 3588 | M5 | Pale 300/400 accent icon | `<p className="text-blue-300 font-semibold">Waiting for Admin Approval</p>` |
| 3589 | M5 | Pale 300/400 accent icon | `<p className="text-xs text-blue-400 mt-1">Agency has been notified</p>` |

### `src/components/games/CompactGameFooter.tsx` — 30

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 295 | M5 | Pale 300/400 accent icon | `crashed ? "text-red-500" : cashedOut ? "text-green-400" : "text-amber-400"` |
| 301 | M5 | Pale 300/400 accent icon | `<motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-green-400 font-bold text-xs">` |
| 323 | M5 | Pale 300/400 accent icon | `<span className="text-green-400 font-bold text-xs">✓ Bet Placed!</span>` |
| 340 | M5 | Pale 300/400 accent icon | `<span className="text-red-400 font-bold text-xs">💥 -{formatBet(betAmount)}</span>` |
| 405 | M5 | Pale 300/400 accent icon | `<span className="text-xl font-black text-amber-400">{result}</span>` |
| 407 | M5 | Pale 300/400 accent icon | `<span className={cn("text-[7px] font-bold px-1.5 py-0.5 rounded", isBig ? "bg-red-500/30 text-red-400" : "bg-blue-500/30 text-blue-400")}>` |
| 410 | M5 | Pale 300/400 accent icon | `<span className={cn("text-[7px] font-bold px-1.5 py-0.5 rounded", isOdd ? "bg-purple-500/30 text-purple-400" : "bg-green-500/30 text-green-4` |
| 437 | M5 | Pale 300/400 accent icon | `<div className="text-center text-green-400 font-bold text-[10px]">✓ {selectedBet.toUpperCase()}</div>` |
| 512 | M5 | Pale 300/400 accent icon | `<span className="text-lg font-black text-amber-400">{multiplier}x</span>` |
| 513 | M5 | Pale 300/400 accent icon | `<span className="text-green-400 text-xs ml-1">+{(betAmount * multiplier).toLocaleString()}</span>` |
| 523 | M5 | Pale 300/400 accent icon | `<div className="text-center text-green-400 font-bold text-[10px]">✓ Ready!</div>` |
| 589 | M5 | Pale 300/400 accent icon | `<p className="text-blue-400 font-bold text-[8px] mb-0.5">ANDAR</p>` |
| 599 | M5 | Pale 300/400 accent icon | `<p className="text-orange-400 font-bold text-[8px] mb-0.5">BAHAR</p>` |
| 622 | M5 | Pale 300/400 accent icon | `<div className="text-center text-green-400 font-bold text-[10px]">✓ {selectedSide.toUpperCase()}</div>` |
| 905 | M1 | Pure dark surface in modal | `<div className="flex items-center justify-between px-2 py-1 bg-black/40">` |
| 929 | M5 | Pale 300/400 accent icon | `timeLeft <= 5 ? "bg-red-500/30 text-red-400" : "bg-green-500/20 text-green-400"` |
| 942 | M5 | Pale 300/400 accent icon | `<Coins className="w-2.5 h-2.5 text-amber-400" />` |
| 943 | M5 | Pale 300/400 accent icon | `<span className="text-amber-300 font-bold">` |
| 970 | M5 | Pale 300/400 accent icon | `<X className="w-2.5 h-2.5 text-red-400" />` |
| 979 | M5 | Pale 300/400 accent icon | `phase === 'betting' && "bg-green-500/15 text-green-400",` |
| 981 | M5 | Pale 300/400 accent icon | `phase === 'result' && "bg-amber-500/15 text-amber-400",` |
| 982 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `phase === 'waiting' && "bg-slate-500/15 text-slate-400"` |
| 997 | M1 | Pure dark surface in modal | `<div className="flex justify-center gap-1 px-2 py-1.5 bg-black/30 border-t border-white/5">` |
| 997 | M6 | Glass border on dialog | `<div className="flex justify-center gap-1 px-2 py-1.5 bg-black/30 border-t border-white/5">` |
| 1009 | M2 | Glass white/5-10 with light text | `? "bg-white/5 text-white/20"` |
| 1010 | M2 | Glass white/5-10 with light text | `: "bg-white/10 text-white/70"` |
| 1020 | M1 | Pure dark surface in modal | `<div className="flex items-center justify-between px-1.5 py-0.5 bg-black/30 border-t border-white/5">` |
| 1020 | M6 | Glass border on dialog | `<div className="flex items-center justify-between px-1.5 py-0.5 bg-black/30 border-t border-white/5">` |
| 1023 | M5 | Pale 300/400 accent icon | `<Coins className="w-1.5 h-1.5 text-amber-400" />` |
| 1024 | M5 | Pale 300/400 accent icon | `<span className="text-amber-300 font-bold text-[8px]">{betAmount.toLocaleString()}</span>` |

### `src/pages/EditProfile.tsx` — 28

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 443 | M5 | Pale 300/400 accent icon | `<Crown className="w-3.5 h-3.5 text-amber-400" />` |
| 444 | M5 | Pale 300/400 accent icon | `<span className="text-xs font-semibold text-amber-400">Host Account</span>` |
| 487 | M5 | Pale 300/400 accent icon | `<Image className="w-5 h-5 text-fuchsia-400" />` |
| 504 | M5 | Pale 300/400 accent icon | `<Hash className="w-5 h-5 text-blue-400" />` |
| 522 | M5 | Pale 300/400 accent icon | `<User className="w-5 h-5 text-violet-400" />` |
| 562 | M5 | Pale 300/400 accent icon | `<User className="w-5 h-5 text-rose-400" />` |
| 567 | M5 | Pale 300/400 accent icon | `<span className={\`text-sm font-medium ${profile.gender.toLowerCase() === "female" ? "text-pink-400" : "text-blue-400"}\`}>` |
| 582 | M5 | Pale 300/400 accent icon | `<User className="w-5 h-5 text-rose-400" />` |
| 587 | M5 | Pale 300/400 accent icon | `<span className="text-sm text-amber-400 animate-pulse">⚠️ Required</span>` |
| 596 | M5 | Pale 300/400 accent icon | `<p className="text-center text-xs text-amber-400 mt-2">` |
| 620 | M5 | Pale 300/400 accent icon | `? "bg-blue-600/20 border-blue-500 text-blue-400"` |
| 648 | M5 | Pale 300/400 accent icon | `? "bg-pink-600/20 border-pink-500 text-pink-400"` |
| 654 | M5 | Pale 300/400 accent icon | `<p className="text-[10px] mt-1 text-amber-400 flex items-center justify-center gap-1">` |
| 672 | M5 | Pale 300/400 accent icon | `<Star className="w-5 h-5 text-amber-400" />` |
| 711 | M5 | Pale 300/400 accent icon | `<MapPin className="w-5 h-5 text-emerald-400" />` |
| 728 | M5 | Pale 300/400 accent icon | `<EyeOff className="w-5 h-5 text-red-400" />` |
| 730 | M5 | Pale 300/400 accent icon | `<Eye className="w-5 h-5 text-orange-400" />` |
| 767 | M5 | Pale 300/400 accent icon | `<Globe className="w-5 h-5 text-cyan-400" />` |
| 854 | M5 | Pale 300/400 accent icon | `<Hash className="w-5 h-5 text-indigo-400" />` |
| 879 | M5 | Pale 300/400 accent icon | `<MessageCircle className="w-5 h-5 text-teal-400" />` |
| 923 | M5 | Pale 300/400 accent icon | `<Palette className="w-5 h-5 text-amber-400" />` |
| 951 | M5 | Pale 300/400 accent icon | `<Mail className="w-5 h-5 text-blue-400" />` |
| 970 | M5 | Pale 300/400 accent icon | `<Phone className="w-5 h-5 text-green-400" />` |
| 986 | M5 | Pale 300/400 accent icon | `<p className="text-xs font-semibold text-blue-400 uppercase tracking-wider">` |
| 997 | M5 | Pale 300/400 accent icon | `<Lock className="w-5 h-5 text-indigo-400" />` |
| 1033 | M5 | Pale 300/400 accent icon | `<Phone className="w-5 h-5 text-green-400" />` |
| 1066 | M5 | Pale 300/400 accent icon | `<Lock className="w-5 h-5 text-indigo-400" />` |
| 1118 | M5 | Pale 300/400 accent icon | `<Mail className="w-5 h-5 text-blue-400" />` |

### `src/pages/Auth.tsx` — 27

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 2121 | M5 | Pale 300/400 accent icon | `<Sparkles className="w-5 h-5 text-yellow-300 animate-pulse" />` |
| 2232 | M5 | Pale 300/400 accent icon | `<Gift className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-400/70" />` |
| 2269 | M5 | Pale 300/400 accent icon | `<CheckCircle className="w-3.5 h-3.5 text-emerald-300" />` |
| 2332 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />` |
| 2337 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `className="pl-10 h-11 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl focus:border-pink-400 focus:ring-1 focu` |
| 2491 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `className="h-14 bg-transparent border-0 text-slate-800 placeholder:text-slate-400 rounded-2xl text-base focus-visible:ring-0 focus-visible:r` |
| 2520 | M5 | Pale 300/400 accent icon | `Already have an account? <span className="text-pink-400 font-semibold hover:text-pink-300">Login</span>` |
| 2553 | M5 | Pale 300/400 accent icon | `6-digit code sent to <span className="text-emerald-400 font-medium">{email}</span>` |
| 2599 | M5 | Pale 300/400 accent icon | `className="text-emerald-400 text-sm font-semibold hover:text-emerald-300 transition-all disabled:opacity-40 hover:underline underline-offset` |
| 2637 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className="h-13 bg-transparent border-0 ` |
| 2645 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6` |
| 2656 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<Input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="C` |
| 2693 | M5 | Pale 300/400 accent icon | `<DialogDescription className="text-slate-600 text-center text-sm mt-1">Enter the 6-digit code sent to <span className="text-pink-400 font-me` |
| 2717 | M5 | Pale 300/400 accent icon | `<button onClick={handleResendOtp} disabled={otpLoading} className="text-pink-400 text-sm font-semibold hover:text-pink-300 transition-all di` |
| 2741 | M5 | Pale 300/400 accent icon | `<div className="pl-4 pr-2"><Mail className="w-5 h-5 text-indigo-400/70" /></div>` |
| 2742 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address" className="h-13 bg-transparent bord` |
| 2749 | M5 | Pale 300/400 accent icon | `<div className="pl-4 pr-2"><Lock className="w-5 h-5 text-indigo-400/70" /></div>` |
| 2750 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" className="h-13 bg-transparent ` |
| 2764 | M5 | Pale 300/400 accent icon | `Don't have an account? <span className="text-pink-400 font-semibold hover:text-pink-300">Sign Up</span>` |
| 2826 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `className="w-full h-10 bg-transparent border-0 text-slate-800 text-sm placeholder:text-slate-400 outline-none px-2"` |
| 2871 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `className="h-14 bg-transparent border-0 text-slate-800 placeholder:text-slate-400 rounded-2xl text-base focus-visible:ring-0 focus-visible:r` |
| 3011 | M5 | Pale 300/400 accent icon | `<div className="pl-4 pr-2"><User className="w-5 h-5 text-green-400/70" /></div>` |
| 3012 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" className="h-13 bg-transparent border-0 ` |
| 3019 | M5 | Pale 300/400 accent icon | `<div className="pl-4 pr-2"><Lock className="w-5 h-5 text-green-400/70" /></div>` |
| 3020 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<Input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password (min 6` |
| 3030 | M5 | Pale 300/400 accent icon | `<div className="pl-4 pr-2"><Lock className="w-5 h-5 text-green-400/70" /></div>` |
| 3031 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<Input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="C` |

### `src/components/games/GameFooterNew.tsx` — 26

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 122 | M5 | Pale 300/400 accent icon | `<Star className="w-6 h-6 text-yellow-400 fill-yellow-400" />` |
| 138 | M5 | Pale 300/400 accent icon | `<Trophy className="w-12 h-12 text-yellow-300 mx-auto mb-2" />` |
| 144 | M5 | Pale 300/400 accent icon | `className="text-yellow-300 text-3xl font-black mt-2"` |
| 274 | M5 | Pale 300/400 accent icon | `<p className="text-red-400 font-bold text-[10px] mb-1">🐉 DRAGON</p>` |
| 298 | M5 | Pale 300/400 accent icon | `<p className="text-orange-400 font-bold text-[10px] mb-1">🐅 TIGER</p>` |
| 321 | M5 | Pale 300/400 accent icon | `winner === selectedBet ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"` |
| 373 | M5 | Pale 300/400 accent icon | `<p className="text-green-400 font-bold text-[10px] flex items-center justify-center gap-1">` |
| 516 | M5 | Pale 300/400 accent icon | `crashed ? "text-red-500" : cashedOut ? "text-green-400" : "text-amber-400"` |
| 523 | M5 | Pale 300/400 accent icon | `<motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-green-400 font-bold text-sm mt-1">` |
| 546 | M5 | Pale 300/400 accent icon | `<p className="text-green-400 font-bold text-xs">✓ Waiting for takeoff...</p>` |
| 563 | M5 | Pale 300/400 accent icon | `<p className="text-red-400 font-bold text-xs">💥 Crashed! -{formatBet(betAmount)}</p>` |
| 622 | M5 | Pale 300/400 accent icon | `result === 'win' ? "text-green-400" : result === 'lose' ? "text-red-400" : "text-amber-400"` |
| 645 | M5 | Pale 300/400 accent icon | `<p className="text-green-400 font-bold text-xs">✓ Waiting...</p>` |
| 1034 | M1 | Pure dark surface in modal | `<div className="flex items-center justify-between px-2 py-1 bg-black/40">` |
| 1058 | M5 | Pale 300/400 accent icon | `timeLeft <= 5 ? "bg-red-500/30 text-red-400" : "bg-green-500/20 text-green-400"` |
| 1074 | M5 | Pale 300/400 accent icon | `<Coins className="w-2.5 h-2.5 text-amber-400" />` |
| 1079 | M5 | Pale 300/400 accent icon | `className="text-amber-300 font-bold"` |
| 1107 | M5 | Pale 300/400 accent icon | `<X className="w-2.5 h-2.5 text-red-400" />` |
| 1116 | M5 | Pale 300/400 accent icon | `phase === 'betting' && "bg-green-500/20 text-green-400",` |
| 1118 | M5 | Pale 300/400 accent icon | `phase === 'result' && "bg-amber-500/20 text-amber-400"` |
| 1151 | M1 | Pure dark surface in modal | `<div className="px-4 py-3 bg-black/20 border-t border-white/10">` |
| 1151 | M6 | Glass border on dialog | `<div className="px-4 py-3 bg-black/20 border-t border-white/10">` |
| 1155 | M5 | Pale 300/400 accent icon | `<Coins className="w-4 h-4 text-amber-400" />` |
| 1156 | M5 | Pale 300/400 accent icon | `<span className="text-amber-300 font-bold">{betAmount.toLocaleString()}</span>` |
| 1171 | M2 | Glass white/5-10 with light text | `? "bg-white/5 text-white/30"` |
| 1172 | M2 | Glass white/5-10 with light text | `: "bg-white/10 text-white/80 hover:bg-white/20"` |

### `src/pages/AgentRank.tsx` — 22

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 253 | M5 | Pale 300/400 accent icon | `<Trophy className="w-5 h-5 text-yellow-400" />` |
| 281 | M5 | Pale 300/400 accent icon | `<Clock className="w-3.5 h-3.5 text-amber-400" />` |
| 282 | M5 | Pale 300/400 accent icon | `<span className="text-xs font-mono text-amber-300 font-bold tracking-wider">` |
| 292 | M5 | Pale 300/400 accent icon | `<span className="text-[10px] text-emerald-400 font-bold tracking-wide">LIVE</span>` |
| 313 | M5 | Pale 300/400 accent icon | `<Sparkles className="w-4 h-4 text-yellow-400" />` |
| 338 | M5 | Pale 300/400 accent icon | `<Gem className="w-3.5 h-3.5 text-cyan-400" />` |
| 339 | M5 | Pale 300/400 accent icon | `<span className={\`text-sm font-black ${isFirst ? 'text-yellow-300' : 'text-cyan-300'}\`}>` |
| 344 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<p className="text-[9px] text-slate-400 mt-1 truncate font-medium">{reward.reward_badge}</p>` |
| 384 | M5 | Pale 300/400 accent icon | `<Crown className="w-8 h-8 text-yellow-400 drop-shadow-[0_0_8px_rgba(255,215,0,0.6)]" />` |
| 423 | M6 | Glass border on dialog | `: 'bg-white/[0.06] border-white/20'` |
| 425 | M5 | Pale 300/400 accent icon | `<Gem className={\`${isChamp ? 'w-4 h-4' : 'w-3.5 h-3.5'} text-cyan-400\`} />` |
| 426 | M5 | Pale 300/400 accent icon | `<span className={\`font-black ${isChamp ? 'text-sm text-yellow-300' : 'text-xs text-cyan-300'}\`}>` |
| 434 | M5 | Pale 300/400 accent icon | `<Gift className="w-3 h-3 text-yellow-400/70" />` |
| 435 | M5 | Pale 300/400 accent icon | `<span className="text-[9px] text-yellow-400/70 font-bold">+{formatNumber(reward.reward_coins)}</span>` |
| 506 | M5 | Pale 300/400 accent icon | `<Gem className="w-3.5 h-3.5 text-cyan-400" />` |
| 507 | M5 | Pale 300/400 accent icon | `<span className="text-cyan-300 font-black text-sm">{formatNumber(agency.metric_value)}</span>` |
| 511 | M5 | Pale 300/400 accent icon | `<Gift className="w-2.5 h-2.5 text-yellow-400/60" />` |
| 512 | M5 | Pale 300/400 accent icon | `<span className="text-[9px] text-yellow-400/60 font-bold">+{formatNumber(reward.reward_coins)}</span>` |
| 548 | M5 | Pale 300/400 accent icon | `<Gem className="w-3.5 h-3.5 text-cyan-300" />` |
| 568 | M5 | Pale 300/400 accent icon | `<Trophy className="w-4 h-4 text-yellow-400" /> How Rankings Work` |
| 579 | M5 | Pale 300/400 accent icon | `<Gift className="w-4 h-4 text-cyan-400" /> Rewards` |
| 589 | M5 | Pale 300/400 accent icon | `<Wifi className="w-4 h-4 text-emerald-400" /> Real-time Updates` |

### `src/pages/LiveStream.tsx` — 19

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 704 | M5 | Pale 300/400 accent icon | `color: "text-green-400",` |
| 1046 | M5 | Pale 300/400 accent icon | `color: "text-pink-400",` |
| 1124 | M5 | Pale 300/400 accent icon | `color: "text-green-400",` |
| 1586 | M5 | Pale 300/400 accent icon | `color: "text-green-400",` |
| 2525 | M1 | Pure dark surface in modal | `className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/40 text-white hover:bg-black/60 z-10"` |
| 2545 | M6 | Glass border on dialog | `<div className="relative w-28 h-28 rounded-full overflow-hidden border-4 border-white/20 shadow-2xl">` |
| 2564 | M2 | Glass white/5-10 with light text | `<Badge className="bg-white/10 text-white border-white/10">` |
| 2564 | M6 | Glass border on dialog | `<Badge className="bg-white/10 text-white border-white/10">` |
| 2567 | M2 | Glass white/5-10 with light text | `<Badge className="bg-white/10 text-white border-white/10">` |
| 2567 | M6 | Glass border on dialog | `<Badge className="bg-white/10 text-white border-white/10">` |
| 2588 | M6 | Glass border on dialog | `className="w-full max-w-sm bg-gradient-to-br from-purple-600/90 via-purple-700/90 to-purple-800/90 rounded-3xl p-6 border border-white/10 sh` |
| 2611 | M5 | Pale 300/400 accent icon | `<span className="text-2xl font-bold text-amber-400">{liveEndStats.giftEarnings}</span>` |
| 2620 | M5 | Pale 300/400 accent icon | `<span className="text-2xl font-bold text-amber-400">{liveEndStats.callEarnings}</span>` |
| 2764 | M6 | Glass border on dialog | `className="w-24 h-24 rounded-full object-cover border border-white/20"` |
| 2769 | M6 | Glass border on dialog | `<div className="w-24 h-24 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">` |
| 3390 | M5 | Pale 300/400 accent icon | `color: "text-pink-400",` |
| 3502 | M1 | Pure dark surface in modal | `className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/80"` |
| 3538 | M6 | Glass border on dialog | `className="w-24 h-32 rounded-xl overflow-hidden border-2 border-white/20 shadow-lg"` |
| 3553 | M5 | Pale 300/400 accent icon | `className="mt-8 flex items-center gap-2 text-amber-400 text-sm"` |

### `src/pages/HelperDashboard.tsx` — 16

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 1152 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<p className="text-slate-400 text-[10px] mt-1.5 leading-tight">` |
| 1548 | M5 | Pale 300/400 accent icon | `<CheckCircle className="w-4 h-4 text-cyan-400" />` |
| 1597 | M5 | Pale 300/400 accent icon | `<p className="text-red-400 text-xs text-center">` |
| 1686 | M5 | Pale 300/400 accent icon | `<span className="text-emerald-300 font-mono text-sm">{selectedPaymentMethod.account_number}</span>` |
| 1722 | M5 | Pale 300/400 accent icon | `className="w-full mt-3 border-emerald-500/50 text-emerald-300 hover:bg-emerald-100"` |
| 1740 | M5 | Pale 300/400 accent icon | `Transaction ID <span className="text-red-400">*</span>` |
| 1752 | M5 | Pale 300/400 accent icon | `<p className="text-red-400 text-xs mt-1">Transaction ID is required</p>` |
| 1758 | M5 | Pale 300/400 accent icon | `Payment Screenshot <span className="text-red-400">*</span>` |
| 1783 | M5 | Pale 300/400 accent icon | `<p className="text-red-400 text-xs mt-1">Payment screenshot is required</p>` |
| 1912 | M5 | Pale 300/400 accent icon | `<p className="text-cyan-400 font-bold">{level.commission_rate \|\| 0}%</p>` |
| 1944 | M5 | Pale 300/400 accent icon | `<p className="text-emerald-300 text-xs">` |
| 1967 | M5 | Pale 300/400 accent icon | `<Badge className="bg-green-500/30 text-green-300 text-[10px]">Approved</Badge>` |
| 2003 | M5 | Pale 300/400 accent icon | `<span className="text-red-400 text-xs">❌ Application rejected. You can apply again.</span>` |
| 2519 | M5 | Pale 300/400 accent icon | `<p className="text-emerald-300 text-xs">Transfer from wallet to your own diamond balance</p>` |
| 2563 | M5 | Pale 300/400 accent icon | `<History className="w-5 h-5 text-cyan-400" />` |
| 2610 | M5 | Pale 300/400 accent icon | `? "bg-cyan-500/20 text-cyan-300"` |

### `src/pages/Chat.tsx` — 15

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 1980 | M5 | Pale 300/400 accent icon | `className="text-red-400 hover:text-red-300 hover:bg-red-500/[0.08] cursor-pointer gap-3 py-3 px-3 rounded-xl transition-all"` |
| 1983 | M5 | Pale 300/400 accent icon | `<X className="w-4 h-4 text-red-400" />` |
| 1993 | M5 | Pale 300/400 accent icon | `className="text-amber-400 hover:text-amber-300 hover:bg-amber-500/[0.08] cursor-pointer gap-3 py-3 px-3 rounded-xl transition-all"` |
| 1996 | M5 | Pale 300/400 accent icon | `<ShieldAlert className="w-4 h-4 text-amber-400" />` |
| 2684 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `"rounded-full bg-white/[0.06] border border-amber-200/60 pr-20 text-slate-900 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:` |
| 2773 | M5 | Pale 300/400 accent icon | `<Gift className="w-5 h-5 text-pink-400" />` |
| 2785 | M5 | Pale 300/400 accent icon | `<Gamepad2 className="w-5 h-5 text-indigo-400" />` |
| 2803 | M5 | Pale 300/400 accent icon | `<VideoCallIcon className="w-5 h-5 text-rose-400 relative z-10" />` |
| 2808 | M5 | Pale 300/400 accent icon | `<span className="text-[8px] text-amber-400/70 font-medium">💎 {selectedConversation.other_user.call_rate_per_minute}/min</span>` |
| 3008 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />` |
| 3013 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `className="pl-10 rounded-full bg-white/90 border border-amber-200/60 text-slate-900 placeholder:text-slate-400 focus-visible:ring-2 focus-vi` |
| 3184 | M5 | Pale 300/400 accent icon | `<Users className="w-8 h-8 text-fuchsia-400" />` |
| 3218 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `className="bg-white border-amber-200/60 text-slate-800 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-purple-500/40"` |
| 3263 | M5 | Pale 300/400 accent icon | `<Users className="w-5 h-5 text-pink-400" />` |
| 3299 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `className="pr-12 bg-white/[0.06] border-slate-200/[0.08] text-slate-900 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-p` |

### `src/components/party/PartyGiftPanel.tsx` — 12

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 206 | M6 | Glass border on dialog | `<SheetContent side="bottom" className="h-[55vh] rounded-t-3xl bg-gradient-to-b from-slate-900 to-slate-950 border-t border-white/10 p-0 pb-s` |
| 208 | M6 | Glass border on dialog | `<div className="flex items-center justify-between px-4 py-2 border-b border-white/10">` |
| 215 | M5 | Pale 300/400 accent icon | `<Coins className="w-3 h-3 text-amber-400" />` |
| 216 | M5 | Pale 300/400 accent icon | `<span className="text-xs font-bold text-amber-300">{formatCoins(userCoins)}</span>` |
| 225 | M6 | Glass border on dialog | `<div className="border-b border-white/10">` |
| 236 | M2 | Glass white/5-10 with light text | `: "bg-white/5 text-white/60 hover:bg-white/10"` |
| 242 | M2 | Glass white/5-10 with light text | `activeCategory === category.id ? "bg-white/25 text-white" : "bg-white/10 text-white/40"` |
| 350 | M5 | Pale 300/400 accent icon | `<span className="text-[10px] text-amber-400 flex items-center gap-0.5 font-bold">` |
| 388 | M6 | Glass border on dialog | `className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-slate-900 to-slate-900/90 border-t border-white/10 safe-area-bottom"` |
| 423 | M5 | Pale 300/400 accent icon | `<p className="text-amber-400 text-xs">{formatCoins(selectedGift.coins * sendCount)} coins</p>` |
| 454 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `: "bg-gray-600 text-gray-400"` |
| 462 | M5 | Pale 300/400 accent icon | `<p className="text-xs text-red-400 text-center mt-1">Insufficient coins</p>` |

### `src/components/rewards/DailyLoginPopup.tsx` — 11

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 141 | M5 | Pale 300/400 accent icon | `<Sparkles className="w-3 h-3 text-amber-300" />` |
| 161 | M5 | Pale 300/400 accent icon | `<Sparkles className="absolute top-1/2 -left-2 -translate-y-1/2 w-3 h-3 text-fuchsia-300 drop-shadow-[0_0_8px_rgba(232,121,249,0.9)]" />` |
| 217 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<p className="mt-1 text-[11px] text-slate-400 tracking-wider">` |
| 241 | M5 | Pale 300/400 accent icon | `<Flame className="w-3 h-3 text-orange-300" />` |
| 299 | M5 | Pale 300/400 accent icon | `? "text-emerald-300/70"` |
| 300 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `: "text-slate-400"` |
| 327 | M5 | Pale 300/400 accent icon | `className="w-6 h-6 text-amber-300 drop-shadow-[0_0_10px_rgba(245,158,11,0.8)]"` |
| 343 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `: "text-slate-400"` |
| 380 | M5 | Pale 300/400 accent icon | `<p className="text-[9px] font-bold uppercase tracking-[0.24em] text-amber-300/80 mb-1.5">` |
| 408 | M5 | Pale 300/400 accent icon | `<Gem className="w-4 h-4 text-cyan-300" />` |
| 500 | M5 | Pale 300/400 accent icon | `className="text-center text-[11px] text-amber-300/75 mt-3 font-semibold tracking-wide"` |

### `src/pages/Reels.tsx` — 9

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 475 | M1 | Pure dark surface in modal | `<div className="fixed inset-0 bg-black flex flex-col overflow-hidden">` |
| 484 | M2 | Glass white/5-10 with light text | `className="flex items-center gap-1 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-` |
| 549 | M1 | Pure dark surface in modal | `<div className="w-20 h-20 rounded-full bg-black/50 flex items-center justify-center">` |
| 751 | M5 | Pale 300/400 accent icon | `<span className="text-pink-400 text-[10px] font-bold whitespace-nowrap flex-shrink-0 bg-pink-500/15 px-1.5 py-0.5 rounded-full border border` |
| 855 | M6 | Glass border on dialog | `<SheetContent side="bottom" className="rounded-t-3xl border-t border-white/10 bg-gradient-to-b from-zinc-900 to-black p-0 max-h-[80vh]">` |
| 947 | M5 | Pale 300/400 accent icon | `<User className="w-5 h-5 text-rose-400" />` |
| 950 | M5 | Pale 300/400 accent icon | `<div className="text-rose-300 text-sm font-semibold">Block User</div>` |
| 987 | M2 | Glass white/5-10 with light text | `className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white` |
| 987 | M6 | Glass border on dialog | `className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white` |

### `src/components/party/ProfessionalBottomBar.tsx` — 7

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 184 | M1 | Pure dark surface in modal | `className="absolute inset-0 -bottom-2 rounded-2xl bg-black blur-xl -z-10"` |
| 298 | M5 | Pale 300/400 accent icon | `<Sparkles className="w-5 h-5 text-yellow-400" />` |
| 307 | M2 | Glass white/5-10 with light text | `className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white"` |
| 320 | M5 | Pale 300/400 accent icon | `<Sparkles className="w-4 h-4 text-green-400" />` |
| 322 | M5 | Pale 300/400 accent icon | `<span className="text-green-400 font-semibold text-sm">Live Games</span>` |
| 390 | M6 | Glass border on dialog | `className="flex flex-col items-center gap-0.5 h-auto py-2 px-3 rounded-xl bg-white/10 border border-white/10"` |
| 402 | M6 | Glass border on dialog | `className="flex flex-col items-center gap-0.5 h-auto py-2 px-3 rounded-xl bg-white/10 border border-white/10"` |

### `src/pages/Tasks.tsx` — 6

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 562 | M5 | Pale 300/400 accent icon | `<p className="text-amber-300 font-bold text-lg">{bonusSettings.beans_per_hour.toLocaleString()}</p>` |
| 579 | M6 | Glass border on dialog | `: 'bg-white/5 border border-white/10'` |
| 597 | M6 | Glass border on dialog | `<div className="mx-4 mb-4 p-3 rounded-xl bg-white/5 border border-white/10">` |
| 601 | M5 | Pale 300/400 accent icon | `<p className="text-amber-300 font-bold text-sm">{(bonusProgress?.beans_earned \|\| 0).toLocaleString()}</p>` |
| 611 | M5 | Pale 300/400 accent icon | `<p className="text-fuchsia-300 font-bold text-sm">Day {bonusProgress?.day_number \|\| 1}/{bonusSettings.eligible_days}</p>` |
| 795 | M5 | Pale 300/400 accent icon | `<Star className="w-16 h-16 text-amber-300 mx-auto mb-4" />` |

### `src/components/report/ReportUserDialog.tsx` — 6

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 26 | M5 | Pale 300/400 accent icon | `iconColor: "text-pink-400",` |
| 37 | M5 | Pale 300/400 accent icon | `iconColor: "text-red-400",` |
| 48 | M5 | Pale 300/400 accent icon | `iconColor: "text-orange-400",` |
| 70 | M5 | Pale 300/400 accent icon | `iconColor: "text-amber-400",` |
| 144 | M5 | Pale 300/400 accent icon | `<ShieldAlert className="w-5 h-5 text-red-400" />` |
| 208 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `className="bg-white/70 border-amber-200/60 text-slate-800 placeholder:text-slate-400 min-h-[80px] resize-none rounded-xl focus:border-purple` |

### `src/components/games/LiveGameSelector.tsx` — 5

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 80 | M1 | Pure dark surface in modal | `<div className="absolute top-2 right-2 flex items-center gap-1 bg-black/40 backdrop-blur-sm px-1.5 py-0.5 rounded-full z-10">` |
| 227 | M5 | Pale 300/400 accent icon | `<Sparkles className="w-5 h-5 text-yellow-400" />` |
| 237 | M2 | Glass white/5-10 with light text | `className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20"` |
| 282 | M6 | Glass border on dialog | `className="px-5 py-4 border-t border-white/10"` |
| 292 | M5 | Pale 300/400 accent icon | `<Coins className="w-5 h-5 text-yellow-400" />` |

### `src/pages/Leaderboard.tsx` — 4

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 372 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<HelpCircle className="w-5 h-5 text-slate-400" />` |
| 470 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<Swords className="w-6 h-6 mx-auto mb-1 text-slate-400" />` |
| 511 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<p className="text-slate-400 text-sm mt-1">Be the first to climb!</p>` |
| 754 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `rank <= 10 ? "text-amber-600" : "text-slate-400"` |

### `src/components/auth/PhoneSignInButton.tsx` — 4

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 260 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `className="pl-10 h-12 bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl"` |
| 323 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `className="flex-1 h-14 text-lg bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl"` |
| 397 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `className="h-14 text-lg bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl text-center"` |
| 442 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `className="h-16 w-48 text-center text-3xl font-bold tracking-[0.5em] bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 rou` |

### `src/components/profile/ProfileReelsSection.tsx` — 4

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 210 | M1 | Pure dark surface in modal | `<div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/10 group-hover:bg-black/30 transition-colors"` |
| 217 | M1 | Pure dark surface in modal | `<div className="absolute bottom-1 left-1 flex items-center gap-0.5 text-white text-[9px] font-bold bg-black/60 rounded px-1.5 py-0.5">` |
| 224 | M1 | Pure dark surface in modal | `<div className="absolute top-1 left-1 w-5 h-5 rounded-full bg-black/70 flex items-center justify-center">` |
| 236 | M1 | Pure dark surface in modal | `className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center hover:bg-black/80 active:scale-95 transi` |

### `src/components/profile/ProfileReelsTab.tsx` — 4

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 172 | M1 | Pure dark surface in modal | `<div className="w-6 h-6 rounded-full bg-black/40 flex items-center justify-center">` |
| 178 | M1 | Pure dark surface in modal | `<div className="absolute bottom-0.5 left-0.5 flex items-center gap-0.5 text-white text-[8px] font-medium bg-black/50 rounded px-1">` |
| 220 | M1 | Pure dark surface in modal | `"absolute inset-0 bg-black/40 flex flex-col items-center justify-center transition-opacity pointer-events-none",` |
| 242 | M1 | Pure dark surface in modal | `className="p-1.5 bg-black/50 rounded-full hover:bg-black/70 transition-colors"` |

### `src/components/rewards/RatingRewardPopup.tsx` — 4

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 297 | M5 | Pale 300/400 accent icon | `<Gift className="w-7 h-7 text-amber-400" />` |
| 299 | M5 | Pale 300/400 accent icon | `<p className="text-amber-300 font-bold text-lg tracking-wide">Claim Your Reward</p>` |
| 385 | M5 | Pale 300/400 accent icon | `<CheckCircle className="w-9 h-9 text-emerald-400" />` |
| 394 | M5 | Pale 300/400 accent icon | `<div className="flex items-center justify-center gap-2 text-amber-400/50 text-xs">` |

### `src/pages/GoogleLibraryOrderRules.tsx` — 3

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 284 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<p className="text-slate-400 text-xs">© MeriLive — All Rights Reserved</p>` |
| 349 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 rounded-xl mb-3 text-sm h-11"` |
| 358 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `className="bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400 min-h-[80px] resize-none rounded-xl mb-4 text-sm"` |

### `src/pages/Settings.tsx` — 3

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 1001 | M5 | Pale 300/400 accent icon | `<Camera className="w-5 h-5 text-pink-400" />` |
| 1028 | M5 | Pale 300/400 accent icon | `<Mic className="w-5 h-5 text-blue-400" />` |
| 1055 | M5 | Pale 300/400 accent icon | `<MapPin className="w-5 h-5 text-green-400" />` |

### `src/pages/AgencyHostManagement.tsx` — 2

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 428 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />` |
| 475 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<Badge className={hostData.host?.is_online ? "bg-success-500/20 text-success-400" : "bg-gray-500/20 text-gray-400"}>` |

### `src/pages/AgencyWithdrawal.tsx` — 2

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 2903 | M6 | Glass border on dialog | `<DialogContent className="mx-4 rounded-2xl bg-gradient-to-br from-warning-50 via-white to-warning-50 border-white/20">` |
| 2989 | M6 | Glass border on dialog | `<DialogContent className="mx-4 rounded-2xl bg-gradient-to-br from-warning-50 via-white to-warning-50 border-white/20 max-h-[85vh] overflow-y` |

### `src/pages/Profile.tsx` — 2

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 2154 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<ChevronRight className="w-4 h-4 text-slate-400" />` |
| 2929 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `className="bg-white border border-amber-200/70 text-slate-800 placeholder:text-slate-400 text-lg h-12 rounded-xl focus-visible:ring-amber-40` |

### `src/pages/SearchUsers.tsx` — 2

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 398 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />` |
| 407 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `className="pl-10 pr-10 rounded-full bg-slate-100 border border-slate-200 text-slate-900 placeholder:text-slate-400 focus-visible:ring-1 focu` |

### `src/components/auth/BanPopupDialog.tsx` — 2

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 66 | M5 | Pale 300/400 accent icon | `<ShieldX className="w-9 h-9 text-red-400" />` |
| 69 | M5 | Pale 300/400 accent icon | `<AlertDialogTitle className="text-red-300 text-center text-lg">` |

### `src/components/games/GlobalGameOverlay.tsx` — 2

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 65 | M1 | Pure dark surface in modal | `className="w-8 h-8 rounded-full bg-black/50 text-white hover:bg-black/70"` |
| 95 | M6 | Glass border on dialog | `className="relative w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 via-pink-500 to-orange-400 shadow-xl border-2 border-white/20 fl` |

### `src/components/party/AdvancedPartyBottomBar.tsx` — 2

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 132 | M1 | Pure dark surface in modal | `className="absolute inset-0 -bottom-2 rounded-2xl bg-black blur-xl -z-10"` |
| 359 | M5 | Pale 300/400 accent icon | `<Sparkles className="w-4 h-4 text-yellow-400" />` |

### `src/pages/Index.tsx` — 1

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 440 | M1 | Pure dark surface in modal | `<div className="flex items-center gap-1 bg-black/60 backdrop-blur-sm rounded-full px-2 py-1">` |

### `src/pages/ProfileDetail.tsx` — 1

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 711 | M2 | Glass white/5-10 with light text | `className="bg-white/5 border-slate-200/10 text-white hover:bg-white/10">` |

### `src/components/chat/ChatGiftPanel.tsx` — 1

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 341 | M3 | Faint body text (slate-400/gray-400/zinc-400/muted/50) | `<Gift className="w-10 h-10 text-muted-foreground/50" />` |

### `src/components/games/GameSelector.tsx` — 1

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 38 | M6 | Glass border on dialog | `className="fixed bottom-24 right-4 z-40 w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-600 to-pink-500 shadow-xl border-2 border-white/` |

### `src/components/home/Header.tsx` — 1

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 83 | M5 | Pale 300/400 accent icon | `<Trophy className="w-5 h-5 text-amber-400" />` |

### `src/components/reels/ReelUploadModal.tsx` — 1

| Line | Rule | Issue | Class snippet |
|-----:|------|-------|---------------|
| 375 | M1 | Pure dark surface in modal | `className="absolute top-2 right-2 p-1 bg-black/60 rounded-full"` |

---

**Fix workflow**

1. Open the file at the listed line.
2. Replace the dark-theme class with a light-premium token (e.g. `bg-white text-slate-800`, `border-amber-200/60`, `text-emerald-700`).
3. If the case is intentional (e.g. dark surface used by design), append `// dark-ok` on the same line.
4. Re-run `node scripts/audit-modals.mjs` to confirm the count drops.
