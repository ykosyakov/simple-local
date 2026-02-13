import React from "react";
import { COLORS } from "../lib/constants";

type MacWindowProps = {
  children: React.ReactNode;
  width?: number;
  style?: React.CSSProperties;
};

export const MacWindow: React.FC<MacWindowProps> = ({
  children,
  width = 1600,
  style,
}) => {
  return (
    <div
      style={{
        width,
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: `0 25px 80px rgba(0, 0, 0, 0.6), 0 0 40px ${COLORS.accentDim}`,
        border: `1px solid rgba(255, 255, 255, 0.08)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
