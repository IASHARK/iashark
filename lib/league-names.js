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
// a la main. Les noms des competitions historiques ne se traduisent pas ;
// celles ajoutees le 30/09/2026 portent aussi un nom par langue (names).

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
  },
  "championship": {
    "name": "Championship",
    "id": 40,
    "names": {
      "fr": "Championship",
      "en": "Championship",
      "es": "Championship",
      "es-mx": "Championship",
      "de": "Championship",
      "it": "Championship",
      "pt": "Championship"
    }
  },
  "league_one": {
    "name": "League One",
    "id": 41,
    "names": {
      "fr": "League One",
      "en": "League One",
      "es": "League One",
      "es-mx": "League One",
      "de": "League One",
      "it": "League One",
      "pt": "League One"
    }
  },
  "league_two": {
    "name": "League Two",
    "id": 42,
    "names": {
      "fr": "League Two",
      "en": "League Two",
      "es": "League Two",
      "es-mx": "League Two",
      "de": "League Two",
      "it": "League Two",
      "pt": "League Two"
    }
  },
  "ligue2": {
    "name": "Ligue 2",
    "id": 62,
    "names": {
      "fr": "Ligue 2",
      "en": "Ligue 2",
      "es": "Ligue 2",
      "es-mx": "Ligue 2",
      "de": "Ligue 2",
      "it": "Ligue 2",
      "pt": "Ligue 2"
    }
  },
  "bundesliga2": {
    "name": "2. Bundesliga",
    "id": 79,
    "names": {
      "fr": "2. Bundesliga",
      "en": "2. Bundesliga",
      "es": "2. Bundesliga",
      "es-mx": "2. Bundesliga",
      "de": "2. Bundesliga",
      "it": "2. Bundesliga",
      "pt": "2. Bundesliga"
    }
  },
  "spain_segunda": {
    "name": "Segunda Division",
    "id": 141,
    "names": {
      "fr": "Segunda División",
      "en": "Segunda División",
      "es": "Segunda División",
      "es-mx": "Segunda División",
      "de": "Segunda División",
      "it": "Segunda División",
      "pt": "Segunda División"
    }
  },
  "italy_serieb": {
    "name": "Serie B",
    "id": 136,
    "names": {
      "fr": "Serie B",
      "en": "Serie B",
      "es": "Serie B",
      "es-mx": "Serie B",
      "de": "Serie B",
      "it": "Serie B",
      "pt": "Serie B"
    }
  },
  "belgium_pro": {
    "name": "Jupiler Pro League",
    "id": 144,
    "names": {
      "fr": "Jupiler Pro League",
      "en": "Jupiler Pro League",
      "es": "Jupiler Pro League",
      "es-mx": "Jupiler Pro League",
      "de": "Jupiler Pro League",
      "it": "Jupiler Pro League",
      "pt": "Jupiler Pro League"
    }
  },
  "turkey_superlig": {
    "name": "Super Lig",
    "id": 203,
    "names": {
      "fr": "Süper Lig",
      "en": "Süper Lig",
      "es": "Süper Lig",
      "es-mx": "Süper Lig",
      "de": "Süper Lig",
      "it": "Süper Lig",
      "pt": "Süper Lig"
    }
  },
  "scotland_premiership": {
    "name": "Scottish Premiership",
    "id": 179,
    "names": {
      "fr": "Premiership écossaise",
      "en": "Scottish Premiership",
      "es": "Scottish Premiership",
      "es-mx": "Scottish Premiership",
      "de": "Scottish Premiership",
      "it": "Scottish Premiership",
      "pt": "Scottish Premiership"
    }
  },
  "greece_superleague": {
    "name": "Super League Greece",
    "id": 197,
    "names": {
      "fr": "Super League grecque",
      "en": "Greek Super League",
      "es": "Greek Super League",
      "es-mx": "Greek Super League",
      "de": "Greek Super League",
      "it": "Greek Super League",
      "pt": "Greek Super League"
    }
  },
  "brazil_seriea": {
    "name": "Brasileirao Serie A",
    "id": 71,
    "names": {
      "fr": "Brasileirão Série A",
      "en": "Brasileirão Série A",
      "es": "Brasileirão Série A",
      "es-mx": "Brasileirão Série A",
      "de": "Brasileirão Série A",
      "it": "Brasileirão Série A",
      "pt": "Brasileirão Série A"
    }
  },
  "austria_bundesliga": {
    "name": "Austrian Bundesliga",
    "id": 218,
    "names": {
      "fr": "Bundesliga autrichienne",
      "en": "Austrian Bundesliga",
      "es": "Austrian Bundesliga",
      "es-mx": "Austrian Bundesliga",
      "de": "Austrian Bundesliga",
      "it": "Austrian Bundesliga",
      "pt": "Austrian Bundesliga"
    }
  },
  "switzerland_superleague": {
    "name": "Swiss Super League",
    "id": 207,
    "names": {
      "fr": "Super League suisse",
      "en": "Swiss Super League",
      "es": "Swiss Super League",
      "es-mx": "Swiss Super League",
      "de": "Swiss Super League",
      "it": "Swiss Super League",
      "pt": "Swiss Super League"
    }
  },
  "denmark_superliga": {
    "name": "Danish Superliga",
    "id": 119,
    "names": {
      "fr": "Superliga danoise",
      "en": "Danish Superliga",
      "es": "Danish Superliga",
      "es-mx": "Danish Superliga",
      "de": "Danish Superliga",
      "it": "Danish Superliga",
      "pt": "Danish Superliga"
    }
  },
  "eliteserien": {
    "name": "Eliteserien",
    "id": 103,
    "names": {
      "fr": "Eliteserien",
      "en": "Eliteserien",
      "es": "Eliteserien",
      "es-mx": "Eliteserien",
      "de": "Eliteserien",
      "it": "Eliteserien",
      "pt": "Eliteserien"
    }
  },
  "ekstraklasa": {
    "name": "Ekstraklasa",
    "id": 106,
    "names": {
      "fr": "Ekstraklasa",
      "en": "Ekstraklasa",
      "es": "Ekstraklasa",
      "es-mx": "Ekstraklasa",
      "de": "Ekstraklasa",
      "it": "Ekstraklasa",
      "pt": "Ekstraklasa"
    }
  },
  "scotland_championship": {
    "name": "Scottish Championship",
    "id": 180,
    "names": {
      "fr": "Championship écossais",
      "en": "Scottish Championship",
      "es": "Scottish Championship",
      "es-mx": "Scottish Championship",
      "de": "Scottish Championship",
      "it": "Scottish Championship",
      "pt": "Scottish Championship"
    }
  },
  "saudi_proleague": {
    "name": "Saudi Pro League",
    "id": 307,
    "names": {
      "fr": "Saudi Pro League",
      "en": "Saudi Pro League",
      "es": "Saudi Pro League",
      "es-mx": "Saudi Pro League",
      "de": "Saudi Pro League",
      "it": "Saudi Pro League",
      "pt": "Saudi Pro League"
    }
  },
  "nations_league": {
    "name": "UEFA Nations League",
    "id": 5,
    "names": {
      "fr": "Ligue des nations",
      "en": "UEFA Nations League",
      "es": "UEFA Nations League",
      "es-mx": "UEFA Nations League",
      "de": "UEFA Nations League",
      "it": "UEFA Nations League",
      "pt": "UEFA Nations League"
    }
  },
  "wcq_europe": {
    "name": "World Cup Qualifiers Europe",
    "id": 32,
    "names": {
      "fr": "Éliminatoires Mondial (Europe)",
      "en": "World Cup Qualifiers Europe",
      "es": "World Cup Qualifiers Europe",
      "es-mx": "World Cup Qualifiers Europe",
      "de": "World Cup Qualifiers Europe",
      "it": "World Cup Qualifiers Europe",
      "pt": "World Cup Qualifiers Europe"
    }
  },
  "dfb_pokal": {
    "name": "DFB Pokal",
    "id": 81,
    "names": {
      "fr": "Coupe d'Allemagne (DFB-Pokal)",
      "en": "DFB-Pokal",
      "es": "DFB-Pokal",
      "es-mx": "DFB-Pokal",
      "de": "DFB-Pokal",
      "it": "DFB-Pokal",
      "pt": "DFB-Pokal"
    }
  },
  "coppa_italia": {
    "name": "Coppa Italia",
    "id": 137,
    "names": {
      "fr": "Coupe d'Italie",
      "en": "Coppa Italia",
      "es": "Coppa Italia",
      "es-mx": "Coppa Italia",
      "de": "Coppa Italia",
      "it": "Coppa Italia",
      "pt": "Coppa Italia"
    }
  },
  "copa_del_rey": {
    "name": "Copa del Rey",
    "id": 143,
    "names": {
      "fr": "Coupe du Roi",
      "en": "Copa del Rey",
      "es": "Copa del Rey",
      "es-mx": "Copa del Rey",
      "de": "Copa del Rey",
      "it": "Copa del Rey",
      "pt": "Copa del Rey"
    }
  },
  "fa_cup": {
    "name": "FA Cup",
    "id": 45,
    "names": {
      "fr": "FA Cup",
      "en": "FA Cup",
      "es": "FA Cup",
      "es-mx": "FA Cup",
      "de": "FA Cup",
      "it": "FA Cup",
      "pt": "FA Cup"
    }
  },
  "coupe_de_france": {
    "name": "Coupe de France",
    "id": 66,
    "names": {
      "fr": "Coupe de France",
      "en": "Coupe de France",
      "es": "Coupe de France",
      "es-mx": "Coupe de France",
      "de": "Coupe de France",
      "it": "Coupe de France",
      "pt": "Coupe de France"
    }
  },
  "eerste_divisie": {
    "name": "Eerste Divisie",
    "id": 89,
    "names": {
      "fr": "Eerste Divisie",
      "en": "Eerste Divisie",
      "es": "Eerste Divisie",
      "es-mx": "Eerste Divisie",
      "de": "Eerste Divisie",
      "it": "Eerste Divisie",
      "pt": "Eerste Divisie"
    }
  },
  "germany_liga3": {
    "name": "3. Liga",
    "id": 80,
    "names": {
      "fr": "3. Liga",
      "en": "3. Liga",
      "es": "3. Liga",
      "es-mx": "3. Liga",
      "de": "3. Liga",
      "it": "3. Liga",
      "pt": "3. Liga"
    }
  },
  "czech_liga": {
    "name": "Czech Liga",
    "id": 345,
    "names": {
      "fr": "Championnat tchèque",
      "en": "Czech First League",
      "es": "Czech First League",
      "es-mx": "Czech First League",
      "de": "Czech First League",
      "it": "Czech First League",
      "pt": "Czech First League"
    }
  }
};
/*IASHARK_LEAGUES_DATA_END*/

// Nom d'affichage pour un league_key, sinon repli (nom brut des donnees).
// Competitions ajoutees le 30/09/2026 : nom dans les 7 langues du site
// (config/leagues.json#names). locale explicite, sinon celle de la page
// (window.I18N.locale dans le navigateur), sinon le nom unique (displayName).
function currentLocale(){
  try{return typeof window!=='undefined'&&window.I18N&&window.I18N.locale?String(window.I18N.locale):null;}catch(e){return null;}
}
function displayName(key,fallback,locale){
  var k=String(key==null?'':key);
  if(!Object.prototype.hasOwnProperty.call(LEAGUES,k))return fallback==null?null:fallback;
  var l=LEAGUES[k],loc=locale||currentLocale();
  if(loc&&l.names){
    if(l.names[loc])return l.names[loc];
    var base=String(loc).split('-')[0];
    if(l.names[base])return l.names[base];
  }
  return l.name;
}
function apiFootballId(key){
  var k=String(key==null?'':key);
  return Object.prototype.hasOwnProperty.call(LEAGUES,k)?LEAGUES[k].id:null;
}
return { LEAGUES:LEAGUES, displayName:displayName, apiFootballId:apiFootballId };
});
