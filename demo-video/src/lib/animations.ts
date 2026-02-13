import { spring, interpolate } from "remotion";

export const SPRING_CONFIGS = {
  smooth: { damping: 200 },
  snappy: { damping: 20, stiffness: 200 },
  bouncy: { damping: 12 },
} as const;

export const fadeIn = (frame: number, fps: number, delay = 0) =>
  interpolate(frame - delay, [0, fps * 0.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

export const slideUp = (frame: number, fps: number, delay = 0) => {
  const progress = spring({
    frame: frame - delay,
    fps,
    config: SPRING_CONFIGS.smooth,
  });
  return {
    opacity: progress,
    transform: `translateY(${interpolate(progress, [0, 1], [40, 0])}px)`,
  };
};

export const scaleIn = (frame: number, fps: number, delay = 0) => {
  const progress = spring({
    frame: frame - delay,
    fps,
    config: SPRING_CONFIGS.bouncy,
  });
  return {
    opacity: Math.min(progress * 2, 1),
    transform: `scale(${interpolate(progress, [0, 1], [0.8, 1])})`,
  };
};

export const zoomPan = (
  frame: number,
  fps: number,
  options: {
    startScale: number;
    endScale: number;
    startX: number;
    endX: number;
    startY: number;
    endY: number;
    durationFrames: number;
    delay?: number;
  }
) => {
  const { startScale, endScale, startX, endX, startY, endY, durationFrames, delay = 0 } = options;
  const progress = interpolate(frame - delay, [0, durationFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const scale = interpolate(progress, [0, 1], [startScale, endScale]);
  const x = interpolate(progress, [0, 1], [startX, endX]);
  const y = interpolate(progress, [0, 1], [startY, endY]);

  return {
    transform: `scale(${scale}) translate(${x}px, ${y}px)`,
    transformOrigin: "center center",
  };
};
