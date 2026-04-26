import { Composition } from "remotion";
import { ScrollingCollage } from "./ScrollingCollage";

// 30fps × 8s = 240 frames (seamless loop for GIF)
const FPS = 30;
const DURATION_SECONDS = 8;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="main"
      component={ScrollingCollage}
      durationInFrames={FPS * DURATION_SECONDS}
      fps={FPS}
      width={1080}
      height={1920}
    />
  );
};
