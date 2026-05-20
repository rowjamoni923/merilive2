/**
 * End-to-end placeholder avatar guard.
 *
 * Two layers:
 *  1. CONTRACT — `getDisplayAvatar` / `getPlaceholderAvatar` behave correctly:
 *     gender-matched style, deterministic per profile id, unique across ids,
 *     owner sees blank, real avatar URL passes through unchanged.
 *
 *  2. SURFACE AUDIT — every viewer-facing surface listed by the user
 *     (chat, leaderboard, live stream viewer, party room, profile detail)
 *     renders avatars through `AvatarWithFrame` / `FramedAvatarWithPrivileges`,
 *     which are the ONLY two components allowed to resolve avatars and both
 *     internally call `getDisplayAvatar` with the resolved gender. If a surface
 *     ever stops importing the wrapper, this test fails — preventing silent
 *     regressions where someone hard-codes an `<img src={p.avatar_url}>`.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  getDisplayAvatar,
  getPlaceholderAvatar,
} from "@/utils/placeholderAvatar";

const FEMALE_ID = "00000000-0000-0000-0000-0000000000f1";
const MALE_ID = "00000000-0000-0000-0000-0000000000a1";
const OTHER_ID = "00000000-0000-0000-0000-0000000000b2";

describe("placeholderAvatar — contract", () => {
  it("returns a data: SVG URI for both genders", () => {
    const f = getPlaceholderAvatar(FEMALE_ID, "female");
    const m = getPlaceholderAvatar(MALE_ID, "male");
    expect(f.startsWith("data:image/svg+xml")).toBe(true);
    expect(m.startsWith("data:image/svg+xml")).toBe(true);
  });

  it("uses different visual styles for female vs male (lorelei vs notionists)", () => {
    // Same seed, different gender → different SVG (different style entirely)
    const f = getPlaceholderAvatar(FEMALE_ID, "female");
    const m = getPlaceholderAvatar(FEMALE_ID, "male");
    expect(f).not.toEqual(m);
  });

  it("is deterministic — same id+gender always yields the same SVG", () => {
    const a = getPlaceholderAvatar(FEMALE_ID, "female");
    const b = getPlaceholderAvatar(FEMALE_ID, "female");
    expect(a).toEqual(b);
  });

  it("is unique — different profile ids yield different SVGs", () => {
    const a = getPlaceholderAvatar(FEMALE_ID, "female");
    const b = getPlaceholderAvatar(OTHER_ID, "female");
    expect(a).not.toEqual(b);
  });

  it("defaults to female style when gender is null/undefined (host default)", () => {
    const def = getPlaceholderAvatar(FEMALE_ID, undefined);
    const female = getPlaceholderAvatar(FEMALE_ID, "female");
    expect(def).toEqual(female);
  });

  it("getDisplayAvatar passes a real avatar URL straight through", () => {
    const real = "https://cdn.example.com/u/abc.jpg";
    expect(getDisplayAvatar(FEMALE_ID, real, { gender: "female" })).toBe(real);
    expect(getDisplayAvatar(FEMALE_ID, real, { isOwner: true })).toBe(real);
  });

  it("owner with no avatar sees empty string (real blank state, not placeholder)", () => {
    expect(getDisplayAvatar(FEMALE_ID, null, { isOwner: true })).toBe("");
    expect(getDisplayAvatar(MALE_ID, "", { isOwner: true, gender: "male" })).toBe("");
  });

  it("non-owner with no avatar sees a gender-matched placeholder", () => {
    const female = getDisplayAvatar(FEMALE_ID, null, { gender: "female" });
    const male = getDisplayAvatar(MALE_ID, null, { gender: "male" });
    expect(female).toEqual(getPlaceholderAvatar(FEMALE_ID, "female"));
    expect(male).toEqual(getPlaceholderAvatar(MALE_ID, "male"));
    expect(female).not.toEqual(male);
  });
});

describe("placeholderAvatar — surface audit", () => {
  // Every surface listed by the user must render avatars through one of the
  // two approved wrappers, both of which internally call getDisplayAvatar.
  const APPROVED_WRAPPERS = ["AvatarWithFrame", "FramedAvatarWithPrivileges"];

  const SURFACES: { name: string; path: string }[] = [
    { name: "Chat / messages", path: "src/pages/Chat.tsx" },
    { name: "Leaderboard", path: "src/pages/Leaderboard.tsx" },
    { name: "Live stream viewer", path: "src/pages/LiveStream.tsx" },
    { name: "Party room page", path: "src/pages/PartyRoom.tsx" },
    { name: "Unified party room UI", path: "src/components/party/UnifiedPartyRoom.tsx" },
    { name: "Profile detail", path: "src/pages/ProfileDetail.tsx" },
  ];

  it.each(SURFACES)(
    "$name renders avatars via an approved wrapper",
    ({ path }) => {
      const abs = resolve(__dirname, "../..", path);
      expect(existsSync(abs), `${path} not found`).toBe(true);
      const src = readFileSync(abs, "utf8");
      const usesWrapper = APPROVED_WRAPPERS.some((w) =>
        new RegExp(`\\b${w}\\b`).test(src),
      );
      expect(
        usesWrapper,
        `${path} must import AvatarWithFrame or FramedAvatarWithPrivileges so the gender-matched placeholder is applied automatically`,
      ).toBe(true);
    },
  );

  it("approved wrappers themselves call getDisplayAvatar with a resolved gender", () => {
    for (const wrapper of [
      "src/components/common/AvatarWithFrame.tsx",
      "src/components/common/FramedAvatarWithPrivileges.tsx",
    ]) {
      const abs = resolve(__dirname, "../..", wrapper);
      const src = readFileSync(abs, "utf8");
      expect(src).toMatch(/getDisplayAvatar\s*\(/);
      // Must forward a gender — never call without it (would always default female).
      expect(src).toMatch(/gender:\s*[^}\n]+/);
    }
  });
});
