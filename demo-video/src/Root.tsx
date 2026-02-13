import { Composition } from "remotion";
import { DemoVideo } from "./DemoVideo";

const DURATION = 1890;

export const RemotionRoot = () => {
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
