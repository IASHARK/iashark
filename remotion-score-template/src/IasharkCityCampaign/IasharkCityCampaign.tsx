import {AbsoluteFill, Audio, Sequence, staticFile} from "remotion";
import {TransitionSeries, linearTiming} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import {SceneSimulations} from "./SceneSimulations";
import {SceneFilter} from "./SceneFilter";
import {SceneProof} from "./SceneProof";
import {SceneCityOutro} from "./SceneCityOutro";
import {CyanFlash} from "./shared";
import {
  CITY_OUTRO_DURATION,
  CITY_TRANSITION_DURATION,
  FILTER_DURATION,
  PROOF_DURATION,
  SIMULATION_DURATION,
} from "./theme";

const TimedSound: React.FC<{from: number; src: string; volume: number}> = ({from, src, volume}) => (
  <Sequence from={from} layout="none">
    <Audio src={staticFile(src)} volume={volume} />
  </Sequence>
);

const starts = {
  filter: SIMULATION_DURATION - CITY_TRANSITION_DURATION,
  proof: SIMULATION_DURATION - CITY_TRANSITION_DURATION + FILTER_DURATION - CITY_TRANSITION_DURATION,
};
const outroStart = starts.proof + PROOF_DURATION - CITY_TRANSITION_DURATION;

export const IasharkCityCampaign: React.FC = () => (
  <AbsoluteFill style={{background: "#01060a"}}>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SIMULATION_DURATION} name="01 — 20 000 simulations">
        <SceneSimulations />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: CITY_TRANSITION_DURATION})} />
      <TransitionSeries.Sequence durationInFrames={FILTER_DURATION} name="02 — Analyse multi-scénarios">
        <SceneFilter />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: CITY_TRANSITION_DURATION})} />
      <TransitionSeries.Sequence durationInFrames={PROOF_DURATION} name="03 — 87 pour cent">
        <SceneProof />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: CITY_TRANSITION_DURATION})} />
      <TransitionSeries.Sequence durationInFrames={CITY_OUTRO_DURATION} name="04 — IASHARK">
        <SceneCityOutro />
      </TransitionSeries.Sequence>
    </TransitionSeries>

    <TimedSound from={2} src="ads/audio/switch.wav" volume={0.22} />
    <TimedSound from={46} src="ads/audio/ding.wav" volume={0.24} />
    <TimedSound from={starts.filter - 2} src="ads/audio/whoosh.wav" volume={0.36} />
    <TimedSound from={starts.filter + 63} src="ads/audio/switch.wav" volume={0.26} />
    <TimedSound from={starts.filter + 102} src="ads/audio/switch.wav" volume={0.3} />
    <TimedSound from={starts.filter + 132} src="ads/audio/ding.wav" volume={0.3} />
    <TimedSound from={starts.proof - 2} src="ads/audio/whoosh.wav" volume={0.4} />
    <TimedSound from={starts.proof + 49} src="ads/audio/ding.wav" volume={0.42} />
    <TimedSound from={outroStart - 2} src="ads/audio/whoosh.wav" volume={0.42} />

    {[starts.filter - 3, starts.proof - 3, outroStart - 3].map((from) => (
      <Sequence key={from} from={from} durationInFrames={10} layout="absolute-fill">
        <CyanFlash />
      </Sequence>
    ))}
  </AbsoluteFill>
);
