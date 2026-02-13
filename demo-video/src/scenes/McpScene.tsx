import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, SCREENSHOTS } from "../lib/constants";
import { SPRING_CONFIGS } from "../lib/animations";
import { GlowBackground } from "../components/GlowBackground";
import { MacWindow } from "../components/MacWindow";
import { MockTerminal } from "../components/MockTerminal";
import { SceneTitle } from "../components/SceneTitle";
import { FONTS } from "../lib/fonts";

const TERMINAL_LINES = [
  { text: 'list_services("artizen")', isCommand: true, delay: 20, color: "#FFFFFF" },
  { text: "  API Server      :4100  ONLINE", delay: 55, color: "#00E5CC" },
  { text: "  Web App         :4101  ONLINE", delay: 65, color: "#00E5CC" },
  { text: "  LeadsDB Server  :8080  ONLINE", delay: 75, color: "#00E5CC" },
  { text: "  Proxy Server    :4102  OFFLINE", delay: 85, color: "#6E7681" },
  { text: "", delay: 100 },
  { text: 'start_service("artizen", "proxy-server")', isCommand: true, delay: 120, color: "#FFFFFF" },
  { text: "  Starting Proxy Server in native mode...", delay: 160, color: "#FFB800" },
  { text: "  Proxy Server :4102  ONLINE", delay: 200, color: "#00E5CC" },
];

export const McpScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const leftProgress = spring({ frame, fps, config: SPRING_CONFIGS.smooth });
  const leftX = interpolate(leftProgress, [0, 1], [-200, 0]);

  const rightProgress = spring({ frame, fps, config: SPRING_CONFIGS.smooth, delay: 10 });
  const rightX = interpolate(rightProgress, [0, 1], [200, 0]);

  const badgeProgress = spring({ frame, fps, config: SPRING_CONFIGS.snappy, delay: 240 });

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
            <Img src={staticFile(SCREENSHOTS.artizen)} style={{ width: "100%", display: "block" }} />
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
          backgroundColor: "rgba(0, 229, 204, 0.1)",
          border: `1px solid ${COLORS.accentGlow}`,
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
