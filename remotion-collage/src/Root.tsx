import { Composition } from "remotion";
import { ScrollingCollage } from "./ScrollingCollage";

// 30fps × 20s = 600 frames
const FPS = 30;
const DURATION_SECONDS = 20;

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
