import {CanvasImage, Easing, interpolate, staticFile, useCurrentFrame} from "remotion";
import {BrandLogo, StadiumPlate} from "./shared";
import {CITY_COLORS, CITY_FONTS} from "./theme";

const SCORES = ["0–0", "1–0", "0–1", "1–1", "2–0", "0–2", "2–1", "1–2", "2–2", "3–1", "1–3", "3–2"];

const spacedNumber = (value: number) => value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export const SceneSimulations: React.FC = () => {
  const frame = useCurrentFrame();
  const count = Math.round(
    interpolate(frame, [8, 54], [0, 20000], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    }),
  );
  const reveal = interpolate(frame, [3, 14], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"});
  const ringProgress = interpolate(frame, [5, 56], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <StadiumPlate darkness={0.63}>
      <div style={{position: "absolute", top: 62, left: 365, opacity: reveal}}><BrandLogo width={350} /></div>
      <div
        style={{
          position: "absolute",
          top: 208,
          left: 0,
          right: 0,
          textAlign: "center",
          color: CITY_COLORS.muted,
          fontFamily: CITY_FONTS.mono,
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: 7,
          opacity: reveal,
        }}
      >
        UN MÊME MATCH
      </div>

      <div style={{position: "absolute", top: 320, left: 120, right: 120, display: "flex", alignItems: "center", justifyContent: "space-between"}}>
        {[{logo: "logos/real-madrid.png", name: "REAL MADRID"}, {logo: "logos/inter.png", name: "INTER"}].map((team, index) => (
          <div
            key={team.name}
            style={{
              width: 230,
              textAlign: "center",
              opacity: interpolate(frame, [8 + index * 5, 20 + index * 5], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}),
              translate: interpolate(frame, [8 + index * 5, 24 + index * 5], [index === 0 ? "-55px 0px" : "55px 0px", "0px 0px"], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.out(Easing.cubic),
              }),
            }}
          >
            <CanvasImage src={staticFile(team.logo)} width={150} height={150} style={{width: 150, height: 150, objectFit: "contain", filter: "drop-shadow(0 10px 18px rgba(0,0,0,.8))"}} />
            <div style={{fontFamily: CITY_FONTS.body, fontSize: 20, fontWeight: 900, marginTop: 12, color: CITY_COLORS.white}}>{team.name}</div>
          </div>
        ))}
        <div style={{position: "absolute", left: 260, right: 260, top: 76, height: 2, background: `linear-gradient(90deg,transparent,${CITY_COLORS.cyan},transparent)`, boxShadow: `0 0 18px ${CITY_COLORS.cyan}`}} />
      </div>

      <div style={{position: "absolute", top: 565, left: 205, width: 670, height: 670}}>
        <svg width="670" height="670" viewBox="0 0 670 670" style={{position: "absolute", rotate: `${interpolate(frame, [0, 85], [-20, 210], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic)})}deg`, filter: `drop-shadow(0 0 16px ${CITY_COLORS.cyan}55)`}}>
          <circle cx="335" cy="335" r="284" fill="rgba(0,9,15,.64)" stroke="#163848" strokeWidth="2" />
          <circle cx="335" cy="335" r="284" fill="none" stroke={CITY_COLORS.cyan} strokeWidth="8" strokeLinecap="round" strokeDasharray={1784} strokeDashoffset={1784 * (1 - ringProgress)} />
          <circle cx="335" cy="335" r="248" fill="none" stroke="rgba(32,217,243,.34)" strokeWidth="2" strokeDasharray="8 18" />
          <circle cx="335" cy="335" r="314" fill="none" stroke="rgba(32,217,243,.22)" strokeWidth="2" strokeDasharray="2 17" />
        </svg>

        {SCORES.map((score, index) => {
          const angle = (index / SCORES.length) * Math.PI * 2 - Math.PI / 2 + frame * 0.008;
          const radius = 306 + (index % 2) * 35;
          const x = 335 + Math.cos(angle) * radius - 42;
          const y = 335 + Math.sin(angle) * radius - 24;
          return (
            <div
              key={`${score}-${index}`}
              style={{
                position: "absolute",
                left: x,
                top: y,
                minWidth: 84,
                padding: "8px 12px",
                borderRadius: 10,
                border: "1px solid rgba(32,217,243,.62)",
                background: "rgba(2,18,28,.9)",
                color: CITY_COLORS.white,
                fontFamily: CITY_FONTS.mono,
                fontSize: 19,
                fontWeight: 900,
                textAlign: "center",
                boxShadow: "0 8px 22px rgba(0,0,0,.52)",
                opacity: interpolate(frame, [14 + index * 1.3, 25 + index * 1.3], [0, 0.9], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}),
              }}
            >
              {score}
            </div>
          );
        })}

        <div style={{position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center"}}>
          <div>
            <div style={{fontFamily: CITY_FONTS.display, fontSize: 126, lineHeight: 0.9, color: CITY_COLORS.white, textShadow: "0 10px 24px rgba(0,0,0,.8)"}}>{spacedNumber(count)}</div>
            <div style={{fontFamily: CITY_FONTS.display, fontSize: 52, color: CITY_COLORS.cyan, letterSpacing: 2, marginTop: 18}}>SIMULATIONS</div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 100,
          right: 100,
          bottom: 142,
          paddingTop: 24,
          borderTop: "1px solid rgba(32,217,243,.45)",
          textAlign: "center",
          fontFamily: CITY_FONTS.mono,
          fontSize: 24,
          fontWeight: 900,
          letterSpacing: 4,
          color: CITY_COLORS.white,
          opacity: interpolate(frame, [44, 60], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}),
        }}
      >
        20 000 DÉROULEMENTS POSSIBLES
      </div>
    </StadiumPlate>
  );
};
