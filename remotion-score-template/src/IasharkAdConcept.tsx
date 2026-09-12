import type {CSSProperties, ReactNode} from "react";
import {AbsoluteFill, Img, staticFile} from "remotion";

const cyan = "#22d3ee";
const ink = "#eaf7ff";
const muted = "#9cb4c5";

const displayFont = 'Impact, "Arial Black", sans-serif';
const bodyFont = 'Arial, Helvetica, sans-serif';
const monoFont = '"Courier New", monospace';

const GlassPanel = ({children, style}: {children: ReactNode; style?: CSSProperties}) => (
  <div
    style={{
      border: "1px solid rgba(34,211,238,.55)",
      background:
        "linear-gradient(135deg,rgba(8,22,33,.93),rgba(3,12,20,.86))",
      boxShadow:
        "0 24px 65px rgba(0,0,0,.58), inset 0 0 30px rgba(34,211,238,.08), 0 0 22px rgba(34,211,238,.1)",
      backdropFilter: "blur(14px)",
      ...style,
    }}
  >
    {children}
  </div>
);

const DataChip = ({value, label}: {value: string; label: string}) => (
  <div style={{display: "flex", alignItems: "center", gap: 14}}>
    <div
      style={{
        width: 11,
        height: 11,
        borderRadius: "50%",
        background: cyan,
        boxShadow: `0 0 16px ${cyan}`,
      }}
    />
    <div>
      <div
        style={{
          color: ink,
          fontFamily: monoFont,
          fontWeight: 900,
          fontSize: 27,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          color: muted,
          fontFamily: monoFont,
          fontSize: 15,
          letterSpacing: 2.5,
          marginTop: 8,
        }}
      >
        {label}
      </div>
    </div>
  </div>
);

export const IasharkAdConcept: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        background: "#02070c",
        color: ink,
        fontFamily: bodyFont,
        overflow: "hidden",
      }}
    >
      <Img
        src={staticFile("ads/iashark-ad-stadium-v1.png")}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />

      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg,rgba(2,7,12,.3) 0%,rgba(2,7,12,.04) 44%,rgba(2,7,12,.6) 68%,#02070c 100%)",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 49%,transparent 0%,transparent 28%,rgba(0,4,8,.24) 58%,rgba(0,2,5,.78) 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          height: 7,
          background: `linear-gradient(90deg,transparent,${cyan},transparent)`,
          boxShadow: `0 0 28px ${cyan}`,
        }}
      />

      <Img
        src={staticFile("ads/iashark-logo-master.png")}
        style={{
          position: "absolute",
          top: -90,
          left: 270,
          width: 540,
          height: 540,
          objectFit: "contain",
          mixBlendMode: "screen",
          filter: "drop-shadow(0 7px 18px rgba(0,0,0,.8))",
        }}
      />

      <div
        style={{
          position: "absolute",
          top: 248,
          left: 80,
          right: 80,
          textAlign: "center",
          fontFamily: monoFont,
          color: "#a8c2d2",
          fontSize: 20,
          fontWeight: 700,
          letterSpacing: 7,
        }}
      >
        L&apos;IA FOOT QUI MONTRE SES CALCULS
      </div>

      <div
        style={{
          position: "absolute",
          top: 316,
          left: 80,
          right: 80,
          textAlign: "center",
          fontFamily: displayFont,
          fontStyle: "italic",
          fontSize: 105,
          lineHeight: 0.91,
          letterSpacing: 1,
          textTransform: "uppercase",
          textShadow: "0 7px 20px rgba(0,0,0,.95)",
        }}
      >
        <div>UNE INTUITION</div>
        <div>N&apos;EST PAS UNE</div>
        <div
          style={{
            color: cyan,
            textShadow: `0 0 32px rgba(34,211,238,.48), 0 7px 20px rgba(0,0,0,.95)`,
          }}
        >
          ANALYSE.
        </div>
      </div>

      <GlassPanel
        style={{
          position: "absolute",
          top: 1125,
          left: 94,
          right: 94,
          height: 270,
          borderRadius: 28,
          padding: "34px 44px",
        }}
      >
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
          <div>
            <div
              style={{
                fontFamily: displayFont,
                fontStyle: "italic",
                fontSize: 72,
                lineHeight: 0.95,
                letterSpacing: 1,
              }}
            >
              10 000 <span style={{color: cyan}}>SIMULATIONS</span>
            </div>
            <div
              style={{
                color: muted,
                fontSize: 25,
                lineHeight: 1.35,
                marginTop: 16,
                maxWidth: 620,
              }}
            >
              Pour comprendre les scénarios du match avant de décider.
            </div>
          </div>
          <div
            style={{
              width: 108,
              height: 108,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              border: `3px solid ${cyan}`,
              boxShadow: `0 0 30px rgba(34,211,238,.34), inset 0 0 24px rgba(34,211,238,.12)`,
              fontFamily: displayFont,
              color: cyan,
              fontSize: 46,
            }}
          >
            10K
          </div>
        </div>

        <div
          style={{
            height: 1,
            margin: "28px 0 23px",
            background: "linear-gradient(90deg,rgba(34,211,238,.05),rgba(34,211,238,.72),rgba(34,211,238,.05))",
          }}
        />
        <div style={{display: "flex", justifyContent: "space-between"}}>
          <DataChip value="01" label="PROBABILITÉS" />
          <DataChip value="02" label="SCÉNARIOS" />
          <DataChip value="03" label="RISQUES" />
        </div>
      </GlassPanel>

      <div
        style={{
          position: "absolute",
          top: 1470,
          left: 100,
          right: 100,
          textAlign: "center",
        }}
      >
        <div
          style={{
            color: "#cce2ee",
            fontSize: 29,
            lineHeight: 1.35,
            fontWeight: 700,
            marginBottom: 27,
          }}
        >
          Analyse ton premier match. Vois les probabilités. Décide par toi-même.
        </div>
        <div
          style={{
            height: 112,
            borderRadius: 18,
            background: `linear-gradient(180deg,#39e6fa,${cyan} 56%,#06a8c5)`,
            color: "#021017",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 18,
            fontFamily: displayFont,
            fontStyle: "italic",
            fontSize: 51,
            letterSpacing: 1.3,
            boxShadow: `0 0 44px rgba(34,211,238,.42), inset 0 2px 0 rgba(255,255,255,.7), 0 17px 34px rgba(0,0,0,.55)`,
          }}
        >
          ANALYSE TON PREMIER MATCH <span style={{fontSize: 54}}>→</span>
        </div>
        <div
          style={{
            marginTop: 22,
            color: ink,
            fontFamily: monoFont,
            fontSize: 31,
            fontWeight: 900,
            letterSpacing: 4.2,
          }}
        >
          GRATUITEMENT
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          bottom: 105,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          borderTop: "1px solid rgba(34,211,238,.38)",
          paddingTop: 20,
        }}
      >
        <div
          style={{
            color: cyan,
            fontFamily: monoFont,
            fontSize: 26,
            fontWeight: 900,
            letterSpacing: 2.5,
          }}
        >
          www.iashark.com
        </div>
        <div style={{color: "#6f8796", fontSize: 16, textAlign: "right", lineHeight: 1.4}}>
          Analyse statistique.
          <br />
          Aucun résultat garanti.
        </div>
      </div>
    </AbsoluteFill>
  );
};
