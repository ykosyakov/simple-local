import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, SCREENSHOTS } from "../lib/constants";
import { SPRING_CONFIGS } from "../lib/animations";
import { GlowBackground } from "../components/GlowBackground";
import { MacWindow } from "../components/MacWindow";
import { SceneTitle } from "../components/SceneTitle";
import { FONTS } from "../lib/fonts";

const PORT_REMAPS = [
  { service: "Backend API", from: ":3500", to: ":3100" },
  { service: "Frontend App", from: ":3000", to: ":3501" },
  { service: "Landing Page", from: ":3000", to: ":3503" },
  { service: "Backend Worker", from: ":3500", to: ":3101" },
];

export const PortsScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const slideProgress = spring({ frame, fps, config: SPRING_CONFIGS.smooth });

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
        <MacWindow width={1600}>
          <Img src={staticFile(SCREENSHOTS.proseona)} style={{ width: "100%", display: "block" }} />
        </MacWindow>
      </AbsoluteFill>

      {/* Multiple port remapping badges */}
      <div
        style={{
          position: "absolute",
          top: 60,
          right: 80,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {PORT_REMAPS.map((remap, i) => {
          const progress = spring({ frame, fps, config: SPRING_CONFIGS.snappy, delay: 30 + i * 12 });
          return (
            <div
              key={remap.service}
              style={{
                opacity: progress,
                transform: `translateX(${interpolate(progress, [0, 1], [30, 0])}px)`,
                padding: "12px 24px",
                borderRadius: 10,
                border: `1px solid ${COLORS.accent}`,
                backgroundColor: "rgba(10, 12, 15, 0.92)",
                fontFamily: FONTS.mono,
                fontSize: 20,
                fontWeight: 600,
                color: COLORS.accent,
                display: "flex",
                gap: 16,
                alignItems: "center",
                boxShadow: `0 0 30px rgba(0, 229, 204, 0.25), 0 4px 20px rgba(0, 0, 0, 0.6)`,
                backdropFilter: "blur(12px)",
              }}
            >
              <span style={{ color: COLORS.text, minWidth: 160 }}>{remap.service}</span>
              <span style={{ color: COLORS.danger, fontSize: 22 }}>{remap.from}</span>
              <span style={{ color: COLORS.accent, fontSize: 18 }}>→</span>
              <span style={{ color: COLORS.accent, fontSize: 22 }}>{remap.to}</span>
            </div>
          );
        })}
      </div>

      <SceneTitle title="Automatic port allocation. No conflicts. Ever." delay={10} />
    </AbsoluteFill>
  );
};
