import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  Interactive,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const ACCENT = "#12d9ff";
const SOFT = "#9ab8c8";
const clamp = {extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const};

type Candidate = {
  name: string;
  club: string;
  photo: string;
  logo: string;
  starts: number;
  appearances: number;
  minutes: number;
  currentShots: number;
  historyGoals: number;
  historyMinutes: number;
  scan: [number, number, number];
};

const CANDIDATES: Candidate[] = [
  {
    name: "OMAR MARMOUSH",
    club: "TOTTENHAM",
    photo: "players/omar-marmoush-cutout.png",
    logo: "logos/team-47.png",
    starts: 3,
    appearances: 3,
    minutes: 251,
    currentShots: 5,
    historyGoals: 3,
    historyMinutes: 734,
    scan: [78, 76, 61],
  },
  {
    name: "N. JACKSON",
    club: "ASTON VILLA",
    photo: "players/nicolas-jackson-cutout.png",
    logo: "logos/team-66.png",
    starts: 3,
    appearances: 3,
    minutes: 201,
    currentShots: 1,
    historyGoals: 8,
    historyMinutes: 1037,
    scan: [72, 94, 89],
  },
  {
    name: "E. BUENDÍA",
    club: "ASTON VILLA",
    photo: "players/emiliano-buendia-cutout.png",
    logo: "logos/team-66.png",
    starts: 4,
    appearances: 4,
    minutes: 314,
    currentShots: 6,
    historyGoals: 6,
    historyMinutes: 1796,
    scan: [94, 63, 66],
  },
];

const candidateX = [66, 336, 606];
const scanStarts = [58, 102, 146];

const MetricBars = ({values, frame, start}: {values: number[]; frame: number; start: number}) => (
  <div style={{display: "grid", gap: 13, marginTop: 21}}>
    {values.map((value, index) => (
      <div key={index} style={{display: "grid", gridTemplateColumns: "58px 1fr", gap: 10, alignItems: "center"}}>
        <div style={{fontSize: 14, fontWeight: 900, letterSpacing: 1.5, color: SOFT}}>
          {index === 0 ? "JEU" : index === 1 ? "RÔLE" : "HIST."}
        </div>
        <div style={{height: 9, overflow: "hidden", borderRadius: 20, background: "#123240"}}>
          <div
            style={{
              width: `${interpolate(frame, [start + index * 4, start + 15 + index * 4], [0, value], clamp)}%`,
              height: "100%",
              borderRadius: 20,
              background: ACCENT,
              boxShadow: `0 0 12px ${ACCENT}`,
            }}
          />
        </div>
      </div>
    ))}
  </div>
);

const CandidateCard = ({candidate, index, frame}: {candidate: Candidate; index: number; frame: number}) => {
  const entrance = spring({frame: frame - 18 - index * 7, fps: 30, config: {damping: 18, stiffness: 115}});
  const scanStart = scanStarts[index];
  const isScanning = frame >= scanStart && frame < scanStart + 42;
  const selected = index === 1 && frame >= 185;
  const dimmed = frame >= 185 && index !== 1;

  return (
    <Interactive.Div
      name={`${candidate.name} candidate`}
      style={{
        position: "absolute",
        left: candidateX[index],
        top: 650,
        width: 248,
        height: 545,
        borderRadius: 28,
        overflow: "hidden",
        border: `2px solid ${isScanning || selected ? ACCENT : "rgba(49,150,181,.55)"}`,
        background: "linear-gradient(180deg,rgba(8,37,54,.97),rgba(2,13,22,.98))",
        boxShadow: isScanning || selected
          ? `0 0 34px rgba(18,217,255,.56),inset 0 0 38px rgba(18,217,255,.15)`
          : "0 20px 38px rgba(0,0,0,.62),inset 0 0 28px rgba(0,139,184,.08)",
        opacity: entrance * interpolate(frame, [205, 238], [dimmed ? 0.18 : 1, 0], clamp),
        translate: `0px ${interpolate(entrance, [0, 1], [85, 0], clamp)}px`,
        scale: selected ? interpolate(frame, [185, 200], [1, 1.045], clamp) : 1,
      }}
    >
      <div style={{height: 278, position: "relative", overflow: "hidden", background: "radial-gradient(circle at 50% 48%,rgba(11,157,204,.34),transparent 66%)"}}>
        <CanvasImage
          src={staticFile(candidate.photo)}
          width={245}
          height={245}
          style={{
            objectFit: "contain",
            position: "absolute",
            left: 2,
            bottom: 0,
            filter: "drop-shadow(0 18px 18px rgba(0,0,0,.66))",
          }}
        />
        <CanvasImage
          src={staticFile(candidate.logo)}
          width={58}
          height={58}
          style={{position: "absolute", right: 13, top: 14, objectFit: "contain", filter: "drop-shadow(0 5px 9px #000)"}}
        />
        {isScanning ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: interpolate(frame, [scanStart, scanStart + 42], [0, 278], clamp),
              height: 3,
              background: "white",
              boxShadow: `0 0 12px 5px ${ACCENT},0 -45px 80px 18px rgba(18,217,255,.28)`,
            }}
          />
        ) : null}
      </div>
      <div style={{padding: "19px 17px 18px"}}>
        <div style={{fontFamily: "Impact, Arial Black, sans-serif", fontStyle: "italic", fontSize: 29, lineHeight: 1, whiteSpace: "nowrap"}}>
          {candidate.name}
        </div>
        <div style={{fontSize: 15, fontWeight: 900, color: ACCENT, letterSpacing: 2, marginTop: 8}}>{candidate.club}</div>
        <div style={{fontSize: 16, color: "#d7e7ed", marginTop: 17, lineHeight: 1.35}}>
          {candidate.starts}/{candidate.appearances} TIT. · {candidate.minutes} MIN
        </div>
        <div style={{fontSize: 15, color: SOFT, marginTop: 5}}>{candidate.currentShots} TIRS CETTE SAISON</div>
        <MetricBars values={candidate.scan} frame={frame} start={scanStart + 8} />
      </div>
    </Interactive.Div>
  );
};

const Header = ({frame}: {frame: number}) => {
  const visible = interpolate(frame, [0, 18], [0, 1], clamp);
  return (
    <>
      <Interactive.Div
        name="IASHARK brand"
        style={{
          position: "absolute",
          top: 190,
          left: 70,
          right: 185,
          textAlign: "center",
          opacity: visible,
          translate: interpolate(frame, [0, 24], ["0px -28px", "0px 0px"], {...clamp, easing: Easing.out(Easing.cubic)}),
        }}
      >
        <div style={{fontFamily: "Impact, Arial Black, sans-serif", fontSize: 68, letterSpacing: -2}}>
          <span style={{color: "white"}}>IA</span><span style={{color: ACCENT}}>SHARK</span>
        </div>
        <div style={{fontSize: 14, letterSpacing: 10, color: SOFT, marginTop: 8}}>LECTURE JOUEURS</div>
      </Interactive.Div>
      <Interactive.Div
        name="Match identity"
        style={{
          position: "absolute",
          top: 335,
          left: 94,
          right: 205,
          height: 118,
          display: "grid",
          gridTemplateColumns: "1fr 54px 1fr",
          alignItems: "center",
          opacity: interpolate(frame, [9, 28], [0, 1], clamp),
        }}
      >
        <div style={{display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 20}}>
          <div style={{fontFamily: "Arial Black, Arial", fontSize: 25}}>TOTTENHAM</div>
          <CanvasImage src={staticFile("logos/team-47.png")} width={76} height={92} style={{objectFit: "contain"}} />
        </div>
        <div style={{textAlign: "center", color: ACCENT, fontSize: 27, fontWeight: 1000}}>VS</div>
        <div style={{display: "flex", alignItems: "center", gap: 20}}>
          <CanvasImage src={staticFile("logos/team-66.png")} width={90} height={90} style={{objectFit: "contain"}} />
          <div style={{fontFamily: "Arial Black, Arial", fontSize: 25, whiteSpace: "nowrap"}}>ASTON VILLA</div>
        </div>
      </Interactive.Div>
    </>
  );
};

const FinalSelection = ({frame}: {frame: number}) => {
  const age = frame - 224;
  const reveal = spring({frame: age, fps: 30, config: {damping: 18, stiffness: 105}});
  const statReveal = interpolate(age, [24, 48], [0, 1], clamp);
  const glow = interpolate(frame % 44, [0, 22, 43], [0.68, 1, 0.68], clamp);

  return (
    <Interactive.Div
      name="Selected scorer profile"
      style={{position: "absolute", inset: 0, opacity: interpolate(age, [0, 16], [0, 1], clamp)}}
    >
      <div style={{position: "absolute", top: 525, left: 66, width: 800, height: 770, borderRadius: 35, border: `2px solid rgba(18,217,255,${0.55 * glow})`, background: "linear-gradient(140deg,rgba(6,37,53,.96),rgba(1,10,18,.98) 55%,rgba(5,29,43,.96))", boxShadow: `0 0 ${36 * glow}px rgba(18,217,255,.34),inset 0 0 70px rgba(11,164,211,.12)`, overflow: "hidden"}}>
        <div style={{position: "absolute", left: -70, top: 82, width: 530, height: 530, borderRadius: "50%", border: "2px solid rgba(18,217,255,.22)", boxShadow: "0 0 70px rgba(18,217,255,.19)"}} />
        <CanvasImage src={staticFile("logos/team-66.png")} width={330} height={330} style={{position: "absolute", left: 32, top: 125, objectFit: "contain", opacity: 0.12, filter: "blur(1px)"}} />
        <CanvasImage
          src={staticFile("players/nicolas-jackson-cutout.png")}
          width={480}
          height={480}
          style={{
            position: "absolute",
            left: -8,
            top: 120,
            objectFit: "contain",
            translate: interpolate(reveal, [0, 1], ["-85px 30px", "0px 0px"], clamp),
            scale: interpolate(reveal, [0, 1], [0.86, 1], clamp),
            filter: "drop-shadow(0 26px 24px rgba(0,0,0,.65))",
          }}
        />
        <div style={{position: "absolute", left: 385, right: 30, top: 80}}>
          <div style={{fontSize: 17, fontWeight: 1000, letterSpacing: 4, color: ACCENT}}>PROFIL BUTEUR RETENU</div>
          <div style={{fontFamily: "Impact, Arial Black, sans-serif", fontStyle: "italic", fontSize: 68, lineHeight: 0.98, marginTop: 17}}>N. JACKSON</div>
          <div style={{fontSize: 19, fontWeight: 900, color: SOFT, letterSpacing: 2, marginTop: 16}}>ASTON VILLA · ATTAQUANT</div>
          <div style={{height: 2, background: `linear-gradient(90deg,${ACCENT},transparent)`, marginTop: 27}} />
          <div style={{display: "grid", gap: 17, marginTop: 28, opacity: statReveal, translate: interpolate(statReveal, [0, 1], ["28px 0px", "0px 0px"], clamp)}}>
            <div style={{fontSize: 26, fontWeight: 1000}}><span style={{color: ACCENT, fontSize: 38}}>3/3</span> TITULARISATIONS</div>
            <div style={{fontSize: 26, fontWeight: 1000}}><span style={{color: ACCENT, fontSize: 38}}>8</span> BUTS EN 2025/26</div>
            <div style={{fontSize: 26, fontWeight: 1000}}><span style={{color: ACCENT, fontSize: 38}}>1,82</span> TIR CADRÉ / 90</div>
          </div>
        </div>
        <div style={{position: "absolute", left: 38, right: 38, bottom: 36, display: "grid", gridTemplateColumns: "220px 1fr", gap: 22, alignItems: "center"}}>
          <div style={{height: 58, borderRadius: 16, display: "grid", placeItems: "center", border: `2px solid ${ACCENT}`, color: ACCENT, fontSize: 20, fontWeight: 1000, letterSpacing: 2, background: "rgba(4,31,44,.85)", boxShadow: `0 0 22px rgba(18,217,255,.22)`}}>SI TITULAIRE</div>
          <div style={{fontSize: 19, lineHeight: 1.35, fontWeight: 800, color: "#d3e3e9"}}>PROFIL À SURVEILLER<br/><span style={{color: SOFT, fontWeight: 500}}>Donnée statistique, pas une promesse de but</span></div>
        </div>
      </div>
    </Interactive.Div>
  );
};

export const PLAYER_SCORER_TOTTENHAM_VILLA_DURATION = 390;

export const PlayerScorerTottenhamVilla = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const scanX = interpolate(frame, [50, 188], [70, 858], clamp);
  const stageOpacity = interpolate(frame, [204, 235], [1, 0], clamp);
  const endingFade = interpolate(frame, [durationInFrames - 14, durationInFrames - 1], [1, 0], clamp);

  return (
    <AbsoluteFill style={{background: "#01060a", color: "white", fontFamily: "Arial, Helvetica, sans-serif", overflow: "hidden", opacity: endingFade}}>
      <CanvasImage src={staticFile("ads/iashark-ad-stadium-v1.png")} width={1080} height={1920} style={{objectFit: "cover", opacity: 0.34, scale: 1.05}} />
      <AbsoluteFill style={{background: "linear-gradient(180deg,rgba(0,5,9,.50),rgba(0,8,14,.73) 44%,rgba(0,3,7,.93))"}} />
      <AbsoluteFill style={{background: "radial-gradient(circle at 16% 45%,rgba(0,170,225,.20),transparent 22%),radial-gradient(circle at 79% 48%,rgba(0,113,162,.24),transparent 28%)"}} />
      {Array.from({length: 18}, (_, index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: 55 + ((index * 193) % 820),
            top: 460 + ((index * 127 + frame * (0.22 + (index % 4) * 0.08)) % 880),
            width: 2 + (index % 3),
            height: 2 + (index % 3),
            borderRadius: "50%",
            background: ACCENT,
            opacity: 0.18 + (index % 5) * 0.05,
            boxShadow: `0 0 9px ${ACCENT}`,
          }}
        />
      ))}

      <Header frame={frame} />

      <Interactive.Div name="Scanning stage" style={{position: "absolute", inset: 0, opacity: stageOpacity}}>
        <div style={{position: "absolute", top: 515, left: 78, right: 205, textAlign: "center"}}>
          <div style={{fontFamily: "Impact, Arial Black, sans-serif", fontStyle: "italic", fontSize: 58, lineHeight: 1}}>QUEL BUTEUR RESSORT ?</div>
          <div style={{fontSize: 18, letterSpacing: 4, color: SOFT, marginTop: 14}}>TEMPS DE JEU · RÔLE · HISTORIQUE</div>
        </div>
        {CANDIDATES.map((candidate, index) => <CandidateCard key={candidate.name} candidate={candidate} index={index} frame={frame} />)}
        <div
          style={{
            position: "absolute",
            left: scanX,
            top: 625,
            width: 3,
            height: 610,
            background: "white",
            opacity: interpolate(frame, [46, 55, 184, 193], [0, 1, 1, 0], clamp),
            boxShadow: `0 0 14px 5px ${ACCENT},0 0 90px 22px rgba(18,217,255,.28)`,
          }}
        />
        <div style={{position: "absolute", top: 1245, left: 66, width: 788, height: 62, borderTop: "1px solid rgba(18,217,255,.45)", display: "flex", alignItems: "center", justifyContent: "center", color: ACCENT, fontSize: 17, fontWeight: 900, letterSpacing: 4, opacity: interpolate(frame, [170, 190], [0, 1], clamp)}}>LE MODÈLE ÉCARTE LES PETITS ÉCHANTILLONS</div>
      </Interactive.Div>

      {frame >= 215 ? <FinalSelection frame={frame} /> : null}

      <Interactive.Div
        name="Data source"
        style={{position: "absolute", top: 1450, left: 90, right: 220, textAlign: "center", fontSize: 15, letterSpacing: 3.5, color: SOFT, opacity: interpolate(frame, [245, 272], [0, 0.78], clamp)}}
      >
        IASHARK – FOOTBALL · SAISON 2026/27
      </Interactive.Div>
      <div style={{position: "absolute", top: 1510, left: 76, right: 194, height: 2, background: `linear-gradient(90deg,transparent,${ACCENT},transparent)`, boxShadow: `0 0 14px ${ACCENT}`}} />
      <Interactive.Div
        name="Website"
        style={{position: "absolute", top: 1544, left: 70, right: 190, textAlign: "center", fontFamily: "Arial Black, Arial", fontSize: 31, fontWeight: 1000, letterSpacing: 7, color: ACCENT, textShadow: `0 0 16px rgba(18,217,255,.55)`, opacity: interpolate(frame, [30, 48], [0, 1], clamp)}}
      >
        IASHARK.COM
      </Interactive.Div>
    </AbsoluteFill>
  );
};
