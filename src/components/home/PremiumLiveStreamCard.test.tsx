import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { PremiumLiveStreamCard } from "./PremiumLiveStreamCard";

// Mock heavy children so the test stays focused on the cover/avatar fallback contract.
vi.mock("@/components/common/AvatarWithFrame", () => ({
  default: ({ src, name }: { src?: string; name: string }) => (
    <img data-testid="avatar-with-frame" src={src} alt={name} />
  ),
}));
vi.mock("@/components/common/LevelBadge", () => ({
  LevelBadge: () => <span data-testid="level-badge" />,
}));
vi.mock("@/utils/enhanceThumbnail", () => ({
  enhanceThumbnail: (url: string) => `enhanced:${url}`,
}));
vi.mock("@/utils/placeholderAvatar", () => ({
  getDisplayAvatar: (_id: string, avatar: string | null) =>
    avatar || "https://placeholder.example/avatar.jpg",
}));

const AVATAR = "https://cdn.example/avatar.jpg";
const THUMB = "https://cdn.example/live-thumb.jpg";

describe("PremiumLiveStreamCard cover/avatar visibility", () => {
  it("uses the live thumbnail when host is streaming", () => {
    render(
      <PremiumLiveStreamCard
        id="s1"
        hostId="h1"
        hostName="Kylie"
        hostAvatar={AVATAR}
        thumbnailUrl={THUMB}
        viewerCount={10}
        country="Rwanda"
        countryFlag="🇷🇼"
        isOnline
      />
    );
    const cover = document.querySelector("img.object-cover") as HTMLImageElement;
    expect(cover.src).toContain(THUMB);
  });

  it("falls back to host avatar when no live thumbnail is provided", () => {
    render(
      <PremiumLiveStreamCard
        id="s2"
        hostId="h2"
        hostName="Rain"
        hostAvatar={AVATAR}
        thumbnailUrl=""
        viewerCount={0}
        country="Rwanda"
        countryFlag="🇷🇼"
        isOnline={false}
      />
    );
    const cover = document.querySelector("img.object-cover") as HTMLImageElement;
    expect(cover.src).toBe(AVATAR);
  });

  it("falls back to host avatar when thumbnail equals the empty placeholder", () => {
    render(
      <PremiumLiveStreamCard
        id="s3"
        hostId="h3"
        hostName="Delyn"
        hostAvatar={AVATAR}
        thumbnailUrl="/placeholder.svg"
        viewerCount={0}
        country="Rwanda"
        countryFlag="🇷🇼"
      />
    );
    const cover = document.querySelector("img.object-cover") as HTMLImageElement;
    expect(cover.src).toBe(AVATAR);
  });

  it("uses the stable placeholder when both thumbnail and avatar are missing", () => {
    render(
      <PremiumLiveStreamCard
        id="s4"
        hostId="h4"
        hostName="Ghost"
        hostAvatar=""
        thumbnailUrl=""
        viewerCount={0}
        country="—"
        countryFlag="🏳️"
        isOnline={false}
      />
    );
    const cover = document.querySelector("img.object-cover") as HTMLImageElement;
    expect(cover.src).toContain("placeholder.example/avatar.jpg");
  });
});
