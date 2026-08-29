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
      {find: '"description":"Pronostics football alimentés par l\'intelligence artificielle."', build: function(d){
        // Contexte JSON (JSON-LD), pas JS : \' n'est pas un echappement JSON
        // valide et casserait JSON.parse cote navigateur - seuls " et \
        // doivent etre echappes ici, jamais l'apostrophe.
        return '"description":"' + String(d.home_page.org_description).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
      }},
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
  },
  {
    /* match.html : la structure/chrome (nav, sections, libelles, paywall,
       parties templatees de "POURQUOI CE PARI") est traduite. Le contenu
       narratif genere par le pipeline/LLM par match (m.verdict_shark,
       m.facteur_x, m.key_absences, etc.) reste volontairement en francais -
       c'est un texte dynamique, jamais connu au moment du build i18n, et
       le traduire necessiterait une generation LLM multilingue au niveau
       du pipeline (decision separee, hors scope ici). Ce template est
       aussi celui que generateMatchPages() (update-data.yml) utilise pour
       produire /match/{id}.html (FR uniquement pour l'instant) - cette
       regeneration n'est pas affectee par ce fichier puisqu'elle lit
       toujours la racine match.html, jamais /fr/match.html. Etendre
       /match/{id}.html a /{locale}/match/{id}.html est la suite logique
       de ce chantier, pas faite dans cette passe (voir IASHARK_V2_EXECUTION_STATE.md). */
    file: "match.html",
    metas: {
      fr: {title: "Analyse Match — IASHARK"},
      en: {title: "Match Analysis — IASHARK"},
      es: {title: "Análisis del Partido — IASHARK"},
      de: {title: "Spielanalyse — IASHARK"},
      it: {title: "Analisi Partita — IASHARK"},
      pt: {title: "Análise do Jogo — IASHARK"}
    },
    replacements: [
      {find: '<a class="hdr-back" href="javascript:history.back()">← RETOUR</a>', build: function(d){ return '<a class="hdr-back" href="javascript:history.back()">' + d.match_page.back + '</a>'; }},
      {find: '<span id="authHeaderSlot"><a class="btn-conn" href="/compte.html">CONNEXION</a></span>', build: function(d){ return '<span id="authHeaderSlot"><a class="btn-conn" href="/compte.html">' + d.cta.login + '</a></span>'; }},
      {find: '<div class="loading-lbl">CHARGEMENT...</div>', build: function(d){ return '<div class="loading-lbl">' + d.common.loading + '</div>'; }},
      {find:
        '    <div>⚠️ LE JEU PEUT ÊTRE DANGEREUX — JOUEZ RESPONSABLE · INTERDIT AUX MOINS DE 18 ANS</div>\n' +
        '    <div>Aide : <a href="https://www.joueurs-info-service.fr" style="color:rgba(34,211,238,0.4);text-decoration:none;">joueurs-info-service.fr</a> · 09 74 75 13 13</div>',
       build: function(d){
        var f = d.footer;
        return '    <div>⚠️ ' + f.disclaimer_warning + '</div>\n' +
          '    <div>' + f.disclaimer_help_label + ' <a href="https://www.joueurs-info-service.fr" style="color:rgba(34,211,238,0.4);text-decoration:none;">' + f.disclaimer_help_site + '</a> · ' + f.disclaimer_help_phone + '</div>';
      }},
      {find: '<div class="nav-lbl">ACCUEIL</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.home + '</div>'; }},
      {find: '<div class="nav-lbl">MARCHÉS</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.markets + '</div>'; }},
      {find: '<div class="nav-lbl">HISTORIQUE</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.history + '</div>'; }},
      {find: '<div class="nav-lbl">PRO</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.tools + '</div>'; }},
      {find: '<div class="nav-lbl">GUIDES</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.guides + '</div>'; }},
      {find: '<div class="nav-lbl">COMPTE</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.account + '</div>'; }},
      {find: "el.innerHTML='<div style=\"text-align:center;padding:60px 20px;font-family:Space Mono,monospace;font-size:10px;color:var(--muted)\">ID MANQUANT<br><br><a href=\"/\" style=\"color:var(--cyan)\">← RETOUR</a></div>';",
       build: function(d, l, esc){ return "el.innerHTML='<div style=\"text-align:center;padding:60px 20px;font-family:Space Mono,monospace;font-size:10px;color:var(--muted)\">" + esc(d.match_page.id_missing) + "<br><br><a href=\"/\" style=\"color:var(--cyan)\">" + esc(d.match_page.back) + "</a></div>';"; }},
      {find: "el.innerHTML='<div style=\"text-align:center;padding:60px 20px\"><div style=\"font-family:Space Mono,monospace;font-size:10px;color:var(--muted)\">MATCH INTROUVABLE · ID: '+fId+'</div><br><a href=\"/\" style=\"color:var(--cyan);font-family:Space Mono,monospace;font-size:9px\">← RETOUR</a></div>';",
       build: function(d, l, esc){ return "el.innerHTML='<div style=\"text-align:center;padding:60px 20px\"><div style=\"font-family:Space Mono,monospace;font-size:10px;color:var(--muted)\">" + esc(d.match_page.match_not_found_prefix) + "'+fId+'</div><br><a href=\"/\" style=\"color:var(--cyan);font-family:Space Mono,monospace;font-size:9px\">" + esc(d.match_page.back) + "</a></div>';"; }},
      {find: "el.innerHTML='<div style=\"text-align:center;padding:60px 20px;color:var(--muted)\">Erreur de chargement</div>';",
       build: function(d, l, esc){ return "el.innerHTML='<div style=\"text-align:center;padding:60px 20px;color:var(--muted)\">" + esc(d.common.error_loading) + "</div>';"; }},
      {find: "+'<button class=\"tab-btn active\" data-tab=\"apercu\" onclick=\"switchTab(this,\\'apercu\\')\">VUE D\\'ENSEMBLE</button>'\n    +'<button class=\"tab-btn\" data-tab=\"analyse\" onclick=\"switchTab(this,\\'analyse\\')\">ANALYSE</button>'\n    +'<button class=\"tab-btn\" data-tab=\"criteres\" onclick=\"switchTab(this,\\'criteres\\')\">DÉCISION</button>'\n    +'<button class=\"tab-btn\" data-tab=\"savoir\" onclick=\"switchTab(this,\\'savoir\\')\">EN SAVOIR +</button>'",
       build: function(d, l, esc){
        var t = d.match_page;
        return "+'<button class=\"tab-btn active\" data-tab=\"apercu\" onclick=\"switchTab(this,\\'apercu\\')\">" + esc(t.tab_overview) + "</button>'\n    +'<button class=\"tab-btn\" data-tab=\"analyse\" onclick=\"switchTab(this,\\'analyse\\')\">" + esc(t.tab_analysis) + "</button>'\n    +'<button class=\"tab-btn\" data-tab=\"criteres\" onclick=\"switchTab(this,\\'criteres\\')\">" + esc(t.tab_decision) + "</button>'\n    +'<button class=\"tab-btn\" data-tab=\"savoir\" onclick=\"switchTab(this,\\'savoir\\')\">" + esc(t.tab_more) + "</button>'";
      }},
      {find: '<div class="stitle">PROBABILITÉS 1X2</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_1x2) + '</div>'; }},
      {find: '<div class="stitle">CONSENSUS DES MARCHÉS</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_consensus) + '</div>'; }},
      {find: '<div class="stitle">SCORES SIMULÉS — MONTE-CARLO</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_montecarlo) + '</div>'; }},
      {find: '<div class="stitle">SCORES LES PLUS PROBABLES</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_top_scores) + '</div>'; }},
      {find: '<div class="stitle">SCORE LE PLUS PROBABLE</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_top_score) + '</div>'; }},
      {find: '<div class="stitle">RADAR DE FORCES</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_radar) + '</div>'; }},
      {find: '<div class="stitle">STATS (MOYENNES 10 DERNIERS MATCHS)</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_stats) + '</div>'; }},
      {find: '<div class="stitle">PATTERNS DE JEU — 15 MIN</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_patterns) + '</div>'; }},
      {find: '<div class="stitle">ABSENTS &amp; RETOURS</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_absences) + '</div>'; }},
      {find: '<div class="stitle">HEAD TO HEAD</div>', count: 3, build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_h2h) + '</div>'; }},
      {find: '<div class="stitle">INDICE DE FORCE</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_force_index) + '</div>'; }},
      {find: '<div class="stitle">ARBITRE — \'+esc(arb.nom)+\'</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_referee_prefix) + '\'+esc(arb.nom)+\'</div>'; }},
      {find: '<div class="stitle">MODÈLE IA SHARK — CM 2026</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_wc_model) + '</div>'; }},
      {find: '<div class="stitle">SCÉNARIO ATTENDU</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_scenario) + '</div>'; }},
      {find: '<div class="stitle">JOUEURS À SUIVRE — CLASSEMENT</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_players) + '</div>'; }},
      {find: '<div class="stitle">CLASSEMENT</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_ranking) + '</div>'; }},
      {find: '<div class="stitle">SURFACE — \'+surfLabel.toUpperCase()+\'</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_surface_prefix) + '\'+surfLabel.toUpperCase()+\'</div>'; }},
      {find: '<div class="stitle">PALMARÈS CE TOURNOI</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_palmares) + '</div>'; }},
      {find: '<div class="stitle">CONTEXTE</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_context) + '</div>'; }},
      {find: '<div class="stitle">POURQUOI CE PARI ?</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_why) + '</div>'; }},
      {find: '<div class="stitle">ANALYSE COMPARATIVE</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_comparative) + '</div>'; }},
      {find: "<div class=\"pm-lbl\">SÉLECTION IA DU JOUR</div>", build: function(d, l, esc){ return "<div class=\"pm-lbl\">" + esc(d.match_page.label_ia_pick) + "</div>"; }},
      {find: "<div class=\"pmm-lbl\">PROBABILITÉ MODÈLE</div>", build: function(d, l, esc){ return "<div class=\"pmm-lbl\">" + esc(d.match_page.label_model_prob) + "</div>"; }},
      {find: "<div class=\"pmm-lbl\">COTE IMPL.</div>", build: function(d, l, esc){ return "<div class=\"pmm-lbl\">" + esc(d.match_page.label_implied_odds) + "</div>"; }},
      {find: "<div class=\"pmm-lbl\">AVANTAGE</div>", build: function(d, l, esc){ return "<div class=\"pmm-lbl\">" + esc(d.match_page.label_edge) + "</div>"; }},
      {find: "<span class=\"pm-conf-lbl\">FIABILITÉ</span>", build: function(d, l, esc){ return "<span class=\"pm-conf-lbl\">" + esc(d.match_page.label_reliability) + "</span>"; }},
      {find: "'<div class=\"pm-warn\">⚠ Si cote passe sous '+coteMin+' — ne pas jouer</div>'",
       build: function(d, l, esc){ return "'<div class=\"pm-warn\">" + esc(d.match_page.warn_cote_below_prefix) + "'+coteMin+'" + esc(d.match_page.warn_cote_below_suffix) + "</div>'"; }},
      {find: "<div class=\"ir-lbl sig\">SIGNAL DÉCISIF</div>", build: function(d, l, esc){ return "<div class=\"ir-lbl sig\">" + esc(d.match_page.signal_decisif) + "</div>"; }},
      {find: "<div class=\"ir-lbl\" style=\"color:var(--red)\">PASSE TON TOUR</div><div class=\"ir-txt\">'+(m.no_signal_label||'Signaux contradictoires. Ne pas jouer.')+'</div>",
       build: function(d, l, esc){ return "<div class=\"ir-lbl\" style=\"color:var(--red)\">" + esc(d.match_page.passe_ton_tour) + "</div><div class=\"ir-txt\">'+(m.no_signal_label||'" + esc(d.match_page.no_signal_fallback) + "')+'</div>"; }},
      {find: '<span class="pw-top-lbl">CONTENU PRO</span>', build: function(d, l, esc){ return '<span class="pw-top-lbl">' + esc(d.match_page.content_pro_badge) + '</span>'; }},
      {find: "<div class=\"pw-title\">Accès <span>complet</span></div>", build: function(d, l, esc){ return "<div class=\"pw-title\">" + esc(d.match_page.paywall_title_pre) + "<span>" + esc(d.match_page.paywall_title_hl) + "</span></div>"; }},
      {find: "<div class=\"pw-sub\">Analyses avancées, avantage statistique calculé, mise conseillée, alertes en temps réel.</div>", build: function(d, l, esc){ return "<div class=\"pw-sub\">" + esc(d.match_page.paywall_sub) + "</div>"; }},
      {find: '<div class="pw-feat-name">AVANTAGE + MISE CONSEILLÉE</div><div class="pw-feat-desc">Avantage statistique par marché</div></div></div><span class="pw-badge c1">PRO</span></div>',
       build: function(d, l, esc){ var m = d.match_page; return '<div class="pw-feat-name">' + esc(m.paywall_feat1_name) + '</div><div class="pw-feat-desc">' + esc(m.paywall_feat1_desc) + '</div></div></div><span class="pw-badge c1">' + esc(m.paywall_pro_badge) + '</span></div>'; }},
      {find: '<div class="pw-feat-name">ALERTES DROPPING ODDS</div><div class="pw-feat-desc">Mouvements de cotes en temps réel</div></div></div><span class="pw-badge c1">PRO</span></div>',
       build: function(d, l, esc){ var m = d.match_page; return '<div class="pw-feat-name">' + esc(m.paywall_feat2_name) + '</div><div class="pw-feat-desc">' + esc(m.paywall_feat2_desc) + '</div></div></div><span class="pw-badge c1">' + esc(m.paywall_pro_badge) + '</span></div>'; }},
      {find: "<a class=\"pw-cta\" href=\"/compte.html\">PASSER PRO — 19.95€/MOIS</a>", build: function(d, l, esc){ return "<a class=\"pw-cta\" href=\"/compte.html\">" + esc(d.match_page.paywall_cta) + "</a>"; }},
      {find: "<div class=\"arb-l\">CARTONS/MATCH</div>", build: function(d, l, esc){ return "<div class=\"arb-l\">" + esc(d.match_page.arb_cards_per_match) + "</div>"; }},
      {find: "<div class=\"arb-l\">PÉNALTYS/MATCH</div>", build: function(d, l, esc){ return "<div class=\"arb-l\">" + esc(d.match_page.arb_penalties_per_match) + "</div>"; }},
      {find: "num:String(blocs.length+1), titre:'Le pari recommandé',\n    txt:'Le modèle statistique estime <strong>'+esc(marketFr)+'</strong> à <strong>'+modelProbTxt+'%</strong> de probabilité, à la cote de <strong>'+esc(paricote)+'</strong>'+(reliabilityTxt?' (fiabilité : <strong>'+esc(reliabilityTxt.toUpperCase())+'</strong>, mesurée par l\\'accord des modèles et la qualité des données disponibles — pas par la probabilité elle-même)':'')+'.'",
       build: function(d, l, esc){
        var w = d.match_page;
        return "num:String(blocs.length+1), titre:'" + esc(w.why1_title) + "',\n    txt:'" + esc(w.why1_a) + "<strong>'+esc(marketFr)+'</strong>" + esc(w.why1_b) + "<strong>'+modelProbTxt+'%</strong>" + esc(w.why1_c) + "<strong>'+esc(paricote)+'</strong>'+(reliabilityTxt?'" + esc(w.why1_d) + "<strong>'+esc(reliabilityTxt.toUpperCase())+'</strong>" + esc(w.why1_e) + "':'')+'.'";
      }},
      {find: "blocs.push({num:String(blocs.length+1), titre:'Impact des absences',\n      txt:absTxt+' Cet élément est pris en compte dans les données transmises au modèle — il ne remet pas en cause le pari en l\\'état, mais reste un facteur de risque à surveiller.'});",
       build: function(d, l, esc){ var w = d.match_page; return "blocs.push({num:String(blocs.length+1), titre:'" + esc(w.why2_title) + "',\n      txt:absTxt+'" + esc(w.why2_suffix) + "'});"; }},
      {find: "blocs.push({num:String(blocs.length+1), titre:'Le raisonnement', txt:esc(cleanJargon(m.verdict_shark))});",
       build: function(d, l, esc){ return "blocs.push({num:String(blocs.length+1), titre:'" + esc(d.match_page.why3_title) + "', txt:esc(cleanJargon(m.verdict_shark))});"; }},
      {find: "blocs.push({num:String(blocs.length+1), titre:'Le facteur décisif', txt:esc(cleanJargon(m.facteur_x))});",
       build: function(d, l, esc){ return "blocs.push({num:String(blocs.length+1), titre:'" + esc(d.match_page.why4_title) + "', txt:esc(cleanJargon(m.facteur_x))});"; }},
      {find: "blocs.push({num:String(blocs.length+1), titre:'Pourquoi cette cote est intéressante',\n      txt:'La probabilité estimée par le modèle est supérieure à celle impliquée par la cote du bookmaker, ce qui représente un avantage statistique d\\'environ <strong>+'+edgeNum.toFixed(1)+'%</strong> en faveur du parieur sur le long terme.'});",
       build: function(d, l, esc){
        var w = d.match_page;
        return "blocs.push({num:String(blocs.length+1), titre:'" + esc(w.why5_title) + "',\n      txt:'" + esc(w.why5_a) + "<strong>+'+edgeNum.toFixed(1)+'%</strong>" + esc(w.why5_b) + "'});";
      }},
      {find: "blocs.push({num:String(blocs.length+1), titre:'Mise conseillée',\n      txt:'Sur la base de cet avantage statistique, la mise recommandée est d\\'environ <strong>'+esc(m.kelly)+'% de la bankroll</strong> (méthode de Kelly fractionnée, pour limiter le risque de ruine en cas d\\'erreur du modèle).'});",
       build: function(d, l, esc){
        var w = d.match_page;
        return "blocs.push({num:String(blocs.length+1), titre:'" + esc(w.why6_title) + "',\n      txt:'" + esc(w.why6_a) + "<strong>'+esc(m.kelly)+'" + esc(w.why6_b) + "</strong>" + esc(w.why6_c) + "'});";
      }},
      {find: "if(s.includes('over 2.5'))return 'Plus de 2,5 buts';\n  if(s.includes('under 2.5'))return 'Moins de 2,5 buts';\n  if(s.includes('over 1.5'))return 'Plus de 1,5 but';\n  if(s.includes('under 1.5'))return 'Moins de 1,5 but';\n  if(s.includes('over 3.5'))return 'Plus de 3,5 buts';\n  if(s.includes('btts oui')||s.includes('btts yes'))return 'Les deux équipes marquent';\n  if(s.includes('btts non')||s.includes('btts no'))return 'Une équipe ne marque pas';\n  if(s.includes('dc 1x')||s==='1x')return 'Victoire ou nul (domicile)';\n  if(s.includes('dc x2')||s==='x2')return 'Victoire ou nul (extérieur)';\n  if(s.includes('match winner')||s==='1')return 'Victoire à domicile';",
       build: function(d, l, esc){
        var n = d.market_names, nat = d.market_names_natural, m = d.match_page;
        return "if(s.includes('over 2.5'))return '" + esc(n.over25) + "';\n  if(s.includes('under 2.5'))return '" + esc(n.under25) + "';\n  if(s.includes('over 1.5'))return '" + esc(n.over15) + "';\n  if(s.includes('under 1.5'))return '" + esc(m.under15) + "';\n  if(s.includes('over 3.5'))return '" + esc(m.over35) + "';\n  if(s.includes('btts oui')||s.includes('btts yes'))return '" + esc(nat.btts_oui_natural) + "';\n  if(s.includes('btts non')||s.includes('btts no'))return '" + esc(nat.btts_non_natural) + "';\n  if(s.includes('dc 1x')||s==='1x')return '" + esc(m.dc1x_long) + "';\n  if(s.includes('dc x2')||s==='x2')return '" + esc(m.dcx2_long) + "';\n  if(s.includes('match winner')||s==='1')return '" + esc(m.home_win_long) + "';";
      }}
    ]
  },
  {
    file: "pro.html",
    metas: {
      fr: {title: "IASHARK OUTILS", description: "Sélections à forte probabilité modèle, suivi automatique des paris et vérification de cote en un clic — l'espace Outils d'IASHARK."},
      en: {title: "IASHARK TOOLS", description: "High model-probability selections, automatic bet tracking and one-click odds check — the IASHARK Tools space."},
      es: {title: "IASHARK HERRAMIENTAS", description: "Selecciones con alta probabilidad de modelo, seguimiento automático de apuestas y verificación de cuota en un clic — el espacio Herramientas de IASHARK."},
      de: {title: "IASHARK TOOLS", description: "Tipps mit hoher Modellwahrscheinlichkeit, automatisches Wett-Tracking und Quotenprüfung mit einem Klick — der IASHARK-Tools-Bereich."},
      it: {title: "IASHARK STRUMENTI", description: "Selezioni ad alta probabilità di modello, tracciamento automatico delle scommesse e verifica quota in un clic — l'area Strumenti di IASHARK."},
      pt: {title: "IASHARK FERRAMENTAS", description: "Seleções com alta probabilidade de modelo, registo automático de apostas e verificação de odd num clique — o espaço Ferramentas do IASHARK."}
    },
    replacements: [
      {find: '<span id="authHeaderSlot"><a href="/compte.html" class="btn-login">CONNEXION</a></span>', build: function(d){ return '<span id="authHeaderSlot"><a href="/compte.html" class="btn-login">' + d.cta.login + '</a></span>'; }},
      {find: '<h1>Espace <span>OUTILS</span></h1>', build: function(d){ var t = d.tools_page; return '<h1>' + t.hero_title_pre + '<span>' + t.hero_title_hl + '</span></h1>'; }},
      {find: '<p>Sélections probabilité ≥ 70% · Suivi automatique · Vérification de cote</p>', build: function(d, l, esc){ return '<p>' + esc(d.tools_page.hero_sub) + '</p>'; }},
      {find: '<div class="hstat-lbl">WINRATE</div>', build: function(d){ return '<div class="hstat-lbl">' + d.tools_page.stat_winrate + '</div>'; }},
      {find: '<div class="hstat-lbl">ROI</div>', build: function(d){ return '<div class="hstat-lbl">' + d.tools_page.stat_roi + '</div>'; }},
      {find: '<div class="hstat-lbl">PARIS</div>', build: function(d){ return '<div class="hstat-lbl">' + d.tools_page.stat_total + '</div>'; }},
      {find: '<span class="capital-lbl">CAPITAL DE DÉPART</span>', build: function(d){ return '<span class="capital-lbl">' + d.tools_page.capital_start + '</span>'; }},
      {find: '<span class="capital-lbl">CAPITAL ACTUEL</span>', build: function(d){ return '<span class="capital-lbl">' + d.tools_page.capital_current + '</span>'; }},
      {find: '<button class="capital-edit-btn" id="capitalEditBtn" onclick="toggleCapitalEdit()">MODIFIER</button>', build: function(d){ return '<button class="capital-edit-btn" id="capitalEditBtn" onclick="toggleCapitalEdit()">' + d.tools_page.capital_edit + '</button>'; }},
      {find: '<input type="number" id="capitalInput" placeholder="Ex: 1000">', build: function(d){ return '<input type="number" id="capitalInput" placeholder="' + d.tools_page.capital_placeholder + '">'; }},
      {find: '<button class="sync-btn" onclick="saveCapital()">ENREGISTRER</button>', build: function(d){ return '<button class="sync-btn" onclick="saveCapital()">' + d.tools_page.capital_save + '</button>'; }},
      {find: '<div class="day-summary" id="daySummary">🦈 <div>Chargement du résumé du jour...</div></div>', build: function(d, l, esc){ return '<div class="day-summary" id="daySummary">🦈 <div>' + esc(d.common.loading) + '</div></div>'; }},
      {find: '<span class="capital-lbl">🧮 CALCULATEURS GRATUITS</span>', build: function(d, l, esc){ return '<span class="capital-lbl">' + esc(d.tools_page.free_calc_title) + '</span>'; }},
      {find: '<div class="capital-lbl" style="margin-bottom:4px;">COTE DÉCIMALE</div>', count: 2, build: function(d){ return '<div class="capital-lbl" style="margin-bottom:4px;">' + d.tools_page.calc_odds_label + '</div>'; }},
      {find: '<div class="capital-lbl" style="margin-bottom:4px;">PROBABILITÉ IMPLICITE (%)</div>', build: function(d){ return '<div class="capital-lbl" style="margin-bottom:4px;">' + d.tools_page.calc_prob_label + '</div>'; }},
      {find: '<div class="capital-hint" style="color:var(--muted);font-size:9px;">Probabilité implicite = 100 / cote décimale — inclut la marge du bookmaker, ce n\'est pas une probabilité "juste" (fair).</div>',
       build: function(d){ return '<div class="capital-hint" style="color:var(--muted);font-size:9px;">' + d.tools_page.calc_prob_hint + '</div>'; }},
      {find: '<span class="capital-lbl">📐 MARGE BOOKMAKER (1X2)</span>', build: function(d, l, esc){ return '<span class="capital-lbl">' + esc(d.tools_page.margin_title) + '</span>'; }},
      {find: 'placeholder="Cote 1"', build: function(d){ return 'placeholder="' + d.tools_page.margin_odds1 + '"'; }},
      {find: 'placeholder="Cote N"', build: function(d){ return 'placeholder="' + d.tools_page.margin_oddsn + '"'; }},
      {find: 'placeholder="Cote 2"', build: function(d){ return 'placeholder="' + d.tools_page.margin_odds2 + '"'; }},
      {find: '<span class="capital-lbl">MARGE</span>', build: function(d){ return '<span class="capital-lbl">' + d.tools_page.margin_label + '</span>'; }},
      {find: "margePct>=0?'(marge normale du bookmaker)':'(anomalie : somme des probabilités < 100%, vérifie les cotes saisies)'",
       build: function(d, l, esc){ return "margePct>=0?'" + esc(d.tools_page.margin_hint_normal) + "':'" + esc(d.tools_page.margin_hint_anomaly) + "'"; }},
      {find: "<button class=\"tab-btn active\" onclick=\"switchTab('selections',this)\">⭐ SÉLECTIONS</button>", build: function(d, l, esc){ return "<button class=\"tab-btn active\" onclick=\"switchTab('selections',this)\">⭐ " + esc(d.tools_page.tab_selections) + "</button>"; }},
      {find: "<button class=\"tab-btn\" onclick=\"switchTab('suivi',this)\">📊 MON SUIVI</button>", build: function(d, l, esc){ return "<button class=\"tab-btn\" onclick=\"switchTab('suivi',this)\">📊 " + esc(d.tools_page.tab_tracking) + "</button>"; }},
      {find: "<button class=\"tab-btn\" onclick=\"switchTab('calc',this)\">🧮 CALCULATEURS</button>", build: function(d, l, esc){ return "<button class=\"tab-btn\" onclick=\"switchTab('calc',this)\">🧮 " + esc(d.tools_page.tab_calculators) + "</button>"; }},
      {find: '<span class="lock-badge">🔒 PROBA ≥ 70%</span>', build: function(d, l, esc){ return '<span class="lock-badge">🔒 ' + esc(d.tools_page.lock_badge) + '</span>'; }},
      {find: '<option value="">Tous les marchés</option>', build: function(d){ return '<option value="">' + d.markets_page.filter_all_markets + '</option>'; }},
      {find: '<option value="over25">Plus de 2,5 buts</option>', build: function(d){ return '<option value="over25">' + d.market_names.over25 + '</option>'; }},
      {find: '<option value="under25">Moins de 2,5 buts</option>', build: function(d){ return '<option value="under25">' + d.market_names.under25 + '</option>'; }},
      {find: '<option value="btts_oui">Les deux équipes marquent</option>', build: function(d){ return '<option value="btts_oui">' + d.market_names_natural.btts_oui_natural + '</option>'; }},
      {find: '<option value="btts_non">Une équipe ne marque pas</option>', build: function(d){ return '<option value="btts_non">' + d.market_names_natural.btts_non_natural + '</option>'; }},
      {find: '<option value="dc1x">DC 1X</option>', build: function(d){ return '<option value="dc1x">' + d.market_names.dc1x + '</option>'; }},
      {find: '<option value="dc_x2">DC X2</option>', build: function(d){ return '<option value="dc_x2">' + d.market_names.dc_x2 + '</option>'; }},
      {find: '<option value="conf">Trier : probabilité modèle</option>', build: function(d){ return '<option value="conf">' + d.tools_page.sort_by_prob + '</option>'; }},
      {find: '<option value="cote">Trier : cote</option>', build: function(d){ return '<option value="cote">' + d.tools_page.sort_by_odds + '</option>'; }},
      {find: '<option value="date">Trier : date</option>', build: function(d){ return '<option value="date">' + d.tools_page.sort_by_date + '</option>'; }},
      {find: '<div id="selList"><div class="loading">CHARGEMENT...</div></div>', build: function(d, l, esc){ return '<div id="selList"><div class="loading">' + esc(d.common.loading) + '</div></div>'; }},
      {find: 'Les paris suivis depuis Sélections se résolvent automatiquement.', build: function(d, l, esc){ return esc(d.tools_page.sync_status_default); }},
      {find: '<span class="capital-lbl">🧮 MISE DE KELLY (FRACTIONNAIRE)</span>', build: function(d, l, esc){ return '<span class="capital-lbl">' + esc(d.tools_page.kelly_title) + '</span>'; }},
      {find: '<div class="capital-lbl" style="margin-bottom:4px;">BANKROLL (€)</div>', build: function(d){ return '<div class="capital-lbl" style="margin-bottom:4px;">' + d.tools_page.kelly_bankroll + '</div>'; }},
      {find: '<div class="capital-lbl" style="margin-bottom:4px;">PROBABILITÉ ESTIMÉE (%)</div>', build: function(d){ return '<div class="capital-lbl" style="margin-bottom:4px;">' + d.tools_page.kelly_prob + '</div>'; }},
      {find: '<div class="capital-lbl" style="margin-bottom:4px;">FRACTION KELLY</div>', build: function(d){ return '<div class="capital-lbl" style="margin-bottom:4px;">' + d.tools_page.kelly_fraction + '</div>'; }},
      {find: '<option value="0.25" selected>1/4 (prudent, standard)</option>', build: function(d){ return '<option value="0.25" selected>' + d.tools_page.kelly_frac_quarter + '</option>'; }},
      {find: '<option value="0.5">1/2</option>', build: function(d){ return '<option value="0.5">' + d.tools_page.kelly_frac_half + '</option>'; }},
      {find: '<option value="1">Plein (agressif)</option>', build: function(d){ return '<option value="1">' + d.tools_page.kelly_frac_full + '</option>'; }},
      {find: '<span class="capital-lbl">MISE RECOMMANDÉE</span>', build: function(d){ return '<span class="capital-lbl">' + d.tools_page.kelly_result_stake + '</span>'; }},
      {find: '<span class="capital-lbl">% DU BANKROLL</span>', build: function(d){ return '<span class="capital-lbl">' + d.tools_page.kelly_result_pct + '</span>'; }},
      {find: '<span class="capital-lbl">EV (valeur espérée)</span>', build: function(d){ return '<span class="capital-lbl">' + d.tools_page.kelly_result_ev + '</span>'; }},
      {find: '<div class="capital-hint" style="color:var(--muted);font-size:9px;">La probabilité que tu entres ici doit venir de ton propre jugement ou d\'une probabilité modèle IASHARK réelle (visible dans Sélections/Match) — ce calculateur ne fournit aucune probabilité, il applique seulement la formule de Kelly à ce que tu lui donnes. Mise plafonnée à 5% du bankroll par pari (même règle que le moteur), quel que soit l\'edge.</div>',
       build: function(d){ return '<div class="capital-hint" style="color:var(--muted);font-size:9px;">' + d.tools_page.kelly_hint_static + '</div>'; }},
      {find: '<span class="pw-top-lbl">CONTENU OUTILS</span>', build: function(d){ return '<span class="pw-top-lbl">' + d.tools_page.pw_badge + '</span>'; }},
      {find: '<div class="pw-title">Accès <span>complet</span></div>', build: function(d){ var t = d.tools_page; return '<div class="pw-title">' + t.pw_title_pre + '<span>' + t.pw_title_hl + '</span></div>'; }},
      {find: '<div class="pw-sub">Sélections à forte probabilité modèle, suivi automatique de tes paris, vérification de cote en un clic.</div>',
       build: function(d, l, esc){ return '<div class="pw-sub">' + esc(d.tools_page.pw_sub) + '</div>'; }},
      {find: '<div class="pw-feat-name">SÉLECTIONS PROBABILITÉ ≥ 70%</div><div class="pw-feat-desc">Les pronostics à plus forte probabilité modèle</div></div></div><span class="pw-badge">OUTILS</span></div>',
       build: function(d, l, esc){ var t = d.tools_page; return '<div class="pw-feat-name">' + esc(t.pw_feat1_name) + '</div><div class="pw-feat-desc">' + esc(t.pw_feat1_desc) + '</div></div></div><span class="pw-badge">' + esc(d.nav.tools) + '</span></div>'; }},
      {find: '<div class="pw-feat-name">SUIVI AUTOMATIQUE</div><div class="pw-feat-desc">Tracker de paris et résolution automatique</div></div></div><span class="pw-badge">OUTILS</span></div>',
       build: function(d, l, esc){ var t = d.tools_page; return '<div class="pw-feat-name">' + esc(t.pw_feat2_name) + '</div><div class="pw-feat-desc">' + esc(t.pw_feat2_desc) + '</div></div></div><span class="pw-badge">' + esc(d.nav.tools) + '</span></div>'; }},
      {find: '<a class="pw-cta" href="/compte.html">PASSER OUTILS →</a>', build: function(d, l, esc){ return '<a class="pw-cta" href="/compte.html">' + esc(d.tools_page.pw_cta) + '</a>'; }},
      {find: '<div class="modal-title">Ajout rapide</div>', build: function(d){ return '<div class="modal-title">' + d.tools_page.modal_title + '</div>'; }},
      {find: '<div class="modal-sub">Pour un pari pris sur le vif, sans passer par Sélections.</div>', build: function(d, l, esc){ return '<div class="modal-sub">' + esc(d.tools_page.modal_sub) + '</div>'; }},
      {find: '<label>MATCH</label><input type="text" class="finput" id="mMatch" style="width:100%" placeholder="Ex: PSG vs OM">',
       build: function(d){ var t = d.tools_page; return '<label>' + t.modal_match_label + '</label><input type="text" class="finput" id="mMatch" style="width:100%" placeholder="' + t.modal_match_placeholder + '">'; }},
      {find: '<label>MARCHÉ</label><input type="text" class="finput" id="mMarket" style="width:100%" placeholder="BTTS Oui">',
       build: function(d){ var t = d.tools_page; return '<label>' + t.modal_market_label + '</label><input type="text" class="finput" id="mMarket" style="width:100%" placeholder="' + t.modal_market_placeholder + '">'; }},
      {find: '<label>COTE</label><input type="number" class="finput" id="mCote" style="width:100%" step="0.01" placeholder="1.90">',
       build: function(d){ var t = d.tools_page; return '<label>' + t.modal_odds_label + '</label><input type="number" class="finput" id="mCote" style="width:100%" step="0.01" placeholder="' + t.modal_odds_placeholder + '">'; }},
      {find: '<label>MISE (€)</label><input type="number" class="finput" id="mMise" style="width:100%" value="10">',
       build: function(d){ return '<label>' + d.tools_page.modal_stake_label + '</label><input type="number" class="finput" id="mMise" style="width:100%" value="10">'; }},
      {find: '<button class="btnvalid" style="width:100%;text-align:center;" onclick="addFromModal()">+ AJOUTER À MON SUIVI</button>',
       build: function(d, l, esc){ return '<button class="btnvalid" style="width:100%;text-align:center;" onclick="addFromModal()">' + esc(d.tools_page.modal_add_btn) + '</button>'; }},
      {find:
        '    <div>⚠️ LE JEU PEUT ÊTRE DANGEREUX — JOUEZ RESPONSABLE · INTERDIT AUX MOINS DE 18 ANS</div>\n' +
        '    <div>Aide : <a href="https://www.joueurs-info-service.fr" style="color:rgba(34,211,238,0.4);text-decoration:none;">joueurs-info-service.fr</a> · 09 74 75 13 13</div>',
       build: function(d){
        var f = d.footer;
        return '    <div>⚠️ ' + f.disclaimer_warning + '</div>\n' +
          '    <div>' + f.disclaimer_help_label + ' <a href="https://www.joueurs-info-service.fr" style="color:rgba(34,211,238,0.4);text-decoration:none;">' + f.disclaimer_help_site + '</a> · ' + f.disclaimer_help_phone + '</div>';
      }},
      {find: '<div class="nav-lbl">ACCUEIL</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.home + '</div>'; }},
      {find: '<div class="nav-lbl">MARCHÉS</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.markets + '</div>'; }},
      {find: '<div class="nav-lbl">HISTORIQUE</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.history + '</div>'; }},
      {find: '<div class="nav-lbl">OUTILS</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.tools + '</div>'; }},
      {find: '<div class="nav-lbl">GUIDES</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.guides + '</div>'; }},
      {find: '<div class="nav-lbl">COMPTE</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.account + '</div>'; }},
      {find: "document.getElementById('daySummary').innerHTML='🦈 <div>Aujourd\\'hui : <b>'+(todayCount||allMatchs.length)+' sélection'+((todayCount||allMatchs.length)>1?'s':'')+'</b> probabilité ≥70%'\n    +(pendingCount?' · <span class=\"cy\">'+pendingCount+' pari'+(pendingCount>1?'s':'')+'</span> en attente de résultat dans ton suivi.':' · aucun pari en attente.')\n    +'</div>';",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "document.getElementById('daySummary').innerHTML='🦈 <div>" + esc(t.day_today_prefix) + "<b>'+(todayCount||allMatchs.length)+' '+((todayCount||allMatchs.length)>1?'" + esc(t.selection_many) + "':'" + esc(t.selection_one) + "')+'</b>" + esc(t.day_prob_suffix) + "'\n    +(pendingCount?' · <span class=\"cy\">'+pendingCount+' '+(pendingCount>1?'" + esc(t.bet_many) + "':'" + esc(t.bet_one) + "')+'</span>" + esc(t.day_pending_suffix) + "':'" + esc(t.day_none_pending) + "')\n    +'</div>';";
      }},
      {find: "msgEl.textContent = 'Entre un montant valide.';", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.tools_page.capital_msg_invalid) + "';"; }},
      {find: "msgEl.textContent = 'Connecte-toi pour enregistrer ton capital.';", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.tools_page.capital_msg_login) + "';"; }},
      {find: "msgEl.textContent = 'Enregistrement...';", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.tools_page.capital_msg_saving) + "';"; }},
      {find: "msgEl.textContent = 'Capital enregistré.';", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.tools_page.capital_msg_saved) + "';"; }},
      {find: "msgEl.textContent = 'Erreur : '+(e.message||'réessaie');", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.tools_page.capital_msg_error_prefix) + "'+(e.message||'réessaie');"; }},
      {find: "document.getElementById('capitalVal').textContent = Number(capital).toLocaleString('fr-FR')+' €';\n    document.getElementById('capitalInput').placeholder = 'Modifier ('+capital+'€ actuellement)';",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "document.getElementById('capitalVal').textContent = Number(capital).toLocaleString('fr-FR')+' €';\n    document.getElementById('capitalInput').placeholder = '" + esc(t.capital_edit_placeholder_prefix) + "'+capital+'" + esc(t.capital_edit_placeholder_suffix) + "';";
      }},
      {find: "document.getElementById('capitalHint').textContent = pnl===0 ? '(aucun pari résolu encore)' : '('+(pnl>0?'+':'')+Math.round(pnl)+'€ sur tes paris suivis)';",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "document.getElementById('capitalHint').textContent = pnl===0 ? '" + esc(t.capital_hint_none) + "' : '('+(pnl>0?'+':'')+Math.round(pnl)+'" + esc(t.capital_hint_pnl_suffix) + "';";
      }},
      {find: "document.getElementById('capitalVal').textContent = 'Non renseigné';", build: function(d, l, esc){ return "document.getElementById('capitalVal').textContent = '" + esc(d.tools_page.capital_not_set) + "';"; }},
      {find: "document.getElementById('kellyEvVal').textContent=(ev>=0?'+':'')+(ev*100).toFixed(1)+'% par unité misée';",
       build: function(d, l, esc){ return "document.getElementById('kellyEvVal').textContent=(ev>=0?'+':'')+(ev*100).toFixed(1)+'" + esc(d.tools_page.kelly_ev_suffix) + "';"; }},
      {find: "document.getElementById('kellyMiseVal').textContent='0 € (aucun edge)';\n    document.getElementById('kellyPctVal').textContent='0%';\n    document.getElementById('kellyHint').textContent=\"À cette cote et cette probabilité, le calcul de Kelly ne recommande aucune mise (pas d'avantage mathématique) — parier ici reviendrait à un pari négatif en espérance.\";",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "document.getElementById('kellyMiseVal').textContent='" + esc(t.kelly_no_edge_stake) + "';\n    document.getElementById('kellyPctVal').textContent='0%';\n    document.getElementById('kellyHint').textContent=\"" + esc(t.kelly_no_edge_hint) + "\";";
      }},
      {find: "document.getElementById('kellyHint').textContent=pct>=5?'Plafonné à 5% du bankroll par pari (même règle que le moteur), même si le Kelly plein calculé est supérieur.':'Kelly '+(fraction===1?'plein':fraction===0.5?'demi':'quart')+' appliqué sur un edge réel détecté par la formule.';",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "document.getElementById('kellyHint').textContent=pct>=5?'" + esc(t.kelly_capped_hint) + "':'" + esc(t.kelly_applied_prefix) + "'+(fraction===1?'" + esc(t.kelly_frac_full_word) + "':fraction===0.5?'" + esc(t.kelly_frac_half_word) + "':'" + esc(t.kelly_frac_quarter_word) + "')+'" + esc(t.kelly_applied_suffix) + "';";
      }},
      {find: "document.getElementById('selCount').textContent=list.length+' sélection'+(list.length>1?'s':'');",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "document.getElementById('selCount').textContent=list.length+' '+(list.length>1?'" + esc(t.selection_many) + "':'" + esc(t.selection_one) + "');";
      }},
      {find: "document.getElementById('selList').innerHTML='<div class=\"empty-hint\">Aucune sélection pour ce filtre aujourd\\'hui.</div>';",
       build: function(d, l, esc){ return "document.getElementById('selList').innerHTML='<div class=\"empty-hint\">" + esc(d.tools_page.empty_no_selection) + "</div>';"; }},
      {find: "+'<div class=\"cbadge '+cc+'\" title=\"Probabilité modèle\">'+modelProbPct+'%</div>'\n      +'<button class=\"btn-follow'+(isFollowed?' done':'')+'\" id=\"followbtn-'+m.id+'\" onclick=\"togglePanel('+m.id+')\">'+(isFollowed?'✓ SUIVI':'GÉRER ▾')+'</button>'",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "+'<div class=\"cbadge '+cc+'\" title=\"" + esc(t.model_prob_title) + "\">'+modelProbPct+'%</div>'\n      +'<button class=\"btn-follow'+(isFollowed?' done':'')+'\" id=\"followbtn-'+m.id+'\" onclick=\"togglePanel('+m.id+')\">'+(isFollowed?'" + esc(t.btn_followed) + "':'" + esc(t.btn_manage) + "')+'</button>'";
      }},
      {find: "+'<button class=\"chip active\" data-chip=\"suivre\" onclick=\"setChip('+m.id+',\\'suivre\\',this)\">SUIVRE CE PARI</button>'\n      +'<button class=\"chip\" data-chip=\"cote\" onclick=\"setChip('+m.id+',\\'cote\\',this)\">VÉRIFIER UNE COTE</button>'\n      +'<button class=\"chip\" data-chip=\"note\" onclick=\"setChip('+m.id+',\\'note\\',this)\">AJOUTER UNE NOTE</button>'",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "+'<button class=\"chip active\" data-chip=\"suivre\" onclick=\"setChip('+m.id+',\\'suivre\\',this)\">" + esc(t.chip_follow) + "</button>'\n      +'<button class=\"chip\" data-chip=\"cote\" onclick=\"setChip('+m.id+',\\'cote\\',this)\">" + esc(t.chip_check_odds) + "</button>'\n      +'<button class=\"chip\" data-chip=\"note\" onclick=\"setChip('+m.id+',\\'note\\',this)\">" + esc(t.chip_add_note) + "</button>'";
      }},
      {find: "+(suggMise?'<div class=\"mise-sugg-hint\">🎯 Mise conseillée sur ta bankroll actuelle : <b>'+suggMise+'€</b></div>':'')",
       build: function(d, l, esc){ return "+(suggMise?'<div class=\"mise-sugg-hint\">🎯 " + esc(d.tools_page.mise_sugg_prefix) + "<b>'+suggMise+'€</b></div>':'')"; }},
      {find: "+'<div class=\"fg\"><label>MISE (€)</label><input type=\"number\" class=\"finput\" id=\"mise-'+m.id+'\" value=\"'+miseDefault+'\" style=\"width:80px\"></div>'",
       build: function(d, l, esc){ return "+'<div class=\"fg\"><label>" + esc(d.tools_page.modal_stake_label) + "</label><input type=\"number\" class=\"finput\" id=\"mise-'+m.id+'\" value=\"'+miseDefault+'\" style=\"width:80px\"></div>'"; }},
      {find: "+'<button class=\"btnvalid\" onclick=\"confirmFollow('+m.id+')\">✓ AJOUTER À MON SUIVI</button>'",
       build: function(d, l, esc){ return "+'<button class=\"btnvalid\" onclick=\"confirmFollow('+m.id+')\">" + esc(d.tools_page.modal_add_btn) + "</button>'"; }},
      {find: "+'<div class=\"fg\"><label>COTE VUE AILLEURS</label><input type=\"number\" step=\"0.01\" class=\"finput\" id=\"book-'+m.id+'\" placeholder=\"ex: 1.75\" oninput=\"calcEdge('+m.id+')\"></div>'",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "+'<div class=\"fg\"><label>" + esc(t.lbl_odds_seen_elsewhere) + "</label><input type=\"number\" step=\"0.01\" class=\"finput\" id=\"book-'+m.id+'\" placeholder=\"" + esc(t.placeholder_odds_example) + "\" oninput=\"calcEdge('+m.id+')\"></div>'";
      }},
      {find: "+'<textarea class=\"ntextarea\" id=\"note-'+m.id+'\" placeholder=\"Pourquoi ce pari t\\'intéresse, ce que tu observes...\">'+(note||'')+'</textarea>'\n      +'<button class=\"btnvalid\" onclick=\"saveSelNote('+m.id+')\">✓ ENREGISTRER LA NOTE</button>'",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "+'<textarea class=\"ntextarea\" id=\"note-'+m.id+'\" placeholder=\"" + esc(t.note_placeholder_sel) + "\">'+(note||'')+'</textarea>'\n      +'<button class=\"btnvalid\" onclick=\"saveSelNote('+m.id+')\">" + esc(t.btn_save_note) + "</button>'";
      }},
      {find: "el.innerHTML='Proba modèle <b>'+probIA+'%</b> vs proba cote <b>'+probImpl.toFixed(1)+'%</b> — avantage de <b style=\"color:'+(edge>0?'var(--green)':'var(--red)')+'\">'+(edge>0?'+':'')+edge+'%</b>. '+(edge>0?'Cote intéressante par rapport au modèle.':'Le modèle ne voit pas d\\'avantage à cette cote.');",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "el.innerHTML='" + esc(t.edge_prefix) + "<b>'+probIA+'" + esc(t.edge_mid) + "<b>'+probImpl.toFixed(1)+'" + esc(t.edge_suffix) + "<b style=\"color:'+(edge>0?'var(--green)':'var(--red)')+'\">'+(edge>0?'+':'')+edge+'" + esc(t.edge_close) + "'+(edge>0?'" + esc(t.edge_positive) + "':'" + esc(t.edge_negative) + "');";
      }},
      {find: "showToast('Note enregistrée sur ce match');", build: function(d, l, esc){ return "showToast('" + esc(d.tools_page.toast_note_saved_sel) + "');"; }},
      {find: "if(PARIS.some(function(p){return p.fixtureId===id;})){showToast('Déjà suivi');return;}", build: function(d, l, esc){ return "if(PARIS.some(function(p){return p.fixtureId===id;})){showToast('" + esc(d.tools_page.toast_already_tracked) + "');return;}"; }},
      {find: "showToast('Ajouté à Mon suivi — se résoudra automatiquement');", build: function(d, l, esc){ return "showToast('" + esc(d.tools_page.toast_added_tracking) + "');"; }},
      {find: "'<div class=\"tstat\"><div class=\"tstat-lbl\">WINRATE</div><div class=\"tstat-val\" id=\"twr\">—</div></div>'\n    +'<div class=\"tstat\"><div class=\"tstat-lbl\">ROI</div><div class=\"tstat-val\" id=\"troi\">—</div></div>'\n    +'<div class=\"tstat\"><div class=\"tstat-lbl\">BILAN</div><div class=\"tstat-val cyan\" id=\"tbilan\">—</div></div>'\n    +'<div class=\"tstat\"><div class=\"tstat-lbl\">EN ATTENTE</div><div class=\"tstat-val\">'+pendingCount+'</div></div>';",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "'<div class=\"tstat\"><div class=\"tstat-lbl\">" + esc(t.tstat_winrate) + "</div><div class=\"tstat-val\" id=\"twr\">—</div></div>'\n    +'<div class=\"tstat\"><div class=\"tstat-lbl\">" + esc(t.tstat_roi) + "</div><div class=\"tstat-val\" id=\"troi\">—</div></div>'\n    +'<div class=\"tstat\"><div class=\"tstat-lbl\">" + esc(t.tstat_balance) + "</div><div class=\"tstat-val cyan\" id=\"tbilan\">—</div></div>'\n    +'<div class=\"tstat\"><div class=\"tstat-lbl\">" + esc(t.tstat_pending) + "</div><div class=\"tstat-val\">'+pendingCount+'</div></div>';";
      }},
      {find: "?'<span class=\"result-lbl\" style=\"color:var(--muted)\">EN ATTENTE</span>'", build: function(d, l, esc){ return "?'<span class=\"result-lbl\" style=\"color:var(--muted)\">" + esc(d.tools_page.result_pending) + "</span>'"; }},
      {find: "resultHtml='<span class=\"result-lbl\" style=\"color:'+color+'\">'+(p.result==='win'?'GAGNÉ':'PERDU')+(p.score?' ('+p.score+')':'')+'</span>';",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "resultHtml='<span class=\"result-lbl\" style=\"color:'+color+'\">'+(p.result==='win'?'" + esc(t.result_won) + "':'" + esc(t.result_lost) + "')+(p.score?' ('+p.score+')':'')+'</span>';";
      }},
      {find: "var srcTag=p.source==='auto'?'<span class=\"src-tag src-auto\">🔄 AUTO</span>':'<span class=\"src-tag src-manual\">✎ MANUEL</span>';",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "var srcTag=p.source==='auto'?'<span class=\"src-tag src-auto\">" + esc(t.src_auto) + "</span>':'<span class=\"src-tag src-manual\">" + esc(t.src_manual) + "</span>';";
      }},
      {find: "+'<textarea class=\"ntextarea\" id=\"note-input-'+p.id+'\" placeholder=\"Ta note sur ce pari...\">'+p.note+'</textarea>'\n      +'<button class=\"btnvalid\" onclick=\"saveBetNote('+p.id+')\">✓ ENREGISTRER</button>'",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "+'<textarea class=\"ntextarea\" id=\"note-input-'+p.id+'\" placeholder=\"" + esc(t.note_placeholder_bet) + "\">'+p.note+'</textarea>'\n      +'<button class=\"btnvalid\" onclick=\"saveBetNote('+p.id+')\">" + esc(t.btn_save) + "</button>'";
      }},
      {find: "'<div class=\"empty-hint\">Aucun pari suivi. Va dans Sélections et clique \"GÉRER\" sur une ligne pour commencer.</div>'",
       build: function(d, l, esc){ return "'<div class=\"empty-hint\">" + esc(d.tools_page.empty_no_bets) + "</div>'"; }},
      {find: "showToast('Note enregistrée sur ce pari');", build: function(d, l, esc){ return "showToast('" + esc(d.tools_page.toast_note_saved_bet) + "');"; }},
      {find: "if(!confirm('Supprimer ce pari de ton suivi ?'))return;", build: function(d, l, esc){ return "if(!confirm('" + esc(d.tools_page.confirm_delete_bet) + "'))return;"; }},
      {find: "btn.innerHTML='<span class=\"spin\"></span>SYNCHRO...';\n  status.innerHTML='Lecture de historique.json...';",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "btn.innerHTML='<span class=\"spin\"></span>" + esc(t.sync_btn_syncing) + "';\n  status.innerHTML='" + esc(t.sync_reading) + "';";
      }},
      {find: "status.innerHTML=n>0?'<b>'+n+' pari(s)</b> résolu(s) automatiquement — 0 clic nécessaire.':'Rien de nouveau à résoudre pour l\\'instant.';\n    showToast(n>0?n+' résultat(s) synchronisés':'Aucun nouveau résultat');",
       build: function(d, l, esc){
        var t = d.tools_page;
        return "status.innerHTML=n>0?'" + esc(t.sync_result_prefix) + "'+n+'" + esc(t.sync_result_mid) + "':'" + esc(t.sync_nothing_new) + "';\n    showToast(n>0?n+'" + esc(t.toast_sync_suffix) + "':'" + esc(t.toast_sync_none) + "');";
      }},
      {find: "status.innerHTML='Synchronisation indisponible pour le moment — réessaie plus tard.';", build: function(d, l, esc){ return "status.innerHTML='" + esc(d.tools_page.sync_unavailable) + "';"; }},
      {find: "btn.innerHTML='🔄 SYNCHRONISER';", build: function(d, l, esc){ return "btn.innerHTML='" + esc(d.tools_page.sync_btn_default) + "';"; }},
      {find: "showToast('Pari ajouté depuis l\\'ajout rapide');", build: function(d, l, esc){ return "showToast('" + esc(d.tools_page.toast_modal_added) + "');"; }},
      {find: "+'<div class=\"bet-info\"><div class=\"mname\">'+p.match+srcTag+'</div><div class=\"mleague\">'+p.market+' · cote '+p.cote.toFixed(2)+' · '+p.mise+'€</div></div>'",
       build: function(d, l, esc){ return "+'<div class=\"bet-info\"><div class=\"mname\">'+p.match+srcTag+'</div><div class=\"mleague\">'+p.market+' · " + esc(d.tools_page.bet_odds_label) + "'+p.cote.toFixed(2)+' · '+p.mise+'€</div></div>'"; }},
      {find: "if(s.includes('over 2.5'))return 'Plus de 2,5 buts';\n  if(s.includes('under 2.5'))return 'Moins de 2,5 buts';\n  if(s.includes('over 1.5'))return 'Plus de 1,5 but';\n  if(s.includes('btts non')||s.includes('une équipe ne marque'))return 'Une équipe ne marque pas';\n  if(s.includes('btts')||s.includes('les deux équipes'))return 'Les deux équipes marquent';\n  if(s.includes('dc 1x')||s.includes('1x'))return 'DC 1X';\n  if(s.includes('dc x2')||s.includes('x2'))return 'DC X2';",
       build: function(d, l, esc){
        var n = d.market_names, nat = d.market_names_natural;
        return "if(s.includes('over 2.5'))return '" + esc(n.over25) + "';\n  if(s.includes('under 2.5'))return '" + esc(n.under25) + "';\n  if(s.includes('over 1.5'))return '" + esc(n.over15) + "';\n  if(s.includes('btts non')||s.includes('une équipe ne marque'))return '" + esc(nat.btts_non_natural) + "';\n  if(s.includes('btts')||s.includes('les deux équipes'))return '" + esc(nat.btts_oui_natural) + "';\n  if(s.includes('dc 1x')||s.includes('1x'))return '" + esc(n.dc1x) + "';\n  if(s.includes('dc x2')||s.includes('x2'))return '" + esc(n.dc_x2) + "';";
      }}
    ]
  }
];

module.exports = PAGES;
