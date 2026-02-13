import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, SCREENSHOTS } from "../lib/constants";
import { SPRING_CONFIGS, zoomPan } from "../lib/animations";
import { GlowBackground } from "../components/GlowBackground";
import { MacWindow } from "../components/MacWindow";
import { SceneTitle } from "../components/SceneTitle";
import { FONTS } from "../lib/fonts";

export const PortsScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const zoomStyle = zoomPan(frame, fps, {
    startScale: 1,
    endScale: 1.8,
    startX: 0,
    endX: -80,
    startY: 0,
    endY: -40,
    durationFrames: 270,
  });

  const slideProgress = spring({ frame, fps, config: SPRING_CONFIGS.smooth });

  const calloutProgress = spring({ frame, fps, config: SPRING_CONFIGS.snappy, delay: 60 });
  const calloutOpacity = calloutProgress;
  const calloutY = interpolate(calloutProgress, [0, 1], [20, 0]);

  return (
    <AbsoluteFill>
      <GlowBackground />
      <AbsoluteFill
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: slideProgress,
        }}
      >
        <div style={zoomStyle}>
          <MacWindow width={1600}>
            <Img src={staticFile(SCREENSHOTS.proseona)} style={{ width: "100%", display: "block" }} />
          </MacWindow>
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          top: 80,
          right: 100,
          opacity: calloutOpacity,
          transform: `translateY(${calloutY}px)`,
          padding: "16px 28px",
          borderRadius: 12,
          border: `2px solid ${COLORS.accent}`,
          backgroundColor: "rgba(0, 229, 204, 0.1)",
          fontFamily: FONTS.mono,
          fontSize: 24,
          color: COLORS.accent,
          boxShadow: `0 0 30px ${COLORS.accentDim}`,
        }}
      >
        :3500 → :3100 remapped automatically
      </div>

      <SceneTitle title="Automatic port allocation. No conflicts. Ever." delay={10} />
    </AbsoluteFill>
  );
};
