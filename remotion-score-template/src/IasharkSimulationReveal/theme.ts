export const COLORS = {
  background: "#01060a",
  panel: "rgba(4, 18, 28, 0.94)",
  cyan: "#08d9ff",
  cyanSoft: "#78ecff",
  text: "#f4fbff",
  muted: "#8eabb9",
  dim: "#456472",
};

export const FONTS = {
  display: 'Impact, "Arial Black", Arial, sans-serif',
  body: 'Arial, Helvetica, sans-serif',
  mono: '"Courier New", monospace',
};

export const COUNTER_DURATION = 180;
export const GOALS_DURATION = 174;
export const SHOTS_DURATION = 174;
export const SCORER_DURATION = 174;
export const OUTRO_DURATION = 192;
export const TRANSITION_DURATION = 6;

export const SIMULATION_REVEAL_DURATION =
  COUNTER_DURATION +
  GOALS_DURATION +
  SHOTS_DURATION +
  SCORER_DURATION +
  OUTRO_DURATION -
  TRANSITION_DURATION * 4;
