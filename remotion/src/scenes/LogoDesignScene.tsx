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

export const LogoDesignScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const imgOp = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: "clamp" });
  const imgX = interpolate(
    spring({ frame, fps, config: { damping: 18 } }),
    [0, 1],
    [80, 0]
  );

  const textOp = interpolate(frame, [10, 35], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(160deg, #0a0a0f 0%, #1a150d 50%, #0a0a0f 100%)",
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
          transform: `translateX(${imgX}px)`,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            borderRadius: 20,
            overflow: "hidden",
            boxShadow: "0 30px 80px rgba(201,164,74,0.15)",
            border: "1px solid rgba(201,164,74,0.1)",
          }}
        >
          <Img
            src={staticFile("images/logo-design.jpg")}
            style={{ width: 600, height: "auto" }}
          />
        </div>
      </div>

      {/* Right content */}
      <div style={{ flex: 1, paddingLeft: 60, opacity: textOp }}>
        <div
          style={{
            fontSize: 16,
            color: "#c9a44a",
            letterSpacing: 4,
            textTransform: "uppercase",
            marginBottom: 20,
          }}
        >
          02 — Logo Design
        </div>
        <h2
          style={{
            fontSize: 64,
            fontWeight: 900,
            color: "#ffffff",
            lineHeight: 1.15,
            margin: "0 0 25px 0",
          }}
        >
          Iconic
          <br />
          <span
            style={{
              background: "linear-gradient(90deg, #c9a44a, #e8d48b)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Brand Identity
          </span>
        </h2>
        <p
          style={{
            fontSize: 22,
            color: "rgba(255,255,255,0.6)",
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          Minimalist, memorable logos that define your brand and leave a lasting
          impression on your audience.
        </p>
      </div>
    </AbsoluteFill>
  );
};
