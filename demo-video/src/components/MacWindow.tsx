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
      <div
        style={{
          height: 36,
          backgroundColor: "#1C1C1E",
          display: "flex",
          alignItems: "center",
          paddingLeft: 14,
          gap: 8,
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#FF5F57" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#FEBC2E" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: "#28C840" }} />
      </div>
      <div style={{ overflow: "hidden" }}>{children}</div>
    </div>
  );
};
