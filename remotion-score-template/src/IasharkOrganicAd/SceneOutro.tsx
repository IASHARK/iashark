import {Easing, Interactive, interpolate, useCurrentFrame} from "remotion";
import {BrandLogo, DataBackground} from "./shared";
import {COLORS, FONTS} from "./theme";

export const SceneOutro: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <DataBackground darkness={0.66}>
      <BrandLogo top={185} width={570} />

      <Interactive.Div
        name="Final message"
        style={{
          position: "absolute",
          top: 565,
          left: 74,
          right: 74,
          textAlign: "center",
          color: COLORS.text,
          fontFamily: FONTS.display,
          fontStyle: "italic",
          fontSize: 112,
          lineHeight: 0.94,
          textTransform: "uppercase",
          textShadow: "0 9px 28px rgba(0,0,0,.95)",
          opacity: interpolate(frame, [2, 13], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [1, 18], ["0px 48px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
        }}
      >
        <div>ANALYSE LE MATCH</div>
        <div style={{color: COLORS.cyan, marginTop: 18, textShadow: `0 0 34px rgba(34,211,238,.48)`}}>AUTREMENT.</div>
      </Interactive.Div>

      <Interactive.Div
        name="Website call to action"
        style={{
          position: "absolute",
          top: 1095,
          left: 105,
          right: 105,
          height: 125,
          borderRadius: 20,
          background: `linear-gradient(180deg,#3be6f8,${COLORS.cyanDeep})`,
          color: "#021018",
          display: "grid",
          placeItems: "center",
          fontFamily: FONTS.mono,
          fontStyle: "normal",
          fontSize: 48,
          fontWeight: 900,
          letterSpacing: 2.4,
          boxShadow: `0 0 ${28 + 12 * Math.sin(frame / 7)}px rgba(34,211,238,.56), inset 0 2px 0 rgba(255,255,255,.65), 0 18px 38px rgba(0,0,0,.55)`,
          opacity: interpolate(frame, [16, 28], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [14, 34], [0.86, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({damping: 16, stiffness: 105}),
            output: "perceptual-scale",
          }),
        }}
      >
        www.iashark.com
      </Interactive.Div>

      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          bottom: 122,
          borderTop: "1px solid rgba(34,211,238,.5)",
          paddingTop: 26,
          color: COLORS.muted,
          textAlign: "center",
          fontFamily: FONTS.mono,
          fontWeight: 900,
          fontSize: 24,
          letterSpacing: 4.2,
        }}
      >
        LE FOOTBALL SE LIT DANS LES DONNÉES
      </div>
    </DataBackground>
  );
};
