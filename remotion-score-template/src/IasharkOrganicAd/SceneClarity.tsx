import {Easing, Interactive, interpolate, useCurrentFrame} from "remotion";
import {BottomStatement, BrandLogo, DataBackground, Kicker, SceneTitle} from "./shared";
import {COLORS, FONTS} from "./theme";

const CARDS = [
  {index: "01", title: "PROBABILITÉS", detail: "MESURER", progress: 0.78},
  {index: "02", title: "SCÉNARIOS", detail: "COMPRENDRE", progress: 0.64},
  {index: "03", title: "RISQUES", detail: "ANTICIPER", progress: 0.46},
];

export const SceneClarity: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <DataBackground darkness={0.66} showBall={false}>
      <BrandLogo top={72} width={360} />
      <Kicker top={226}>Les signaux utiles. Rien d&apos;inutile.</Kicker>
      <SceneTitle top={315} size={105}>VOIS CE QUI COMPTE</SceneTitle>

      <div style={{position: "absolute", top: 575, left: 88, right: 88, display: "flex", flexDirection: "column", gap: 28}}>
        {CARDS.map((card, index) => {
          const delay = 8 + index * 11;
          return (
            <Interactive.Div
              key={card.title}
              name={card.title}
              style={{
                height: 205,
                borderRadius: 23,
                border: "1px solid rgba(34,211,238,.5)",
                background: "linear-gradient(110deg,rgba(8,25,38,.96),rgba(3,12,19,.9))",
                display: "grid",
                gridTemplateColumns: "130px 1fr 235px",
                alignItems: "center",
                padding: "0 38px",
                boxShadow: "0 20px 45px rgba(0,0,0,.48), inset 0 0 30px rgba(34,211,238,.06)",
                opacity: interpolate(frame, [delay, delay + 9], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                translate: interpolate(frame, [delay, delay + 15], [index % 2 === 0 ? "-70px 0px" : "70px 0px", "0px 0px"], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.out(Easing.cubic),
                }),
              }}
            >
              <div style={{color: COLORS.cyan, fontFamily: FONTS.display, fontSize: 68, fontStyle: "italic"}}>{card.index}</div>
              <div>
                <div style={{color: COLORS.text, fontFamily: FONTS.display, fontStyle: "italic", fontSize: 57, lineHeight: 1}}>{card.title}</div>
                <div style={{color: COLORS.muted, fontFamily: FONTS.mono, fontWeight: 900, fontSize: 18, letterSpacing: 4, marginTop: 14}}>{card.detail}</div>
              </div>
              <div>
                <div style={{height: 14, borderRadius: 20, overflow: "hidden", background: "#102c3a"}}>
                  <div
                    style={{
                      width: `${interpolate(frame, [delay + 8, delay + 35], [0, card.progress * 100], {
                        extrapolateLeft: "clamp",
                        extrapolateRight: "clamp",
                        easing: Easing.out(Easing.cubic),
                      })}%`,
                      height: "100%",
                      background: COLORS.cyan,
                      boxShadow: `0 0 15px ${COLORS.cyan}`,
                    }}
                  />
                </div>
                <div style={{color: COLORS.dim, fontFamily: FONTS.mono, fontSize: 15, letterSpacing: 2, marginTop: 12, textAlign: "right"}}>SIGNAL ANALYSÉ</div>
              </div>
            </Interactive.Div>
          );
        })}
      </div>

      <BottomStatement><span style={{color: COLORS.cyan}}>Même les risques</span> restent visibles</BottomStatement>
    </DataBackground>
  );
};
