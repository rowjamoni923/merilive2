/**
 * Global media `src` auto-normalizer.
 *
 * Runs ONCE at app boot and patches the `src` setter on
 * HTMLImageElement / HTMLVideoElement / HTMLSourceElement so any raw
 * Supabase storage path (e.g. `avatars/foo.jpg`, `/storage/v1/object/...`)
 * assigned anywhere in the app — even by third-party libraries, dynamic
 * inline code, or 200+ legacy `<img src={dbField}>` tags we don't own —
 * is rewritten into a fully-qualified public URL before the browser
 * issues the request.
 *
 * This guarantees that no photo / video / poster ever 404s because the
 * DB returned a raw path instead of an absolute URL — without having to
 * touch every single `<img>` / `<video>` site in the codebase.
 *
 * Safe properties:
 *  - Idempotent: `normalizePublicMediaUrl` returns the input unchanged
 *    for `blob:`, `data:`, already-absolute non-Supabase URLs, and
 *    `/storage/...` URLs that don't match a known public bucket.
 *  - Same string in → same string out, so React's reconciliation and
 *    HTML attribute round-tripping are unaffected.
 *  - Only patches once; safe under HMR re-imports.
 */
import { normalizePublicMediaUrl } from "@/lib/cdnImage";

const INSTALLED_FLAG = "__lovableMediaSrcNormalizerInstalled__";

function findSrcDescriptor(proto: object | null): {
  proto: object;
  desc: PropertyDescriptor;
} | null {
  let cur: object | null = proto;
  while (cur) {
    const d = Object.getOwnPropertyDescriptor(cur, "src");
    if (d && d.set && d.get && d.configurable) return { proto: cur, desc: d };
    cur = Object.getPrototypeOf(cur);
  }
  return null;
}

function patchSrcDescriptor(
  Ctor:
    | typeof HTMLImageElement
    | typeof HTMLVideoElement
    | typeof HTMLAudioElement
    | typeof HTMLSourceElement,
  defaultBucket: string,
) {
  const proto = Ctor?.prototype;
  if (!proto) return;
  // `src` may be defined on a parent prototype (HTMLMediaElement for video/audio).
  // Walk the chain and re-define directly on the concrete prototype so we don't
  // accidentally also intercept assignments on unrelated <audio>/<source> uses.
  const found = findSrcDescriptor(proto);
  if (!found) return;
  const { desc } = found;

  Object.defineProperty(proto, "src", {
    configurable: true,
    enumerable: desc.enumerable,
    get(this: HTMLElement) {
      return desc.get!.call(this);
    },
    set(this: HTMLElement, value: unknown) {
      try {
        if (typeof value === "string" && value.length > 0) {
          const normalized = normalizePublicMediaUrl(value, defaultBucket);
          if (normalized && normalized !== value) {
            desc.set!.call(this, normalized);
            return;
          }
        }
      } catch {
        /* fall through to original setter */
      }
      desc.set!.call(this, value as string);
    },
  });
}

function patchSetAttribute() {
  // Some libraries (SVGA loader, video.js shims, etc.) call setAttribute('src', …)
  // which bypasses the prototype getter/setter above on certain browsers.
  const orig = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function patchedSetAttribute(
    this: Element,
    name: string,
    value: string,
  ) {
    if (
      typeof value === "string" &&
      value.length > 0 &&
      (name === "src" || name === "poster") &&
      (this instanceof HTMLImageElement ||
        this instanceof HTMLVideoElement ||
        this instanceof HTMLSourceElement)
    ) {
      try {
        const bucket =
          this instanceof HTMLVideoElement || this instanceof HTMLSourceElement
            ? "content-media"
            : "avatars";
        const normalized = normalizePublicMediaUrl(value, bucket);
        if (normalized && normalized !== value) {
          return orig.call(this, name, normalized);
        }
      } catch {
        /* fall through */
      }
    }
    return orig.call(this, name, value);
  };
}

export function installGlobalMediaSrcNormalizer(): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as Record<string, unknown>;
  if (w[INSTALLED_FLAG]) return;
  w[INSTALLED_FLAG] = true;

  try {
    patchSrcDescriptor(HTMLImageElement, "avatars");
    patchSrcDescriptor(HTMLVideoElement, "content-media");
    patchSrcDescriptor(HTMLSourceElement, "content-media");
    patchSetAttribute();
  } catch (err) {
    // Never let a normalizer issue crash the app — fall back to raw URLs.
    // eslint-disable-next-line no-console
    console.warn("[mediaSrcNormalizer] install failed; raw URLs will be used", err);
  }
}
