import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS, SCREENSHOTS } from "../lib/constants";
import { SPRING_CONFIGS } from "../lib/animations";
import { GlowBackground } from "../components/GlowBackground";
import { MacWindow } from "../components/MacWindow";
import { MockTerminal } from "../components/MockTerminal";
import { SceneTitle } from "../components/SceneTitle";

const TERMINAL_LINES = [
  { text: 'restart_service("proseona", "backend-api")', isCommand: true, delay: 15, color: "#FFFFFF" },
  { text: "  Stopping Backend API...", delay: 45, color: "#FF4757" },
  { text: "  Starting Backend API in native mode...", delay: 70, color: "#FFB800" },
  { text: "  Backend API :3100  ONLINE", delay: 100, color: "#00E5CC" },
  { text: "", delay: 110 },
  { text: 'get_logs("proseona", "backend-api", limit=5)', isCommand: true, delay: 125, color: "#FFFFFF" },
  { text: "  [info] Server listening on port 4100", delay: 160, color: "#8B949E" },
  { text: "  [info] Connected to database", delay: 170, color: "#8B949E" },
  { text: "  [info] Job handlers registered", delay: 180, color: "#8B949E" },
  { text: "  [info] Ready to accept connections", delay: 190, color: "#00E5CC" },
];

export const McpLogsScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const leftProgress = spring({ frame, fps, config: SPRING_CONFIGS.smooth });
  const leftX = interpolate(leftProgress, [0, 1], [-200, 0]);

  const rightProgress = spring({ frame, fps, config: SPRING_CONFIGS.smooth, delay: 10 });
  const rightX = interpolate(rightProgress, [0, 1], [200, 0]);

  return (
    <AbsoluteFill>
      <GlowBackground />
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 40 }}>
        {/* Left: App screenshot */}
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

        {/* Right: Mock terminal with restart + logs */}
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

      <SceneTitle
        title="Restart services. Read logs. All from your AI agent."
        delay={10}
      />
    </AbsoluteFill>
  );
};
