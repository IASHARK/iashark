import React from 'react';
import {AbsoluteFill, CanvasImage, staticFile} from 'remotion';

const CYAN='#08dcff';
const periods=[19,7,12,19,13,29];
const wave='M0 170 L0 137 L46 123 L92 130 L138 112 L184 142 L230 150 L276 132 L322 141 L368 122 L414 108 L460 120 L506 99 L552 117 L598 128 L644 107 L690 119 L736 103 L782 68 L828 77 L874 42 L920 18 L920 170 Z';

export const IasharkViral90Preview=()=> <AbsoluteFill style={{background:'#01070b',color:'#fff',fontFamily:'Arial,Helvetica,sans-serif',overflow:'hidden'}}>
  <CanvasImage src={staticFile('ads/iashark-ad-stadium-v1.png')} width={1080} height={1920} style={{objectFit:'cover',opacity:.43,scale:1.04}}/>
  <AbsoluteFill style={{background:'radial-gradient(circle at 50% 40%,rgba(0,174,230,.16),transparent 33%),linear-gradient(180deg,rgba(0,3,7,.44),rgba(0,10,16,.76) 53%,rgba(0,3,7,.94))'}}/>
  <div style={{position:'absolute',top:130,left:0,right:0,display:'grid',placeItems:'center'}}><CanvasImage src={staticFile('ads/iashark-logo.png')} width={300} height={84} style={{objectFit:'contain'}}/></div>
  <div style={{position:'absolute',top:233,left:280,right:280,height:42,border:`1px solid ${CYAN}`,borderRadius:30,display:'grid',placeItems:'center',fontFamily:'Arial Black,Arial',fontSize:16,letterSpacing:4,color:CYAN,background:'rgba(0,24,35,.72)'}}>90 MINUTES • 6 ZONES</div>

  <div style={{position:'absolute',top:325,left:95,right:95,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
    <div style={{width:260,textAlign:'center'}}><CanvasImage src={staticFile('logos/team-81.png')} width={205} height={205} style={{objectFit:'contain',filter:'drop-shadow(0 16px 18px #000)'}}/><div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:36}}>MARSEILLE</div></div>
    <div style={{width:260,textAlign:'center'}}><CanvasImage src={staticFile('logos/team-85.png')} width={205} height={205} style={{objectFit:'contain',filter:'drop-shadow(0 16px 18px #000)'}}/><div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:36}}>PSG</div></div>
  </div>

  <div style={{position:'absolute',top:470,left:0,right:0,display:'grid',placeItems:'center'}}>
    <div style={{width:355,height:355,borderRadius:'50%',position:'relative',display:'grid',placeItems:'center',background:'radial-gradient(circle,#03121b 0%,#00080d 68%)',boxShadow:`0 0 75px rgba(8,220,255,.30),inset 0 0 45px rgba(8,220,255,.10)`}}>
      <svg width="355" height="355" viewBox="0 0 355 355" style={{position:'absolute',rotate:'-90deg'}}><circle cx="177.5" cy="177.5" r="151" fill="none" stroke="#183946" strokeWidth="19"/><circle cx="177.5" cy="177.5" r="151" fill="none" stroke={CYAN} strokeWidth="19" strokeLinecap="round" strokeDasharray="949" strokeDashoffset="137" style={{filter:`drop-shadow(0 0 12px ${CYAN})`}}/><circle cx="177.5" cy="177.5" r="169" fill="none" stroke="#dffaff" strokeWidth="3" strokeDasharray="3 14" opacity=".7"/></svg>
      <div style={{zIndex:2,textAlign:'center'}}><div style={{fontFamily:'Arial Black,Arial',fontSize:112,lineHeight:.9,letterSpacing:-6}}>77’</div><div style={{fontFamily:'Arial Black,Arial',fontSize:16,letterSpacing:4,color:'#9ac5d4',marginTop:18}}>DERNIÈRE ZONE</div></div>
    </div>
  </div>

  <div style={{position:'absolute',top:856,left:90,right:90}}>
    <div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:75,lineHeight:.95,textAlign:'center',letterSpacing:1,textShadow:`0 0 28px rgba(8,220,255,.45)`}}>LE PIC ARRIVE<br/><span style={{color:CYAN}}>MAINTENANT</span></div>
    <div style={{textAlign:'center',fontFamily:'Arial Black,Arial',fontSize:19,letterSpacing:5,color:'#b6d0da',marginTop:25}}>75–90 • ZONE LA PLUS CHARGÉE</div>
  </div>

  <div style={{position:'absolute',top:1080,left:80,right:80,height:190}}>
    <svg width="920" height="190" viewBox="0 0 920 190"><defs><linearGradient id="viral-wave" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={CYAN} stopOpacity=".94"/><stop offset="1" stopColor={CYAN} stopOpacity=".04"/></linearGradient></defs><path d={wave} fill="url(#viral-wave)"/><path d={wave.replace(/ Z$/, '')} fill="none" stroke={CYAN} strokeWidth="4" style={{filter:`drop-shadow(0 0 8px ${CYAN})`}}/><line x1="782" x2="782" y1="0" y2="174" stroke="#fff" strokeWidth="2" strokeDasharray="7 7" opacity=".78"/></svg>
  </div>

  <div style={{position:'absolute',top:1288,left:80,right:80,display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:9}}>
    {periods.map((value,index)=><div key={index} style={{height:116,border:index===5?`2px solid ${CYAN}`:'1px solid rgba(150,200,218,.25)',borderRadius:14,background:index===5?'linear-gradient(180deg,rgba(8,220,255,.22),rgba(0,17,26,.94))':'rgba(0,12,20,.82)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',boxShadow:index===5?`0 0 25px rgba(8,220,255,.32)`:'none'}}><div style={{fontFamily:'Impact,Arial Black',fontSize:39,color:index===5?CYAN:'#fff'}}>{value}%</div><div style={{fontFamily:'Arial Black,Arial',fontSize:13,color:'#9eb9c5',marginTop:7}}>{index*15}–{(index+1)*15}</div></div>)}
  </div>

  <div style={{position:'absolute',top:1440,left:115,right:115,height:145,border:`1px solid rgba(8,220,255,.45)`,borderRadius:22,background:'linear-gradient(90deg,rgba(0,17,27,.94),rgba(1,34,48,.9),rgba(0,17,27,.94))',display:'grid',gridTemplateColumns:'1fr 1px 1fr',alignItems:'center',boxShadow:'0 18px 34px rgba(0,0,0,.35)'}}>
    <div style={{textAlign:'center'}}><div style={{fontFamily:'Arial Black,Arial',fontSize:16,letterSpacing:3,color:'#a9c4cf'}}>xG À 77’</div><div style={{fontFamily:'Impact,Arial Black',fontSize:54,marginTop:7}}>0,99 <span style={{color:CYAN,fontSize:30}}>•</span> 1,57</div></div>
    <div style={{height:82,background:'rgba(8,220,255,.28)'}}/>
    <div style={{textAlign:'center'}}><div style={{fontFamily:'Arial Black,Arial',fontSize:16,letterSpacing:3,color:'#a9c4cf'}}>TIRS CADRÉS</div><div style={{fontFamily:'Impact,Arial Black',fontSize:54,marginTop:7}}>3 <span style={{color:CYAN,fontSize:30}}>•</span> 5</div></div>
  </div>

  <div style={{position:'absolute',left:170,right:170,bottom:245,height:2,background:`linear-gradient(90deg,transparent,${CYAN},transparent)`,boxShadow:`0 0 17px ${CYAN}`}}/>
  <div style={{position:'absolute',bottom:160,left:0,right:0,textAlign:'center',fontFamily:'Arial Black,Arial',fontSize:42,letterSpacing:8,color:CYAN,textShadow:`0 0 18px ${CYAN}`}}>IASHARK.COM</div>
</AbsoluteFill>;
