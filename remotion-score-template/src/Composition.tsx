import {AbsoluteFill, CanvasImage, Composition, Easing, Interactive, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from "remotion";
import {generatedMatchProps as realInterProps} from "./generated-match";
import {generatedMatchProps as lilleBetisProps} from "./generated-lille-betis";
import {generatedMatchProps as portoCityProps} from "./generated-porto-city";
import {generatedMatchProps as aekLaskProps} from "./generated-aek-lask";
import {generatedMatchProps as bruggeVillaProps} from "./generated-brugge-villa";
import {generatedMatchProps as dortmundVillarrealProps} from "./generated-dortmund-villarreal";
import {uclSeptember9} from "./generated-ucl-2026-09-09";
import {kLeague1September9} from "./generated-kleague1-2026-09-09";
import {MontanteOne} from "./MontanteOne";
import {IasharkAdConcept} from "./IasharkAdConcept";
import {IasharkOrganicAd} from "./IasharkOrganicAd/IasharkOrganicAd";
import {ORGANIC_AD_DURATION} from "./IasharkOrganicAd/theme";
import {IasharkCityCampaign} from "./IasharkCityCampaign/IasharkCityCampaign";
import {CITY_CAMPAIGN_DURATION} from "./IasharkCityCampaign/theme";
import {IasharkModelVsMarketUK, UK_MVM_DURATION} from "./IasharkModelVsMarketUK";

export type GoalEvent = {minute: number; displayMinute?: string; player: string; side: "home" | "away"};
export type MatchCardProps = {homeTeam: string; awayTeam: string; homeLogo: string; awayLogo: string; goals: GoalEvent[]; accentColor: string};

const TeamCard = ({team,side,logo}:{team:string;side:"home"|"away";logo:string}) => <Interactive.Div name={`${side} team`} style={{width:315,height:360,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",position:"relative"}}><div style={{width:230,height:230,display:"grid",placeItems:"center"}}><CanvasImage src={logo.startsWith("http")?logo:staticFile(logo)} width={210} height={210} style={{objectFit:"contain",filter:"drop-shadow(0 16px 22px rgba(0,0,0,.82)) drop-shadow(0 0 10px rgba(8,217,255,.18))"}}/></div><div style={{position:"absolute",bottom:-20,width:340,height:67,borderRadius:18,border:"1px solid #087aa4",background:"linear-gradient(180deg,#092536,#04131e)",display:"grid",placeItems:"center",fontSize:team.length>15?26:31,fontWeight:900,textTransform:"uppercase",boxShadow:"0 12px 20px #0008",whiteSpace:"nowrap"}}>{team}</div></Interactive.Div>;

const teamHash=(name:string)=>[...name].reduce((sum,char,index)=>sum+char.charCodeAt(0)*(index+1),0);
const simulatedShotMinutes=(team:string,side:"home"|"away",goals:GoalEvent[])=>{
  const hash=teamHash(team)+(side==="home"?17:41);
  const target=10+(hash%7);
  const regular=Array.from({length:target},(_,index)=>{
    const center=((index+1)*90)/(target+1);
    const jitter=((hash*(index+3))%9)-4;
    return Math.max(1,Math.min(90,Math.round(center+jitter)));
  });
  return [...new Set([...regular,...goals.filter((goal)=>goal.side===side).map((goal)=>goal.minute)])].sort((a,b)=>a-b);
};

export const MatchCard: React.FC<MatchCardProps> = (props) => {
  const frame=useCurrentFrame(); const {fps,durationInFrames}=useVideoConfig();
  const matchDurationInFrames=durationInFrames-75;
  const halfTimePauseInFrames=5*fps;
  const playingFrames=matchDurationInFrames-halfTimePauseInFrames;
  const firstHalfDuration=Math.ceil(playingFrames/2);
  const secondHalfStart=firstHalfDuration+halfTimePauseInFrames;
  const minuteToFrame=(minute:number)=>minute<=45?((minute-1)/44)*(firstHalfDuration-1):secondHalfStart+((minute-46)/44)*(matchDurationInFrames-secondHalfStart-1);
  const entrance=spring({frame,fps,config:{damping:16,stiffness:90}});
  const pulse=interpolate(frame%60,[0,30,60],[.75,1,.75]);
  const matchMinute=frame<firstHalfDuration?Math.floor(interpolate(frame,[0,firstHalfDuration-1],[1,45.999],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})):frame<secondHalfStart?45:Math.min(90,Math.floor(interpolate(frame,[secondHalfStart,matchDurationInFrames-1],[46,91],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})));
  const elapsedGoals=props.goals.filter((goal)=>goal.minute<=matchMinute);
  const homeScore=elapsedGoals.filter((goal)=>goal.side==="home").length;
  const awayScore=elapsedGoals.filter((goal)=>goal.side==="away").length;
  const activeGoal=[...props.goals].reverse().find((goal)=>frame-minuteToFrame(goal.minute)>=0&&frame-minuteToFrame(goal.minute)<1.1*fps);
  const goalAge=activeGoal?frame-minuteToFrame(activeGoal.minute):0;
  const halfTimeAge=frame-firstHalfDuration;
  const finalHomeScore=props.goals.filter((goal)=>goal.side==="home").length;
  const finalAwayScore=props.goals.filter((goal)=>goal.side==="away").length;
  const progress=matchMinute/90;
  const circumference=2*Math.PI*82;
  const homeShots=simulatedShotMinutes(props.homeTeam,"home",props.goals).filter((minute)=>minute<=matchMinute).length;
  const awayShots=simulatedShotMinutes(props.awayTeam,"away",props.goals).filter((minute)=>minute<=matchMinute).length;
  const shotTotal=Math.max(1,homeShots+awayShots);
  const homeShotShare=homeShots/shotTotal;
  return <AbsoluteFill
    style={{
      background: "#020a10",
      color: "white",
      fontFamily: "Arial,Helvetica,sans-serif",
      overflow: "hidden",
    }}
  >
    <AbsoluteFill name="Black background with blue lights" style={{background:"radial-gradient(circle at 7% 62%,rgba(0,174,255,.34),transparent 12%),radial-gradient(circle at 93% 62%,rgba(0,174,255,.34),transparent 12%),radial-gradient(ellipse at 50% 78%,rgba(0,111,171,.18),transparent 34%),linear-gradient(180deg,#010306 0%,#02080d 58%,#000 100%)"}}/>
    {activeGoal?<AbsoluteFill name="Blue goal flash" style={{background:"#00cfff",opacity:interpolate(goalAge,[0,2,10,18],[0,.58,.16,0],{extrapolateLeft:"clamp",extrapolateRight:"clamp"}),mixBlendMode:"screen"}}/>:null}
    <div style={{position:"absolute",left:-120,right:-120,bottom:240,height:4,background:"#05cfff",boxShadow:"0 0 18px 5px #08bfe8,0 0 80px 22px #006ea066"}}/>
    <Interactive.Div name="Brand" style={{position:"absolute",top:92,left:0,right:0,textAlign:"center",opacity:interpolate(frame,[0,20],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"}),translate:interpolate(frame,[0,25],["0px -35px","0px 0px"],{extrapolateLeft:"clamp",extrapolateRight:"clamp",easing:Easing.out(Easing.cubic)})}}><div style={{fontFamily:"Impact,Arial Black",fontSize:77,letterSpacing:-2,textShadow:"0 4px 0 #0a0e13"}}><span style={{color:"#fff"}}>IA</span><span style={{color:props.accentColor}}>SHARK</span></div><div style={{fontSize:17,letterSpacing:13,marginTop:18,color:"#9db6c7"}}>FOOTBALL INSIGHTS</div></Interactive.Div>
    <div style={{position:"absolute",top:390,left:78,right:78,display:"flex",alignItems:"center",justifyContent:"space-between",opacity:entrance,scale:.92+entrance*.08}}><TeamCard team={props.homeTeam} logo={props.homeLogo} side="home"/><div style={{width:190,height:190,position:"relative",display:"grid",placeItems:"center"}}><svg width="190" height="190" viewBox="0 0 190 190" style={{position:"absolute",rotate:"-90deg",filter:"drop-shadow(0 0 10px #02cfee55)"}}><circle cx="95" cy="95" r="82" fill="rgba(1,10,17,.8)" stroke="#143344" strokeWidth="12"/><circle cx="95" cy="95" r="82" fill="none" stroke={props.accentColor} strokeWidth="12" strokeDasharray={circumference} strokeDashoffset={circumference*(1-progress)}/></svg><div style={{textAlign:"center",zIndex:1}}><div style={{fontSize:49,fontWeight:1000}}>{matchMinute}’</div><div style={{fontSize:18,color:"#9db6c7",marginTop:5}}>/ 90’</div></div></div><TeamCard team={props.awayTeam} logo={props.awayLogo} side="away"/></div>
    <Interactive.Div name="Score" style={{position:"absolute",top:830,left:105,right:105,height:260,border:"2px solid #087394",borderRadius:28,background:"linear-gradient(180deg,rgba(8,31,44,.9),rgba(2,14,23,.94))",display:"grid",gridTemplateColumns:"1fr 120px 1fr",alignItems:"center",textAlign:"center",fontSize:190,fontWeight:1000,boxShadow:"inset 0 0 42px #0385ab20,0 14px 35px #0009",scale:activeGoal?interpolate(goalAge,[0,8,18],[1,1.08,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp",easing:Easing.out(Easing.cubic)}):1}}><span>{homeScore}</span><span style={{fontSize:92,color:props.accentColor}}>–</span><span>{awayScore}</span></Interactive.Div>
    <Interactive.Div name="Simulated shots" style={{position:"absolute",top:1325,left:210,right:210,padding:"22px 28px 24px",borderRadius:18,border:"1px solid #075f7d",background:"linear-gradient(180deg,rgba(5,28,41,.88),rgba(1,12,20,.92))",boxShadow:"0 12px 30px #0008,inset 0 0 24px #008bb21c"}}>
      <div style={{display:"grid",gridTemplateColumns:"80px 1fr 80px",alignItems:"center",fontSize:31,fontWeight:1000}}><span>{homeShots}</span><span style={{textAlign:"center",fontSize:20,letterSpacing:6,color:"#9db6c7"}}>TIRS SIMULÉS</span><span style={{textAlign:"right"}}>{awayShots}</span></div>
      <div style={{height:14,display:"flex",marginTop:17,borderRadius:20,overflow:"hidden",background:"#102b39",boxShadow:"0 0 12px #00cfff33"}}><div style={{width:`${homeShotShare*100}%`,height:"100%",background:props.accentColor,boxShadow:`0 0 14px ${props.accentColor}`}}/><div style={{flex:1,height:"100%",background:"#1d5870"}}/></div>
    </Interactive.Div>
    {activeGoal?<Interactive.Div name="Goal announcement" style={{position:"absolute",top:1535,left:245,right:245,height:175,background:"linear-gradient(110deg,#06304a,#020e17 35%,#051d2e)",border:`3px solid ${props.accentColor}`,borderRadius:"25px 5px 25px 5px",boxShadow:`0 0 ${24*pulse}px ${props.accentColor}88,inset 0 0 30px #0085aa33`,display:"grid",placeItems:"center",opacity:interpolate(goalAge,[0,5,24,32],[0,1,1,0],{extrapolateLeft:"clamp",extrapolateRight:"clamp"}),translate:interpolate(goalAge,[0,8],["-130px 0px","0px 0px"],{extrapolateLeft:"clamp",extrapolateRight:"clamp",easing:Easing.out(Easing.back(1.4))})}}><div style={{fontFamily:"Impact,Arial Black",fontStyle:"italic",fontSize:84,lineHeight:1,color:"white",textShadow:`0 0 24px ${props.accentColor}`}}>BUT !</div></Interactive.Div>:null}
    {halfTimeAge>=0&&halfTimeAge<halfTimePauseInFrames?<Interactive.Div name="Half time" style={{position:"absolute",top:1145,left:300,right:300,height:125,display:"grid",placeItems:"center",borderTop:`3px solid ${props.accentColor}`,borderBottom:`3px solid ${props.accentColor}`,background:"linear-gradient(90deg,transparent,rgba(2,28,42,.92),transparent)",fontFamily:"Impact,Arial Black",fontSize:64,fontStyle:"italic",letterSpacing:5,textShadow:`0 0 24px ${props.accentColor}`,opacity:interpolate(halfTimeAge,[0,8,halfTimePauseInFrames-8,halfTimePauseInFrames-1],[0,1,1,0],{extrapolateLeft:"clamp",extrapolateRight:"clamp"}),translate:interpolate(halfTimeAge,[0,10],["0px 22px","0px 0px"],{extrapolateLeft:"clamp",extrapolateRight:"clamp",easing:Easing.out(Easing.cubic)})}}>MI-TEMPS</Interactive.Div>:null}
    <Interactive.Div name="Simulation notice" style={{position:"absolute",bottom:270,left:0,right:0,textAlign:"center",fontSize:16,fontWeight:400,letterSpacing:6,color:"#86a9ba",opacity:.78}}>BASÉ SUR 10 000 SIMULATIONS</Interactive.Div>
    <div style={{position:"absolute",bottom:92,left:0,right:0,textAlign:"center",color:"#9bb3c4",fontSize:18,letterSpacing:12}}>ANALYSER&nbsp;&nbsp; | &nbsp;&nbsp;ANTICIPER&nbsp;&nbsp; | &nbsp;&nbsp;GAGNER</div>
    <AbsoluteFill name="Final score" style={{background:"radial-gradient(circle at 50% 48%,#073044 0%,#020b12 35%,#000 78%)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",opacity:interpolate(frame,[durationInFrames-75,durationInFrames-62],[0,1],{extrapolateLeft:"clamp",extrapolateRight:"clamp"})}}>
      <div style={{fontFamily:"Impact,Arial Black",fontSize:86,letterSpacing:-2}}><span>IA</span><span style={{color:props.accentColor}}>SHARK</span></div>
      <div style={{fontSize:25,letterSpacing:9,color:"#9db6c7",marginTop:12}}>SCORE FINAL</div>
      <div style={{display:"grid",gridTemplateColumns:"270px 1fr 270px",alignItems:"center",gap:32,marginTop:80}}><div style={{width:270,display:"flex",flexDirection:"column",alignItems:"center"}}><div style={{width:180,height:180,display:"grid",placeItems:"center"}}><CanvasImage src={props.homeLogo.startsWith("http")?props.homeLogo:staticFile(props.homeLogo)} width={165} height={165} style={{objectFit:"contain"}}/></div><div style={{width:270,fontSize:props.homeTeam.length>14?22:25,fontWeight:900,lineHeight:1.15,marginTop:18,textAlign:"center",whiteSpace:"nowrap"}}>{props.homeTeam}</div></div><div style={{fontSize:132,fontWeight:1000,whiteSpace:"nowrap",textAlign:"center"}}>{finalHomeScore}<span style={{color:props.accentColor,margin:"0 26px"}}>–</span>{finalAwayScore}</div><div style={{width:270,display:"flex",flexDirection:"column",alignItems:"center"}}><div style={{width:180,height:180,display:"grid",placeItems:"center"}}><CanvasImage src={props.awayLogo.startsWith("http")?props.awayLogo:staticFile(props.awayLogo)} width={165} height={165} style={{objectFit:"contain"}}/></div><div style={{width:270,fontSize:props.awayTeam.length>14?22:25,fontWeight:900,lineHeight:1.15,marginTop:18,textAlign:"center",whiteSpace:"nowrap"}}>{props.awayTeam}</div></div></div>
      <div style={{width:520,height:2,background:`linear-gradient(90deg,transparent,${props.accentColor},transparent)`,boxShadow:`0 0 18px ${props.accentColor}`,marginTop:70}}/>
      <div style={{fontSize:28,fontWeight:800,letterSpacing:4,color:props.accentColor,marginTop:75}}>www.iashark.com</div>
    </AbsoluteFill>
  </AbsoluteFill>;
};

export const MyComposition=()=> <>
  <Composition id="IasharkModelVsMarketUK" component={IasharkModelVsMarketUK} durationInFrames={UK_MVM_DURATION} fps={30} width={1080} height={1920}/>
  <Composition id="IasharkCityCampaign" component={IasharkCityCampaign} durationInFrames={CITY_CAMPAIGN_DURATION} fps={30} width={1080} height={1920}/>
  <Composition id="IasharkOrganicAd" component={IasharkOrganicAd} durationInFrames={ORGANIC_AD_DURATION} fps={30} width={1080} height={1920}/>
  <Composition id="IasharkAdConcept" component={IasharkAdConcept} durationInFrames={1} fps={30} width={1080} height={1920}/>
  <Composition id="IasharkMontante1" component={MontanteOne} durationInFrames={420} fps={30} width={1080} height={1920}/>
  <Composition id="IasharkMatchGoal" component={MatchCard} durationInFrames={600} fps={30} width={1080} height={1920} defaultProps={realInterProps}/>
  <Composition id="LilleBetis" component={MatchCard} durationInFrames={600} fps={30} width={1080} height={1920} defaultProps={lilleBetisProps}/>
  <Composition id="PortoManchesterCity" component={MatchCard} durationInFrames={600} fps={30} width={1080} height={1920} defaultProps={portoCityProps}/>
  <Composition id="AekLask" component={MatchCard} durationInFrames={600} fps={30} width={1080} height={1920} defaultProps={aekLaskProps}/>
  <Composition id="BruggeAstonVilla" component={MatchCard} durationInFrames={600} fps={30} width={1080} height={1920} defaultProps={bruggeVillaProps}/>
  <Composition id="DortmundVillarreal" component={MatchCard} durationInFrames={600} fps={30} width={1080} height={1920} defaultProps={dortmundVillarrealProps}/>
  {uclSeptember9.map((match)=><Composition key={match.id} id={match.id} component={MatchCard} durationInFrames={600} fps={30} width={1080} height={1920} defaultProps={match.props}/>)}
  {kLeague1September9.map((match)=><Composition key={match.id} id={match.id} component={MatchCard} durationInFrames={600} fps={30} width={1080} height={1920} defaultProps={match.props}/>)}
</>;
