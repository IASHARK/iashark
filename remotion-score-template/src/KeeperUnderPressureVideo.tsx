import React from 'react';
import {AbsoluteFill,CanvasImage,Easing,interpolate,staticFile,useCurrentFrame,useVideoConfig} from 'remotion';

const C='#08dcff',O='#ff6a24';
const shares=[22,4,4,30,22,17];
const labels=['0–15','15–30','30–45','45–60','60–75','75–90'];
const shots=[1,1,2,4,5,6];
const saves=[1,1,2,3,4,4];
const shotFrames=[48,148,244,320,360,421,510,558];

const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));

export const KeeperUnderPressureVideo=()=>{
  const frame=useCurrentFrame(); const {durationInFrames}=useVideoConfig();
  const intro=25, outro=55;
  const matchEnd=durationInFrames-outro;
  const progress=clamp((frame-intro)/(matchEnd-intro));
  const minute=Math.min(90,Math.max(0,Math.floor(progress*91)));
  const zone=Math.min(5,Math.floor(minute/15));
  const activeShot=shotFrames.map((f,i)=>({age:frame-f,i})).filter(x=>x.age>=0&&x.age<34).sort((a,b)=>a.age-b.age)[0];
  const shotAge=activeShot?.age??99;
  const shotScale=activeShot?interpolate(shotAge,[0,18,30],[.25,1.3,.72],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.out(Easing.cubic)}):0;
  const flash=activeShot?interpolate(shotAge,[0,5,15,32],[0,.62,.18,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}):0;
  const pulse=1+Math.sin(frame*.32)*.025+(activeShot?interpolate(shotAge,[0,8,22],[0,.1,0],{extrapolateRight:'clamp'}):0);
  const currentShots=shots[zone],currentSaves=saves[zone];
  const danger=shares[zone];
  const phaseTitle=zone===3?'LE GARDIEN EST ASSIÉGÉ':zone>=4?'LA PRESSION NE RETOMBE PLUS':zone===0?'PREMIER TEST POUR LE GARDIEN':'LA MENACE SE RAPPROCHE';
  const finalOpacity=interpolate(frame,[durationInFrames-55,durationInFrames-30],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  return <AbsoluteFill style={{background:'#01070b',color:'#fff',fontFamily:'Arial,Helvetica,sans-serif',overflow:'hidden'}}>
    <CanvasImage src={staticFile('ads/iashark-ad-stadium-v1.png')} width={1080} height={1920} style={{objectFit:'cover',opacity:.5,scale:1.06}}/>
    <AbsoluteFill style={{background:'radial-gradient(circle at 50% 48%,rgba(0,193,244,.18),transparent 38%),linear-gradient(180deg,rgba(0,3,7,.38),rgba(0,8,14,.74) 58%,#010509 95%)'}}/>
    <AbsoluteFill style={{background:C,opacity:flash,mixBlendMode:'screen'}}/>
    <div style={{position:'absolute',top:105,left:0,right:0,display:'grid',placeItems:'center',scale:interpolate(frame,[0,16],[.75,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.out(Easing.back(1.6))})}}><CanvasImage src={staticFile('ads/iashark-logo.png')} width={300} height={84} style={{objectFit:'contain'}}/></div>
    <div style={{position:'absolute',top:220,left:260,right:260,height:42,border:`1px solid ${C}`,borderRadius:24,display:'grid',placeItems:'center',fontFamily:'Arial Black',fontSize:14,letterSpacing:4,color:C,background:'#001722dd'}}>GARDIEN SOUS PRESSION</div>

    <div style={{position:'absolute',top:310,left:90,right:90,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      {[['logos/team-1118.png','PAYS-BAS'],['logos/team-25.png','ALLEMAGNE']].map(([src,name])=><div key={name} style={{display:'flex',alignItems:'center',gap:20}}><CanvasImage src={staticFile(src)} width={160} height={115} style={{objectFit:'contain'}}/><div style={{fontFamily:'Impact',fontStyle:'italic',fontSize:31}}>{name}</div></div>)}
    </div>

    <div style={{position:'absolute',top:465,left:0,right:0,textAlign:'center',fontFamily:'Impact',fontStyle:'italic',fontSize:60,lineHeight:1}}>{phaseTitle.split(' ').slice(0,-2).join(' ')}<br/><span style={{color:C}}>{phaseTitle.split(' ').slice(-2).join(' ')}</span></div>

    <div style={{position:'absolute',top:610,left:420,width:240,height:240,borderRadius:'50%',border:`13px solid #153743`,background:'#020c12',display:'grid',placeItems:'center',scale:pulse,boxShadow:`0 0 ${28+danger}px ${C}66,inset 0 0 35px #000`}}>
      <svg width="240" height="240" style={{position:'absolute',rotate:'-90deg'}}><circle cx="120" cy="120" r="102" fill="none" stroke={C} strokeWidth="13" strokeLinecap="round" strokeDasharray="641" strokeDashoffset={641*(1-progress)} style={{filter:`drop-shadow(0 0 10px ${C})`}}/></svg>
      <div style={{textAlign:'center',zIndex:2}}><div style={{fontFamily:'Impact',fontSize:78}}>{minute}’</div><div style={{fontFamily:'Arial Black',fontSize:12,letterSpacing:3,color:C}}>ZONE {zone+1}/6</div></div>
    </div>

    <div style={{position:'absolute',top:875,left:95,right:95,height:465,border:'9px solid #e8fbff',borderBottomWidth:16,background:'repeating-linear-gradient(90deg,transparent 0 70px,#bce8f31e 72px),repeating-linear-gradient(0deg,transparent 0 65px,#bce8f31e 67px)',boxShadow:`0 0 ${35+danger}px ${C}55,inset 0 0 110px #00111d`}}>
      <div style={{position:'absolute',left:'50%',bottom:20,width:150,height:220,translate:'-75px 0',scale:1+(danger/100)*.15}}>
        <div style={{position:'absolute',left:48,top:0,width:55,height:55,borderRadius:'50%',background:'#e3f6ff',boxShadow:`0 0 18px ${C}`}}/>
        <div style={{position:'absolute',left:35,top:52,width:82,height:122,background:`linear-gradient(${C},#03647d)`,clipPath:'polygon(18% 0,82% 0,100% 100%,0 100%)'}}/>
        <div style={{position:'absolute',left:-15,top:65,width:75,height:23,background:C,rotate:activeShot?'38deg':'-18deg',transformOrigin:'right center'}}/><div style={{position:'absolute',right:-15,top:65,width:75,height:23,background:C,rotate:activeShot?'-38deg':'18deg',transformOrigin:'left center'}}/>
        <div style={{position:'absolute',left:35,bottom:0,width:25,height:75,background:'#dff9ff',rotate:'8deg'}}/><div style={{position:'absolute',right:33,bottom:0,width:25,height:75,background:'#dff9ff',rotate:'-8deg'}}/>
      </div>
      {activeShot?<div style={{position:'absolute',left:[120,650,260,520,350,710,170,600][activeShot.i],top:[80,120,180,50,135,210,65,160][activeShot.i],fontSize:82,scale:shotScale,filter:`drop-shadow(0 0 20px ${activeShot.i===3||activeShot.i===7?O:C})`}}>⚽</div>:null}
      {activeShot?<div style={{position:'absolute',left:'50%',top:'48%',width:500,height:5,translate:'-250px 0',rotate:`${[-24,21,-10,13,-17,24,-20,15][activeShot.i]}deg`,background:`linear-gradient(90deg,transparent,${activeShot.i===3||activeShot.i===7?O:C},transparent)`,opacity:interpolate(shotAge,[0,8,24],[0,.9,0],{extrapolateRight:'clamp'}),boxShadow:`0 0 16px ${C}`}}/>:null}
      <div style={{position:'absolute',left:0,right:0,bottom:10,textAlign:'center',fontFamily:'Arial Black',fontSize:14,letterSpacing:4,color:'#d9f8ff'}}>RÉSISTANCE DU GARDIEN</div>
    </div>

    <div style={{position:'absolute',top:1385,left:90,right:90,display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:18}}>{[[currentShots,'TIRS CADRÉS'],[currentSaves,'ARRÊTS'],[(0.3+zone*.28).toFixed(1).replace('.',','),'xG SUBIS']].map(([v,l],i)=><div key={String(l)} style={{height:145,border:`1px solid ${i===2?O:C}`,borderRadius:22,background:'#00131dee',display:'grid',placeItems:'center',scale:activeShot?interpolate(shotAge,[0,7,19],[1,1.07,1],{extrapolateRight:'clamp'}):1,boxShadow:activeShot?`0 0 25px ${i===2?O:C}66`:'none'}}><div style={{textAlign:'center'}}><div style={{fontFamily:'Impact',fontSize:58,color:i===2?O:C}}>{v}</div><div style={{fontFamily:'Arial Black',fontSize:13,letterSpacing:2}}>{l}</div></div></div>)}</div>

    <div style={{position:'absolute',top:1570,left:88,right:88}}><div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:8}}>{shares.map((s,i)=><div key={i} style={{height:76,border:`1px solid ${i===zone?C:'#1a4658'}`,borderRadius:12,background:i===zone?'#003144':'#001019cc',display:'grid',placeItems:'center',boxShadow:i===zone?`0 0 20px ${C}88`:'none',scale:i===zone?1.07:1}}><div style={{textAlign:'center'}}><div style={{fontFamily:'Impact',fontSize:28,color:i===zone?C:'#fff'}}>{s}%</div><div style={{fontSize:11,fontWeight:900,color:'#8fb0bf'}}>{labels[i]}</div></div></div>)}</div></div>
    <div style={{position:'absolute',left:170,right:170,bottom:180,height:2,background:`linear-gradient(90deg,transparent,${C},transparent)`,boxShadow:`0 0 17px ${C}`}}/><div style={{position:'absolute',bottom:100,left:0,right:0,textAlign:'center',fontFamily:'Arial Black',fontSize:39,letterSpacing:8,color:C,textShadow:`0 0 18px ${C}`}}>IASHARK.COM</div>

    <AbsoluteFill style={{background:'radial-gradient(circle at 50% 45%,#07394d,#01080d 52%,#000)',opacity:finalOpacity,display:'grid',placeItems:'center'}}><div style={{textAlign:'center',scale:interpolate(frame,[durationInFrames-55,durationInFrames-20],[.75,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp',easing:Easing.out(Easing.back(1.4))})}}><CanvasImage src={staticFile('ads/iashark-logo.png')} width={430} height={125} style={{objectFit:'contain'}}/><div style={{fontFamily:'Impact',fontStyle:'italic',fontSize:72,marginTop:60}}>LE GARDIEN A TENU<br/><span style={{color:C}}>4 FOIS SUR 6</span></div><div style={{fontFamily:'Arial Black',fontSize:34,letterSpacing:8,color:C,marginTop:100}}>IASHARK.COM</div></div></AbsoluteFill>
  </AbsoluteFill>;
};
