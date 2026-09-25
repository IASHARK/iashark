import React, {ReactNode} from 'react';
import {AbsoluteFill, CanvasImage, staticFile} from 'remotion';

const C='#08dcff';
const values=[22,4,4,30,22,17];

const Shell=({children,label}:{children:ReactNode;label:string})=><AbsoluteFill style={{background:'#01070b',color:'#fff',fontFamily:'Arial,Helvetica,sans-serif',overflow:'hidden'}}>
  <CanvasImage src={staticFile('ads/iashark-ad-stadium-v1.png')} width={1080} height={1920} style={{objectFit:'cover',opacity:.42,scale:1.04}}/>
  <AbsoluteFill style={{background:'radial-gradient(circle at 50% 42%,rgba(0,180,235,.18),transparent 35%),linear-gradient(180deg,rgba(0,3,7,.42),rgba(0,10,16,.78) 55%,rgba(0,3,7,.96))'}}/>
  <div style={{position:'absolute',top:125,left:0,right:0,display:'grid',placeItems:'center'}}><CanvasImage src={staticFile('ads/iashark-logo.png')} width={300} height={84} style={{objectFit:'contain'}}/></div>
  <div style={{position:'absolute',top:228,left:260,right:260,height:43,border:`1px solid ${C}`,borderRadius:30,display:'grid',placeItems:'center',fontFamily:'Arial Black,Arial',fontSize:16,letterSpacing:4,color:C,background:'rgba(0,24,35,.72)'}}>{label}</div>
  {children}
  <div style={{position:'absolute',left:170,right:170,bottom:190,height:2,background:`linear-gradient(90deg,transparent,${C},transparent)`,boxShadow:`0 0 17px ${C}`}}/>
  <div style={{position:'absolute',bottom:110,left:0,right:0,textAlign:'center',fontFamily:'Arial Black,Arial',fontSize:42,letterSpacing:8,color:C,textShadow:`0 0 18px ${C}`}}>IASHARK.COM</div>
</AbsoluteFill>;

const Teams=()=> <div style={{position:'absolute',top:320,left:100,right:100,display:'flex',justifyContent:'space-between'}}>
  <div style={{textAlign:'center'}}><CanvasImage src={staticFile('logos/team-1118.png')} width={205} height={205} style={{objectFit:'contain'}}/><div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:36}}>PAYS-BAS</div></div>
  <div style={{textAlign:'center'}}><CanvasImage src={staticFile('logos/team-25.png')} width={205} height={205} style={{objectFit:'contain'}}/><div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:36}}>ALLEMAGNE</div></div>
</div>;

export const IasharkDuelConcept=()=> <Shell label="CONCEPT 1 • DUEL DE DOMINATION"><Teams/>
  <div style={{position:'absolute',top:610,left:80,right:80,textAlign:'center',fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:76,lineHeight:.95}}>QUI PREND<br/><span style={{color:C}}>LE CONTRÔLE ?</span></div>
  <div style={{position:'absolute',top:800,left:80,right:80,height:370,border:'1px solid rgba(8,220,255,.4)',borderRadius:34,overflow:'hidden',background:'rgba(0,10,17,.86)',boxShadow:'0 0 45px rgba(8,220,255,.13)'}}>
    <div style={{position:'absolute',inset:0,background:'linear-gradient(112deg,rgba(255,105,0,.23) 0%,rgba(255,105,0,.07) 45%,rgba(8,220,255,.08) 55%,rgba(8,220,255,.27) 100%)'}}/>
    <div style={{position:'absolute',left:'50%',top:-40,bottom:-40,width:4,rotate:'14deg',background:C,boxShadow:`0 0 22px ${C}`}}/>
    <div style={{position:'absolute',left:55,top:66,fontFamily:'Impact,Arial Black',fontSize:112}}>42</div><div style={{position:'absolute',left:70,top:190,fontFamily:'Arial Black',fontSize:18,letterSpacing:4,color:'#ff9a47'}}>PRESSION</div>
    <div style={{position:'absolute',right:55,top:66,fontFamily:'Impact,Arial Black',fontSize:112,color:C}}>58</div><div style={{position:'absolute',right:70,top:190,fontFamily:'Arial Black',fontSize:18,letterSpacing:4,color:C}}>PRESSION</div>
    <div style={{position:'absolute',left:365,right:365,top:139,textAlign:'center',fontFamily:'Impact,Arial Black',fontSize:45}}>52’</div>
    <div style={{position:'absolute',left:40,right:40,bottom:42,height:22,borderRadius:20,overflow:'hidden',display:'flex',background:'#17313d'}}><div style={{width:'42%',background:'#ff7a1a'}}/><div style={{flex:1,background:C,boxShadow:`0 0 18px ${C}`}}/></div>
  </div>
  <div style={{position:'absolute',top:1215,left:100,right:100,display:'grid',gridTemplateColumns:'1fr 1fr',gap:18}}><div style={{height:142,border:'1px solid rgba(255,140,60,.5)',borderRadius:20,display:'grid',placeItems:'center',background:'rgba(40,18,5,.72)'}}><div style={{textAlign:'center'}}><div style={{fontFamily:'Arial Black',fontSize:16,letterSpacing:3,color:'#ffad69'}}>xG PAYS-BAS</div><div style={{fontFamily:'Impact',fontSize:59,marginTop:5}}>1,6</div></div></div><div style={{height:142,border:`1px solid ${C}`,borderRadius:20,display:'grid',placeItems:'center',background:'rgba(0,28,40,.8)',boxShadow:'0 0 24px rgba(8,220,255,.18)'}}><div style={{textAlign:'center'}}><div style={{fontFamily:'Arial Black',fontSize:16,letterSpacing:3,color:C}}>xG ALLEMAGNE</div><div style={{fontFamily:'Impact',fontSize:59,marginTop:5}}>1,7</div></div></div></div>
  <div style={{position:'absolute',top:1405,left:85,right:85,textAlign:'center',fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:58}}>L’AVANTAGE CHANGE<br/><span style={{color:C}}>À CHAQUE ZONE</span></div>
</Shell>;

export const IasharkRadarConcept=()=> <Shell label="CONCEPT 2 • RADAR DES BUTS"><Teams/>
  <div style={{position:'absolute',top:580,left:0,right:0,textAlign:'center',fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:72}}>PIC DE DANGER<br/><span style={{color:C}}>DÉTECTÉ</span></div>
  <div style={{position:'absolute',top:750,left:190,width:700,height:700,borderRadius:'50%',background:'radial-gradient(circle,rgba(8,220,255,.16),rgba(0,10,18,.94) 58%)',border:'3px solid rgba(8,220,255,.5)',boxShadow:'0 0 55px rgba(8,220,255,.22)',display:'grid',placeItems:'center'}}>
    {[290,225,160].map(size=><div key={size} style={{position:'absolute',width:size*2,height:size*2,borderRadius:'50%',border:'2px solid rgba(8,220,255,.18)'}}/>)}
    {[0,60,120].map(angle=><div key={angle} style={{position:'absolute',width:620,height:2,background:'rgba(8,220,255,.2)',rotate:`${angle}deg`}}/>)}
    <div style={{position:'absolute',width:310,height:310,borderRadius:'100% 0 0 0',background:'linear-gradient(135deg,rgba(8,220,255,.48),transparent 72%)',translate:'-155px -155px',rotate:'105deg',transformOrigin:'bottom right'}}/>
    <div style={{zIndex:3,width:210,height:210,borderRadius:'50%',background:'#020b11',border:`12px solid ${C}`,display:'grid',placeItems:'center',boxShadow:`0 0 35px ${C}`}}><div style={{textAlign:'center'}}><div style={{fontFamily:'Impact',fontSize:78}}>52’</div><div style={{fontFamily:'Arial Black',fontSize:14,letterSpacing:3,color:C}}>SCAN ACTIF</div></div></div>
    <div style={{position:'absolute',right:88,top:160,width:128,height:128,borderRadius:'50%',border:`3px solid ${C}`,display:'grid',placeItems:'center',background:'rgba(0,25,37,.94)',boxShadow:`0 0 26px ${C}`}}><div style={{textAlign:'center'}}><div style={{fontFamily:'Impact',fontSize:48,color:C}}>30%</div><div style={{fontSize:13,fontWeight:900}}>45–60</div></div></div>
  </div>
  <div style={{position:'absolute',top:1485,left:140,right:140,height:105,border:`1px solid ${C}`,borderRadius:20,background:'rgba(0,22,33,.88)',display:'grid',placeItems:'center',fontFamily:'Arial Black',fontSize:22,letterSpacing:4,color:'#dff8ff'}}>ZONE LA PLUS CHARGÉE</div>
</Shell>;

export const IasharkHeartbeatConcept=()=> <Shell label="CONCEPT 3 • MATCH CARDIAQUE"><Teams/>
  <div style={{position:'absolute',top:600,left:70,right:70,textAlign:'center',fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:76,lineHeight:.95}}>LE MATCH<br/><span style={{color:C}}>ACCÉLÈRE</span></div>
  <div style={{position:'absolute',top:830,left:55,right:55,height:360,borderTop:'1px solid rgba(8,220,255,.2)',borderBottom:'1px solid rgba(8,220,255,.2)',background:'rgba(0,9,15,.5)'}}>
    <svg width="970" height="360" viewBox="0 0 970 360"><defs><linearGradient id="heart" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C} stopOpacity=".55"/><stop offset="1" stopColor={C} stopOpacity="0"/></linearGradient></defs><path d="M0 215 L95 215 L135 190 L175 235 L220 215 L305 215 L350 180 L390 245 L435 215 L505 215 L550 190 L585 225 L625 215 L675 215 L710 122 L742 278 L785 36 L825 308 L862 152 L905 215 L970 215" fill="none" stroke={C} strokeWidth="7" strokeLinejoin="round" style={{filter:`drop-shadow(0 0 10px ${C})`}}/><path d="M0 215 L95 215 L135 190 L175 235 L220 215 L305 215 L350 180 L390 245 L435 215 L505 215 L550 190 L585 225 L625 215 L675 215 L710 122 L742 278 L785 36 L825 308 L862 152 L905 215 L970 215 L970 360 L0 360 Z" fill="url(#heart)"/></svg>
    <div style={{position:'absolute',left:680,top:20,width:170,height:170,borderRadius:'50%',background:'#020b11',border:`9px solid ${C}`,display:'grid',placeItems:'center',boxShadow:`0 0 35px ${C}`}}><div style={{textAlign:'center'}}><div style={{fontFamily:'Impact',fontSize:66}}>52’</div><div style={{fontFamily:'Arial Black',fontSize:13,letterSpacing:2,color:C}}>30%</div></div></div>
  </div>
  <div style={{position:'absolute',top:1240,left:90,right:90,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16}}>{[['PRESSION','5/5'],['xG','1,6 • 1,7'],['RYTHME','5/5']].map(([label,value])=><div key={label} style={{height:150,border:`1px solid ${C}`,borderRadius:20,background:'rgba(0,22,33,.86)',display:'grid',placeItems:'center',boxShadow:'0 0 22px rgba(8,220,255,.12)'}}><div style={{textAlign:'center'}}><div style={{fontFamily:'Arial Black',fontSize:16,letterSpacing:2,color:'#a8c4cf'}}>{label}</div><div style={{fontFamily:'Impact',fontSize:value.length>5?38:53,color:C,marginTop:9}}>{value}</div></div></div>)}</div>
  <div style={{position:'absolute',top:1450,left:80,right:80,textAlign:'center',fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:62}}>LE PLUS GROS BATTEMENT<br/><span style={{color:C}}>ARRIVE À 45–60</span></div>
</Shell>;
