(function(root,factory){
  var api=factory(root,typeof require==='function'?function(){ try{ return require('./insights.js'); }catch(e){ return null; } }:null,
    typeof require==='function'?function(){ try{ return require('./team-names.js'); }catch(e){ return null; } }:null);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.IasharkButeursDuJour=api;
})(typeof window!=='undefined'?window:null,function(root,loadInsights,loadTeamNames){
'use strict';
// BUTEURS DU JOUR (19/09/2026) : les 3 joueurs les plus susceptibles de
// marquer sur une journee (heure de Paris), toutes competitions confondues.
//
// AUCUN nouveau modele ici. Chaque match passe par le calcul valide de la
// carte « Marches joueurs » de la page match (lib/insights.js#scorerModel,
// methode et verification hors echantillon decrites la-bas), avec EXACTEMENT
// les memes entrees que lib/match-view-model.js#prelineupScorers :
//   - player_history.home/away (feuilles des derniers matchs de chaque equipe),
//   - current_squads.home/away (effectif actuel, joueurs partis exclus),
//   - injuries (absents annonces, par equipe),
//   - lambda_h/lambda_a du moteur SEULEMENT si sa sortie est fiable
//     (lib/display-data.js#hasReliableModelOutput) ; sinon repli du modele
//     sur la moyenne recente de l'equipe.
// Seuls les candidats « shown » (titulaires probables, cf. scorerModel) sont
// retenus : jamais un remplacant, jamais un absent, jamais un joueur parti.
//
// Deux usages :
//   1. pipeline (.github/workflows/update-data.yml) : buildDailyFile() ecrit le
//      fichier PUBLIC buteurs-du-jour.json. Decision du proprietaire
//      (19/09/2026, tunnel de vente) : un non-abonne, meme inscrit, ne doit
//      PAS savoir qui sont les 3 joueurs. Le fichier ne porte donc que le
//      match, la competition, l'heure et le rang du joueur DANS son match
//      (match_rank) - aucun nom, aucune photo, aucune equipe, aucune
//      probabilite (PUBLIC_FIELDS) ;
//   2. accueil, abonne Pro confirme (home-scorers.js) : resolvePick()
//      retrouve le joueur (identite + chiffres) sur les donnees premium du
//      match servies par la fonction match-data (droits verifies cote
//      serveur) - memes chiffres que la page match.

var DEFAULT_LIMIT=3;
// Champs publics d'une entree du fichier. Rien d'autre n'est jamais ecrit.
var PUBLIC_FIELDS=['match_id','match_rank','league','league_key','league_id','kickoff'];

function finite(v){ return Number.isFinite(Number(v))?Number(v):null; }
function text(v){ return typeof v==='string'&&v.trim()?v.trim():null; }
function idOrNull(v){ return v==null||v===''||!Number.isFinite(Number(v))?null:Number(v); }

var insightsCache=null;
function scorerModel(){
  if(!insightsCache){
    var ins=root&&root.IasharkInsights?root.IasharkInsights:null;
    if(!ins&&loadInsights)ins=loadInsights();
    insightsCache=ins||null;
  }
  return insightsCache&&insightsCache.scorerModel?insightsCache.scorerModel:null;
}

// Meme regle que lib/display-data.js#hasReliableModelOutput.
function hasReliableModelOutput(raw){
  if(!raw)return false;
  if(raw.model_output_available===false)return false;
  return Number(raw.data_quality_score)>0;
}

// Nom d'AFFICHAGE (lib/team-names.js, « FC Juárez ») : le meme que la carte
// de la page match (lib/match-view-model.js#team). Sans la lib : nom du flux.
var teamNamesCache;
function teamNames(){
  if(teamNamesCache===undefined){
    var tn=root&&root.IasharkTeamNames?root.IasharkTeamNames:null;
    if(!tn&&loadTeamNames)tn=loadTeamNames();
    teamNamesCache=tn&&tn.displayName?tn:null;
  }
  return teamNamesCache;
}
function teamOf(value){
  var tn=teamNames();
  var shown=tn&&value&&text(value.n)?text(tn.displayName(value)):null;
  return { id:value&&value.id!=null?value.id:null, name:shown||text(value&&value.n) };
}

// Absents annonces d'une equipe (noms), comme la page match.
function absentNamesFor(raw,teamId){
  return (Array.isArray(raw.injuries)?raw.injuries:[]).filter(function(item){
    return item&&text(item.name)&&Number(item.team)===Number(teamId);
  }).map(function(item){ return item.name; });
}

// Entrees de scorerModel.rankMatch pour un match : copie fidele de
// lib/match-view-model.js#prelineupScorers.
function scorerInput(raw){
  raw=raw||{};
  var home=teamOf(raw.home), away=teamOf(raw.away);
  var histories=raw.player_history||{};
  var squads=raw.current_squads||{};
  var reliable=hasReliableModelOutput(raw);
  function lambdaOf(v){ return reliable&&finite(v)!==null&&finite(v)>0?finite(v):null; }
  function side(key,t,lambda){
    return {
      rows:Array.isArray(histories[key])?histories[key]:[],
      teamId:t.id,
      lambda:lambda,
      absentNames:absentNamesFor(raw,t.id),
      currentIds:(Array.isArray(squads[key])?squads[key]:[]).map(function(p){ return Number(p&&(p.player_id!=null?p.player_id:p.id)); }).filter(Number.isFinite)
    };
  }
  return { home:side('home',home,lambdaOf(raw.lambda_h)), away:side('away',away,lambdaOf(raw.lambda_a)) };
}

// { all, shown, pick } de scorerModel, ou null (modele absent, donnees
// illisibles). Jamais d'exception.
function rankMatch(raw){
  var model=scorerModel();
  if(!model||!raw)return null;
  try{ return model.rankMatch(scorerInput(raw)); }catch(e){ return null; }
}

// Nom et photo affiches par la page match (playerAnalytics puis
// prelineupScorers) : fiche de l'effectif actuel si le joueur a joue cette
// saison, sinon la feuille de match la plus recente.
function identityFor(raw,key,teamId,c){
  var squad=Array.isArray((raw.current_squads||{})[key])?raw.current_squads[key]:[];
  var ids={}, nIds=0;
  squad.forEach(function(p){ var id=Number(p&&(p.player_id||p.id)); if(Number.isFinite(id)&&!ids[id]){ ids[id]=true; nIds++; } });
  var teamRows=(Array.isArray((raw.player_history||{})[key])?raw.player_history[key]:[]).filter(function(row){
    return row&&Number(row.team_id)===Number(teamId)&&(!nIds||ids[Number(row.player_id)]);
  });
  var current=teamRows.filter(function(row){ return row.is_current_season===true; });
  var rows=current.length?current:teamRows;
  var mine=rows.filter(function(row){ return Number(row.player_id)===Number(c.id); }).slice(0,10);
  var played=mine.filter(function(row){ return finite(row.minutes)>0; }).length;
  if(!played)return { name:text(c.name), photo:text(c.photo) };
  var entry=squad.filter(function(p){ return p&&Number(p.player_id||p.id)===Number(c.id); })[0]||{};
  var info=Object.assign({},mine[0]||{},entry);
  return { name:text(info.name)||text(c.name), photo:text(info.photo)||text(c.photo) };
}

function matchDay(raw){ return String(raw&&raw.date||'').slice(0,10); }

// Candidats mis en avant (shown) d'un match, avec leur entree publique.
// probability / expectedMinutes restent INTERNES (tri) : jamais publies.
function candidatesForMatch(raw){
  var ranked=rankMatch(raw);
  if(!ranked||!Array.isArray(ranked.shown))return [];
  var home=teamOf(raw.home), away=teamOf(raw.away);
  var out=[];
  ranked.shown.forEach(function(c){
    if(!c||!Number.isFinite(c.probability)||c.probability<=0||idOrNull(c.id)===null)return;
    var isHome=Number(c.teamId)===Number(home.id);
    var t=isHome?home:away, o=isHome?away:home;
    var who=identityFor(raw,isHome?'home':'away',t.id,c);
    // Jamais un joueur sans nom ni une equipe sans nom : on n'invente rien.
    if(!who.name||!t.name||!o.name)return;
    out.push({
      probability:c.probability,
      expectedMinutes:finite(c.expectedMinutes)||0,
      entry:{
        player_id:idOrNull(c.id),
        name:who.name,
        photo:who.photo||null,
        team:t.name,
        team_id:idOrNull(t.id),
        opponent:o.name,
        match_id:raw.id,
        league:text(raw.league),
        league_key:text(raw.league_key),
        league_id:idOrNull(raw.league_id),
        kickoff:text(raw.date),
        is_home:isHome
      }
    });
  });
  // Rang du joueur DANS son match (0 = le plus probable) : seule reference
  // publique, resolue par l'abonne Pro sur les donnees premium (resolvePick).
  out.sort(compareCandidates);
  out.forEach(function(x,i){ x.entry.match_rank=i; });
  return out;
}

// Ordre total et deterministe : probabilite (non arrondie), minutes
// attendues, coup d'envoi, match, joueur.
function compareCandidates(a,b){
  if(a.probability!==b.probability)return b.probability-a.probability;
  if(a.expectedMinutes!==b.expectedMinutes)return b.expectedMinutes-a.expectedMinutes;
  var ka=String(a.entry.kickoff||''), kb=String(b.entry.kickoff||'');
  if(ka!==kb)return ka<kb?-1:1;
  var ma=String(a.entry.match_id), mb=String(b.entry.match_id);
  if(ma!==mb)return ma<mb?-1:1;
  return a.entry.player_id-b.entry.player_id;
}

// Les `limit` (3) joueurs les plus susceptibles de marquer parmi les matchs
// donnes. opts : { day: 'YYYY-MM-DD' (Paris) facultatif, isEligible(match)
// facultatif (garde coup d'envoi du pipeline), limit }. Un seul joueur par
// match, sauf s'il y a moins de `limit` matchs avec un candidat.
function topScorersOfDay(matches,opts){
  opts=opts||{};
  var limit=Number(opts.limit)>0?Math.floor(Number(opts.limit)):DEFAULT_LIMIT;
  var day=opts.day?String(opts.day):null;
  var eligible=typeof opts.isEligible==='function'?opts.isEligible:null;
  var pool=[];
  (Array.isArray(matches)?matches:[]).forEach(function(raw){
    if(!raw||typeof raw!=='object'||raw.id==null)return;
    if(day&&matchDay(raw)!==day)return;
    if(eligible){ var ok=false; try{ ok=!!eligible(raw); }catch(e){ ok=false; } if(!ok)return; }
    pool=pool.concat(candidatesForMatch(raw));
  });
  pool.sort(compareCandidates);
  var chosen=[], usedMatch={}, usedPlayer={};
  pool.forEach(function(x){
    if(chosen.length>=limit)return;
    var m=String(x.entry.match_id), p=String(x.entry.player_id);
    if(usedMatch[m]||usedPlayer[p])return;
    chosen.push(x); usedMatch[m]=true; usedPlayer[p]=true;
  });
  // Moins de `limit` matchs avec un candidat : on complete avec les suivants.
  pool.forEach(function(x){
    if(chosen.length>=limit)return;
    var p=String(x.entry.player_id);
    if(usedPlayer[p])return;
    chosen.push(x); usedPlayer[p]=true;
  });
  chosen.sort(compareCandidates);
  return chosen.map(function(x){ return publicEntry(x.entry); });
}

// Copie limitee aux champs publics (defense en profondeur).
function publicEntry(e){
  var out={};
  PUBLIC_FIELDS.forEach(function(k){ out[k]=e&&e[k]!==undefined?e[k]:null; });
  return out;
}

function pad(n){ return (n<10?'0':'')+n; }
// Jour de Paris 'YYYY-MM-DD' d'un instant (ms).
function parisDay(ms){
  var parts={};
  new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'})
    .formatToParts(new Date(Number.isFinite(Number(ms))?Number(ms):Date.now()))
    .forEach(function(x){ parts[x.type]=x.value; });
  return parts.year+'-'+parts.month+'-'+parts.day;
}
function addDays(day,n){
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day||''));
  if(!m)return '';
  var d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]+n));
  return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
}

// Contenu de buteurs-du-jour.json : aujourd'hui et demain (heure de Paris).
// opts : { now (ms), days (liste de jours, facultatif), isEligible, limit }.
function buildDailyFile(matches,opts){
  opts=opts||{};
  var now=Number.isFinite(Number(opts.now))?Number(opts.now):Date.now();
  var today=parisDay(now);
  var days=Array.isArray(opts.days)&&opts.days.length?opts.days.slice():[today,addDays(today,1)];
  var out={ generated_at:new Date(now).toISOString(), days:{} };
  days.forEach(function(d){
    out.days[d]=topScorersOfDay(matches,{ day:d, isEligible:opts.isEligible, limit:opts.limit });
  });
  return out;
}

// Abonne Pro confirme : chiffres d'UN joueur sur les donnees premium de son
// match (reponse match-data), memes valeurs que la carte « Marches joueurs »
// (scoringProbability = displayProbability, en %, plafonnee a 45 ;
// expectedMinutes arrondies). null si le joueur n'est pas retrouve. Une
// probabilite nulle ou illisible est rendue null : jamais « 0 % ».
function scorerNumbersFor(raw,playerId){
  var ranked=rankMatch(raw);
  if(!ranked||!Array.isArray(ranked.all))return null;
  var c=ranked.all.filter(function(x){ return x&&Number(x.id)===Number(playerId); })[0];
  if(!c)return null;
  var dp=finite(c.displayProbability);
  return {
    player_id:idOrNull(c.id),
    displayProbability:dp!==null&&dp>0?dp:null,
    startsLast:finite(c.startsLast),
    teamMatchesLast:finite(c.teamMatchesLast),
    expectedMinutes:finite(c.expectedMinutes)===null?null:Math.round(c.expectedMinutes),
    shown:Array.isArray(ranked.shown)&&ranked.shown.indexOf(c)!==-1
  };
}

// Abonne Pro confirme : le joueur designe par une entree publique
// ({match_id, match_rank}) sur les donnees premium de SON match, avec son
// identite et ses chiffres (memes valeurs que la carte « Marches joueurs »).
// null si les donnees ne permettent pas de le retrouver : jamais un joueur
// devine, jamais « 0 % ».
function resolvePick(raw,matchRank){
  // Rang absent ou vide : jamais lu comme 0 (Number(null) === 0).
  if(matchRank===null||matchRank===undefined||String(matchRank).trim()==='')return null;
  var rank=Number(matchRank);
  if(!raw||typeof raw!=='object'||!Number.isInteger(rank)||rank<0)return null;
  var x=candidatesForMatch(raw)[rank];
  if(!x)return null;
  var n=scorerNumbersFor(raw,x.entry.player_id);
  if(!n||n.displayProbability===null)return null;
  var e=x.entry;
  return {
    player_id:e.player_id, name:e.name, photo:e.photo, team:e.team, team_id:e.team_id,
    opponent:e.opponent, match_id:e.match_id, league:e.league, league_key:e.league_key,
    league_id:e.league_id, kickoff:e.kickoff, is_home:e.is_home,
    displayProbability:n.displayProbability, startsLast:n.startsLast,
    teamMatchesLast:n.teamMatchesLast, expectedMinutes:n.expectedMinutes
  };
}

return {
  PUBLIC_FIELDS:PUBLIC_FIELDS,
  resolvePick:resolvePick,
  DEFAULT_LIMIT:DEFAULT_LIMIT,
  hasReliableModelOutput:hasReliableModelOutput,
  scorerInput:scorerInput,
  rankMatch:rankMatch,
  candidatesForMatch:candidatesForMatch,
  topScorersOfDay:topScorersOfDay,
  buildDailyFile:buildDailyFile,
  scorerNumbersFor:scorerNumbersFor,
  publicEntry:publicEntry,
  parisDay:parisDay,
  addDays:addDays
};
});
