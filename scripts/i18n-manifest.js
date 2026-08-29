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
  }
];

module.exports = PAGES;
