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
  level: string;
  title: string;
  note: string;
  pressure: number;
  shots: number;
  rhythm: number;
  balance: number;
};

export type MatchPulseProps = {
  homeName?: string;
  awayName?: string;
  homeLogo?: string;
  awayLogo?: string;
  competition?: string;
  phases?: Phase[];
  showVs?: boolean;
  showCommentary?: boolean;
  goals?: {minute: number}[];
  homeXg?: number[];
  awayXg?: number[];
};

const PHASES: Phase[] = [
  {
    label: "0–15",
    share: 17,
    level: "DANGER MODÉRÉ",
    title: "DÉPART SOUS TENSION",
    note: "LE PREMIER QUART D’HEURE PEUT DÉJÀ OUVRIR LE MATCH",
    pressure: 3,
    shots: 2,
    rhythm: 3,
    balance: 54,
  },
  {
    label: "15–30",
    share: 9,
    level: "RYTHME PLUS BAS",
    title: "LE MATCH SE REFERME",
    note: "C’EST LA PÉRIODE LA MOINS CHARGÉE EN BUTS",
    pressure: 2,
    shots: 2,
    rhythm: 2,
    balance: 48,
  },
  {
    label: "30–45",
    share: 24,
    level: "PIC DE DANGER",
    title: "LE DANGER MONTE",
    note: "LA MEILLEURE FENÊTRE POUR UN BUT AVANT LA PAUSE",
    pressure: 5,
    shots: 4,
    rhythm: 4,
    balance: 56,
  },
  {
    label: "45–60",
    share: 24,
    level: "PIC DE DANGER",
    title: "LA REPRISE PEUT BASCULER",
    note: "LE RISQUE RESTE AU PLUS HAUT DÈS LE RETOUR",
    pressure: 5,
    shots: 4,
    rhythm: 5,
    balance: 49,
  },
  {
    label: "60–75",
    share: 14,
    level: "MATCH SOUS CONTRÔLE",
    title: "CHELSEA POSE LE JEU",
    note: "SON JEU DE PASSES PEUT FAIRE RECULER BRENTFORD",
    pressure: 3,
    shots: 3,
    rhythm: 3,
    balance: 44,
  },
  {
    label: "75–90",
    share: 14,
    level: "ZONE À SURVEILLER",
    title: "BRENTFORD SOUS PRESSION",
    note: "SA FIN DE MATCH RESTE LA PÉRIODE LA PLUS FRAGILE",
    pressure: 4,
    shots: 4,
    rhythm: 5,
    balance: 40,
  },
];

const ACCENT = "#09d9ff";
const SOFT = "#8eb4c5";
const clamp = {extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const};

const WAVE_VALUES = Array.from({length: 91}, (_, minute) => {
  const phase = Math.min(5, Math.floor(minute / 15));
  const base = PHASES[phase].share;
  const wobble = Math.sin(minute * 0.84) * 2.7 + Math.sin(minute * 2.11) * 1.4;
  return Math.max(4, base + wobble);
});

const waveLine = WAVE_VALUES.map((value, index) => {
  const x = (index / 90) * 920;
  const y = 138 - (value / 29) * 112;
  return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
}).join(" ");
const waveArea = `${waveLine} L920,146 L0,146 Z`;

const Team = ({name, logo}: {name: string; logo: string}) => (
  <Interactive.Div
    name={`${name} team`}
    style={{width: 330, display: "flex", flexDirection: "column", alignItems: "center"}}
  >
    <div
      style={{
        width: 245,
        height: 245,
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(circle,rgba(8,216,255,.17),transparent 68%)",
      }}
    >
      <CanvasImage
        src={logo.startsWith("http") ? logo : staticFile(logo)}
        width={224}
        height={224}
        style={{objectFit: "contain", filter: "drop-shadow(0 18px 22px rgba(0,0,0,.86)) drop-shadow(0 0 12px rgba(8,217,255,.24))"}}
      />
    </div>
    <div
      style={{
        marginTop: 4,
        width: 330,
        fontFamily: "Impact, Arial Black, Arial, sans-serif",
        fontStyle: "italic",
        fontSize: name.length > 9 ? 42 : 48,
        lineHeight: 1,
        textAlign: "center",
        textTransform: "uppercase",
        textShadow: "0 5px 12px rgba(0,0,0,.85)",
      }}
    >
      {name}
    </div>
  </Interactive.Div>
);

const Meter = ({label, value, icon}: {label: string; value: number; icon: "pressure" | "shots" | "rhythm"}) => (
  <div
    style={{
      height: 128,
      borderRadius: 20,
      border: "2px solid rgba(9,217,255,.55)",
      background: "linear-gradient(180deg,rgba(7,34,49,.95),rgba(1,12,20,.98))",
      boxShadow: "inset 0 0 26px rgba(0,164,210,.12),0 15px 28px rgba(0,0,0,.45)",
      padding: "20px 21px",
      display: "grid",
      gridTemplateColumns: "66px 1fr",
      alignItems: "center",
      columnGap: 15,
    }}
  >
    <div style={{width: 62, height: 62, display: "grid", placeItems: "center"}}>
      {icon === "pressure" ? (
        <svg width="62" height="62" viewBox="0 0 62 62">
          <path d="M10 43a23 23 0 1 1 42 0" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
          <path d="M31 34l13-13" stroke={ACCENT} strokeWidth="5" strokeLinecap="round" />
          <circle cx="31" cy="34" r="5" fill="#fff" />
        </svg>
      ) : icon === "shots" ? (
        <svg width="62" height="62" viewBox="0 0 62 62">
          <path d="M9 48V14h44v34M15 48V21h32v27M15 21l32 27M47 21L15 48M31 21v27" fill="none" stroke="#fff" strokeWidth="3.2" />
        </svg>
      ) : (
        <svg width="62" height="62" viewBox="0 0 62 62">
          <circle cx="34" cy="13" r="6" fill="#fff" />
          <path d="M29 22l-9 13 9 5 8-12 9 9M29 40l-8 12M39 39l6 14" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </div>
    <div>
      <div style={{fontFamily: "Arial Black, Arial", fontSize: 22, lineHeight: 1}}>{label}</div>
      <div style={{display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5, marginTop: 15}}>
        {Array.from({length: 5}, (_, index) => (
          <div
            key={index}
            style={{
              height: 17,
              transform: "skewX(-9deg)",
              background: index < value ? ACCENT : "#123443",
              boxShadow: index < value ? "0 0 10px rgba(9,217,255,.55)" : "none",
            }}
          />
        ))}
      </div>
    </div>
  </div>
);

export const MatchPulseBrentfordChelseaInstagram = ({
  homeName="Brentford",
  awayName="Chelsea",
  homeLogo="logos/team-55.png",
  awayLogo="logos/team-49.png",
  competition="PREMIER LEAGUE • 18 SEPT. • 21:00",
  phases=PHASES,
  showVs=true,
  showCommentary=true,
  goals=[],
  homeXg=[0.16,0.33,0.52,0.72,0.91,1.10],
  awayXg=[0.21,0.39,0.61,0.84,1.08,1.35],
}: MatchPulseProps = {}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  const finalFrames = 2 * fps;
  const finalStart = durationInFrames - finalFrames;
  const halfPause = Math.round(2.5 * fps);
  const liveFrames = finalStart - halfPause;
  const firstHalfFrames = Math.ceil(liveFrames / 2);
  const secondHalfStart = firstHalfFrames + halfPause;
  const secondHalfFrames = finalStart - secondHalfStart;

  const minute =
    frame < firstHalfFrames
      ? Math.floor(interpolate(frame, [0, firstHalfFrames - 1], [0, 45.99], clamp))
      : frame < secondHalfStart
        ? 45
        : Math.min(90, Math.floor(interpolate(frame, [secondHalfStart, finalStart - 1], [45, 90.99], clamp)));

  const phaseIndex = minute >= 90 ? 5 : Math.min(5, Math.floor(minute / 15));
  const phase = phases[phaseIndex];
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
  const circleLength = 2 * Math.PI * 59;
  const glow = interpolate(frame % 42, [0, 21, 41], [0.72, 1, 0.72], clamp);
  const activePhase = isHalfTime ? phases[2] : phase;

  const waveValues = Array.from({length: 91}, (_, waveMinute) => {
    const wavePhase = Math.min(5, Math.floor(waveMinute / 15));
    const base = phases[wavePhase].share;
    const wobble = Math.sin(waveMinute * 0.84) * 2.7 + Math.sin(waveMinute * 2.11) * 1.4;
    return Math.max(4, base + wobble);
  });
  const localWaveLine = waveValues.map((value, index) => {
    const x = (index / 90) * 920;
    const y = 138 - (value / 29) * 112;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const localWaveArea = `${localWaveLine} L920,146 L0,146 Z`;
  const xgIndex = Math.min(5, Math.floor(Math.min(89.99, minute) / 15));
  const phaseProgress = Math.max(0, Math.min(1, (minute - xgIndex * 15) / 15));
  const previousHomeXg = xgIndex === 0 ? 0 : homeXg[xgIndex - 1];
  const previousAwayXg = xgIndex === 0 ? 0 : awayXg[xgIndex - 1];
  const liveHomeXg = previousHomeXg + (homeXg[xgIndex] - previousHomeXg) * phaseProgress;
  const liveAwayXg = previousAwayXg + (awayXg[xgIndex] - previousAwayXg) * phaseProgress;
  const xgBalance = liveHomeXg + liveAwayXg === 0 ? 50 : liveHomeXg / (liveHomeXg + liveAwayXg) * 100;

  const headline = isFinal ? "MATCH SERRÉ ATTENDU" : isHalfTime ? "MI-TEMPS" : phase.title;
  const note = isFinal
    ? "LE MODÈLE PRIVILÉGIE MOINS DE 3,5 BUTS"
    : isHalfTime
      ? "LES DEUX PLUS GROS PICS DE DANGER ENCADRENT LA PAUSE"
      : phase.note;
  const kicker = isFinal
    ? "LECTURE FINALE DU MODÈLE"
    : isHalfTime
      ? "45 MINUTES"
      : `${phase.label} MINUTES • ${phase.share}% DES BUTS OBSERVÉS`;

  return (
    <AbsoluteFill style={{background: "#01060a", color: "white", fontFamily: "Arial, sans-serif", overflow: "hidden"}}>
      <CanvasImage
        src={staticFile("ads/iashark-ad-stadium-v1.png")}
        width={1080}
        height={1920}
        style={{objectFit: "cover", opacity: 0.28, scale: 1.045}}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 7% 18%,rgba(15,171,255,.28),transparent 16%),radial-gradient(circle at 93% 18%,rgba(15,171,255,.25),transparent 16%),linear-gradient(180deg,rgba(0,4,8,.40),rgba(0,8,13,.82) 50%,#00080d 100%)",
        }}
      />
      <AbsoluteFill
        style={{
          background: ACCENT,
          mixBlendMode: "screen",
          opacity: interpolate(messageAge, [0, 2, 9, 21], [0, activePhase.share >= 24 ? 0.28 : 0.15, 0.05, 0], {
            ...clamp,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />

      <Interactive.Div
        name="IASHARK brand"
        style={{
          position: "absolute",
          top: showCommentary ? 46 : 145,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: interpolate(frame, [0, 16], [0, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)}),
        }}
      >
        <CanvasImage src={staticFile("ads/iashark-logo.png")} width={315} height={86} style={{objectFit: "contain"}} />
        <div style={{fontSize: 17, letterSpacing: 8, color: "#a8c0cc", marginTop: -6}}>LECTURE IASHARK</div>
      </Interactive.Div>

      <div
        style={{
          position: "absolute",
          top: showCommentary ? 164 : 260,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 16,
          fontWeight: 900,
          letterSpacing: 5,
          color: "#6bdfff",
        }}
      >
        {competition}
      </div>

      <div
        style={{
          position: "absolute",
          top: showCommentary ? 206 : 306,
          left: 72,
          right: 72,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <Team name={homeName} logo={homeLogo} />
        {showVs?<div style={{fontFamily: "Impact, Arial Black, Arial", fontStyle: "italic", fontSize: 54, marginTop: 100, color: ACCENT, textShadow: "0 0 17px rgba(9,217,255,.7)"}}>VS</div>:null}
        <Team name={awayName} logo={awayLogo} />
      </div>

      <Interactive.Div
        name="Animated match clock"
        style={{position: "absolute", top: showCommentary ? 526 : 626, left: 0, right: 0, display: "grid", placeItems: "center"}}
      >
        <div style={{width: 148, height: 148, position: "relative", display: "grid", placeItems: "center"}}>
          <svg width="148" height="148" viewBox="0 0 148 148" style={{position: "absolute", rotate: "-90deg"}}>
            <circle cx="74" cy="74" r="59" fill="rgba(0,9,15,.96)" stroke="#163746" strokeWidth="10" />
            <circle
              cx="74"
              cy="74"
              r="59"
              fill="none"
              stroke={ACCENT}
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={circleLength}
              strokeDashoffset={circleLength * (1 - progress)}
              style={{filter: `drop-shadow(0 0 ${10 * glow}px rgba(9,217,255,.88))`}}
            />
          </svg>
          <div style={{fontFamily: "Arial Black, Arial", fontSize: 44, zIndex: 2}}>{minute}’</div>
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="0 to 90 timeline"
        style={{position: "absolute", top: showCommentary ? 692 : 792, left: 80, right: 80, height: 79}}
      >
        <div style={{position: "absolute", top: 25, left: 0, right: 0, height: 8, background: "#b8d1dc88", borderRadius: 8}} />
        <div
          style={{
            position: "absolute",
            top: 25,
            left: 0,
            height: 8,
            width: `${progress * 100}%`,
            background: ACCENT,
            borderRadius: 8,
            boxShadow: "0 0 16px rgba(9,217,255,.9)",
          }}
        />
        {Array.from({length: 7}, (_, index) => {
          const x = (index / 6) * 100;
          return (
            <div key={index} style={{position: "absolute", top: 16, left: `${x}%`, width: 2, height: 26, background: index / 6 <= progress ? ACCENT : "#abc2cc", translate: "-1px 0px"}} />
          );
        })}
        <div
          style={{
            position: "absolute",
            top: 13,
            left: `${progress * 100}%`,
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: `6px solid ${ACCENT}`,
            background: "white",
            boxShadow: "0 0 18px rgba(9,217,255,.9)",
            translate: "-16px 0px",
          }}
        />
        <div style={{position: "absolute", top: 49, left: 0, fontSize: 22, fontWeight: 900}}>0’</div>
        <div style={{position: "absolute", top: 49, right: 0, fontSize: 22, fontWeight: 900}}>90’</div>
        {goals.map((goal,index)=><div key={`${goal.minute}-${index}`} style={{position:"absolute",top:8,left:`${goal.minute/90*100}%`,translate:"-18px 0",width:36,height:36,borderRadius:"50%",background:"white",display:"grid",placeItems:"center",fontSize:27,lineHeight:1,opacity:minute>=goal.minute?1:0,scale:minute>=goal.minute?1:0,boxShadow:`0 0 14px ${ACCENT}`,zIndex:4}}>⚽</div>)}
      </Interactive.Div>

      <Interactive.Div name="Animated danger waveform" style={{position: "absolute", top: showCommentary ? 780 : 888, left: 80, width: 920, height: 154}}>
        <svg width="920" height="154" viewBox="0 0 920 154">
          <defs>
            <linearGradient id="wave-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={ACCENT} stopOpacity=".88" />
              <stop offset="1" stopColor={ACCENT} stopOpacity=".06" />
            </linearGradient>
            <clipPath id="wave-progress">
              <rect x="0" y="0" width={920 * progress} height="154" />
            </clipPath>
          </defs>
          <path d={localWaveArea} fill="#12313d88" />
          <path d={localWaveLine} fill="none" stroke="#7292a0" strokeWidth="2" opacity=".72" />
          <path d={localWaveArea} fill="url(#wave-fill)" clipPath="url(#wave-progress)" />
          <path d={localWaveLine} fill="none" stroke={ACCENT} strokeWidth="3" clipPath="url(#wave-progress)" style={{filter: "drop-shadow(0 0 7px rgba(9,217,255,.85))"}} />
          <line x1={920 * progress} x2={920 * progress} y1="0" y2="146" stroke={ACCENT} strokeWidth="2" strokeDasharray="7 7" />
          <line x1="0" x2="920" y1="146" y2="146" stroke="#4d7383" strokeWidth="2" />
        </svg>
      </Interactive.Div>

      {showCommentary?<Interactive.Div
        name="Current 15 minute commentary"
        style={{
          position: "absolute",
          top: 970,
          left: 74,
          right: 74,
          height: 330,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          opacity: interpolate(messageAge, [0, 8], [0.25, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)}),
          translate: interpolate(messageAge, [0, 12], ["0px 26px", "0px 0px"], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)}),
        }}
      >
        <div style={{fontSize: 20, fontWeight: 900, letterSpacing: 6, color: SOFT}}>{kicker}</div>
        <div
          style={{
            maxWidth: 920,
            fontFamily: "Impact, Arial Black, Arial",
            fontStyle: "italic",
            fontSize: headline.length > 23 ? 78 : 94,
            lineHeight: 0.98,
            letterSpacing: 1,
            marginTop: 24,
            textShadow: `0 0 ${activePhase.share >= 24 ? 27 : 15}px rgba(9,217,255,.68)`,
          }}
        >
          {headline}
        </div>
        <div style={{fontFamily: "Arial Black, Arial", fontSize: 29, lineHeight: 1.18, color: ACCENT, marginTop: 25, maxWidth: 830}}>{note}</div>
      </Interactive.Div>:null}

      <Interactive.Div
        name="Live indicators"
        style={{position: "absolute", top: showCommentary?1333:1105, left: 70, right: 70, display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 17}}
      >
        <Meter label="PRESSION" value={activePhase.pressure} icon="pressure" />
        <Meter label="TIRS" value={activePhase.shots} icon="shots" />
        <Meter label="RYTHME" value={activePhase.rhythm} icon="rhythm" />
      </Interactive.Div>

      <Interactive.Div
        name="Team balance"
        style={{position: "absolute", top: showCommentary?1502:1285, left: 166, right: 166}}
      >
        <div style={{display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 900, letterSpacing: 2, color: "#bed1db"}}>
          <span>{homeName} • {liveHomeXg.toFixed(2).replace('.',',')} xG</span>
          <span>{liveAwayXg.toFixed(2).replace('.',',')} xG • {awayName}</span>
        </div>
        <div style={{height: 15, display: "flex", borderRadius: 20, overflow: "hidden", background: "#163747", marginTop: 11, boxShadow: "0 0 14px rgba(9,217,255,.28)"}}>
          <div style={{width: `${showCommentary?activePhase.balance:xgBalance}%`, background: ACCENT, boxShadow: "0 0 15px rgba(9,217,255,.72)"}} />
          <div style={{flex: 1, background: "#37667c"}} />
        </div>
      </Interactive.Div>

      <div
        style={{
          position: "absolute",
          left: 128,
          right: 128,
          bottom: showCommentary ? 174 : 385,
          height: 2,
          background: "linear-gradient(90deg,transparent,#09d9ff,transparent)",
          boxShadow: "0 0 18px rgba(9,217,255,.8)",
        }}
      />
      <Interactive.Div
        name="Website"
        style={{
          position: "absolute",
          bottom: showCommentary ? 88 : 300,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: "Arial Black, Arial",
          fontSize: 43,
          letterSpacing: 8,
          color: ACCENT,
          textShadow: "0 0 18px rgba(9,217,255,.6)",
        }}
      >
        IASHARK.COM
      </Interactive.Div>
    </AbsoluteFill>
  );
};
