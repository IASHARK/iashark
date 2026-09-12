import {Easing, Interactive, interpolate, useCurrentFrame} from "remotion";
import {BottomStatement, BrandLogo, CyanFlash, DataBackground, Kicker} from "./shared";
import {COLORS, FONTS} from "./theme";

export const SceneHook: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <DataBackground darkness={0.58}>
      <BrandLogo top={74} width={390} />
      <Kicker top={247}>Le football cache plus que le score</Kicker>

      <Interactive.Div
        name="Hook"
        style={{
          position: "absolute",
          top: 450,
          left: 72,
          right: 72,
          color: COLORS.text,
          textAlign: "center",
          fontFamily: FONTS.display,
          fontStyle: "italic",
          fontSize: 120,
          lineHeight: 0.9,
          textTransform: "uppercase",
          textShadow: "0 9px 26px rgba(0,0,0,.95)",
          opacity: interpolate(frame, [2, 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
          translate: interpolate(frame, [0, 16], ["0px 65px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
          scale: interpolate(frame, [0, 17], [0.88, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({damping: 18, stiffness: 130}),
            output: "perceptual-scale",
          }),
        }}
      >
        <div>UNE INTUITION</div>
        <div>N&apos;EST PAS UNE</div>
        <div
          style={{
            marginTop: 8,
            color: COLORS.cyan,
            textShadow: `0 0 36px rgba(34,211,238,.55), 0 9px 26px rgba(0,0,0,.95)`,
            opacity: interpolate(frame, [13, 20], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            scale: interpolate(frame, [13, 22], [1.18, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
          }}
        >
          ANALYSE.
        </div>
      </Interactive.Div>

      <BottomStatement>Regarde au-delà des 90 minutes</BottomStatement>
      {frame >= 12 && frame < 24 ? <CyanFlash /> : null}
    </DataBackground>
  );
};
