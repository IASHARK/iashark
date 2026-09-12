export const COLORS = {
  background: "#02070c",
  panel: "#071521",
  cyan: "#22d3ee",
  cyanDeep: "#06a8c5",
  text: "#eefaff",
  muted: "#9cb4c5",
  dim: "#547082",
};

export const FONTS = {
  display: 'Impact, "Arial Black", sans-serif',
  body: 'Arial, Helvetica, sans-serif',
  mono: '"Courier New", monospace',
};

export const FPS = 30;
export const HOOK_DURATION = 60;
export const DATA_DURATION = 105;
export const PROOF_DURATION = 105;
export const CLARITY_DURATION = 90;
export const OUTRO_DURATION = 90;
export const TRANSITION_DURATION = 6;
export const ORGANIC_AD_DURATION =
  HOOK_DURATION + DATA_DURATION + PROOF_DURATION + CLARITY_DURATION + OUTRO_DURATION - TRANSITION_DURATION * 4;
