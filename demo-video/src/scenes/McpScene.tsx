import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, SCREENSHOTS } from "../lib/constants";
import { SPRING_CONFIGS } from "../lib/animations";
import { GlowBackground } from "../components/GlowBackground";
import { MacWindow } from "../components/MacWindow";
import { MockTerminal } from "../components/MockTerminal";
import { SceneTitle } from "../components/SceneTitle";
import { FONTS } from "../lib/fonts";

const TERMINAL_LINES = [
  { text: 'list_services("proseona")', isCommand: true, delay: 20, color: "#FFFFFF" },
  { text: "  Backend API     :3100  ONLINE", delay: 55, color: "#00E5CC" },
  { text: "  Backend Worker  :3101  ONLINE", delay: 65, color: "#00E5CC" },
  { text: "  Frontend App    :3501  ONLINE", delay: 75, color: "#00E5CC" },
  { text: "  Landing Page    :3503  OFFLINE", delay: 85, color: "#6E7681" },
  { text: "", delay: 100 },
  { text: 'start_service("proseona", "landing-page")', isCommand: true, delay: 120, color: "#FFFFFF" },
  { text: "  Starting Landing Page in native mode...", delay: 160, color: "#FFB800" },
  { text: "  Landing Page :3503  ONLINE", delay: 200, color: "#00E5CC" },
];

export const McpScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const leftProgress = spring({ frame, fps, config: SPRING_CONFIGS.smooth });
  const leftX = interpolate(leftProgress, [0, 1], [-200, 0]);

  const rightProgress = spring({ frame, fps, config: SPRING_CONFIGS.smooth, delay: 10 });
  const rightX = interpolate(rightProgress, [0, 1], [200, 0]);

  const badgeProgress = spring({ frame, fps, config: SPRING_CONFIGS.snappy, delay: 200 });

  return (
    <AbsoluteFill>
      <GlowBackground />
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 40 }}>
        <div
          style={{
            opacity: leftProgress,
            transform: `translateX(${leftX}px)`,
            flex: "0 0 auto",
          }}
        >
          <MacWindow width={750}>
            <Img src={staticFile(SCREENSHOTS.proseona)} style={{ width: "100%", display: "block" }} />
          </MacWindow>
        </div>

        <div
          style={{
            opacity: rightProgress,
            transform: `translateX(${rightX}px)`,
            flex: "0 0 auto",
          }}
        >
          <MockTerminal lines={TERMINAL_LINES} width={750} height={480} />
        </div>
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          top: 40,
          right: 60,
          opacity: badgeProgress,
          transform: `scale(${interpolate(badgeProgress, [0, 1], [0.8, 1])})`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 20px",
          borderRadius: 8,
          backgroundColor: "rgba(10, 12, 15, 0.92)",
          border: `1px solid ${COLORS.accent}`,
          boxShadow: `0 0 30px rgba(0, 229, 204, 0.25), 0 4px 20px rgba(0, 0, 0, 0.6)`,
          backdropFilter: "blur(12px)",
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={COLORS.accent} strokeWidth="2">
          <rect x="2" y="2" width="20" height="20" rx="2" />
          <path d="M12 8v8" />
          <path d="M8 12h8" />
        </svg>
        <span style={{ fontFamily: FONTS.mono, fontSize: 16, color: COLORS.accent }}>
          Everything runs locally
        </span>
      </div>

      <SceneTitle
        title="Built-in MCP server. AI agents control your services too."
        subtitle="No cloud. No accounts."
        delay={10}
      />
    </AbsoluteFill>
  );
};
