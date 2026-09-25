import {BrandHeader, DarkStadium, DataRain, MatchBar, MetricResult, StepRail, type SimulationRevealProps} from "./shared";

export const SceneGoals: React.FC<SimulationRevealProps> = (props) => (
  <DarkStadium darkness={0.78}>
    <DataRain items={["0.9", "1.7", "3.2", "2.1", "2.8", "1.4", "2.5"]} />
    <BrandHeader kicker={`${props.simulationCount.toLocaleString("fr-FR")} scénarios analysés`} />
    <MatchBar {...props} />
    <MetricResult
      label="CALCUL DU VOLUME OFFENSIF"
      value={props.expectedGoals}
      suffix="BUTS DANS LE MATCH"
      candidates={["1,4", "3,1", "2,0", "2,8", "1,9", "2,6"]}
    />
    <StepRail active={1} />
  </DarkStadium>
);
