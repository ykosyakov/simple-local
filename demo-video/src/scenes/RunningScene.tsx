import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, SCREENSHOTS } from "../lib/constants";
import { SPRING_CONFIGS, zoomPan } from "../lib/animations";
import { GlowBackground } from "../components/GlowBackground";
import { MacWindow } from "../components/MacWindow";
import { SceneTitle } from "../components/SceneTitle";
import { FONTS } from "../lib/fonts";

export const RunningScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideProgress = spring({ frame, fps, config: SPRING_CONFIGS.smooth });
  const translateX = interpolate(slideProgress, [0, 1], [-300, 0]);

  const zoomStyle = zoomPan(frame, fps, {
    startScale: 1,
    endScale: 1.2,
    startX: 0,
    endX: -40,
    startY: 0,
    endY: -20,
    durationFrames: 240,
    delay: 30,
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
            <Img src={staticFile(SCREENSHOTS.proseona)} style={{ width: "100%", display: "block" }} />
          </MacWindow>
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          bottom: 140,
          left: 100,
          display: "flex",
          gap: 16,
        }}
      >
        {["6 of 10 running", "CPU & Memory stats", "Real-time logs"].map((text, i) => {
          const progress = spring({ frame, fps, config: SPRING_CONFIGS.snappy, delay: 60 + i * 8 });
          return (
            <div
              key={text}
              style={{
                padding: "12px 24px",
                borderRadius: 8,
                backgroundColor: "rgba(10, 12, 15, 0.92)",
                border: `1px solid ${COLORS.accent}`,
                fontFamily: FONTS.mono,
                fontSize: 18,
                fontWeight: 600,
                color: COLORS.accent,
                boxShadow: `0 0 30px rgba(0, 229, 204, 0.25), 0 4px 20px rgba(0, 0, 0, 0.6)`,
                backdropFilter: "blur(12px)",
                opacity: progress,
                transform: `translateY(${interpolate(progress, [0, 1], [15, 0])}px)`,
              }}
            >
              {text}
            </div>
          );
        })}
      </div>

      <SceneTitle title="Live monitoring. Real-time logs." subtitle="For you and your AI." delay={15} />
    </AbsoluteFill>
  );
};
