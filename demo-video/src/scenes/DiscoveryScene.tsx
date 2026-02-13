import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { SCREENSHOTS } from "../lib/constants";
import { SPRING_CONFIGS } from "../lib/animations";
import { GlowBackground } from "../components/GlowBackground";
import { MacWindow } from "../components/MacWindow";
import { SceneTitle } from "../components/SceneTitle";

export const DiscoveryScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const phase1Opacity = interpolate(frame, [0, 15, 75, 95], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const phase2Opacity = interpolate(frame, [80, 100, 175, 195], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const phase3Opacity = interpolate(frame, [180, 200, 290, 300], [0, 1, 1, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const phase1Scale = interpolate(frame, [0, 90], [1, 1.02], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const phase2Scale = interpolate(frame, [80, 190], [1, 1.02], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const phase3Scale = interpolate(frame, [180, 300], [1, 1.02], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill>
      <GlowBackground />
      <AbsoluteFill style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", opacity: phase1Opacity, transform: `scale(${phase1Scale})` }}>
          <MacWindow width={1400}>
            <Img src={staticFile(SCREENSHOTS.aiChooser)} style={{ width: "100%", display: "block" }} />
          </MacWindow>
        </div>
        <div style={{ position: "absolute", opacity: phase2Opacity, transform: `scale(${phase2Scale})` }}>
          <MacWindow width={700}>
            <Img src={staticFile(SCREENSHOTS.discoveryResults)} style={{ width: "100%", display: "block" }} />
          </MacWindow>
        </div>
        <div style={{ position: "absolute", opacity: phase3Opacity, transform: `scale(${phase3Scale})` }}>
          <MacWindow width={700}>
            <Img src={staticFile(SCREENSHOTS.serviceSelection)} style={{ width: "100%", display: "block" }} />
          </MacWindow>
        </div>
      </AbsoluteFill>
      <SceneTitle title="Point at any project. AI discovers your services." delay={5} position="top" />
    </AbsoluteFill>
  );
};
