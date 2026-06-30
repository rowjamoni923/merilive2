/**
 * Auto-compositing helpers for SVGA flying name-bar / entry templates.
 *
 * Industry parity (Chamet / BIGO / MICO / TikTok-Live):
 * - SVGA designer authors the .svga with placeholder ImageKeys (avatar,
 *   frame, name, level, or any localized / custom equivalent).
 * - Client injects the live user's avatar / frame / name / level into
 *   those slots BEFORE startAnimation so they move per-frame inside the
 *   timeline (NOT a static HTML overlay).
 *
 * Goal of this module: "Admin uploads ANY SVGA → it just works."
 *   We DO NOT require the designer to use one specific key name. We scan
 *   the actual videoItem's image map at runtime and match keys by
 *   pattern (alias list + case-insensitive substring + CJK equivalents).
 *   Anything we can't classify is left untouched.
 */

const CACHE = new Map<string, string>();

const TRANSPARENT_PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAEklEQVR42mP8z8BQDwAEhQGA60e6kgAAAABJRU5ErkJggg==';

/* -------------------------------------------------------------------------- */
/*  Avatar circularization                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Rasterize an image URL into a circular PNG dataURL of `size` px.
 * Professional apps composite a circular avatar into the frame slot —
 * passing a raw square photo produces a square avatar inside a round
 * frame. Falls back to the original URL on any failure.
 */
export async function circularizeAvatar(
  url: string,
  size: number = 192,
): Promise<string> {
  if (!url) return url;
  const cacheKey = `${size}|${url}`;
  const cached = CACHE.get(cacheKey);
  if (cached) return cached;

  try {
    const img = await loadImage(url);
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return url;

    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const ratio = Math.max(size / img.width, size / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;
    const x = (size - w) / 2;
    const y = (size - h) / 2;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();

    const dataUrl = canvas.toDataURL('image/png');
    CACHE.set(cacheKey, dataUrl);
    return dataUrl;
  } catch {
    return url;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/* -------------------------------------------------------------------------- */
/*  Slot classification                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Keyword groups for each slot type. We match an SVGA image-key against
 * these by lowercasing both sides and asking "does the key contain any
 * of these substrings?". This catches `avatar`, `Avatar`, `userAvatar`,
 * `user_avatar_1`, `头像`, `touxiang`, etc. without per-designer config.
 */
const AVATAR_KEYWORDS = [
  'avatar', 'head', 'photo', 'pic', 'portrait', 'user_img', 'userimg',
  '头像', '用户头像', 'touxiang', 'tx',
];
const FRAME_KEYWORDS = [
  'frame', 'border', 'ring', 'kuang', '头像框', 'avatarframe', 'avatar_frame',
];
const NAME_KEYWORDS = [
  'name', 'nick', 'username', 'user_name', '昵称', '用户名', 'nicheng',
];
const LEVEL_KEYWORDS = [
  'level', 'lv', 'grade', 'rank', '等级', 'dengji',
];

export type SlotKind = 'avatar' | 'frame' | 'name' | 'level';

function matchKeyword(key: string, keywords: string[]): boolean {
  const k = key.toLowerCase();
  return keywords.some(w => k.includes(w.toLowerCase()));
}

/**
 * Classify a single SVGA image-key into a slot kind, or `null` if it
 * doesn't look like a user-data slot (background art, particles, etc.).
 * Priority order matters: `frame` BEFORE `avatar` so `avatar_frame` is
 * classified as a frame, not an avatar.
 */
export function classifySlotKey(key: string): SlotKind | null {
  if (!key) return null;
  if (matchKeyword(key, FRAME_KEYWORDS)) return 'frame';
  if (matchKeyword(key, AVATAR_KEYWORDS)) return 'avatar';
  if (matchKeyword(key, LEVEL_KEYWORDS)) return 'level';
  if (matchKeyword(key, NAME_KEYWORDS)) return 'name';
  return null;
}

/**
 * Scan a parsed SVGA `videoItem` and return the set of keys per slot.
 * SVGA-Player-Web exposes images as `videoItem.images` (a map of
 * `key -> base64 / Uint8Array`). We classify each key once and group.
 */
export interface DiscoveredSlots {
  avatar: string[];
  frame: string[];
  name: string[];
  level: string[];
  all: string[];
}

export function discoverSlots(videoItem: any): DiscoveredSlots {
  const out: DiscoveredSlots = { avatar: [], frame: [], name: [], level: [], all: [] };
  const images = videoItem?.images;
  if (!images || typeof images !== 'object') return out;
  for (const key of Object.keys(images)) {
    out.all.push(key);
    const kind = classifySlotKey(key);
    if (kind) out[kind].push(key);
  }

  // Many professional entry-name-bar SVGA files exported from AE/Lottie do not
  // keep semantic keys like `avatar` / `name`. The current Meri name-bar assets
  // are exactly like that: the user-data placeholders are numeric keys
  // (`01`, `03`, `04`) and the decorative layers are generic `img_****` keys.
  // If we only scan by name, injection silently does nothing and the app falls
  // back to a static HTML overlay, which is why the avatar/name looked detached
  // and oversized. Geometry fallback below discovers those placeholder slots
  // from their authored canvas position and lets SVGAPlayer draw the user's
  // identity INSIDE the timeline.
  mergeGeometricEntryNameBarSlots(videoItem, out);

  return out;
}

interface SpriteSlotCandidate {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
}

const uniquePush = (arr: string[], key?: string | null) => {
  if (key && !arr.includes(key)) arr.push(key);
};

const toNumber = (value: unknown, fallback = 0): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const firstVisibleFrame = (sprite: any) => {
  const frames = Array.isArray(sprite?.frames) ? sprite.frames : [];
  return (
    frames.find((f: any) => f?.layout && toNumber(f?.alpha, 1) > 0.05 && f?.transform) ||
    frames.find((f: any) => f?.layout && f?.transform) ||
    frames.find((f: any) => f?.layout)
  );
};

const isSimpleNumberKey = (key: string, n?: number) => {
  const normalized = key.trim();
  if (!/^\d+$/.test(normalized)) return false;
  if (typeof n !== 'number') return true;
  return Number(normalized) === n;
};

function collectSpriteCandidates(videoItem: any): SpriteSlotCandidate[] {
  const sprites = Array.isArray(videoItem?.sprites) ? videoItem.sprites : [];
  const seen = new Map<string, SpriteSlotCandidate>();
  sprites.forEach((sprite: any, index: number) => {
    const key = String(sprite?.imageKey || '').replace(/\.matte$/i, '');
    if (!key || seen.has(key)) return;
    const frame = firstVisibleFrame(sprite);
    if (!frame?.layout) return;
    const layout = frame.layout;
    const transform = frame.transform || {};
    const candidate: SpriteSlotCandidate = {
      key,
      x: toNumber(transform.tx, toNumber(layout.x)),
      y: toNumber(transform.ty, toNumber(layout.y)),
      width: Math.max(0, toNumber(layout.width)),
      height: Math.max(0, toNumber(layout.height)),
      index,
    };
    if (candidate.width > 0 && candidate.height > 0) seen.set(key, candidate);
  });
  return Array.from(seen.values());
}

function mergeGeometricEntryNameBarSlots(videoItem: any, out: DiscoveredSlots): void {
  const candidates = collectSpriteCandidates(videoItem);
  if (!candidates.length) return;

  const videoWidth = toNumber(videoItem?.videoSize?.width, toNumber(videoItem?.movieParams?.viewBoxWidth));
  const videoHeight = toNumber(videoItem?.videoSize?.height, toNumber(videoItem?.movieParams?.viewBoxHeight));
  if (!videoWidth || !videoHeight) return;

  // Numeric placeholders are the safest signal for the Meri/professional
  // templates currently in production: 01=name, 03=avatar, 04=level badge.
  const numericName = candidates.find(c => isSimpleNumberKey(c.key, 1));
  const numericAvatar = candidates.find(c => isSimpleNumberKey(c.key, 3));
  const numericLevel = candidates.find(c => isSimpleNumberKey(c.key, 4));
  uniquePush(out.name, numericName?.key);
  uniquePush(out.avatar, numericAvatar?.key);
  uniquePush(out.level, numericLevel?.key);

  // If a designer exported with different generic names, infer the same slots
  // from the common entry-bar layout: avatar left-middle, user name to the
  // right, and a small level badge near the avatar/name seam.
  const vw = videoWidth;
  const vh = videoHeight;
  const squareish = candidates.filter(c => {
    const ratio = c.width / c.height;
    return ratio > 0.72 && ratio < 1.35 && c.width >= vw * 0.04 && c.width <= vw * 0.18;
  });
  const wideText = candidates.filter(c => {
    const ratio = c.width / c.height;
    return ratio >= 3.5 && c.height >= vh * 0.08 && c.height <= vh * 0.24 && c.width >= vw * 0.16;
  });
  const badgeLike = candidates.filter(c => {
    const ratio = c.width / c.height;
    return ratio >= 1.25 && ratio <= 3.2 && c.height >= vh * 0.06 && c.height <= vh * 0.20;
  });

  if (!out.avatar.length) {
    const avatar = squareish
      .filter(c => c.x >= -vw * 0.02 && c.x <= vw * 0.22 && c.y >= vh * 0.25 && c.y <= vh * 0.70)
      // Prefer non `img_` placeholders if available; generic `img_` layers are
      // often decorative avatar frames and should remain intact.
      .sort((a, b) => Number(a.key.startsWith('img_')) - Number(b.key.startsWith('img_')) || a.x - b.x)[0];
    uniquePush(out.avatar, avatar?.key);
  }

  if (!out.name.length) {
    const name = wideText
      .filter(c => c.x >= vw * 0.10 && c.x <= vw * 0.45 && c.y >= vh * 0.25 && c.y <= vh * 0.65)
      .sort((a, b) => a.y - b.y || a.x - b.x)[0];
    uniquePush(out.name, name?.key);
  }

  if (!out.level.length) {
    const level = badgeLike
      .filter(c => c.x >= vw * 0.08 && c.x <= vw * 0.32 && c.y >= vh * 0.25 && c.y <= vh * 0.65)
      .sort((a, b) => (a.width * a.height) - (b.width * b.height))[0];
    uniquePush(out.level, level?.key);
  }
}

/* -------------------------------------------------------------------------- */
/*  Injection                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Inject an image URL into every key the player exposes that matches the
 * given slot kind. If `discovered` is provided we use the runtime-scanned
 * key list (preferred — works with ANY admin-uploaded SVGA). Otherwise we
 * fall back to a generic alias list (covers common templates).
 */
export function applyDynamicImage(
  player: any,
  url: string | undefined | null,
  kind: SlotKind,
  discovered?: DiscoveredSlots,
): void {
  if (!player || !url) return;
  const keys = discovered?.[kind]?.length
    ? discovered[kind]
    : FALLBACK_KEYS[kind];
  for (const key of keys) {
    try { player.setImage(url, key); } catch { /* slot not present — ignore */ }
  }
}

export interface SVGAText {
  text: string;
  family?: string;
  size?: string;
  color?: string;
  offset?: { x: number; y: number };
}

export function applyDynamicText(
  player: any,
  text: SVGAText | undefined | null,
  kind: 'name' | 'level',
  discovered?: DiscoveredSlots,
): void {
  if (!player || !text?.text) return;
  const payload = {
    text: text.text,
    family: text.family ?? 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
    size: text.size ?? '28px',
    color: text.color ?? '#ffffff',
    offset: text.offset ?? { x: 0, y: 0 },
  };
  const keys = discovered?.[kind]?.length
    ? discovered[kind]
    : FALLBACK_KEYS[kind];
  for (const key of keys) {
    // Designer placeholders often contain demo text/level art. Clear the
    // placeholder bitmap first, then draw the live text in the exact same
    // timeline slot so the identity is genuinely embedded in the SVGA frame.
    try { player.setImage(TRANSPARENT_PIXEL, key); } catch { /* ignore */ }
    try { player.setText(payload, key); } catch { /* ignore */ }
  }
}

/**
 * Generic alias list — used only when runtime discovery returned nothing
 * for a slot (e.g. designer used an unusual key OR videoItem.images isn't
 * iterable in the current SVGA build).
 */
const FALLBACK_KEYS: Record<SlotKind, string[]> = {
  avatar: [
    'avatar', 'Avatar', 'head', 'photo', 'pic', 'user_avatar', 'userAvatar',
    '头像', '用户头像', 'touxiang',
  ],
  frame: [
    'frame', 'Frame', 'avatar_frame', 'avatarFrame', '头像框', 'kuang',
  ],
  name: [
    'name', 'Name', 'nickname', 'nickName', 'username', 'userName',
    '昵称', '用户名', 'nicheng',
  ],
  level: [
    'level', 'Level', 'lv', 'Lv', 'user_level', 'userLevel', '等级', 'dengji',
  ],
};

/* -------------------------------------------------------------------------- */
/*  Back-compat exports (kept so existing imports compile)                    */
/* -------------------------------------------------------------------------- */
export const AVATAR_KEY_ALIASES = FALLBACK_KEYS.avatar;
export const FRAME_KEY_ALIASES = FALLBACK_KEYS.frame;
export const NAME_KEY_ALIASES = FALLBACK_KEYS.name;
export const LEVEL_KEY_ALIASES = FALLBACK_KEYS.level;
