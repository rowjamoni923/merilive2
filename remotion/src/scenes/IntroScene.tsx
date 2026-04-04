import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Sequence,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
const { fontFamily } = loadFont("normal", { weights: ["400", "700", "900"], subsets: ["latin"] });

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleY = interpolate(
    spring({ frame, fps, config: { damping: 20, stiffness: 100 } }),
    [0, 1],
    [80, 0]
  );
  const titleOp = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });

  const subtitleOp = interpolate(frame, [30, 55], [0, 1], { extrapolateRight: "clamp" });
  const subtitleY = interpolate(
    spring({ frame: frame - 30, fps, config: { damping: 20 } }),
    [0, 1],
    [40, 0]
  );

  const lineW = interpolate(frame, [20, 60], [0, 300], { extrapolateRight: "clamp" });

  const tagOp = interpolate(frame, [70, 95], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #0a0a0f 0%, #12121f 40%, #0d0d18 100%)",
        justifyContent: "center",
        alignItems: "center",
        fontFamily,
      }}
    >
      {/* Gold accent glow */}
      <div
        style={{
          position: "absolute",
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(201,164,74,0.15) 0%, transparent 70%)",
          top: "20%",
          left: "30%",
          transform: `scale(${1 + Math.sin(frame * 0.02) * 0.1})`,
        }}
      />

      <div style={{ textAlign: "center", zIndex: 10 }}>
        {/* Small badge */}
        <div
          style={{
            opacity: tagOp,
            fontSize: 18,
            color: "#c9a44a",
            letterSpacing: 6,
            textTransform: "uppercase",
            marginBottom: 30,
            fontWeight: 400,
          }}
        >
          ✦ Premium Design Studio ✦
        </div>

        {/* Main title */}
        <h1
          style={{
            fontSize: 90,
            fontWeight: 900,
            color: "#ffffff",
            lineHeight: 1.1,
            opacity: titleOp,
            transform: `translateY(${titleY}px)`,
            margin: 0,
          }}
        >
          We Create
          <br />
          <span
            style={{
              background: "linear-gradient(90deg, #c9a44a, #e8d48b, #c9a44a)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Digital Excellence
          </span>
        </h1>

        {/* Gold line */}
        <div
          style={{
            width: lineW,
            height: 2,
            background: "linear-gradient(90deg, transparent, #c9a44a, transparent)",
            margin: "30px auto",
          }}
        />

        {/* Subtitle */}
        <p
          style={{
            fontSize: 28,
            color: "rgba(255,255,255,0.6)",
            opacity: subtitleOp,
            transform: `translateY(${subtitleY}px)`,
            fontWeight: 400,
            letterSpacing: 2,
          }}
        >
          Web Design · Logo Design · Graphics · AI-Powered Solutions
        </p>
      </div>
    </AbsoluteFill>
  );
};
