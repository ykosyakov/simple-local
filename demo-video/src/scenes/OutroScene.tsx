import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { COLORS } from "../lib/constants";
import { FONTS } from "../lib/fonts";
import { SPRING_CONFIGS } from "../lib/animations";
import { GlowBackground } from "../components/GlowBackground";

export const OutroScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoProgress = spring({ frame, fps, config: SPRING_CONFIGS.bouncy });
  const badgeProgress = spring({ frame, fps, config: SPRING_CONFIGS.smooth, delay: 15 });
  const urlProgress = spring({ frame, fps, config: SPRING_CONFIGS.smooth, delay: 30 });
  const taglineProgress = spring({ frame, fps, config: SPRING_CONFIGS.smooth, delay: 45 });

  return (
    <AbsoluteFill>
      <GlowBackground />
      <AbsoluteFill
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 20,
        }}
      >
        <div
          style={{
            opacity: logoProgress,
            transform: `scale(${interpolate(logoProgress, [0, 1], [0.5, 1])})`,
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke={COLORS.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
          </svg>
          <span
            style={{
              fontFamily: FONTS.mono,
              fontSize: 56,
              fontWeight: 700,
              color: COLORS.text,
            }}
          >
            Simple Local
          </span>
        </div>

        <div
          style={{
            opacity: badgeProgress,
            transform: `translateY(${interpolate(badgeProgress, [0, 1], [15, 0])}px)`,
            padding: "8px 20px",
            borderRadius: 20,
            border: `1px solid ${COLORS.accent}`,
            fontFamily: FONTS.sans,
            fontSize: 18,
            color: COLORS.accent,
          }}
        >
          Open Source
        </div>

        <div
          style={{
            opacity: urlProgress,
            transform: `translateY(${interpolate(urlProgress, [0, 1], [15, 0])}px)`,
            fontFamily: FONTS.mono,
            fontSize: 24,
            color: COLORS.textSecondary,
          }}
        >
          github.com/ykosyakov/simple-local
        </div>

        <div
          style={{
            opacity: taglineProgress,
            transform: `translateY(${interpolate(taglineProgress, [0, 1], [15, 0])}px)`,
            fontFamily: FONTS.sans,
            fontSize: 28,
            fontWeight: 600,
            color: COLORS.text,
            marginTop: 16,
          }}
        >
          Zero config. No cloud. Just point and go.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
