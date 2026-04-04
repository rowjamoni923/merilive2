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

export const DashboardScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const imgScale = spring({ frame, fps, config: { damping: 12, stiffness: 60 } });
  const textOp = interpolate(frame, [10, 35], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(160deg, #0a0a0f 0%, #0a1520 50%, #0a0a0f 100%)",
        fontFamily,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div style={{ textAlign: "center", zIndex: 10, opacity: textOp }}>
        <div
          style={{
            fontSize: 16,
            color: "#06b6d4",
            letterSpacing: 4,
            textTransform: "uppercase",
            marginBottom: 15,
          }}
        >
          05 — SaaS & Dashboards
        </div>
        <h2
          style={{
            fontSize: 56,
            fontWeight: 900,
            color: "#ffffff",
            margin: "0 0 40px 0",
          }}
        >
          Powerful <span style={{ color: "#06b6d4" }}>Dashboard</span> Interfaces
        </h2>
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 40,
          left: "50%",
          transform: `translateX(-50%) scale(${imgScale})`,
          transformOrigin: "bottom center",
        }}
      >
        <div
          style={{
            borderRadius: "20px 20px 0 0",
            overflow: "hidden",
            boxShadow: "0 -20px 80px rgba(6,182,212,0.2)",
            border: "1px solid rgba(6,182,212,0.1)",
            borderBottom: "none",
          }}
        >
          <Img
            src={staticFile("images/dashboard-design.jpg")}
            style={{ width: 1200, height: "auto" }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
