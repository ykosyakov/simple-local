import React from "react";
import { useCurrentFrame, interpolate } from "remotion";
import { COLORS } from "../lib/constants";
import { FONTS } from "../lib/fonts";

type TerminalLine = {
  text: string;
  color?: string;
  delay: number;
  isCommand?: boolean;
};

type MockTerminalProps = {
  lines: TerminalLine[];
  width?: number;
  height?: number;
};

const CHARS_PER_FRAME = 1.5;

export const MockTerminal: React.FC<MockTerminalProps> = ({
  lines,
  width = 800,
  height = 500,
}) => {
  const frame = useCurrentFrame();

  return (
    <div
      style={{
        width,
        height,
        backgroundColor: "#0D1117",
        borderRadius: 12,
        border: `1px solid rgba(255, 255, 255, 0.08)`,
        padding: 24,
        fontFamily: FONTS.mono,
        fontSize: 18,
        lineHeight: 1.8,
        overflow: "hidden",
        boxShadow: `0 20px 60px rgba(0, 0, 0, 0.5)`,
      }}
    >
      <div style={{ color: COLORS.textSecondary, marginBottom: 16, fontSize: 14 }}>
        claude-code ~
      </div>
      {lines.map((line, i) => {
        const localFrame = frame - line.delay;
        if (localFrame < 0) return null;
        const charsVisible = Math.min(
          Math.floor(localFrame * CHARS_PER_FRAME),
          line.text.length
        );
        const text = line.text.slice(0, charsVisible);
        const showCursor =
          charsVisible < line.text.length &&
          i === lines.findIndex((l) => {
            const lf = frame - l.delay;
            return lf >= 0 && Math.floor(lf * CHARS_PER_FRAME) < l.text.length;
          });

        return (
          <div key={i} style={{ display: "flex" }}>
            {line.isCommand && (
              <span style={{ color: COLORS.accent, marginRight: 8 }}>{">"}</span>
            )}
            <span style={{ color: line.color || (line.isCommand ? "#FFFFFF" : COLORS.textSecondary) }}>
              {text}
            </span>
            {showCursor && (
              <span
                style={{
                  color: COLORS.accent,
                  opacity: interpolate(frame % 16, [0, 8, 16], [1, 0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                }}
              >
                █
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
