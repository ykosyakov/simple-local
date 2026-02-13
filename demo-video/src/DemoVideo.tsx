import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { SCENE_DURATIONS, TRANSITION_DURATION } from "./lib/constants";
import { IntroScene } from "./scenes/IntroScene";
import { DiscoveryScene } from "./scenes/DiscoveryScene";
import { DashboardScene } from "./scenes/DashboardScene";
import { PortsScene } from "./scenes/PortsScene";
import { ContainersScene } from "./scenes/ContainersScene";
import { RunningScene } from "./scenes/RunningScene";
import { McpScene } from "./scenes/McpScene";
import { McpLogsScene } from "./scenes/McpLogsScene";
import { OutroScene } from "./scenes/OutroScene";

const FADE_TIMING = linearTiming({ durationInFrames: TRANSITION_DURATION });

export const DemoVideo = () => {
  return (
    <AbsoluteFill>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.intro}>
          <IntroScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={FADE_TIMING} />

        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.discovery}>
          <DiscoveryScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={FADE_TIMING} />

        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.dashboard}>
          <DashboardScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={FADE_TIMING} />

        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.ports}>
          <PortsScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={FADE_TIMING} />

        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.containers}>
          <ContainersScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={FADE_TIMING} />

        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.running}>
          <RunningScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={FADE_TIMING} />

        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.mcp}>
          <McpScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={FADE_TIMING} />

        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.mcpLogs}>
          <McpLogsScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={FADE_TIMING} />

        <TransitionSeries.Sequence durationInFrames={SCENE_DURATIONS.outro}>
          <OutroScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
