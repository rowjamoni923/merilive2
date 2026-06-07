/**
 * Helpers for compositing user avatar + name + level INSIDE an SVGA
 * animation via the SVGAPlayer-Web setImage / setText API.
 *
 * Industry pattern (Chamet / BIGO / MICO / TikTok-Live):
 * - SVGA designer authors the .svga template with placeholder ImageKeys.
 * - Client calls `player.setImage(url, 'avatar')` and `player.setText(...)`
 *   BEFORE `player.startAnimation()`.
 * - SVGA player then composites them per-frame INSIDE the timeline — the
 *   avatar moves / scales / rotates exactly with the animation.
 *
 * Why not pass the raw avatar URL?
 * Most SVGA flying name-bar templates use a SQUARE slot for the avatar.
 * If we pass a square photo it shows as a square. Professional apps
 * pre-rasterize the avatar to a circular PNG (matching the frame ring)
 * before injecting. This helper does exactly that.
 */

const CACHE = new Map<string, string>();

/**
 * Rasterize an image URL into a circular PNG dataURL of `size` px.
 * Returns the dataURL (or the original URL on failure so SVGA still gets
 * *something* to render).
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

    // Circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    // Cover-style draw (no distortion)
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

/**
 * Industry-standard ImageKey aliases used by Chinese live-streaming SVGA
 * templates. We `setImage` for every alias so the same code works across
 * templates from different designers without per-asset metadata.
 */
export const AVATAR_KEY_ALIASES = [
  'avatar', 'head', 'pic', 'photo', 'user_avatar', 'userAvatar',
  '头像', '用户头像', 'touxiang',
];

export const FRAME_KEY_ALIASES = [
  'frame', 'avatar_frame', 'avatarFrame', '头像框', 'kuang',
];

export const NAME_KEY_ALIASES = [
  'name', 'nickname', 'username', 'user_name', 'userName',
  '昵称', '用户名', 'nicheng',
];

export const LEVEL_KEY_ALIASES = [
  'level', 'lv', 'user_level', 'userLevel', '等级', 'dengji',
];

/**
 * Apply dynamic images to an SVGA player, trying every key alias so the
 * same call works regardless of how the designer named the slot.
 * Safe no-op when the key isn't present in the SVGA file.
 */
export function applyDynamicImage(
  player: any,
  url: string | undefined | null,
  aliases: string[],
): void {
  if (!player || !url) return;
  for (const key of aliases) {
    try {
      player.setImage(url, key);
    } catch {
      /* ignore — key not in template */
    }
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
  aliases: string[],
): void {
  if (!player || !text?.text) return;
  const payload = {
    text: text.text,
    family: text.family ?? 'Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
    size: text.size ?? '28px',
    color: text.color ?? '#ffffff',
    offset: text.offset ?? { x: 0, y: 0 },
  };
  for (const key of aliases) {
    try {
      player.setText(payload, key);
    } catch {
      /* ignore — key not in template */
    }
  }
}
