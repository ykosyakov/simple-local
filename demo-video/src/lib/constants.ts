export const COLORS = {
  bg: "#0A0C0F",
  bgLight: "#1C2128",
  accent: "#00E5CC",
  accentDim: "rgba(0, 229, 204, 0.15)",
  accentGlow: "rgba(0, 229, 204, 0.4)",
  text: "#FFFFFF",
  textSecondary: "#8B949E",
  danger: "#FF4757",
  amber: "#FFB800",
} as const;

export const SCREENSHOTS = {
  agentFlow: "screenshots/dashboard-agent-flow.png",
  proseona: "screenshots/dashboard-proseona.png",
  aiChooser: "screenshots/ai-agent-chooser.png",
  discoveryResults: "screenshots/discovery-results.png",
  serviceSelection: "screenshots/service-selection.png",
  envVariables: "screenshots/env-variables.png",
  configEditor: "screenshots/config-editor.png",
  artizen: "screenshots/dashboard-artizen.png",
} as const;

export const SCENE_DURATIONS = {
  intro: 120,       // 4s
  discovery: 300,   // 10s
  dashboard: 240,   // 8s  (shortened)
  ports: 210,       // 7s  (shortened)
  containers: 270,  // 9s  (NEW)
  running: 240,     // 8s  (shortened)
  mcp: 300,         // 10s (shortened)
  mcpLogs: 300,     // 10s (NEW)
  outro: 180,       // 6s
} as const;

export const TRANSITION_DURATION = 15;
