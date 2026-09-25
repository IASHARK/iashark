import {AbsoluteFill, CanvasImage, staticFile, useCurrentFrame} from 'remotion';

const cyan = '#09d9ff';
const Shell = ({children, title}: {children: React.ReactNode; title: string}) => (
  <AbsoluteFill style={{background: '#01070b', color: 'white', fontFamily: 'Arial, sans-serif', overflow: 'hidden'}}>
    <CanvasImage src={staticFile('ads/iashark-ad-stadium-v1.png')} width={1080} height={1920} style={{objectFit: 'cover', opacity: .3}}/>
    <AbsoluteFill style={{background: 'linear-gradient(180deg,rgba(0,4,8,.28),rgba(0,8,13,.78) 52%,#00070b 100%)'}}/>
    <div style={{position:'absolute',top:58,left:0,right:0,textAlign:'center'}}>
      <CanvasImage src={staticFile('ads/iashark-logo.png')} width={315} height={86} style={{objectFit:'contain'}}/>
      <div style={{fontSize:17,letterSpacing:8,color:'#a8c0cc',marginTop:-7}}>LECTURE IASHARK</div>
    </div>
    <div style={{position:'absolute',top:182,left:0,right:0,textAlign:'center',fontFamily:'Arial Black,Arial',fontSize:42,letterSpacing:2}}>{title}</div>
    {children}
    <div style={{position:'absolute',top:1700,left:0,right:0,textAlign:'center',fontFamily:'Arial Black,Arial',fontSize:34,letterSpacing:8,color:cyan,textShadow:'0 0 18px rgba(9,217,255,.75)'}}>IASHARK.COM</div>
  </AbsoluteFill>
);

const Teams = () => (
  <div style={{position:'absolute',top:270,left:90,right:90,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
    <div style={{textAlign:'center'}}><CanvasImage src={staticFile('logos/team-55.png')} width={225} height={225} style={{objectFit:'contain'}}/><div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:42}}>BRENTFORD</div></div>
    <div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:50,color:cyan,textShadow:'0 0 16px rgba(9,217,255,.8)'}}>VS</div>
    <div style={{textAlign:'center'}}><CanvasImage src={staticFile('logos/team-49.png')} width={225} height={225} style={{objectFit:'contain'}}/><div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:42}}>CHELSEA</div></div>
  </div>
);

const Clock = ({minute}: {minute:number}) => {
  const circumference = 2*Math.PI*61;
  return <div style={{width:150,height:150,position:'relative',display:'grid',placeItems:'center'}}><svg width="150" height="150" viewBox="0 0 150 150" style={{position:'absolute',rotate:'-90deg'}}><circle cx="75" cy="75" r="61" fill="#041019" stroke="#183847" strokeWidth="11"/><circle cx="75" cy="75" r="61" fill="none" stroke={cyan} strokeWidth="11" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference*(1-minute/90)} style={{filter:'drop-shadow(0 0 9px #09d9ff)'}}/></svg><div style={{zIndex:2,fontFamily:'Arial Black',fontSize:43}}>{minute}’</div></div>;
};

export const StoryboardTimeline = () => {
  const frame=useCurrentFrame(); const stage=Math.min(2,Math.floor(frame/100)); const minute=[14,47,81][stage];
  const title=['LE MATCH S’INSTALLE','LE PIC APPROCHE','LA FIN PEUT BASCULER'][stage];
  const note=['BRENTFORD ENTRE FORT DANS LE MATCH','LE DANGER MONTE AUTOUR DE LA PAUSE','CHELSEA PEUT FAIRE LA DIFFÉRENCE TARD'][stage];
  return <Shell title="LA LIGNE DU MATCH"><Teams/><div style={{position:'absolute',top:650,left:0,right:0,display:'grid',placeItems:'center'}}><Clock minute={minute}/></div>
    <div style={{position:'absolute',top:840,left:78,width:924,height:235}}><svg width="924" height="235"><path d="M0 190 C80 175 110 95 175 145 S290 210 360 125 S470 35 540 95 S650 185 730 120 S850 40 924 75" fill="none" stroke="#496b7b" strokeWidth="4"/><path d="M0 190 C80 175 110 95 175 145 S290 210 360 125 S470 35 540 95 S650 185 730 120 S850 40 924 75" fill="none" stroke={cyan} strokeWidth="7" strokeDasharray={`${924*minute/90} 1000`} style={{filter:'drop-shadow(0 0 8px #09d9ff)'}}/><line x1={924*minute/90} y1="15" x2={924*minute/90} y2="215" stroke={cyan} strokeWidth="3" strokeDasharray="8 8"/></svg><div style={{display:'flex',justifyContent:'space-between',fontWeight:900,fontSize:22}}><span>0’</span><span>45’</span><span>90’</span></div></div>
    <div style={{position:'absolute',top:1160,left:70,right:70,textAlign:'center'}}><div style={{fontSize:22,letterSpacing:7,color:'#9bbbc9',fontWeight:900}}>{minute<30?'0–30 MINUTES':minute<65?'30–60 MINUTES':'60–90 MINUTES'}</div><div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:72,marginTop:26,textShadow:'0 0 24px rgba(9,217,255,.22)'}}>{title}</div><div style={{fontFamily:'Arial Black',fontSize:30,color:cyan,marginTop:25,lineHeight:1.25}}>{note}</div></div>
  </Shell>;
};

export const StoryboardPitch = () => {
  const frame=useCurrentFrame(); const stage=Math.min(2,Math.floor(frame/100)); const minute=[18,52,78][stage]; const y=[420,270,120][stage];
  const title=['MATCH ÉQUILIBRÉ','CHELSEA GAGNE DU TERRAIN','BRENTFORD RECULE'][stage];
  return <Shell title="LE TERRAIN VIVANT"><Teams/><div style={{position:'absolute',top:640,left:465}}><Clock minute={minute}/></div>
    <div style={{position:'absolute',top:825,left:210,width:660,height:560,border:'4px solid rgba(185,238,255,.78)',borderRadius:28,background:'linear-gradient(180deg,rgba(9,217,255,.06),rgba(9,217,255,.015))',boxShadow:'inset 0 0 80px rgba(9,217,255,.08)'}}><div style={{position:'absolute',top:'50%',left:0,right:0,borderTop:'3px solid rgba(185,238,255,.55)'}}/><div style={{position:'absolute',top:'calc(50% - 75px)',left:'calc(50% - 75px)',width:150,height:150,border:'3px solid rgba(185,238,255,.55)',borderRadius:'50%'}}/><div style={{position:'absolute',left:45,right:45,top:y,height:115,borderRadius:80,background:'radial-gradient(ellipse,#09d9ff99,transparent 70%)',filter:'drop-shadow(0 0 25px #09d9ff)',transition:'none'}}/><div style={{position:'absolute',top:y+34,left:0,right:0,textAlign:'center',fontFamily:'Arial Black',fontSize:26}}>ZONE DE PRESSION</div></div>
    <div style={{position:'absolute',top:1460,left:55,right:55,textAlign:'center',fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:66}}>{title}</div><div style={{position:'absolute',top:1550,left:110,right:110,textAlign:'center',fontFamily:'Arial Black',fontSize:27,color:cyan}}>{stage===0?'LES DEUX ÉQUIPES SE TESTENT':stage===1?'LA PRESSION CHANGE DE CAMP':'LA ZONE DANGEREUSE SE RAPPROCHE'}</div>
  </Shell>;
};

export const StoryboardWindows = () => {
  const frame=useCurrentFrame(); const stage=Math.min(2,Math.floor(frame/100)); const periods=['12’–25’','40’–55’','75’–90’']; const names=['PREMIÈRE ALERTE','LE MATCH PEUT BASCULER','DERNIER DANGER'];
  return <Shell title="3 MOMENTS À SURVEILLER"><Teams/><div style={{position:'absolute',top:670,left:0,right:0,display:'grid',placeItems:'center'}}><Clock minute={[20,48,82][stage]}/></div>
    <div style={{position:'absolute',top:875,left:65,right:65,display:'flex',gap:18}}>{periods.map((p,i)=><div key={p} style={{flex:1,height:i===stage?250:205,marginTop:i===stage?0:22,borderRadius:25,border:`${i===stage?4:2}px solid ${i===stage?cyan:'#275265'}`,background:i===stage?'linear-gradient(180deg,#073249,#03151f)':'rgba(3,18,27,.92)',boxShadow:i===stage?'0 0 32px rgba(9,217,255,.32)':'none',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}><div style={{fontSize:18,letterSpacing:4,color:'#8eb4c5'}}>MOMENT {i+1}</div><div style={{fontFamily:'Arial Black',fontSize:i===stage?42:32,marginTop:13,color:i===stage?cyan:'white'}}>{p}</div><div style={{fontFamily:'Arial Black',fontSize:19,textAlign:'center',marginTop:17,padding:'0 12px'}}>{names[i]}</div></div>)}</div>
    <div style={{position:'absolute',top:1240,left:65,right:65,textAlign:'center'}}><div style={{fontFamily:'Impact,Arial Black',fontStyle:'italic',fontSize:76}}>{names[stage]}</div><div style={{height:7,width:620,background:'#183c4b',margin:'30px auto',borderRadius:5,overflow:'hidden'}}><div style={{height:'100%',width:`${[35,72,100][stage]}%`,background:cyan,boxShadow:'0 0 15px #09d9ff'}}/></div><div style={{fontFamily:'Arial Black',fontSize:29,color:cyan}}>{['LE PREMIER SIGNAL DU MATCH','LE PIC PRINCIPAL ENCADRE LA PAUSE','LA DERNIÈRE POUSSÉE PEUT DÉCIDER'][stage]}</div></div>
  </Shell>;
};
