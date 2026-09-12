import {Audio, AbsoluteFill, Sequence, staticFile} from "remotion";
import {TransitionSeries, linearTiming} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import {SceneHook} from "./SceneHook";
import {SceneData} from "./SceneData";
import {SceneSimulations} from "./SceneSimulations";
import {SceneClarity} from "./SceneClarity";
import {SceneOutro} from "./SceneOutro";
import {CyanFlash} from "./shared";
import {CLARITY_DURATION, DATA_DURATION, HOOK_DURATION, OUTRO_DURATION, PROOF_DURATION, TRANSITION_DURATION} from "./theme";

const TimedSound: React.FC<{from: number; src: string; volume: number}> = ({from, src, volume}) => (
  <Sequence from={from} layout="none">
    <Audio src={staticFile(src)} volume={volume} />
  </Sequence>
);

export const IasharkOrganicAd: React.FC = () => {
  return (
    <AbsoluteFill style={{background: "#02070c"}}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={HOOK_DURATION} name="01 — Hook">
          <SceneHook />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: TRANSITION_DURATION})} />
        <TransitionSeries.Sequence durationInFrames={DATA_DURATION} name="02 — Data et simulations">
          <SceneData />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: TRANSITION_DURATION})} />
        <TransitionSeries.Sequence durationInFrames={PROOF_DURATION} name="03 — Résultats V3">
          <SceneSimulations />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: TRANSITION_DURATION})} />
        <TransitionSeries.Sequence durationInFrames={CLARITY_DURATION} name="04 — Lecture claire">
          <SceneClarity />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: TRANSITION_DURATION})} />
        <TransitionSeries.Sequence durationInFrames={OUTRO_DURATION} name="05 — Signature IASHARK">
          <SceneOutro />
        </TransitionSeries.Sequence>
      </TransitionSeries>

      <Sequence from={4} layout="none">
        <Audio src={staticFile("ads/audio/iashark-organic-v3-voiceover.wav")} volume={1} />
      </Sequence>
      <TimedSound from={4} src="ads/audio/whoosh.wav" volume={0.5} />
      <TimedSound from={54} src="ads/audio/whoosh.wav" volume={0.4} />
      <TimedSound from={153} src="ads/audio/switch.wav" volume={0.32} />
      <TimedSound from={252} src="ads/audio/whoosh.wav" volume={0.36} />
      <TimedSound from={336} src="ads/audio/ding.wav" volume={0.36} />

      {[52, 151, 250, 334].map((from) => (
        <Sequence key={from} from={from} durationInFrames={10} layout="absolute-fill">
          <CyanFlash />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
