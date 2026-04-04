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

export const AIDesignScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const imgOp = interpolate(frame, [0, 25], [0, 1], { extrapolateRight: "clamp" });
  const textOp = interpolate(frame, [15, 40], [0, 1], { extrapolateRight: "clamp" });

  const features = [
    "AI-Generated Mockups",
    "Smart Layout Suggestions",
    "Rapid Prototyping",
    "Data-Driven Design",
  ];

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(160deg, #0a0a0f 0%, #0d0a20 50%, #0a0a0f 100%)",
        fontFamily,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        padding: "0 100px",
      }}
    >
      {/* Left image */}
      <div
        style={{
          flex: 1,
          opacity: imgOp,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 30px 80px rgba(139,92,246,0.25)",
            border: "1px solid rgba(139,92,246,0.15)",
          }}
        >
          <Img
            src={staticFile("images/ai-design.jpg")}
            style={{ width: 620, height: "auto" }}
          />
        </div>
      </div>

      {/* Right content */}
      <div style={{ flex: 1, paddingLeft: 60, opacity: textOp }}>
        <div
          style={{
            fontSize: 16,
            color: "#8b5cf6",
            letterSpacing: 4,
            textTransform: "uppercase",
            marginBottom: 20,
          }}
        >
          04 — AI-Powered Design
        </div>
        <h2
          style={{
            fontSize: 58,
            fontWeight: 900,
            color: "#ffffff",
            lineHeight: 1.15,
            margin: "0 0 30px 0",
          }}
        >
          Next-Gen
          <br />
          <span
            style={{
              background: "linear-gradient(90deg, #8b5cf6, #ec4899)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            AI Solutions
          </span>
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {features.map((feat, i) => {
            const fOp = interpolate(frame, [40 + i * 10, 55 + i * 10], [0, 1], {
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
                    borderRadius: 2,
                    background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
                    transform: "rotate(45deg)",
                  }}
                />
                {feat}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
