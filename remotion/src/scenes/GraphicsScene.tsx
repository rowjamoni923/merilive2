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

export const GraphicsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({ frame, fps, config: { damping: 15, stiffness: 80 } });
  const textOp = interpolate(frame, [10, 35], [0, 1], { extrapolateRight: "clamp" });

  const items = [
    { label: "Social Media", color: "#ff6b6b" },
    { label: "Business Cards", color: "#4ecdc4" },
    { label: "Flyers & Posters", color: "#a78bfa" },
    { label: "Brand Materials", color: "#f59e0b" },
  ];

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(160deg, #0a0a0f 0%, #1a0d1a 50%, #0a0a0f 100%)",
        fontFamily,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        padding: "0 100px",
      }}
    >
      {/* Left content */}
      <div style={{ flex: 1, opacity: textOp }}>
        <div
          style={{
            fontSize: 16,
            color: "#a78bfa",
            letterSpacing: 4,
            textTransform: "uppercase",
            marginBottom: 20,
          }}
        >
          03 — Graphics Design
        </div>
        <h2
          style={{
            fontSize: 60,
            fontWeight: 900,
            color: "#ffffff",
            lineHeight: 1.15,
            margin: "0 0 30px 0",
          }}
        >
          Creative
          <br />
          <span style={{ color: "#a78bfa" }}>Visual Content</span>
        </h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
          {items.map((item, i) => {
            const iOp = interpolate(frame, [40 + i * 8, 55 + i * 8], [0, 1], {
              extrapolateRight: "clamp",
            });
            return (
              <div
                key={item.label}
                style={{
                  opacity: iOp,
                  padding: "10px 20px",
                  borderRadius: 30,
                  border: `1px solid ${item.color}40`,
                  background: `${item.color}10`,
                  color: item.color,
                  fontSize: 16,
                  fontWeight: 700,
                }}
              >
                {item.label}
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
          transform: `scale(${scale})`,
        }}
      >
        <div
          style={{
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 30px 80px rgba(167,139,250,0.15)",
            border: "1px solid rgba(167,139,250,0.1)",
          }}
        >
          <Img
            src={staticFile("images/graphics-design.jpg")}
            style={{ width: 650, height: "auto" }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
