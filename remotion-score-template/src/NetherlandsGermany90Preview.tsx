import React from 'react';
import {AbsoluteFill, CanvasImage, staticFile} from 'remotion';

const C='#08dcff';
const values=[22,4,4,30,22,17];
const points=values.map((v,i)=>({x:25+i*174,y:158-(v/30)*125}));
const line=points.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ');
const area=`${line} L895,168 L25,168 Z`;

export const NetherlandsGermany90Preview=()=> <AbsoluteFill style={{background:'#01070b',color:'#fff',fontFamily:'Arial,Helvetica,sans-serif',overflow:'hidden'}}>
  <CanvasImage src={staticFile('ads/iashark-ad-stadium-v1.png')} width={1080} height={1920} style={{objectFit:'cover',opacity:.42,scale:1.04}}/>
  <AbsoluteFill style={{background:'radial-gradient(circle at 50% 42%,rgba(0,180,235,.17),transparent 34%),linear-gradient(180deg,rgba(0,3,7,.42),rgba(0,10,16,.78) 55%,rgba(0,3,7,.96))'}}/>
  <div style={{position:'absolute',top:125,left:0,right:0,display:'grid',placeItems:'center'}}><CanvasImage src={staticFile('ads/iashark-logo.png')} width={300} height={84} style={{objectFit:'contain'}}/></div>
  <div style={{position:'absolute',top:228,left:245,right:245,height:43,border:`1px solid ${C}`,borderRadius:30,display:'grid',placeItems:'center',fontFamily:'Arial Black,Arial',fontSize:16,letterSpacing:4,color:C,background:'rgba(0,24,35,.72)'}}>90 MINUTES • 6 ZONES</div>

  <div style={{position:'absolute',top:318,left:92,right:92,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
    <div style={{width:290,textAlign:'center'}}><CanvasImage src={staticFile('logos/team-1118.png')} width={220} height={220} style={{objectFit:'contain',filter:'drop-shadow(0 16px 18px #000)'}}/><div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:39}}>PAYS-BAS</div></div>
    <div style={{width:290,textAlign:'center'}}><CanvasImage src={staticFile('logos/team-25.png')} width={220} height={220} style={{objectFit:'contain',filter:'drop-shadow(0 16px 18px #000)'}}/><div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:39}}>ALLEMAGNE</div></div>
  </div>

  <div style={{position:'absolute',top:462,left:0,right:0,display:'grid',placeItems:'center'}}>
    <div style={{width:352,height:352,borderRadius:'50%',position:'relative',display:'grid',placeItems:'center',background:'radial-gradient(circle,#03121b 0%,#00080d 68%)',boxShadow:`0 0 75px rgba(8,220,255,.30),inset 0 0 45px rgba(8,220,255,.10)`}}>
      <svg width="352" height="352" viewBox="0 0 352 352" style={{position:'absolute',rotate:'-90deg'}}><circle cx="176" cy="176" r="150" fill="none" stroke="#183946" strokeWidth="19"/><circle cx="176" cy="176" r="150" fill="none" stroke={C} strokeWidth="19" strokeLinecap="round" strokeDasharray="943" strokeDashoffset="398" style={{filter:`drop-shadow(0 0 12px ${C})`}}/><circle cx="176" cy="176" r="168" fill="none" stroke="#dffaff" strokeWidth="3" strokeDasharray="3 14" opacity=".7"/></svg>
      <div style={{zIndex:2,textAlign:'center'}}><div style={{fontFamily:'Arial Black,Arial',fontSize:108,lineHeight:.9,letterSpacing:-6}}>52’</div><div style={{fontFamily:'Arial Black,Arial',fontSize:16,letterSpacing:4,color:'#a9c9d5',marginTop:18}}>ZONE ACTIVE</div></div>
    </div>
  </div>

  <div style={{position:'absolute',top:846,left:70,right:70,textAlign:'center'}}>
    <div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:76,lineHeight:.96,textShadow:`0 0 28px rgba(8,220,255,.44)`}}>LE MATCH S’OUVRE<br/><span style={{color:C}}>APRÈS LA PAUSE</span></div>
    <div style={{fontFamily:'Arial Black,Arial',fontSize:19,letterSpacing:5,color:'#b8d1db',marginTop:24}}>45–60 • PIC PRINCIPAL</div>
  </div>

  <div style={{position:'absolute',top:1068,left:80,right:80,height:190}}>
    <svg width="920" height="190" viewBox="0 0 920 190"><defs><linearGradient id="ng-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C} stopOpacity=".9"/><stop offset="1" stopColor={C} stopOpacity=".04"/></linearGradient></defs><path d={area} fill="url(#ng-fill)"/><path d={line} fill="none" stroke={C} strokeWidth="5" strokeLinejoin="round" style={{filter:`drop-shadow(0 0 8px ${C})`}}/>{points.map((p,i)=><g key={i}><circle cx={p.x} cy={p.y} r={i===3?11:7} fill={i===3?'#fff':C}/>{i===3?<circle cx={p.x} cy={p.y} r="20" fill="none" stroke={C} strokeWidth="3" opacity=".7"/>:null}</g>)}</svg>
  </div>

  <div style={{position:'absolute',top:1282,left:80,right:80,display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:9}}>
    {values.map((v,i)=><div key={i} style={{height:117,border:i===3?`2px solid ${C}`:'1px solid rgba(150,200,218,.25)',borderRadius:14,background:i===3?'linear-gradient(180deg,rgba(8,220,255,.22),rgba(0,17,26,.94))':'rgba(0,12,20,.82)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',boxShadow:i===3?`0 0 25px rgba(8,220,255,.32)`:'none'}}><div style={{fontFamily:'Impact,Arial Black',fontSize:40,color:i===3?C:'#fff'}}>{v}%</div><div style={{fontFamily:'Arial Black,Arial',fontSize:13,color:'#9eb9c5',marginTop:7}}>{i*15}–{(i+1)*15}</div></div>)}
  </div>

  <div style={{position:'absolute',top:1438,left:110,right:110,height:153,border:`1px solid rgba(8,220,255,.45)`,borderRadius:22,background:'linear-gradient(90deg,rgba(0,17,27,.94),rgba(1,34,48,.9),rgba(0,17,27,.94))',display:'grid',gridTemplateColumns:'1fr 1px 1fr',alignItems:'center',boxShadow:'0 18px 34px rgba(0,0,0,.35)'}}>
    <div style={{textAlign:'center'}}><div style={{fontFamily:'Arial Black,Arial',fontSize:16,letterSpacing:3,color:'#a9c4cf'}}>BUTS ATTENDUS</div><div style={{fontFamily:'Impact,Arial Black',fontSize:55,marginTop:7}}>1,6 <span style={{color:C,fontSize:30}}>•</span> 1,7</div></div>
    <div style={{height:86,background:'rgba(8,220,255,.28)'}}/>
    <div style={{textAlign:'center'}}><div style={{fontFamily:'Arial Black,Arial',fontSize:16,letterSpacing:3,color:'#a9c4cf'}}>SCORE LE PLUS PROBABLE</div><div style={{fontFamily:'Impact,Arial Black',fontSize:55,marginTop:7}}>1 <span style={{color:C,fontSize:30}}>•</span> 1</div></div>
  </div>

  <div style={{position:'absolute',top:1625,left:175,right:175,textAlign:'center',fontFamily:'Arial Black,Arial',fontSize:17,lineHeight:1.45,letterSpacing:2,color:'#a9c4cf'}}>23 BUTS OBSERVÉS SUR LES 4 DERNIERS MATCHS<br/><span style={{color:'#6f8c99'}}>FRÉQUENCE OBSERVÉE • PAS UNE CERTITUDE</span></div>
  <div style={{position:'absolute',left:170,right:170,bottom:190,height:2,background:`linear-gradient(90deg,transparent,${C},transparent)`,boxShadow:`0 0 17px ${C}`}}/>
  <div style={{position:'absolute',bottom:110,left:0,right:0,textAlign:'center',fontFamily:'Arial Black,Arial',fontSize:42,letterSpacing:8,color:C,textShadow:`0 0 18px ${C}`}}>IASHARK.COM</div>
</AbsoluteFill>;
