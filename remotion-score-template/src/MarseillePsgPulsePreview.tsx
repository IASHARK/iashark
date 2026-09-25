import React from 'react';
import {AbsoluteFill, CanvasImage, staticFile} from 'remotion';

const C='#08d9ff';
const waveA='M0 130 L0 112 L35 103 L70 110 L105 91 L140 98 L175 70 L210 88 L245 55 L280 82 L315 67 L350 96 L385 76 L420 105 L455 93 L490 115 L525 101 L560 119 L600 108 L640 124 L680 112 L720 125 L760 117 L800 132 L840 121 L880 130 L920 126 L920 145 L0 145 Z';
const waveB='M0 136 L0 126 L35 119 L70 126 L105 112 L140 118 L175 103 L210 111 L245 96 L280 106 L315 86 L350 99 L385 74 L420 91 L455 62 L490 78 L525 47 L560 70 L600 39 L640 61 L680 28 L720 55 L760 35 L800 67 L840 43 L880 75 L920 58 L920 145 L0 145 Z';

const Stat=({label,left,right}:{label:string;left:string;right:string})=><div style={{height:105,border:'1px solid rgba(8,217,255,.32)',borderRadius:18,background:'linear-gradient(180deg,rgba(2,28,41,.9),rgba(0,11,18,.94))',display:'grid',gridTemplateColumns:'1fr 1.25fr 1fr',alignItems:'center',boxShadow:'0 0 20px rgba(8,217,255,.1)'}}>
  <div style={{fontFamily:'Impact,Arial Black',fontSize:48,textAlign:'center'}}>{left}</div>
  <div style={{fontFamily:'Arial Black,Arial',fontSize:22,letterSpacing:2,color:C,textAlign:'center'}}>{label}</div>
  <div style={{fontFamily:'Impact,Arial Black',fontSize:48,textAlign:'center'}}>{right}</div>
</div>;

export const MarseillePsgPulsePreview=()=> <AbsoluteFill style={{background:'#01070b',color:'#fff',fontFamily:'Arial,Helvetica,sans-serif',overflow:'hidden'}}>
  <CanvasImage src={staticFile('ads/iashark-ad-stadium-v1.png')} width={1080} height={1920} style={{objectFit:'cover',opacity:.42,scale:1.035}}/>
  <AbsoluteFill style={{background:'radial-gradient(circle at 8% 20%,rgba(5,160,240,.25),transparent 18%),radial-gradient(circle at 92% 20%,rgba(5,160,240,.22),transparent 18%),linear-gradient(180deg,rgba(0,4,8,.35),rgba(0,8,13,.78) 52%,rgba(0,3,7,.94))'}}/>
  <div style={{position:'absolute',top:110,left:0,right:0,display:'grid',placeItems:'center'}}><CanvasImage src={staticFile('ads/iashark-logo.png')} width={310} height={86} style={{objectFit:'contain'}}/></div>
  <div style={{position:'absolute',top:208,left:0,right:0,textAlign:'center',fontFamily:'Arial Black,Arial',fontSize:18,letterSpacing:6,color:'#88dff5'}}>LIGUE 1 • CLASSIQUE</div>

  <div style={{position:'absolute',top:278,left:92,right:92,display:'flex',justifyContent:'space-between',alignItems:'start'}}>
    <div style={{width:270,textAlign:'center'}}><CanvasImage src={staticFile('logos/team-81.png')} width={230} height={230} style={{objectFit:'contain'}}/><div style={{fontFamily:'Arial Black,Arial',fontSize:29,marginTop:10}}>MARSEILLE</div></div>
    <div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:48,color:C,marginTop:112}}>VS</div>
    <div style={{width:270,textAlign:'center'}}><CanvasImage src={staticFile('logos/team-85.png')} width={230} height={230} style={{objectFit:'contain'}}/><div style={{fontFamily:'Arial Black,Arial',fontSize:29,marginTop:10}}>PSG</div></div>
  </div>

  <div style={{position:'absolute',top:600,left:0,right:0,display:'grid',placeItems:'center'}}>
    <div style={{width:190,height:190,borderRadius:'50%',background:'rgba(0,8,14,.94)',border:'13px solid #153847',boxShadow:'0 0 35px rgba(8,217,255,.28)',display:'grid',placeItems:'center',position:'relative'}}>
      <div style={{position:'absolute',inset:-13,borderRadius:'50%',border:`13px solid ${C}`,borderLeftColor:'transparent',rotate:'38deg',filter:'drop-shadow(0 0 10px rgba(8,217,255,.8))'}}/>
      <div style={{fontFamily:'Arial Black,Arial',fontSize:64,zIndex:2}}>59’</div>
    </div>
  </div>

  <div style={{position:'absolute',top:825,left:80,right:80,height:85}}>
    <div style={{position:'absolute',top:25,left:0,right:0,height:8,borderRadius:8,background:'rgba(190,220,232,.48)'}}/><div style={{position:'absolute',top:25,left:0,width:'65.5%',height:8,borderRadius:8,background:C,boxShadow:`0 0 15px ${C}`}}/>
    {[0,15,30,45,60,75,90].map(m=><div key={m} style={{position:'absolute',left:`${m/90*100}%`,top:13,translate:'-50% 0'}}><div style={{width:2,height:31,background:m<=59?C:'#d8eef5'}}/><div style={{fontFamily:'Arial Black',fontSize:22,marginTop:13,translate:'-50% 0',marginLeft:1}}>{m}</div></div>)}
    {[14,59,86,90].map((m,i)=><div key={m} style={{position:'absolute',left:`${m/90*100}%`,top:8,translate:'-17px 0',width:34,height:34,borderRadius:'50%',background:i<2?'#fff':'#70818a',display:'grid',placeItems:'center',fontSize:25,boxShadow:i<2?`0 0 13px ${C}`:'none',opacity:i<2?1:.38}}>⚽</div>)}
  </div>

  <div style={{position:'absolute',top:940,left:80,width:920,height:250,borderTop:'1px solid rgba(8,217,255,.23)',borderBottom:'1px solid rgba(8,217,255,.23)'}}>
    <svg width="920" height="250" viewBox="0 0 920 250"><defs><linearGradient id="om" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#dff8ff" stopOpacity=".42"/><stop offset="1" stopColor="#dff8ff" stopOpacity=".02"/></linearGradient><linearGradient id="psg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C} stopOpacity=".85"/><stop offset="1" stopColor={C} stopOpacity=".03"/></linearGradient></defs><g transform="translate(0,-14) scale(1,.72)"><path d={waveA} fill="url(#om)"/><path d={waveA.replace(/Z$/,'')} fill="none" stroke="#e8fbff" strokeWidth="3" opacity=".7"/></g><g transform="translate(0,104) scale(1,.72)"><path d={waveB} fill="url(#psg)"/><path d={waveB.replace(/Z$/,'')} fill="none" stroke={C} strokeWidth="4" style={{filter:'drop-shadow(0 0 7px rgba(8,217,255,.75)'}}/></g><line x1="603" x2="603" y1="0" y2="245" stroke={C} strokeWidth="2" strokeDasharray="7 7" opacity=".7"/></svg>
    <div style={{position:'absolute',left:13,top:23,width:45,height:45}}><CanvasImage src={staticFile('logos/team-81.png')} width={45} height={45} style={{objectFit:'contain'}}/></div>
    <div style={{position:'absolute',left:13,top:150,width:45,height:45}}><CanvasImage src={staticFile('logos/team-85.png')} width={45} height={45} style={{objectFit:'contain'}}/></div>
  </div>

  <div style={{position:'absolute',top:1240,left:150,right:150,display:'grid',gap:14}}><Stat label="xG" left="0,8" right="1,3"/><Stat label="TIRS CADRÉS" left="3" right="4"/><Stat label="INTENSITÉ" left="45" right="77"/></div>
  <div style={{position:'absolute',left:170,right:170,bottom:205,height:2,background:`linear-gradient(90deg,transparent,${C},transparent)`,boxShadow:`0 0 18px ${C}`}}/>
  <div style={{position:'absolute',bottom:120,left:0,right:0,textAlign:'center',fontFamily:'Arial Black,Arial',fontSize:43,letterSpacing:8,color:C,textShadow:`0 0 18px ${C}`}}>IASHARK.COM</div>
</AbsoluteFill>;
