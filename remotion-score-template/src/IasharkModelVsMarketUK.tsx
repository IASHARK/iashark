import type {CSSProperties} from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  Easing,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// AD02 "Market vs Model" (doc 17 §6.2) - UK paid creative, 9:16, 15 s.
// Every number below is a REAL resolved IASHARK prediction taken from
// historique.json (predictions_archive), never an illustrative placeholder:
// Arsenal vs Chelsea, Premier League, 2026-09-04, market "total shots over
// 22.5", model 63.3 % vs market-implied 54.6 % (odds 1.83), result: win, 2-1.
// Compliance (doc 04 / doc 17 / ASA): no guaranteed-win wording, no "bet now",
// probability != certainty caveat, 18+ + BeGambleAware footer, "published
// before kickoff / kept on the record" (never "immutable"), no club logos.

export const UK_MVM_FPS = 30;
export const UK_MVM_DURATION = 15 * UK_MVM_FPS;

const cyan = "#22d3ee";
const amber = "#f59e0b";
const green = "#10b981";
const ink = "#eaf7ff";
const muted = "#9cb4c5";
const displayFont = 'Impact, "Arial Black", sans-serif';
const bodyFont = "Arial, Helvetica, sans-serif";
const monoFont = '"Courier New", monospace';

const MATCH = {
  home: "ARSENAL",
  away: "CHELSEA",
  league: "PREMIER LEAGUE",
  date: "4 SEP 2026",
  marketLabel: "Match shots over 22.5",
  modelPct: 63.3,
  marketPct: 54.6,
  odds: "1.83",
  finalScore: "2 – 1",
  outcome: "Over 22.5 shots ✓",
};
const DELTA = Math.round((MATCH.modelPct - MATCH.marketPct) * 10) / 10;

const clamp = {extrapolateLeft: "clamp", extrapolateRight: "clamp"} as const;

const fadeIn = (frame: number, start: number, len = 12) =>
  interpolate(frame, [start, start + len], [0, 1], clamp);
const fadeOut = (frame: number, end: number, len = 10) =>
  interpolate(frame, [end - len, end], [1, 0], clamp);
const beatWindow = (frame: number, start: number, end: number) =>
  Math.min(fadeIn(frame, start), fadeOut(frame, end));

const Panel = ({children, style}: {children: React.ReactNode; style?: CSSProperties}) => (
  <div
    style={{
      border: "1px solid rgba(34,211,238,.5)",
      background: "linear-gradient(135deg,rgba(8,22,33,.94),rgba(3,12,20,.9))",
      boxShadow: "0 24px 65px rgba(0,0,0,.6), inset 0 0 30px rgba(34,211,238,.07)",
      borderRadius: 28,
      ...style,
    }}
  >
    {children}
  </div>
);

const Caption = ({text, opacity}: {text: string; opacity: number}) => (
  <div
    style={{
      position: "absolute",
      left: 140,
      right: 140,
      bottom: 640,
      textAlign: "center",
      fontFamily: bodyFont,
      fontSize: 44,
      lineHeight: 1.25,
      color: ink,
      fontWeight: 700,
      textShadow: "0 4px 18px rgba(0,0,0,.9)",
      opacity,
    }}
  >
    {text}
  </div>
);

const Bar = ({
  label,
  pct,
  color,
  progress,
  emphasized,
}: {
  label: string;
  pct: number;
  color: string;
  progress: number;
  emphasized: boolean;
}) => (
  <div style={{marginBottom: 34}}>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        fontFamily: monoFont,
        fontSize: 26,
        letterSpacing: 3,
        color: muted,
        marginBottom: 12,
      }}
    >
      <span>{label}</span>
      <span style={{color: emphasized ? color : ink, fontWeight: 900, fontSize: 34}}>
        {(pct * progress).toFixed(1)}%
      </span>
    </div>
    <div style={{height: 26, borderRadius: 14, background: "#0b1e2b", overflow: "hidden"}}>
      <div
        style={{
          width: `${pct * progress}%`,
          height: "100%",
          background: color,
          boxShadow: `0 0 22px ${color}`,
          borderRadius: 14,
        }}
      />
    </div>
  </div>
);

export const IasharkModelVsMarketUK: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const s = (sec: number) => Math.round(sec * fps);

  // Beat boundaries (doc 17 AD02): 0-2 hook, 2-5 bars, 5-10 why + caveat, 10-15 record + CTA.
  const b1 = [0, s(2.2)] as const;
  const b2 = [s(2), s(5.2)] as const;
  const b3 = [s(5), s(10.2)] as const;
  const b4 = [s(10), UK_MVM_DURATION] as const;

  const pop = spring({frame, fps, config: {damping: 14, stiffness: 120}});
  const barProgress = spring({frame: Math.max(0, frame - b2[0] - 4), fps, config: {damping: 18, stiffness: 70}});
  const deltaPop = spring({frame: Math.max(0, frame - b2[0] - 28), fps, config: {damping: 12, stiffness: 140}});
  const ctaPulse = 1 + 0.03 * Math.sin((frame / fps) * Math.PI * 2);

  return (
    <AbsoluteFill style={{background: "#020a10", color: ink, fontFamily: bodyFont, overflow: "hidden"}}>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 18%,rgba(34,211,238,.16),transparent 55%),radial-gradient(ellipse at 50% 88%,rgba(0,111,171,.18),transparent 45%),linear-gradient(180deg,#010306 0%,#02080d 60%,#000 100%)",
        }}
      />

      {[[s(2), "whoosh", 0.45], [s(2) + 28, "ding", 0.35], [s(5), "whoosh", 0.4], [s(10), "whoosh", 0.4], [s(12.9), "ding", 0.4]].map(([from, name, volume]) => (
        <Sequence key={`${name}-${from}`} from={from as number} durationInFrames={s(1.5)}>
          <Audio src={staticFile(`ads/audio/${name}.wav`)} volume={volume as number} />
        </Sequence>
      ))}

      {/* Persistent small brand (never a full-screen logo as first frame) */}
      <div style={{position: "absolute", top: 130, left: 0, right: 0, display: "flex", justifyContent: "center", alignItems: "center", gap: 18, opacity: fadeIn(frame, 6, 14)}}>
        <Img src={staticFile("ads/iashark-logo.png")} style={{width: 64, height: 64, objectFit: "contain"}} />
        <div style={{fontFamily: displayFont, fontSize: 46, letterSpacing: 2}}>
          <span style={{color: ink}}>IA</span>
          <span style={{color: cyan}}>SHARK</span>
        </div>
        <div style={{fontFamily: monoFont, fontSize: 18, letterSpacing: 4, color: muted, border: "1px solid rgba(255,255,255,.14)", borderRadius: 8, padding: "6px 10px"}}>
          UK · GBP
        </div>
      </div>

      {/* Match card - visible across all beats, shrinks after the hook */}
      <div
        style={{
          position: "absolute",
          top: interpolate(frame, [b1[1] - 10, b2[0] + 20], [330, 250], {...clamp, easing: Easing.out(Easing.cubic)}),
          left: 80,
          right: 80,
          opacity: fadeIn(frame, 0, 10),
          transform: `scale(${0.9 + pop * 0.1})`,
        }}
      >
        <Panel style={{padding: "28px 34px"}}>
          <div style={{display: "flex", justifyContent: "space-between", fontFamily: monoFont, fontSize: 22, letterSpacing: 4, color: muted}}>
            <span>{MATCH.league}</span>
            <span>{MATCH.date}</span>
          </div>
          <div style={{display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18}}>
            <div style={{fontFamily: displayFont, fontSize: 62, letterSpacing: 1}}>{MATCH.home}</div>
            <div style={{fontFamily: monoFont, fontSize: 30, color: cyan}}>vs</div>
            <div style={{fontFamily: displayFont, fontSize: 62, letterSpacing: 1}}>{MATCH.away}</div>
          </div>
          <div style={{marginTop: 14, fontFamily: monoFont, fontSize: 24, letterSpacing: 2, color: muted}}>
            MARKET · {MATCH.marketLabel.toUpperCase()}
          </div>
        </Panel>
      </div>

      {/* BEAT 1 - Hook: the contradiction, number first */}
      <div style={{position: "absolute", top: 640, left: 60, right: 60, textAlign: "center", opacity: beatWindow(frame, b1[0], b1[1])}}>
        <div style={{fontFamily: displayFont, fontSize: 74, lineHeight: 1.05, color: ink}}>
          The market says <span style={{color: amber}}>{Math.round(MATCH.marketPct)}%.</span>
        </div>
        <div style={{fontFamily: displayFont, fontSize: 74, lineHeight: 1.05, color: ink, marginTop: 12}}>
          IAShark says <span style={{color: cyan}}>{Math.round(MATCH.modelPct)}%.</span>
        </div>
      </div>

      {/* BEAT 2 - Bars + delta */}
      <div style={{position: "absolute", top: 560, left: 80, right: 80, opacity: beatWindow(frame, b2[0], b2[1])}}>
        <Panel style={{padding: "40px 44px 24px"}}>
          <Bar label="IASHARK MODEL" pct={MATCH.modelPct} color={cyan} progress={barProgress} emphasized />
          <Bar label={`MARKET-IMPLIED · ODDS ${MATCH.odds}`} pct={MATCH.marketPct} color={amber} progress={barProgress} emphasized={false} />
          <div style={{textAlign: "center", marginTop: 10, transform: `scale(${deltaPop})`, opacity: deltaPop}}>
            <span style={{display: "inline-block", fontFamily: displayFont, fontSize: 92, color: green, textShadow: `0 0 30px ${green}66`}}>
              +{DELTA}pp
            </span>
          </div>
        </Panel>
      </div>
      <Caption text={`That ${DELTA}-point disagreement is worth investigating.`} opacity={beatWindow(frame, b2[0] + 6, b2[1])} />

      {/* BEAT 3 - Why + caveat */}
      <div style={{position: "absolute", top: 560, left: 80, right: 80, opacity: beatWindow(frame, b3[0], b3[1])}}>
        <Panel style={{padding: "44px 44px 40px", textAlign: "center"}}>
          <div style={{fontFamily: displayFont, fontSize: 150, color: cyan, lineHeight: 1}}>WHY?</div>
          <div style={{fontFamily: monoFont, fontSize: 26, letterSpacing: 3, color: muted, marginTop: 26}}>
            PUBLISHED BEFORE KICKOFF · KEPT ON THE RECORD
          </div>
          <div style={{fontFamily: monoFont, fontSize: 24, letterSpacing: 2, color: ink, marginTop: 30, opacity: fadeIn(frame, b3[0] + s(2.6), 12)}}>
            Probability ≠ certainty.
          </div>
        </Panel>
      </div>
      <Caption
        text={frame < b3[0] + s(2.6) ? "Open the match and see what moved the model." : "A 63% estimate can still miss. That is the point."}
        opacity={beatWindow(frame, b3[0] + 6, b3[1])}
      />

      {/* BEAT 4 - Record + CTA */}
      <div style={{position: "absolute", top: 560, left: 80, right: 80, opacity: beatWindow(frame, b4[0], b4[1] + 30)}}>
        <Panel style={{padding: "36px 44px"}}>
          <div style={{fontFamily: monoFont, fontSize: 24, letterSpacing: 4, color: muted}}>RESULT ADDED AFTER THE MATCH</div>
          <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18}}>
            <div style={{fontFamily: displayFont, fontSize: 58}}>{MATCH.home}</div>
            <div style={{fontFamily: displayFont, fontSize: 84, color: ink}}>{MATCH.finalScore}</div>
            <div style={{fontFamily: displayFont, fontSize: 58}}>{MATCH.away}</div>
          </div>
          <div style={{marginTop: 20, display: "flex", justifyContent: "space-between", fontFamily: monoFont, fontSize: 26, letterSpacing: 2}}>
            <span style={{color: muted}}>Model 63.3% · Market 54.6%</span>
            <span style={{color: green, fontWeight: 900}}>{MATCH.outcome}</span>
          </div>
          <div style={{marginTop: 22, fontFamily: monoFont, fontSize: 22, letterSpacing: 3, color: muted}}>
            RIGHT OR WRONG, THE ENTRY STAYS THERE.
          </div>
        </Panel>
      </div>
      <Caption text="Then check how it calibrated over time." opacity={beatWindow(frame, b4[0] + 6, b4[0] + s(2.8))} />

      {/* CTA - last 2.5 s */}
      <div style={{position: "absolute", left: 0, right: 0, bottom: 520, textAlign: "center", opacity: fadeIn(frame, b4[0] + s(2.9), 14), transform: `scale(${ctaPulse})`}}>
        <div
          style={{
            display: "inline-block",
            fontFamily: displayFont,
            fontSize: 60,
            letterSpacing: 2,
            padding: "26px 60px",
            borderRadius: 22,
            background: `linear-gradient(135deg,${cyan},#06b6d4)`,
            color: "#04141a",
            boxShadow: `0 12px 44px ${cyan}55`,
          }}
        >
          TRY ONE MATCH FREE
        </div>
        <div style={{fontFamily: monoFont, fontSize: 26, letterSpacing: 4, color: ink, marginTop: 22}}>iashark.com/gb</div>
        <div style={{fontFamily: monoFont, fontSize: 20, letterSpacing: 2, color: muted, marginTop: 10}}>No card required · 1 free analysis a day</div>
      </div>

      {/* Compliance footer - persistent */}
      <div style={{position: "absolute", left: 60, right: 60, bottom: 420, textAlign: "center", fontFamily: monoFont, fontSize: 19, letterSpacing: 2, color: "rgba(156,180,197,.85)", lineHeight: 1.6, opacity: fadeIn(frame, 10, 14)}}>
        18+ · Statistical estimates, not guarantees · Not a bookmaker
        <br />
        BeGambleAware.org · 0808 8020 133
      </div>
    </AbsoluteFill>
  );
};
