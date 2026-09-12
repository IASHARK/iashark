import {Fragment} from "react";
import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

const ARTWORK = staticFile("mockups/montante-1-concept-v2.png");

const pulseAt = (frame: number, center: number, radius: number) => {
  const distance = Math.abs(frame - center);
  if (distance >= radius) {
    return 0;
  }

  const strength = 1 - distance / radius;
  return strength * strength;
};

const bell = (frame: number, start: number, duration: number) => {
  return interpolate(
    frame,
    [start, start + duration * 0.22, start + duration * 0.78, start + duration],
    [0, 1, 1, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    },
  );
};

const ambientParticles = Array.from({length: 24}, (_, index) => ({
  x: 44 + ((index * 157) % 994),
  y: 150 + ((index * 233) % 1430),
  radius: 1 + (index % 3) * 0.65,
  speed: 0.16 + (index % 5) * 0.045,
  phase: (index * 71) % 420,
}));

const cards = [
  {top: 778, height: 193, sweepStart: 108, checkY: 900},
  {top: 984, height: 193, sweepStart: 176, checkY: 1110},
  {top: 1198, height: 193, sweepStart: 244, checkY: 1323},
];

export const MontanteOne: React.FC = () => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();

  const ambientCycle = (frame / durationInFrames) * Math.PI * 2;
  const cameraScale = 1.004 + Math.sin(ambientCycle - Math.PI / 2) * 0.004;
  const cameraY = Math.sin(ambientCycle) * 2;

  const titlePulse = Math.min(
    1,
    pulseAt(frame, 24, 12) +
      pulseAt(frame, 52, 10) * 0.76 +
      pulseAt(frame, 217, 10) * 0.42 +
      pulseAt(frame, 361, 11) * 0.58,
  );
  const titleFlash = Math.min(
    1,
    pulseAt(frame, 27, 4) + pulseAt(frame, 55, 3) * 0.7,
  );
  const titleScale = 1 + titlePulse * 0.018;
  const titleShakeX = Math.sin(frame * 2.7) * titlePulse * 1.6;
  const titleShakeY = Math.cos(frame * 3.1) * titlePulse * 0.7;

  const footerPulse = pulseAt(frame, 338, 25) + pulseAt(frame, 382, 19) * 0.5;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#01070c",
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          scale: cameraScale,
          translate: `0px ${cameraY}px`,
        }}
      >
        <Img
          src={ARTWORK}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill style={{pointerEvents: "none", mixBlendMode: "screen"}}>
        <div
          style={{
            position: "absolute",
            width: 410,
            height: 410,
            left: -160 + Math.sin(ambientCycle) * 80,
            top: 180 + Math.cos(ambientCycle * 1.15) * 65,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(0,202,255,.34) 0%, rgba(0,111,255,.13) 33%, transparent 69%)",
            filter: "blur(52px)",
            opacity: 0.72,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 500,
            height: 500,
            right: -215 + Math.cos(ambientCycle * 0.82) * 95,
            top: 650 + Math.sin(ambientCycle * 1.4) * 105,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(0,224,255,.22) 0%, rgba(0,91,255,.1) 36%, transparent 70%)",
            filter: "blur(68px)",
            opacity: 0.7,
          }}
        />
        <div
          style={{
            position: "absolute",
            width: 390,
            height: 390,
            left: 325 + Math.sin(ambientCycle * 1.28 + 1.4) * 170,
            top: 1370 + Math.cos(ambientCycle) * 70,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(0,183,255,.18) 0%, rgba(0,93,179,.08) 42%, transparent 72%)",
            filter: "blur(75px)",
            opacity: 0.62,
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill style={{pointerEvents: "none", overflow: "hidden"}}>
        {ambientParticles.map((particle, index) => {
          const travel =
            ((frame * particle.speed + particle.phase) % durationInFrames) /
            durationInFrames;
          const opacity = Math.sin(travel * Math.PI) * (0.2 + (index % 4) * 0.07);
          return (
            <div
              key={index}
              style={{
                position: "absolute",
                left: particle.x,
                top: particle.y - travel * 170,
                width: particle.radius * 2,
                height: particle.radius * 2,
                borderRadius: "50%",
                backgroundColor: index % 4 === 0 ? "#dff9ff" : "#16d9ff",
                boxShadow: "0 0 9px rgba(0,211,255,.78)",
                opacity,
              }}
            />
          );
        })}
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          left: 86,
          right: 86,
          top: 378,
          height: 230,
          borderRadius: 120,
          background:
            "radial-gradient(ellipse at center, rgba(239,252,255,.52) 0%, rgba(0,217,255,.32) 28%, rgba(0,97,255,.12) 52%, transparent 73%)",
          filter: "blur(30px)",
          mixBlendMode: "screen",
          opacity: 0.1 + titlePulse * 0.62 + titleFlash * 0.25,
          scale: 0.86 + titlePulse * 0.2,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0,
          top: 390,
          width: 1080,
          height: 205,
          overflow: "hidden",
          maskImage:
            "radial-gradient(ellipse 58% 84% at 50% 50%, black 30%, rgba(0,0,0,.75) 57%, transparent 82%)",
          opacity: titlePulse * 0.87,
          translate: `${titleShakeX}px ${titleShakeY}px`,
        }}
      >
        <Img
          src={ARTWORK}
          style={{
            position: "absolute",
            left: 0,
            top: -390,
            width: 1080,
            height: 1920,
            objectFit: "cover",
            transformOrigin: "50% 492px",
            scale: titleScale,
            filter:
              "brightness(1.25) contrast(1.08) saturate(1.18) drop-shadow(0 0 16px rgba(10,222,255,.8))",
          }}
        />
      </div>

      {cards.map((card) => {
        const sweepDuration = 38;
        const sweepOpacity = bell(frame, card.sweepStart, sweepDuration);
        const sweepX = interpolate(
          frame,
          [card.sweepStart, card.sweepStart + sweepDuration],
          [-250, 1220],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.quad),
          },
        );
        const checkPulse = pulseAt(frame, card.sweepStart + 33, 13);

        return (
          <Fragment key={card.top}>
            <div
              style={{
                position: "absolute",
                left: 40,
                right: 40,
                top: card.top,
                height: card.height,
                overflow: "hidden",
                borderRadius: 28,
                pointerEvents: "none",
                mixBlendMode: "screen",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: -70,
                  width: 175,
                  height: card.height + 140,
                  translate: `${sweepX}px 0px`,
                  rotate: "10deg",
                  background:
                    "linear-gradient(90deg, transparent, rgba(0,199,255,.16), rgba(233,253,255,.54), rgba(0,207,255,.14), transparent)",
                  filter: "blur(9px)",
                  opacity: sweepOpacity,
                }}
              />
            </div>
            <div
              style={{
                position: "absolute",
                left: 659,
                top: card.checkY - 47,
                width: 94,
                height: 94,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(142,255,193,.64), rgba(0,255,111,.29) 36%, transparent 72%)",
                filter: "blur(8px)",
                mixBlendMode: "screen",
                opacity: checkPulse * 0.95,
                scale: 0.72 + checkPulse * 0.48,
              }}
            />
            <div
              style={{
                position: "absolute",
                left: 27,
                right: 27,
                top: card.top - 5,
                height: card.height + 10,
                borderRadius: 31,
                border: "2px solid rgba(56,231,255,.86)",
                boxShadow:
                  "0 0 17px rgba(0,205,255,.66), inset 0 0 21px rgba(0,154,255,.16)",
                opacity: checkPulse * 0.36,
              }}
            />
          </Fragment>
        );
      })}

      <div
        style={{
          position: "absolute",
          left: 264,
          right: 264,
          top: 1604,
          height: 130,
          borderRadius: 70,
          background:
            "radial-gradient(ellipse at center, rgba(177,247,255,.46), rgba(0,207,255,.22) 36%, transparent 73%)",
          filter: "blur(28px)",
          mixBlendMode: "screen",
          opacity: footerPulse * 0.74,
          scale: 0.86 + footerPulse * 0.22,
        }}
      />

      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 54%, rgba(0,4,8,.09) 79%, rgba(0,2,4,.22) 100%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};
