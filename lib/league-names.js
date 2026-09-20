(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.IasharkLeagueNames=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
// UN nom d'affichage par competition (audit QA 14/09/2026 : "LaLiga" /
// "La Liga", "Liga Portugal" / "Primeira Liga", "MLS" / "Major League Soccer"
// cohabitaient, et le filtre affichait "FB J1 League").
//
// Le bloc ci-dessous est RECOPIE depuis config/leagues.json (displayName,
// cle league_key des donnees) par scripts/build-locales.js : ne pas l'editer
// a la main. Les noms de competitions sont des identifiants sportifs : ils
// ne se traduisent pas.

/*IASHARK_LEAGUES_DATA_START*/
var LEAGUES = {
  "premier": {
    "name": "Premier League",
    "id": 39
  },
  "laliga": {
    "name": "La Liga",
    "id": 140
  },
  "seriea": {
    "name": "Serie A",
    "id": 135
  },
  "bundesliga": {
    "name": "Bundesliga",
    "id": 78
  },
  "ligue1": {
    "name": "Ligue 1",
    "id": 61
  },
  "ldc": {
    "name": "Champions League",
    "id": 2
  },
  "el": {
    "name": "Europa League",
    "id": 3
  },
  "ecl": {
    "name": "Conference League",
    "id": 848
  },
  "eredivisie": {
    "name": "Eredivisie",
    "id": 88
  },
  "primeira": {
    "name": "Liga Portugal",
    "id": 94
  },
  "mls": {
    "name": "MLS",
    "id": 253
  },
  "suede": {
    "name": "Allsvenskan",
    "id": 113
  },
  "jleague": {
    "name": "J1 League",
    "id": 98
  },
  "liga_mx": {
    "name": "Liga MX",
    "id": 262
  },
  "south_africa_premiership": {
    "name": "Premier Soccer League",
    "id": 288
  },
  "argentina_liga_profesional": {
    "name": "Liga Profesional Argentina",
    "id": 128
  },
  "colombia_primera_a": {
    "name": "Primera A Colombia",
    "id": 239
  },
  "peru_primera": {
    "name": "Liga 1 Peru",
    "id": 281
  },
  "chile_primera": {
    "name": "Primera Division Chile",
    "id": 265
  }
};
/*IASHARK_LEAGUES_DATA_END*/

// Nom d'affichage pour un league_key, sinon repli (nom brut des donnees).
function displayName(key,fallback){
  var k=String(key==null?'':key);
  return Object.prototype.hasOwnProperty.call(LEAGUES,k)?LEAGUES[k].name:(fallback==null?null:fallback);
}
function apiFootballId(key){
  var k=String(key==null?'':key);
  return Object.prototype.hasOwnProperty.call(LEAGUES,k)?LEAGUES[k].id:null;
}
return { LEAGUES:LEAGUES, displayName:displayName, apiFootballId:apiFootballId };
});
