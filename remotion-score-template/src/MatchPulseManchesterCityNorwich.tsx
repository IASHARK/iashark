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
  cityPressure: number;
  norwichPressure: number;
  accent: "city" | "norwich" | "balanced";
};

const phases: Phase[] = [
  {
    label: "0–15",
    share: 13,
    title: "NORWICH MENACE TÔT",
    note: "6 BUTS SUR 19 DANS LE PREMIER QUART D’HEURE",
    cityPressure: 37,
    norwichPressure: 63,
    accent: "norwich",
  },
  {
    label: "15–30",
    share: 19,
    title: "PRESSION ÉQUILIBRÉE",
    note: "LES DEUX ÉQUIPES PEUVENT ACCÉLÉRER",
    cityPressure: 50,
    norwichPressure: 50,
    accent: "balanced",
  },
  {
    label: "30–45",
    share: 11,
    title: "RYTHME PLUS BAS",
    note: "LA TRANCHE LA MOINS CHARGÉE AVANT LA PAUSE",
    cityPressure: 37,
    norwichPressure: 63,
    accent: "norwich",
  },
  {
    label: "45–60",
    share: 19,
    title: "CITY ACCÉLÈRE",
    note: "LA REPRISE FAVORISE MANCHESTER CITY",
    cityPressure: 61,
    norwichPressure: 39,
    accent: "city",
  },
  {
    label: "60–75",
    share: 12,
    title: "NORWICH CHERCHE LE CONTRE",
    note: "MENACE EXTÉRIEURE, MAIS VOLUME PLUS FAIBLE",
    cityPressure: 39,
    norwichPressure: 61,
    accent: "norwich",
  },
  {
    label: "75–90",
    share: 26,
    title: "PIC DE DANGER CITY",
    note: "LA TRANCHE LA PLUS CHARGÉE DU MATCH",
    cityPressure: 66,
    norwichPressure: 34,
    accent: "city",
  },
];

const CITY = "#08d9ff";
const NORWICH = "#d8f236";

const Team = ({name, logo}: {name: string; logo: string}) => (
  <Interactive.Div
    name={`${name} team`}
    style={{width: 280, display: "flex", flexDirection: "column", alignItems: "center", gap: 18}}
  >
    <div
      style={{
        width: 176,
        height: 176,
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(circle,rgba(8,217,255,.15),transparent 70%)",
      }}
    >
      <CanvasImage
        src={staticFile(logo)}
        width={164}
        height={164}
        style={{objectFit: "contain", filter: "drop-shadow(0 15px 18px rgba(0,0,0,.82))"}}
      />
    </div>
    <div
      style={{
        width: 294,
        minHeight: 62,
        display: "grid",
        placeItems: "center",
        borderRadius: 16,
        border: "1px solid rgba(8,217,255,.42)",
        background: "linear-gradient(180deg,rgba(7,35,50,.94),rgba(2,14,22,.97))",
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: name.length > 13 ? 23 : 27,
        lineHeight: 1.05,
        textAlign: "center",
        textTransform: "uppercase",
        padding: "0 12px",
      }}
    >
      {name}
    </div>
  </Interactive.Div>
);

const clamp = {extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const};

export const MatchPulseManchesterCityNorwich = () => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  const finalFrames = 3 * fps;
  const matchEnd = durationInFrames - finalFrames;
  const halfPause = Math.round(2.5 * fps);
  const liveFrames = matchEnd - halfPause;
  const firstHalfFrames = Math.ceil(liveFrames / 2);
  const secondHalfStart = firstHalfFrames + halfPause;
  const secondHalfFrames = matchEnd - secondHalfStart;

  const minute =
    frame < firstHalfFrames
      ? Math.floor(interpolate(frame, [0, firstHalfFrames - 1], [0, 45.99], clamp))
      : frame < secondHalfStart
        ? 45
        : Math.min(90, Math.floor(interpolate(frame, [secondHalfStart, matchEnd - 1], [45, 90.99], clamp)));

  const phaseIndex = minute >= 90 ? 5 : Math.min(5, Math.floor(minute / 15));
  const phase = phases[phaseIndex];
  const isHalfTime = frame >= firstHalfFrames && frame < secondHalfStart;
  const isFinal = frame >= matchEnd;

  const phaseStarts = [
    0,
    Math.round(firstHalfFrames / 3),
    Math.round((firstHalfFrames * 2) / 3),
    secondHalfStart,
    secondHalfStart + Math.round(secondHalfFrames / 3),
    secondHalfStart + Math.round((secondHalfFrames * 2) / 3),
  ];
  const messageStart = isHalfTime ? firstHalfFrames : phaseStarts[phaseIndex];
  const messageAge = Math.max(0, frame - messageStart);
  const phaseColor = phase.accent === "norwich" ? NORWICH : CITY;
  const circleLength = 2 * Math.PI * 80;
  const pulse = interpolate(frame % 44, [0, 22, 43], [0.78, 1, 0.78], clamp);

  return (
    <AbsoluteFill style={{background: "#01060a", color: "white", fontFamily: "Arial, sans-serif", overflow: "hidden"}}>
      <CanvasImage
        src={staticFile("ads/iashark-ad-stadium-v1.png")}
        width={1080}
        height={1920}
        style={{objectFit: "cover", opacity: 0.16, scale: 1.045}}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 7% 50%,rgba(0,188,255,.26),transparent 13%),radial-gradient(circle at 93% 50%,rgba(0,188,255,.22),transparent 13%),linear-gradient(180deg,rgba(0,4,8,.62),rgba(0,8,13,.88) 53%,#00080d 100%)",
        }}
      />
      <AbsoluteFill
        style={{
          background: phaseColor,
          mixBlendMode: "screen",
          opacity: interpolate(messageAge, [0, 2, 9, 19], [0, phaseIndex === 5 ? 0.28 : 0.16, 0.05, 0], {
            ...clamp,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />

      <Interactive.Div
        name="IASHARK brand"
        style={{
          position: "absolute",
          top: 74,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: interpolate(frame, [0, 16], [0, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)}),
        }}
      >
        <CanvasImage src={staticFile("ads/iashark-logo.png")} width={316} height={86} style={{objectFit: "contain"}} />
        <div style={{fontSize: 17, letterSpacing: 7, color: "#9db8c7", marginTop: -6}}>
          DÉCRYPTAGE 15 MIN PAR 15 MIN
        </div>
      </Interactive.Div>

      <div
        style={{
          position: "absolute",
          top: 226,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 17,
          fontWeight: 900,
          letterSpacing: 5,
          color: "#63dfff",
        }}
      >
        CARABAO CUP • 17 SEPT. • 20:30
      </div>

      <div
        style={{
          position: "absolute",
          top: 295,
          left: 82,
          right: 82,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Team name="Manchester City" logo="logos/team-50.png" />
        <Interactive.Div name="Animated match clock" style={{width: 198, height: 198, position: "relative", display: "grid", placeItems: "center"}}>
          <svg width="198" height="198" viewBox="0 0 198 198" style={{position: "absolute", rotate: "-90deg"}}>
            <circle cx="99" cy="99" r="80" fill="rgba(0,9,15,.94)" stroke="#153442" strokeWidth="12" />
            <circle
              cx="99"
              cy="99"
              r="80"
              fill="none"
              stroke={phaseColor}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circleLength}
              strokeDashoffset={circleLength * (1 - minute / 90)}
              style={{filter: `drop-shadow(0 0 10px ${phaseColor})`}}
            />
          </svg>
          <div style={{textAlign: "center", zIndex: 2}}>
            <div style={{fontFamily: "Arial Black, Arial", fontSize: 50, lineHeight: 1}}>{minute}’</div>
            <div style={{fontSize: 17, color: "#8da8b8", marginTop: 8}}>/ 90’</div>
          </div>
        </Interactive.Div>
        <Team name="Norwich" logo="logos/team-71.png" />
      </div>

      <Interactive.Div
        name="Current 15 minute reading"
        style={{
          position: "absolute",
          top: 676,
          left: 84,
          right: 84,
          height: 342,
          borderRadius: 30,
          border: `3px solid ${isHalfTime ? CITY : phaseColor}`,
          background: `radial-gradient(circle at 50% 42%,${isHalfTime ? "rgba(8,217,255,.18)" : phase.accent === "norwich" ? "rgba(216,242,54,.12)" : "rgba(8,217,255,.17)"},transparent 49%),linear-gradient(180deg,rgba(7,34,48,.96),rgba(1,12,20,.99))`,
          boxShadow: `0 0 ${26 * pulse}px ${isHalfTime ? "rgba(8,217,255,.35)" : phase.accent === "norwich" ? "rgba(216,242,54,.25)" : "rgba(8,217,255,.35)"},inset 0 0 38px rgba(0,164,214,.10),0 24px 44px rgba(0,0,0,.72)`,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          opacity: interpolate(messageAge, [0, 8], [0.48, 1], {...clamp, easing: Easing.bezier(0.16, 1, 0.3, 1)}),
          translate: interpolate(messageAge, [0, 12], ["0px 25px", "0px 0px"], {
            ...clamp,
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div style={{fontSize: 19, fontWeight: 900, letterSpacing: 7, color: "#8fb7c7"}}>
          {isHalfTime ? "45 MINUTES" : `${phase.label} MINUTES • ${phase.share}% DES BUTS ATTENDUS`}
        </div>
        <div
          style={{
            fontFamily: "Impact, Arial Black, Arial",
            fontStyle: "italic",
            fontSize: isHalfTime ? 96 : phase.title.length > 23 ? 67 : 82,
            lineHeight: 1.03,
            letterSpacing: 1.5,
            marginTop: 23,
            textShadow: `0 0 22px ${isHalfTime ? CITY : phaseColor}88`,
          }}
        >
          {isHalfTime ? "MI-TEMPS" : phase.title}
        </div>
        <div
          style={{
            maxWidth: 770,
            fontFamily: "Arial Black, Arial",
            fontSize: isHalfTime ? 26 : 28,
            lineHeight: 1.2,
            color: isHalfTime ? CITY : phaseColor,
            marginTop: 25,
          }}
        >
          {isHalfTime ? "LA LECTURE REPREND À 45’" : phase.note}
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Six period progress"
        style={{
          position: "absolute",
          top: 1062,
          left: 76,
          right: 76,
          display: "grid",
          gridTemplateColumns: "repeat(6,1fr)",
          gap: 9,
        }}
      >
        {phases.map((item, index) => {
          const active = index === phaseIndex && !isHalfTime;
          const itemColor = item.accent === "norwich" ? NORWICH : CITY;
          return (
            <div key={item.label} style={{display: "flex", flexDirection: "column", alignItems: "center", gap: 9}}>
              <div
                style={{
                  width: "100%",
                  height: 102,
                  borderRadius: 14,
                  border: active ? `2px solid ${itemColor}` : "1px solid rgba(93,164,190,.32)",
                  background: active
                    ? `linear-gradient(180deg,${itemColor}e8,${item.accent === "norwich" ? "#758300" : "#006b91"})`
                    : "linear-gradient(180deg,rgba(12,46,61,.88),rgba(4,22,31,.94))",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  color: active && item.accent === "norwich" ? "#071014" : "white",
                  boxShadow: active ? `0 0 23px ${itemColor}75` : "none",
                  opacity: index <= phaseIndex ? 1 : 0.42,
                }}
              >
                <div style={{fontFamily: "Arial Black, Arial", fontSize: 29}}>{item.share}%</div>
                <div style={{fontSize: 14, fontWeight: 900, marginTop: 5}}>{item.label}</div>
              </div>
            </div>
          );
        })}
      </Interactive.Div>

      <Interactive.Div
        name="Dynamic team pressure"
        style={{
          position: "absolute",
          top: 1252,
          left: 94,
          right: 94,
          height: 254,
          borderRadius: 25,
          border: "1px solid rgba(8,217,255,.42)",
          background: "linear-gradient(180deg,rgba(7,31,44,.94),rgba(2,13,21,.98))",
          boxShadow: "inset 0 0 35px rgba(0,174,224,.10),0 18px 34px rgba(0,0,0,.6)",
          padding: "30px 42px",
        }}
      >
        <div style={{textAlign: "center", fontSize: 17, fontWeight: 900, letterSpacing: 6, color: "#8daebe"}}>
          RAPPORT DE PRESSION • {phase.label}
        </div>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 28}}>
          <div>
            <span style={{fontFamily: "Arial Black,Arial", fontSize: 28}}>CITY</span>
            <span style={{fontFamily: "Arial Black,Arial", fontSize: 42, color: CITY, marginLeft: 16}}>{phase.cityPressure}%</span>
          </div>
          <div>
            <span style={{fontFamily: "Arial Black,Arial", fontSize: 42, color: NORWICH, marginRight: 16}}>{phase.norwichPressure}%</span>
            <span style={{fontFamily: "Arial Black,Arial", fontSize: 28}}>NORWICH</span>
          </div>
        </div>
        <div
          style={{
            height: 24,
            display: "flex",
            overflow: "hidden",
            borderRadius: 20,
            marginTop: 24,
            background: "#102b39",
            boxShadow: "0 0 15px rgba(8,217,255,.23)",
          }}
        >
          <div
            style={{
              width: `${phase.cityPressure}%`,
              height: "100%",
              background: `linear-gradient(90deg,#006b90,${CITY})`,
              boxShadow: `0 0 14px ${CITY}`,
            }}
          />
          <div
            style={{
              flex: 1,
              height: "100%",
              background: `linear-gradient(90deg,${NORWICH},#718000)`,
              boxShadow: `0 0 12px ${NORWICH}99`,
            }}
          />
        </div>
        <div style={{textAlign: "center", fontSize: 16, letterSpacing: 3, color: "#7e9aa9", marginTop: 24}}>
          INTENSITÉ RELATIVE DE LA TRANCHE
        </div>
      </Interactive.Div>

      <div
        style={{
          position: "absolute",
          left: -100,
          right: -100,
          bottom: 180,
          height: 3,
          background: CITY,
          boxShadow: `0 0 18px 4px ${CITY},0 0 70px 18px rgba(0,126,176,.48)`,
        }}
      />
      <Interactive.Div
        name="Simulation note"
        style={{
          position: "absolute",
          bottom: 112,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 17,
          fontWeight: 700,
          letterSpacing: 5,
          color: "#8da9b8",
        }}
      >
        20 000 SCÉNARIOS SIMULÉS • PAS UN SCORE ANNONCÉ
      </Interactive.Div>

      {isFinal ? (
        <AbsoluteFill
          name="Final validated image"
          style={{
            background: "#000",
            opacity: interpolate(frame, [matchEnd, matchEnd + 10], [0, 1], {
              ...clamp,
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <CanvasImage
            src={staticFile("ads/man-city-norwich-final-v1.png")}
            width={1080}
            height={1920}
            style={{
              objectFit: "cover",
              scale: interpolate(frame, [matchEnd, durationInFrames - 1], [1, 1.025], clamp),
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              width: 180,
              left: interpolate(frame, [matchEnd, durationInFrames - 1], [-260, 1160], clamp),
              background: "linear-gradient(90deg,transparent,rgba(8,217,255,.13),transparent)",
              rotate: "-9deg",
              mixBlendMode: "screen",
            }}
          />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
