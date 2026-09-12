import {Easing, interpolate, useCurrentFrame} from "remotion";
import {BrandLogo, CityPlate, ScanLine} from "./shared";
import {CITY_COLORS, CITY_FONTS} from "./theme";

export const SceneCityIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const appear = (delay: number) =>
    interpolate(frame, [delay, delay + 10], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.out(Easing.cubic),
    });

  return (
    <CityPlate direction="push-in">
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: interpolate(frame, [2, 10], [0, 1], {extrapolateLeft: "clamp", extrapolateRight: "clamp"}),
          boxShadow: `inset 0 0 ${30 + appear(5) * 55}px rgba(32,217,243,.18)`,
        }}
      >
        <div style={{position: "absolute", top: 80, left: 70, opacity: appear(4), scale: 0.92 + appear(4) * 0.08}}>
          <BrandLogo width={280} />
        </div>

        <div
          style={{
            position: "absolute",
            top: 305,
            left: 28,
            right: 28,
            color: CITY_COLORS.white,
            fontFamily: CITY_FONTS.display,
            fontSize: 76,
            lineHeight: 0.9,
            textAlign: "center",
            textTransform: "uppercase",
            opacity: appear(12),
            translate: interpolate(frame, [12, 26], ["0px 34px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
          }}
        >
          UN SEUL
          <br />
          MATCH.
        </div>

        <div
          style={{
            position: "absolute",
            top: 520,
            left: 20,
            right: 20,
            color: CITY_COLORS.cyan,
            fontFamily: CITY_FONTS.display,
            fontSize: 70,
            lineHeight: 0.9,
            textAlign: "center",
            textTransform: "uppercase",
            textShadow: `0 0 ${18 + appear(26) * 26}px rgba(32,217,243,.48)`,
            opacity: appear(24),
            scale: interpolate(frame, [24, 42], [1.16, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
              output: "perceptual-scale",
            }),
          }}
        >
          20 000
          <br />
          SCÉNARIOS.
        </div>

        <div
          style={{
            position: "absolute",
            top: 790,
            left: 0,
            right: 0,
            color: CITY_COLORS.muted,
            textAlign: "center",
            fontFamily: CITY_FONTS.mono,
            fontSize: 18,
            fontWeight: 900,
            letterSpacing: 6,
            opacity: appear(35),
          }}
        >
          MOTEUR V3
        </div>
        <ScanLine delay={6} />
      </div>
    </CityPlate>
  );
};
