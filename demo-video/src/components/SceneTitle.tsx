import React from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { slideUp } from "../lib/animations";
import { COLORS } from "../lib/constants";
import { FONTS } from "../lib/fonts";

type SceneTitleProps = {
  title: string;
  subtitle?: string;
  delay?: number;
  position?: "top" | "bottom";
};

export const SceneTitle: React.FC<SceneTitleProps> = ({
  title,
  subtitle,
  delay = 0,
  position = "bottom",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleAnim = slideUp(frame, fps, delay);
  const subtitleAnim = subtitle ? slideUp(frame, fps, delay + 8) : undefined;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        [position === "bottom" ? "bottom" : "top"]: 60,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
        zIndex: 10,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.mono,
          fontSize: 42,
          fontWeight: 700,
          color: COLORS.text,
          textShadow: "0 4px 30px rgba(0, 0, 0, 0.8)",
          ...titleAnim,
        }}
      >
        {title}
      </div>
      {subtitle && subtitleAnim && (
        <div
          style={{
            fontFamily: FONTS.sans,
            fontSize: 24,
            color: COLORS.textSecondary,
            textShadow: "0 2px 20px rgba(0, 0, 0, 0.8)",
            ...subtitleAnim,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
};
