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

type Phase = {
  label: string;
  share: number;
  title: string;
  note: string;
  danger: number;
  intensity: number;
  rhythm: number;
};

const PHASES: Phase[] = [
  {label: "0–15", share: 7, title: "DÉPART FERMÉ", note: "PEU DE BUTS OBSERVÉS DANS LE PREMIER QUART D’HEURE", danger: 1, intensity: 2, rhythm: 2},
  {label: "15–30", share: 12, title: "LE RYTHME MONTE", note: "LES ESPACES COMMENCENT À S’OUVRIR", danger: 2, intensity: 3, rhythm: 3},
  {label: "30–45", share: 20, title: "DANGER AVANT LA PAUSE", note: "LA PREMIÈRE VRAIE ZONE FORTE DU MATCH", danger: 4, intensity: 4, rhythm: 4},
  {label: "45–60", share: 15, title: "REPRISE SOUS TENSION", note: "LE MATCH REPART, MAIS LE PIC RESTE À VENIR", danger: 3, intensity: 3, rhythm: 3},
  {label: "60–75", share: 22, title: "LE MATCH S’OUVRE", note: "LA PRESSION AUGMENTE DANS LE DERNIER TIERS", danger: 4, intensity: 4, rhythm: 5},
  {label: "75–90", share: 24, title: "LA FIN PEUT BASCULER", note: "C’EST LA PÉRIODE LA PLUS CHARGÉE EN BUTS", danger: 5, intensity: 5, rhythm: 5},
];

const ACCENT = "#10d9ff";
const SOFT = "#9db8c7";
const clamp = {extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const};

const WAVE_VALUES = Array.from({length: 91}, (_, minute) => {
  const phase = Math.min(5, Math.floor(minute / 15));
  const base = PHASES[phase].share;
  const texture = Math.sin(minute * 0.78) * 1.7 + Math.sin(minute * 1.91) * 0.9;
  return Math.max(3, base + texture);
});

const waveLine = WAVE_VALUES.map((value, index) => {
  const x = (index / 90) * 850;
  const y = 126 - (value / 27) * 105;
  return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
}).join(" ");
const waveArea = `${waveLine} L850,134 L0,134 Z`;

const Team = ({name, logo}: {name: string; logo: string}) => (
  <div style={{width: 290, display: "flex", flexDirection: "column", alignItems: "center"}}>
    <div style={{width: 190, height: 190, display: "grid", placeItems: "center", background: "radial-gradient(circle,rgba(16,217,255,.18),transparent 69%)"}}>
      <CanvasImage src={staticFile(logo)} width={175} height={175} style={{objectFit: "contain", filter: "drop-shadow(0 16px 19px rgba(0,0,0,.88)) drop-shadow(0 0 11px rgba(16,217,255,.22))"}} />
    </div>
    <div style={{fontFamily: "Impact, Arial Black, sans-serif", fontStyle: "italic", fontSize: name.length > 10 ? 37 : 43, lineHeight: 1, textAlign: "center", textTransform: "uppercase", marginTop: 5, whiteSpace: "nowrap"}}>{name}</div>
  </div>
);

const Meter = ({label, value}: {label: string; value: number}) => (
  <div style={{height: 104, borderRadius: 18, border: "1px solid rgba(16,217,255,.53)", background: "linear-gradient(180deg,rgba(7,35,50,.94),rgba(1,13,21,.97))", boxShadow: "inset 0 0 24px rgba(0,168,213,.10),0 13px 26px rgba(0,0,0,.42)", padding: "19px 19px 15px"}}>
    <div style={{fontFamily: "Arial Black, Arial", fontSize: 18, letterSpacing: 1.2, textAlign: "center"}}>{label}</div>
    <div style={{display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5, marginTop: 15}}>
      {Array.from({length: 5}, (_, index) => <div key={index} style={{height: 14, transform: "skewX(-9deg)", background: index < value ? ACCENT : "#123443", boxShadow: index < value ? "0 0 9px rgba(16,217,255,.52)" : "none"}} />)}
    </div>
  </div>
);

export const TOTTENHAM_VILLA_MATCH_PULSE_DURATION = 600;

export const MatchPulseTottenhamAstonVilla = () => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const finalFrames = 2 * fps;
  const finalStart = durationInFrames - finalFrames;
  const halfPause = Math.round(2.5 * fps);
  const liveFrames = finalStart - halfPause;
  const firstHalfFrames = Math.ceil(liveFrames / 2);
  const secondHalfStart = firstHalfFrames + halfPause;
  const secondHalfFrames = finalStart - secondHalfStart;

  const minute = frame < firstHalfFrames
    ? Math.floor(interpolate(frame, [0, firstHalfFrames - 1], [0, 45.99], clamp))
    : frame < secondHalfStart
      ? 45
      : Math.min(90, Math.floor(interpolate(frame, [secondHalfStart, finalStart - 1], [45, 90.99], clamp)));
  const phaseIndex = minute >= 90 ? 5 : Math.min(5, Math.floor(minute / 15));
  const phase = PHASES[phaseIndex];
  const isHalfTime = frame >= firstHalfFrames && frame < secondHalfStart;
  const isFinal = frame >= finalStart;
  const phaseStarts = [
    0,
    Math.round(firstHalfFrames / 3),
    Math.round((firstHalfFrames * 2) / 3),
    secondHalfStart,
    secondHalfStart + Math.round(secondHalfFrames / 3),
    secondHalfStart + Math.round((secondHalfFrames * 2) / 3),
  ];
  const messageStart = isFinal ? finalStart : isHalfTime ? firstHalfFrames : phaseStarts[phaseIndex];
  const messageAge = Math.max(0, frame - messageStart);
  const progress = isFinal ? 1 : minute / 90;
  const circleLength = 2 * Math.PI * 55;
  const glow = interpolate(frame % 42, [0, 21, 41], [0.72, 1, 0.72], clamp);

  const headline = isFinal ? "FIN DE MATCH DÉCISIVE" : isHalfTime ? "MI-TEMPS" : phase.title;
  const note = isFinal ? "24 % DES BUTS OBSERVÉS ARRIVENT ENTRE 75’ ET 90’" : isHalfTime ? "LE PLUS GROS DANGER ARRIVE APRÈS L’HEURE DE JEU" : phase.note;
  const kicker = isFinal ? "LECTURE FINALE IASHARK" : isHalfTime ? "45 MINUTES" : `${phase.label} MINUTES · ${phase.share} % DES BUTS OBSERVÉS`;
  const active = isHalfTime ? PHASES[2] : phase;

  return (
    <AbsoluteFill style={{background: "#01060a", color: "white", fontFamily: "Arial, sans-serif", overflow: "hidden"}}>
      <CanvasImage src={staticFile("ads/iashark-ad-stadium-v1.png")} width={1080} height={1920} style={{objectFit: "cover", opacity: 0.32, scale: 1.05}} />
      <AbsoluteFill style={{background: "radial-gradient(circle at 8% 22%,rgba(12,177,241,.24),transparent 17%),radial-gradient(circle at 82% 22%,rgba(12,177,241,.20),transparent 18%),linear-gradient(180deg,rgba(0,4,8,.40),rgba(0,8,13,.84) 52%,#00080d 100%)"}} />
      <AbsoluteFill style={{background: ACCENT, mixBlendMode: "screen", opacity: interpolate(messageAge, [0, 2, 9, 20], [0, active.share >= 22 ? 0.24 : 0.13, 0.04, 0], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)})}} />

      <Interactive.Div name="IASHARK brand" style={{position: "absolute", top: 176, left: 65, right: 175, display: "flex", flexDirection: "column", alignItems: "center", opacity: interpolate(frame, [0, 16], [0, 1], clamp)}}>
        <CanvasImage src={staticFile("ads/iashark-logo.png")} width={300} height={80} style={{objectFit: "contain"}} />
        <div style={{fontSize: 15, letterSpacing: 8, color: "#a8c0cc", marginTop: -5}}>LECTURE IASHARK</div>
      </Interactive.Div>

      <div style={{position: "absolute", top: 300, left: 65, right: 175, textAlign: "center", fontSize: 15, fontWeight: 900, letterSpacing: 4.5, color: "#6bdfff"}}>PREMIER LEAGUE · 19 SEPT. · 13:30</div>

      <div style={{position: "absolute", top: 336, left: 64, right: 174, display: "flex", alignItems: "flex-start", justifyContent: "space-between"}}>
        <Team name="Tottenham" logo="logos/team-47.png" />
        <div style={{fontFamily: "Impact, Arial Black, sans-serif", fontStyle: "italic", fontSize: 47, marginTop: 76, color: ACCENT, textShadow: "0 0 17px rgba(16,217,255,.7)"}}>VS</div>
        <Team name="Aston Villa" logo="logos/team-66.png" />
      </div>

      <Interactive.Div name="Animated match clock" style={{position: "absolute", top: 587, left: 65, right: 175, display: "grid", placeItems: "center"}}>
        <div style={{width: 138, height: 138, position: "relative", display: "grid", placeItems: "center"}}>
          <svg width="138" height="138" viewBox="0 0 138 138" style={{position: "absolute", rotate: "-90deg"}}>
            <circle cx="69" cy="69" r="55" fill="rgba(0,9,15,.96)" stroke="#163746" strokeWidth="10" />
            <circle cx="69" cy="69" r="55" fill="none" stroke={ACCENT} strokeWidth="10" strokeLinecap="round" strokeDasharray={circleLength} strokeDashoffset={circleLength * (1 - progress)} style={{filter: `drop-shadow(0 0 ${10 * glow}px rgba(16,217,255,.88))`}} />
          </svg>
          <div style={{fontFamily: "Arial Black, Arial", fontSize: 41, zIndex: 2}}>{minute}’</div>
        </div>
      </Interactive.Div>

      <Interactive.Div name="0 to 90 timeline" style={{position: "absolute", top: 744, left: 82, width: 816, height: 74}}>
        <div style={{position: "absolute", top: 24, left: 0, right: 0, height: 7, background: "#b8d1dc88", borderRadius: 8}} />
        <div style={{position: "absolute", top: 24, left: 0, height: 7, width: `${progress * 100}%`, background: ACCENT, borderRadius: 8, boxShadow: "0 0 16px rgba(16,217,255,.9)"}} />
        {Array.from({length: 7}, (_, index) => <div key={index} style={{position: "absolute", top: 16, left: `${(index / 6) * 100}%`, width: 2, height: 23, background: index / 6 <= progress ? ACCENT : "#abc2cc", translate: "-1px 0px"}} />)}
        <div style={{position: "absolute", top: 12, left: `${progress * 100}%`, width: 31, height: 31, borderRadius: "50%", border: `6px solid ${ACCENT}`, background: "white", boxShadow: "0 0 18px rgba(16,217,255,.9)", translate: "-15px 0px"}} />
        <div style={{position: "absolute", top: 46, left: 0, fontSize: 20, fontWeight: 900}}>0’</div>
        <div style={{position: "absolute", top: 46, right: 0, fontSize: 20, fontWeight: 900}}>90’</div>
      </Interactive.Div>

      <Interactive.Div name="Animated danger waveform" style={{position: "absolute", top: 825, left: 64, width: 850, height: 140}}>
        <svg width="850" height="140" viewBox="0 0 850 140">
          <defs><linearGradient id="tv-wave-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={ACCENT} stopOpacity=".88"/><stop offset="1" stopColor={ACCENT} stopOpacity=".05"/></linearGradient><clipPath id="tv-wave-progress"><rect x="0" y="0" width={850 * progress} height="140"/></clipPath></defs>
          <path d={waveArea} fill="#12313d88"/><path d={waveLine} fill="none" stroke="#7292a0" strokeWidth="2" opacity=".72"/><path d={waveArea} fill="url(#tv-wave-fill)" clipPath="url(#tv-wave-progress)"/><path d={waveLine} fill="none" stroke={ACCENT} strokeWidth="3" clipPath="url(#tv-wave-progress)" style={{filter: "drop-shadow(0 0 7px rgba(16,217,255,.85))"}}/><line x1={850 * progress} x2={850 * progress} y1="0" y2="134" stroke={ACCENT} strokeWidth="2" strokeDasharray="7 7"/><line x1="0" x2="850" y1="134" y2="134" stroke="#4d7383" strokeWidth="2"/>
        </svg>
      </Interactive.Div>

      <Interactive.Div name="Current 15 minute commentary" style={{position: "absolute", top: 980, left: 60, width: 860, height: 275, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", opacity: interpolate(messageAge, [0, 8], [0.22, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)}), translate: interpolate(messageAge, [0, 12], ["0px 24px", "0px 0px"], clamp)}}>
        <div style={{fontSize: 18, fontWeight: 900, letterSpacing: 5.2, color: SOFT}}>{kicker}</div>
        <div style={{maxWidth: 850, fontFamily: "Impact, Arial Black, sans-serif", fontStyle: "italic", fontSize: headline.length > 21 ? 68 : 82, lineHeight: 0.98, marginTop: 20, textShadow: `0 0 ${active.share >= 22 ? 25 : 14}px rgba(16,217,255,.66)`}}>{headline}</div>
        <div style={{fontFamily: "Arial Black, Arial", fontSize: 25, lineHeight: 1.17, color: ACCENT, marginTop: 21, maxWidth: 785}}>{note}</div>
      </Interactive.Div>

      <Interactive.Div name="Live indicators" style={{position: "absolute", top: 1278, left: 66, width: 850, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 15}}>
        <Meter label="DANGER" value={active.danger}/><Meter label="INTENSITÉ" value={active.intensity}/><Meter label="RYTHME" value={active.rhythm}/>
      </Interactive.Div>

      <div style={{position: "absolute", top: 1420, left: 105, width: 775, textAlign: "center", color: SOFT, fontSize: 15, fontWeight: 800, letterSpacing: 3.2}}>FRÉQUENCES OBSERVÉES SUR 41 BUTS · SAISON 2026/27</div>
      <div style={{position: "absolute", top: 1496, left: 105, width: 775, height: 2, background: `linear-gradient(90deg,transparent,${ACCENT},transparent)`, boxShadow: `0 0 17px ${ACCENT}`}} />
      <Interactive.Div name="Website" style={{position: "absolute", top: 1535, left: 70, width: 830, textAlign: "center", fontFamily: "Arial Black, Arial", fontSize: 40, letterSpacing: 7, color: ACCENT, textShadow: "0 0 18px rgba(16,217,255,.6)"}}>IASHARK.COM</Interactive.Div>
    </AbsoluteFill>
  );
};
