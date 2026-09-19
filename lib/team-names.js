(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.IasharkTeamNames=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
// Noms d'AFFICHAGE des equipes (audit SEO du 19/09/2026) : « América » au lieu
// de « Club America », « Pumas UNAM » au lieu de « U.N.A.M. - Pumas ».
// Seul l'affichage change : les donnees gardent le nom du flux api-football.
//
// Le bloc ci-dessous est RECOPIE depuis config/team-display-names.json (id
// api-football -> nom) par scripts/build-locales.js : ne pas l'editer a la main.

/*IASHARK_TEAM_NAMES_DATA_START*/
var TEAMS = {
  "434": {
    "name": "Gimnasia y Esgrima (LP)",
    "feedName": "Gimnasia L.P."
  },
  "438": {
    "name": "Vélez Sarsfield",
    "feedName": "Velez Sarsfield"
  },
  "442": {
    "name": "Defensa y Justicia",
    "feedName": "Defensa Y Justicia"
  },
  "445": {
    "name": "Huracán",
    "feedName": "Huracan"
  },
  "446": {
    "name": "Lanús",
    "feedName": "Lanus"
  },
  "450": {
    "name": "Estudiantes (LP)",
    "feedName": "Estudiantes L.P."
  },
  "455": {
    "name": "Atlético Tucumán",
    "feedName": "Atletico Tucuman"
  },
  "457": {
    "name": "Newell's Old Boys",
    "feedName": "Newells Old Boys"
  },
  "458": {
    "name": "Argentinos Juniors",
    "feedName": "Argentinos JRS"
  },
  "473": {
    "name": "Independiente Rivadavia",
    "feedName": "Independ. Rivadavia"
  },
  "1065": {
    "name": "Central Córdoba (SdE)",
    "feedName": "Central Cordoba de Santiago"
  },
  "1066": {
    "name": "Gimnasia y Esgrima (M)",
    "feedName": "Gimnasia M."
  },
  "1128": {
    "name": "Independiente Medellín",
    "feedName": "Independiente Medellin"
  },
  "1134": {
    "name": "Internacional de Bogotá",
    "feedName": "Internacional de Bogota"
  },
  "1137": {
    "name": "Atlético Nacional",
    "feedName": "Atletico Nacional"
  },
  "1138": {
    "name": "América de Cali",
    "feedName": "America de Cali"
  },
  "1470": {
    "name": "Cúcuta",
    "feedName": "Cucuta"
  },
  "1605": {
    "name": "LA Galaxy",
    "feedName": "Los Angeles Galaxy"
  },
  "1614": {
    "name": "CF Montréal",
    "feedName": "CF Montreal"
  },
  "1615": {
    "name": "D.C. United",
    "feedName": "DC United"
  },
  "2278": {
    "name": "Chivas",
    "feedName": "Guadalajara Chivas"
  },
  "2286": {
    "name": "Pumas UNAM",
    "feedName": "U.N.A.M. - Pumas"
  },
  "2287": {
    "name": "América",
    "feedName": "Club America"
  },
  "2289": {
    "name": "León",
    "feedName": "Leon"
  },
  "2290": {
    "name": "Querétaro",
    "feedName": "Club Queretaro"
  },
  "2298": {
    "name": "FC Juárez",
    "feedName": "FC Juarez"
  },
  "2314": {
    "name": "Atlético San Luis",
    "feedName": "Atletico San Luis"
  },
  "2324": {
    "name": "Universidad de Concepción",
    "feedName": "Universidad de Concepcion"
  },
  "2337": {
    "name": "Ñublense",
    "feedName": "Nublense"
  },
  "2424": {
    "name": "Estudiantes (RC)",
    "feedName": "Estudiantes de Rio Cuarto"
  },
  "2564": {
    "name": "Atlético Grau",
    "feedName": "Atletico Grau"
  },
  "16489": {
    "name": "Austin FC",
    "feedName": "Austin"
  },
  "18310": {
    "name": "Charlotte FC",
    "feedName": "Charlotte"
  },
  "20787": {
    "name": "St. Louis City SC",
    "feedName": "St. Louis City"
  },
  "25484": {
    "name": "San Diego FC",
    "feedName": "San Diego"
  }
};
/*IASHARK_TEAM_NAMES_DATA_END*/

var BY_FEED={};
Object.keys(TEAMS).forEach(function(id){ var t=TEAMS[id]; if(t&&t.feedName) BY_FEED[t.feedName]=t.name; });

// team : { id, n } (donnees du pipeline), { id, name }, ou un nom seul.
// Identifiant connu -> nom d'affichage ; sinon nom du flux exactement connu
// (lignes de forme / confrontations sans identifiant) ; sinon inchange.
function displayName(team){
  if(team==null) return '';
  if(typeof team==='string') return Object.prototype.hasOwnProperty.call(BY_FEED,team)?BY_FEED[team]:team;
  var id=team.id!=null?String(team.id):null;
  var raw=team.n!=null?team.n:(team.name!=null?team.name:'');
  if(id&&Object.prototype.hasOwnProperty.call(TEAMS,id)&&TEAMS[id].name) return TEAMS[id].name;
  return Object.prototype.hasOwnProperty.call(BY_FEED,raw)?BY_FEED[raw]:String(raw);
}
// Nom du flux quand il differe du nom affiche (JSON-LD alternateName), sinon null.
function feedNameIfDifferent(team){
  if(!team||typeof team!=='object') return null;
  var raw=team.n!=null?team.n:team.name;
  var shown=displayName(team);
  return raw&&shown&&String(raw)!==shown?String(raw):null;
}
return {TEAMS:TEAMS,displayName:displayName,feedNameIfDifferent:feedNameIfDifferent};
});
