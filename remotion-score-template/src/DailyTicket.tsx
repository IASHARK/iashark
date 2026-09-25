// Safe / Combine du jour : meme style que MontanteOne (fond stade, cartes
// numerotees, balayage lumineux, coche), mais en vrai texte alimente par
// scripts/videos/build-daily-videos.mjs. Volontairement sans cote ni pourcentage.
import {Fragment} from "react";
import {AbsoluteFill, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {loadFont} from "@remotion/google-fonts/BarlowCondensed";

const {fontFamily: BARLOW} = loadFont("normal", {weights: ["500", "600", "700", "800", "900"], subsets: ["latin", "latin-ext"]});
loadFont("italic", {weights: ["800", "900"], subsets: ["latin", "latin-ext"]});

export type TicketLeg = {home: string; away: string; pick: string; kickoff?: string};
export type DailyTicketProps = {
  title: string;
  accent?: string;
  dateLabel: string;
  legs: TicketLeg[];
  badge?: string;
};

export const DAILY_TICKET_DURATION = 420;

const CYAN = "#22d8ff";
const BG = staticFile("mockups/safe-background.png");
const LOGO = staticFile("ads/iashark-logo.png");
const clamp = {extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const};

const pulseAt = (frame: number, center: number, radius: number) => {
  const d = Math.abs(frame - center);
  if (d >= radius) return 0;
  const s = 1 - d / radius;
  return s * s;
};
const bell = (frame: number, start: number, duration: number) =>
  interpolate(frame, [start, start + duration * 0.22, start + duration * 0.78, start + duration], [0, 1, 1, 0], {...clamp, easing: Easing.inOut(Easing.cubic)});

const particles = Array.from({length: 24}, (_, i) => ({
  x: 44 + ((i * 157) % 994), y: 150 + ((i * 233) % 1430), r: 1 + (i % 3) * 0.65, speed: 0.16 + (i % 5) * 0.045, phase: (i * 71) % 420,
}));

const ZONE_TOP = 790, ZONE_H = 610, GAP = 22;
const cardLayout = (n: number) => {
  const h = Math.min(188, (ZONE_H - GAP * (n - 1)) / n);
  const tops = Array.from({length: n}, (_, i) => ZONE_TOP + i * (h + GAP) + (n <= 3 ? 0 : 0));
  const sweeps = Array.from({length: n}, (_, i) => 108 + Math.round((i * 136) / Math.max(1, n - 1)));
  return {h, tops, sweeps, k: h / 188};
};

const Check = ({size}: {size: number}) => (
  <svg width={size} height={size} viewBox="0 0 48 48">
    <circle cx="24" cy="24" r="22" fill="#1fc95b" />
    <path d="M14 24.5l7 7 13-14" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const DailyTicket: React.FC<DailyTicketProps> = ({title, accent = "DU JOUR", dateLabel, legs, badge}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const cycle = (frame / durationInFrames) * Math.PI * 2;

  const titlePulse = Math.min(1, pulseAt(frame, 24, 12) + pulseAt(frame, 52, 10) * 0.76 + pulseAt(frame, 217, 10) * 0.42 + pulseAt(frame, 361, 11) * 0.58);
  const titleIn = 1;
  const footerPulse = pulseAt(frame, 338, 25) + pulseAt(frame, 382, 19) * 0.5;
  const titleText = `${title} ${accent}`.trim();
  const titleSize = titleText.length > 14 ? 150 : titleText.length > 11 ? 172 : 196;

  return (
    <AbsoluteFill style={{backgroundColor: "#01070c", overflow: "hidden", fontFamily: BARLOW, color: "#fff"}}>
      <AbsoluteFill style={{scale: 1.004 + Math.sin(cycle - Math.PI / 2) * 0.006, translate: `0px ${Math.sin(cycle) * 3}px`}}>
        <Img src={BG} style={{width: "100%", height: "100%", objectFit: "cover"}} />
      </AbsoluteFill>

      {/* halos qui derivent + particules, comme MontanteOne */}
      <AbsoluteFill style={{pointerEvents: "none", mixBlendMode: "screen"}}>
        <div style={{position: "absolute", width: 410, height: 410, left: -160 + Math.sin(cycle) * 80, top: 180 + Math.cos(cycle * 1.15) * 65, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,202,255,.34) 0%, rgba(0,111,255,.13) 33%, transparent 69%)", filter: "blur(52px)", opacity: 0.72}} />
        <div style={{position: "absolute", width: 500, height: 500, right: -215 + Math.cos(cycle * 0.82) * 95, top: 650 + Math.sin(cycle * 1.4) * 105, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,187,255,.28) 0%, rgba(0,86,255,.1) 38%, transparent 70%)", filter: "blur(60px)", opacity: 0.66}} />
        {particles.map((p, i) => {
          const travel = ((frame * p.speed + p.phase) % 420) / 420;
          return <div key={i} style={{position: "absolute", left: p.x, top: p.y - travel * 170, width: p.r * 2, height: p.r * 2, borderRadius: "50%", backgroundColor: i % 4 === 0 ? "#dff9ff" : "#16d9ff", boxShadow: "0 0 9px rgba(0,211,255,.78)", opacity: Math.sin(travel * Math.PI) * 0.8}} />;
        })}
      </AbsoluteFill>

      {/* logo */}
      <div style={{position: "absolute", top: 158, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: 1}}>
        <Img src={LOGO} style={{height: 118, width: "auto", mixBlendMode: "lighten"}} />
      </div>

      {/* date */}
      <div style={{position: "absolute", top: 322, left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 28, opacity: 1}}>
        <div style={{width: 100, height: 3, background: `linear-gradient(90deg, transparent, ${CYAN})`, boxShadow: `0 0 10px ${CYAN}`}} />
        <div style={{fontSize: 33, fontWeight: 600, letterSpacing: 11}}>{dateLabel}</div>
        <div style={{width: 100, height: 3, background: `linear-gradient(90deg, ${CYAN}, transparent)`, boxShadow: `0 0 10px ${CYAN}`}} />
      </div>

      {/* titre */}
      <div style={{position: "absolute", left: 60, right: 60, top: 385, height: 230, borderRadius: 120, background: "radial-gradient(ellipse at center, rgba(239,252,255,.5) 0%, rgba(0,217,255,.3) 28%, rgba(0,97,255,.12) 52%, transparent 73%)", filter: "blur(30px)", mixBlendMode: "screen", opacity: 0.1 + titlePulse * 0.6, scale: 0.86 + titlePulse * 0.2}} />
      <div style={{position: "absolute", top: 392, left: 0, right: 0, height: 220, display: "flex", alignItems: "center", justifyContent: "center", opacity: titleIn, scale: (0.9 + titleIn * 0.1) * (1 + titlePulse * 0.018), translate: `${Math.sin(frame * 2.7) * titlePulse * 1.6}px ${Math.cos(frame * 3.1) * titlePulse * 0.7}px`}}>
        <div style={{fontSize: titleSize, fontWeight: 900, fontStyle: "italic", letterSpacing: -2, lineHeight: 1, whiteSpace: "nowrap", textTransform: "uppercase"}}>
          <span style={{background: "linear-gradient(180deg,#ffffff 0%,#dfe8ee 55%,#9fb1bd 100%)", WebkitBackgroundClip: "text", color: "transparent", filter: "drop-shadow(0 6px 0 rgba(0,0,0,.55))"}}>{title}</span>
          {accent ? <span style={{color: CYAN, marginLeft: 26, textShadow: `0 0 26px rgba(34,216,255,.7)`}}>{accent}</span> : null}
        </div>
      </div>

      {/* pastille (remplace l'objectif de cote) */}
      <div style={{position: "absolute", top: 628, left: 0, right: 0, display: "flex", justifyContent: "center", opacity: 1}}>
        <div style={{height: 100, padding: "0 64px", borderRadius: 60, border: `3px solid ${CYAN}`, background: "rgba(2,16,28,.78)", boxShadow: `0 0 26px rgba(34,216,255,.55), inset 0 0 22px rgba(34,216,255,.18)`, display: "flex", alignItems: "center", fontSize: 50, fontWeight: 700, letterSpacing: 3}}>
          {badge ? (<>{badge.replace(/@.*/, "")}<span style={{color: CYAN, marginLeft: 16}}>{badge.match(/@.*/)?.[0]}</span></>) : (<>{legs.length} MATCHS <span style={{color: CYAN, margin: "0 18px"}}>·</span> {legs.length} SÉLECTIONS</>)}
        </div>
      </div>

      {/* cartes */}
      {legs.slice(0, 6).map((leg, i, all) => {
        const {h: CARD_H, tops, sweeps, k} = cardLayout(all.length);
        const top = tops[i];
        const start = sweeps[i];
        const enter = 1;
        const sweepX = interpolate(frame, [start, start + 38], [-250, 1220], {...clamp, easing: Easing.inOut(Easing.quad)});
        const checkPulse = pulseAt(frame, start + 33, 13);
        const checkIn = 1;
        const match = `${leg.home} — ${leg.away}`.toUpperCase();
        return (
          <Fragment key={i}>
            <div style={{position: "absolute", left: 40, right: 40, top, height: CARD_H, borderRadius: 28, border: "2px solid rgba(34,216,255,.75)", background: "linear-gradient(180deg, rgba(6,24,38,.86), rgba(2,12,22,.9))", boxShadow: "0 0 18px rgba(0,190,255,.35), inset 0 0 26px rgba(0,150,255,.12)", display: "flex", alignItems: "center", opacity: enter, translate: `${(1 - enter) * -60}px 0px`}}>
              <div style={{width: 170, textAlign: "center", fontSize: 108 * Math.max(k, 0.62), fontWeight: 900, fontStyle: "italic", color: CYAN, textShadow: "0 0 18px rgba(34,216,255,.55)"}}>{String(i + 1).padStart(2, "0")}</div>
              <div style={{width: 2, height: 124 * k, background: "rgba(255,255,255,.28)"}} />
              <div style={{flex: 1, paddingLeft: 38, paddingRight: 20, minWidth: 0}}>
                <div style={{fontSize: (match.length > 28 ? 34 : match.length > 20 ? 40 : 48) * Math.max(k, 0.8), fontWeight: 700, letterSpacing: 0.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{match}</div>
                <div style={{fontSize: (leg.pick.length > 30 ? 32 : 37) * Math.max(k, 0.8), fontWeight: 500, color: "#a9dcf0", marginTop: 6 * k, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis"}}>{leg.pick}</div>
              </div>
              <div style={{width: 64, marginRight: 22, opacity: checkIn, scale: 0.6 + checkIn * 0.4}}><Check size={60 * Math.max(k, 0.75)} /></div>
              {leg.kickoff ? (
                <div style={{width: 196, height: Math.min(128, CARD_H - 20), marginRight: 22, borderRadius: 20, border: "2px solid rgba(34,216,255,.4)", background: "rgba(3,18,30,.8)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center"}}>
                  <div style={{fontSize: 22 * Math.max(k, 0.8), fontWeight: 600, letterSpacing: 5, color: "#8fb3c4"}}>COUP D'ENVOI</div>
                  <div style={{fontSize: 58 * Math.max(k, 0.7), fontWeight: 800, color: CYAN, lineHeight: 1.05}}>{leg.kickoff}</div>
                </div>
              ) : null}
            </div>
            {/* balayage lumineux */}
            <div style={{position: "absolute", left: 40, right: 40, top, height: CARD_H, overflow: "hidden", borderRadius: 28, pointerEvents: "none", mixBlendMode: "screen"}}>
              <div style={{position: "absolute", left: 0, top: -70, width: 175, height: CARD_H + 140, translate: `${sweepX}px 0px`, rotate: "10deg", background: "linear-gradient(90deg, transparent, rgba(0,199,255,.16), rgba(233,253,255,.54), rgba(0,207,255,.14), transparent)", filter: "blur(9px)", opacity: bell(frame, start, 38)}} />
            </div>
            <div style={{position: "absolute", left: 27, right: 27, top: top - 5, height: CARD_H + 10, borderRadius: 31, border: "2px solid rgba(56,231,255,.86)", boxShadow: "0 0 17px rgba(0,205,255,.66), inset 0 0 21px rgba(0,154,255,.16)", opacity: checkPulse * 0.36}} />
          </Fragment>
        );
      })}

      {/* pied */}
      <div style={{position: "absolute", left: 264, right: 264, top: 1604, height: 130, borderRadius: 70, background: "radial-gradient(ellipse at center, rgba(177,247,255,.46), rgba(0,207,255,.22) 36%, transparent 73%)", filter: "blur(28px)", mixBlendMode: "screen", opacity: footerPulse * 0.74, scale: 0.86 + footerPulse * 0.22}} />
      <div style={{position: "absolute", top: 1622, left: 0, right: 0, display: "flex", justifyContent: "center"}}>
        <div style={{height: 88, padding: "0 60px", borderRadius: 50, border: `3px solid ${CYAN}`, background: "rgba(2,16,28,.8)", boxShadow: "0 0 20px rgba(34,216,255,.45)", display: "flex", alignItems: "center", fontSize: 40, fontWeight: 600, letterSpacing: 6}}>www.iashark.com</div>
      </div>

      <AbsoluteFill style={{background: "radial-gradient(ellipse at center, transparent 54%, rgba(0,4,8,.09) 79%, rgba(0,2,4,.22) 100%)", pointerEvents: "none"}} />
    </AbsoluteFill>
  );
};
