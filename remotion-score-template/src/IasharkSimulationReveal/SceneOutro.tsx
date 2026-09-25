import {CanvasImage, Easing, Interactive, interpolate, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {DarkStadium, type SimulationRevealProps} from "./shared";
import {COLORS, FONTS} from "./theme";

const MetricIcon: React.FC<{type: "goals" | "shots" | "scorer"}> = ({type}) => (
  <div
    style={{
      width: 94,
      height: 94,
      borderRadius: 28,
      border: "1px solid rgba(8,217,255,.58)",
      background: "radial-gradient(circle,rgba(8,217,255,.22),rgba(2,16,25,.96) 72%)",
      boxShadow: "inset 0 0 25px rgba(8,217,255,.12),0 0 20px rgba(8,217,255,.12)",
      display: "grid",
      placeItems: "center",
    }}
  >
    {type === "scorer" ? (
      <svg width="54" height="54" viewBox="0 0 54 54">
        <circle cx="27" cy="17" r="10" fill="#08d9ff" />
        <path d="M9 49c1-13 8-20 18-20s17 7 18 20" fill="none" stroke="#08d9ff" strokeWidth="7" strokeLinecap="round" />
      </svg>
    ) : type === "shots" ? (
      <svg width="58" height="58" viewBox="0 0 58 58">
        <circle cx="29" cy="29" r="21" fill="none" stroke="#08d9ff" strokeWidth="4" />
        <circle cx="29" cy="29" r="8" fill="#08d9ff" />
        <path d="M29 1v11M29 46v11M1 29h11M46 29h11" stroke="#08d9ff" strokeWidth="4" strokeLinecap="round" />
      </svg>
    ) : (
      <svg width="60" height="60" viewBox="0 0 60 60">
        <circle cx="30" cy="30" r="25" fill="none" stroke="#08d9ff" strokeWidth="4" />
        <path d="m30 17 9 7-3 11H24l-3-11 9-7Zm-9 7-10 1m28-1 10 1M24 35l-6 11m18-11 6 11" fill="none" stroke="#08d9ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )}
  </div>
);

const SummaryCard: React.FC<{
  label: string;
  value: string;
  unit?: string;
  type: "goals" | "shots" | "scorer";
  delay: number;
  compact: boolean;
}> = ({label, value, unit, type, delay, compact}) => {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name={label}
      style={{
        height: compact ? 154 : 186,
        borderRadius: compact ? 22 : 28,
        border: "1px solid rgba(8,217,255,.48)",
        background: "linear-gradient(112deg,rgba(7,35,49,.97),rgba(1,10,17,.97) 60%,rgba(4,27,39,.94))",
        boxShadow: "inset 0 0 38px rgba(8,217,255,.08),0 20px 42px rgba(0,0,0,.6)",
        display: "grid",
        gridTemplateColumns: compact ? "112px 1fr" : "134px 1fr",
        alignItems: "center",
        padding: compact ? "0 34px" : "0 42px",
        opacity: interpolate(frame, [delay, delay + 12], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        }),
        translate: interpolate(frame, [delay, delay + 18], ["42px 0px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.out(Easing.cubic),
        }),
      }}
    >
      <MetricIcon type={type} />
      <div style={{minWidth: 0}}>
        <div style={{color: COLORS.muted, fontFamily: FONTS.mono, fontSize: compact ? 15 : 17, fontWeight: 900, letterSpacing: compact ? 2.6 : 3.4}}>
          {label}
        </div>
        <div style={{display: "flex", alignItems: "baseline", gap: 18, marginTop: compact ? 8 : 13}}>
          <span
            style={{
              color: COLORS.cyan,
              fontFamily: FONTS.display,
              fontStyle: "italic",
              fontSize: value.length > 11 ? (compact ? 55 : 68) : compact ? 74 : 91,
              lineHeight: 0.9,
              whiteSpace: "nowrap",
              textShadow: "0 0 25px rgba(8,217,255,.38)",
            }}
          >
            {value}
          </span>
          {unit ? (
            <span style={{color: COLORS.text, fontFamily: FONTS.display, fontStyle: "italic", fontSize: compact ? 34 : 43, lineHeight: 1}}>
              {unit}
            </span>
          ) : null}
        </div>
      </div>
    </Interactive.Div>
  );
};

export const SceneOutro: React.FC<SimulationRevealProps> = (props) => {
  const frame = useCurrentFrame();
  const {height} = useVideoConfig();
  const compact = height < 1600;
  return (
    <DarkStadium darkness={0.84}>
      <CanvasImage
        src={staticFile("ads/iashark-logo-master.png")}
        width={compact ? 360 : 430}
        height={compact ? 360 : 430}
        style={{
          position: "absolute",
          top: compact ? -98 : -76,
          left: compact ? 360 : 325,
          width: compact ? 360 : 430,
          height: compact ? 360 : 430,
          objectFit: "contain",
          mixBlendMode: "screen",
        }}
      />

      <Interactive.Div
        name="Simulation proof"
        style={{
          position: "absolute",
          top: compact ? 184 : 238,
          left: 80,
          right: 80,
          color: COLORS.muted,
          fontFamily: FONTS.mono,
          fontSize: compact ? 17 : 19,
          fontWeight: 900,
          letterSpacing: 5,
          textAlign: "center",
        }}
      >
        APRÈS {props.simulationCount.toLocaleString("fr-FR")} SIMULATIONS
      </Interactive.Div>

      <Interactive.Div
        name="Final title"
        style={{
          position: "absolute",
          top: compact ? 230 : 300,
          left: 80,
          right: 80,
          textAlign: "center",
          color: COLORS.text,
          fontFamily: FONTS.display,
          fontStyle: "italic",
          fontSize: compact ? 69 : 86,
          lineHeight: 0.94,
          opacity: interpolate(frame, [0, 14], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        LE MATCH EN<br />
        <span style={{color: COLORS.cyan}}>3 RÉPONSES</span>
      </Interactive.Div>

      <div
        style={{
          position: "absolute",
          top: compact ? 405 : 548,
          left: 88,
          right: 88,
          display: "flex",
          flexDirection: "column",
          gap: compact ? 15 : 22,
        }}
      >
        <SummaryCard label="VOLUME ATTENDU" value={props.expectedGoals} unit="BUTS" type="goals" delay={18} compact={compact} />
        <SummaryCard label="OCCASIONS CADRÉES ATTENDUES" value={props.expectedShotsOnTarget} unit="TIRS CADRÉS" type="shots" delay={34} compact={compact} />
        <SummaryCard label="JOUEUR QUI RESSORT LE PLUS" value={props.scorer} type="scorer" delay={50} compact={compact} />
      </div>

      <Interactive.Div
        name="Website safe area"
        style={{
          position: "absolute",
          left: 88,
          right: 88,
          bottom: compact ? 82 : 275,
          borderRadius: 24,
          border: "1px solid rgba(8,217,255,.52)",
          background: "linear-gradient(110deg,rgba(3,20,30,.96),rgba(0,8,13,.97))",
          boxShadow: "0 0 35px rgba(8,217,255,.14),inset 0 0 28px rgba(8,217,255,.07)",
          padding: compact ? "19px 24px 20px" : "25px 28px 27px",
          textAlign: "center",
          opacity: interpolate(frame, [68, 86], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [68, 90], [0.94, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({damping: 18, stiffness: 110}),
            output: "perceptual-scale",
          }),
        }}
      >
        <div style={{color: COLORS.muted, fontFamily: FONTS.mono, fontSize: compact ? 13 : 15, fontWeight: 900, letterSpacing: 4}}>
          ANALYSE COMPLÈTE
        </div>
        <div style={{color: COLORS.cyan, fontFamily: FONTS.display, fontStyle: "italic", fontSize: compact ? 48 : 59, letterSpacing: 3, marginTop: 6, textShadow: "0 0 22px rgba(8,217,255,.38)"}}>
          IASHARK.COM
        </div>
      </Interactive.Div>
    </DarkStadium>
  );
};
