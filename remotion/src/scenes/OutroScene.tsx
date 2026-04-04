import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
const { fontFamily } = loadFont("normal", { weights: ["400", "700", "900"], subsets: ["latin"] });

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleOp = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  const titleScale = spring({ frame, fps, config: { damping: 15, stiffness: 80 } });

  const ctaOp = interpolate(frame, [40, 65], [0, 1], { extrapolateRight: "clamp" });
  const lineW = interpolate(frame, [60, 100], [0, 250], { extrapolateRight: "clamp" });

  const pulseScale = 1 + Math.sin(frame * 0.06) * 0.03;

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(135deg, #0a0a0f 0%, #12121f 40%, #0d0d18 100%)",
        fontFamily,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Glow */}
      <div
        style={{
          position: "absolute",
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(201,164,74,0.12) 0%, transparent 70%)",
          transform: `scale(${pulseScale})`,
        }}
      />

      <div style={{ textAlign: "center", zIndex: 10 }}>
        <h2
          style={{
            fontSize: 80,
            fontWeight: 900,
            color: "#ffffff",
            margin: "0 0 10px 0",
            opacity: titleOp,
            transform: `scale(${titleScale})`,
          }}
        >
          Let's Work{" "}
          <span
            style={{
              background: "linear-gradient(90deg, #c9a44a, #e8d48b, #c9a44a)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Together
          </span>
        </h2>

        {/* Line */}
        <div
          style={{
            width: lineW,
            height: 2,
            background: "linear-gradient(90deg, transparent, #c9a44a, transparent)",
            margin: "25px auto",
          }}
        />

        <p
          style={{
            fontSize: 26,
            color: "rgba(255,255,255,0.5)",
            opacity: ctaOp,
            letterSpacing: 3,
            margin: 0,
          }}
        >
          ORDER NOW ON FIVERR
        </p>

        {/* Services recap */}
        <div
          style={{
            display: "flex",
            gap: 30,
            marginTop: 50,
            opacity: ctaOp,
            justifyContent: "center",
          }}
        >
          {["Web Design", "Logo Design", "Graphics", "AI Design", "Dashboards"].map(
            (s, i) => {
              const sOp = interpolate(frame, [70 + i * 8, 85 + i * 8], [0, 1], {
                extrapolateRight: "clamp",
              });
              return (
                <div
                  key={s}
                  style={{
                    opacity: sOp,
                    padding: "10px 22px",
                    borderRadius: 25,
                    border: "1px solid rgba(201,164,74,0.3)",
                    color: "#c9a44a",
                    fontSize: 15,
                    fontWeight: 700,
                    letterSpacing: 1,
                  }}
                >
                  {s}
                </div>
              );
            }
          )}
        </div>
      </div>
    </AbsoluteFill>
  );
};
