import {Easing, Interactive, interpolate, useCurrentFrame} from "remotion";
import {BottomStatement, BrandLogo, DataBackground, Kicker} from "./shared";
import {COLORS, FONTS} from "./theme";

export const SceneSimulations: React.FC = () => {
  const frame = useCurrentFrame();
  const circumference = 2 * Math.PI * 285;
  const displayedScore = Math.round(
    interpolate(frame, [5, 55], [0, 87], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }),
  );

  return (
    <DataBackground darkness={0.58}>
      <BrandLogo top={72} width={360} />
      <Kicker top={226}>Moteur IASHARK V3 · résultats du backtest</Kicker>

      <div style={{position: "absolute", top: 350, left: 0, right: 0, height: 790}}>
        <svg width="1080" height="790" viewBox="0 0 1080 790" style={{position: "absolute", inset: 0}}>
          <circle cx="540" cy="395" r="285" fill="rgba(1,9,15,.72)" stroke="#103545" strokeWidth="12" />
          <circle
            cx="540"
            cy="395"
            r="285"
            fill="none"
            stroke={COLORS.cyan}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={interpolate(frame, [4, 58], [circumference, circumference * 0.13], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            })}
            style={{filter: `drop-shadow(0 0 16px ${COLORS.cyan})`, rotate: "-90deg", transformOrigin: "540px 395px"}}
          />
          <circle cx="540" cy="395" r="238" fill="none" stroke="rgba(34,211,238,.22)" strokeWidth="2" strokeDasharray="7 16" />
          <circle cx="540" cy="395" r="330" fill="none" stroke="rgba(34,211,238,.12)" strokeWidth="2" strokeDasharray="2 18" />
        </svg>

        <Interactive.Div
          name="Selected markets result"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            paddingBottom: 4,
            opacity: interpolate(frame, [2, 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          <div style={{color: COLORS.cyan, fontFamily: FONTS.mono, fontWeight: 900, fontSize: 28, letterSpacing: 6}}>V3 · MARCHÉS SÉLECTIONNÉS</div>
          <div style={{color: COLORS.text, fontFamily: FONTS.display, fontStyle: "italic", fontSize: 214, lineHeight: 0.95, marginTop: 26, textShadow: "0 12px 28px rgba(0,0,0,.9)"}}>
            {displayedScore}<span style={{color: COLORS.cyan, fontSize: 120}}>%</span>
          </div>
          <div style={{color: COLORS.text, fontFamily: FONTS.display, fontStyle: "italic", fontSize: 57, letterSpacing: 1.2, marginTop: 15}}>DE RÉUSSITE MESURÉE</div>
        </Interactive.Div>
      </div>

      <Interactive.Div
        name="Score scenario result"
        style={{
          position: "absolute",
          top: 1265,
          left: 205,
          right: 205,
          height: 128,
          borderRadius: 20,
          border: "1px solid rgba(34,211,238,.45)",
          background: "linear-gradient(120deg,rgba(7,26,39,.94),rgba(2,11,18,.9))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
          boxShadow: "0 15px 36px rgba(0,0,0,.48)",
          opacity: interpolate(frame, [42, 53], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [41, 58], ["0px 32px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
        }}
      >
        <span style={{color: COLORS.cyan, fontFamily: FONTS.display, fontStyle: "italic", fontSize: 68}}>77%</span>
        <span style={{color: COLORS.muted, fontFamily: FONTS.mono, fontWeight: 900, fontSize: 21, letterSpacing: 3, lineHeight: 1.35}}>DES SCÉNARIOS<br />À UN BUT PRÈS</span>
      </Interactive.Div>

      <BottomStatement>Mesures historiques du modèle · aucune garantie</BottomStatement>
    </DataBackground>
  );
};
