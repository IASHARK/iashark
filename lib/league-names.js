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
  "argentina_liga_profesional": {
    "name": "Liga Profesional Argentina",
    "id": 128
  },
  "chile_primera": {
    "name": "Primera Division Chile",
    "id": 265,
    "names": {
      "fr": "Primera División (Chili)",
      "en": "Primera Division Chile",
      "es": "Primera Division Chile",
      "es-mx": "Primera Division Chile",
      "de": "Primera Division Chile",
      "it": "Primera Division Chile",
      "pt": "Primera Division Chile"
    }
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
  "k_league1": {
    "name": "K League 1",
    "id": 292,
    "names": {
      "fr": "K League 1",
      "en": "K League 1",
      "es": "K League 1",
      "es-mx": "K League 1",
      "de": "K League 1",
      "it": "K League 1",
      "pt": "K League 1"
    }
  },
  "efl_cup": {
    "name": "EFL Cup",
    "id": 48,
    "names": {
      "fr": "Coupe de la Ligue anglaise (EFL Cup)",
      "en": "EFL Cup",
      "es": "EFL Cup",
      "es-mx": "EFL Cup",
      "de": "EFL Cup",
      "it": "EFL Cup",
      "pt": "EFL Cup"
    }
  },
  "libertadores": {
    "name": "Copa Libertadores",
    "id": 13,
    "names": {
      "fr": "Copa Libertadores",
      "en": "Copa Libertadores",
      "es": "Copa Libertadores",
      "es-mx": "Copa Libertadores",
      "de": "Copa Libertadores",
      "it": "Copa Libertadores",
      "pt": "Copa Libertadores"
    }
  },
  "sudamericana": {
    "name": "Copa Sudamericana",
    "id": 11,
    "names": {
      "fr": "Copa Sudamericana",
      "en": "Copa Sudamericana",
      "es": "Copa Sudamericana",
      "es-mx": "Copa Sudamericana",
      "de": "Copa Sudamericana",
      "it": "Copa Sudamericana",
      "pt": "Copa Sudamericana"
    }
  },
  "club_world_cup": {
    "name": "FIFA Club World Cup",
    "id": 15,
    "names": {
      "fr": "Coupe du monde des clubs",
      "en": "FIFA Club World Cup",
      "es": "FIFA Club World Cup",
      "es-mx": "FIFA Club World Cup",
      "de": "FIFA Club World Cup",
      "it": "FIFA Club World Cup",
      "pt": "FIFA Club World Cup"
    }
  },
  "leagues_cup": {
    "name": "Leagues Cup",
    "id": 772,
    "names": {
      "fr": "Leagues Cup",
      "en": "Leagues Cup",
      "es": "Leagues Cup",
      "es-mx": "Leagues Cup",
      "de": "Leagues Cup",
      "it": "Leagues Cup",
      "pt": "Leagues Cup"
    }
  },
  "euro": {
    "name": "UEFA Euro",
    "id": 4,
    "names": {
      "fr": "Euro",
      "en": "UEFA Euro",
      "es": "UEFA Euro",
      "es-mx": "UEFA Euro",
      "de": "UEFA Euro",
      "it": "UEFA Euro",
      "pt": "UEFA Euro"
    }
  },
  "euro_qualifiers": {
    "name": "Euro Qualifiers",
    "id": 960,
    "names": {
      "fr": "Éliminatoires de l'Euro",
      "en": "Euro Qualifiers",
      "es": "Euro Qualifiers",
      "es-mx": "Euro Qualifiers",
      "de": "Euro Qualifiers",
      "it": "Euro Qualifiers",
      "pt": "Euro Qualifiers"
    }
  },
  "wcq_south_america": {
    "name": "WC Qualifiers South America",
    "id": 34,
    "names": {
      "fr": "Éliminatoires Mondial (Amérique du Sud)",
      "en": "World Cup Qualifiers South America",
      "es": "World Cup Qualifiers South America",
      "es-mx": "World Cup Qualifiers South America",
      "de": "World Cup Qualifiers South America",
      "it": "World Cup Qualifiers South America",
      "pt": "World Cup Qualifiers South America"
    }
  },
  "copa_america": {
    "name": "Copa America",
    "id": 9,
    "names": {
      "fr": "Copa América",
      "en": "Copa America",
      "es": "Copa America",
      "es-mx": "Copa America",
      "de": "Copa America",
      "it": "Copa America",
      "pt": "Copa America"
    }
  },
  "africa_cup": {
    "name": "Africa Cup of Nations",
    "id": 6,
    "names": {
      "fr": "Coupe d'Afrique des nations",
      "en": "Africa Cup of Nations",
      "es": "Africa Cup of Nations",
      "es-mx": "Africa Cup of Nations",
      "de": "Africa Cup of Nations",
      "it": "Africa Cup of Nations",
      "pt": "Africa Cup of Nations"
    }
  },
  "gold_cup": {
    "name": "CONCACAF Gold Cup",
    "id": 22,
    "names": {
      "fr": "Gold Cup",
      "en": "CONCACAF Gold Cup",
      "es": "CONCACAF Gold Cup",
      "es-mx": "CONCACAF Gold Cup",
      "de": "CONCACAF Gold Cup",
      "it": "CONCACAF Gold Cup",
      "pt": "CONCACAF Gold Cup"
    }
  },
  "argentina_federal_a": {
    "name": "Torneo Federal A",
    "id": 134,
    "names": {
      "fr": "Torneo Federal A (Argentine)",
      "en": "Torneo Federal A",
      "es": "Torneo Federal A",
      "es-mx": "Torneo Federal A",
      "de": "Torneo Federal A",
      "it": "Torneo Federal A",
      "pt": "Torneo Federal A"
    }
  },
  "australia_aleague": {
    "name": "A-League",
    "id": 188,
    "names": {
      "fr": "A-League (Australie)",
      "en": "A-League",
      "es": "A-League",
      "es-mx": "A-League",
      "de": "A-League",
      "it": "A-League",
      "pt": "A-League"
    }
  },
  "austria_2liga": {
    "name": "2. Liga Austria",
    "id": 219,
    "names": {
      "fr": "2. Liga (Autriche)",
      "en": "Austrian 2. Liga",
      "es": "Austrian 2. Liga",
      "es-mx": "Austrian 2. Liga",
      "de": "Austrian 2. Liga",
      "it": "Austrian 2. Liga",
      "pt": "Austrian 2. Liga"
    }
  },
  "belarus_premier": {
    "name": "Belarus Premier League",
    "id": 116,
    "names": {
      "fr": "Championnat de Biélorussie",
      "en": "Belarusian Premier League",
      "es": "Belarusian Premier League",
      "es-mx": "Belarusian Premier League",
      "de": "Belarusian Premier League",
      "it": "Belarusian Premier League",
      "pt": "Belarusian Premier League"
    }
  },
  "belgium_challenger": {
    "name": "Challenger Pro League",
    "id": 145,
    "names": {
      "fr": "Challenger Pro League (Belgique)",
      "en": "Challenger Pro League",
      "es": "Challenger Pro League",
      "es-mx": "Challenger Pro League",
      "de": "Challenger Pro League",
      "it": "Challenger Pro League",
      "pt": "Challenger Pro League"
    }
  },
  "bolivia_primera": {
    "name": "Primera Division Bolivia",
    "id": 344,
    "names": {
      "fr": "Championnat de Bolivie",
      "en": "Bolivian Primera División",
      "es": "Bolivian Primera División",
      "es-mx": "Bolivian Primera División",
      "de": "Bolivian Primera División",
      "it": "Bolivian Primera División",
      "pt": "Bolivian Primera División"
    }
  },
  "bosnia_premijer": {
    "name": "Premijer Liga BiH",
    "id": 315,
    "names": {
      "fr": "Championnat de Bosnie",
      "en": "Bosnian Premier League",
      "es": "Bosnian Premier League",
      "es-mx": "Bosnian Premier League",
      "de": "Bosnian Premier League",
      "it": "Bosnian Premier League",
      "pt": "Bosnian Premier League"
    }
  },
  "copa_do_brasil": {
    "name": "Copa do Brasil",
    "id": 73,
    "names": {
      "fr": "Coupe du Brésil",
      "en": "Copa do Brasil",
      "es": "Copa do Brasil",
      "es-mx": "Copa do Brasil",
      "de": "Copa do Brasil",
      "it": "Copa do Brasil",
      "pt": "Copa do Brasil"
    }
  },
  "brazil_serieb": {
    "name": "Brasileirao Serie B",
    "id": 72,
    "names": {
      "fr": "Série B (Brésil)",
      "en": "Brasileirão Série B",
      "es": "Brasileirão Série B",
      "es-mx": "Brasileirão Série B",
      "de": "Brasileirão Série B",
      "it": "Brasileirão Série B",
      "pt": "Brasileirão Série B"
    }
  },
  "bulgaria_first": {
    "name": "First League Bulgaria",
    "id": 172,
    "names": {
      "fr": "Championnat de Bulgarie",
      "en": "Bulgarian First League",
      "es": "Bulgarian First League",
      "es-mx": "Bulgarian First League",
      "de": "Bulgarian First League",
      "it": "Bulgarian First League",
      "pt": "Bulgarian First League"
    }
  },
  "canada_premier": {
    "name": "Canadian Premier League",
    "id": 479,
    "names": {
      "fr": "Canadian Premier League",
      "en": "Canadian Premier League",
      "es": "Canadian Premier League",
      "es-mx": "Canadian Premier League",
      "de": "Canadian Premier League",
      "it": "Canadian Premier League",
      "pt": "Canadian Premier League"
    }
  },
  "china_superleague": {
    "name": "Chinese Super League",
    "id": 169,
    "names": {
      "fr": "Super League chinoise",
      "en": "Chinese Super League",
      "es": "Chinese Super League",
      "es-mx": "Chinese Super League",
      "de": "Chinese Super League",
      "it": "Chinese Super League",
      "pt": "Chinese Super League"
    }
  },
  "croatia_hnl": {
    "name": "HNL",
    "id": 210,
    "names": {
      "fr": "Championnat de Croatie (HNL)",
      "en": "Croatian HNL",
      "es": "Croatian HNL",
      "es-mx": "Croatian HNL",
      "de": "Croatian HNL",
      "it": "Croatian HNL",
      "pt": "Croatian HNL"
    }
  },
  "cyprus_first": {
    "name": "Cyprus First Division",
    "id": 318,
    "names": {
      "fr": "Championnat de Chypre",
      "en": "Cypriot First Division",
      "es": "Cypriot First Division",
      "es-mx": "Cypriot First Division",
      "de": "Cypriot First Division",
      "it": "Cypriot First Division",
      "pt": "Cypriot First Division"
    }
  },
  "ecuador_ligapro": {
    "name": "Liga Pro Ecuador",
    "id": 242,
    "names": {
      "fr": "Liga Pro (Équateur)",
      "en": "Ecuadorian Liga Pro",
      "es": "Ecuadorian Liga Pro",
      "es-mx": "Ecuadorian Liga Pro",
      "de": "Ecuadorian Liga Pro",
      "it": "Ecuadorian Liga Pro",
      "pt": "Ecuadorian Liga Pro"
    }
  },
  "efl_trophy": {
    "name": "EFL Trophy",
    "id": 46,
    "names": {
      "fr": "EFL Trophy",
      "en": "EFL Trophy",
      "es": "EFL Trophy",
      "es-mx": "EFL Trophy",
      "de": "EFL Trophy",
      "it": "EFL Trophy",
      "pt": "EFL Trophy"
    }
  },
  "finland_veikkausliiga": {
    "name": "Veikkausliiga",
    "id": 244,
    "names": {
      "fr": "Veikkausliiga (Finlande)",
      "en": "Veikkausliiga",
      "es": "Veikkausliiga",
      "es-mx": "Veikkausliiga",
      "de": "Veikkausliiga",
      "it": "Veikkausliiga",
      "pt": "Veikkausliiga"
    }
  },
  "georgia_erovnuli": {
    "name": "Erovnuli Liga",
    "id": 327,
    "names": {
      "fr": "Championnat de Géorgie",
      "en": "Erovnuli Liga",
      "es": "Erovnuli Liga",
      "es-mx": "Erovnuli Liga",
      "de": "Erovnuli Liga",
      "it": "Erovnuli Liga",
      "pt": "Erovnuli Liga"
    }
  },
  "hungary_nb1": {
    "name": "NB I",
    "id": 271,
    "names": {
      "fr": "Championnat de Hongrie (NB I)",
      "en": "Hungarian NB I",
      "es": "Hungarian NB I",
      "es-mx": "Hungarian NB I",
      "de": "Hungarian NB I",
      "it": "Hungarian NB I",
      "pt": "Hungarian NB I"
    }
  },
  "india_superleague": {
    "name": "Indian Super League",
    "id": 323,
    "names": {
      "fr": "Indian Super League",
      "en": "Indian Super League",
      "es": "Indian Super League",
      "es-mx": "Indian Super League",
      "de": "Indian Super League",
      "it": "Indian Super League",
      "pt": "Indian Super League"
    }
  },
  "ireland_premier": {
    "name": "League of Ireland Premier Division",
    "id": 357,
    "names": {
      "fr": "Championnat d'Irlande",
      "en": "League of Ireland Premier Division",
      "es": "League of Ireland Premier Division",
      "es-mx": "League of Ireland Premier Division",
      "de": "League of Ireland Premier Division",
      "it": "League of Ireland Premier Division",
      "pt": "League of Ireland Premier Division"
    }
  },
  "israel_ligat_haal": {
    "name": "Ligat Ha'al",
    "id": 383,
    "names": {
      "fr": "Championnat d'Israël",
      "en": "Israeli Premier League",
      "es": "Israeli Premier League",
      "es-mx": "Israeli Premier League",
      "de": "Israeli Premier League",
      "it": "Israeli Premier League",
      "pt": "Israeli Premier League"
    }
  },
  "latvia_virsliga": {
    "name": "Virsliga",
    "id": 365,
    "names": {
      "fr": "Championnat de Lettonie",
      "en": "Latvian Virslīga",
      "es": "Latvian Virslīga",
      "es-mx": "Latvian Virslīga",
      "de": "Latvian Virslīga",
      "it": "Latvian Virslīga",
      "pt": "Latvian Virslīga"
    }
  },
  "mexico_expansion": {
    "name": "Liga de Expansion MX",
    "id": 263,
    "names": {
      "fr": "Liga de Expansión MX",
      "en": "Liga de Expansión MX",
      "es": "Liga de Expansión MX",
      "es-mx": "Liga de Expansión MX",
      "de": "Liga de Expansión MX",
      "it": "Liga de Expansión MX",
      "pt": "Liga de Expansión MX"
    }
  },
  "morocco_botola": {
    "name": "Botola Pro",
    "id": 200,
    "names": {
      "fr": "Botola Pro (Maroc)",
      "en": "Botola Pro",
      "es": "Botola Pro",
      "es-mx": "Botola Pro",
      "de": "Botola Pro",
      "it": "Botola Pro",
      "pt": "Botola Pro"
    }
  },
  "paraguay_primera": {
    "name": "Division Profesional Paraguay",
    "id": 252,
    "names": {
      "fr": "Championnat du Paraguay",
      "en": "Paraguayan Primera División",
      "es": "Paraguayan Primera División",
      "es-mx": "Paraguayan Primera División",
      "de": "Paraguayan Primera División",
      "it": "Paraguayan Primera División",
      "pt": "Paraguayan Primera División"
    }
  },
  "portugal_segunda": {
    "name": "Liga Portugal 2",
    "id": 95,
    "names": {
      "fr": "Liga Portugal 2",
      "en": "Liga Portugal 2",
      "es": "Liga Portugal 2",
      "es-mx": "Liga Portugal 2",
      "de": "Liga Portugal 2",
      "it": "Liga Portugal 2",
      "pt": "Liga Portugal 2"
    }
  },
  "qatar_stars": {
    "name": "Qatar Stars League",
    "id": 305,
    "names": {
      "fr": "Qatar Stars League",
      "en": "Qatar Stars League",
      "es": "Qatar Stars League",
      "es-mx": "Qatar Stars League",
      "de": "Qatar Stars League",
      "it": "Qatar Stars League",
      "pt": "Qatar Stars League"
    }
  },
  "romania_liga1": {
    "name": "Liga I Romania",
    "id": 283,
    "names": {
      "fr": "Championnat de Roumanie (Liga I)",
      "en": "Romanian Liga I",
      "es": "Romanian Liga I",
      "es-mx": "Romanian Liga I",
      "de": "Romanian Liga I",
      "it": "Romanian Liga I",
      "pt": "Romanian Liga I"
    }
  },
  "russia_cup": {
    "name": "Russian Cup",
    "id": 237,
    "names": {
      "fr": "Coupe de Russie",
      "en": "Russian Cup",
      "es": "Russian Cup",
      "es-mx": "Russian Cup",
      "de": "Russian Cup",
      "it": "Russian Cup",
      "pt": "Russian Cup"
    }
  },
  "russia_first": {
    "name": "Russian First League",
    "id": 236,
    "names": {
      "fr": "Première Ligue russe (D2)",
      "en": "Russian First League",
      "es": "Russian First League",
      "es-mx": "Russian First League",
      "de": "Russian First League",
      "it": "Russian First League",
      "pt": "Russian First League"
    }
  },
  "russia_premier": {
    "name": "Russian Premier League",
    "id": 235,
    "names": {
      "fr": "Championnat de Russie",
      "en": "Russian Premier League",
      "es": "Russian Premier League",
      "es-mx": "Russian Premier League",
      "de": "Russian Premier League",
      "it": "Russian Premier League",
      "pt": "Russian Premier League"
    }
  },
  "serbia_superliga": {
    "name": "Super Liga Serbia",
    "id": 286,
    "names": {
      "fr": "Championnat de Serbie",
      "en": "Serbian SuperLiga",
      "es": "Serbian SuperLiga",
      "es-mx": "Serbian SuperLiga",
      "de": "Serbian SuperLiga",
      "it": "Serbian SuperLiga",
      "pt": "Serbian SuperLiga"
    }
  },
  "slovakia_superliga": {
    "name": "Super Liga Slovakia",
    "id": 332,
    "names": {
      "fr": "Championnat de Slovaquie",
      "en": "Slovak Super Liga",
      "es": "Slovak Super Liga",
      "es-mx": "Slovak Super Liga",
      "de": "Slovak Super Liga",
      "it": "Slovak Super Liga",
      "pt": "Slovak Super Liga"
    }
  },
  "sweden_superettan": {
    "name": "Superettan",
    "id": 114,
    "names": {
      "fr": "Superettan (Suède)",
      "en": "Superettan",
      "es": "Superettan",
      "es-mx": "Superettan",
      "de": "Superettan",
      "it": "Superettan",
      "pt": "Superettan"
    }
  },
  "thailand_league1": {
    "name": "Thai League 1",
    "id": 296,
    "names": {
      "fr": "Thai League 1",
      "en": "Thai League 1",
      "es": "Thai League 1",
      "es-mx": "Thai League 1",
      "de": "Thai League 1",
      "it": "Thai League 1",
      "pt": "Thai League 1"
    }
  },
  "turkey_1lig": {
    "name": "1. Lig",
    "id": 204,
    "names": {
      "fr": "1. Lig (Turquie)",
      "en": "Turkish 1. Lig",
      "es": "Turkish 1. Lig",
      "es-mx": "Turkish 1. Lig",
      "de": "Turkish 1. Lig",
      "it": "Turkish 1. Lig",
      "pt": "Turkish 1. Lig"
    }
  },
  "ukraine_premier": {
    "name": "Ukrainian Premier League",
    "id": 333,
    "names": {
      "fr": "Championnat d'Ukraine",
      "en": "Ukrainian Premier League",
      "es": "Ukrainian Premier League",
      "es-mx": "Ukrainian Premier League",
      "de": "Ukrainian Premier League",
      "it": "Ukrainian Premier League",
      "pt": "Ukrainian Premier League"
    }
  },
  "uae_proleague": {
    "name": "UAE Pro League",
    "id": 301,
    "names": {
      "fr": "Pro League (Émirats)",
      "en": "UAE Pro League",
      "es": "UAE Pro League",
      "es-mx": "UAE Pro League",
      "de": "UAE Pro League",
      "it": "UAE Pro League",
      "pt": "UAE Pro League"
    }
  },
  "uruguay_primera": {
    "name": "Primera Division Uruguay",
    "id": 268,
    "names": {
      "fr": "Championnat d'Uruguay",
      "en": "Uruguayan Primera División",
      "es": "Uruguayan Primera División",
      "es-mx": "Uruguayan Primera División",
      "de": "Uruguayan Primera División",
      "it": "Uruguayan Primera División",
      "pt": "Uruguayan Primera División"
    }
  },
  "afc_champions_elite": {
    "name": "AFC Champions League Elite",
    "id": 17,
    "names": {
      "fr": "Ligue des champions d'Asie Élite",
      "en": "AFC Champions League Elite",
      "es": "AFC Champions League Elite",
      "es-mx": "AFC Champions League Elite",
      "de": "AFC Champions League Elite",
      "it": "AFC Champions League Elite",
      "pt": "AFC Champions League Elite"
    }
  },
  "afc_champions_two": {
    "name": "AFC Champions League Two",
    "id": 18,
    "names": {
      "fr": "Ligue des champions d'Asie 2",
      "en": "AFC Champions League Two",
      "es": "AFC Champions League Two",
      "es-mx": "AFC Champions League Two",
      "de": "AFC Champions League Two",
      "it": "AFC Champions League Two",
      "pt": "AFC Champions League Two"
    }
  },
  "afcon_qualifiers": {
    "name": "Africa Cup of Nations Qualification",
    "id": 36,
    "names": {
      "fr": "Éliminatoires de la Coupe d'Afrique des nations",
      "en": "Africa Cup of Nations Qualification",
      "es": "Africa Cup of Nations Qualification",
      "es-mx": "Africa Cup of Nations Qualification",
      "de": "Africa Cup of Nations Qualification",
      "it": "Africa Cup of Nations Qualification",
      "pt": "Africa Cup of Nations Qualification"
    }
  },
  "concacaf_nations_league": {
    "name": "CONCACAF Nations League",
    "id": 536,
    "names": {
      "fr": "Ligue des nations de la CONCACAF",
      "en": "CONCACAF Nations League",
      "es": "CONCACAF Nations League",
      "es-mx": "CONCACAF Nations League",
      "de": "CONCACAF Nations League",
      "it": "CONCACAF Nations League",
      "pt": "CONCACAF Nations League"
    }
  },
  "colombia_primera_a": {
    "name": "Primera A Colombia",
    "id": 239
  },
  "peru_primera": {
    "name": "Liga 1 Peru",
    "id": 281
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
