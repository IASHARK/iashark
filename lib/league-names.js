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
    "id": 39,
    "dirs": [
      "fr",
      "gb",
      "za",
      "en"
    ]
  },
  "laliga": {
    "name": "La Liga",
    "id": 140,
    "dirs": [
      "fr",
      "en",
      "mx",
      "es"
    ]
  },
  "seriea": {
    "name": "Serie A",
    "id": 135,
    "dirs": [
      "fr",
      "en",
      "it"
    ]
  },
  "bundesliga": {
    "name": "Bundesliga",
    "id": 78,
    "dirs": [
      "fr",
      "en",
      "de"
    ]
  },
  "ligue1": {
    "name": "Ligue 1",
    "id": 61,
    "dirs": [
      "fr",
      "en"
    ]
  },
  "ldc": {
    "name": "Champions League",
    "id": 2,
    "dirs": [
      "fr",
      "gb",
      "za",
      "en",
      "mx",
      "es",
      "de",
      "it",
      "pt"
    ]
  },
  "el": {
    "name": "Europa League",
    "id": 3,
    "dirs": [
      "fr",
      "gb",
      "za",
      "en",
      "mx",
      "es",
      "de",
      "it",
      "pt"
    ]
  },
  "ecl": {
    "name": "Conference League",
    "id": 848,
    "dirs": [
      "fr",
      "gb",
      "za",
      "en",
      "mx",
      "es",
      "de",
      "it",
      "pt"
    ]
  },
  "eredivisie": {
    "name": "Eredivisie",
    "id": 88,
    "dirs": [
      "fr",
      "en"
    ]
  },
  "primeira": {
    "name": "Liga Portugal",
    "id": 94,
    "dirs": [
      "fr",
      "en",
      "pt"
    ]
  },
  "mls": {
    "name": "MLS",
    "id": 253,
    "dirs": [
      "fr",
      "gb",
      "en"
    ]
  },
  "suede": {
    "name": "Allsvenskan",
    "id": 113,
    "dirs": [
      "fr",
      "en"
    ]
  },
  "jleague": {
    "name": "J1 League",
    "id": 98,
    "dirs": [
      "fr",
      "en"
    ]
  },
  "liga_mx": {
    "name": "Liga MX",
    "id": 262,
    "dirs": [
      "fr",
      "en",
      "mx"
    ]
  },
  "south_africa_premiership": {
    "name": "Premier Soccer League",
    "id": 288,
    "dirs": [
      "fr",
      "za",
      "en"
    ]
  },
  "argentina_liga_profesional": {
    "name": "Liga Profesional Argentina",
    "id": 128,
    "dirs": [
      "fr",
      "en",
      "es"
    ]
  },
  "colombia_primera_a": {
    "name": "Primera A Colombia",
    "id": 239,
    "dirs": [
      "fr",
      "en",
      "es"
    ]
  },
  "peru_primera": {
    "name": "Liga 1 Peru",
    "id": 281,
    "dirs": [
      "fr",
      "en",
      "es"
    ]
  },
  "chile_primera": {
    "name": "Primera Division Chile",
    "id": 265,
    "dirs": [
      "fr",
      "en",
      "es"
    ]
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
// Page match STATIQUE d'une version (audit SEO du 19/09/2026 : les cartes de
// l'accueil liaient le shell noindex match.html?id=). Chaque match du run a une
// page dans les versions de dirs (fr + config/leagues.json#seoMatchDirs,
// scripts/seo-pages.js) : /match/<id>.html pour fr, /<dir>/match/<id>.html
// sinon. null hors perimetre (l'appelant garde match.html?id=).
function staticMatchPath(id,key,dir){
  var k=String(key==null?'':key),d=String(dir==null?'':dir);
  if(!/^\d{1,12}$/.test(String(id))||!d||!Object.prototype.hasOwnProperty.call(LEAGUES,k))return null;
  var dirs=LEAGUES[k].dirs||[];
  if(dirs.indexOf(d)===-1)return null;
  return d==='fr'?'/match/'+id+'.html':'/'+d+'/match/'+id+'.html';
}
return { LEAGUES:LEAGUES, displayName:displayName, apiFootballId:apiFootballId, staticMatchPath:staticMatchPath };
});
