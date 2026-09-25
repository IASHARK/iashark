import {AbsoluteFill, CanvasImage, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';

const C='#09d9ff';
const clamp={extrapolateLeft:'clamp' as const,extrapolateRight:'clamp' as const};

export const IasharkChronoPure=()=>{
  const frame=useCurrentFrame();
  const {durationInFrames}=useVideoConfig();
  const minute=Math.min(90,Math.floor(interpolate(frame,[0,durationInFrames-1],[0,90.99],clamp)));
  const progress=minute/90;
  const pulse=interpolate(frame%45,[0,22,44],[.72,1,.72],clamp);
  const ring=2*Math.PI*178;
  const sweep=frame*1.35;
  return <AbsoluteFill style={{background:'#01070b',color:'#fff',overflow:'hidden',fontFamily:'Arial Black,Arial,sans-serif'}}>
    <CanvasImage src={staticFile('ads/iashark-ad-stadium-v1.png')} width={1080} height={1920} style={{objectFit:'cover',opacity:.33,scale:1.04}}/>
    <AbsoluteFill style={{background:'radial-gradient(circle at 50% 43%,rgba(9,217,255,.12),transparent 25%),linear-gradient(180deg,rgba(0,5,9,.2),rgba(0,8,13,.86) 70%,#00080c)'}}/>
    {Array.from({length:18},(_,i)=><div key={i} style={{position:'absolute',left:540+Math.cos((i*20+sweep)*Math.PI/180)*430,top:870+Math.sin((i*20+sweep)*Math.PI/180)*430,width:i%3===0?7:3,height:i%3===0?7:3,borderRadius:'50%',background:C,opacity:.18+(i%4)*.08,boxShadow:`0 0 ${8+i%3*5}px ${C}`}}/>)}
    <div style={{position:'absolute',top:62,left:0,right:0,textAlign:'center'}}><CanvasImage src={staticFile('ads/iashark-logo.png')} width={315} height={86} style={{objectFit:'contain'}}/></div>
    <div style={{position:'absolute',top:210,left:105,right:105,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
      <div style={{textAlign:'center',width:300}}><CanvasImage src={staticFile('logos/team-55.png')} width={230} height={230} style={{objectFit:'contain',filter:'drop-shadow(0 15px 18px #000)'}}/><div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:44}}>BRENTFORD</div></div>
      <div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:50,color:C,textShadow:`0 0 18px ${C}`}}>VS</div>
      <div style={{textAlign:'center',width:300}}><CanvasImage src={staticFile('logos/team-49.png')} width={230} height={230} style={{objectFit:'contain',filter:'drop-shadow(0 15px 18px #000)'}}/><div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:44}}>CHELSEA</div></div>
    </div>
    <div style={{position:'absolute',top:590,left:0,right:0,height:650,display:'grid',placeItems:'center'}}>
      <div style={{width:470,height:470,position:'relative',display:'grid',placeItems:'center'}}>
        <svg width="470" height="470" viewBox="0 0 470 470" style={{position:'absolute',rotate:'-90deg',filter:`drop-shadow(0 0 ${22*pulse}px rgba(9,217,255,.55))`}}>
          <circle cx="235" cy="235" r="215" fill="rgba(1,8,13,.7)" stroke="rgba(38,83,102,.36)" strokeWidth="2"/>
          <circle cx="235" cy="235" r="178" fill="rgba(0,7,12,.92)" stroke="#153b4b" strokeWidth="20"/>
          <circle cx="235" cy="235" r="178" fill="none" stroke={C} strokeWidth="20" strokeLinecap="round" strokeDasharray={ring} strokeDashoffset={ring*(1-progress)}/>
          <circle cx="235" cy="235" r="205" fill="none" stroke={C} strokeWidth="3" strokeDasharray="4 19" opacity=".52"/>
        </svg>
        <div style={{zIndex:2,textAlign:'center'}}><div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:150,lineHeight:.9,letterSpacing:-5,textShadow:`0 0 ${18*pulse}px rgba(9,217,255,.48)`}}>{minute}’</div><div style={{width:155,height:5,margin:'30px auto 0',background:C,boxShadow:`0 0 17px ${C}`}}/></div>
        <div style={{position:'absolute',width:525,height:2,background:`linear-gradient(90deg,transparent,${C},transparent)`,rotate:`${sweep}deg`,opacity:.34}}/>
      </div>
    </div>
    <div style={{position:'absolute',top:1310,left:80,right:80,height:8,borderRadius:20,background:'#254653'}}><div style={{height:'100%',width:`${progress*100}%`,background:C,borderRadius:20,boxShadow:`0 0 ${15*pulse}px ${C}`}}/></div>
    {[0,15,30,45,60,75,90].map((m)=><div key={m} style={{position:'absolute',top:1342,left:80+(m/90)*920,translate:'-50% 0',fontFamily:'Arial',fontWeight:900,fontSize:m===minute?26:19,color:m<=minute?'#fff':'#66828e'}}>{m}</div>)}
    <div style={{position:'absolute',top:1470,left:0,right:0,display:'flex',justifyContent:'center',gap:28}}>{Array.from({length:6},(_,i)=><div key={i} style={{width:112,height:16,transform:'skewX(-18deg)',background:i<=Math.min(5,Math.floor(minute/15))?C:'#163542',boxShadow:i<=Math.min(5,Math.floor(minute/15))?`0 0 ${12*pulse}px ${C}`:'none'}}/> )}</div>
    <div style={{position:'absolute',top:1585,left:0,right:0,textAlign:'center',fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:54,letterSpacing:9,color:'#dff9ff',opacity:.85}}>0 — 90</div>
    <div style={{position:'absolute',top:1700,left:0,right:0,textAlign:'center',fontSize:35,letterSpacing:9,color:C,textShadow:`0 0 16px ${C}`}}>IASHARK.COM</div>
  </AbsoluteFill>;
};
