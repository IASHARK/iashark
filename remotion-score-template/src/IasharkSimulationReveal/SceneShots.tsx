import {BrandHeader, DarkStadium, DataRain, MatchBar, MetricResult, StepRail, type SimulationRevealProps} from "./shared";

export const SceneShots: React.FC<SimulationRevealProps> = (props) => (
  <DarkStadium darkness={0.78}>
    <DataRain items={["6.8", "11.2", "8.4", "10.1", "7.7", "9.6", "12.0"]} />
    <BrandHeader kicker={`${props.simulationCount.toLocaleString("fr-FR")} scénarios analysés`} />
    <MatchBar {...props} />
    <MetricResult
      label="CALCUL DES OCCASIONS CADRÉES"
      value={props.expectedShotsOnTarget}
      suffix="TIRS CADRÉS DANS LE MATCH"
      candidates={["6,8", "11,2", "8,4", "10,1", "7,7", "12,0"]}
    />
    <StepRail active={2} />
  </DarkStadium>
);
