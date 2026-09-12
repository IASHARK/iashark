export type Side = "home" | "away";
export type Goal = {minute:number; player:string; side:Side; assist?:string};
export type ApiAudit = {endpoint:string; available:boolean; cached:boolean; note?:string};
export type MatchData = {fixture:any; home:any; away:any; predictions:any|null; h2h:any[]; homeRecent:any[]; awayRecent:any[]; injuries:any[]; odds:any[]; homeStats:any|null; awayStats:any|null; lineups:any[]; players:any[]; audit:ApiAudit[]; retrievedAt:string};
export type Strength = {homeLambda:number; awayLambda:number; evidence:string[]};
export type SimResult = {homeGoals:number; awayGoals:number; halfHome:number; halfAway:number; goals:Goal[]};
export type Aggregates = {simulations:number; homeWin:number; draw:number; awayWin:number; btts:number; over25:number; under25:number; homeFirst:number; awayFirst:number; topScores:{score:string;pct:number}[]; topScorers:{player:string;pct:number}[]};
export type SimulationReport = {match:any; realData:any; model:any; aggregates:Aggregates; scenario:{score:string;goals:Goal[];timeline:any[];stats:any;manOfTheMatch:string}; apiAudit:any};
