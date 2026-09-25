import {BrandHeader, DarkStadium, DataRain, MatchBar, MetricResult, StepRail, type SimulationRevealProps} from "./shared";

export const SceneScorer: React.FC<SimulationRevealProps> = (props) => (
  <DarkStadium darkness={0.78}>
    <DataRain items={["ISCO", "MAYORAL", "ANTONY", "RIQUELME", "ALDERETE", "DEOSSA"]} />
    <BrandHeader kicker={`${props.simulationCount.toLocaleString("fr-FR")} scénarios analysés`} />
    <MatchBar {...props} />
    <MetricResult
      label="CALCUL DU BUTEUR LE PLUS RÉCURRENT"
      value={props.scorer}
      suffix="BUTEUR QUI RESSORT LE PLUS"
      candidates={["ISCO", "MAYORAL", "ANTONY", "ALDERETE", "DEOSSA"]}
    />
    <StepRail active={3} />
  </DarkStadium>
);
