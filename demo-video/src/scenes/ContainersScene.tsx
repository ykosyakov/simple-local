import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, SCREENSHOTS } from "../lib/constants";
import { SPRING_CONFIGS } from "../lib/animations";
import { GlowBackground } from "../components/GlowBackground";
import { MacWindow } from "../components/MacWindow";
import { SceneTitle } from "../components/SceneTitle";
import { FONTS } from "../lib/fonts";

const FEATURES = [
  { icon: "📦", text: "Every service runs in a devcontainer" },
  { icon: "🔄", text: "Switch Native ↔ Container per service" },
  { icon: "🔌", text: "Automatic port forwarding & mappings" },
  { icon: "🛡️", text: "Full isolation — no dependency conflicts" },
];

export const ContainersScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Screenshot slides in from right
  const slideProgress = spring({ frame, fps, config: SPRING_CONFIGS.smooth });
  const translateX = interpolate(slideProgress, [0, 1], [200, 0]);

  return (
    <AbsoluteFill>
      <GlowBackground />
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 60 }}>
        {/* Left side: feature list */}
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            maxWidth: 500,
          }}
        >
          {FEATURES.map((feature, i) => {
            const progress = spring({ frame, fps, config: SPRING_CONFIGS.snappy, delay: 20 + i * 15 });
            return (
              <div
                key={feature.text}
                style={{
                  opacity: progress,
                  transform: `translateX(${interpolate(progress, [0, 1], [-30, 0])}px)`,
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "14px 22px",
                  borderRadius: 12,
                  backgroundColor: "rgba(10, 12, 15, 0.92)",
                  border: `1px solid rgba(0, 229, 204, 0.4)`,
                  boxShadow: `0 0 20px rgba(0, 229, 204, 0.15), 0 4px 16px rgba(0, 0, 0, 0.5)`,
                  backdropFilter: "blur(12px)",
                }}
              >
                <span style={{ fontSize: 28 }}>{feature.icon}</span>
                <span
                  style={{
                    fontFamily: FONTS.sans,
                    fontSize: 20,
                    fontWeight: 600,
                    color: COLORS.text,
                  }}
                >
                  {feature.text}
                </span>
              </div>
            );
          })}
        </div>

        {/* Right side: screenshot showing mode selector */}
        <div
          style={{
            opacity: slideProgress,
            transform: `translateX(${translateX}px)`,
            flex: "0 0 auto",
          }}
        >
          <MacWindow width={800}>
            <Img src={staticFile(SCREENSHOTS.agentFlow)} style={{ width: "100%", display: "block" }} />
          </MacWindow>
        </div>
      </AbsoluteFill>

      {/* Mode toggle badge */}
      <div
        style={{
          position: "absolute",
          top: 40,
          left: 60,
          display: "flex",
          gap: 8,
        }}
      >
        {["Native", "Container"].map((mode, i) => {
          const progress = spring({ frame, fps, config: SPRING_CONFIGS.snappy, delay: 90 + i * 15 });
          const isContainer = mode === "Container";
          return (
            <div
              key={mode}
              style={{
                opacity: progress,
                transform: `scale(${interpolate(progress, [0, 1], [0.8, 1])})`,
                padding: "8px 20px",
                borderRadius: 8,
                backgroundColor: isContainer ? COLORS.accent : "transparent",
                border: `1px solid ${COLORS.accent}`,
                fontFamily: FONTS.mono,
                fontSize: 16,
                fontWeight: 600,
                color: isContainer ? COLORS.bg : COLORS.accent,
              }}
            >
              {mode}
            </div>
          );
        })}
      </div>

      <SceneTitle
        title="Run any service as a container."
        subtitle="Devcontainer isolation with automatic port forwarding."
        delay={10}
      />
    </AbsoluteFill>
  );
};
