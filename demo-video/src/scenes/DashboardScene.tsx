import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { SCREENSHOTS } from "../lib/constants";
import { SPRING_CONFIGS, zoomPan } from "../lib/animations";
import { GlowBackground } from "../components/GlowBackground";
import { MacWindow } from "../components/MacWindow";
import { SceneTitle } from "../components/SceneTitle";

export const DashboardScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideProgress = spring({ frame, fps, config: SPRING_CONFIGS.smooth });
  const translateX = interpolate(slideProgress, [0, 1], [300, 0]);

  const zoomStyle = zoomPan(frame, fps, {
    startScale: 1,
    endScale: 1.4,
    startX: 0,
    endX: -120,
    startY: 0,
    endY: -60,
    durationFrames: 330,
    delay: 60,
  });

  return (
    <AbsoluteFill>
      <GlowBackground />
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: slideProgress,
          transform: `translateX(${translateX}px)`,
        }}
      >
        <div style={zoomStyle}>
          <MacWindow width={1600}>
            <Img src={staticFile(SCREENSHOTS.agentFlow)} style={{ width: "100%", display: "block" }} />
          </MacWindow>
        </div>
      </AbsoluteFill>
      <SceneTitle title="One dashboard. Full control." delay={20} />
    </AbsoluteFill>
  );
};
