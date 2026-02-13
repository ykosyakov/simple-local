import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { COLORS } from "../lib/constants";

export const GlowBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const glowOpacity = interpolate(
    frame % 120,
    [0, 60, 120],
    [0.03, 0.06, 0.03],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        backgroundColor: COLORS.bg,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -200,
          right: -200,
          width: 800,
          height: 800,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${COLORS.accent}, transparent 70%)`,
          opacity: glowOpacity,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -300,
          left: -100,
          width: 600,
          height: 600,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${COLORS.accent}, transparent 70%)`,
          opacity: glowOpacity * 0.7,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.015,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  );
};
