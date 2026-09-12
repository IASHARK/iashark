import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";
import {BrandLogo, CyanFlash, StadiumPlate} from "./shared";
import {CITY_COLORS, CITY_FONTS} from "./theme";

const TickRing: React.FC<{lit: number; radius: number; rotate: number; opacity?: number}> = ({lit, radius, rotate, opacity = 1}) => {
  const center = 390;
  return (
    <svg width="780" height="780" viewBox="0 0 780 780" style={{position: "absolute", inset: 0, rotate: `${rotate}deg`, opacity, filter: `drop-shadow(0 0 11px ${CITY_COLORS.cyan}55)`}}>
      {Array.from({length: 100}).map((_, index) => {
        const angle = (index / 100) * Math.PI * 2 - Math.PI / 2;
        const inner = radius - 25;
        const x1 = center + Math.cos(angle) * inner;
        const y1 = center + Math.sin(angle) * inner;
        const x2 = center + Math.cos(angle) * radius;
        const y2 = center + Math.sin(angle) * radius;
        return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} stroke={index < lit ? CITY_COLORS.cyan : "#173644"} strokeWidth={index % 5 === 0 ? 7 : 4} strokeLinecap="round" />;
      })}
    </svg>
  );
};

export const SceneProof: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const progress = interpolate(frame, [5, 50], [0, 87], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const value = Math.round(progress);
  const lock = spring({frame: frame - 49, fps, config: {damping: 13, stiffness: 180}});
  const outerRotation = interpolate(frame, [0, 50, 81], [-45, 390, 390], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic)});
  const innerRotation = interpolate(frame, [0, 50, 81], [30, -300, -300], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic)});

  return (
    <StadiumPlate darkness={0.72}>
      <div style={{position: "absolute", top: 58, left: 385}}><BrandLogo width={310} /></div>
      <div style={{position: "absolute", top: 225, left: 0, right: 0, textAlign: "center", color: CITY_COLORS.muted, fontFamily: CITY_FONTS.mono, fontSize: 21, fontWeight: 900, letterSpacing: 6}}>MOTEUR V3 · BACKTEST</div>

      <div style={{position: "absolute", top: 405, left: 150, width: 780, height: 780, scale: 1 + lock * 0.035}}>
        <TickRing lit={value} radius={350} rotate={outerRotation} />
        <TickRing lit={Math.min(value, 87)} radius={303} rotate={innerRotation} opacity={0.42} />
        <svg width="780" height="780" viewBox="0 0 780 780" style={{position: "absolute", inset: 0, rotate: `${-innerRotation * 0.32}deg`}}>
          <circle cx="390" cy="390" r="255" fill="rgba(0,9,16,.82)" stroke="rgba(32,217,243,.34)" strokeWidth="2" strokeDasharray="8 16" />
          <circle cx="390" cy="390" r="218" fill="rgba(0,7,12,.68)" stroke="rgba(32,217,243,.18)" strokeWidth="2" />
        </svg>
        <div style={{position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center"}}>
          <div>
            <div style={{fontFamily: CITY_FONTS.display, fontSize: 190, lineHeight: 0.8, color: CITY_COLORS.white, textShadow: `0 0 ${16 + lock * 32}px rgba(32,217,243,.38)`}}>
              {value}<span style={{fontSize: 96, color: CITY_COLORS.cyan}}>%</span>
            </div>
            <div style={{fontFamily: CITY_FONTS.display, fontSize: 55, lineHeight: 0.95, color: CITY_COLORS.white, marginTop: 38}}>DE RÉUSSITE</div>
            <div style={{fontFamily: CITY_FONTS.display, fontSize: 55, lineHeight: 0.95, color: CITY_COLORS.cyan}}>MESURÉE</div>
          </div>
        </div>
      </div>

      <div style={{position: "absolute", left: 105, right: 105, bottom: 190, borderTop: "1px solid rgba(32,217,243,.45)", paddingTop: 24, textAlign: "center", color: CITY_COLORS.white, fontFamily: CITY_FONTS.mono, fontSize: 22, fontWeight: 900, letterSpacing: 3, opacity: interpolate(frame, [46, 61], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})}}>
        SUR LES MARCHÉS SÉLECTIONNÉS
      </div>
      <div style={{position: "absolute", left: 0, right: 0, bottom: 120, textAlign: "center", color: CITY_COLORS.dim, fontFamily: CITY_FONTS.mono, fontSize: 15, letterSpacing: 2}}>RÉSULTATS HISTORIQUES · AUCUNE GARANTIE</div>
      {frame >= 48 && frame < 58 ? <CyanFlash /> : null}
    </StadiumPlate>
  );
};
