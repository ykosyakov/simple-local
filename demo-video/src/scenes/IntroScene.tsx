import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../lib/constants";
import { FONTS } from "../lib/fonts";
import { SPRING_CONFIGS } from "../lib/animations";
import { GlowBackground } from "../components/GlowBackground";

export const IntroScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoProgress = spring({ frame, fps, config: SPRING_CONFIGS.bouncy });
  const logoScale = interpolate(logoProgress, [0, 1], [0.3, 1]);
  const logoOpacity = Math.min(logoProgress * 2, 1);

  const titleProgress = spring({ frame, fps, config: SPRING_CONFIGS.smooth, delay: 15 });
  const titleY = interpolate(titleProgress, [0, 1], [30, 0]);

  const taglineProgress = spring({ frame, fps, config: SPRING_CONFIGS.smooth, delay: 30 });
  const taglineY = interpolate(taglineProgress, [0, 1], [20, 0]);

  const glowSize = interpolate(frame, [0, 30, 90], [0, 500, 400], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });
  const glowOpacity = interpolate(frame, [0, 15, 60, 90], [0, 0.5, 0.2, 0.15], {
    extrapolateRight: "clamp",
    extrapolateLeft: "clamp",
  });

  return (
    <AbsoluteFill>
      <GlowBackground />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <div
          style={{
            position: "absolute",
            width: glowSize,
            height: glowSize,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${COLORS.accent}, transparent 70%)`,
            opacity: glowOpacity,
          }}
        />
        <div style={{ opacity: logoOpacity, transform: `scale(${logoScale})` }}>
          <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke={COLORS.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
          </svg>
        </div>
        <div
          style={{
            fontFamily: FONTS.mono,
            fontSize: 72,
            fontWeight: 700,
            color: COLORS.text,
            opacity: titleProgress,
            transform: `translateY(${titleY}px)`,
          }}
        >
          Simple Local
        </div>
        <div
          style={{
            fontFamily: FONTS.sans,
            fontSize: 28,
            color: COLORS.textSecondary,
            opacity: taglineProgress,
            transform: `translateY(${taglineY}px)`,
          }}
        >
          Your dev infrastructure, simplified
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
