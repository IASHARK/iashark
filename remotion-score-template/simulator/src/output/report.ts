import {access,mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import type {MatchData,SimulationReport,Strength} from "../types";

type OutputOptions={reportName?:string;generatedName?:string};

async function localLogo(team:any){
  const relative=`logos/team-${team.id}.png`;
  const target=path.resolve("public",relative);
  try{await access(target);return relative;}catch{}
  const response=await fetch(team.logo);
  if(!response.ok)return team.logo;
  await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target,new Uint8Array(await response.arrayBuffer()));
  return relative;
}

export async function writeReport(data:MatchData,strength:Strength,aggregates:any,scenario:any,options:OutputOptions={}){
  const report:SimulationReport={match:{fixtureId:data.fixture.fixture.id,date:data.fixture.fixture.date,venue:data.fixture.fixture.venue,league:data.fixture.league,home:data.home,away:data.away},realData:{recentMatches:{home:data.homeRecent.length,away:data.awayRecent.length},injuries:data.injuries.length,lineups:data.lineups.length?"official":"estimated-or-unavailable"},model:{strength,disclaimer:"Prédiction statistique, pas un résultat réel."},aggregates,scenario,apiAudit:{retrievedAt:data.retrievedAt,endpoints:data.audit}};
  const out=path.resolve("public",options.reportName??"match-simulation.json");
  await mkdir(path.dirname(out),{recursive:true});
  await writeFile(out,JSON.stringify(report,null,2),"utf8");
  const props={homeTeam:data.home.name,awayTeam:data.away.name,homeLogo:await localLogo(data.home),awayLogo:await localLogo(data.away),goals:scenario.goals,accentColor:"#08d9ff"};
  await writeFile(path.resolve("src",options.generatedName??"generated-match.ts"),`import type {MatchCardProps} from "./Composition";\nexport const generatedMatchProps = ${JSON.stringify(props,null,2)} satisfies MatchCardProps;\n`,"utf8");
  console.log(`${data.home.name}–${data.away.name}: ${aggregates.simulations} simulations — scénario ${scenario.score}`);
  return report;
}
