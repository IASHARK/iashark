import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";
import {BrandLogo, StadiumPlate} from "./shared";
import {CITY_COLORS, CITY_FONTS} from "./theme";

const MARKETS = ["RÉSULTAT", "TOTAL DE BUTS", "LES DEUX MARQUENT", "TIRS CADRÉS"];
const SCENARIOS = ["1–0", "2–1", "1–1", "0–0", "2–0", "0–1", "1–2", "2–2", "3–1", "0–2", "1–0", "2–1"];
const FILTERS = ["ANALYSE MULTI-SCÉNARIOS", "FILTRAGE DES SIGNAUX FAIBLES", "CROISEMENT DES DONNÉES"];

const reveal = (frame: number, start: number, duration = 10) =>
  interpolate(frame, [start, start + duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

export const SceneFilter: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const motionFrame = frame * (5 / 7);
  const selection = spring({frame: motionFrame - 84, fps, config: {damping: 16, stiffness: 115, mass: 0.8}});

  return (
    <StadiumPlate darkness={0.74}>
      <div
        style={{
          position: "absolute",
          left: 225,
          top: 85,
          width: 420,
          height: 1144,
          scale: 1.5,
          transformOrigin: "top left",
          borderRadius: 20,
          background: "linear-gradient(180deg,rgba(1,13,21,.84),rgba(1,10,17,.62))",
          boxShadow: "0 0 90px rgba(0,0,0,.46),inset 0 0 60px rgba(32,217,243,.08)",
          opacity: reveal(motionFrame, 8, 8),
          translate: interpolate(motionFrame, [8, 18], ["0px 22px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
        }}
      >
        <div style={{position: "absolute", top: 34, left: 78, opacity: reveal(motionFrame, 0)}}>
          <BrandLogo width={264} />
        </div>

        <div style={{position: "absolute", top: 210, left: 16, right: 16, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 7}}>
          {MARKETS.map((market, index) => {
            const visible = reveal(motionFrame, 18 + index * 4);
            return (
              <div
                key={market}
                style={{
                  height: 96,
                  borderRadius: 9,
                  border: "1px solid rgba(32,217,243,.75)",
                  background: "linear-gradient(155deg,rgba(7,31,46,.98),rgba(1,10,18,.96))",
                  boxShadow: "inset 0 0 14px rgba(32,217,243,.08),0 0 9px rgba(32,217,243,.12)",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: 8,
                  opacity: visible,
                  scale: 0.82 + visible * 0.18,
                }}
              >
                <div style={{display: "flex", alignItems: "flex-end", gap: 3, height: 22}}>
                  {[9, 16, 22].map((height, barIndex) => (
                    <div key={height} style={{width: 6, height, borderRadius: 2, background: barIndex === 2 ? CITY_COLORS.cyan : "#b7d9e2", boxShadow: `0 0 7px ${CITY_COLORS.cyan}66`}} />
                  ))}
                </div>
                <div style={{height: 30, display: "grid", placeItems: "center", padding: "0 3px", color: CITY_COLORS.white, textAlign: "center", fontFamily: CITY_FONTS.mono, fontSize: market.length > 13 ? 9 : 11, lineHeight: 1.05, fontWeight: 900}}>
                  {market}
                </div>
              </div>
            );
          })}
        </div>

        <svg width="420" height="1144" viewBox="0 0 420 1144" style={{position: "absolute", inset: 0, pointerEvents: "none", opacity: reveal(motionFrame, 28)}}>
          {[62, 160, 260, 358].map((x, index) => (
            <path
              key={x}
              d={`M ${x} 308 C ${x} 417, ${210 + (index - 1.5) * 38} 447, 210 562 C 210 652, 210 702, 210 802`}
              fill="none"
              stroke={index % 2 === 0 ? "rgba(32,217,243,.72)" : "rgba(167,231,243,.42)"}
              strokeWidth="1.4"
              strokeDasharray="4 7"
            />
          ))}
        </svg>

        {SCENARIOS.map((scenario, index) => {
          const col = index % 4;
          const row = Math.floor(index / 4);
          const start = 30 + index * 1.8;
          const appear = reveal(motionFrame, start, 8);
          const travel = interpolate(motionFrame, [44, 84], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
          });
          const weak = [1, 3, 4, 6, 9, 11].includes(index);
          const x = 24 + col * 101;
          const y = 337 + row * 66;
          const targetX = 165 + (index % 3) * 26;
          const targetY = 557 + (index % 4) * 33;
          return (
            <div
              key={`${scenario}-${index}`}
              style={{
                position: "absolute",
                left: interpolate(travel, [0, 1], [x, targetX]),
                top: interpolate(travel, [0, 1], [y, targetY]),
                width: 66,
                height: 42,
                borderRadius: 6,
                border: "1px solid rgba(32,217,243,.35)",
                background: "rgba(4,22,34,.88)",
                display: "grid",
                placeItems: "center",
                color: CITY_COLORS.white,
                fontFamily: CITY_FONTS.mono,
                fontSize: 15,
                fontWeight: 900,
                opacity: appear * (weak ? interpolate(motionFrame, [57, 84], [1, 0.08], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}) : interpolate(motionFrame, [65, 88], [1, 0.42], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})),
                scale: interpolate(travel, [0, 1], [1, 0.72]),
                filter: weak ? `blur(${travel * 2.5}px)` : undefined,
              }}
            >
              {scenario}
            </div>
          );
        })}

        {FILTERS.map((filter, index) => {
          const delay = 45 + index * 14;
          const active = reveal(motionFrame, delay, 10);
          return (
            <div
              key={filter}
              style={{
                position: "absolute",
                top: 524 + index * 104,
                left: 76 + index * 17,
                right: 76 + index * 17,
                height: 34,
                borderRadius: 999,
                border: `1px solid rgba(32,217,243,${0.28 + active * 0.65})`,
                background: "rgba(2,16,25,.95)",
                boxShadow: `0 0 ${8 + active * 18}px rgba(32,217,243,${active * 0.38})`,
                display: "grid",
                placeItems: "center",
                color: active > 0.55 ? CITY_COLORS.white : CITY_COLORS.muted,
                fontFamily: CITY_FONTS.mono,
                fontSize: 9.5,
                fontWeight: 900,
                letterSpacing: 0.4,
                opacity: reveal(motionFrame, delay - 7),
              }}
            >
              {filter}
            </div>
          );
        })}

        <div
          style={{
            position: "absolute",
            top: 829,
            left: 78,
            right: 78,
            height: 112,
            borderRadius: 12,
            border: `2px solid ${CITY_COLORS.cyan}`,
            background: "linear-gradient(145deg,rgba(7,42,60,.98),rgba(1,13,21,.98))",
            boxShadow: `0 0 ${20 + selection * 25}px rgba(32,217,243,.45),inset 0 0 24px rgba(32,217,243,.12)`,
            display: "grid",
            placeItems: "center",
            textAlign: "center",
            opacity: selection,
            scale: 0.78 + selection * 0.22,
          }}
        >
          <div>
            <div style={{fontFamily: CITY_FONTS.mono, color: CITY_COLORS.muted, fontSize: 10, letterSpacing: 3, fontWeight: 900}}>SIGNAL RETENU</div>
            <div style={{fontFamily: CITY_FONTS.display, color: CITY_COLORS.white, fontSize: 31, marginTop: 7}}>SÉLECTION <span style={{color: CITY_COLORS.cyan}}>IASHARK</span></div>
          </div>
        </div>

        <div style={{position: "absolute", top: 963, left: 18, right: 18, borderTop: "1px solid rgba(32,217,243,.4)", paddingTop: 12, textAlign: "center", color: CITY_COLORS.white, fontFamily: CITY_FONTS.mono, fontSize: 11, lineHeight: 1.45, fontWeight: 900, letterSpacing: 1.4, opacity: reveal(motionFrame, 94)}}>
          LES SIGNAUX LES PLUS SOLIDES<br /><span style={{color: CITY_COLORS.cyan, fontSize: 15}}>RESSORTENT</span>
        </div>
      </div>
    </StadiumPlate>
  );
};
