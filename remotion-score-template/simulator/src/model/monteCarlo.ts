import type {Aggregates,Goal,MatchData,SimResult,Strength,Timing15} from "../types";import {pickScorer,scorerCandidates} from "./playerModel";
// SIMULATION PAR TRANCHES DE 15 MIN (28/09/2026, iashark-simulation/RAPPORT-SIMULATION.md).
// Remplace la répartition fixe 13/16/19/17/16/19 % et les buts tirés d'avance sans effet du score.
// Chaque match est rejoué minute par minute avec les MÊMES paramètres que la page match
// (lib/simulation-15min-params.json) : profil réel des buts (plus de buts en fin de match, temps
// additionnel), effet du score du moment (l'équipe menée pousse, celle qui mène ralentit), cartons
// rouges. kappa (calé par le calcul exact lib/simulation-15min.js) garde les buts attendus de
// buildStrength. Chiffres affichables (calcul exact) : la chance d'au moins un but dans chaque tranche
// et l'équipe qui ouvre le score. Validation du mathématicien (28/09/2026) : pas de « tranche la plus
// chaude » propre au match (76e-fin pour 100 % des matchs), pas de score à la pause mis en avant (0-0
// dans 97 % des matchs), aucun verdict « but / pas de but » ni taux de réussite. Les scénarios tirés
// suivent les mêmes règles que le calcul exact.
import PARAMS from "../../../../lib/simulation-15min-params.json";
import SIM15 from "../../../../lib/simulation-15min.js";
const rng=(()=>{let a=0x1a5a2026;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})();
type Pas={caseIdx:number;bloc:number;frac:number;tranche:number;bande:number;minute:number;extra?:number};
const PAS:Pas[]=(()=>{const blocs:number[]=[];const push=(b:number,n:number)=>{for(let i=0;i<n;i++)blocs.push(b);};push(0,15);push(1,15);push(2,15);push(3,1);push(4,15);push(5,15);push(6,15);push(7,1);const sous=PARAMS.sous_pas_arrets as Record<string,number>;const out:Pas[]=[];blocs.forEach((b,c)=>{const n=sous[String(b)]??1;for(let k=0;k<n;k++){const minute=c<45?c+1:c===45?45:c<91?c:90;out.push({caseIdx:c,bloc:b,frac:1/n,tranche:PARAMS.tranche_de_bloc[b],bande:PARAMS.bande_de_bloc[b],minute,extra:(c===45||c===91)?k+1:undefined});}});return out;})();
const clip=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
export function timing15(strength:Strength,favori:"home"|"away"|null,ligueApi:number|undefined){const s=SIM15.simuler({lambdaH:strength.homeLambda,lambdaA:strength.awayLambda,favori,ligueApi});if(!s)return null;return{version:s.version,kappa:s.kappa as [number,number],tranches:s.tranches.map((x:any)=>({label:x.label,pct:Math.round(x.pBut*1000)/10})),premierBut:{home:Math.round(s.premierBut.home*1000)/10,away:Math.round(s.premierBut.away*1000)/10,aucun:Math.round(s.premierBut.aucun*1000)/10}};}
export function runMonteCarlo(data:MatchData,strength:Strength,n=50000){const scores=new Map<string,number>(),scorers=new Map<string,number>();let hw=0,d=0,aw=0,btts=0,over=0,hf=0,af=0;const samples:SimResult[]=[];const hp=scorerCandidates(data,data.home.id),ap=scorerCandidates(data,data.away.id);
  const favori=strength.homeLambda>strength.awayLambda?"home":strength.awayLambda>strength.homeLambda?"away":null;const ligueApi=Number(data.fixture?.league?.id)||undefined;
  const t15=timing15(strength,favori,ligueApi);if(!t15)throw new Error("Simulation 15 min impossible : buts attendus invalides.");
  const [kh,ka]=t15.kappa;const fH=favori==="home"?1:0,fA=favori==="away"?1:0;const fac=(PARAMS.rouges_facteur_ligue_api as Record<string,number>)[String(ligueApi)]??PARAMS.rouges_facteur_defaut;
  const baseH=PAS.map(p=>strength.homeLambda*Math.exp(PARAMS.alpha[p.bloc][0])*p.frac),baseA=PAS.map(p=>strength.awayLambda*Math.exp(PARAMS.alpha[p.bloc][1])*p.frac);
  const g1=PARAMS.gamma_rouge_propre,g2=PARAMS.gamma_rouge_adverse,B=PARAMS.beta,R=PARAMS.rouges_taux;
  for(let i=0;i<n;i++){let hg=0,ag=0,rh=0,ra=0,halfHome=0,halfAway=0;const goals:Goal[]=[];
    for(let t=0;t<PAS.length;t++){const p=PAS[t];const e=clip(hg-ag,-2,2);
      const h1=kh*baseH[t]*Math.exp(B[p.bande][fH][e+2]+g1*rh+g2*ra),h2=ka*baseA[t]*Math.exp(B[p.bande][fA][-e+2]+g1*ra+g2*rh);
      const b1=rng()<1-Math.exp(-h1),b2=rng()<1-Math.exp(-h2);const sg=Math.sign(hg-ag)+1;
      const r1=!rh&&rng()<Math.min(R[p.bloc][sg]*fac*p.frac,.5),r2=!ra&&rng()<Math.min(R[p.bloc][2-sg]*fac*p.frac,.5);
      if(b1){hg++;goals.push({minute:p.minute,extra:p.extra,player:pickScorer(hp,rng),side:"home"});}
      if(b2){ag++;goals.push({minute:p.minute,extra:p.extra,player:pickScorer(ap,rng),side:"away"});}
      if(r1)rh=1;if(r2)ra=1;if(t===PAS.findIndex(x=>x.caseIdx===46)-1){halfHome=hg;halfAway=ag;}}
    if(hg>ag)hw++;else if(hg===ag)d++;else aw++;if(hg&&ag)btts++;if(hg+ag>=3)over++;scores.set(`${hg}-${ag}`,(scores.get(`${hg}-${ag}`)??0)+1);
    for(const player of new Set(goals.map(g=>g.player)))scorers.set(player,(scorers.get(player)??0)+1);if(goals[0]?.side==="home")hf++;if(goals[0]?.side==="away")af++;
    if(samples.length<3000)samples.push({homeGoals:hg,awayGoals:ag,halfHome,halfAway,goals});}
  const pct=(x:number)=>Math.round(x/n*1000)/10;const topScores=[...scores].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([score,count])=>({score,pct:pct(count)}));const topScorers=[...scorers].filter(([p])=>p!=="Buteur non attribué").sort((a,b)=>b[1]-a[1]).slice(0,5).map(([player,count])=>({player,pct:pct(count)}));
  const timing:Timing15={version:t15.version,tranches:t15.tranches,premierBut:t15.premierBut};
  const aggregates:Aggregates={simulations:n,homeWin:pct(hw),draw:pct(d),awayWin:pct(aw),btts:pct(btts),over25:pct(over),under25:pct(n-over),homeFirst:pct(hf),awayFirst:pct(af),topScores,topScorers,timing};return{aggregates,samples};}
