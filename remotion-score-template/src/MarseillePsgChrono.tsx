import {AbsoluteFill, CanvasImage, Easing, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

const CYAN='#08d9ff';
const clamp={extrapolateLeft:'clamp' as const,extrapolateRight:'clamp' as const};

const periods=[
  {to:15,hx:.20,ax:.35,hs:1,as:1,hi:38,ai:64},
  {to:30,hx:.37,ax:.59,hs:1,as:2,hi:32,ai:46},
  {to:45,hx:.54,ax:.82,hs:2,as:3,hi:33,ai:46},
  {to:60,hx:.78,ax:1.25,hs:3,as:4,hi:45,ai:77},
  {to:75,hx:.96,ax:1.51,hs:3,as:5,hi:33,ai:49},
  {to:90,hx:1.27,ax:2.04,hs:4,as:6,hi:55,ai:95},
];
const goals=[{minute:14,side:'away'},{minute:59,side:'away'},{minute:86,side:'away'},{minute:90,side:'home'}] as const;

const valueAt=(minute:number,key:'hx'|'ax'|'hs'|'as'|'hi'|'ai')=>{
  const index=Math.min(5,Math.floor(Math.min(89.999,minute)/15));
  const start=index===0?0:periods[index-1][key];
  const end=periods[index][key];
  const local=(minute-index*15)/15;
  return start+(end-start)*Math.max(0,Math.min(1,local));
};

const Target=()=> <svg width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="22" fill="none" stroke="white" strokeWidth="5"/><circle cx="32" cy="32" r="10" fill="none" stroke={CYAN} strokeWidth="4"/><path d="M32 2v13M32 49v13M2 32h13M49 32h13" stroke="white" strokeWidth="4"/><circle cx="32" cy="32" r="4" fill={CYAN}/></svg>;
const Flame=()=> <svg width="64" height="76" viewBox="0 0 64 76"><path d="M35 2c4 17-8 21-6 34 3-8 9-11 14-19 12 14 18 29 10 44-8 15-32 18-43 2C-2 45 11 29 24 17c0 11 3 14 5 17C29 21 37 14 35 2Z" fill="white"/><path d="M33 44c7 7 8 16 2 22-5 5-13 2-15-4-3-8 5-13 10-20 0 6 1 8 3 10Z" fill={CYAN}/></svg>;
const Ball=({size=34}:{size?:number})=> <div style={{width:size,height:size,borderRadius:'50%',background:'#fff',display:'grid',placeItems:'center',fontFamily:'Arial,sans-serif',fontSize:size*.78,lineHeight:1,boxShadow:`0 0 ${size*.55}px ${CYAN}`}}>⚽</div>;

const CompactStats=({homeXg,awayXg,homeShots,awayShots,homeIntensity,awayIntensity}:{homeXg:number;awayXg:number;homeShots:number;awayShots:number;homeIntensity:number;awayIntensity:number})=>{
  const row=(logo:string,xg:number,shots:number,intensity:number)=><div style={{height:88,display:'grid',gridTemplateColumns:'62px 1fr 1fr 1fr',alignItems:'center',borderBottom:'1px solid rgba(190,230,245,.16)'}}>
    <CanvasImage src={staticFile(logo)} width={49} height={49} style={{objectFit:'contain',justifySelf:'center'}}/>
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:9}}><span style={{fontFamily:'Arial Black,Arial',fontSize:25,color:CYAN}}>xG</span><strong style={{fontFamily:'Impact,Arial Black',fontSize:41}}>{xg.toFixed(1).replace('.',',')}</strong></div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:8}}><div style={{scale:.6}}><Target/></div><strong style={{fontFamily:'Impact,Arial Black',fontSize:41}}>{Math.round(shots)}</strong></div>
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:7}}><div style={{scale:.54}}><Flame/></div><strong style={{fontFamily:'Impact,Arial Black',fontSize:41}}>{Math.round(intensity)}</strong></div>
  </div>;
  return <div style={{position:'absolute',top:1018,left:230,width:620,color:'white',zIndex:6,border:'1px solid rgba(8,217,255,.34)',borderRadius:20,overflow:'hidden',background:'linear-gradient(90deg,rgba(0,13,21,.88),rgba(2,28,40,.78),rgba(0,13,21,.88))',boxShadow:'0 0 28px rgba(8,217,255,.13)'}}>
    {row('logos/team-81.png',homeXg,homeShots,homeIntensity)}
    {row('logos/team-85.png',awayXg,awayShots,awayIntensity)}
  </div>;
};

export const MarseillePsgChrono=()=>{
  const frame=useCurrentFrame();
  const {durationInFrames}=useVideoConfig();
  const finalFrames=60;
  const finalStart=durationInFrames-finalFrames;
  const halfPause=60;
  const firstHalf=240;
  const secondStart=firstHalf+halfPause;
  const minute=frame<firstHalf?interpolate(frame,[0,firstHalf-1],[0,45],clamp):frame<secondStart?45:frame<finalStart?interpolate(frame,[secondStart,finalStart-1],[45,90],clamp):90;
  const displayMinute=Math.min(90,Math.floor(minute));
  const progress=minute/90;
  const ring=2*Math.PI*170;
  const isHalf=frame>=firstHalf&&frame<secondStart;
  const pulseBase=interpolate(frame%45,[0,22,44],[.72,1,.72],clamp);
  const minuteToFrame=(m:number)=>m<=45?(m/45)*(firstHalf-1):secondStart+((m-45)/45)*(finalStart-secondStart-1);
  const goalPulse=Math.max(...goals.map(g=>interpolate(Math.abs(frame-minuteToFrame(g.minute)),[0,3,15],[1,.7,0],clamp)));
  const flash=Math.max(0,goalPulse);
  const homeXg=valueAt(minute,'hx'),awayXg=valueAt(minute,'ax');
  const homeShots=valueAt(minute,'hs'),awayShots=valueAt(minute,'as');
  const homeIntensity=valueAt(minute,'hi'),awayIntensity=valueAt(minute,'ai');
  return <AbsoluteFill style={{background:'#01070b',color:'#fff',fontFamily:'Arial,Helvetica,sans-serif',overflow:'hidden'}}>
    <CanvasImage src={staticFile('ads/iashark-stadium-night-v2.png')} width={1080} height={1920} style={{objectFit:'cover',opacity:.58,scale:1.025}}/>
    <AbsoluteFill style={{background:'linear-gradient(180deg,rgba(0,4,8,.35),rgba(0,7,12,.62) 58%,rgba(0,5,9,.82))'}}/>
    <AbsoluteFill style={{background:CYAN,opacity:flash*.34,mixBlendMode:'screen'}}/>
    <div style={{position:'absolute',top:205,left:0,right:0,height:92,display:'grid',placeItems:'center',opacity:interpolate(frame,[0,18],[0,1],clamp)}}><CanvasImage src={staticFile('ads/iashark-logo.png')} width={330} height={92} style={{objectFit:'contain',filter:'drop-shadow(0 10px 18px #000)'}}/></div>
    <div style={{position:'absolute',top:350,left:70,right:70,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <CanvasImage src={staticFile('logos/team-81.png')} width={255} height={255} style={{objectFit:'contain',filter:'drop-shadow(0 15px 20px #000)'}}/>
      <CanvasImage src={staticFile('logos/team-85.png')} width={255} height={255} style={{objectFit:'contain',filter:'drop-shadow(0 15px 20px #000)'}}/>
    </div>
    <div style={{position:'absolute',top:545,left:305,width:470,height:470,display:'grid',placeItems:'center',scale:1+goalPulse*.065}}>
      <svg width="470" height="470" viewBox="0 0 470 470" style={{position:'absolute',rotate:'-90deg',filter:`drop-shadow(0 0 ${14+18*pulseBase}px rgba(8,217,255,.5))`}}><circle cx="235" cy="235" r="205" fill="rgba(1,8,13,.74)" stroke="rgba(96,153,174,.26)" strokeWidth="2"/><circle cx="235" cy="235" r="170" fill="rgba(0,5,9,.94)" stroke="#153543" strokeWidth="20"/><circle cx="235" cy="235" r="170" fill="none" stroke={CYAN} strokeWidth="20" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring*(1-progress)}/><circle cx="235" cy="235" r="190" fill="none" stroke="#dffaff" strokeWidth="3" strokeDasharray="3 16" opacity=".72"/></svg>
      <div style={{position:'absolute',inset:0,zIndex:2,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'Arial Black,Arial',fontSize:142,lineHeight:1,fontVariantNumeric:'tabular-nums',letterSpacing:-6,paddingBottom:8,textAlign:'center',textShadow:`0 0 ${24*pulseBase}px rgba(8,217,255,.58)`}}>{displayMinute}’</div>
    </div>
    <div style={{position:'absolute',top:560,left:320,width:440,height:440,borderRadius:'50%',border:`3px solid ${CYAN}`,opacity:goalPulse*.48,scale:.72+goalPulse*.55,filter:`drop-shadow(0 0 ${42*pulseBase}px ${CYAN})`}}/>
    <CompactStats homeXg={homeXg} awayXg={awayXg} homeShots={homeShots} awayShots={awayShots} homeIntensity={homeIntensity} awayIntensity={awayIntensity}/>
    <div style={{position:'absolute',top:1245,left:90,right:90,height:95}}>
      <div style={{position:'absolute',top:30,left:0,right:0,height:7,borderRadius:8,background:'rgba(190,220,232,.58)'}}/><div style={{position:'absolute',top:30,left:0,width:`${progress*100}%`,height:7,borderRadius:8,background:CYAN,boxShadow:`0 0 ${12+10*pulseBase}px ${CYAN}`}}/>
      {[0,15,30,45,60,75,90].map(m=><div key={m} style={{position:'absolute',left:`${m/90*100}%`,top:18,translate:'-50% 0'}}><div style={{width:2,height:28,background:m<=minute?CYAN:'#d8eef5'}}/><div style={{fontFamily:'Arial Black',fontSize:23,marginTop:13,translate:'-50% 0',marginLeft:1}}>{m}</div></div>)}
      <div style={{position:'absolute',left:`${progress*100}%`,top:18,translate:'-15px 0',width:30,height:30,borderRadius:'50%',background:'#fff',border:`6px solid ${CYAN}`,boxShadow:`0 0 18px ${CYAN}`}}/>
      {goals.map((g,i)=>{const visible=minute>=g.minute;return <div key={i} style={{position:'absolute',left:`${g.minute/90*100}%`,top:14,translate:'-18px 0',opacity:visible?1:0,scale:visible?1:0,zIndex:3}}><Ball size={36}/></div>})}
    </div>
    {isHalf?<div style={{position:'absolute',top:1325,left:360,right:360,height:5,background:CYAN,boxShadow:`0 0 ${25*pulseBase}px ${CYAN}`,opacity:interpolate(frame,[firstHalf,firstHalf+10,secondStart-10,secondStart],[0,1,1,0],clamp)}}/>:null}
    <div style={{position:'absolute',top:1450,left:0,right:0,zIndex:8,textAlign:'center',fontFamily:'Arial Black,Arial',fontSize:43,fontWeight:1000,letterSpacing:5,color:'#fff',textShadow:`0 0 ${18*pulseBase}px ${CYAN},0 5px 12px #000`}}>IASHARK.COM</div>
    {frame>=finalStart?<AbsoluteFill style={{background:'radial-gradient(circle at 50% 45%,#063147 0%,#020b11 34%,#000 76%)',zIndex:100,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
      <CanvasImage src={staticFile('ads/iashark-logo.png')} width={610} height={170} style={{objectFit:'contain',scale:interpolate(frame,[finalStart,finalStart+20],[.82,1],{...clamp,easing:Easing.out(Easing.back(1.25))}),filter:`drop-shadow(0 0 ${22*pulseBase}px rgba(8,217,255,.55))`}}/>
      <div style={{width:600,height:3,background:`linear-gradient(90deg,transparent,${CYAN},transparent)`,boxShadow:`0 0 18px ${CYAN}`,marginTop:55}}/>
      <div style={{fontFamily:'Arial Black',fontSize:38,letterSpacing:10,color:CYAN,marginTop:70}}>IASHARK.COM</div>
    </AbsoluteFill>:null}
  </AbsoluteFill>;
};
