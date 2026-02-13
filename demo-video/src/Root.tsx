import { Composition, registerRoot } from "remotion";
import { DemoVideo } from "./DemoVideo";

// Total: 120+300+240+210+270+240+300+300+180 = 2160 scene frames
// Minus 8 transitions x 15 frames = -120 overlap
// = 2040 frames = 68 seconds at 30fps
const DURATION = 2040;

const RemotionRoot = () => {
  return (
    <Composition
      id="DemoVideo"
      component={DemoVideo}
      durationInFrames={DURATION}
      fps={30}
      width={1920}
      height={1080}
    />
  );
};

registerRoot(RemotionRoot);
