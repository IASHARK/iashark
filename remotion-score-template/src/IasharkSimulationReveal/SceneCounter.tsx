import {Easing, Interactive, interpolate, useCurrentFrame, useVideoConfig} from "remotion";
import {BrandHeader, DarkStadium, DataRain, MatchBar, type SimulationRevealProps} from "./shared";
import {COLORS, FONTS} from "./theme";

export const SceneCounter: React.FC<SimulationRevealProps> = (props) => {
  const frame = useCurrentFrame();
  const {height} = useVideoConfig();
  const compact = height < 1600;
  const count = Math.floor(
    interpolate(frame, [8, 62], [0, props.simulationCount], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }),
  );
  const complete = frame >= 62;

  return (
    <DarkStadium darkness={0.74}>
      <DataRain items={["xG HOME 1.8", "xG AWAY 0.7", "FORME 5 MATCHS", "DOMICILE", "EXTÉRIEUR", "MONTE CARLO"]} />
      <BrandHeader kicker="Moteur de simulation IASHARK" />
      <MatchBar {...props} />

      <Interactive.Div
        name="Simulation counter"
        style={{
          position: "absolute",
          top: compact ? 410 : 605,
          left: 65,
          right: 65,
          height: compact ? 420 : 610,
          borderRadius: compact ? 220 : 320,
          border: complete ? "3px solid #08d9ff" : "2px solid rgba(8,217,255,.34)",
          background: "radial-gradient(circle,rgba(4,35,49,.96),rgba(1,8,14,.97) 62%,rgba(0,2,5,.98))",
          boxShadow: complete
            ? "0 0 55px rgba(8,217,255,.35),inset 0 0 70px rgba(8,217,255,.12)"
            : "inset 0 0 45px rgba(8,217,255,.07)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          scale: interpolate(frame, [0, 18], [0.9, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({damping: 20, stiffness: 110}),
            output: "perceptual-scale",
          }),
        }}
      >
        <div style={{color: COLORS.muted, fontFamily: FONTS.mono, fontSize: 23, fontWeight: 900, letterSpacing: 7}}>
          MATCHS REJOUÉS
        </div>
        <div
          style={{
            color: complete ? COLORS.cyan : COLORS.text,
            fontFamily: FONTS.display,
            fontStyle: "italic",
            fontSize: compact ? 165 : 205,
            lineHeight: 0.95,
            marginTop: 28,
            letterSpacing: -4,
            textShadow: complete ? "0 0 32px rgba(8,217,255,.62)" : "0 12px 25px rgba(0,0,0,.9)",
          }}
        >
          {count.toLocaleString("fr-FR")}
        </div>
        <div style={{color: complete ? COLORS.cyanSoft : COLORS.dim, fontFamily: FONTS.mono, fontSize: 19, fontWeight: 900, letterSpacing: 5, marginTop: 30}}>
          {complete ? "SIMULATION TERMINÉE" : "CALCUL EN COURS"}
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Hook"
        style={{
          position: "absolute",
          top: compact ? 930 : 1380,
          left: 95,
          right: 95,
          textAlign: "center",
          color: COLORS.text,
          fontFamily: FONTS.display,
          fontStyle: "italic",
          fontSize: compact ? 67 : 86,
          lineHeight: 0.94,
          textTransform: "uppercase",
          opacity: interpolate(frame, [70, 88], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
          translate: interpolate(frame, [70, 92], ["0px 35px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
        }}
      >
        20 000 SCÉNARIOS.<br />
        <span style={{color: COLORS.cyan}}>QU’EST-CE QUI RESSORT ?</span>
      </Interactive.Div>
    </DarkStadium>
  );
};
