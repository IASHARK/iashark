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

export type SimulationRevealProps = {
  homeTeam: string;
  awayTeam: string;
  homeLogo: string;
  awayLogo: string;
  simulationCount: number;
  expectedGoals: string;
  expectedShotsOnTarget: string;
  scorer: string;
};

export const DarkStadium: React.FC<{children: ReactNode; darkness?: number}> = ({children, darkness = 0.68}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();

  return (
    <AbsoluteFill style={{background: COLORS.background, color: COLORS.text, overflow: "hidden"}}>
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
          opacity: 0.72,
          scale: interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [1.03, 1.08], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
          }),
          translate: interpolate(frame, [0, Math.max(1, durationInFrames - 1)], ["0px 8px", "0px -18px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
          }),
        }}
      />
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg,rgba(0,4,8,${Math.min(0.96, darkness + 0.12)}) 0%,rgba(1,8,13,${darkness}) 48%,rgba(0,3,6,.92) 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 46%,rgba(0,155,205,.16),transparent 25%),radial-gradient(circle at 8% 25%,rgba(8,217,255,.12),transparent 20%),radial-gradient(circle at 92% 25%,rgba(8,217,255,.12),transparent 20%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 5,
          background: "linear-gradient(90deg,transparent,#08d9ff,transparent)",
          boxShadow: "0 0 30px rgba(8,217,255,.8)",
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

export const BrandHeader: React.FC<{kicker: string}> = ({kicker}) => {
  const frame = useCurrentFrame();
  const {height} = useVideoConfig();
  const compact = height < 1600;
  return (
    <>
      <CanvasImage
        src={staticFile("ads/iashark-logo-master.png")}
        width={420}
        height={420}
        style={{
          position: "absolute",
          top: compact ? -92 : -64,
          left: compact ? 350 : 330,
          width: compact ? 380 : 420,
          height: compact ? 380 : 420,
          objectFit: "contain",
          mixBlendMode: "screen",
          filter: "drop-shadow(0 9px 20px rgba(0,0,0,.9))",
          opacity: interpolate(frame, [0, 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [0, 16], ["0px -26px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          }),
        }}
      />
      <Interactive.Div
        name="Section label"
        style={{
          position: "absolute",
          top: compact ? 195 : 236,
          left: 80,
          right: 80,
          textAlign: "center",
          color: COLORS.muted,
          fontFamily: FONTS.mono,
          fontSize: 20,
          fontWeight: 900,
          letterSpacing: 6,
          textTransform: "uppercase",
        }}
      >
        {kicker}
      </Interactive.Div>
    </>
  );
};

const TeamBadge: React.FC<{name: string; logo: string; compact: boolean}> = ({name, logo, compact}) => (
  <div style={{width: compact ? 290 : 310, display: "flex", alignItems: "center", gap: compact ? 14 : 18}}>
    <CanvasImage
      src={staticFile(logo)}
      width={compact ? 64 : 76}
      height={compact ? 64 : 76}
      style={{width: compact ? 64 : 76, height: compact ? 64 : 76, objectFit: "contain", filter: "drop-shadow(0 9px 13px rgba(0,0,0,.85))"}}
    />
    <div
      style={{
        width: compact ? 205 : 210,
        color: COLORS.text,
        fontFamily: FONTS.display,
        fontSize: name.length > 11 ? (compact ? 22 : 25) : compact ? 26 : 29,
        lineHeight: 1,
        textTransform: "uppercase",
      }}
    >
      {name}
    </div>
  </div>
);

export const MatchBar: React.FC<Pick<SimulationRevealProps, "homeTeam" | "awayTeam" | "homeLogo" | "awayLogo">> = ({
  homeTeam,
  awayTeam,
  homeLogo,
  awayLogo,
}) => {
  const {height} = useVideoConfig();
  const compact = height < 1600;
  return <Interactive.Div
    name="Match"
    style={{
      position: "absolute",
      top: compact ? 246 : 310,
      left: 92,
      right: 92,
      height: compact ? 94 : 114,
      borderRadius: 22,
      border: "1px solid rgba(8,217,255,.34)",
      background: "linear-gradient(110deg,rgba(5,25,37,.94),rgba(1,9,15,.88),rgba(5,25,37,.94))",
      boxShadow: "inset 0 0 28px rgba(8,217,255,.07),0 18px 35px rgba(0,0,0,.55)",
      display: "grid",
      gridTemplateColumns: "1fr 90px 1fr",
      alignItems: "center",
      padding: compact ? "10px 22px" : "16px 25px",
    }}
  >
    <TeamBadge name={homeTeam} logo={homeLogo} compact={compact} />
    <div style={{textAlign: "center", color: COLORS.dim, fontFamily: FONTS.mono, fontWeight: 900, fontSize: 24}}>VS</div>
    <div style={{display: "flex", justifyContent: "flex-end"}}>
      <TeamBadge name={awayTeam} logo={awayLogo} compact={compact} />
    </div>
  </Interactive.Div>;
};

export const DataRain: React.FC<{items: string[]}> = ({items}) => {
  const frame = useCurrentFrame();
  const {height} = useVideoConfig();
  const compact = height < 1600;
  return (
    <AbsoluteFill style={{opacity: 0.26}}>
      {Array.from({length: 13}).map((_, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: 35 + ((index * 83) % 980),
            top: (compact ? 340 : 450) + ((index * 127 + frame * (2 + (index % 3))) % (compact ? 760 : 1150)),
            color: index % 4 === 0 ? COLORS.cyanSoft : COLORS.dim,
            fontFamily: FONTS.mono,
            fontSize: 14 + (index % 3) * 2,
            fontWeight: 900,
            letterSpacing: 2,
            whiteSpace: "nowrap",
            opacity: 0.32 + (index % 4) * 0.1,
          }}
        >
          {items[index % items.length]}
        </div>
      ))}
    </AbsoluteFill>
  );
};

export const StepRail: React.FC<{active: 1 | 2 | 3}> = ({active}) => {
  const {height} = useVideoConfig();
  const compact = height < 1600;
  return <Interactive.Div
    name="Calculation steps"
    style={{
      position: "absolute",
      left: 115,
      right: 115,
      bottom: compact ? 60 : 104,
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 12,
    }}
  >
    {["BUTS", "TIRS", "BUTEUR"].map((label, index) => {
      const selected = active === index + 1;
      return (
        <div key={label} style={{textAlign: "center"}}>
          <div
            style={{
              height: 5,
              borderRadius: 20,
              background: selected ? COLORS.cyan : "rgba(88,126,143,.28)",
              boxShadow: selected ? "0 0 20px rgba(8,217,255,.9)" : "none",
            }}
          />
          <div
            style={{
              marginTop: 13,
              color: selected ? COLORS.text : COLORS.dim,
              fontFamily: FONTS.mono,
              fontSize: 16,
              fontWeight: 900,
              letterSpacing: 4,
            }}
          >
            0{index + 1} {label}
          </div>
        </div>
      );
    })}
  </Interactive.Div>;
};

export const MetricResult: React.FC<{
  label: string;
  value: string;
  suffix: string;
  candidates: string[];
  lockFrame?: number;
}> = ({label, value, suffix, candidates, lockFrame = 70}) => {
  const frame = useCurrentFrame();
  const {height} = useVideoConfig();
  const compact = height < 1600;
  const locked = frame >= lockFrame;
  const shown = locked ? value : candidates[Math.floor(frame / 3) % candidates.length];
  const lockAge = Math.max(0, frame - lockFrame);

  return (
    <>
      <Interactive.Div
        name="Calculation label"
        style={{
          position: "absolute",
          top: compact ? 405 : 535,
          left: 90,
          right: 90,
          textAlign: "center",
          color: COLORS.muted,
          fontFamily: FONTS.mono,
          fontSize: 22,
          fontWeight: 900,
          letterSpacing: 6,
        }}
      >
        {label}
      </Interactive.Div>

      <div style={{position: "absolute", top: compact ? 510 : 665, left: 0, right: 0, textAlign: "center"}}>
        <div
          style={{
            color: locked ? COLORS.cyan : COLORS.text,
            fontFamily: FONTS.display,
            fontStyle: "italic",
            fontSize: shown.length > 10 ? (compact ? 98 : 116) : compact ? 205 : 245,
            lineHeight: 0.88,
            letterSpacing: shown.length > 10 ? 1 : -4,
            textShadow: locked ? "0 0 30px rgba(8,217,255,.55),0 16px 35px rgba(0,0,0,.95)" : "0 12px 30px rgba(0,0,0,.95)",
            opacity: locked ? 1 : 0.7,
            scale: locked
              ? interpolate(lockAge, [0, 8, 18], [0.86, 1.07, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.out(Easing.cubic),
                  output: "perceptual-scale",
                })
              : 1,
          }}
        >
          {shown}
        </div>
        <div
          style={{
            color: locked ? COLORS.text : COLORS.dim,
            fontFamily: FONTS.display,
            fontStyle: "italic",
            fontSize: suffix.length > 22 ? (compact ? 44 : 52) : compact ? 54 : 64,
            lineHeight: 1,
            letterSpacing: 1,
            marginTop: compact ? 28 : 38,
            opacity: interpolate(frame, [lockFrame, lockFrame + 12], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
            translate: interpolate(frame, [lockFrame, lockFrame + 14], ["0px 28px", "0px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.out(Easing.cubic),
            }),
          }}
        >
          {suffix}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          top: compact ? 905 : 1165,
          left: 155,
          right: 155,
          height: 4,
          background: `linear-gradient(90deg,transparent,${COLORS.cyan},transparent)`,
          boxShadow: locked ? "0 0 26px rgba(8,217,255,.9)" : "0 0 10px rgba(8,217,255,.25)",
        }}
      />
      <Interactive.Div
        name="Calculation status"
        style={{
          position: "absolute",
          top: compact ? 945 : 1210,
          left: 120,
          right: 120,
          textAlign: "center",
          color: locked ? COLORS.cyanSoft : COLORS.muted,
          fontFamily: FONTS.mono,
          fontSize: 18,
          fontWeight: 900,
          letterSpacing: 5,
        }}
      >
        {locked ? "RÉSULTAT VERROUILLÉ" : "CALCUL DES SCÉNARIOS EN COURS"}
      </Interactive.Div>
    </>
  );
};
