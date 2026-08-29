"use strict";
// Manifeste des pages localisees pour scripts/build-locales.js. Chaque regle
// "find" doit correspondre EXACTEMENT au nombre d'occurrences attendu dans
// le fichier source FR (verifie par le build - echoue plutot que generer
// une traduction partielle silencieuse). Les predicats de correspondance
// JS qui matchent le contenu brut de data.json (ex. getMarketKey() dans
// marches.html) ne sont volontairement PAS traduits : data.json reste une
// ressource globale non localisee (memes valeurs quelle que soit la langue
// de la page qui l'affiche).

function marketNames(d) { return d.market_names; }

var jsStr = require("./js-escape.js").jsStr;
var FR_DICT = require("../i18n/dict/fr.json");

// Donnees des championnats affiches sur l'Accueil (index.html). "name" est
// un identifiant sportif propre (Premier League, La Liga, Bundesliga...)
// et reste IDENTIQUE dans toutes les langues (voir consigne explicite :
// "les noms propres d'equipes/joueurs/competitions restent coherents, on
// traduit l'interface pas les identifiants sportifs") - sauf 'ldc'/'other'
// qui sont deja des libelles en francais dans la source (pas de vrais noms
// propres internationaux), traduits via i18n/dict/*.json#special_competitions.
// "country" est un nom de pays, traduit via #countries.
var LEAGUE_META = [
  {key:'premier', flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', name:'Premier League', country:'Angleterre'},
  {key:'champ', flag:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', name:'Championship', country:'Angleterre'},
  {key:'ligue1', flag:'🇫🇷', name:'Ligue 1', country:'France'},
  {key:'ligue2', flag:'🇫🇷', name:'Ligue 2', country:'France'},
  {key:'laliga', flag:'🇪🇸', name:'La Liga', country:'Espagne'},
  {key:'laliga2', flag:'🇪🇸', name:'La Liga 2', country:'Espagne'},
  {key:'seriea', flag:'🇮🇹', name:'Serie A', country:'Italie'},
  {key:'bundesliga', flag:'🇩🇪', name:'Bundesliga', country:'Allemagne'},
  {key:'ldc', flag:'🏆', name:'Ligue des Champions', country:null, specialKey:'ldc'},
  {key:'el', flag:'🏆', name:'Europa League', country:null},
  {key:'wc', flag:'🌍', name:'World Cup', country:null},
  {key:'other', flag:'🏆', name:'Coupe du Monde', country:null, specialKey:'other'},
  {key:'atp', flag:'🎾', name:'ATP', country:null},
  {key:'wta', flag:'🎾', name:'WTA', country:null},
  {key:'chine', flag:'🇨🇳', name:'Super League', country:'Chine'},
  {key:'finlande', flag:'🇫🇮', name:'Veikkausliiga', country:'Finlande'},
  {key:'maroc', flag:'🇲🇦', name:'Botola Pro', country:'Maroc'},
  {key:'canada', flag:'🇨🇦', name:'Canadian Premier', country:'Canada'},
  {key:'lettonie', flag:'🇱🇻', name:'Virsliga', country:'Lettonie'},
  {key:'islande', flag:'🇮🇸', name:'Úrvalsdeild', country:'Islande'},
  {key:'equateur', flag:'🇪🇨', name:'Liga Pro', country:'Équateur'},
  {key:'lituanie', flag:'🇱🇹', name:'A Lyga', country:'Lituanie'},
  {key:'eredivisie', flag:'🇳🇱', name:'Eredivisie', country:'Pays-Bas'},
  {key:'primeira', flag:'🇵🇹', name:'Primeira Liga', country:'Portugal'},
  {key:'superlig', flag:'🇹🇷', name:'Süper Lig', country:'Turquie'},
  {key:'superliga-dk', flag:'🇩🇰', name:'Superliga', country:'Danemark'},
  {key:'scottish', flag:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', name:'Premiership', country:'Écosse'},
  {key:'belgique', flag:'🇧🇪', name:'Jupiler Pro League', country:'Belgique'},
  {key:'kleague', flag:'🇰🇷', name:'K League 1', country:'Corée du Sud'},
  {key:'coupe-france', flag:'🇫🇷', name:'Coupe de France', country:'France'},
  {key:'saudi', flag:'🇸🇦', name:'Saudi Pro League', country:'Arabie Saoudite'},
  {key:'copa-rey', flag:'🇪🇸', name:'Copa del Rey', country:'Espagne'},
  {key:'coppa-italia', flag:'🇮🇹', name:'Coppa Italia', country:'Italie'},
  {key:'dfb-pokal', flag:'🇩🇪', name:'DFB-Pokal', country:'Allemagne'},
  {key:'irlande', flag:'🇮🇪', name:'Premier Division', country:'Irlande'},
  {key:'suede', flag:'🇸🇪', name:'Allsvenskan', country:'Suède'},
  {key:'bresil', flag:'🇧🇷', name:'Brasileirão Série A', country:'Brésil'},
  {key:'mls', flag:'🇺🇸', name:'MLS', country:'USA'},
  {key:'ligamx', flag:'🇲🇽', name:'Liga MX', country:'Mexique'}
];

function renderLeagueLabels(dict) {
  var lines = LEAGUE_META.map(function (entry) {
    var name = entry.specialKey ? dict.special_competitions[entry.specialKey] : entry.name;
    var country = entry.country ? "'" + jsStr(dict.countries[entry.country]) + "'" : "null";
    return "  '" + entry.key + "':{flag:'" + entry.flag + "',name:'" + jsStr(name) + "',country:" + country + "},";
  });
  return "var LEAGUE_LABELS={\n" + lines.join("\n") + "\n};";
}
var LEAGUE_LABELS_FR_TEXT = renderLeagueLabels(FR_DICT);

var PAGES = [
  {
    file: "marches.html",
    metas: {
      fr: {title: "Marchés — IASHARK", description: "Analyse des marchés disponibles : probabilité modèle, probabilité de marché (retrait de marge), écart, qualité des données — par match et par catalogue de marchés."},
      en: {title: "Markets — IASHARK", description: "Analysis of available markets: model probability, market probability (margin removed), gap, data quality — per match and full market catalogue."},
      es: {title: "Mercados — IASHARK", description: "Análisis de los mercados disponibles: probabilidad del modelo, probabilidad de mercado (margen retirado), diferencia, calidad de los datos — por partido y catálogo completo de mercados."},
      de: {title: "Märkte — IASHARK", description: "Analyse der verfügbaren Märkte: Modellwahrscheinlichkeit, Marktwahrscheinlichkeit (ohne Marge), Differenz, Datenqualität — pro Spiel und vollständiger Marktkatalog."},
      it: {title: "Mercati — IASHARK", description: "Analisi dei mercati disponibili: probabilità del modello, probabilità di mercato (margine rimosso), differenza, qualità dei dati — per partita e catalogo completo dei mercati."},
      pt: {title: "Mercados — IASHARK", description: "Análise dos mercados disponíveis: probabilidade do modelo, probabilidade de mercado (margem removida), diferença, qualidade dos dados — por jogo e catálogo completo de mercados."}
    },
    replacements: [
      {find: 'class="btn-login">CONNEXION<', build: function(d){ return 'class="btn-login">' + d.cta.login + '<'; }},
      {find: "<h1>Analyse des <span>marchés</span></h1>", build: function(d){ return "<h1>" + d.markets_page.title_pre + "<span>" + d.markets_page.title_hl + "</span></h1>"; }},
      {find: '<p class="sub">Probabilité du modèle, probabilité de marché (marge retirée) et écart entre les deux — par match, et catalogue complet des marchés supportés par le moteur.</p>', build: function(d){ return '<p class="sub">' + d.markets_page.subtitle + "</p>"; }},
      {find: "<div class=\"sec-title\">MARCHÉS DU JOUR</div>", key: "markets_page.section_today", build: function(d){ return '<div class="sec-title">' + d.markets_page.section_today + "</div>"; }},
      {find: '<option value="">Tous les marchés</option>', build: function(d){ return '<option value="">' + d.markets_page.filter_all_markets + "</option>"; }},
      {find: '<option value="over25">Plus de 2,5 buts</option>', build: function(d){ return '<option value="over25">' + d.market_names.over25 + "</option>"; }},
      {find: '<option value="under25">Moins de 2,5 buts</option>', build: function(d){ return '<option value="under25">' + d.market_names.under25 + "</option>"; }},
      {find: '<option value="btts_oui">BTTS Oui</option>', build: function(d){ return '<option value="btts_oui">' + d.market_names.btts_oui + "</option>"; }},
      {find: '<option value="btts_non">BTTS Non</option>', build: function(d){ return '<option value="btts_non">' + d.market_names.btts_non + "</option>"; }},
      {find: '<option value="dc1x">DC 1X</option>', build: function(d){ return '<option value="dc1x">' + d.market_names.dc1x + "</option>"; }},
      {find: '<option value="dc_x2">DC X2</option>', build: function(d){ return '<option value="dc_x2">' + d.market_names.dc_x2 + "</option>"; }},
      {find: '<option value="victoire_dom">Victoire domicile</option>', build: function(d){ return '<option value="victoire_dom">' + d.market_names.victoire_dom + "</option>"; }},
      {find: '<option value="victoire_ext">Victoire extérieur</option>', build: function(d){ return '<option value="victoire_ext">' + d.market_names.victoire_ext + "</option>"; }},
      {find: '<option value="date">Trier : heure</option>', build: function(d){ return '<option value="date">' + d.markets_page.sort_time + "</option>"; }},
      {find: '<option value="ecart">Trier : écart modèle/marché</option>', build: function(d){ return '<option value="ecart">' + d.markets_page.sort_gap + "</option>"; }},
      {find: '<option value="qualite">Trier : qualité des données</option>', build: function(d){ return '<option value="qualite">' + d.markets_page.sort_quality + "</option>"; }},
      {find: '<div id="matchMarketsWrap"><div class="empty-state">CHARGEMENT…</div></div>', build: function(d){ return '<div id="matchMarketsWrap"><div class="empty-state">' + d.common.loading + "</div></div>"; }},
      {find: '<div class="sec-title">CATALOGUE DES MARCHÉS</div>', build: function(d){ return '<div class="sec-title">' + d.markets_page.section_catalog + "</div>"; }},
      {find: "<thead><tr><th>Marché</th><th>Catégorie</th><th>Statut</th></tr></thead>", build: function(d){ return "<thead><tr><th>" + d.markets_page.table_market + "</th><th>" + d.markets_page.table_category + "</th><th>" + d.markets_page.table_status + "</th></tr></thead>"; }},
      {find:
        '  <p style="font-family:\'Space Mono\',monospace;font-size:8px;color:var(--muted);margin-top:10px;line-height:1.8;">\n' +
        '    <b style="color:var(--green);">MODÉLISÉ ET VALIDÉ</b> : modèle + résolution automatique + tests — probabilité affichée sur les fiches match.<br>\n' +
        '    <b style="color:var(--amber);">EXPÉRIMENTAL</b> : modèle testé mathématiquement, résolution automatique pas encore implémentée.<br>\n' +
        "    <b style=\"color:var(--muted);\">NON SUPPORTÉ</b> : nécessite une donnée ou un modèle qui n'existe pas encore.\n" +
        "  </p>",
       build: function(d){
        var m = d.markets_page;
        return '  <p style="font-family:\'Space Mono\',monospace;font-size:8px;color:var(--muted);margin-top:10px;line-height:1.8;">\n' +
          '    <b style="color:var(--green);">' + m.status_validated + "</b> : " + m.legend_validated + "<br>\n" +
          '    <b style="color:var(--amber);">' + m.status_experimental + "</b> : " + m.legend_experimental + "<br>\n" +
          '    <b style="color:var(--muted);">' + m.status_unsupported + "</b> : " + m.legend_unsupported + "\n" +
          "  </p>";
      }},
      {find: '<div class="nav-lbl">ACCUEIL</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.home + "</div>"; }},
      {find: '<div class="nav-lbl">MARCHÉS</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.markets + "</div>"; }},
      {find: '<div class="nav-lbl">OUTILS</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.tools + "</div>"; }},
      {find: '<div class="nav-lbl">GUIDES</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.guides + "</div>"; }},
      {find: '<div class="nav-lbl">COMPTE</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.account + "</div>"; }},
      {find:
        "    <div>⚠️ LE JEU PEUT ÊTRE DANGEREUX — JOUEZ RESPONSABLE · INTERDIT AUX MOINS DE 18 ANS</div>\n" +
        '    <div>Aide : <a href="https://www.joueurs-info-service.fr" style="color:rgba(34,211,238,0.4);text-decoration:none;">joueurs-info-service.fr</a> · 09 74 75 13 13</div>',
       build: function(d){
        var f = d.footer;
        return "    <div>⚠️ " + f.disclaimer_warning + "</div>\n" +
          "    <div>" + f.disclaimer_help_label + ' <a href="https://www.joueurs-info-service.fr" style="color:rgba(34,211,238,0.4);text-decoration:none;">' + f.disclaimer_help_site + "</a> · " + f.disclaimer_help_phone + "</div>";
      }},
      {find: "var STATUS_LABEL={validated:'MODÉLISÉ ET VALIDÉ',experimental:'EXPÉRIMENTAL',unsupported:'NON SUPPORTÉ'};", build: function(d, l, esc){
        var m = d.markets_page;
        return "var STATUS_LABEL={validated:'" + esc(m.status_validated) + "',experimental:'" + esc(m.status_experimental) + "',unsupported:'" + esc(m.status_unsupported) + "'};";
      }},
      {find: "{label:'Résultat du match (1X2)',category:'1X2',status:'validated'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c1) + "',category:'1X2',status:'validated'},"; }},
      {find: "{label:'Double Chance (1X / X2 / 12)',category:'1X2',status:'validated'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c2) + "',category:'1X2',status:'validated'},"; }},
      {find: "{label:'Draw No Bet',category:'1X2',status:'validated'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c3) + "',category:'1X2',status:'validated'},"; }},
      {find: "{label:'Total de buts (O/U 0.5 à 6.5)',category:'BUTS',status:'validated'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c4) + "',category:'BUTS',status:'validated'},"; }},
      {find: "{label:'Totaux par équipe',category:'BUTS',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c5) + "',category:'BUTS',status:'experimental'},"; }},
      {find: "{label:'BTTS',category:'BUTS',status:'validated'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c6) + "',category:'BUTS',status:'validated'},"; }},
      {find: "{label:'Clean sheet',category:'BUTS',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c7) + "',category:'BUTS',status:'experimental'},"; }},
      {find: "{label:'Gagne sans encaisser',category:'BUTS',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c8) + "',category:'BUTS',status:'experimental'},"; }},
      {find: "{label:'Score exact',category:'BUTS',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c9) + "',category:'BUTS',status:'experimental'},"; }},
      {find: "{label:'Bandes de buts',category:'BUTS',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c10) + "',category:'BUTS',status:'experimental'},"; }},
      {find: "{label:'Handicap (lignes entières/demi)',category:'HANDICAP',status:'validated'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c11) + "',category:'HANDICAP',status:'validated'},"; }},
      {find: "{label:'Handicap asiatique (quart .25/.75)',category:'HANDICAP',status:'unsupported'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c12) + "',category:'HANDICAP',status:'unsupported'},"; }},
      {find: "{label:'Marchés mi-temps',category:'TEMPS',status:'unsupported'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c13) + "',category:'TEMPS',status:'unsupported'},"; }},
      {find: "{label:'Corners',category:'CORNERS',status:'unsupported'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c14) + "',category:'CORNERS',status:'unsupported'},"; }},
      {find: "{label:'Cartons',category:'CARTONS',status:'unsupported'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c15) + "',category:'CARTONS',status:'unsupported'},"; }},
      {find: "{label:'Player props',category:'JOUEURS',status:'unsupported'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c16) + "',category:'JOUEURS',status:'unsupported'},"; }},
      {find: "var CATEGORY_LABEL={'1X2':'1X2','BUTS':'BUTS','HANDICAP':'HANDICAP','TEMPS':'TEMPS','CORNERS':'CORNERS','CARTONS':'CARTONS','JOUEURS':'JOUEURS'};", build: function(d, l, esc){
        var c = d.market_catalog_cat;
        return "var CATEGORY_LABEL={'1X2':'" + esc(c["1X2"]) + "','BUTS':'" + esc(c.BUTS) + "','HANDICAP':'" + esc(c.HANDICAP) + "','TEMPS':'" + esc(c.TEMPS) + "','CORNERS':'" + esc(c.CORNERS) + "','CARTONS':'" + esc(c.CARTONS) + "','JOUEURS':'" + esc(c.JOUEURS) + "'};";
      }},
      {find: "var DATA_QUALITY_LABELS={'Élevée':'ÉLEVÉE','Moyenne':'MOYENNE','Faible':'FAIBLE'};", build: function(d, l, esc){
        var q = d.data_quality;
        return "var DATA_QUALITY_LABELS={'Élevée':'" + esc(q["Élevée"]) + "','Moyenne':'" + esc(q["Moyenne"]) + "','Faible':'" + esc(q["Faible"]) + "'};";
      }},
      {find: "var MARKET_KEY_LABELS={over25:'Plus de 2,5 buts',under25:'Moins de 2,5 buts',btts_oui:'BTTS Oui',btts_non:'BTTS Non',dc1x:'DC 1X',dc_x2:'DC X2',victoire_dom:'Victoire domicile',victoire_ext:'Victoire extérieur'};", build: function(d, l, esc){
        var n = d.market_names;
        return "var MARKET_KEY_LABELS={over25:'" + esc(n.over25) + "',under25:'" + esc(n.under25) + "',btts_oui:'" + esc(n.btts_oui) + "',btts_non:'" + esc(n.btts_non) + "',dc1x:'" + esc(n.dc1x) + "',dc_x2:'" + esc(n.dc_x2) + "',victoire_dom:'" + esc(n.victoire_dom) + "',victoire_ext:'" + esc(n.victoire_ext) + "'};";
      }},
      {find: "wrap.innerHTML='<div class=\"empty-state\">AUCUN MARCHÉ EXPLOITABLE AUJOURD\\'HUI<br><span style=\"color:rgba(74,101,128,0.6)\">Revenez plus tard, ou consultez le catalogue des marchés ci-dessous.</span></div>';", build: function(d, l, esc){
        var m = d.markets_page;
        return "wrap.innerHTML='<div class=\"empty-state\">" + esc(m.empty_today) + "<br><span style=\"color:rgba(74,101,128,0.6)\">" + esc(m.empty_today_sub) + "</span></div>';";
      }},
      {find: "wrap.innerHTML='<table class=\"mtable\"><thead><tr><th>Match</th><th>Heure</th><th>Marché</th><th>Proba modèle</th><th>Cote</th><th>Écart</th><th>Qualité</th></tr></thead><tbody>'", build: function(d, l, esc){
        var m = d.markets_page;
        return "wrap.innerHTML='<table class=\"mtable\"><thead><tr><th>" + esc(m.table_match) + "</th><th>" + esc(m.table_time) + "</th><th>" + esc(m.table_market) + "</th><th>" + esc(m.table_prob) + "</th><th>" + esc(m.table_odds) + "</th><th>" + esc(m.table_gap) + "</th><th>" + esc(m.table_quality) + "</th></tr></thead><tbody>'";
      }}
    ]
  },
  {
    file: "index.html",
    metas: {
      fr: {title: "IASHARK — Pronostics IA · Football", description: "Pronostics football alimentés par l'intelligence artificielle. Analyses statistiques, edge IA et value bets quotidiens."},
      en: {title: "IASHARK — AI Football Predictions", description: "Football predictions powered by artificial intelligence. Statistical analysis, AI edge and daily value bets."},
      es: {title: "IASHARK — Pronósticos de Fútbol con IA", description: "Pronósticos de fútbol impulsados por inteligencia artificial. Análisis estadístico, ventaja de IA y value bets diarios."},
      de: {title: "IASHARK — KI-Fußballvorhersagen", description: "Fußballvorhersagen, angetrieben von künstlicher Intelligenz. Statistische Analysen, KI-Edge und tägliche Value Bets."},
      it: {title: "IASHARK — Pronostici Calcio con IA", description: "Pronostici calcistici basati sull'intelligenza artificiale. Analisi statistiche, edge IA e value bet quotidiane."},
      pt: {title: "IASHARK — Previsões de Futebol com IA", description: "Previsões de futebol baseadas em inteligência artificial. Análises estatísticas, edge de IA e value bets diários."}
    },
    replacements: [
      {find: '"description":"Pronostics football alimentés par l\'intelligence artificielle."', build: function(d, l, esc){ return '"description":"' + esc(d.home_page.org_description) + '"'; }},
      {find: 'class="btn-login">CONNEXION<', build: function(d){ return 'class="btn-login">' + d.cta.login + '<'; }},
      {find: '<h1 class="hp-title">Aucune émotion.<br><b>Que des probabilités.</b></h1>', build: function(d){ var h=d.home_page; return '<h1 class="hp-title">' + h.hero_line1 + '<br><b>' + h.hero_line2 + '</b></h1>'; }},
      {find: '<p class="hp-sub">Chaque match est passé au crible à partir de vraies données : <b>buts attendus (xG), forme récente, fatigue du calendrier, face-à-face.</b> Pas de feeling, que du calcul.</p>', build: function(d){ var h=d.home_page; return '<p class="hp-sub">' + h.hero_sub_pre + '<b>' + h.hero_sub_bold + '</b>' + h.hero_sub_post + '</p>'; }},
      {find: '<span class="sport-icon">⚽</span> FOOTBALL', build: function(d){ return '<span class="sport-icon">⚽</span> ' + d.home_page.sport_football; }},
      {find: '<span class="sport-icon">🏀</span> BASKET', build: function(d){ return '<span class="sport-icon">🏀</span> ' + d.home_page.sport_basket; }},
      {find: '<span class="sport-icon">🏒</span> HOCKEY', build: function(d){ return '<span class="sport-icon">🏒</span> ' + d.home_page.sport_hockey; }},
      {find: '<span class="soon-tag">BIENTÔT</span>', count: 2, build: function(d){ return '<span class="soon-tag">' + d.home_page.soon + '</span>'; }},
      {find: '<a href="/a-propos.html" class="hp-method-pill">Notre méthode →</a>', build: function(d){ return '<a href="/a-propos.html" class="hp-method-pill">' + d.home_page.method_link + '</a>'; }},
      {find: 'placeholder="Rechercher une équipe, un championnat..."', build: function(d){ return 'placeholder="' + d.home_page.search_placeholder + '"'; }},
      {find: '<span id="champDropdownLabel">TOUS LES CHAMPIONNATS</span>', build: function(d){ return '<span id="champDropdownLabel">' + d.home_page.all_leagues_upper + '</span>'; }},
      {find: '>AUJOURD\'HUI <span class="tab-count" id="countToday">—</span>', build: function(d){ return '>' + d.home_page.today + ' <span class="tab-count" id="countToday">—</span>'; }},
      {find: '>DEMAIN <span class="tab-count" id="countTomorrow">—</span>', build: function(d){ return '>' + d.home_page.tomorrow + ' <span class="tab-count" id="countTomorrow">—</span>'; }},
      {find: '<div class="loading-text">CHARGEMENT DES ANALYSES...</div>', build: function(d){ return '<div class="loading-text">' + d.home_page.loading_analyses + '</div>'; }},
      {find:
        '    <div>⚠️ LE JEU PEUT ÊTRE DANGEREUX — JOUEZ RESPONSABLE · INTERDIT AUX MOINS DE 18 ANS</div>\n' +
        '    <div>Aide : <a href="https://www.joueurs-info-service.fr" style="color:rgba(34,211,238,0.4);text-decoration:none;">joueurs-info-service.fr</a> · 09 74 75 13 13</div>\n' +
        '    <div style="margin-top:8px;">\n' +
        '      <a href="/mentions-legales.html" style="color:rgba(74,101,128,0.6);text-decoration:none;margin:0 8px;">Mentions légales</a>\n' +
        '      <a href="/cgv.html" style="color:rgba(74,101,128,0.6);text-decoration:none;margin:0 8px;">CGV</a>\n' +
        '      <a href="/confidentialite.html" style="color:rgba(74,101,128,0.6);text-decoration:none;margin:0 8px;">Confidentialité</a>\n' +
        '    </div>',
       build: function(d){
        var f = d.footer;
        return '    <div>⚠️ ' + f.disclaimer_warning + '</div>\n' +
          '    <div>' + f.disclaimer_help_label + ' <a href="https://www.joueurs-info-service.fr" style="color:rgba(34,211,238,0.4);text-decoration:none;">' + f.disclaimer_help_site + '</a> · ' + f.disclaimer_help_phone + '</div>\n' +
          '    <div style="margin-top:8px;">\n' +
          '      <a href="/mentions-legales.html" style="color:rgba(74,101,128,0.6);text-decoration:none;margin:0 8px;">' + f.mentions_legales + '</a>\n' +
          '      <a href="/cgv.html" style="color:rgba(74,101,128,0.6);text-decoration:none;margin:0 8px;">' + f.cgv + '</a>\n' +
          '      <a href="/confidentialite.html" style="color:rgba(74,101,128,0.6);text-decoration:none;margin:0 8px;">' + f.confidentialite + '</a>\n' +
          '    </div>';
      }},
      {find: '<div class="nav-lbl">ACCUEIL</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.home + '</div>'; }},
      {find: '<div class="nav-lbl">MARCHÉS</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.markets + '</div>'; }},
      {find: '<div class="nav-lbl">HISTORIQUE</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.history + '</div>'; }},
      {find: '<div class="nav-lbl">OUTILS</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.tools + '</div>'; }},
      {find: '<div class="nav-lbl">GUIDES</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.guides + '</div>'; }},
      {find: '<div class="nav-lbl">COMPTE</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.account + '</div>'; }},
      {find: LEAGUE_LABELS_FR_TEXT, build: function(d){ return renderLeagueLabels(d); }},
      {find: "return'Plus de 2,5 buts';if(s.includes('under 2.5'))return'Moins de 2,5 buts';if(s.includes('over 1.5'))return'Plus de 1,5 but';if(s.includes('btts non')||s.includes('une équipe ne marque'))return'Une équipe ne marque pas';if(s.includes('btts')||s.includes('les deux équipes'))return'Les deux équipes marquent';if(s.includes('dc 1x')||s==='1x')return'DC 1X';if(s.includes('dc x2')||s==='x2')return'DC X2';return r;}",
       build: function(d, l, esc){
        var n = d.market_names, nat = d.market_names_natural;
        return "return'" + esc(n.over25) + "';if(s.includes('under 2.5'))return'" + esc(n.under25) + "';if(s.includes('over 1.5'))return'" + esc(n.over15) + "';if(s.includes('btts non')||s.includes('une équipe ne marque'))return'" + esc(nat.btts_non_natural) + "';if(s.includes('btts')||s.includes('les deux équipes'))return'" + esc(nat.btts_oui_natural) + "';if(s.includes('dc 1x')||s==='1x')return'" + esc(n.dc1x) + "';if(s.includes('dc x2')||s==='x2')return'" + esc(n.dc_x2) + "';return r;}";
      }},
      {find: "return WC_TROPHY_EMOJI+' FIFA WORLD CUP 2026';", count: 1, build: function(){ return "return WC_TROPHY_EMOJI+' FIFA WORLD CUP 2026';"; }},
      {find: "var pariLabel=m.pari_rec?translateMarket(m.pari_rec):(m.no_signal_label||'Rien d\\'exploitable ici — on attend mieux.');", build: function(d, l, esc){ return "var pariLabel=m.pari_rec?translateMarket(m.pari_rec):(m.no_signal_label||'" + esc(d.home_page.no_signal_fallback) + "');"; }},
      {find: "var pl=m.pari_rec?translateMarket(m.pari_rec):(m.no_signal_label||'Rien d\\'exploitable ici — on attend mieux.');", build: function(d, l, esc){ return "var pl=m.pari_rec?translateMarket(m.pari_rec):(m.no_signal_label||'" + esc(d.home_page.no_signal_fallback) + "');"; }},
      {find: "<div class=\"choc-sub-lbl\">DOMICILE</div>", build: function(d){ return "<div class=\"choc-sub-lbl\">" + d.home_page.home_label + "</div>"; }},
      {find: "<div class=\"choc-sub-lbl\">EXTÉRIEUR</div>", build: function(d){ return "<div class=\"choc-sub-lbl\">" + d.home_page.away_label + "</div>"; }},
      {find: "<button class=\"mc-cta\">VOIR →</button></div>'", build: function(d, l, esc){ return "<button class=\"mc-cta\">" + esc(d.home_page.view_cta) + "</button></div>'"; }},
      {find: "<div class=\"prob-lbl-txt\">NUL</div>", build: function(d, l, esc){ return "<div class=\"prob-lbl-txt\">" + esc(d.home_page.draw_label) + "</div>"; }},
      {find: "el.innerHTML='<div class=\"cards-list\"><div class=\"empty-state\"><h3>'+(isDemain?'AUCUN MATCH DEMAIN':'AUCUN MATCH TROUVÉ')+'</h3><p>'+(isDemain?'Reviens ce soir pour les analyses de demain.':'Essaie un autre filtre ou reviens demain.')+'</p></div></div>';",
       build: function(d, l, esc){
        var h = d.home_page;
        return "el.innerHTML='<div class=\"cards-list\"><div class=\"empty-state\"><h3>'+(isDemain?'" + esc(h.no_match_tomorrow_title) + "':'" + esc(h.no_match_today_title) + "')+'</h3><p>'+(isDemain?'" + esc(h.no_match_tomorrow_sub) + "':'" + esc(h.no_match_today_sub) + "')+'</p></div></div>';";
      }},
      {find: "html+='<div class=\"sec-hdr\" style=\"margin-top:16px;\">PROCHAINS MATCHS — '+rest.length+' MATCH'+(rest.length>1?'S':'')+'</div>';",
       build: function(d, l, esc){
        var h = d.home_page;
        return "html+='<div class=\"sec-hdr\" style=\"margin-top:16px;\">" + esc(h.upcoming_matches_label) + " — '+rest.length+' '+(rest.length>1?'" + esc(h.match_plural) + "':'" + esc(h.match_singular) + "')+'</div>';";
      }},
      {find: "html+='<div class=\"sec-hdr\" style=\"margin-top:32px;opacity:0.5;\">PASSÉS / EN COURS</div>';",
       build: function(d, l, esc){ return "html+='<div class=\"sec-hdr\" style=\"margin-top:32px;opacity:0.5;\">" + esc(d.home_page.past_ongoing_label) + "</div>';"; }},
      {find: "html+='<div class=\"sec-hdr\">'+la.length+' MATCH'+(la.length>1?'S':'')+' À VENIR</div>';",
       build: function(d, l, esc){
        var h = d.home_page;
        return "html+='<div class=\"sec-hdr\">'+la.length+' '+(la.length>1?'" + esc(h.match_plural) + "':'" + esc(h.match_singular) + "')+' " + esc(h.matches_ahead_suffix) + "</div>';";
      }},
      {find: "html+='<div class=\"sec-hdr\" style=\"margin-top:24px;opacity:0.5;\">'+lp.length+' PASSÉS</div>';",
       build: function(d, l, esc){ return "html+='<div class=\"sec-hdr\" style=\"margin-top:24px;opacity:0.5;\">'+lp.length+' " + esc(d.home_page.past_label) + "</div>';"; }},
      {find: "document.getElementById('champDropdownLabel').textContent='TOUS LES CHAMPIONNATS';", count: 2, build: function(d, l, esc){ return "document.getElementById('champDropdownLabel').textContent='" + esc(d.home_page.all_leagues_upper) + "';"; }},
      {find: "'<div class=\"champ-item'+(currentFilter==='all'?' active':'')+'\" onclick=\"selectChampionnat(\\'all\\')\">🌐 Tous les championnats</div>'",
       build: function(d, l, esc){ return "'<div class=\"champ-item'+(currentFilter==='all'?' active':'')+'\" onclick=\"selectChampionnat(\\'all\\')\">🌐 " + esc(d.home_page.all_leagues_item) + "</div>'"; }},
      {find: "if(el)el.innerHTML='<div class=\"empty-state\"><h3>ERREUR CHARGEMENT</h3><p>Réessaie dans un instant.</p></div>';",
       build: function(d, l, esc){
        var h = d.home_page;
        return "if(el)el.innerHTML='<div class=\"empty-state\"><h3>" + esc(h.error_loading_title) + "</h3><p>" + esc(h.error_loading_retry) + "</p></div>';";
      }}
    ]
  }
];

module.exports = PAGES;
