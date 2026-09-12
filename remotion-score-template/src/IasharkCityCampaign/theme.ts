export const CITY_COLORS = {
  black: "#01060a",
  navy: "#03121d",
  panel: "#061925",
  cyan: "#20d9f3",
  cyanDeep: "#079fbd",
  white: "#f4fbff",
  muted: "#92aebb",
  dim: "#4f6a77",
};

export const CITY_FONTS = {
  display: 'Impact, "Arial Black", sans-serif',
  body: 'Arial, Helvetica, sans-serif',
  mono: '"Courier New", monospace',
};

export const SIMULATION_DURATION = 120;
export const FILTER_DURATION = 210;
export const PROOF_DURATION = 120;
export const CITY_OUTRO_DURATION = 90;
export const CITY_TRANSITION_DURATION = 10;

export const CITY_CAMPAIGN_DURATION =
  SIMULATION_DURATION +
  FILTER_DURATION +
  PROOF_DURATION +
  CITY_OUTRO_DURATION -
  CITY_TRANSITION_DURATION * 3;
