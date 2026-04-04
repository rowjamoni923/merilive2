import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  Sequence,
  Audio,
  staticFile,
} from "remotion";
import { TransitionSeries, springTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { IntroScene } from "./scenes/IntroScene";
import { WebDesignScene } from "./scenes/WebDesignScene";
import { LogoDesignScene } from "./scenes/LogoDesignScene";
import { GraphicsScene } from "./scenes/GraphicsScene";
import { AIDesignScene } from "./scenes/AIDesignScene";
import { DashboardScene } from "./scenes/DashboardScene";
import { OutroScene } from "./scenes/OutroScene";

export const MainVideo: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: "#0a0a0f" }}>
      {/* Background ambient particles */}
      <AbsoluteFill>
        {Array.from({ length: 30 }).map((_, i) => {
          const x = (i * 137.5) % 100;
          const baseY = (i * 97.3) % 100;
          const y = baseY + Math.sin(frame * 0.008 + i) * 3;
          const size = 2 + (i % 3);
          const opacity = interpolate(
            Math.sin(frame * 0.015 + i * 0.7),
            [-1, 1],
            [0.02, 0.08]
          );
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: `${x}%`,
                top: `${y}%`,
                width: size,
                height: size,
                borderRadius: "50%",
                background: i % 2 === 0 ? "#c9a44a" : "#ffffff",
                opacity,
              }}
            />
          );
        })}
      </AbsoluteFill>

      {/* Audio */}
      <Audio src={staticFile("audio/voiceover.mp3")} startFrom={0} />

      {/* Scenes */}
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={210}>
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={200}>
          <WebDesignScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-right" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={180}>
          <LogoDesignScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={180}>
          <GraphicsScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={slide({ direction: "from-left" })}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={200}>
          <AIDesignScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 20 })}
        />
        <TransitionSeries.Sequence durationInFrames={180}>
          <DashboardScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition
          presentation={fade()}
          timing={springTiming({ config: { damping: 200 }, durationInFrames: 25 })}
        />
        <TransitionSeries.Sequence durationInFrames={250}>
          <OutroScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
