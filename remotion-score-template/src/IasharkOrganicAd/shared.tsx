import type {ReactNode} from "react";
import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {COLORS, FONTS} from "./theme";

export const DataBackground: React.FC<{
  darkness?: number;
  showBall?: boolean;
  children?: ReactNode;
}> = ({darkness = 0.28, showBall = true, children}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();

  return (
    <AbsoluteFill style={{background: COLORS.background, overflow: "hidden"}}>
      <CanvasImage
        src={staticFile("ads/iashark-ad-stadium-v1.png")}
        width={1080}
        height={1920}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: showBall ? 1 : 0.62,
          scale: interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [1.025, 1.095], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
          }),
          translate: interpolate(frame, [0, Math.max(1, durationInFrames - 1)], ["0px 10px", "0px -22px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
          }),
        }}
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg,rgba(2,7,12,${Math.min(0.92, darkness + 0.2)}) 0%,rgba(2,7,12,${darkness}) 46%,rgba(2,7,12,.82) 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 49%,transparent 0%,transparent 26%,rgba(0,5,9,.26) 60%,rgba(0,2,5,.84) 100%)",
        }}
      />

      {Array.from({length: 24}).map((_, index) => {
        const left = 7 + ((index * 41) % 86);
        const top = 18 + ((index * 67) % 68);
        return (
          <div
            key={index}
            style={{
              position: "absolute",
              left: `${left}%`,
              top: `${top}%`,
              width: index % 4 === 0 ? 5 : 3,
              height: index % 4 === 0 ? 5 : 3,
              borderRadius: "50%",
              background: COLORS.cyan,
              boxShadow: `0 0 12px ${COLORS.cyan}`,
              opacity: 0.14 + 0.24 * Math.max(0, Math.sin((frame + index * 13) / 15)),
              translate: `0px ${Math.sin((frame + index * 9) / 22) * 8}px`,
            }}
          />
        );
      })}

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 6,
          background: `linear-gradient(90deg,transparent,${COLORS.cyan},transparent)`,
          boxShadow: `0 0 30px ${COLORS.cyan}`,
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

export const BrandLogo: React.FC<{top?: number; width?: number}> = ({top = 78, width = 410}) => (
  <CanvasImage
    src={staticFile("ads/iashark-logo-master.png")}
    width={width}
    height={width}
    style={{
      position: "absolute",
      top: top - width * 0.35,
      left: (1080 - width) / 2,
      width,
      height: width,
      objectFit: "contain",
      mixBlendMode: "screen",
      filter: "drop-shadow(0 8px 18px rgba(0,0,0,.85))",
    }}
  />
);

export const Kicker: React.FC<{children: ReactNode; top?: number}> = ({children, top = 245}) => (
  <div
    style={{
      position: "absolute",
      top,
      left: 85,
      right: 85,
      textAlign: "center",
      color: COLORS.muted,
      fontFamily: FONTS.mono,
      fontSize: 20,
      fontWeight: 700,
      letterSpacing: 6,
      textTransform: "uppercase",
    }}
  >
    {children}
  </div>
);

export const BottomStatement: React.FC<{children: ReactNode}> = ({children}) => (
  <div
    style={{
      position: "absolute",
      left: 82,
      right: 82,
      bottom: 118,
      borderTop: "1px solid rgba(34,211,238,.45)",
      paddingTop: 24,
      textAlign: "center",
      color: COLORS.text,
      fontFamily: FONTS.mono,
      fontSize: 23,
      fontWeight: 900,
      letterSpacing: 3.4,
      textTransform: "uppercase",
      textShadow: "0 5px 16px rgba(0,0,0,.9)",
    }}
  >
    {children}
  </div>
);

export const SceneTitle: React.FC<{
  children: ReactNode;
  top?: number;
  size?: number;
  delay?: number;
}> = ({children, top = 300, size = 96, delay = 0}) => {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name="Scene title"
      style={{
        position: "absolute",
        top,
        left: 80,
        right: 80,
        textAlign: "center",
        color: COLORS.text,
        fontFamily: FONTS.display,
        fontStyle: "italic",
        fontSize: size,
        lineHeight: 0.94,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        textShadow: "0 8px 22px rgba(0,0,0,.95)",
        opacity: interpolate(frame, [delay, delay + 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        }),
        translate: interpolate(frame, [delay, delay + 16], ["0px 42px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        }),
        scale: interpolate(frame, [delay, delay + 18], [0.94, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.spring({damping: 18, stiffness: 115}),
          output: "perceptual-scale",
        }),
      }}
    >
      {children}
    </Interactive.Div>
  );
};

export const CyanFlash: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background: COLORS.cyan,
        mixBlendMode: "screen",
        opacity: interpolate(frame, [0, 1, 3, 10], [0, 0.5, 0.16, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    />
  );
};
