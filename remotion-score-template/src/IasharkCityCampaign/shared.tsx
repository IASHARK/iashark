import type {ReactNode} from "react";
import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {CITY_COLORS} from "./theme";

export const BrandLogo: React.FC<{width?: number}> = ({width = 350}) => (
  <CanvasImage
    src={staticFile("ads/iashark-logo.png")}
    width={width}
    height={Math.round(width * 0.267)}
    style={{
      width,
      height: Math.round(width * 0.267),
      objectFit: "contain",
      mixBlendMode: "screen",
      filter: "drop-shadow(0 8px 18px rgba(0,0,0,.75))",
    }}
  />
);

export const CityPlate: React.FC<{
  children: ReactNode;
  direction?: "push-in" | "pull-out";
  startScale?: number;
  endScale?: number;
}> = ({children, direction = "push-in", startScale: requestedStartScale, endScale: requestedEndScale}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const end = Math.max(1, durationInFrames - 1);
  const startScale = requestedStartScale ?? (direction === "push-in" ? 1.015 : 1.16);
  const endScale = requestedEndScale ?? (direction === "push-in" ? 1.085 : 1.015);

  return (
    <AbsoluteFill style={{background: CITY_COLORS.black, overflow: "hidden"}}>
      <AbsoluteFill
        style={{
          scale: interpolate(frame, [0, end], [startScale, endScale], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
            output: "perceptual-scale",
          }),
          translate: interpolate(
            frame,
            [0, end],
            direction === "push-in" ? ["0px 7px", "-8px -12px"] : ["-8px -12px", "0px 7px"],
            {extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic)},
          ),
        }}
      >
        <CanvasImage
          src={staticFile("ads/iashark-nyc-billboard-blank-v1.png")}
          width={1080}
          height={1920}
          style={{position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover"}}
        />
        <div
          style={{
            position: "absolute",
            left: 318,
            top: 126,
            width: 420,
            height: 1144,
            clipPath: "polygon(1.4% 0, 99.4% 1%, 100% 99.5%, 0 99.2%)",
            overflow: "hidden",
            background:
              "radial-gradient(circle at 50% 36%,rgba(18,104,126,.10),transparent 44%),linear-gradient(180deg,rgba(0,8,13,.2),rgba(0,4,8,.42))",
          }}
        >
          {children}
        </div>
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg,rgba(0,3,7,.15),transparent 46%,rgba(0,3,7,.38)),radial-gradient(circle at 50% 42%,transparent 28%,rgba(0,2,5,.28) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 260,
          background: "linear-gradient(90deg,transparent,rgba(60,225,255,.12),transparent)",
          mixBlendMode: "screen",
          left: interpolate(frame, [0, end], [-300, 1180], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
          }),
          transform: "skewX(-10deg)",
          filter: "blur(18px)",
        }}
      />
    </AbsoluteFill>
  );
};

export const StadiumPlate: React.FC<{children: ReactNode; darkness?: number}> = ({children, darkness = 0.58}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  return (
    <AbsoluteFill style={{background: CITY_COLORS.black, overflow: "hidden"}}>
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
          scale: interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [1.035, 1.095], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
            output: "perceptual-scale",
          }),
          translate: interpolate(frame, [0, Math.max(1, durationInFrames - 1)], ["0px 12px", "0px -14px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg,rgba(0,5,10,${Math.min(0.9, darkness + 0.15)}) 0%,rgba(0,7,12,${darkness}) 46%,rgba(0,4,8,.84) 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: "radial-gradient(circle at 50% 47%,transparent 0%,rgba(0,8,13,.12) 34%,rgba(0,2,5,.76) 100%)",
        }}
      />
      {Array.from({length: 22}).map((_, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: `${8 + ((index * 37) % 84)}%`,
            top: `${21 + ((index * 53) % 66)}%`,
            width: index % 5 === 0 ? 5 : 3,
            height: index % 5 === 0 ? 5 : 3,
            borderRadius: "50%",
            background: CITY_COLORS.cyan,
            opacity: 0.08 + 0.18 * Math.max(0, Math.sin((frame + index * 11) / 13)),
            boxShadow: `0 0 12px ${CITY_COLORS.cyan}`,
            translate: `0px ${Math.sin((frame + index * 7) / 19) * 8}px`,
          }}
        />
      ))}
      {children}
    </AbsoluteFill>
  );
};

export const CyanFlash: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        background: CITY_COLORS.cyan,
        mixBlendMode: "screen",
        opacity: interpolate(frame, [0, 1, 3, 9], [0, 0.55, 0.16, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        }),
      }}
    />
  );
};

export const ScanLine: React.FC<{delay?: number}> = ({delay = 0}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [delay, delay + 24], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: `${progress * 100}%`,
        height: 3,
        background: `linear-gradient(90deg,transparent,${CITY_COLORS.cyan},transparent)`,
        boxShadow: `0 0 26px 8px ${CITY_COLORS.cyan}55`,
        opacity: frame < delay || frame > delay + 28 ? 0 : 0.85,
      }}
    />
  );
};
