import React from 'react';
import {AbsoluteFill, CanvasImage, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

// Pays-Bas - Allemagne : le chrono parcourt le match de 0 a 90 minutes, et
// tout le reste suit la minute en cours - la courbe se trace, chaque tranche
// de 15 minutes se remplit quand le chrono la traverse, les drapeaux pulsent
// au passage. Memes couleurs et memes blocs que la carte fixe
// (NetherlandsGermany90Preview), remis en colonne pour que drapeaux, pays et
// chrono soient alignes. 1080x1920, 30 fps, 20 s.
export const NETHERLANDS_GERMANY_90_VIDEO_DURATION = 600;

const C = '#08dcff';
const values = [22, 4, 4, 30, 22, 17]; // part des buts observes par tranche
const PIC = 3; // 45-60, la tranche la plus chargee

// Chrono : 0 -> 45, pause a la mi-temps, 45 -> 90.
const DEBUT = 55;
const MI_TEMPS = 250;
const REPRISE = 288;
const FIN = 470;

const points = values.map((v, i) => ({x: 25 + i * 174, y: 150 - (v / 30) * 118}));
const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
const area = `${line} L895,160 L25,160 Z`;

export const NetherlandsGermany90Video: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  const entree = (debut: number, deplacement = 24) => {
    const p = spring({frame: frame - debut, fps, config: {damping: 200, mass: 0.6}});
    return {opacity: p, transform: `translateY(${(1 - p) * deplacement}px)`};
  };
  const fondu = (debut: number, duree = 16) =>
    interpolate(frame, [debut, debut + duree], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

  // Minute courante, avec l'arret a la mi-temps.
  const minute = frame < MI_TEMPS
    ? interpolate(frame, [DEBUT, MI_TEMPS], [0, 45], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})
    : interpolate(frame, [REPRISE, FIN], [45, 90], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const pause = frame >= MI_TEMPS && frame < REPRISE;
  const avance = minute / 90;
  const termine = minute >= 90;

  // Anneau du chrono.
  const circonference = 2 * Math.PI * 138;
  const dashoffset = circonference * (1 - avance);

  // Tranche traversee en ce moment (-1 avant le coup d'envoi).
  const trancheActive = minute <= 0 ? -1 : Math.min(5, Math.floor((minute - 0.001) / 15));
  // Pulsation : un battement court a chaque changement de tranche, puis au coup de sifflet final.
  const battement = 1 + 0.05 * Math.sin(frame / 5) * (pause || termine ? 1 : 0.4);

  const xCourbe = 25 + avance * 870;

  return (
    <AbsoluteFill style={{background: '#01070b', color: '#fff', fontFamily: 'Arial,Helvetica,sans-serif', overflow: 'hidden'}}>
      <CanvasImage src={staticFile('ads/iashark-ad-stadium-v1.png')} width={1080} height={1920} style={{objectFit: 'cover', opacity: 0.42, scale: 1.04 + frame / 12000}} />
      <AbsoluteFill style={{background: 'radial-gradient(circle at 50% 38%,rgba(0,180,235,.17),transparent 34%),linear-gradient(180deg,rgba(0,3,7,.42),rgba(0,10,16,.78) 55%,rgba(0,3,7,.96))'}} />

      <div style={{position: 'absolute', top: 96, left: 0, right: 0, display: 'grid', placeItems: 'center', ...entree(0, 16)}}>
        <CanvasImage src={staticFile('ads/iashark-logo.png')} width={286} height={80} style={{objectFit: 'contain'}} />
      </div>

      <div style={{position: 'absolute', top: 200, left: 250, right: 250, height: 42, border: `1px solid ${C}`, borderRadius: 30, display: 'grid', placeItems: 'center', fontFamily: 'Arial Black,Arial', fontSize: 16, letterSpacing: 4, color: C, background: 'rgba(0,24,35,.72)', ...entree(8, 12)}}>
        90 MINUTES • 6 ZONES
      </div>

      {/* Drapeaux et pays : meme ligne, meme taille, de part et d'autre. */}
      <div style={{position: 'absolute', top: 292, left: 90, right: 90, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between'}}>
        {[{logo: 'logos/team-1118.png', nom: 'PAYS-BAS', sens: -1}, {logo: 'logos/team-25.png', nom: 'ALLEMAGNE', sens: 1}].map((e) => {
          const p = spring({frame: frame - 14, fps, config: {damping: 200, mass: 0.7}});
          return (
            <div key={e.nom} style={{width: 340, textAlign: 'center', opacity: p, transform: `translateX(${(1 - p) * 70 * e.sens}px) scale(${battement})`}}>
              <CanvasImage src={staticFile(e.logo)} width={196} height={196} style={{objectFit: 'contain', filter: 'drop-shadow(0 16px 18px #000)'}} />
              <div style={{fontFamily: 'Impact,Arial Black', fontStyle: 'italic', fontSize: 40, marginTop: 14}}>{e.nom}</div>
            </div>
          );
        })}
      </div>

      {/* Chrono 0 -> 90 */}
      <div style={{position: 'absolute', top: 566, left: 0, right: 0, display: 'grid', placeItems: 'center', opacity: fondu(28)}}>
        <div style={{width: 324, height: 324, borderRadius: '50%', position: 'relative', display: 'grid', placeItems: 'center', background: 'radial-gradient(circle,#03121b 0%,#00080d 68%)', boxShadow: `0 0 ${68 + 16 * Math.sin(frame / 12)}px rgba(8,220,255,.30),inset 0 0 45px rgba(8,220,255,.10)`}}>
          <svg width="324" height="324" viewBox="0 0 324 324" style={{position: 'absolute', rotate: '-90deg'}}>
            <circle cx="162" cy="162" r="138" fill="none" stroke="#183946" strokeWidth="18" />
            <circle cx="162" cy="162" r="138" fill="none" stroke={C} strokeWidth="18" strokeLinecap="round" strokeDasharray={circonference} strokeDashoffset={dashoffset} style={{filter: `drop-shadow(0 0 12px ${C})`}} />
            <circle cx="162" cy="162" r="155" fill="none" stroke="#dffaff" strokeWidth="3" strokeDasharray="3 14" opacity=".7" style={{rotate: `${frame / 4}deg`, transformOrigin: '162px 162px'}} />
          </svg>
          <div style={{zIndex: 2, textAlign: 'center'}}>
            <div style={{fontFamily: 'Arial Black,Arial', fontSize: 104, lineHeight: 0.9, letterSpacing: -6}}>{Math.round(minute)}’</div>
            <div style={{fontFamily: 'Arial Black,Arial', fontSize: 15, letterSpacing: 4, color: pause ? C : '#a9c9d5', marginTop: 16}}>
              {pause ? 'MI-TEMPS' : termine ? 'FIN DU MATCH' : trancheActive >= 0 ? `${trancheActive * 15}–${(trancheActive + 1) * 15}` : 'COUP D’ENVOI'}
            </div>
          </div>
        </div>
      </div>

      {/* Le message sort quand le chrono atteint la zone la plus chargee. */}
      <div style={{position: 'absolute', top: 930, left: 70, right: 70, textAlign: 'center'}}>
        <div style={{fontFamily: 'Impact,Arial Black', fontStyle: 'italic', fontSize: 72, lineHeight: 0.96, textShadow: `0 0 28px rgba(8,220,255,.44)`}}>
          <div style={entree(REPRISE + 6, 20)}>LE MATCH S’OUVRE</div>
          <div style={{color: C, ...entree(REPRISE + 16, 20)}}>APRÈS LA PAUSE</div>
        </div>
        <div style={{fontFamily: 'Arial Black,Arial', fontSize: 18, letterSpacing: 5, color: '#b8d1db', marginTop: 20, ...entree(REPRISE + 26, 12)}}>45–60 • PIC PRINCIPAL</div>
      </div>

      {/* Courbe : tracee exactement au rythme du chrono. */}
      <div style={{position: 'absolute', top: 1140, left: 80, right: 80, height: 180}}>
        <svg width="920" height="180" viewBox="0 0 920 180">
          <defs>
            <linearGradient id="ngv-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={C} stopOpacity=".9" />
              <stop offset="1" stopColor={C} stopOpacity=".04" />
            </linearGradient>
            <clipPath id="ngv-clip"><rect x="0" y="0" width={xCourbe} height="180" /></clipPath>
          </defs>
          <path d={area} fill="none" stroke="rgba(150,200,218,.18)" strokeWidth="2" />
          <g clipPath="url(#ngv-clip)">
            <path d={area} fill="url(#ngv-fill)" />
            <path d={line} fill="none" stroke={C} strokeWidth="5" strokeLinejoin="round" style={{filter: `drop-shadow(0 0 8px ${C})`}} />
          </g>
          {points.map((p, i) => {
            const atteint = minute >= i * 15;
            if (!atteint) return null;
            const pic = i === PIC;
            const r = (pic ? 11 : 7) * (pic ? 1 + 0.08 * Math.sin(frame / 6) : 1);
            return (
              <g key={i}>
                <circle cx={p.x} cy={p.y} r={r} fill={pic ? '#fff' : C} />
                {pic ? <circle cx={p.x} cy={p.y} r={20 * (1 + 0.1 * Math.sin(frame / 6))} fill="none" stroke={C} strokeWidth="3" opacity=".7" /> : null}
              </g>
            );
          })}
          {/* Tete de lecture : la minute en cours. */}
          {minute > 0 && !termine ? <line x1={xCourbe} y1="0" x2={xCourbe} y2="160" stroke={C} strokeWidth="3" opacity=".55" style={{filter: `drop-shadow(0 0 8px ${C})`}} /> : null}
        </svg>
      </div>

      {/* Six tranches : chacune se remplit quand le chrono la traverse. */}
      <div style={{position: 'absolute', top: 1348, left: 80, right: 80, display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 9}}>
        {values.map((v, i) => {
          const remplissage = interpolate(minute, [i * 15, (i + 1) * 15], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
          const active = trancheActive === i && !termine;
          const acquise = minute >= (i + 1) * 15;
          const pic = i === PIC;
          const surligne = active || (acquise && pic);
          return (
            <div key={i} style={{position: 'relative', height: 112, overflow: 'hidden', border: surligne ? `2px solid ${C}` : '1px solid rgba(150,200,218,.25)', borderRadius: 14, background: 'rgba(0,12,20,.82)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', boxShadow: surligne ? `0 0 ${22 + 8 * Math.sin(frame / 8)}px rgba(8,220,255,.32)` : 'none', ...entree(30 + i * 5, 16)}}>
              <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: `${remplissage * 100}%`, background: pic ? 'linear-gradient(180deg,rgba(8,220,255,.34),rgba(8,220,255,.06))' : 'linear-gradient(180deg,rgba(8,220,255,.18),rgba(8,220,255,.03))'}} />
              <div style={{position: 'relative', fontFamily: 'Impact,Arial Black', fontSize: 38, color: surligne ? C : '#fff'}}>{Math.round(v * remplissage)}%</div>
              <div style={{position: 'relative', fontFamily: 'Arial Black,Arial', fontSize: 13, color: '#9eb9c5', marginTop: 6}}>{i * 15}–{(i + 1) * 15}</div>
            </div>
          );
        })}
      </div>

      {/* Bilan : apres le coup de sifflet final. */}
      <div style={{position: 'absolute', top: 1494, left: 110, right: 110, height: 144, border: `1px solid rgba(8,220,255,.45)`, borderRadius: 22, background: 'linear-gradient(90deg,rgba(0,17,27,.94),rgba(1,34,48,.9),rgba(0,17,27,.94))', display: 'grid', gridTemplateColumns: '1fr 1px 1fr', alignItems: 'center', boxShadow: termine ? `0 0 ${26 + 10 * Math.sin(frame / 9)}px rgba(8,220,255,.30),0 18px 34px rgba(0,0,0,.35)` : '0 18px 34px rgba(0,0,0,.35)', ...entree(40, 22)}}>
        <div style={{textAlign: 'center'}}>
          <div style={{fontFamily: 'Arial Black,Arial', fontSize: 15, letterSpacing: 3, color: '#a9c4cf'}}>BUTS ATTENDUS</div>
          <div style={{fontFamily: 'Impact,Arial Black', fontSize: 52, marginTop: 6}}>1,6 <span style={{color: C, fontSize: 28}}>•</span> 1,7</div>
        </div>
        <div style={{height: 82, background: 'rgba(8,220,255,.28)'}} />
        <div style={{textAlign: 'center'}}>
          <div style={{fontFamily: 'Arial Black,Arial', fontSize: 15, letterSpacing: 3, color: '#a9c4cf'}}>SCORE LE PLUS PROBABLE</div>
          <div style={{fontFamily: 'Impact,Arial Black', fontSize: 52, marginTop: 6}}>1 <span style={{color: C, fontSize: 28}}>•</span> 1</div>
        </div>
      </div>

      <div style={{position: 'absolute', top: 1664, left: 170, right: 170, textAlign: 'center', fontFamily: 'Arial Black,Arial', fontSize: 16, lineHeight: 1.45, letterSpacing: 2, color: '#a9c4cf', opacity: fondu(52)}}>
        23 BUTS OBSERVÉS SUR LES 4 DERNIERS MATCHS<br />
        <span style={{color: '#6f8c99'}}>FRÉQUENCE OBSERVÉE • PAS UNE CERTITUDE</span>
      </div>

      <div style={{position: 'absolute', left: 170, right: 170, bottom: 180, height: 2, background: `linear-gradient(90deg,transparent,${C},transparent)`, boxShadow: `0 0 17px ${C}`, opacity: fondu(60), transform: `scaleX(${fondu(60)})`}} />
      <div style={{position: 'absolute', bottom: 104, left: 0, right: 0, textAlign: 'center', fontFamily: 'Arial Black,Arial', fontSize: 40, letterSpacing: 8, color: C, textShadow: `0 0 ${18 + 8 * Math.sin(frame / 11)}px ${C}`, opacity: fondu(66)}}>
        IASHARK.COM
      </div>
    </AbsoluteFill>
  );
};
