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

const phases = [
  {from: 0, to: 15, label: "0–15", goals: 2, title: "LE DANGER ARRIVE VITE", note: "2 BUTS SUR 10 TOMBENT DÉJÀ ICI"},
  {from: 15, to: 30, label: "15–30", goals: 1, title: "LE MATCH SE REFERME", note: "1 SEUL BUT SUR 10 DANS CETTE PÉRIODE"},
  {from: 30, to: 45, label: "30–45", goals: 2, title: "LA PRESSION REVIENT", note: "2 BUTS SUR 10 AVANT LA PAUSE"},
  {from: 45, to: 60, label: "45–60", goals: 1, title: "REPRISE VERROUILLÉE", note: "1 SEUL BUT SUR 10 AU RETOUR"},
  {from: 60, to: 75, label: "60–75", goals: 1, title: "LE CALME AVANT LE PIÈGE", note: "1 SEUL BUT SUR 10 DANS CETTE PÉRIODE"},
  {from: 75, to: 91, label: "75–90", goals: 3, title: "TOUT PEUT BASCULER", note: "3 BUTS SUR 10 TOMBENT ICI"},
];

const Team = ({name, logo}: {name: string; logo: string}) => (
  <Interactive.Div
    name={`${name} team`}
    style={{
      width: 280,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 22,
    }}
  >
    <div
      style={{
        width: 195,
        height: 195,
        display: "grid",
        placeItems: "center",
        borderRadius: 44,
        background: "radial-gradient(circle, rgba(7,198,244,.13), rgba(0,0,0,0) 69%)",
      }}
    >
      <CanvasImage
        src={staticFile(logo)}
        width={178}
        height={178}
        style={{
          objectFit: "contain",
          filter: "drop-shadow(0 16px 20px rgba(0,0,0,.85)) drop-shadow(0 0 12px rgba(6,210,255,.22))",
        }}
      />
    </div>
    <div
      style={{
        width: 290,
        height: 68,
        display: "grid",
        placeItems: "center",
        borderRadius: 18,
        border: "1px solid rgba(6,210,255,.45)",
        background: "linear-gradient(180deg,rgba(7,35,50,.94),rgba(2,14,22,.96))",
        boxShadow: "inset 0 0 24px rgba(0,182,235,.10), 0 16px 26px rgba(0,0,0,.55)",
        color: "#f7fbff",
        fontFamily: "Arial Black, Arial, sans-serif",
        fontSize: name.length > 10 ? 27 : 31,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {name}
    </div>
  </Interactive.Div>
);

export const MatchPulseBesiktasMarseille = () => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const matchEnd = durationInFrames - 75;
  const halfPause = Math.round(2.5 * fps);
  const liveFrames = matchEnd - halfPause;
  const firstHalfFrames = Math.ceil(liveFrames / 2);
  const secondHalfStart = firstHalfFrames + halfPause;
  const minute =
    frame < firstHalfFrames
      ? Math.floor(
          interpolate(frame, [0, firstHalfFrames - 1], [1, 45.99], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        )
      : frame < secondHalfStart
        ? 45
        : Math.min(
            90,
            Math.floor(
              interpolate(frame, [secondHalfStart, matchEnd - 1], [46, 90.99], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            ),
          );
  const phaseIndex = Math.min(5, Math.floor(Math.max(0, minute - 1) / 15));
  const phase = phases[phaseIndex];
  const isHalfTime = frame >= firstHalfFrames && frame < secondHalfStart;
  const isHook = frame < 2 * fps;
  const isFinal = frame >= matchEnd;
  const phaseStarts = [0, 75, 150, 300, 375, 450];
  const messageStart = isHalfTime ? firstHalfFrames : isHook ? 0 : phaseIndex === 0 ? 2 * fps : phaseStarts[phaseIndex];
  const messageAge = Math.max(0, frame - messageStart);
  const circleLength = 2 * Math.PI * 82;

  return (
    <AbsoluteFill
      style={{
        background: "#01060a",
        color: "white",
        fontFamily: "Arial, Helvetica, sans-serif",
        overflow: "hidden",
      }}
    >
      <CanvasImage
        src={staticFile("ads/iashark-ad-stadium-v1.png")}
        width={1080}
        height={1920}
        style={{objectFit: "cover", opacity: 0.12, scale: 1.04}}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 8% 47%,rgba(0,188,255,.27),transparent 13%), radial-gradient(circle at 92% 47%,rgba(0,188,255,.27),transparent 13%), linear-gradient(180deg,rgba(0,5,9,.67),rgba(0,7,12,.86) 48%,#00080d 100%)",
        }}
      />
      <AbsoluteFill
        style={{
          background: "#08d9ff",
          mixBlendMode: "screen",
          opacity: interpolate(messageAge, [0, 2, 8, 18], [0, phaseIndex === 5 ? 0.32 : 0.18, 0.07, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />
      <div
        style={{
          position: "absolute",
          left: -100,
          right: -100,
          bottom: 174,
          height: 3,
          background: "#00cfff",
          boxShadow: "0 0 18px 4px #08bfe8, 0 0 70px 18px rgba(0,126,176,.48)",
        }}
      />

      <Interactive.Div
        name="IASHARK brand"
        style={{
          position: "absolute",
          top: 88,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <CanvasImage
          src={staticFile("ads/iashark-logo.png")}
          width={330}
          height={90}
          style={{objectFit: "contain"}}
        />
        <div style={{fontSize: 18, letterSpacing: 8, color: "#9db8c7", marginTop: -6}}>
          LE MATCH EN 90 MINUTES
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Match metadata"
        style={{
          position: "absolute",
          top: 262,
          left: 0,
          right: 0,
          textAlign: "center",
          fontSize: 18,
          fontWeight: 800,
          letterSpacing: 5,
          color: "#63dfff",
        }}
      >
        EUROPA LEAGUE • 17 SEPT. • 21:00
      </Interactive.Div>

      <div
        style={{
          position: "absolute",
          top: 340,
          left: 82,
          right: 82,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Team name="Beşiktaş" logo="logos/team-549.png" />

        <Interactive.Div
          name="90 minute clock"
          style={{width: 202, height: 202, position: "relative", display: "grid", placeItems: "center"}}
        >
          <svg width="202" height="202" viewBox="0 0 202 202" style={{position: "absolute", rotate: "-90deg"}}>
            <circle cx="101" cy="101" r="82" fill="rgba(0,9,15,.94)" stroke="#153442" strokeWidth="12" />
            <circle
              cx="101"
              cy="101"
              r="82"
              fill="none"
              stroke="#08d9ff"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={circleLength}
              strokeDashoffset={circleLength * (1 - minute / 90)}
              style={{filter: "drop-shadow(0 0 9px rgba(8,217,255,.72))"}}
            />
          </svg>
          <div style={{textAlign: "center", zIndex: 2}}>
            <div style={{fontFamily: "Arial Black, Arial", fontSize: 51, lineHeight: 1}}>{minute}’</div>
            <div style={{fontSize: 17, color: "#8da8b8", marginTop: 8}}>/ 90’</div>
          </div>
        </Interactive.Div>

        <Team name="Marseille" logo="logos/team-81.png" />
      </div>

      <Interactive.Div
        name="Phase headline"
        style={{
          position: "absolute",
          top: 742,
          left: 86,
          right: 86,
          height: 330,
          borderRadius: 32,
          border: isHalfTime || phaseIndex === 5 ? "3px solid #09d9ff" : "2px solid #087b9d",
          background:
            isHalfTime || phaseIndex === 5
              ? "radial-gradient(circle at 50% 44%,rgba(0,211,255,.18),transparent 48%), linear-gradient(180deg,rgba(7,35,49,.96),rgba(1,12,20,.98))"
              : "linear-gradient(180deg,rgba(7,31,44,.94),rgba(1,12,20,.98))",
          boxShadow:
            isHalfTime || phaseIndex === 5
              ? "0 0 34px rgba(0,207,255,.45), inset 0 0 40px rgba(0,170,220,.13), 0 22px 42px rgba(0,0,0,.72)"
              : "inset 0 0 34px rgba(0,150,190,.10), 0 22px 42px rgba(0,0,0,.72)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          scale: interpolate(frame % 45, [0, 22, 44], [1, 1.012, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          opacity: interpolate(messageAge, [0, 8], [0.45, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(messageAge, [0, 12], ["0px 28px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div style={{fontSize: 19, fontWeight: 900, letterSpacing: 7, color: "#7fb9ca"}}>
          {isHook ? "BEŞIKTAŞ – MARSEILLE" : isHalfTime ? "45 MINUTES" : `${phase.label} MINUTES`}
        </div>
        <div
          style={{
            fontFamily: "Impact, Arial Black, Arial",
            fontStyle: "italic",
            fontSize: isHook ? 72 : !isHalfTime && phase.title.length > 18 ? 74 : 98,
            letterSpacing: 2,
            marginTop: 20,
            textShadow: phaseIndex === 5 ? "0 0 25px rgba(8,217,255,.72)" : "0 0 18px rgba(8,217,255,.35)",
          }}
        >
          {isHook ? "CE MATCH CACHE UN PIÈGE" : isHalfTime ? "MI-TEMPS" : phase.title}
        </div>
        <div style={{fontFamily: "Arial Black, Arial", fontSize: isHalfTime ? 28 : 32, color: "#08d9ff", marginTop: 22}}>
          {isHook ? "IL ARRIVE APRÈS LA 75E" : isHalfTime ? "BEŞIKTAŞ DEVANT : 4 / 7 INDICATEURS" : phase.note}
        </div>
        {isHalfTime ? (
          <div style={{fontSize: 19, fontWeight: 900, letterSpacing: 3, color: "#b7d0dc", marginTop: 18}}>
            LA ZONE DE RISQUE ARRIVE APRÈS LA 60E
          </div>
        ) : null}
      </Interactive.Div>

      <Interactive.Div
        name="15 minute data timeline"
        style={{
          position: "absolute",
          top: 1118,
          left: 82,
          right: 82,
          display: "grid",
          gridTemplateColumns: "repeat(6, 1fr)",
          gap: 10,
        }}
      >
        {phases.map((item, index) => {
          const active = index === phaseIndex;
          return (
            <div key={item.label} style={{display: "flex", flexDirection: "column", alignItems: "center", gap: 10}}>
              <div
                style={{
                  height: 92,
                  width: "100%",
                  borderRadius: 14,
                  border: active ? "2px solid #08d9ff" : "1px solid rgba(98,168,193,.32)",
                  background: active
                    ? "linear-gradient(180deg,rgba(8,217,255,.88),rgba(0,116,157,.72))"
                    : "linear-gradient(180deg,rgba(12,46,61,.86),rgba(4,22,31,.92))",
                  display: "grid",
                  placeItems: "center",
                  boxShadow: active ? "0 0 22px rgba(8,217,255,.52)" : "none",
                  opacity: index <= phaseIndex ? 1 : 0.42,
                }}
              >
                <span style={{fontFamily: "Arial Black, Arial", fontSize: 26}}>
                  {item.goals} {item.goals > 1 ? "BUTS" : "BUT"}
                </span>
              </div>
              <div style={{fontSize: 15, fontWeight: 900, color: active ? "#dff9ff" : "#7893a2"}}>{item.label}</div>
            </div>
          );
        })}
      </Interactive.Div>

      <Interactive.Div
        name="Editorial verdict"
        style={{
          position: "absolute",
          top: 1336,
          left: 94,
          right: 94,
          height: 236,
          borderRadius: 25,
          border: "1px solid rgba(8,217,255,.42)",
          background: "linear-gradient(105deg,rgba(7,31,44,.92),rgba(2,13,21,.97) 56%,rgba(5,34,49,.92))",
          boxShadow: "inset 0 0 35px rgba(0,174,224,.10), 0 18px 34px rgba(0,0,0,.6)",
          display: "grid",
          gridTemplateColumns: "1fr 2px 1fr",
          alignItems: "center",
          padding: "0 38px",
        }}
      >
        <div style={{textAlign: "center", paddingRight: 28}}>
          <div style={{fontSize: 17, fontWeight: 900, letterSpacing: 5, color: "#88aebe"}}>AVANTAGE DATA</div>
          <div style={{fontFamily: "Arial Black, Arial", fontSize: 45, marginTop: 14}}>BEŞIKTAŞ</div>
          <div style={{fontSize: 21, fontWeight: 800, color: "#08d9ff", marginTop: 7}}>4 / 7 INDICATEURS</div>
        </div>
        <div style={{height: 142, background: "linear-gradient(180deg,transparent,#08d9ff,transparent)"}} />
        <div style={{textAlign: "center", paddingLeft: 28}}>
          <div style={{fontSize: 17, fontWeight: 900, letterSpacing: 5, color: "#88aebe"}}>POINT DE VIGILANCE</div>
          <div style={{fontFamily: "Arial Black, Arial", fontSize: 47, color: "#ffffff", marginTop: 13}}>3 SUR 7</div>
          <div style={{fontSize: 20, fontWeight: 800, color: "#08d9ff", lineHeight: 1.2, marginTop: 5}}>
            BUTS ENCAISSÉS
            <br />
            APRÈS LA 60E
          </div>
        </div>
      </Interactive.Div>

      <Interactive.Div
        name="Methodology note"
        style={{
          position: "absolute",
          top: 1626,
          left: 92,
          right: 92,
          textAlign: "center",
          fontSize: 17,
          lineHeight: 1.42,
          letterSpacing: 2.2,
          color: "#87a4b4",
        }}
      >
        10 BUTS OBSERVÉS CETTE SAISON
        <br />
        FRÉQUENCE HISTORIQUE • PAS UNE PRÉVISION CERTAINE
      </Interactive.Div>

      <Interactive.Div
        name="Website"
        style={{
          position: "absolute",
          bottom: 92,
          left: 0,
          right: 0,
          textAlign: "center",
          fontFamily: "Arial Black, Arial",
          fontSize: 27,
          letterSpacing: 5,
          color: "#08d9ff",
        }}
      >
        iashark.com
      </Interactive.Div>

      {isFinal ? (
        <AbsoluteFill
          style={{
            background: "radial-gradient(circle at 50% 43%,#073347 0%,#020c13 36%,#000 80%)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            opacity: interpolate(frame, [matchEnd, matchEnd + 14], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <CanvasImage src={staticFile("ads/iashark-logo.png")} width={430} height={115} style={{objectFit: "contain"}} />
          <div style={{fontSize: 21, letterSpacing: 8, color: "#91acbb", marginTop: 10}}>PRONOSTIC IASHARK</div>
          <div style={{fontFamily: "Impact, Arial Black", fontStyle: "italic", fontSize: 86, lineHeight: 1.05, marginTop: 66}}>
            BEŞIKTAŞ PART
            <br />
            AVEC L’AVANTAGE
          </div>
          <div style={{width: 610, height: 3, background: "linear-gradient(90deg,transparent,#08d9ff,transparent)", marginTop: 50}} />
          <div style={{fontFamily: "Arial Black, Arial", fontSize: 43, color: "#08d9ff", lineHeight: 1.2, marginTop: 45}}>
            TOUT PEUT BASCULER
            <br />APRÈS LA 75E
          </div>
          <div style={{fontSize: 22, color: "#8aa8b7", lineHeight: 1.45, marginTop: 62}}>
            Tendances observées sur les matchs passés
            <br />
            Pas un résultat annoncé
          </div>
          <div style={{fontSize: 18, fontWeight: 900, color: "#8aa8b7", letterSpacing: 5, marginTop: 76}}>ANALYSE COMPLÈTE SUR</div>
          <div
            style={{
              minWidth: 560,
              borderRadius: 20,
              border: "2px solid #08d9ff",
              background: "linear-gradient(180deg,rgba(7,43,59,.94),rgba(2,17,26,.98))",
              boxShadow: "0 0 28px rgba(8,217,255,.36), inset 0 0 24px rgba(8,217,255,.10)",
              fontFamily: "Arial Black, Arial",
              fontSize: 42,
              color: "#08d9ff",
              letterSpacing: 5,
              padding: "22px 38px",
              marginTop: 18,
            }}
          >
            IASHARK.COM
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
