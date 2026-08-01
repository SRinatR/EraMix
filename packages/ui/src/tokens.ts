export const SPACING_SCALE_PX = [0, 4, 8, 12, 16, 24, 32, 48, 64, 96] as const;

export type SpacingStep = (typeof SPACING_SCALE_PX)[number];
