import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  Img,
  staticFile,
  spring,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Poppins";

const { fontFamily } = loadFont("normal", {
  weights: ["500", "600", "700", "800"],
  subsets: ["latin"],
});

// Total photos available (1..63)
const TOTAL_PHOTOS = 63;
const photoFile = (n: number) =>
  staticFile(`photos/model-${String(n).padStart(2, "0")}.jpg`);

// Build 3 columns of photos with different orderings so columns look distinct
const buildColumn = (offset: number, count: number) =>
  Array.from({ length: count }, (_, i) => ((i * 3 + offset) % TOTAL_PHOTOS) + 1);

const COLUMN_COUNT = 8; // photos per column (loop seamlessly)
const COLS = [
  buildColumn(0, COLUMN_COUNT),
  buildColumn(1, COLUMN_COUNT),
  buildColumn(2, COLUMN_COUNT),
];

// Each card dimensions (in design pixels for a 1080×1920 canvas)
const CARD_W = 320;
const CARD_H = 420;
const GAP = 16;
const COL_HEIGHT = COLUMN_COUNT * (CARD_H + GAP); // 8 * 436 = 3488

interface ColumnProps {
  photos: number[];
  speedPxPerSec: number;
  direction: "up" | "down";
  startOffset: number;
  fps: number;
  frame: number;
}

const PhotoColumn: React.FC<ColumnProps> = ({
  photos,
  speedPxPerSec,
  direction,
  startOffset,
  fps,
  frame,
}) => {
  // Distance traveled in pixels
  const distance = (frame / fps) * speedPxPerSec + startOffset;
  // Loop using modulo so the column scrolls infinitely
  const loopY = ((distance % COL_HEIGHT) + COL_HEIGHT) % COL_HEIGHT;
  const translateY = direction === "up" ? -loopY : loopY - COL_HEIGHT;

  // Render the photos twice so the loop is seamless
  const doubled = [...photos, ...photos];

  return (
    <div
      style={{
        width: CARD_W,
        height: COL_HEIGHT * 2,
        position: "relative",
        transform: `translateY(${translateY}px)`,
        willChange: "transform",
      }}
    >
      {doubled.map((n, idx) => (
        <div
          key={`${n}-${idx}`}
          style={{
            position: "absolute",
            top: idx * (CARD_H + GAP),
            left: 0,
            width: CARD_W,
            height: CARD_H,
            borderRadius: 28,
            overflow: "hidden",
            boxShadow:
              "0 20px 50px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06)",
          }}
        >
          <Img
            src={photoFile(n)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
          {/* Subtle gradient overlay at bottom */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              height: "40%",
              background:
                "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 100%)",
            }}
          />
          {/* Live badge on every 3rd card */}
          {idx % 3 === 0 && (
            <div
              style={{
                position: "absolute",
                top: 14,
                left: 14,
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                borderRadius: 999,
                background: "linear-gradient(135deg, #ff2d6f, #ff6a3d)",
                color: "white",
                fontFamily,
                fontWeight: 700,
                fontSize: 14,
                letterSpacing: 0.5,
                boxShadow: "0 6px 18px rgba(255,45,111,0.5)",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: "white",
                }}
              />
              LIVE
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export const ScrollingCollage: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Slow ambient zoom on the whole collage for cinematic feel
  const zoom = interpolate(frame, [0, durationInFrames], [1.0, 1.04]);

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 30% 20%, #2a0b3a 0%, #0a0a18 60%, #050510 100%)",
        overflow: "hidden",
      }}
    >
      {/* Ambient glow blobs */}
      <div
        style={{
          position: "absolute",
          top: -200,
          left: -150,
          width: 700,
          height: 700,
          background:
            "radial-gradient(circle, rgba(255,77,148,0.35) 0%, rgba(255,77,148,0) 65%)",
          filter: "blur(40px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -250,
          right: -200,
          width: 800,
          height: 800,
          background:
            "radial-gradient(circle, rgba(120,80,255,0.32) 0%, rgba(120,80,255,0) 65%)",
          filter: "blur(40px)",
        }}
      />

      {/* Photo columns */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          justifyContent: "center",
          alignItems: "flex-start",
          gap: GAP,
          paddingTop: 60,
          transform: `scale(${zoom})`,
          transformOrigin: "center center",
        }}
      >
        <PhotoColumn
          photos={COLS[0]}
          speedPxPerSec={75}
          direction="up"
          startOffset={0}
          fps={fps}
          frame={frame}
        />
        <PhotoColumn
          photos={COLS[1]}
          speedPxPerSec={95}
          direction="up"
          startOffset={CARD_H * 0.6}
          fps={fps}
          frame={frame}
        />
        <PhotoColumn
          photos={COLS[2]}
          speedPxPerSec={70}
          direction="up"
          startOffset={CARD_H * 0.3}
          fps={fps}
          frame={frame}
        />
      </div>

      {/* Top fade for readability of title */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 480,
          background:
            "linear-gradient(180deg, rgba(5,5,16,0.92) 0%, rgba(5,5,16,0.55) 60%, rgba(5,5,16,0) 100%)",
          pointerEvents: "none",
        }}
      />
      {/* Bottom fade */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 420,
          background:
            "linear-gradient(0deg, rgba(5,5,16,0.95) 0%, rgba(5,5,16,0.6) 55%, rgba(5,5,16,0) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Title */}
      <div
        style={{
          position: "absolute",
          top: 110,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          fontFamily,
          color: "white",
          padding: "0 40px",
        }}
      >
        <div
          style={{
            fontSize: 88,
            fontWeight: 800,
            letterSpacing: -1.5,
            lineHeight: 1,
            background:
              "linear-gradient(180deg, #ffffff 0%, #ffd2e3 60%, #ff7eb6 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "0 6px 30px rgba(255,77,148,0.35)",
          }}
        >
          MeriLive
        </div>
        <div
          style={{
            marginTop: 14,
            fontSize: 32,
            fontWeight: 600,
            color: "rgba(255,255,255,0.92)",
            letterSpacing: 0.5,
          }}
        >
          Live Video Chat & Calls
        </div>
      </div>
    </AbsoluteFill>
  );
};
