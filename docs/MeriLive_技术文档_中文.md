# MeriLive 应用技术文档（完整版）

## 📱 应用概述

**应用名称：** MeriLive  
**包名：** com.merilive.app  
**平台：** Android (优先) + iOS + Web  
**技术栈：** React + TypeScript + Capacitor (混合架构)  
**后端：** Supabase (PostgreSQL + Edge Functions + Realtime + Storage)  
**目标：** 直播社交应用，类似于 Bigo Live / Chamet / Azar  

---

## 🏗️ 一、整体架构

### 1.1 前端架构
```
技术栈：
├── React 18 + TypeScript
├── Vite (构建工具)
├── Tailwind CSS (样式系统)
├── Framer Motion (动画库)
├── Capacitor 8 (原生桥接)
├── shadcn/ui (UI 组件库)
├── TanStack React Query (数据管理)
└── React Router v6 (路由系统)
```

### 1.2 后端架构
```
Supabase 平台：
├── PostgreSQL 数据库（150+ 张表）
├── Edge Functions (Deno) - 30+ 个无服务器函数
├── Realtime 订阅（直播/聊天/通话/房间系统）
├── Supabase Auth（认证系统）
├── Supabase Storage（文件存储 + Cloudflare R2 扩展）
└── Row Level Security (RLS) 行级安全策略
```

### 1.3 原生 Android 架构
```
Java 原生层：
├── MainActivity.java          - 主活动（FLAG_SECURE 屏幕安全）
├── PlayStoreBillingPlugin.java - Google Play 支付插件
├── MyFirebaseMessagingService.java - FCM 推送通知
├── IncomingCallActivity.java  - 来电全屏界面
├── IncomingCallService.java   - 来电后台服务
├── CallActionReceiver.java    - 通话广播接收器
└── ScreenSecurityPlugin.java  - 屏幕截图/录屏拦截
```

### 1.4 模块化设计
```
src/features/
├── shared/     ← 共享模块（改一处 = 全部更新）
│   ├── gifting/      - 🎁 统一礼物系统
│   ├── animations/   - ✨ 统一动画系统
│   ├── frames/       - 🖼️ 统一头像框系统
│   ├── messaging/    - 💬 统一消息系统
│   ├── room/         - 🏠 统一房间系统
│   ├── viewers/      - 👥 观众系统
│   ├── profile/      - 👤 个人资料卡
│   └── level/        - 🎖️ 等级系统
│
├── live/       ← 直播模块（独立）
├── party/      ← 派对房间模块（独立）
├── call/       ← 私人通话模块（独立）
├── chat/       ← 聊天消息模块（独立）
├── profile/    ← 用户资料模块（独立）
├── agency/     ← 经纪公司模块（独立）
├── admin/      ← 管理后台模块（独立）
├── reels/      ← 短视频模块（独立）
├── vip/        ← VIP会员模块（独立）
├── shop/       ← 商城模块（独立）
├── home/       ← 首页模块（独立）
└── games/      ← 游戏模块（独立）
```

---

## 🎬 二、直播系统 (Live Streaming)

### 2.1 核心功能
| 功能 | 说明 |
|------|------|
| **开播** | 主播开启视频直播，选择分类/标签 |
| **观看直播** | 观众实时观看视频流 |
| **Agora SDK** | 声网 RTC SDK 用于视频推流和拉流 |
| **美颜滤镜** | BeautyFilterPanel - 美白、磨皮、瘦脸等 |
| **面部贴纸** | AccurateStickerOverlay - TensorFlow.js 面部检测 + 实时贴纸 |
| **面部追踪** | @tensorflow-models/face-landmarks-detection |
| **直播间聊天** | PremiumJoinChatOverlay 实时弹幕消息 |
| **飞入横幅** | FlyingJoinBanner - 观众加入时飞入通知 |
| **屏幕共享** | ScreenShareButton - 主播屏幕共享 |
| **音乐播放** | MusicPlayerPanel - 直播间背景音乐 |
| **连麦/副播** | CoHostPanel - 邀请其他主播连麦 |
| **直播录制** | agora-cloud-recording Edge Function |

### 2.2 PK 对战系统
| 功能 | 说明 |
|------|------|
| **PK 面板** | PKBattlePanel - 发起/接受 PK 请求 |
| **PK 请求** | PKBattleRequest - PK 邀请界面 |
| **PK 进行中** | PKBattleActive - 双分屏 + 实时分数 |
| **PK 结果** | PKBattleResult - 胜负动画展示 |
| **PK 随机匹配** | PKRandomMatchNotification - 自动匹配 |
| **PK 排行榜** | PKLeaderboard - PK 赛季排名 |
| **PK 礼物** | pk_battle_gifts 表 - PK 期间礼物计分 |
| **PK 奖励** | pk_competition_rewards - 赛季奖励 |

### 2.3 直播间游戏
| 游戏 | 说明 |
|------|------|
| **幸运转盘** | Roulette - 直播间内轮盘游戏 |
| **摩天轮** | Ferris Wheel - 摩天轮抽奖 |
| **Teen Patti** | 三张牌扑克 - 直播间内对赌 |
| **游戏投注** | live_game_bets / game_bets 表 |
| **游戏统计** | game_stats / game_rounds_stats |
| **游戏服务** | game-provider / game-auto-runner Edge Functions |

### 2.4 相关数据表
```
live_streams           - 直播记录
stream_chat            - 直播弹幕
stream_viewers         - 观众记录
stream_recordings      - 录播文件
pk_battles             - PK 战斗
pk_battle_gifts        - PK 礼物
pk_competitions        - PK 竞赛
live_bans              - 直播封禁
live_violations        - 违规记录
live_moderation_settings - 审核设置
```

---

## 🎉 三、派对房间系统 (Party Rooms)

### 3.1 房间类型
| 类型 | 说明 |
|------|------|
| **语音房** | ProfessionalAudioRoom - 多人语音聊天 |
| **视频房** | ChametStyleVideoRoom - 多人视频聊天 |
| **游戏房** | ChametStyleGameRoom - 房间内玩游戏 |

### 3.2 核心功能
| 功能 | 说明 |
|------|------|
| **座位系统** | ProfessionalSeatGrid - 动态座位布局 |
| **座位邀请** | seat_invitations 表 |
| **座位申请** | seat_requests 表 |
| **房间聊天** | ChametStyleChatPanel |
| **背景切换** | BackgroundPickerPanel - 自定义房间背景 |
| **布局选择** | LayoutPickerPanel - 多种座位布局 |
| **房间设置** | ChametStyleSettingsPanel |
| **WebRTC** | usePartyRoomWebRTC - 实时音视频 |
| **礼物贡献** | GiftContributorsPanel - 礼物排行 |
| **车辆入场** | VehicleEntranceAnimation - 豪华入场动画 |
| **动态Banner** | DynamicPartyBanners - 管理员配置的横幅 |
| **音乐** | PartyMusicPlayer - 房间背景音乐 |

### 3.3 相关数据表
```
party_rooms              - 派对房间
party_room_participants  - 房间参与者
party_room_messages      - 房间消息
party_room_backgrounds   - 房间背景图
party_room_banners       - 房间横幅
seat_invitations         - 座位邀请
seat_requests            - 座位申请
```

---

## 📞 四、私人通话系统 (Private Calls)

### 4.1 核心功能
| 功能 | 说明 |
|------|------|
| **音频通话** | 一对一音频通话 |
| **视频通话** | 一对一视频通话 |
| **来电界面** | IncomingCallModal - 来电弹窗 |
| **通话中界面** | ActiveCallScreen - 通话中全屏界面 |
| **通话确认** | CallConfirmModal - 发起通话确认 |
| **通话评价** | CallRatingModal - 通话结束评价 |
| **通话结束** | CallEndedModal - 通话结束摘要 |
| **通话按钮** | CallButton - 全局通话入口 |
| **通话提供者** | CallProvider - 全局通话状态管理 |

### 4.2 计费系统
| 功能 | 说明 |
|------|------|
| **按分钟计费** | useCallBilling - 每分钟扣费 |
| **主播费率** | useHostCallRate - 不同主播不同价格 |
| **21秒免费** | 接通后前21秒不收费 |
| **余额检查** | 通话前检查硬币余额 |

### 4.3 原生来电（Android）
| 功能 | 说明 |
|------|------|
| **FCM 推送** | MyFirebaseMessagingService - 高优先级推送 |
| **来电服务** | IncomingCallService - 后台来电服务 |
| **来电活动** | IncomingCallActivity - 锁屏来电界面 |
| **响铃 + 振动** | 来电时响铃和振动 |
| **接听/拒绝** | CallActionReceiver - 处理通话操作 |

### 4.4 相关数据表
```
private_calls              - 通话记录
call_events                - 通话事件
private_call_security_logs - 安全日志
```

---

## 🎁 五、礼物系统 (Gifting System)

### 5.1 核心功能
| 功能 | 说明 |
|------|------|
| **礼物面板** | GiftPanel - 分类展示所有礼物 |
| **滑动选礼** | GiftSwipeableGrid - 滑动切换礼物分类 |
| **飞行动画** | FlyingGiftAnimation - 礼物飞行动画 |
| **全屏动画** | FullScreenGiftAnimation - 大礼物全屏特效 |
| **Combo 连击** | GiftComboDisplay - 礼物连击效果 |
| **SVGA 特效** | SVGA 动画播放器（带音效） |
| **Lottie 特效** | LottieGiftEffects - Lottie 动画 |
| **VAP/MP4** | WebGL 视频动画（透明背景） |

### 5.2 礼物动画格式
| 格式 | 用途 |
|------|------|
| **SVGA** | 主要礼物动画格式（svga.lite + svgaplayerweb） |
| **Lottie** | JSON 动画（lottie-react） |
| **VAP/MP4** | WebGL 渲染的透明视频动画 |
| **WebP** | 简单动图 |
| **带音效** | SVGAPlayerWithAudio - 动画 + 音频同步 |

### 5.3 使用场景
- 直播间送礼
- 派对房间送礼
- 私人通话送礼
- 聊天窗口送礼
- 个人主页送礼

### 5.4 相关数据表
```
gifts                  - 礼物配置
gift_transactions      - 礼物交易记录
gift_transaction_logs  - 详细交易日志
```

---

## 💬 六、聊天/消息系统 (Chat/Messaging)

### 6.1 私聊功能
| 功能 | 说明 |
|------|------|
| **对话列表** | Chat.tsx - 所有对话列表 |
| **实时消息** | Supabase Realtime 订阅 |
| **文字消息** | 普通文本消息 |
| **语音消息** | 语音录制和播放 |
| **图片/视频** | MediaUploader - 多媒体消息 |
| **表情包** | EmojiPicker - 表情选择器 |
| **礼物消息** | ChatGiftPanel / GiftEmojiAnimation |
| **聊天审核** | chat_moderation_logs - 违规检测 |
| **电话检测** | detect-phone-number Edge Function |
| **翻译** | translate Edge Function |
| **AI 回复** | ai-chat-reply Edge Function |

### 6.2 群组功能
```
groups          - 群组信息
group_members   - 群成员
group_messages  - 群消息
```

### 6.3 相关数据表
```
conversations   - 私聊对话
messages        - 消息记录
```

---

## 👤 七、用户系统 (User System)

### 7.1 认证方式
| 方式 | 说明 |
|------|------|
| **邮箱注册** | Supabase Auth 邮箱密码注册 |
| **Google 登录** | @capacitor-firebase/authentication (原生) |
| **手机号登录** | Firebase Phone Auth |
| **OTP 验证** | send-password-otp Edge Function |
| **访客模式** | convert-anonymous-to-guest Edge Function |

### 7.2 用户资料
| 功能 | 说明 |
|------|------|
| **个人主页** | Profile.tsx / ProfileDetail.tsx |
| **编辑资料** | EditProfile.tsx |
| **头像上传** | AvatarUpload + ImageCropModal (裁剪) |
| **用户标签** | Tags.tsx - 兴趣标签 |
| **关注列表** | FollowingList.tsx |
| **搜索用户** | SearchUsers.tsx |
| **用户海报** | MyPoster.tsx - 个人推广海报 |

### 7.3 等级系统
| 功能 | 说明 |
|------|------|
| **用户等级** | Level.tsx - 等级详情页 |
| **等级徽章** | LevelBadge / AnimatedLevelBadge |
| **VIP 徽章** | VIPBadge |
| **认证徽章** | VerifiedBadge |
| **等级特权** | level_privileges 表 - 各等级解锁功能 |
| **入场动画** | EntranceAnimation - 高等级入场特效 |
| **入场横幅** | EntryBannerAnimation |
| **入场条** | EntryBarAnimation / EntryNameBarAnimation |

### 7.4 人脸验证
| 功能 | 说明 |
|------|------|
| **人脸注册** | FaceVerification.tsx |
| **人脸记录** | face_records 表 |
| **验证提交** | face_verification_submissions 表 |

### 7.5 单设备登录
| 功能 | 说明 |
|------|------|
| **单设备会话** | useSingleDeviceSession - 同一账号只能一个设备 |
| **设备绑定** | link-device-to-account Edge Function |

### 7.6 相关数据表
```
profiles                     - 用户资料
followers                    - 关注关系
face_records                 - 人脸数据
face_verification_submissions - 验证提交
device_tokens                - 设备推送令牌
poster_images                - 用户海报
```

---

## 🖼️ 八、装饰/虚拟物品系统

### 8.1 头像框 (Avatar Frames)
| 功能 | 说明 |
|------|------|
| **头像框商城** | 多种头像框可购买 |
| **等级框** | 达到等级自动解锁 |
| **VIP框** | VIP 专属头像框 |
| **角色框** | role_frames - 角色专属框 |
| **排行榜框** | leaderboard_podium_frames |

### 8.2 入场特效
| 功能 | 说明 |
|------|------|
| **入场横幅** | entry_banners - 大型入场动画 |
| **入场条** | entry_name_bars - 名字入场条 |
| **车辆入场** | VehicleEntranceAnimation - 豪车入场 |
| **统一入场** | UnifiedEntryAnimation - 统一入场效果管理 |

### 8.3 相关数据表
```
avatar_frames          - 头像框
entry_banners          - 入场横幅
entry_name_bars        - 入场名条
role_frames            - 角色框
leaderboard_podium_frames - 排行榜框
shop_items             - 商城物品
level_animations       - 等级动画
```

---

## 🎬 九、短视频/Reels 系统

### 9.1 核心功能
| 功能 | 说明 |
|------|------|
| **浏览 Reels** | Reels.tsx - TikTok 风格的上下滑动 |
| **上传视频** | ReelUploadModal.tsx |
| **音乐选择** | SoundPickerModal.tsx |
| **点赞** | reel_likes 表 |
| **评论** | reel_comments 表 |
| **分享** | reel_shares 表 |
| **举报** | reel_reports 表 |
| **分类** | reel_categories 表 |

---

## 💰 十、经济/货币系统

### 10.1 虚拟货币
| 货币 | 说明 |
|------|------|
| **硬币 (Coins)** | 用户充值获取，用于送礼/打赏 |
| **金豆 (Beans)** | 主播/用户通过收礼获得，可以兑换 |
| **钻石 (Diamonds)** | 高级货币，经纪公司使用 |

### 10.2 充值系统
| 功能 | 说明 |
|------|------|
| **充值页** | Recharge.tsx |
| **Google Play 支付** | PlayStoreBillingPlugin (原生) |
| **充值套餐** | coin_packages 表 |
| **充值记录** | recharge_transactions 表 |
| **支付网关** | payment_gateways / payment_methods |
| **汇率管理** | currency_rates 表 |
| **充值助手** | Helper 系统 - 帮助用户充值 |

### 10.3 提现系统
| 功能 | 说明 |
|------|------|
| **提现页** | Withdrawal.tsx |
| **提现记录** | TransferHistory.tsx |
| **金豆兑换** | UserBeansExchangeModal |
| **多币种** | 支持多国货币转换 |

### 10.4 转账系统
```
coin_transfers         - 硬币转账
payment_transactions   - 支付交易
```

---

## 🏢 十一、经纪公司系统 (Agency System)

### 11.1 经纪公司管理
| 功能 | 说明 |
|------|------|
| **创建公司** | CreateAgency.tsx |
| **公司面板** | AgencyDashboard.tsx |
| **主播管理** | AgencyHostManagement.tsx |
| **签约管理** | agency_hosts 表 - 签约/解约 |
| **公司详情** | AgencyDetails.tsx |
| **佣金历史** | AgencyCommissionHistory.tsx |
| **转账记录** | AgencyTransferHistory.tsx |
| **提现** | AgencyWithdrawal.tsx |
| **硬币兑换** | AgencyCoinExchange.tsx |
| **公司政策** | AgencyPolicy.tsx |

### 11.2 经纪公司等级
| 功能 | 说明 |
|------|------|
| **等级分层** | agency_level_tiers - 按收入自动升级 |
| **佣金比例** | 不同等级不同佣金 |
| **业绩统计** | agency_performance |
| **排名系统** | agency_rankings |

### 11.3 子代理商
| 功能 | 说明 |
|------|------|
| **子代理** | BecomeSubAgent.tsx |
| **推荐码** | sub_agent_referrals |
| **佣金** | sub_agent_commissions |

### 11.4 帮充/Trader 系统
| 功能 | 说明 |
|------|------|
| **充值助手** | HelperDashboard.tsx |
| **助手等级** | helper_level_config |
| **订单管理** | helper_orders / helper_topup_requests |
| **提现请求** | helper_withdrawal_requests |
| **Level 5 助手** | Level5HelperDashboard - 高级助手面板 |
| **钻石定价** | helper_diamond_packages |
| **国家分配** | helper_assigned_countries |
| **支付方式** | helper_country_payment_methods |

---

## 🏆 十二、排行榜系统 (Leaderboard)

### 12.1 排行类型
| 类型 | 说明 |
|------|------|
| **送礼排行** | 谁送礼最多 |
| **收礼排行** | 谁收礼最多 |
| **直播排行** | 直播收入排名 |
| **PK 排行** | PK 胜率排名 |
| **经纪排行** | 经纪公司业绩排名 |

### 12.2 奖励系统
```
ranking_rewards         - 排名奖励配置
leaderboard_reward_config - 奖励配置
leaderboard_reward_history - 奖励发放记录
distribute-leaderboard-rewards - 自动发放 Edge Function
```

---

## 👑 十三、VIP 会员系统

### 13.1 功能
| 功能 | 说明 |
|------|------|
| **VIP 页面** | VIP.tsx |
| **VIP 等级** | 多级VIP等级 |
| **VIP 特权** | 专属头像框、入场动画、优先匹配等 |
| **VIP 勋章** | AdminVIPMedals - VIP 专属勋章 |
| **订阅计划** | subscription_plans / subscription_orders |
| **贵族卡** | AdminNobleCards - 贵族卡系统 |

---

## 🛒 十四、商城系统 (Shop)

### 14.1 功能
| 功能 | 说明 |
|------|------|
| **商城页面** | Shop.tsx |
| **商品列表** | shop_items 表 |
| **头像框购买** | 用钻石/硬币购买 |
| **入场特效购买** | 各种特效 |
| **VIP 购买** | VIP 套餐 |

---

## ⚙️ 十五、管理后台 (Admin Panel)

### 15.1 管理模块（100+ 页面）

#### 用户管理
| 页面 | 说明 |
|------|------|
| AdminUsers | 用户列表和管理 |
| AdminUserManagement | 用户详细管理 |
| AdminHostApplications | 主播申请审核 |
| AdminHosts | 主播管理 |
| AdminHostSearch | 主播搜索 |
| AdminFaceVerification | 人脸验证审核 |
| AdminBlocked | 封禁管理 |
| AdminLiveBans | 直播封禁 |

#### 内容管理
| 页面 | 说明 |
|------|------|
| AdminGifts | 礼物管理 |
| AdminFrames | 头像框管理 |
| AdminEntryBanners | 入场横幅管理 |
| AdminEntryBars | 入场条管理 |
| AdminEntryNameBars | 入场名条管理 |
| AdminVehicleEntrances | 车辆入场管理 |
| AdminAnimationStore | 动画商城管理 |
| AdminShop | 商城管理 |
| AdminBanners | 首页横幅管理 |
| AdminReels | 短视频管理 |

#### 经纪公司管理
| 页面 | 说明 |
|------|------|
| AdminAgencies | 经纪公司列表 |
| AdminAgencyDetail | 公司详情 |
| AdminAgencyPolicy | 公司政策管理 |
| AdminCommissions | 佣金管理 |
| AdminTransferHistory | 转账历史 |
| AdminTransferScheduler | 定时转账 |
| AdminPayrollOrders | 工资单 |

#### 财务管理
| 页面 | 说明 |
|------|------|
| AdminFinance | 财务概览 |
| AdminCoins | 硬币管理 |
| AdminWithdrawals | 提现管理 |
| AdminManualTopup | 手动充值 |
| AdminPaymentGateways | 支付网关 |
| AdminBalanceDeduction | 余额扣除 |

#### 充值助手管理
| 页面 | 说明 |
|------|------|
| AdminHelperManagement | 助手管理 |
| AdminHelperApplications | 助手申请 |
| AdminHelperOrders | 助手订单 |
| AdminHelperRequests | 助手请求 |
| AdminHelperDiamondPricing | 钻石定价 |
| AdminLevel5Helpers | 高级助手 |
| AdminCoinTraders | 硬币交易商 |
| AdminTraderOrders | 交易商订单 |
| AdminTraderTransactions | 交易记录 |

#### 游戏管理
| 页面 | 说明 |
|------|------|
| AdminGameManagement | 游戏管理 |
| AdminGameSettings | 游戏设置 |
| AdminGameServer | 游戏服务器 |
| AdminGameProviders | 游戏供应商 |
| AdminGameLeaderboard | 游戏排行 |

#### 系统设置
| 页面 | 说明 |
|------|------|
| AdminSettings | 全局设置 |
| AdminAppVersion | 应用版本管理 |
| AdminBranding | 品牌设置 |
| AdminContent | 内容页管理 |
| AdminNotificationTemplates | 通知模板 |
| AdminPushBroadcast | 推送广播 |
| AdminNoticeBroadcast | 公告广播 |
| AdminSubAdmins | 子管理员管理 |
| AdminDeviceManagement | 设备管理 |
| AdminLevelManagement | 等级管理 |
| AdminLevelPrivileges | 等级特权配置 |
| AdminFeatureLevels | 功能等级要求 |
| AdminCallSettings | 通话设置 |
| AdminTasksSettings | 每日任务设置 |
| AdminErrorLogs | 错误日志 |
| AdminInvitationSettings | 邀请设置 |

#### VIP 管理
| 页面 | 说明 |
|------|------|
| AdminVIPManagement | VIP 管理 |
| AdminVIPMedals | VIP 勋章 |
| AdminVIPPrivileges | VIP 特权 |
| AdminRoleFrames | 角色框管理 |
| AdminNobleCards | 贵族卡管理 |

### 15.2 管理员安全
```
admin_users             - 管理员用户
admin_logs              - 操作日志
admin_sections          - 模块权限
admin_section_permissions - 模块权限分配
admin_allowed_devices   - 允许设备
admin_invitations       - 邀请码
admin_stats             - 统计数据
```

---

## 🔔 十六、通知系统

### 16.1 推送通知
| 功能 | 说明 |
|------|------|
| **FCM V1** | Firebase Cloud Messaging (HTTP v1 API) |
| **设备令牌** | device_tokens 表 |
| **通知模板** | notification_templates 表 |
| **全局推送** | send-push-notification Edge Function |
| **应用通知** | send-app-notification Edge Function |
| **管理广播** | AdminPushBroadcast |
| **来电推送** | 高优先级推送通知 (priority: high) |

### 16.2 应用内通知
```
notifications           - 应用内通知
admin_notices           - 管理公告
helper_notifications    - 助手通知
```

---

## 🎮 十七、游戏系统

### 17.1 游戏列表
| 游戏 | 说明 |
|------|------|
| **轮盘/转盘** | RoulettePage - 经典轮盘赌 |
| **摩天轮** | FerrisWheelPage - 幸运抽奖 |
| **Teen Patti** | TeenPattiPage - 三张牌 |
| **直播游戏** | LiveGameBoard - 直播间内嵌游戏 |

### 17.2 游戏架构
```
game_settings          - 游戏设置
game_sessions          - 游戏会话
game_players           - 游戏玩家
game_bets              - 下注记录
game_transactions      - 交易记录
game_stats             - 统计数据
game_rounds_stats      - 回合统计
game_providers         - 游戏供应商
provider_games         - 供应商游戏
game_server_settings   - 服务器设置
game_provider_logs     - 供应商日志
roulette_sessions      - 轮盘会话
roulette_bets          - 轮盘下注
```

---

## 📱 十八、原生 SDK 模块

### 18.1 自定义 SDK 列表
| SDK | 文件 | 说明 |
|-----|------|------|
| **Camera SDK** | NativeCameraSDK.ts | 原生相机访问（HD/SD 降级策略） |
| **Video Processing** | VideoProcessingSDK.ts | 视频压缩、裁剪、缩略图 |
| **ML/AI** | MLModelSDK.ts | 人脸检测、图像分类、AI 对话 |
| **Native UI** | NativeUISDK.ts | 触觉反馈、原生对话框、状态栏 |
| **Animation** | AnimationSDK.ts | 动画引擎、粒子系统、页面过渡 |
| **Play Billing** | PlayStoreBillingSDK.ts | Google Play 支付 |
| **Screen Security** | ScreenSecuritySDK.ts | 屏幕截图/录屏拦截 |

### 18.2 原生 UI 组件
```
HapticFeedback      - 触觉反馈 (轻/中/重)
NativeDialogs       - 原生对话框
StatusBarControl     - 状态栏控制
NativeToast         - 原生 Toast
SwipeGestureDetector - 手势检测
PullToRefresh       - 下拉刷新
KeyboardManager     - 键盘管理
NativeShare         - 原生分享
NativeClipboard     - 剪贴板
```

---

## 🌐 十九、Edge Functions (无服务器函数)

### 19.1 完整列表
| 函数名 | 说明 |
|--------|------|
| **agora-token** | 生成 Agora RTC 频道令牌 |
| **agora-cloud-recording** | 直播录制管理 |
| **live-stream** | 直播流管理 |
| **party-room** | 派对房间管理 |
| **gift-service** | 礼物发送服务 |
| **webrtc-signaling** | WebRTC 信令服务 |
| **presence** | 在线状态管理 |
| **r2-upload** | Cloudflare R2 大文件上传 |
| **r2-proxy** | R2 代理访问 |
| **ai-chat-reply** | AI 智能回复 |
| **translate** | 消息翻译 |
| **speech-to-text** | 语音转文字 |
| **detect-phone-number** | 检测违规手机号 |
| **admin-phone-alert** | 管理员电话警报 |
| **send-push-notification** | FCM 推送通知 |
| **send-app-notification** | 应用内通知 |
| **send-verification-email** | 发送验证邮件 |
| **send-signup-confirmation** | 注册确认邮件 |
| **send-password-otp** | 密码重置 OTP |
| **analyze-error** | 错误分析 |
| **create-sub-admin** | 创建子管理员 |
| **update-sub-admin** | 更新子管理员 |
| **create-sub-agency-browser** | 浏览器创建子代理 |
| **convert-anonymous-to-guest** | 匿名转访客 |
| **link-device-to-account** | 设备绑定 |
| **fetch-exchange-rates** | 获取汇率 |
| **game-auto-runner** | 游戏自动运行器 |
| **game-provider** | 游戏供应商接口 |
| **distribute-leaderboard-rewards** | 排行榜奖励分发 |
| **agency-weekly-transfer** | 经纪公司周结 |
| **support-chat** | 客服聊天 |

---

## 🔒 二十、安全系统

### 20.1 安全措施
| 功能 | 说明 |
|------|------|
| **FLAG_SECURE** | Android 全局屏幕安全，禁止截图/录屏 |
| **RLS 策略** | 所有表都有行级安全策略 |
| **单设备登录** | 同一账号只能一个设备在线 |
| **管理员设备绑定** | admin_allowed_devices |
| **IP 封禁** | blocked_ips 表 |
| **登录失败限制** | failed_login_attempts |
| **安全审计** | security_audit_log |
| **速率限制** | rate_limits 表 |
| **聊天审核** | 自动检测违规内容 |
| **直播审核** | 违规检测和封禁 |

---

## 📊 二十一、Realtime 实时系统

### 21.1 实时功能
| 功能 | 说明 |
|------|------|
| **直播聊天** | Supabase Realtime 订阅 |
| **房间消息** | 实时房间消息 |
| **在线状态** | usePresence / PresenceProvider |
| **通话信令** | useSignalingSocket - 通话信令 |
| **等级变化** | useRealtimeLevel - 实时等级更新 |
| **余额变化** | useUserBalance - 实时余额更新 |
| **排行榜** | useLeaderboardRealtime |
| **管理设置** | useAdminSettingsRealtime |
| **通用订阅** | useUniversalRealtime |

---

## 📁 二十二、存储架构

### 22.1 存储系统
| 系统 | 用途 | 大小限制 |
|------|------|----------|
| **Supabase Storage** | 小文件（图片、头像） | < 50MB |
| **Cloudflare R2** | 大文件（视频、SVGA） | < 150MB |
| **R2 上传** | useR2Upload Hook | 自动选择 |

### 22.2 存储桶
```
avatars              - 用户头像
gifts                - 礼物动画
avatar-frames        - 头像框
entry-banners        - 入场横幅
entry-name-bars      - 入场名条
vehicle-entrances    - 车辆入场
shop-items           - 商城物品
animations           - 动画资源
sounds               - 音效文件
reels                - 短视频
party-backgrounds    - 房间背景
banners              - 首页横幅
```

---

## 📱 二十三、移动端适配

### 23.1 移动优化
| 功能 | 说明 |
|------|------|
| **安全区域** | useMobileSafeAreaCSS - 安全区域适配 |
| **全屏高度** | useFullScreenHeight - 全屏高度计算 |
| **返回键** | useNativeBackButton / useAndroidBackButton |
| **双击退出** | 首页双击返回键退出应用 |
| **网络状态** | useNetworkStatus / NetworkStatusBar |
| **应用更新** | useAppUpdate - 应用版本检查 |
| **应用恢复** | useAppResumeHandler |
| **手势检测** | SwipeGestureDetector |
| **下拉刷新** | PullToRefresh |
| **键盘管理** | KeyboardManager |

### 23.2 Capacitor 插件
```
@capacitor/camera          - 相机
@capacitor/app             - 应用生命周期
@capacitor/browser         - 浏览器
@capacitor/clipboard       - 剪贴板
@capacitor/device          - 设备信息
@capacitor/dialog          - 对话框
@capacitor/geolocation     - 地理位置
@capacitor/haptics         - 触觉反馈
@capacitor/keyboard        - 键盘
@capacitor/network         - 网络状态
@capacitor/push-notifications - 推送通知
@capacitor/share           - 分享
@capacitor/splash-screen   - 启动画面
@capacitor/status-bar      - 状态栏
@capacitor/toast           - Toast
@capacitor/action-sheet    - 操作表
@capawesome/capacitor-app-update - 应用更新
@capacitor-firebase/authentication - Firebase 认证
```

---

## 📐 二十四、每日任务系统

### 24.1 任务功能
| 功能 | 说明 |
|------|------|
| **任务列表** | Tasks.tsx - 每日任务页面 |
| **任务类型** | 登录、送礼、直播、看直播等 |
| **任务奖励** | 硬币、金豆奖励 |
| **任务进度** | useTaskProgress - 实时进度跟踪 |
| **管理配置** | AdminTasksSettings - 管理员配置任务 |

---

## 🎫 二十五、邀请系统

### 25.1 功能
| 功能 | 说明 |
|------|------|
| **邀请页** | Invitation.tsx |
| **邀请设置** | invitation_settings 表 |
| **智能链接** | SmartLink.tsx - 动态链接 |
| **管理配置** | AdminInvitationSettings |

---

## 📡 二十六、客服/支持系统

### 26.1 功能
```
support_tickets          - 支持工单
support_messages         - 工单消息
support-chat             - Edge Function 客服聊天
AdminSupportTickets      - 管理员工单管理
```

---

## 🗄️ 二十七、完整数据库表清单（150+ 张表）

### 用户相关
```
profiles, followers, face_records, face_verification_submissions,
device_tokens, poster_images, failed_login_attempts, blocked_ips
```

### 直播相关
```
live_streams, stream_chat, stream_viewers, stream_recordings,
pk_battles, pk_battle_gifts, pk_competitions, pk_participants,
pk_competition_rewards, pk_reward_banners, pk_reward_history,
live_bans, live_violations, live_moderation_settings, categories
```

### 派对房间相关
```
party_rooms, party_room_participants, party_room_messages,
party_room_backgrounds, party_room_banners,
seat_invitations, seat_requests, room_welcome_messages
```

### 通话相关
```
private_calls, call_events, private_call_security_logs
```

### 聊天相关
```
conversations, messages, groups, group_members, group_messages,
chat_moderation_logs
```

### 经济/货币相关
```
coin_packages, coin_transfers, payment_transactions,
payment_gateways, payment_methods, recharge_transactions,
currency_rates
```

### 礼物相关
```
gifts, gift_transactions, gift_transaction_logs
```

### 经纪公司相关
```
agencies, agency_hosts, agency_level_tiers, agency_performance,
agency_rankings, agency_withdrawals, agency_commission_history,
agency_diamond_transactions, agency_earnings_transfers,
agency_policy_settings
```

### 子代理/助手相关
```
sub_agents, sub_agent_referrals, sub_agent_commissions,
topup_helpers, helper_applications, helper_orders,
helper_topup_requests, helper_transactions,
helper_withdrawal_requests, helper_level_config,
helper_diamond_packages, helper_assigned_countries,
helper_country_payment_methods, helper_admin_messages,
helper_message_replies, helper_notifications,
helper_upgrade_requests, helper_payment_methods
```

### 虚拟物品相关
```
avatar_frames, entry_banners, entry_name_bars,
shop_items, level_animations, role_frames,
leaderboard_podium_frames
```

### 游戏相关
```
game_settings, game_sessions, game_players, game_bets,
game_transactions, game_stats, game_rounds_stats,
game_providers, provider_games, game_server_settings,
game_provider_logs, live_game_bets, live_game_rounds,
roulette_sessions, roulette_bets
```

### 短视频相关
```
reels, reel_categories, reel_comments, reel_likes,
reel_shares, reel_reports
```

### VIP/会员相关
```
subscription_plans, subscription_orders
```

### 管理后台相关
```
admin_users, admin_logs, admin_sections,
admin_section_permissions, admin_allowed_devices,
admin_invitations, admin_stats, admin_notices,
admin_music_library, app_settings, app_content,
app_version_settings, branding_settings, site_settings
```

### 排行榜/奖励相关
```
ranking_rewards, leaderboard_reward_config,
leaderboard_reward_history
```

### 通知相关
```
notifications, notification_templates, device_tokens
```

### 等级/特权相关
```
feature_level_requirements, level_privileges, level_animations
```

### 其他
```
banners, channels, entertainment, movies, music,
news, news_sources, sports, iptv_sources, kids_content,
daily_tasks, invitation_settings, payroll_requests,
support_tickets, support_messages, security_audit_log,
rate_limits, system_error_logs
```

---

## 🔧 二十八、开发环境配置

### 28.1 Android 构建环境
```
AGP:         8.9.1
Gradle:      8.14.3
Java:        17
Min SDK:     22
Target SDK:  34
Compile SDK: 34
```

### 28.2 关键依赖版本
```
React:        18.3.1
TypeScript:   (最新)
Capacitor:    8.0.1
Supabase JS:  2.90.1
Framer Motion: 12.26.2
TanStack Query: 5.83.0
React Router:  6.30.1
Firebase:      12.8.0
Three.js:      0.160.1
```

---

## 📋 二十九、开发者注意事项

### 29.1 安全注意
1. **FLAG_SECURE** - 全局屏幕安全策略，禁止截图和录屏
2. **单设备登录** - 同一账号不能在多个设备同时登录
3. **RLS** - 所有表都必须有行级安全策略
4. **管理员设备** - 管理员只能从白名单设备登录

### 29.2 性能优化
1. **SVGA 全局缓存** - 防止动画闪烁
2. **CSS 动画优先** - 高性能滚动优先用 CSS
3. **相机降级** - HD → SD 降级策略
4. **图片懒加载** - 所有列表图片懒加载
5. **React Query** - 数据缓存和预取

### 29.3 构建注意
1. 依赖安装使用 `npm install --legacy-peer-deps`
2. 需要 `google-services.json` 放在 `android/app/`
3. ProGuard 配置保护 Capacitor 和 Play Billing
4. 排除 `capacitor-purchases` 和 `codetrix-studio-capacitor-google-auth`

---

## 📊 三十、功能统计摘要

| 类别 | 数量 |
|------|------|
| **数据库表** | 150+ |
| **Edge Functions** | 30+ |
| **管理后台页面** | 100+ |
| **自定义 Hooks** | 60+ |
| **SDK 模块** | 7 |
| **Capacitor 插件** | 16 |
| **Android 原生类** | 7 |
| **存储桶** | 12+ |
| **游戏类型** | 3 (轮盘、摩天轮、Teen Patti) |
| **动画格式** | 4 (SVGA、Lottie、VAP/MP4、WebP) |
| **支付方式** | Google Play Billing + 本地支付网关 |
| **通知类型** | FCM 推送 + 应用内通知 |
| **认证方式** | 邮箱 + Google + 手机号 + 访客 |

---

**文档版本：** 1.0  
**更新日期：** 2026-02-08  
**应用版本：** com.merilive.app  
**联系方式：** [项目负责人联系方式]
