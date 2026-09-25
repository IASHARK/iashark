import {AbsoluteFill} from "remotion";
import {TransitionSeries, linearTiming} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import type {SimulationRevealProps} from "./shared";
import {SceneCounter} from "./SceneCounter";
import {SceneGoals} from "./SceneGoals";
import {SceneShots} from "./SceneShots";
import {SceneScorer} from "./SceneScorer";
import {SceneOutro} from "./SceneOutro";
import {
  COUNTER_DURATION,
  GOALS_DURATION,
  OUTRO_DURATION,
  SCORER_DURATION,
  SHOTS_DURATION,
  TRANSITION_DURATION,
} from "./theme";

export const IasharkSimulationReveal: React.FC<SimulationRevealProps> = (props) => (
  <AbsoluteFill style={{background: "#01060a"}}>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={COUNTER_DURATION} name="01 — 20 000 simulations">
        <SceneCounter {...props} />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: TRANSITION_DURATION})} />
      <TransitionSeries.Sequence durationInFrames={GOALS_DURATION} name="02 — Buts attendus">
        <SceneGoals {...props} />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: TRANSITION_DURATION})} />
      <TransitionSeries.Sequence durationInFrames={SHOTS_DURATION} name="03 — Tirs cadrés">
        <SceneShots {...props} />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: TRANSITION_DURATION})} />
      <TransitionSeries.Sequence durationInFrames={SCORER_DURATION} name="04 — Buteur">
        <SceneScorer {...props} />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: TRANSITION_DURATION})} />
      <TransitionSeries.Sequence durationInFrames={OUTRO_DURATION} name="05 — Résumé">
        <SceneOutro {...props} />
      </TransitionSeries.Sequence>
    </TransitionSeries>
  </AbsoluteFill>
);
