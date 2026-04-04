import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Img,
  staticFile,
} from "remotion";
import { loadFont } from "@remotion/google-fonts/Inter";
const { fontFamily } = loadFont("normal", { weights: ["400", "700", "900"], subsets: ["latin"] });

export const WebDesignScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const imgScale = spring({ frame, fps, config: { damping: 15, stiffness: 80 } });
  const imgOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });

  const textOp = interpolate(frame, [15, 40], [0, 1], { extrapolateRight: "clamp" });
  const textX = interpolate(
    spring({ frame: frame - 15, fps, config: { damping: 20 } }),
    [0, 1],
    [-60, 0]
  );

  const features = ["Responsive Layouts", "Modern UI/UX", "Landing Pages", "E-Commerce"];

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(160deg, #0a0a0f 0%, #0f1a2e 50%, #0a0a0f 100%)",
        fontFamily,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        padding: "0 100px",
      }}
    >
      {/* Left content */}
      <div
        style={{
          flex: 1,
          opacity: textOp,
          transform: `translateX(${textX}px)`,
        }}
      >
        <div
          style={{
            fontSize: 16,
            color: "#4a9eff",
            letterSpacing: 4,
            textTransform: "uppercase",
            marginBottom: 20,
          }}
        >
          01 — Web Design
        </div>
        <h2
          style={{
            fontSize: 64,
            fontWeight: 900,
            color: "#ffffff",
            lineHeight: 1.15,
            margin: "0 0 30px 0",
          }}
        >
          Stunning
          <br />
          <span style={{ color: "#4a9eff" }}>Websites</span>
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {features.map((feat, i) => {
            const fOp = interpolate(frame, [35 + i * 10, 50 + i * 10], [0, 1], {
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={feat}
                style={{
                  opacity: fOp,
                  fontSize: 20,
                  color: "rgba(255,255,255,0.7)",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: "#4a9eff",
                  }}
                />
                {feat}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right image */}
      <div
        style={{
          flex: 1,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          opacity: imgOp,
          transform: `scale(${imgScale})`,
        }}
      >
        <div
          style={{
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 30px 80px rgba(74,158,255,0.2)",
            border: "1px solid rgba(74,158,255,0.15)",
          }}
        >
          <Img
            src={staticFile("images/web-design.jpg")}
            style={{ width: 700, height: "auto" }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
