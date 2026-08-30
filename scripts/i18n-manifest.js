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

// Nouveau chrome de l'accueil premium. Les textes sont regroupes ici pour
// que la refonte visuelle reste reellement localisee dans les six langues.
var HOME_V2 = {
  fr:{matches:'Matchs',markets:'Marchés',method:'Méthode',guides:'Guides',start:'Commencer',eyebrow:"L'ANALYSE SPORTIVE, SANS LE BRUIT",title1:'Comprenez le match.',title2:'Identifiez le marché juste.',sub:'IASHARK transforme des millions de données sportives en une décision claire, expliquée et mesurable.',discover:'Découvrir la méthode',updated:'Données actualisées',multi:'Analyse multi-facteurs',explained:'Décision expliquée',featureLoading:'SÉLECTION DU MATCH À SUIVRE…',decisions:'Les décisions du jour',decisionsSub:'Un marché prioritaire par match, choisi selon la convergence des données.',recommended:'MARCHÉ RECOMMANDÉ',modelConfidence:"Confiance de l'analyse",reading:'Lecture IASHARK',priority:'Prioritaire',recent:'Forme récente',advanced:'Données avancées',context:'Contexte du match',insight:"Ouvrez l'analyse pour voir les facteurs, limites et risques de cette sélection.",confidence:'CONFIANCE',view:'Voir l\'analyse →',today:"Aujourd'hui",noHero:'AUCUN MATCH DISPONIBLE',noOtherToday:'AUCUN AUTRE MATCH TROUVÉ',noOtherTomorrow:'AUCUN AUTRE MATCH DEMAIN',otherLeague:'Essaie un autre championnat.'},
  en:{matches:'Matches',markets:'Markets',method:'Method',guides:'Guides',start:'Get started',eyebrow:'SPORTS ANALYSIS, WITHOUT THE NOISE',title1:'Understand the match.',title2:'Find the right market.',sub:'IASHARK turns millions of sports data points into one clear, explained and measurable decision.',discover:'Discover the method',updated:'Updated data',multi:'Multi-factor analysis',explained:'Explained decision',featureLoading:'SELECTING THE MATCH TO WATCH…',decisions:"Today's decisions",decisionsSub:'One priority market per match, selected when the data converges.',recommended:'RECOMMENDED MARKET',modelConfidence:'Analysis confidence',reading:'IASHARK reading',priority:'Priority',recent:'Recent form',advanced:'Advanced data',context:'Match context',insight:'Open the analysis to see the factors, limitations and risks behind this selection.',confidence:'CONFIDENCE',view:'View analysis →',today:'Today',noHero:'NO MATCH AVAILABLE',noOtherToday:'NO OTHER MATCH FOUND',noOtherTomorrow:'NO OTHER MATCH TOMORROW',otherLeague:'Try another competition.'},
  es:{matches:'Partidos',markets:'Mercados',method:'Método',guides:'Guías',start:'Empezar',eyebrow:'ANÁLISIS DEPORTIVO, SIN RUIDO',title1:'Entiende el partido.',title2:'Encuentra el mercado adecuado.',sub:'IASHARK transforma millones de datos deportivos en una decisión clara, explicada y medible.',discover:'Descubrir el método',updated:'Datos actualizados',multi:'Análisis multifactorial',explained:'Decisión explicada',featureLoading:'SELECCIONANDO EL PARTIDO DESTACADO…',decisions:'Las decisiones del día',decisionsSub:'Un mercado prioritario por partido, elegido cuando convergen los datos.',recommended:'MERCADO RECOMENDADO',modelConfidence:'Confianza del análisis',reading:'Lectura IASHARK',priority:'Prioritario',recent:'Forma reciente',advanced:'Datos avanzados',context:'Contexto del partido',insight:'Abre el análisis para ver los factores, límites y riesgos de esta selección.',confidence:'CONFIANZA',view:'Ver análisis →',today:'Hoy',noHero:'NINGÚN PARTIDO DISPONIBLE',noOtherToday:'NO SE ENCONTRARON MÁS PARTIDOS',noOtherTomorrow:'NO HAY OTRO PARTIDO MAÑANA',otherLeague:'Prueba otra competición.'},
  de:{matches:'Spiele',markets:'Märkte',method:'Methode',guides:'Guides',start:'Starten',eyebrow:'SPORTANALYSE, OHNE ABLENKUNG',title1:'Verstehe das Spiel.',title2:'Finde den richtigen Markt.',sub:'IASHARK verwandelt Millionen von Sportdaten in eine klare, erklärte und messbare Entscheidung.',discover:'Methode entdecken',updated:'Aktuelle Daten',multi:'Multifaktor-Analyse',explained:'Erklärte Entscheidung',featureLoading:'TOPSPIEL WIRD AUSGEWÄHLT…',decisions:'Die Entscheidungen des Tages',decisionsSub:'Ein vorrangiger Markt pro Spiel, ausgewählt wenn die Daten übereinstimmen.',recommended:'EMPFOHLENER MARKT',modelConfidence:'Analysevertrauen',reading:'IASHARK Einschätzung',priority:'Prioritär',recent:'Aktuelle Form',advanced:'Erweiterte Daten',context:'Spielkontext',insight:'Öffne die Analyse, um Faktoren, Grenzen und Risiken dieser Auswahl zu sehen.',confidence:'KONFIDENZ',view:'Analyse ansehen →',today:'Heute',noHero:'KEIN SPIEL VERFÜGBAR',noOtherToday:'KEIN WEITERES SPIEL GEFUNDEN',noOtherTomorrow:'MORGEN KEIN WEITERES SPIEL',otherLeague:'Versuche einen anderen Wettbewerb.'},
  it:{matches:'Partite',markets:'Mercati',method:'Metodo',guides:'Guide',start:'Inizia',eyebrow:'ANALISI SPORTIVA, SENZA RUMORE',title1:'Comprendi la partita.',title2:'Trova il mercato giusto.',sub:'IASHARK trasforma milioni di dati sportivi in una decisione chiara, spiegata e misurabile.',discover:'Scopri il metodo',updated:'Dati aggiornati',multi:'Analisi multifattoriale',explained:'Decisione spiegata',featureLoading:'SELEZIONE DEL MATCH DA SEGUIRE…',decisions:'Le decisioni del giorno',decisionsSub:'Un mercato prioritario per partita, scelto quando i dati convergono.',recommended:'MERCATO CONSIGLIATO',modelConfidence:"Affidabilità dell'analisi",reading:'Lettura IASHARK',priority:'Prioritario',recent:'Forma recente',advanced:'Dati avanzati',context:'Contesto partita',insight:"Apri l'analisi per vedere fattori, limiti e rischi di questa selezione.",confidence:'FIDUCIA',view:"Vedi l'analisi →",today:'Oggi',noHero:'NESSUNA PARTITA DISPONIBILE',noOtherToday:'NESSUN ALTRO MATCH TROVATO',noOtherTomorrow:'NESSUN ALTRO MATCH DOMANI',otherLeague:"Prova un'altra competizione."},
  pt:{matches:'Jogos',markets:'Mercados',method:'Método',guides:'Guias',start:'Começar',eyebrow:'ANÁLISE DESPORTIVA, SEM RUÍDO',title1:'Compreenda o jogo.',title2:'Encontre o mercado certo.',sub:'A IASHARK transforma milhões de dados desportivos numa decisão clara, explicada e mensurável.',discover:'Descobrir o método',updated:'Dados atualizados',multi:'Análise multifatorial',explained:'Decisão explicada',featureLoading:'A SELECIONAR O JOGO EM DESTAQUE…',decisions:'As decisões do dia',decisionsSub:'Um mercado prioritário por jogo, escolhido quando os dados convergem.',recommended:'MERCADO RECOMENDADO',modelConfidence:'Confiança da análise',reading:'Leitura IASHARK',priority:'Prioritário',recent:'Forma recente',advanced:'Dados avançados',context:'Contexto do jogo',insight:'Abra a análise para ver os fatores, limites e riscos desta seleção.',confidence:'CONFIANÇA',view:'Ver análise →',today:'Hoje',noHero:'NENHUM JOGO DISPONÍVEL',noOtherToday:'NENHUM OUTRO JOGO ENCONTRADO',noOtherTomorrow:'NENHUM OUTRO JOGO AMANHÃ',otherLeague:'Experimente outra competição.'}
};

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
      {find: '<option value="buteurs">Buteurs</option>', build: function(d, l, esc){ return '<option value="buteurs">' + esc(d.markets_page.filter_buteurs) + "</option>"; }},
      {find: '<option value="tirs">Tirs joueur</option>', build: function(d, l, esc){ return '<option value="tirs">' + esc(d.markets_page.filter_tirs) + "</option>"; }},
      {find: '<option value="tirs_cadres">Tirs cadrés</option>', build: function(d, l, esc){ return '<option value="tirs_cadres">' + esc(d.markets_page.filter_tirs_cadres) + "</option>"; }},
      {find: "var PLAYER_MARKET_LABELS={ANYTIME_GOALSCORER:'Buteur',PLAYER_SHOTS:'Tirs',PLAYER_SHOTS_ON_TARGET:'Tirs cadrés'};",
       build: function(d, l, esc){
        var p = d.match_page;
        return "var PLAYER_MARKET_LABELS={ANYTIME_GOALSCORER:'" + esc(p.player_engine_market_goalscorer) + "',PLAYER_SHOTS:'" + esc(p.player_engine_market_shots) + "',PLAYER_SHOTS_ON_TARGET:'" + esc(p.player_engine_market_shots_target) + "'};";
      }},
      {find: "var PM_TXT={empty_prefix:'AUCUN MARCHÉ',empty_suffix:'DISPONIBLE AUJOURD\\'HUI',empty_sub:'Composition officielle pas encore confirmée pour les matchs du jour, ou analyse limitée pour cette compétition.',th_player:'Joueur',th_match:'Match',th_status:'Statut',th_minutes:'Min. attendues',th_prob:'Probabilité IASHARK',th_quality:'Qualité données',th_sample:'Échantillon'};",
       build: function(d, l, esc){
        var p = d.markets_page;
        return "var PM_TXT={empty_prefix:'" + esc(p.pm_empty_prefix) + "',empty_suffix:'" + esc(p.pm_empty_suffix) + "',empty_sub:'" + esc(p.pm_empty_sub) + "',th_player:'" + esc(p.pm_th_player) + "',th_match:'" + esc(p.pm_th_match) + "',th_status:'" + esc(p.pm_th_status) + "',th_minutes:'" + esc(p.pm_th_minutes) + "',th_prob:'" + esc(p.pm_th_prob) + "',th_quality:'" + esc(p.pm_th_quality) + "',th_sample:'" + esc(p.pm_th_sample) + "'};";
      }},
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
      {find: "{label:'Draw No Bet',category:'1X2',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c3) + "',category:'1X2',status:'experimental'},"; }},
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
      {find: "{label:'Buteur',category:'JOUEURS',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c17) + "',category:'JOUEURS',status:'experimental'},"; }},
      {find: "{label:'Tirs joueur',category:'JOUEURS',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c18) + "',category:'JOUEURS',status:'experimental'},"; }},
      {find: "{label:'Tirs cadrés joueur',category:'JOUEURS',status:'experimental'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c19) + "',category:'JOUEURS',status:'experimental'},"; }},
      {find: "{label:'Autres player props (cartons, fautes, passes...)',category:'JOUEURS',status:'unsupported'},", build: function(d, l, esc){ return "{label:'" + esc(d.market_catalog.c20) + "',category:'JOUEURS',status:'unsupported'},"; }},
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
      {find: "wrap.innerHTML='<div class=\"empty-state\"><div class=\"empty-state-icon\"><svg viewBox=\"0 0 24 24\"><circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M21 21l-4.35-4.35\"/></svg></div>AUCUN MARCHÉ EXPLOITABLE AUJOURD\\'HUI<br><span style=\"color:rgba(74,101,128,0.6)\">Revenez plus tard, ou consultez le catalogue des marchés ci-dessous.</span></div>';", build: function(d, l, esc){
        var m = d.markets_page;
        return "wrap.innerHTML='<div class=\"empty-state\"><div class=\"empty-state-icon\"><svg viewBox=\"0 0 24 24\"><circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M21 21l-4.35-4.35\"/></svg></div>" + esc(m.empty_today) + "<br><span style=\"color:rgba(74,101,128,0.6)\">" + esc(m.empty_today_sub) + "</span></div>';";
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
      {find: '<a href="#decisions">Matchs</a>', build: function(d,l){ return '<a href="#decisions">' + HOME_V2[l].matches + '</a>'; }},
      {find: '<a href="/marches.html">Marchés</a>', build: function(d,l){ return '<a href="/marches.html">' + HOME_V2[l].markets + '</a>'; }},
      {find: '<a href="/a-propos.html">Méthode</a>', build: function(d,l){ return '<a href="/a-propos.html">' + HOME_V2[l].method + '</a>'; }},
      {find: '<a href="/blog/">Guides</a>', build: function(d,l){ return '<a href="/blog/">' + HOME_V2[l].guides + '</a>'; }},
      {find: '<a href="#decisions" class="btn-start">Commencer</a>', build: function(d,l){ return '<a href="#decisions" class="btn-start">' + HOME_V2[l].start + '</a>'; }},
      {find: '<div class="hero-eyebrow">L\'ANALYSE SPORTIVE, SANS LE BRUIT</div>', build: function(d,l){ return '<div class="hero-eyebrow">' + HOME_V2[l].eyebrow + '</div>'; }},
      {find: '<h1 class="hero-title">Comprenez le match.<br>Identifiez le marché juste.</h1>', build: function(d,l){ var h=HOME_V2[l]; return '<h1 class="hero-title">' + h.title1 + '<br>' + h.title2 + '</h1>'; }},
      {find: '<p class="hero-sub">IASHARK transforme des millions de données sportives en une décision claire, expliquée et mesurable.</p>', build: function(d,l){ return '<p class="hero-sub">' + HOME_V2[l].sub + '</p>'; }},
      {find: 'Découvrir la méthode <span aria-hidden="true">→</span>', build: function(d,l){ return HOME_V2[l].discover + ' <span aria-hidden="true">→</span>'; }},
      {find: 'Données actualisées</span>', build: function(d,l){ return HOME_V2[l].updated + '</span>'; }},
      {find: 'Analyse multi-facteurs</span>', build: function(d,l){ return HOME_V2[l].multi + '</span>'; }},
      {find: 'Décision expliquée</span>', build: function(d,l){ return HOME_V2[l].explained + '</span>'; }},
      {find: '<div class="feature-loading">SÉLECTION DU MATCH À SUIVRE…</div>', build: function(d,l){ return '<div class="feature-loading">' + HOME_V2[l].featureLoading + '</div>'; }},
      {find: '<div class="decisions-title"><h2>Les décisions du jour</h2><p>Un marché prioritaire par match, choisi selon la convergence des données.</p></div>', build: function(d,l){ var h=HOME_V2[l]; return '<div class="decisions-title"><h2>' + h.decisions + '</h2><p>' + h.decisionsSub + '</p></div>'; }},
      {find: '<span id="champDropdownLabel">Tous les championnats</span>', build: function(d){ return '<span id="champDropdownLabel">' + d.home_page.all_leagues_item + '</span>'; }},
      {find: '>Aujourd\'hui <span class="tab-count" id="countToday">—</span>', build: function(d){ return '>' + d.home_page.today + ' <span class="tab-count" id="countToday">—</span>'; }},
      {find: '>Demain <span class="tab-count" id="countTomorrow">—</span>', build: function(d){ return '>' + d.home_page.tomorrow + ' <span class="tab-count" id="countTomorrow">—</span>'; }},
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
      {find: '<div class="nav-lbl">OUTILS</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.tools + '</div>'; }},
      {find: '<div class="nav-lbl">GUIDES</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.guides + '</div>'; }},
      {find: '<div class="nav-lbl">COMPTE</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.account + '</div>'; }},
      {find: LEAGUE_LABELS_FR_TEXT, build: function(d){ return renderLeagueLabels(d); }},
      {find: "return'Plus de 2,5 buts';if(s.includes('under 2.5'))return'Moins de 2,5 buts';if(s.includes('over 1.5'))return'Plus de 1,5 but';if(s.includes('btts non')||s.includes('une équipe ne marque'))return'Une équipe ne marque pas';if(s.includes('btts')||s.includes('les deux équipes'))return'Les deux équipes marquent';if(s.includes('dc 1x')||s==='1x')return'DC 1X';if(s.includes('dc x2')||s==='x2')return'DC X2';return r;}",
       build: function(d, l, esc){
        var n = d.market_names, nat = d.market_names_natural;
        return "return'" + esc(n.over25) + "';if(s.includes('under 2.5'))return'" + esc(n.under25) + "';if(s.includes('over 1.5'))return'" + esc(n.over15) + "';if(s.includes('btts non')||s.includes('une équipe ne marque'))return'" + esc(nat.btts_non_natural) + "';if(s.includes('btts')||s.includes('les deux équipes'))return'" + esc(nat.btts_oui_natural) + "';if(s.includes('dc 1x')||s==='1x')return'" + esc(n.dc1x) + "';if(s.includes('dc x2')||s==='x2')return'" + esc(n.dc_x2) + "';return r;}";
      }},
      {find: "function marketInsight(){return'Ouvrez l\\'analyse pour voir les facteurs, limites et risques de cette sélection.';}", build: function(d,l,esc){ return "function marketInsight(){return'" + esc(HOME_V2[l].insight) + "';}"; }},
      {find: '<span class="mc-pari-label">MARCHÉ RECOMMANDÉ</span>', build: function(d,l){ return '<span class="mc-pari-label">' + HOME_V2[l].recommended + '</span>'; }},
      {find: '<span class="conf-label">CONFIANCE</span>', build: function(d,l){ return '<span class="conf-label">' + HOME_V2[l].confidence + '</span>'; }},
      {find: "<span class=\"mc-cta\">Voir l\\'analyse →</span>", build: function(d,l,esc){ return '<span class="mc-cta">' + esc(HOME_V2[l].view) + '</span>'; }},
      {find: "aria-label=\"Voir l\\'analyse ", count: 2, build: function(d,l,esc){ var labels={fr:"Voir l'analyse ",en:'View analysis ',es:'Ver análisis ',de:'Analyse ansehen ',it:"Vedi l'analisi ",pt:'Ver análise '}; return 'aria-label="' + esc(labels[l]); }},
      {find: "+' contre '+", count: 2, build: function(d,l){ var vs={fr:' contre ',en:' vs ',es:' contra ',de:' gegen ',it:' contro ',pt:' contra '}; return "+'" + vs[l] + "'+"; }},
      {find: "<div>Aujourd\\'hui · '+heure+'</div>", build: function(d,l,esc){ return "<div>" + esc(HOME_V2[l].today) + " · '+heure+'</div>"; }},
      {find: '<div class="signal-label">Marché recommandé</div>', build: function(d,l){ return '<div class="signal-label">' + HOME_V2[l].recommended + '</div>'; }},
      {find: '<span>Confiance de l\\\'analyse</span>', build: function(d,l,esc){ return '<span>' + esc(HOME_V2[l].modelConfidence) + '</span>'; }},
      {find: '<span class="evidence-chip">Forme récente</span><span class="evidence-chip">Données avancées</span><span class="evidence-chip">Contexte du match</span>', build: function(d,l){ var h=HOME_V2[l]; return '<span class="evidence-chip">' + h.recent + '</span><span class="evidence-chip">' + h.advanced + '</span><span class="evidence-chip">' + h.context + '</span>'; }},
      {find: "'<div class=\"feature-loading\">AUCUN MATCH DISPONIBLE</div>'", build: function(d,l,esc){ return "'<div class=\"feature-loading\">" + esc(HOME_V2[l].noHero) + "</div>'"; }},
      {find: "el.innerHTML='<div class=\"empty-state\"><h3>'+(isDemain?'AUCUN AUTRE MATCH DEMAIN':'AUCUN AUTRE MATCH TROUVÉ')+'</h3><p>'+(isDemain?'Reviens ce soir pour les analyses de demain.':'Essaie un autre championnat.')+'</p></div>';", build: function(d,l,esc){ var h=HOME_V2[l]; return "el.innerHTML='<div class=\"empty-state\"><h3>'+(isDemain?'" + esc(h.noOtherTomorrow) + "':'" + esc(h.noOtherToday) + "')+'</h3><p>" + esc(h.otherLeague) + "</p></div>';"; }},
      {find: "var pariLabel=m.pari_rec?translateMarket(m.pari_rec):(m.no_signal_label||'Analyse en cours — aucun marché prioritaire.');", build: function(d, l, esc){ return "var pariLabel=m.pari_rec?translateMarket(m.pari_rec):(m.no_signal_label||'" + esc(d.home_page.no_signal_fallback) + "');"; }},
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
      {find: '<span id="authHeaderSlot"><a class="btn-login" href="/compte.html">CONNEXION</a></span>', build: function(d){ return '<span id="authHeaderSlot"><a class="btn-login" href="/compte.html">' + d.cta.login + '</a></span>'; }},
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
      {find: '<div class="nav-lbl">OUTILS</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.tools + '</div>'; }},
      {find: '<div class="nav-lbl">GUIDES</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.guides + '</div>'; }},
      {find: '<div class="nav-lbl">COMPTE</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.account + '</div>'; }},
      {find: "el.innerHTML='<div style=\"text-align:center;padding:60px 20px;font-family:Space Mono,monospace;font-size:10px;color:var(--muted)\">ID MANQUANT<br><br><a href=\"/\" style=\"color:var(--cyan)\">← RETOUR</a></div>';",
       build: function(d, l, esc){ return "el.innerHTML='<div style=\"text-align:center;padding:60px 20px;font-family:Space Mono,monospace;font-size:10px;color:var(--muted)\">" + esc(d.match_page.id_missing) + "<br><br><a href=\"/\" style=\"color:var(--cyan)\">" + esc(d.match_page.back) + "</a></div>';"; }},
      {find: "el.innerHTML='<div style=\"text-align:center;padding:60px 20px\"><div style=\"font-family:Space Mono,monospace;font-size:10px;color:var(--muted)\">MATCH INTROUVABLE · ID: '+fId+'</div><br><a href=\"/\" style=\"color:var(--cyan);font-family:Space Mono,monospace;font-size:9px\">← RETOUR</a></div>';",
       build: function(d, l, esc){ return "el.innerHTML='<div style=\"text-align:center;padding:60px 20px\"><div style=\"font-family:Space Mono,monospace;font-size:10px;color:var(--muted)\">" + esc(d.match_page.match_not_found_prefix) + "'+fId+'</div><br><a href=\"/\" style=\"color:var(--cyan);font-family:Space Mono,monospace;font-size:9px\">" + esc(d.match_page.back) + "</a></div>';"; }},
      {find: "el.innerHTML='<div style=\"text-align:center;padding:60px 20px;color:var(--muted)\">Erreur de chargement</div>';",
       build: function(d, l, esc){ return "el.innerHTML='<div style=\"text-align:center;padding:60px 20px;color:var(--muted)\">" + esc(d.common.error_loading) + "</div>';"; }},
      {find: "+'<button class=\"tab-btn active\" id=\"tab-btn-resume\" role=\"tab\" aria-selected=\"true\" aria-controls=\"tab-resume\" data-tab=\"resume\" onclick=\"switchTab(this,\\'resume\\')\">RÉSUMÉ</button>'\n    +'<button class=\"tab-btn\" id=\"tab-btn-donnees\" role=\"tab\" aria-selected=\"false\" aria-controls=\"tab-donnees\" data-tab=\"donnees\" onclick=\"switchTab(this,\\'donnees\\')\">DONNÉES AVANCÉES</button>'\n    +'<button class=\"tab-btn\" id=\"tab-btn-joueurs\" role=\"tab\" aria-selected=\"false\" aria-controls=\"tab-joueurs\" data-tab=\"joueurs\" onclick=\"switchTab(this,\\'joueurs\\')\">JOUEURS</button>'",
       build: function(d, l, esc){
        var t = d.match_page;
        return "+'<button class=\"tab-btn active\" id=\"tab-btn-resume\" role=\"tab\" aria-selected=\"true\" aria-controls=\"tab-resume\" data-tab=\"resume\" onclick=\"switchTab(this,\\'resume\\')\">" + esc(t.tab_summary) + "</button>'\n    +'<button class=\"tab-btn\" id=\"tab-btn-donnees\" role=\"tab\" aria-selected=\"false\" aria-controls=\"tab-donnees\" data-tab=\"donnees\" onclick=\"switchTab(this,\\'donnees\\')\">" + esc(t.tab_advanced_data) + "</button>'\n    +'<button class=\"tab-btn\" id=\"tab-btn-joueurs\" role=\"tab\" aria-selected=\"false\" aria-controls=\"tab-joueurs\" data-tab=\"joueurs\" onclick=\"switchTab(this,\\'joueurs\\')\">" + esc(t.tab_players) + "</button>'";
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
      {find: '<div class="stitle">HEAD TO HEAD</div>', count: 2, build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_h2h) + '</div>'; }},
      {find: '<div class="stitle">INDICE DE FORCE</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_force_index) + '</div>'; }},
      {find: '<div class="stitle">ARBITRE & DISCIPLINE — \'+esc(arb.nom)+\'</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_referee_prefix) + '\'+esc(arb.nom)+\'</div>'; }},
      {find: '<div class="stitle">MODÈLE IA SHARK — CM 2026</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_wc_model) + '</div>'; }},
      {find: '<div class="stitle">SCÉNARIO ATTENDU</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_scenario) + '</div>'; }},
      {find: '<div class="stitle">JOUEURS À SUIVRE — CLASSEMENT</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_players) + '</div>'; }},
      {find: "var PE_TXT={title:'PROJECTIONS JOUEURS',empty:'PAS ENCORE DE DONNÉES PLAYER ENGINE POUR CE MATCH',empty_sub:'(composition officielle pas encore confirmée, ou analyse limitée pour cette compétition)',disclaimer:'Modèle statistique dédié (Poisson, minutes attendues + contexte d\\'équipe) — jamais une cote transformée en probabilité. Statut : FORWARD_VALIDATION_ONLY tant qu\\'aucun backtest hors échantillon réel n\\'a été exécuté.',minutes:'Minutes attendues',quality:'Data quality',sample:'Échantillon',matches_suffix:'matchs',prob_iashark:'Probabilité IASHARK',odds:'Cote',market_prob:'Probabilité marché'};",
       build: function(d, l, esc){
        var p = d.match_page;
        return "var PE_TXT={title:'" + esc(p.player_engine_title) + "',empty:'" + esc(p.player_engine_empty) + "',empty_sub:'" + esc(p.player_engine_empty_sub) + "',disclaimer:'" + esc(p.player_engine_disclaimer) + "',minutes:'" + esc(p.player_engine_minutes) + "',quality:'" + esc(p.player_engine_quality) + "',sample:'" + esc(p.player_engine_sample) + "',matches_suffix:'" + esc(p.player_engine_matches_suffix) + "',prob_iashark:'" + esc(p.player_engine_prob_iashark) + "',odds:'" + esc(p.player_engine_odds) + "',market_prob:'" + esc(p.player_engine_market_prob) + "'};";
      }},
      {find: "var marketLabels={ANYTIME_GOALSCORER:'Buteur',PLAYER_SHOTS:'Tirs',PLAYER_SHOTS_ON_TARGET:'Tirs cadrés'};",
       build: function(d, l, esc){
        var p = d.match_page;
        return "var marketLabels={ANYTIME_GOALSCORER:'" + esc(p.player_engine_market_goalscorer) + "',PLAYER_SHOTS:'" + esc(p.player_engine_market_shots) + "',PLAYER_SHOTS_ON_TARGET:'" + esc(p.player_engine_market_shots_target) + "'};";
      }},
      {find: "var lineupLabels={confirmed_starter:'Titulaire confirmé',confirmed_bench:'Remplaçant confirmé',expected_starter:'Titulaire attendu',expected_bench:'Remplaçant attendu'};",
       build: function(d, l, esc){
        var p = d.match_page;
        return "var lineupLabels={confirmed_starter:'" + esc(p.player_engine_status_confirmed_starter) + "',confirmed_bench:'" + esc(p.player_engine_status_confirmed_bench) + "',expected_starter:'" + esc(p.player_engine_status_expected_starter) + "',expected_bench:'" + esc(p.player_engine_status_expected_bench) + "'};";
      }},
      {find: '+\'<div style="text-align:right;"><div style="font-family:Space Mono,monospace;font-size:15px;font-weight:700;color:var(--text);">\'+ratioSaison+\'%</div><div style="font-family:Space Mono,monospace;font-size:8px;color:var(--muted);margin-top:1px;">ratio buts/match (saison)</div></div>\'',
       build: function(d, l, esc){
        return '+\'<div style="text-align:right;"><div style="font-family:Space Mono,monospace;font-size:15px;font-weight:700;color:var(--text);">\'+ratioSaison+\'%</div><div style="font-family:Space Mono,monospace;font-size:8px;color:var(--muted);margin-top:1px;">' + esc(d.match_page.season_ratio_label) + '</div></div>\'';
      }},
      {find: '<div class="stitle">SURFACE — \'+surfLabel.toUpperCase()+\'</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_surface_prefix) + '\'+surfLabel.toUpperCase()+\'</div>'; }},
      {find: '<div class="stitle">PALMARÈS CE TOURNOI</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_palmares) + '</div>'; }},
      {find: '<div class="stitle">CONTEXTE</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_context) + '</div>'; }},
      {find: '<div class="stitle">POURQUOI CE PARI ?</div>', build: function(d, l, esc){ return '<div class="stitle">' + esc(d.match_page.section_why) + '</div>'; }},
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
      {find: '<button class="sync-btn" id="syncBtn" onclick="runSync()"><svg viewBox="0 0 24 24" width="12" height="12" style="vertical-align:-2px;margin-right:4px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>SYNCHRONISER</button>',
       build: function(d, l, esc){ return '<button class="sync-btn" id="syncBtn" onclick="runSync()"><svg viewBox="0 0 24 24" width="12" height="12" style="vertical-align:-2px;margin-right:4px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>' + esc(d.tools_page.sync_btn_default) + '</button>'; }},
      {find: '<div class="day-summary" id="daySummary">🦈 <div>Chargement du résumé du jour...</div></div>', build: function(d, l, esc){ return '<div class="day-summary" id="daySummary">🦈 <div>' + esc(d.common.loading) + '</div></div>'; }},
      {find: '<span class="capital-lbl">CALCULATEURS GRATUITS</span>', build: function(d, l, esc){ return '<span class="capital-lbl">' + esc(d.tools_page.free_calc_title) + '</span>'; }},
      {find: '<div class="capital-lbl" style="margin-bottom:4px;">COTE DÉCIMALE</div>', count: 2, build: function(d){ return '<div class="capital-lbl" style="margin-bottom:4px;">' + d.tools_page.calc_odds_label + '</div>'; }},
      {find: '<div class="capital-lbl" style="margin-bottom:4px;">PROBABILITÉ IMPLICITE (%)</div>', build: function(d){ return '<div class="capital-lbl" style="margin-bottom:4px;">' + d.tools_page.calc_prob_label + '</div>'; }},
      {find: '<div class="capital-hint" style="color:var(--muted);font-size:9px;">Probabilité implicite = 100 / cote décimale — inclut la marge du bookmaker, ce n\'est pas une probabilité "juste" (fair).</div>',
       build: function(d){ return '<div class="capital-hint" style="color:var(--muted);font-size:9px;">' + d.tools_page.calc_prob_hint + '</div>'; }},
      {find: '<span class="capital-lbl">MARGE BOOKMAKER (1X2)</span>', build: function(d, l, esc){ return '<span class="capital-lbl">' + esc(d.tools_page.margin_title) + '</span>'; }},
      {find: 'placeholder="Cote 1"', build: function(d){ return 'placeholder="' + d.tools_page.margin_odds1 + '"'; }},
      {find: 'placeholder="Cote N"', build: function(d){ return 'placeholder="' + d.tools_page.margin_oddsn + '"'; }},
      {find: 'placeholder="Cote 2"', build: function(d){ return 'placeholder="' + d.tools_page.margin_odds2 + '"'; }},
      {find: '<span class="capital-lbl">MARGE</span>', build: function(d){ return '<span class="capital-lbl">' + d.tools_page.margin_label + '</span>'; }},
      {find: "margePct>=0?'(marge normale du bookmaker)':'(anomalie : somme des probabilités < 100%, vérifie les cotes saisies)'",
       build: function(d, l, esc){ return "margePct>=0?'" + esc(d.tools_page.margin_hint_normal) + "':'" + esc(d.tools_page.margin_hint_anomaly) + "'"; }},
      {find: "<button class=\"tab-btn active\" onclick=\"switchTab('selections',this)\">SÉLECTIONS</button>", build: function(d, l, esc){ return "<button class=\"tab-btn active\" onclick=\"switchTab('selections',this)\">" + esc(d.tools_page.tab_selections) + "</button>"; }},
      {find: "<button class=\"tab-btn\" onclick=\"switchTab('suivi',this)\">MON SUIVI</button>", build: function(d, l, esc){ return "<button class=\"tab-btn\" onclick=\"switchTab('suivi',this)\">" + esc(d.tools_page.tab_tracking) + "</button>"; }},
      {find: "<button class=\"tab-btn\" onclick=\"switchTab('calc',this)\">CALCULATEURS</button>", build: function(d, l, esc){ return "<button class=\"tab-btn\" onclick=\"switchTab('calc',this)\">" + esc(d.tools_page.tab_calculators) + "</button>"; }},
      {find: '<span class="lock-badge"><svg viewBox="0 0 24 24" width="10" height="10" style="vertical-align:-1px;margin-right:3px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>PROBA ≥ 70%</span>', build: function(d, l, esc){ return '<span class="lock-badge"><svg viewBox="0 0 24 24" width="10" height="10" style="vertical-align:-1px;margin-right:3px;stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>' + esc(d.tools_page.lock_badge) + '</span>'; }},
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
      {find: '<span class="capital-lbl">MISE DE KELLY (FRACTIONNAIRE)</span>', build: function(d, l, esc){ return '<span class="capital-lbl">' + esc(d.tools_page.kelly_title) + '</span>'; }},
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
      {find: '<button class="pw-cta" id="pwCtaBtn" onclick="handleProCta()">PASSER OUTILS — 19,95€/MOIS →</button>', build: function(d, l, esc){ return '<button class="pw-cta" id="pwCtaBtn" onclick="handleProCta()">' + esc(d.tools_page.pw_cta) + '</button>'; }},
      {find: "btn.disabled = true; btn.textContent = 'PATIENTE...';", build: function(d, l, esc){ return "btn.disabled = true; btn.textContent = '" + esc(d.tools_page.pw_cta_loading) + "';"; }},
      {find: "note.textContent = 'Le paiement en ligne n\\'est pas encore activé — reviens très bientôt. Écris-nous sur contact@iashark.com si tu veux être prévenu(e) dès l\\'ouverture.';",
       build: function(d, l, esc){ return "note.textContent = '" + esc(d.tools_page.pw_unavailable_msg) + "';"; }},
      {find: "note.textContent = 'Une erreur est survenue. Réessaie dans un instant.';", build: function(d, l, esc){ return "note.textContent = '" + esc(d.tools_page.pw_error_msg) + "';"; }},
      {find: "btn.disabled = false; btn.textContent = 'PASSER OUTILS — 19,95€/MOIS →';", build: function(d, l, esc){ return "btn.disabled = false; btn.textContent = '" + esc(d.tools_page.pw_cta) + "';"; }},
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
      {find: "+(suggMise?'<div class=\"mise-sugg-hint\">Mise conseillée sur ta bankroll actuelle : <b>'+suggMise+'€</b></div>':'')",
       build: function(d, l, esc){ return "+(suggMise?'<div class=\"mise-sugg-hint\">" + esc(d.tools_page.mise_sugg_prefix) + "<b>'+suggMise+'€</b></div>':'')"; }},
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
      {find: "var srcTag=p.source==='auto'?'<span class=\"src-tag src-auto\">AUTO</span>':'<span class=\"src-tag src-manual\">✎ MANUEL</span>';",
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
      {find: "btn.innerHTML='<svg viewBox=\"0 0 24 24\" width=\"12\" height=\"12\" style=\"vertical-align:-2px;margin-right:4px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;\"><path d=\"M23 4v6h-6\"/><path d=\"M1 20v-6h6\"/><path d=\"M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15\"/></svg>SYNCHRONISER';", build: function(d, l, esc){ return "btn.innerHTML='<svg viewBox=\"0 0 24 24\" width=\"12\" height=\"12\" style=\"vertical-align:-2px;margin-right:4px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;\"><path d=\"M23 4v6h-6\"/><path d=\"M1 20v-6h6\"/><path d=\"M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15\"/></svg>' + esc(d.tools_page.sync_btn_default) + '';"; }},
      {find: "showToast('Pari ajouté depuis l\\'ajout rapide');", build: function(d, l, esc){ return "showToast('" + esc(d.tools_page.toast_modal_added) + "');"; }},
      {find: "+'<div class=\"bet-info\"><div class=\"mname\">'+esc(p.match)+srcTag+'</div><div class=\"mleague\">'+esc(p.market)+' · cote '+p.cote.toFixed(2)+' · '+p.mise+'€</div></div>'",
       build: function(d, l, esc){ return "+'<div class=\"bet-info\"><div class=\"mname\">'+esc(p.match)+srcTag+'</div><div class=\"mleague\">'+esc(p.market)+' · " + esc(d.tools_page.bet_odds_label) + "'+p.cote.toFixed(2)+' · '+p.mise+'€</div></div>'"; }},
      {find: "if(s.includes('over 2.5'))return 'Plus de 2,5 buts';\n  if(s.includes('under 2.5'))return 'Moins de 2,5 buts';\n  if(s.includes('over 1.5'))return 'Plus de 1,5 but';\n  if(s.includes('btts non')||s.includes('une équipe ne marque'))return 'Une équipe ne marque pas';\n  if(s.includes('btts')||s.includes('les deux équipes'))return 'Les deux équipes marquent';\n  if(s.includes('dc 1x')||s.includes('1x'))return 'DC 1X';\n  if(s.includes('dc x2')||s.includes('x2'))return 'DC X2';",
       build: function(d, l, esc){
        var n = d.market_names, nat = d.market_names_natural;
        return "if(s.includes('over 2.5'))return '" + esc(n.over25) + "';\n  if(s.includes('under 2.5'))return '" + esc(n.under25) + "';\n  if(s.includes('over 1.5'))return '" + esc(n.over15) + "';\n  if(s.includes('btts non')||s.includes('une équipe ne marque'))return '" + esc(nat.btts_non_natural) + "';\n  if(s.includes('btts')||s.includes('les deux équipes'))return '" + esc(nat.btts_oui_natural) + "';\n  if(s.includes('dc 1x')||s.includes('1x'))return '" + esc(n.dc1x) + "';\n  if(s.includes('dc x2')||s.includes('x2'))return '" + esc(n.dc_x2) + "';";
      }}
    ]
  },
  {
    file: "compte.html",
    metas: {
      fr: {title: "IASHARK — Mon Compte", description: "Gère ton compte, ton abonnement Outils et tes préférences IASHARK."},
      en: {title: "IASHARK — My Account", description: "Manage your account, your Tools subscription and your IASHARK preferences."},
      es: {title: "IASHARK — Mi Cuenta", description: "Gestiona tu cuenta, tu suscripción Herramientas y tus preferencias IASHARK."},
      de: {title: "IASHARK — Mein Konto", description: "Verwalte dein Konto, dein Tools-Abonnement und deine IASHARK-Einstellungen."},
      it: {title: "IASHARK — Il Mio Account", description: "Gestisci il tuo account, il tuo abbonamento Strumenti e le tue preferenze IASHARK."},
      pt: {title: "IASHARK — A Minha Conta", description: "Gere a tua conta, a tua subscrição Ferramentas e as tuas preferências IASHARK."}
    },
    replacements: [
      {find: '<div class="onboard-title">Bienvenue sur <span style="color:var(--cyan)">IASHARK</span> 🦈</div>',
       build: function(d, l, esc){ return '<div class="onboard-title">' + d.compte_page.onboarding_title_pre + ' <span style="color:var(--cyan)">IASHARK</span> 🦈</div>'; }},
      {find: "<div class=\"onboard-body\">Ton compte est prêt. Commence par le match du jour en accès gratuit, puis découvre l'espace Outils quand tu veux aller plus loin.</div>",
       build: function(d){ return '<div class="onboard-body">' + d.compte_page.onboarding_body + '</div>'; }},
      {find: '<a href="/" class="onboard-cta primary">VOIR LE MATCH DU JOUR →</a>', build: function(d){ return '<a href="/" class="onboard-cta primary">' + d.compte_page.onboarding_cta_home + '</a>'; }},
      {find: '<a href="/pro.html" class="onboard-cta">DÉCOUVRIR OUTILS →</a>', build: function(d){ return '<a href="/pro.html" class="onboard-cta">' + d.cta.discover_tools + '</a>'; }},
      {find: '<button class="onboard-dismiss" onclick="dismissOnboarding()">Masquer ce message</button>', build: function(d){ return '<button class="onboard-dismiss" onclick="dismissOnboarding()">' + d.compte_page.onboarding_dismiss + '</button>'; }},
      {find: '<span class="hdr-pill" id="hdrPill">MON COMPTE</span>', build: function(d){ return '<span class="hdr-pill" id="hdrPill">' + d.compte_page.hdr_pill_default + '</span>'; }},
      {find: '<div class="loading-lbl">VÉRIFICATION...</div>', build: function(d){ return '<div class="loading-lbl">' + d.compte_page.loading_verification + '</div>'; }},
      {find: '<div class="auth-title">Mon <span>Compte</span></div>', build: function(d, l, esc){
        var parts = d.auth.title.split(" ");
        var last = parts.pop();
        return '<div class="auth-title">' + (parts.join(" ") + " ") + '<span>' + last + '</span></div>';
      }},
      {find: '<div class="auth-sub">Accède à tes sélections Outils, ton tracker et tes statistiques personnalisées.</div>', build: function(d){ return '<div class="auth-sub">' + d.auth.subtitle + '</div>'; }},
      {find: '<button class="auth-tab active" id="tabLoginBtn" onclick="switchAuthTab(\'login\')">CONNEXION</button>', build: function(d){ return '<button class="auth-tab active" id="tabLoginBtn" onclick="switchAuthTab(\'login\')">' + d.auth.tab_login + '</button>'; }},
      {find: '<button class="auth-tab" id="tabSignupBtn" onclick="switchAuthTab(\'signup\')">INSCRIPTION</button>', build: function(d){ return '<button class="auth-tab" id="tabSignupBtn" onclick="switchAuthTab(\'signup\')">' + d.auth.tab_signup + '</button>'; }},
      {find: '<label>EMAIL</label>\n          <input type="email" class="form-input" id="loginEmail" placeholder="ton@email.com" autocomplete="email">',
       build: function(d){ return '<label>' + d.auth.email + '</label>\n          <input type="email" class="form-input" id="loginEmail" placeholder="' + d.compte_page.email_placeholder + '" autocomplete="email">'; }},
      {find: '<label>MOT DE PASSE</label>', build: function(d){ return '<label>' + d.auth.password + '</label>'; }},
      {find: '<button class="btn-primary" id="btnLogin" onclick="doLogin()">SE CONNECTER →</button>', build: function(d){ return '<button class="btn-primary" id="btnLogin" onclick="doLogin()">' + d.auth.login_btn + '</button>'; }},
      {find: '<div class="forgot-link" onclick="forgotPassword()">Mot de passe oublié ?</div>', build: function(d){ return '<div class="forgot-link" onclick="forgotPassword()">' + d.auth.forgot_password + '</div>'; }},
      {find: '<label>EMAIL</label>\n          <input type="email" class="form-input" id="signupEmail" placeholder="ton@email.com" autocomplete="email">',
       build: function(d){ return '<label>' + d.auth.email + '</label>\n          <input type="email" class="form-input" id="signupEmail" placeholder="' + d.compte_page.email_placeholder + '" autocomplete="email">'; }},
      {find: '<label>MOT DE PASSE (min. 8 caractères)</label>\n          <input type="password" class="form-input" id="signupPwd" placeholder="••••••••" autocomplete="new-password">',
       build: function(d){ return '<label>' + d.auth.password + ' (' + d.auth.min_chars + ')</label>\n          <input type="password" class="form-input" id="signupPwd" placeholder="••••••••" autocomplete="new-password">'; }},
      {find: '<label>CONFIRMER LE MOT DE PASSE</label>', build: function(d){ return '<label>' + d.auth.confirm_password + '</label>'; }},
      {find: '<button class="btn-primary" id="btnSignup" onclick="doSignup()">CRÉER MON COMPTE →</button>', build: function(d){ return '<button class="btn-primary" id="btnSignup" onclick="doSignup()">' + d.auth.signup_btn + '</button>'; }},
      {find: '<span class="ubadge free" id="planBadge">GRATUIT</span>', build: function(d){ return '<span class="ubadge free" id="planBadge">' + d.account.plan_free_badge + '</span>'; }},
      {find: "<span class=\"ubadge since\" id=\"sinceBadge\">MEMBRE DEPUIS —</span>", build: function(d){ return '<span class="ubadge since" id="sinceBadge">' + d.account.member_since + ' —</span>'; }},
      {find: '<div class="dash-card-title">MARCHÉS</div>', build: function(d){ return '<div class="dash-card-title">' + d.nav.markets + '</div>'; }},
      {find: '<div class="dash-card-val"><a href="/marches.html" style="color:var(--cyan);">VOIR →</a></div>', build: function(d){ return '<div class="dash-card-val"><a href="/marches.html" style="color:var(--cyan);">' + d.compte_page.dash_view + '</a></div>'; }},
      {find: '<div class="dash-card-title">ESPACE OUTILS</div>', build: function(d){ return '<div class="dash-card-title">' + d.account.dashboard_tools + '</div>'; }},
      {find: '<div class="dash-card-val"><a href="/pro.html" style="color:var(--amber);">ACCÈS →</a></div>', build: function(d){ return '<div class="dash-card-val"><a href="/pro.html" style="color:var(--amber);">' + d.compte_page.dash_access + '</a></div>'; }},
      {find: '<div class="section-title">ABONNEMENT</div>', build: function(d){ return '<div class="section-title">' + d.account.plan_section_title + '</div>'; }},
      {find: '<span class="plan-status free" id="planStatusTxt">Plan Gratuit</span>', build: function(d){ return '<span class="plan-status free" id="planStatusTxt">' + d.account.plan_free_status + '</span>'; }},
      {find: "<div class=\"plan-desc\" id=\"planDescTxt\">Tu utilises la version gratuite d'IASHARK — le match à la plus forte probabilité modèle du jour est accessible gratuitement.</div>",
       build: function(d){ return '<div class="plan-desc" id="planDescTxt">' + d.account.plan_free_desc + '</div>'; }},
      {find: '<div class="pro-feature"><span class="ck">＋</span> Toutes les sélections à forte probabilité modèle</div>', build: function(d){ return '<div class="pro-feature"><span class="ck">＋</span> ' + d.tools_page.pw_feat1_desc.replace("Les pronostics à plus forte", "Toutes les sélections à forte") + '</div>'; }},
      {find: '<div class="pro-feature"><span class="ck">＋</span> Historique complet et détaillé</div>', build: function(d, l, esc){
        var m = {en:"Full, detailed history",es:"Historial completo y detallado",de:"Vollständiger, detaillierter Verlauf",it:"Cronologia completa e dettagliata",pt:"Histórico completo e detalhado",fr:"Historique complet et détaillé"};
        return '<div class="pro-feature"><span class="ck">＋</span> ' + m[l] + '</div>';
      }},
      {find: '<div class="pro-feature"><span class="ck">＋</span> Analyses approfondies par match</div>', build: function(d, l, esc){
        var m = {en:"In-depth analysis per match",es:"Análisis en profundidad por partido",de:"Ausführliche Analysen pro Spiel",it:"Analisi approfondite per partita",pt:"Análises aprofundadas por jogo",fr:"Analyses approfondies par match"};
        return '<div class="pro-feature"><span class="ck">＋</span> ' + m[l] + '</div>';
      }},
      {find: '<a href="/pro.html" class="btn-amber" id="planCta">DÉCOUVRIR OUTILS →</a>', build: function(d){ return '<a href="/pro.html" class="btn-amber" id="planCta">' + d.cta.discover_tools + '</a>'; }},
      {find: '<div class="section-title">SÉCURITÉ</div>', build: function(d){ return '<div class="section-title">' + d.account.security_title + '</div>'; }},
      {find: "<button class=\"sec-form-toggle\" onclick=\"toggleSecPanel('pwd')\">Changer mon mot de passe <span>+</span></button>", build: function(d){ return "<button class=\"sec-form-toggle\" onclick=\"toggleSecPanel('pwd')\">" + d.account.change_password + " <span>+</span></button>"; }},
      {find: '<label>NOUVEAU MOT DE PASSE (min. 8 caractères)</label>', build: function(d){ return '<label>' + d.compte_page.new_password_label + ' (' + d.auth.min_chars + ')</label>'; }},
      {find: '<button class="btn-primary" id="btnChangePwd" onclick="changePassword()">METTRE À JOUR →</button>', build: function(d){ return '<button class="btn-primary" id="btnChangePwd" onclick="changePassword()">' + d.compte_page.update_btn + '</button>'; }},
      {find: "<button class=\"sec-form-toggle\" onclick=\"toggleSecPanel('email')\">Changer mon email <span>+</span></button>", build: function(d){ return "<button class=\"sec-form-toggle\" onclick=\"toggleSecPanel('email')\">" + d.account.change_email + " <span>+</span></button>"; }},
      {find: '<label>NOUVELLE ADRESSE EMAIL</label>\n          <input type="email" class="form-input" id="newEmail" placeholder="nouveau@email.com">',
       build: function(d){ return '<label>' + d.compte_page.new_email_label + '</label>\n          <input type="email" class="form-input" id="newEmail" placeholder="' + d.compte_page.new_email_placeholder + '">'; }},
      {find: '<button class="btn-primary" id="btnChangeEmail" onclick="changeEmail()">METTRE À JOUR →</button>', build: function(d){ return '<button class="btn-primary" id="btnChangeEmail" onclick="changeEmail()">' + d.compte_page.update_btn + '</button>'; }},
      {find: '<div class="section-title">AIDE &amp; SUPPORT</div>', build: function(d){ return '<div class="section-title">' + d.account.help_title + '</div>'; }},
      {find: '<a href="mailto:contact@iashark.com" class="help-row">Nous contacter <span class="arrow">→</span></a>', build: function(d){ return '<a href="mailto:contact@iashark.com" class="help-row">' + d.account.contact_us + ' <span class="arrow">→</span></a>'; }},
      {find: '<a href="/a-propos.html" class="help-row">Notre méthode <span class="arrow">→</span></a>', build: function(d){ return '<a href="/a-propos.html" class="help-row">' + d.account.our_method + ' <span class="arrow">→</span></a>'; }},
      {find: '<div class="section-title">MES DONNÉES</div>', build: function(d){ return '<div class="section-title">' + d.account.data_title + '</div>'; }},
      {find: '<div class="danger-txt">Télécharge une copie de tes données IASHARK (compte + historique de suivi local) au format JSON</div>',
       build: function(d){ return '<div class="danger-txt">' + d.account.export_desc + '</div>'; }},
      {find: '<button class="danger-btn" id="btnExport" onclick="exportMyData()" style="color:var(--cyan);border-color:var(--bc);">EXPORTER</button>',
       build: function(d){ return '<button class="danger-btn" id="btnExport" onclick="exportMyData()" style="color:var(--cyan);border-color:var(--bc);">' + d.account.export_btn + '</button>'; }},
      {find: '<div class="danger-txt">Demander la suppression de mon compte (traité manuellement sous 48h)</div>', build: function(d){ return '<div class="danger-txt">' + d.account.danger_delete_desc + '</div>'; }},
      {find: '<button class="danger-btn" onclick="requestDeletion()">DEMANDER</button>', build: function(d){ return '<button class="danger-btn" onclick="requestDeletion()">' + d.account.danger_delete_btn + '</button>'; }},
      {find: '<button class="btn-logout" onclick="doLogout()">SE DÉCONNECTER</button>', build: function(d){ return '<button class="btn-logout" onclick="doLogout()">' + d.cta.logout + '</button>'; }},
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
      {find: '<div class="nav-lbl">OUTILS</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.tools + '</div>'; }},
      {find: '<div class="nav-lbl">GUIDES</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.guides + '</div>'; }},
      {find: '<div class="nav-lbl">COMPTE</div>', build: function(d){ return '<div class="nav-lbl">' + d.nav.account + '</div>'; }},
      {find: "btn.disabled = true; btn.textContent = 'CONNEXION...';", build: function(d, l, esc){ return "btn.disabled = true; btn.textContent = '" + esc(d.compte_page.msg_connecting) + "';"; }},
      {find: "if(r.status===429){ showMsg(j.message||'Trop de tentatives.','error'); btn.disabled=false; btn.textContent='SE CONNECTER →'; return; }",
       build: function(d, l, esc){ return "if(r.status===429){ showMsg(j.message||'" + esc(d.auth_header.too_many_attempts) + "','error'); btn.disabled=false; btn.textContent='" + esc(d.auth.login_btn) + "'; return; }"; }},
      {find: "if(!r.ok) throw {message: j.msg||j.error_description||j.error||'Erreur de connexion'};", build: function(d, l, esc){ return "if(!r.ok) throw {message: j.msg||j.error_description||j.error||'" + esc(d.auth_header.generic_login_error) + "'};"; }},
      {find: "showMsg('Connexion réussie !','success');", build: function(d, l, esc){ return "showMsg('" + esc(d.compte_page.msg_login_success) + "','success');"; }},
      {find: "var msg = e.message||'Erreur de connexion';\n    if(msg.includes('Invalid login')) msg = 'Email ou mot de passe incorrect.';\n    if(msg.includes('Email not confirmed')) msg = 'Confirme ton email avant de te connecter.';",
       build: function(d, l, esc){
        var ah = d.auth_header;
        return "var msg = e.message||'" + esc(ah.generic_login_error) + "';\n    if(msg.includes('Invalid login')) msg = '" + esc(ah.invalid_login) + "';\n    if(msg.includes('Email not confirmed')) msg = '" + esc(ah.confirm_email) + "';";
      }},
      {find: "btn.disabled = false; btn.textContent = 'SE CONNECTER →';", build: function(d, l, esc){ return "btn.disabled = false; btn.textContent = '" + esc(d.auth.login_btn) + "';"; }},
      {find: "if(!email||!pwd){ showMsg('Remplis tous les champs.','error'); return; }\n  if(pwd.length<8){ showMsg('Le mot de passe doit contenir au moins 8 caractères.','error'); return; }\n  if(pwd!==pwd2){ showMsg('Les mots de passe ne correspondent pas.','error'); return; }",
       build: function(d, l, esc){
        var c = d.compte_page;
        return "if(!email||!pwd){ showMsg('" + esc(c.msg_fill_all_fields) + "','error'); return; }\n  if(pwd.length<8){ showMsg('" + esc(c.msg_password_min) + "','error'); return; }\n  if(pwd!==pwd2){ showMsg('" + esc(c.msg_passwords_mismatch) + "','error'); return; }";
      }},
      {find: "if(!email||!pwd){ showMsg('Remplis tous les champs.','error'); return; }\n  var btn = document.getElementById('btnLogin');",
       build: function(d, l, esc){ return "if(!email||!pwd){ showMsg('" + esc(d.compte_page.msg_fill_all_fields) + "','error'); return; }\n  var btn = document.getElementById('btnLogin');"; }},
      {find: "btn.disabled = true; btn.textContent = 'CRÉATION...';", build: function(d, l, esc){ return "btn.disabled = true; btn.textContent = '" + esc(d.compte_page.msg_creating) + "';"; }},
      {find: "showMsg('Compte créé ! Vérifie ton email pour confirmer ton inscription.','info');", build: function(d, l, esc){ return "showMsg('" + esc(d.compte_page.msg_account_created_check_email) + "','info');"; }},
      {find: "showMsg('Compte créé avec succès !','success');", build: function(d, l, esc){ return "showMsg('" + esc(d.compte_page.msg_account_created_success) + "','success');"; }},
      {find: "var msg = e.message||'Erreur lors de la création';\n    if(msg.includes('already registered')) msg = 'Cet email est déjà utilisé. Connecte-toi.';",
       build: function(d, l, esc){ var c = d.compte_page; return "var msg = e.message||'" + esc(c.msg_creation_error) + "';\n    if(msg.includes('already registered')) msg = '" + esc(c.msg_already_registered) + "';"; }},
      {find: "btn.disabled = false; btn.textContent = 'CRÉER MON COMPTE →';", build: function(d, l, esc){ return "btn.disabled = false; btn.textContent = '" + esc(d.auth.signup_btn) + "';"; }},
      {find: "if(!email){ showMsg('Entre ton email ci-dessus pour réinitialiser ton mot de passe.','info'); return; }", build: function(d, l, esc){ return "if(!email){ showMsg('" + esc(d.compte_page.msg_enter_email_reset) + "','info'); return; }"; }},
      {find: "showMsg('Email de réinitialisation envoyé à '+email,'success');", build: function(d, l, esc){ return "showMsg('" + esc(d.compte_page.msg_reset_sent_prefix) + "'+email,'success');"; }},
      {find: "showMsg('Erreur : '+(e.message||'réessaie'),'error');", count: 1, build: function(d, l, esc){ return "showMsg('" + esc(d.tools_page.capital_msg_error_prefix) + "'+(e.message||'réessaie'),'error');"; }},
      {find: "document.getElementById('hdrPill').textContent = 'MON COMPTE';", build: function(d, l, esc){ return "document.getElementById('hdrPill').textContent = '" + esc(d.compte_page.hdr_pill_default) + "';"; }},
      {find: "msgEl.textContent = 'Le mot de passe doit contenir au moins 8 caractères.';", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.compte_page.msg_password_min) + "';"; }},
      {find: "btn.disabled = true; btn.textContent = 'MISE À JOUR...';", count: 2, build: function(d, l, esc){ return "btn.disabled = true; btn.textContent = '" + esc(d.compte_page.update_btn_loading) + "';"; }},
      {find: "msgEl.textContent = 'Mot de passe mis à jour avec succès.';", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.compte_page.msg_password_updated) + "';"; }},
      {find: "msgEl.textContent = 'Erreur : '+(e.message||'réessaie');", count: 3, build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.tools_page.capital_msg_error_prefix) + "'+(e.message||'réessaie');"; }},
      {find: "btn.disabled = false; btn.textContent = 'METTRE À JOUR →';", count: 2, build: function(d, l, esc){ return "btn.disabled = false; btn.textContent = '" + esc(d.compte_page.update_btn) + "';"; }},
      {find: "msgEl.textContent = 'Entre une adresse email valide.';", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.compte_page.msg_invalid_email) + "';"; }},
      {find: "msgEl.textContent = 'Un email de confirmation a été envoyé à '+email+'. Clique sur le lien pour valider le changement.';",
       build: function(d, l, esc){ var c = d.compte_page; return "msgEl.textContent = '" + esc(c.msg_email_confirmation_sent_prefix) + "'+email+'" + esc(c.msg_email_confirmation_sent_suffix) + "';"; }},
      {find: "btn.disabled = true; btn.textContent = 'EXPORT...';", build: function(d, l, esc){ return "btn.disabled = true; btn.textContent = '" + esc(d.compte_page.export_loading) + "';"; }},
      {find: "note: 'tracked_bets_local provient du suivi de paris stocke localement dans ton navigateur (jamais envoye a IASHARK) - il ne sera present que si tu exportes depuis le meme navigateur/appareil que celui utilise pour le suivi.'",
       build: function(d, l, esc){ return "note: '" + esc(d.compte_page.export_note) + "'"; }},
      {find: "msgEl.textContent = 'Export téléchargé.';", build: function(d, l, esc){ return "msgEl.textContent = '" + esc(d.compte_page.export_success) + "';"; }},
      {find: "btn.disabled = false; btn.textContent = 'EXPORTER';", build: function(d, l, esc){ return "btn.disabled = false; btn.textContent = '" + esc(d.account.export_btn) + "';"; }},
      {find: "var subject = encodeURIComponent('Demande de suppression de compte IASHARK');\n  var body = encodeURIComponent('Bonjour,\\n\\nJe souhaite supprimer mon compte IASHARK associe a l\\'adresse : '+currentUser.email+'\\n\\nMerci de confirmer la suppression.');",
       build: function(d, l, esc){
        var c = d.compte_page;
        return "var subject = encodeURIComponent('" + esc(c.deletion_subject) + "');\n  var body = encodeURIComponent('" + esc(c.deletion_body_greeting) + "'+currentUser.email+'" + esc(c.deletion_body_closing) + "');";
      }},
      {find: "document.getElementById('hdrPill').textContent = 'CONNECTÉ';", build: function(d, l, esc){ return "document.getElementById('hdrPill').textContent = '" + esc(d.compte_page.hdr_pill_connected) + "';"; }},
      {find: "var mois = ['JANV.','FÉVR.','MARS','AVR.','MAI','JUIN','JUIL.','AOÛT','SEPT.','OCT.','NOV.','DÉC.'];\n    document.getElementById('sinceBadge').textContent = 'MEMBRE DEPUIS '+mois[d.getMonth()]+' '+d.getFullYear();",
       build: function(d, l, esc){
        var months = d.compte_page.months.map(function(mo){ return "'" + esc(mo) + "'"; }).join(",");
        return "var mois = [" + months + "];\n    document.getElementById('sinceBadge').textContent = '" + esc(d.account.member_since) + " '+mois[d.getMonth()]+' '+d.getFullYear();";
      }},
      {find: "document.getElementById('planBadge').textContent = role==='admin'?'ADMIN':(isPro?'OUTILS':'GRATUIT');",
       build: function(d, l, esc){ return "document.getElementById('planBadge').textContent = role==='admin'?'" + esc(d.compte_page.role_admin) + "':(isPro?'" + esc(d.nav.tools) + "':'" + esc(d.account.plan_free_badge) + "');"; }},
      {find: "document.getElementById('planStatusTxt').textContent = role==='admin'?'Administrateur':(isPro?'Plan Outils':'Plan Gratuit');",
       build: function(d, l, esc){ var a = d.account, c = d.compte_page; return "document.getElementById('planStatusTxt').textContent = role==='admin'?'" + esc(c.role_admin_full) + "':(isPro?'" + esc(a.plan_pro_status) + "':'" + esc(a.plan_free_status) + "');"; }},
      {find: "document.getElementById('planDescTxt').textContent = 'Ton abonnement Outils est actif — tu as accès à toutes les sélections à forte probabilité modèle.';",
       build: function(d, l, esc){ return "document.getElementById('planDescTxt').textContent = '" + esc(d.account.plan_pro_desc) + "';"; }},
      {find: "cta.textContent = 'VOIR MON ESPACE OUTILS →';", build: function(d, l, esc){ return "cta.textContent = '" + esc(d.cta.view_full_tools) + "';"; }}
    ]
  },
  {
    file: "historique.html",
    // Retiree du produit public le 2026-08-30 (decision utilisateur) : la
    // page reste generee/traduite (donnees Supabase intactes, usage
    // interne possible) mais n'est plus liee depuis aucune navigation
    // publique ni promue dans les sitemaps - voir noSitemap ci-dessous et
    // IASHARK_V2_RECETTE_VISUELLE.md.
    noSitemap: true,
    metas: {
      fr: {title: "IASHARK — Historique & Performance", description: "Historique des pronostics IASHARK. Winrate, ROI et résultats détaillés de toutes nos prédictions football IA."},
      en: {title: "IASHARK — History & Performance", description: "History of IASHARK predictions. Winrate, ROI and detailed results of all our AI football predictions."},
      es: {title: "IASHARK — Historial y Rendimiento", description: "Historial de los pronósticos IASHARK. Winrate, ROI y resultados detallados de todas nuestras predicciones de fútbol con IA."},
      de: {title: "IASHARK — Historie & Performance", description: "Verlauf der IASHARK-Vorhersagen. Trefferquote, ROI und detaillierte Ergebnisse aller unserer KI-Fußballvorhersagen."},
      it: {title: "IASHARK — Storico e Performance", description: "Storico dei pronostici IASHARK. Winrate, ROI e risultati dettagliati di tutti i nostri pronostici calcio IA."},
      pt: {title: "IASHARK — Histórico e Desempenho", description: "Histórico das previsões IASHARK. Winrate, ROI e resultados detalhados de todas as nossas previsões de futebol com IA."}
    },
    replacements: [
      {find: '<span class="hdr-badge" id="totalBadge">— PARIS</span>', build: function(d){ return '<span class="hdr-badge" id="totalBadge">— ' + d.history_page.default_badge_suffix + '</span>'; }},
      {find: '<span id="authHeaderSlot"><a href="/compte.html" class="btn-login">CONNEXION</a></span>', build: function(d){ return '<span id="authHeaderSlot"><a href="/compte.html" class="btn-login">' + d.cta.login + '</a></span>'; }},
      {find: '<h1 class="hero-title"><span>HISTO</span>RIQUE</h1>', build: function(d, l){
        if (l === "fr") return '<h1 class="hero-title"><span>HISTO</span>RIQUE</h1>';
        return '<h1 class="hero-title"><span>' + d.history_page.title_span + '</span>' + d.history_page.title_rest + '</h1>';
      }},
      {find: "<button class=\"sp-btn active\" id=\"spAll\" onclick=\"setStatSport('all')\">🌐 TOUS</button>", build: function(d){ return "<button class=\"sp-btn active\" id=\"spAll\" onclick=\"setStatSport('all')\">🌐 " + d.history_page.toggle_all + "</button>"; }},
      {find: "<button class=\"sp-btn\" id=\"spFootball\" onclick=\"setStatSport('football')\">⚽ FOOTBALL</button>", build: function(d){ return "<button class=\"sp-btn\" id=\"spFootball\" onclick=\"setStatSport('football')\">⚽ " + d.history_page.toggle_football + "</button>"; }},
      {find: "<button class=\"sp-btn pro-btn\" id=\"spPro\" onclick=\"setStatSport('pro')\">OUTILS</button>", build: function(d){ return "<button class=\"sp-btn pro-btn\" id=\"spPro\" onclick=\"setStatSport('pro')\">" + d.history_page.toggle_tools + "</button>"; }},
      {find: '<div class="sm-lbl">WINRATE</div>', build: function(d){ return '<div class="sm-lbl">' + d.history_page.lbl_winrate + '</div>'; }},
      {find: '<div class="sm-lbl">ROI</div>', build: function(d){ return '<div class="sm-lbl">' + d.history_page.lbl_roi + '</div>'; }},
      {find: '<div class="sm-lbl">FORME RÉCENTE</div>', build: function(d){ return '<div class="sm-lbl">' + d.history_page.lbl_recent_form + '</div>'; }},
      {find: '<span><b class="green" id="statWins">—</b> V</span>', build: function(d){ return '<span><b class="green" id="statWins">—</b> ' + d.history_page.letter_win + '</span>'; }},
      {find: '<span><b class="red" id="statLosses">—</b> D</span>', build: function(d){ return '<span><b class="red" id="statLosses">—</b> ' + d.history_page.letter_loss + '</span>'; }},
      {find: '<span style="color:var(--muted);margin-left:auto;" id="statTotal">— paris au total</span>', build: function(d){ return '<span style="color:var(--muted);margin-left:auto;" id="statTotal">—' + d.history_page.total_bets_suffix + '</span>'; }},
      {find: "<button class=\"tab active\" onclick=\"setTab('paris',this)\">PARIS</button>", build: function(d){ return "<button class=\"tab active\" onclick=\"setTab('paris',this)\">" + d.history_page.tab_bets + "</button>"; }},
      {find: "<button class=\"tab\" onclick=\"setTab('backtesting',this)\">BACKTESTING</button>", build: function(d){ return "<button class=\"tab\" onclick=\"setTab('backtesting',this)\">" + d.history_page.tab_backtesting + "</button>"; }},
      {find: 'placeholder="Rechercher une équipe, un championnat..."', build: function(d){ return 'placeholder="' + d.history_page.search_placeholder + '"'; }},
      {find: '<select class="fsel" id="mktSel" onchange="renderPredictions()"><option value="">TOUS LES MARCHÉS</option></select>', build: function(d){ return '<select class="fsel" id="mktSel" onchange="renderPredictions()"><option value="">' + d.history_page.filter_all_markets + '</option></select>'; }},
      {find: '<select class="fsel" id="leagueSel" onchange="renderPredictions()"><option value="">TOUS CHAMPIONNATS</option></select>', build: function(d){ return '<select class="fsel" id="leagueSel" onchange="renderPredictions()"><option value="">' + d.history_page.filter_all_leagues + '</option></select>'; }},
      {find: "<button class=\"filter-btn active\" onclick=\"setFilter('all',this)\">TOUS</button>", build: function(d){ return "<button class=\"filter-btn active\" onclick=\"setFilter('all',this)\">" + d.history_page.filter_all + "</button>"; }},
      {find: '<div class="empty"><h3>CHARGEMENT...</h3></div>', count: 2, build: function(d){ return '<div class="empty"><h3>' + d.common.loading + '</h3></div>'; }},
      {find: "<button class=\"tab\" id=\"btnLoadArchive\" onclick=\"loadFullArchive()\" style=\"cursor:pointer;\">CHARGER L'HISTORIQUE COMPLET (AU-DELÀ DES 500 DERNIERS)</button>",
       build: function(d){ return "<button class=\"tab\" id=\"btnLoadArchive\" onclick=\"loadFullArchive()\" style=\"cursor:pointer;\">" + d.history_page.archive_btn + "</button>"; }},
      {find: '<div class="bt-sort-note">Trié par nombre de paris — les marchés testés sur peu de paris sont estompés et marqués, pour éviter de sur-interpréter un petit échantillon.</div>',
       build: function(d){ return '<div class="bt-sort-note">' + d.history_page.bt_sort_note + '</div>'; }},
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
      {find: "var MARKET_LABELS={'over25':'Plus de 2,5 buts','over15':'Plus de 1,5 but','under25':'Moins de 2,5 buts','btts_non':'Une équipe ne marque pas','btts_oui':'Les deux équipes marquent','dc1x':'DC 1X','dc_x1':'DC 1X','dc_x2':'DC X2','victoire_dom':'Victoire domicile','victoire_ext':'Victoire extérieur','handicap_dom':'Handicap -0.5 dom','handicap_ext':'Handicap +0.5 ext','match_winner':'Vainqueur','autre':'Autre'};",
       build: function(d, l, esc){
        var n = d.market_names, nat = d.market_names_natural;
        return "var MARKET_LABELS={'over25':'" + esc(n.over25) + "','over15':'" + esc(n.over15) + "','under25':'" + esc(n.under25) + "','btts_non':'" + esc(nat.btts_non_natural) + "','btts_oui':'" + esc(nat.btts_oui_natural) + "','dc1x':'" + esc(n.dc1x) + "','dc_x1':'" + esc(n.dc1x) + "','dc_x2':'" + esc(n.dc_x2) + "','victoire_dom':'" + esc(n.victoire_dom) + "','victoire_ext':'" + esc(n.victoire_ext) + "','handicap_dom':'" + esc(n.handicap_dom) + "','handicap_ext':'" + esc(n.handicap_ext) + "','match_winner':'" + esc(n.match_winner) + "','autre':'" + esc(n.autre) + "'};";
      }},
      {find: "document.getElementById('statTotal').textContent=(s.total||0)+' paris au total';", build: function(d, l, esc){ return "document.getElementById('statTotal').textContent=(s.total||0)+'" + esc(d.history_page.total_bets_suffix) + "';"; }},
      {find: "document.getElementById('statTrendLbl').textContent=resolved.length?resolved.length+' DERNIERS PARIS':'AUCUN PARI RÉCENT';",
       build: function(d, l, esc){ return "document.getElementById('statTrendLbl').textContent=resolved.length?resolved.length+'" + esc(d.history_page.trend_last_bets_suffix) + "':'" + esc(d.history_page.trend_none) + "';"; }},
      {find: "mktSel.innerHTML='<option value=\"\">TOUS LES MARCHÉS</option>'+Object.keys(markets).sort().map(function(k){", build: function(d, l, esc){ return "mktSel.innerHTML='<option value=\"\">" + esc(d.history_page.filter_all_markets) + "</option>'+Object.keys(markets).sort().map(function(k){"; }},
      {find: "leagueSel.innerHTML='<option value=\"\">TOUS CHAMPIONNATS</option>'+Object.keys(leagues).sort().map(function(l){", build: function(d, l2, esc){ return "leagueSel.innerHTML='<option value=\"\">" + esc(d.history_page.filter_all_leagues) + "</option>'+Object.keys(leagues).sort().map(function(l){"; }},
      {find: "document.getElementById('countLbl').textContent=list.length+' pari'+(list.length>1?'s':'');",
       build: function(d, l, esc){ var h = d.history_page; return "document.getElementById('countLbl').textContent=list.length+' '+(list.length>1?'" + esc(h.bet_many) + "':'" + esc(h.bet_one) + "');"; }},
      {find: "document.getElementById('totalBadge').textContent=resolvedTotal+' PARIS';", build: function(d, l, esc){ return "document.getElementById('totalBadge').textContent=resolvedTotal+' " + esc(d.history_page.default_badge_suffix) + "';"; }},
      {find: "if(!list.length){document.getElementById('predList').innerHTML='<div class=\"empty\"><div class=\"empty-icon\"><svg viewBox=\"0 0 24 24\"><circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M21 21l-4.35-4.35\"/></svg></div><h3>AUCUN PARIS</h3><p>Aucun résultat pour cette combinaison de filtres.</p></div>';return;}",
       build: function(d, l, esc){ var h = d.history_page; return "if(!list.length){document.getElementById('predList').innerHTML='<div class=\"empty\"><div class=\"empty-icon\"><svg viewBox=\"0 0 24 24\"><circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"M21 21l-4.35-4.35\"/></svg></div><h3>" + esc(h.empty_no_bets_title) + "</h3><p>" + esc(h.empty_no_bets_sub) + "</p></div>';return;}"; }},
      {find: "+'<span class=\"tag-date\">'+(p.date||p.resolved_date||'')+(p.resolved_date&&p.date&&p.resolved_date!==p.date?' · résolu '+p.resolved_date:'')+'</span>'",
       build: function(d, l, esc){ return "+'<span class=\"tag-date\">'+(p.date||p.resolved_date||'')+(p.resolved_date&&p.date&&p.resolved_date!==p.date?'" + esc(d.history_page.resolved_prefix) + "'+p.resolved_date:'')+'</span>'"; }},
      {find: "+'<div class=\"pred-result '+p.result+'\">'+(p.result==='win'?'WIN':p.result==='void'?'ANNULÉ':'LOSS')+'</div>'",
       build: function(d, l, esc){ return "+'<div class=\"pred-result '+p.result+'\">'+(p.result==='win'?'WIN':p.result==='void'?'" + esc(d.history_page.result_void) + "':'LOSS')+'</div>'"; }},
      {find: "var proTag=isPro(p)?'<span class=\"pred-tag tag-pro\">OUTILS</span>':'';",
       build: function(d, l, esc){ return "var proTag=isPro(p)?'<span class=\"pred-tag tag-pro\">" + esc(d.nav.tools) + "</span>':'';"; }},
      {find: "if(!bt||!bt.by_market||!bt.by_market.length){document.getElementById('btContent').innerHTML='<div class=\"empty\"><h3>PAS ENCORE DE DONNÉES</h3><p>Les stats apparaîtront après les premiers paris résolus.</p></div>';return;}",
       build: function(d, l, esc){ var h = d.history_page; return "if(!bt||!bt.by_market||!bt.by_market.length){document.getElementById('btContent').innerHTML='<div class=\"empty\"><h3>" + esc(h.empty_no_data_title) + "</h3><p>" + esc(h.empty_no_data_sub) + "</p></div>';return;}"; }},
      {find: "+(lowSample?'<div style=\"grid-column:1/-1;margin-top:2px\"><span class=\"low-badge\">ÉCHANTILLON FAIBLE</span></div>':'')",
       build: function(d, l, esc){ return "+(lowSample?'<div style=\"grid-column:1/-1;margin-top:2px\"><span class=\"low-badge\">" + esc(d.history_page.low_sample_badge) + "</span></div>':'')"; }},
      {find: "+section('PAR MARCHÉ',bt.by_market,true)\n    +section('PAR LIGUE',bt.by_league,false)\n    +section('PAR PROBABILITÉ',bt.by_conf,false);",
       build: function(d, l, esc){ var h = d.history_page; return "+section('" + esc(h.section_by_market) + "',bt.by_market,true)\n    +section('" + esc(h.section_by_league) + "',bt.by_league,false)\n    +section('" + esc(h.section_by_prob) + "',bt.by_conf,false);"; }},
      {find: "}catch(e){document.getElementById('predList').innerHTML='<div class=\"empty\"><h3>ERREUR</h3><p>Impossible de charger l\\'historique.</p></div>';}",
       build: function(d, l, esc){ var h = d.history_page; return "}catch(e){document.getElementById('predList').innerHTML='<div class=\"empty\"><h3>" + esc(h.empty_error_title) + "</h3><p>" + esc(h.empty_error_sub) + "</p></div>';}"; }},
      {find: "btn.disabled=true; btn.textContent='CHARGEMENT...';", build: function(d, l, esc){ return "btn.disabled=true; btn.textContent='" + esc(d.history_page.archive_loading) + "';"; }},
      {find: "status.textContent = added>0\n      ? (added+' prédiction(s) supplémentaire(s) chargée(s) depuis l\\'archive complète ('+totalFetched+' au total dans l\\'archive Supabase).')\n      : 'Aucune prédiction supplémentaire au-delà de ce qui est déjà affiché.';",
       build: function(d, l, esc){
        var h = d.history_page;
        return "status.textContent = added>0\n      ? (added+'" + esc(h.archive_added_mid) + "'+totalFetched+'" + esc(h.archive_added_suffix) + "')\n      : '" + esc(h.archive_none_more) + "';";
      }},
      {find: "status.textContent='Erreur de chargement de l\\'archive complète — réessaie plus tard.';\n    btn.disabled=false; btn.textContent=\"CHARGER L'HISTORIQUE COMPLET (AU-DELÀ DES 500 DERNIERS)\";",
       build: function(d, l, esc){ var h = d.history_page; return "status.textContent='" + esc(h.archive_error) + "';\n    btn.disabled=false; btn.textContent=\"" + esc(h.archive_btn).replace(/"/g, '\\"') + "\";"; }}
    ]
  },
  {
    /* landing.html : page marketing autonome, pas de <script> du tout (pur
       HTML/CSS) - aucune de ces regles n'a besoin de esc() JS, tout est du
       texte HTML brut. Utilise des URLs absolues (https://iashark.com/...)
       plutot que racine-relatives - voir rewriteInternalLinks() dans
       build-locales.js, etendu pour gerer aussi ce format. */
    file: "landing.html",
    metas: {
      fr: {title: "IASHARK — Le modèle qui lit le match avant qu'il commence", description: "Poisson, Dixon-Coles, Monte Carlo, Elo : IASHARK analyse chaque match avec des vrais modèles statistiques. Un match gratuit chaque jour."},
      en: {title: "IASHARK — The model that reads the match before kickoff", description: "Poisson, Dixon-Coles, Monte Carlo, Elo: IASHARK analyzes every match with real statistical models. One free match every day."},
      es: {title: "IASHARK — El modelo que lee el partido antes de que empiece", description: "Poisson, Dixon-Coles, Monte Carlo, Elo: IASHARK analiza cada partido con modelos estadísticos reales. Un partido gratis cada día."},
      de: {title: "IASHARK — Das Modell, das das Spiel vor dem Anpfiff liest", description: "Poisson, Dixon-Coles, Monte Carlo, Elo: IASHARK analysiert jedes Spiel mit echten statistischen Modellen. Ein kostenloses Spiel jeden Tag."},
      it: {title: "IASHARK — Il modello che legge la partita prima del fischio d'inizio", description: "Poisson, Dixon-Coles, Monte Carlo, Elo: IASHARK analizza ogni partita con veri modelli statistici. Una partita gratuita ogni giorno."},
      pt: {title: "IASHARK — O modelo que lê o jogo antes do apito inicial", description: "Poisson, Dixon-Coles, Monte Carlo, Elo: o IASHARK analisa cada jogo com modelos estatísticos reais. Um jogo gratuito todos os dias."}
    },
    replacements: [
      {find: '<a href="https://iashark.com" class="btn-nav">VOIR LE SITE →</a>', build: function(d){ return '<a href="https://iashark.com" class="btn-nav">' + d.landing_page.nav_cta + '</a>'; }},
      {find: '<span class="dot"></span> MODÈLE STATISTIQUE · FOOTBALL', build: function(d){ return '<span class="dot"></span> ' + d.landing_page.eyebrow; }},
      {find: '<h1 class="reveal" style="animation-delay:.1s">Aucune émotion.<br><b>Que des probabilités.</b></h1>', build: function(d){ var h = d.home_page; return '<h1 class="reveal" style="animation-delay:.1s">' + h.hero_line1 + '<br><b>' + h.hero_line2 + '</b></h1>'; }},
      {find: "<p class=\"sub reveal\" style=\"animation-delay:.15s\">IASHARK croise <b>xG, forme récente, fatigue de calendrier et face-à-face</b> pour produire un signal de probabilité sur chaque match, avant le coup d'envoi.</p>",
       build: function(d){ return '<p class="sub reveal" style="animation-delay:.15s">' + d.landing_page.hero_sub + '</p>'; }},
      {find: '<a href="https://iashark.com" class="btn-primary">VOIR LE MATCH GRATUIT DU JOUR</a>', build: function(d){ return '<a href="https://iashark.com" class="btn-primary">' + d.landing_page.hero_cta + '</a>'; }},
      {find: '<div class="cta-note">Sans carte bancaire · <b>1 analyse offerte chaque jour</b></div>', build: function(d){ var l = d.landing_page; return '<div class="cta-note">' + l.hero_cta_note_pre + '<b>' + l.hero_cta_note_b + '</b></div>'; }},
      {find:
        '      <span>MODÈLE <b>POISSON</b></span><span><b>DIXON-COLES</b> AJUSTEMENT BAS SCORES</span><span>SIMULATION <b>MONTE CARLO</b></span><span>CLASSEMENT <b>ELO</b> DYNAMIQUE</span><span>PROBABILITÉS <b>SHIN</b></span><span>KELLY <b>FRACTIONNÉ</b></span>\n' +
        '      <span>MODÈLE <b>POISSON</b></span><span><b>DIXON-COLES</b> AJUSTEMENT BAS SCORES</span><span>SIMULATION <b>MONTE CARLO</b></span><span>CLASSEMENT <b>ELO</b> DYNAMIQUE</span><span>PROBABILITÉS <b>SHIN</b></span><span>KELLY <b>FRACTIONNÉ</b></span>',
       build: function(d){
        var l = d.landing_page;
        var once = '<span>' + l.strip_poisson + '<b>' + l.strip_poisson_b + '</b></span>' +
          '<span><b>' + l.strip_dc_b + '</b>' + l.strip_dc_rest + '</span>' +
          '<span>' + l.strip_mc + '<b>' + l.strip_mc_b + '</b></span>' +
          '<span>' + l.strip_elo + '<b>' + l.strip_elo_b + '</b>' + l.strip_elo_rest + '</span>' +
          '<span>' + l.strip_shin + '<b>' + l.strip_shin_b + '</b></span>' +
          '<span>' + l.strip_kelly + '<b>' + l.strip_kelly_b + '</b></span>';
        return '      ' + once + '\n      ' + once;
      }},
      {find: '<div class="sec-lbl">LA MÉTHODE</div>', build: function(d){ return '<div class="sec-lbl">' + d.landing_page.lbl_method + '</div>'; }},
      {find: '<h2 class="sec-title">Quatre modèles, <b>un seul signal</b> par match.</h2>', build: function(d){ var l = d.landing_page; return '<h2 class="sec-title">' + l.title_method_pre + '<b>' + l.title_method_b + '</b>' + l.title_method_post + '</h2>'; }},
      {find: "<div class=\"model-card\"><div class=\"model-tag\">MODÈLE 1</div><div class=\"model-name\">Poisson</div><div class=\"model-desc\">Distribution du nombre de buts attendus pour chaque équipe, à domicile et à l'extérieur.</div></div>",
       build: function(d){ var l = d.landing_page; return '<div class="model-card"><div class="model-tag">' + l.model1_tag + '</div><div class="model-name">' + l.model1_name + '</div><div class="model-desc">' + l.model1_desc + '</div></div>'; }},
      {find: '<div class="model-card"><div class="model-tag">MODÈLE 2</div><div class="model-name">Dixon-Coles</div><div class="model-desc">Correction des scores faibles (0-0, 1-0, 1-1) que le Poisson pur sous-estime.</div></div>',
       build: function(d){ var l = d.landing_page; return '<div class="model-card"><div class="model-tag">' + l.model2_tag + '</div><div class="model-name">' + l.model2_name + '</div><div class="model-desc">' + l.model2_desc + '</div></div>'; }},
      {find: '<div class="model-card"><div class="model-tag">MODÈLE 3</div><div class="model-name">Monte Carlo</div><div class="model-desc">Des milliers de simulations du match pour obtenir une distribution de résultats robuste.</div></div>',
       build: function(d){ var l = d.landing_page; return '<div class="model-card"><div class="model-tag">' + l.model3_tag + '</div><div class="model-name">' + l.model3_name + '</div><div class="model-desc">' + l.model3_desc + '</div></div>'; }},
      {find: '<div class="model-card"><div class="model-tag">MODÈLE 4</div><div class="model-name">Elo & Shin</div><div class="model-desc">Force réelle des équipes dans le temps, et correction du biais des probabilités implicites.</div></div>',
       build: function(d){ var l = d.landing_page; return '<div class="model-card"><div class="model-tag">' + l.model4_tag + '</div><div class="model-name">' + l.model4_name + '</div><div class="model-desc">' + l.model4_desc + '</div></div>'; }},
      {find: '<div class="sec-lbl">EN PRATIQUE</div>', build: function(d){ return '<div class="sec-lbl">' + d.landing_page.lbl_practice + '</div>'; }},
      {find: '<h2 class="sec-title">De la donnée brute au <b>signal exploitable.</b></h2>', build: function(d){ var l = d.landing_page; return '<h2 class="sec-title">' + l.title_practice_pre + '<b>' + l.title_practice_b + '</b></h2>'; }},
      {find: '<div class="step-title">On ingère la donnée</div><div class="step-desc">Calendriers, compositions probables, historique des confrontations et statistiques xG remontés en continu, championnat par championnat.</div>',
       build: function(d){ var l = d.landing_page; return '<div class="step-title">' + l.step1_title + '</div><div class="step-desc">' + l.step1_desc + '</div>'; }},
      {find: '<div class="step-title">Le modèle calcule</div><div class="step-desc">Poisson, Dixon-Coles et Monte Carlo tournent en parallèle pour produire une distribution de probabilités sur chaque marché.</div>',
       build: function(d){ var l = d.landing_page; return '<div class="step-title">' + l.step2_title + '</div><div class="step-desc">' + l.step2_desc + '</div>'; }},
      {find: '<div class="step-title">Tu reçois le signal</div><div class="step-desc">Une fiche claire par match : probabilité, niveau de fiabilité, et le marché où le modèle détecte un écart avec le marché réel.</div>',
       build: function(d){ var l = d.landing_page; return '<div class="step-title">' + l.step3_title + '</div><div class="step-desc">' + l.step3_desc + '</div>'; }},
      {find: '<div class="sec-lbl">L\'ACCÈS</div>', build: function(d){ return '<div class="sec-lbl">' + d.landing_page.lbl_access + '</div>'; }},
      {find: '<h2 class="sec-title">Commence gratuitement. <b>Passe à Pro</b> quand tu veux tout voir.</h2>', build: function(d){ var l = d.landing_page; return '<h2 class="sec-title">' + l.title_access_pre + '<b>' + l.title_access_b + '</b>' + l.title_access_post + '</h2>'; }},
      {find: '<div class="plan-name">GRATUIT</div>', build: function(d){ return '<div class="plan-name">' + d.landing_page.plan_free_name + '</div>'; }},
      {find: '<div class="plan-price">0€</div>', build: function(d){ return '<div class="plan-price">' + d.landing_page.plan_free_price + '</div>'; }},
      {find: '<li>1 analyse complète offerte chaque jour</li>', build: function(d){ return '<li>' + d.landing_page.plan_free_feat1 + '</li>'; }},
      {find: "<li>Accès à l'historique de performance</li>", build: function(d){ return '<li>' + d.landing_page.plan_free_feat2 + '</li>'; }},
      {find: '<li>Notre méthode expliquée en détail</li>', build: function(d){ return '<li>' + d.landing_page.plan_free_feat3 + '</li>'; }},
      {find: '<a href="https://iashark.com" class="plan-cta free">COMMENCER</a>', build: function(d){ return '<a href="https://iashark.com" class="plan-cta free">' + d.landing_page.plan_free_cta + '</a>'; }},
      {find: "content:'RECOMMANDÉ';", build: function(d){ return "content:'" + d.landing_page.plan_pro_badge + "';"; }},
      {find: '<div class="plan-name">PRO</div>', build: function(d){ return '<div class="plan-name">' + d.landing_page.plan_pro_name + '</div>'; }},
      {find: '<div class="plan-price">Gratuit<span>les 3 premiers jours</span></div>', build: function(d){ var l = d.landing_page; return '<div class="plan-price">' + l.plan_pro_price_pre + '<span>' + l.plan_pro_price_span + '</span></div>'; }},
      {find: '<div class="plan-trial">Puis 19,95€/mois — résiliable à tout moment</div>', build: function(d){ return '<div class="plan-trial">' + d.landing_page.plan_pro_trial + '</div>'; }},
      {find: '<li>Toutes les analyses, tous les championnats</li>', build: function(d){ return '<li>' + d.landing_page.plan_pro_feat1 + '</li>'; }},
      {find: '<li>Filtres avancés et niveau de fiabilité détaillé</li>', build: function(d){ return '<li>' + d.landing_page.plan_pro_feat2 + '</li>'; }},
      {find: '<li>Suivi personnel de tes matchs suivis</li>', build: function(d){ return '<li>' + d.landing_page.plan_pro_feat3 + '</li>'; }},
      {find: '<li>Résiliable à tout moment</li>', build: function(d){ return '<li>' + d.landing_page.plan_pro_feat4 + '</li>'; }},
      {find: '<a href="https://iashark.com/pro.html" class="plan-cta pro">DÉBLOQUER PRO</a>', build: function(d){ return '<a href="https://iashark.com/pro.html" class="plan-cta pro">' + d.landing_page.plan_pro_cta + '</a>'; }},
      {find: '<h2>Le prochain match a déjà <b>un signal.</b></h2>', build: function(d){ var l = d.landing_page; return '<h2>' + l.final_title_pre + '<b>' + l.final_title_b + '</b></h2>'; }},
      {find: "<p>Va le voir, c'est gratuit.</p>", build: function(d){ return '<p>' + d.landing_page.final_sub + '</p>'; }},
      {find: '<a href="https://iashark.com" class="btn-primary">VOIR LE MATCH DU JOUR</a>', build: function(d){ return '<a href="https://iashark.com" class="btn-primary">' + d.landing_page.final_cta + '</a>'; }},
      {find: '<div>⚠️ INFORMATION À VISÉE STATISTIQUE — NE CONSTITUE PAS UN CONSEIL DE PARI · INTERDIT AUX MOINS DE 18 ANS</div>', build: function(d){ return '<div>⚠️ ' + d.landing_page.foot_disclaimer + '</div>'; }},
      {find: '<div>Aide : <a href="https://www.joueurs-info-service.fr">joueurs-info-service.fr</a> · 09 74 75 13 13</div>',
       build: function(d){ return '<div>' + d.landing_page.foot_help_label + ' <a href="https://www.joueurs-info-service.fr">' + d.footer.disclaimer_help_site + '</a> · ' + d.footer.disclaimer_help_phone + '</div>'; }},
      {find: '<a href="https://iashark.com/mentions-legales.html">Mentions légales</a>', build: function(d){ return '<a href="https://iashark.com/mentions-legales.html">' + d.footer.mentions_legales + '</a>'; }},
      {find: '<a href="https://iashark.com/cgv.html">CGV</a>', build: function(d){ return '<a href="https://iashark.com/cgv.html">' + d.footer.cgv + '</a>'; }},
      {find: '<a href="https://iashark.com/confidentialite.html">Confidentialité</a>', build: function(d){ return '<a href="https://iashark.com/confidentialite.html">' + d.footer.confidentialite + '</a>'; }}
    ]
  }
];

module.exports = PAGES;
