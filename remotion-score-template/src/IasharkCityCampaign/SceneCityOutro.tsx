import {AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";
import {BrandLogo} from "./shared";
import {CITY_COLORS, CITY_FONTS} from "./theme";

export const SceneCityOutro: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const entrance = spring({frame: frame - 5, fps, config: {damping: 15, stiffness: 92, mass: 0.9}});
  const version = interpolate(frame, [20, 38], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background: "#000",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 720,
          left: 240,
          opacity: entrance,
          scale: 0.78 + entrance * 0.22,
        }}
      >
        <BrandLogo width={600} />
      </div>
      <div
        style={{
          position: "absolute",
          top: 952,
          left: 0,
          right: 0,
          textAlign: "center",
          color: CITY_COLORS.cyan,
          fontFamily: CITY_FONTS.mono,
          fontSize: 48,
          fontWeight: 900,
          letterSpacing: 16,
          opacity: version,
          translate: interpolate(frame, [20, 38], ["0px 22px", "0px 0px"], {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic)}),
          textShadow: `0 0 24px ${CITY_COLORS.cyan}66`,
        }}
      >
        VERSION 3
      </div>
    </AbsoluteFill>
  );
};
