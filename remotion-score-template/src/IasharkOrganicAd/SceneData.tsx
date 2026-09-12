import {Easing, Interactive, interpolate, useCurrentFrame} from "remotion";
import {BottomStatement, BrandLogo, DataBackground, Kicker, SceneTitle} from "./shared";
import {COLORS, FONTS} from "./theme";

const SIGNALS = [
  {label: "FORME RÉCENTE", left: 78, top: 690, delay: 8},
  {label: "RYTHME", left: 655, top: 760, delay: 16},
  {label: "ABSENCES", left: 98, top: 1025, delay: 25},
  {label: "CONTEXTE", left: 635, top: 1115, delay: 34},
];

export const SceneData: React.FC = () => {
  const frame = useCurrentFrame();
  const simulationCount = Math.round(
    interpolate(frame, [20, 78], [0, 20000], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }),
  );
  return (
    <DataBackground darkness={0.34}>
      <BrandLogo top={72} width={360} />
      <Kicker top={226}>Forme · rythme · absences · contexte</Kicker>
      <SceneTitle top={300} size={91}>DERRIÈRE CHAQUE MATCH</SceneTitle>

      <div
        style={{
          position: "absolute",
          left: 155,
          right: 155,
          top: interpolate(frame, [0, 104], [640, 1120], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
          }),
          height: 4,
          background: `linear-gradient(90deg,transparent,${COLORS.cyan},transparent)`,
          boxShadow: `0 0 20px 5px ${COLORS.cyan}`,
          opacity: 0.75,
        }}
      />

      {SIGNALS.map((signal) => (
        <Interactive.Div
          key={signal.label}
          name={signal.label}
          style={{
            position: "absolute",
            left: signal.left,
            top: signal.top,
            minWidth: 300,
            padding: "17px 22px",
            borderLeft: `4px solid ${COLORS.cyan}`,
            background: "linear-gradient(90deg,rgba(2,13,21,.92),rgba(3,17,27,.42))",
            color: COLORS.text,
            fontFamily: FONTS.mono,
            fontSize: 23,
            fontWeight: 900,
            letterSpacing: 2.2,
            boxShadow: "0 12px 28px rgba(0,0,0,.45)",
            opacity: interpolate(frame, [signal.delay, signal.delay + 9], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            translate: interpolate(frame, [signal.delay, signal.delay + 13], [signal.left < 500 ? "-45px 0px" : "45px 0px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
          }}
        >
          <span style={{color: COLORS.cyan, marginRight: 13}}>●</span>
          {signal.label}
        </Interactive.Div>
      ))}

      <Interactive.Div
        name="20 000 simulations"
        style={{
          position: "absolute",
          top: 1280,
          left: 170,
          right: 170,
          height: 155,
          borderRadius: 22,
          border: "1px solid rgba(34,211,238,.62)",
          background: "linear-gradient(120deg,rgba(5,25,38,.96),rgba(2,11,18,.9))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 27,
          boxShadow: "0 18px 40px rgba(0,0,0,.5), inset 0 0 28px rgba(34,211,238,.08)",
          opacity: interpolate(frame, [30, 41], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [29, 45], [0.9, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({damping: 18, stiffness: 120}),
            output: "perceptual-scale",
          }),
        }}
      >
        <div style={{color: COLORS.text, fontFamily: FONTS.display, fontStyle: "italic", fontSize: 83, lineHeight: 1}}>
          {simulationCount.toLocaleString("fr-FR")}
        </div>
        <div style={{color: COLORS.cyan, fontFamily: FONTS.mono, fontWeight: 900, fontSize: 25, letterSpacing: 4, lineHeight: 1.25}}>
          SIMULATIONS
          <br />
          DU MATCH
        </div>
      </Interactive.Div>

      <BottomStatement>Les données deviennent des scénarios</BottomStatement>
    </DataBackground>
  );
};
