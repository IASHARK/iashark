import React,{ReactNode} from 'react';
import {AbsoluteFill,CanvasImage,staticFile} from 'remotion';

const C='#08dcff',O='#ff7828';
const Shell=({children,kicker}:{children:ReactNode;kicker:string})=><AbsoluteFill style={{background:'#01070b',color:'#fff',fontFamily:'Arial,Helvetica,sans-serif',overflow:'hidden'}}>
  <CanvasImage src={staticFile('ads/iashark-ad-stadium-v1.png')} width={1080} height={1920} style={{objectFit:'cover',opacity:.48,scale:1.05}}/>
  <AbsoluteFill style={{background:'radial-gradient(circle at 50% 45%,rgba(0,185,235,.16),transparent 36%),linear-gradient(180deg,rgba(0,3,7,.35),rgba(0,8,14,.76) 55%,#010509 94%)'}}/>
  <div style={{position:'absolute',top:120,left:0,right:0,display:'grid',placeItems:'center'}}><CanvasImage src={staticFile('ads/iashark-logo.png')} width={300} height={84} style={{objectFit:'contain'}}/></div>
  <div style={{position:'absolute',top:228,left:250,right:250,height:44,border:`1px solid ${C}`,borderRadius:30,display:'grid',placeItems:'center',fontFamily:'Arial Black',fontSize:15,letterSpacing:4,color:C,background:'#001722cc'}}>{kicker}</div>
  {children}
  <div style={{position:'absolute',left:170,right:170,bottom:185,height:2,background:`linear-gradient(90deg,transparent,${C},transparent)`,boxShadow:`0 0 17px ${C}`}}/>
  <div style={{position:'absolute',bottom:105,left:0,right:0,textAlign:'center',fontFamily:'Arial Black',fontSize:40,letterSpacing:8,color:C,textShadow:`0 0 18px ${C}`}}>IASHARK.COM</div>
</AbsoluteFill>;

const Teams=()=> <div style={{position:'absolute',top:320,left:95,right:95,display:'flex',justifyContent:'space-between'}}>
  {[['logos/team-1118.png','PAYS-BAS'],['logos/team-25.png','ALLEMAGNE']].map(([src,name])=><div key={name} style={{width:250,textAlign:'center'}}><CanvasImage src={staticFile(src)} width={205} height={150} style={{objectFit:'contain',filter:'drop-shadow(0 12px 18px #000)'}}/><div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:34,marginTop:17}}>{name}</div></div>)}
</div>;

const BrickWall=({color,damage}:{color:string;damage:number})=><div style={{width:355,height:420,position:'relative',filter:`drop-shadow(0 0 25px ${color}44)`}}>
  {Array.from({length:24},(_,i)=><div key={i} style={{position:'absolute',width:76,height:55,left:(i%4)*82+((Math.floor(i/4)%2)*-18),top:Math.floor(i/4)*62,border:`2px solid ${color}`,background:`linear-gradient(145deg,${color}55,#06131b)`,borderRadius:6,opacity:i>23-damage?.15:1}}/>)}
  <svg width="355" height="420" style={{position:'absolute',inset:0}}><path d="M180 18 L157 88 L198 135 L151 190 L190 246 L146 322 L170 410" fill="none" stroke="#fff" strokeWidth="7" style={{filter:'drop-shadow(0 0 10px white)'}}/></svg>
</div>;

export const DefensiveWallConcept=()=> <Shell kicker="CONCEPT • LE MUR DÉFENSIF"><Teams/>
  <div style={{position:'absolute',top:555,left:60,right:60,textAlign:'center',fontFamily:'Impact',fontStyle:'italic',fontSize:80,lineHeight:.95}}>QUELLE DÉFENSE<br/><span style={{color:C}}>VA CÉDER ?</span></div>
  <div style={{position:'absolute',top:790,left:105,right:105,display:'flex',justifyContent:'space-between',alignItems:'center'}}><BrickWall color={O} damage={6}/><div style={{fontSize:92,filter:`drop-shadow(0 0 18px ${C})`}}>⚽</div><BrickWall color={C} damage={2}/></div>
  <div style={{position:'absolute',top:1240,left:90,right:90,display:'grid',gridTemplateColumns:'1fr 1fr',gap:26}}>{[['7','ATTAQUES SUBIES'],['4','ATTAQUES SUBIES']].map(([v,l],i)=><div key={i} style={{height:160,border:`1px solid ${i?C:O}`,borderRadius:22,background:'#00131ddd',display:'grid',placeItems:'center'}}><div style={{textAlign:'center'}}><div style={{fontFamily:'Impact',fontSize:78,color:i?C:O}}>{v}</div><div style={{fontFamily:'Arial Black',fontSize:15,letterSpacing:2}}>{l}</div></div></div>)}</div>
  <div style={{position:'absolute',top:1460,left:80,right:80,textAlign:'center',fontFamily:'Impact',fontStyle:'italic',fontSize:58}}>LE MUR SE FISSURE<br/><span style={{color:C}}>À CHAQUE OCCASION</span></div>
</Shell>;

export const ImpactZoneConcept=()=> <Shell kicker="CONCEPT • LA ZONE D’IMPACT"><Teams/>
  <div style={{position:'absolute',top:555,left:60,right:60,textAlign:'center',fontFamily:'Impact',fontStyle:'italic',fontSize:77}}>D’OÙ VIENDRA<br/><span style={{color:C}}>LE DANGER ?</span></div>
  <div style={{position:'absolute',top:755,left:170,width:740,height:780,border:'3px solid #ccebf3',background:'linear-gradient(180deg,#063326,#041b18)',boxShadow:'0 0 55px #00d8ff33',rotate:'0deg'}}>
    <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:3,background:'#ccebf399'}}/><div style={{position:'absolute',left:'50%',top:'50%',width:160,height:160,border:'3px solid #ccebf399',borderRadius:'50%',translate:'-80px -80px'}}/>
    <div style={{position:'absolute',left:250,top:0,width:240,height:120,border:'3px solid #ccebf399',borderTop:0}}/><div style={{position:'absolute',left:250,bottom:0,width:240,height:120,border:'3px solid #ccebf399',borderBottom:0}}/>
    {[{x:360,y:190,s:260,c:'#ff3b20'},{x:230,y:340,s:210,c:'#ffb000'},{x:520,y:570,s:300,c:C},{x:160,y:650,s:160,c:C}].map((h,i)=><div key={i} style={{position:'absolute',left:h.x-h.s/2,top:h.y-h.s/2,width:h.s,height:h.s,borderRadius:'50%',background:`radial-gradient(circle,${h.c}dd 0%,${h.c}66 28%,transparent 68%)`,mixBlendMode:'screen'}}/>)}
    <div style={{position:'absolute',left:310,top:140,fontSize:72}}>⚽</div><div style={{position:'absolute',left:500,top:535,fontSize:72}}>⚽</div>
  </div>
  <div style={{position:'absolute',top:1580,left:120,right:120,textAlign:'center',fontFamily:'Impact',fontStyle:'italic',fontSize:48}}>LA SURCHARGE APPARAÎT<br/><span style={{color:C}}>AVANT LE BUT</span></div>
</Shell>;

export const KeeperPressureConcept=()=> <Shell kicker="CONCEPT • LE GARDIEN SOUS PRESSION"><Teams/>
  <div style={{position:'absolute',top:560,left:60,right:60,textAlign:'center',fontFamily:'Impact',fontStyle:'italic',fontSize:76}}>COMBIEN DE TEMPS<br/><span style={{color:C}}>VA-T-IL TENIR ?</span></div>
  <div style={{position:'absolute',top:770,left:110,right:110,height:590,border:'10px solid #e9fbff',borderBottomWidth:18,background:'repeating-linear-gradient(90deg,transparent 0 68px,#bce8f322 70px),repeating-linear-gradient(0deg,transparent 0 65px,#bce8f322 67px)',boxShadow:`0 0 40px ${C}55,inset 0 0 90px #00151f`}}>
    <div style={{position:'absolute',left:'50%',bottom:30,translate:'-50% 0',fontSize:240,filter:`drop-shadow(0 0 26px ${C})`}}>🧤</div>
    {[[90,95],[610,115],[170,280],[535,365],[360,70]].map(([x,y],i)=><div key={i} style={{position:'absolute',left:x,top:y,fontSize:i===4?86:58,filter:i===4?`drop-shadow(0 0 22px ${O})`:`drop-shadow(0 0 12px ${C})`}}>⚽</div>)}
    <div style={{position:'absolute',left:390,top:125,width:5,height:270,background:`linear-gradient(${O},transparent)`,rotate:'27deg',boxShadow:`0 0 14px ${O}`}}/>
  </div>
  <div style={{position:'absolute',top:1410,left:90,right:90,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:18}}>{[['6','TIRS CADRÉS'],['4','ARRÊTS'],['2,1','xG SUBIS']].map(([v,l])=><div key={l} style={{height:150,border:`1px solid ${C}`,borderRadius:22,background:'#00131ddd',display:'grid',placeItems:'center'}}><div style={{textAlign:'center'}}><div style={{fontFamily:'Impact',fontSize:60,color:C}}>{v}</div><div style={{fontFamily:'Arial Black',fontSize:14,letterSpacing:1}}>{l}</div></div></div>)}</div>
</Shell>;

export const PlayerDuelConcept=()=> <Shell kicker="CONCEPT • LE DUEL QUI CHANGE LE MATCH"><Teams/>
  <div style={{position:'absolute',top:560,left:60,right:60,textAlign:'center',fontFamily:'Impact',fontStyle:'italic',fontSize:76}}>QUI VA FAIRE<br/><span style={{color:C}}>BASCULER LE MATCH ?</span></div>
  <div style={{position:'absolute',top:790,left:75,right:75,display:'grid',gridTemplateColumns:'1fr 110px 1fr',alignItems:'center'}}>
    {[{n:'9',c:O,v:['4 TIRS','0,8 xG','7 TOUCHES']},{n:'10',c:C,v:['5 TIRS','1,1 xG','9 TOUCHES']}].map((p,i)=><React.Fragment key={p.n}>{i===1?<div style={{fontFamily:'Impact',fontStyle:'italic',fontSize:66,textAlign:'center'}}>VS</div>:null}<div style={{height:520,border:`2px solid ${p.c}`,borderRadius:28,background:`radial-gradient(circle at 50% 35%,${p.c}44,#00111bcc 60%)`,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'space-around',boxShadow:`0 0 34px ${p.c}33`}}><div style={{width:210,height:250,clipPath:'polygon(24% 0,40% 12%,60% 12%,76% 0,100% 18%,84% 42%,84% 100%,16% 100%,16% 42%,0 18%)',background:`linear-gradient(140deg,${p.c},#07131b)`,display:'grid',placeItems:'center',fontFamily:'Impact',fontSize:130,textShadow:'0 8px 15px #000'}}>{p.n}</div>{p.v.map(x=><div key={x} style={{fontFamily:'Arial Black',fontSize:22,letterSpacing:1}}>{x}</div>)}</div></React.Fragment>)}
  </div>
  <div style={{position:'absolute',top:1395,left:135,right:135,height:150,border:`2px solid ${C}`,borderRadius:75,background:'#00131dee',display:'grid',placeItems:'center',boxShadow:`0 0 35px ${C}55`}}><div style={{textAlign:'center'}}><div style={{fontFamily:'Impact',fontSize:60,color:C}}>68’</div><div style={{fontFamily:'Arial Black',fontSize:15,letterSpacing:3}}>ZONE DE BASCULEMENT</div></div></div>
</Shell>;
