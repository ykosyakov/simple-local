import { loadFont as loadJetBrains } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const jetbrains = loadJetBrains("normal", {
  weights: ["400", "700"],
  subsets: ["latin"],
});

const inter = loadInter("normal", {
  weights: ["400", "600", "700"],
  subsets: ["latin"],
});

export const FONTS = {
  mono: jetbrains.fontFamily,
  sans: inter.fontFamily,
} as const;
