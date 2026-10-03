import {existsSync} from "node:fs";
import path from "node:path";
import {ApiSports} from "./api/apiSports";
import {collectMatchData} from "./data/collectMatchData";
import {buildStrength} from "./model/teamStrength";
import {runMonteCarlo} from "./model/monteCarlo";
import {selectScenario} from "./simulation/selectScenario";
import {writeReport} from "./output/report";

for(const candidate of [path.resolve("../.env"),path.resolve(".env")])if(existsSync(candidate)){try{process.loadEnvFile(candidate);}catch{}}
const key=process.env.API_SPORTS_KEY||process.env.APISPORTS_KEY;
if(!key)throw new Error("API_SPORTS_KEY absent.");

const matches=[
  {query:{date:"2026-09-08",home:"aek athens",away:"lask linz",leagueId:2},slug:"aek-lask"},
  {query:{date:"2026-09-08",home:"club brugge",away:"aston villa",leagueId:2},slug:"brugge-villa"},
  {query:{date:"2026-09-08",home:"borussia dortmund",away:"villarreal",leagueId:2},slug:"dortmund-villarreal"},
  {query:{date:"2026-09-08",home:"lille",away:"real betis",leagueId:2},slug:"lille-betis"},
  {query:{date:"2026-09-08",home:"fc porto",away:"manchester city",leagueId:2},slug:"porto-city"},
];

function selectVideoScore(samples:{homeGoals:number;awayGoals:number}[],variation=0){
  const counts=new Map<string,number>();
  for(const sample of samples){
    const total=sample.homeGoals+sample.awayGoals;
    if(total>=3&&total<=5)counts.set(`${sample.homeGoals}-${sample.awayGoals}`,(counts.get(`${sample.homeGoals}-${sample.awayGoals}`)??0)+1);
  }
  const plausible=[...counts].filter(([,count])=>count>=samples.length*.01).sort((a,b)=>b[1]-a[1]).slice(0,3);
  return plausible[variation%plausible.length]?.[0];
}

async function main(){for(const [index,match] of matches.entries()){
  const data=await collectMatchData(new ApiSports(key as string),match.query);
  const strength=buildStrength(data);
  const {aggregates,samples}=runMonteCarlo(data,strength,50000);
  const targetScore=selectVideoScore(samples,index)??aggregates.topScores[0].score;
  const scenario=selectScenario(data,samples,targetScore,aggregates.topScorers);
  await writeReport(data,strength,aggregates,scenario,{reportName:`${match.slug}-simulation.json`,generatedName:`generated-${match.slug}.ts`});
}}
main().catch((error)=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
