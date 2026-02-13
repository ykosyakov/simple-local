import { Composition, registerRoot } from "remotion";
import { DemoVideo } from "./DemoVideo";

// Total: 210+300+330+270+330+360+180 = 1980 scene frames
// Minus 6 transitions x 15 frames = -90 overlap
// = 1890 frames = 63 seconds at 30fps
const DURATION = 1890;

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
