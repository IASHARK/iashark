/* =========================================================================
   IASHARK ESPACE PRO (ancienne page « Outils », renommee le 29/09/2026)
   Trois onglets : tableau de bord (pro-dashboard.js), mon combine et
   detecteur d'ecarts. Plus aucun calcul de mise, aucun capital ni aucune
   « esperance » (decision de Clement du 30/09/2026 : IASHARK ne conseille
   pas de mise). Calcul de mise, cote juste, simulateur du capital et
   journal sont retires ; leurs anciennes ancres menent au
   tableau de bord.

   SECURITE — regle centrale de ce fichier.
   Cette page ne lit JAMAIS /data.json. Les donnees de match arrivent
   uniquement par la fonction Edge `match-data`, qui applique l'autorisation
   cote serveur (elle verifie le plan de l'utilisateur avant de repondre).
   Un visiteur gratuit ne declenche aucun appel de donnees de match : il voit
   un jeu de DEMONSTRATION explicitement fictif. Il n'y a donc aucun vrai
   match floute dans le DOM, et rien a recuperer en inspectant la page.
   ========================================================================= */
(function () {
  'use strict';

  var D = window.IasharkToolsDomain;
  var ctx = { user: null, isPro: false, isAdmin: false };
  var etat = { outil: 'tableau', matchs: null, perso: { ligues: [], marches: [] } };

  function $(sel, racine) { return (racine || document).querySelector(sel); }
  function $$(sel, racine) { return Array.prototype.slice.call((racine || document).querySelectorAll(sel)); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Repli local : si I18N n'est pas charge (ou pas encore pret), on renvoie
  // toujours le libelle francais d'origine, jamais une erreur. Meme motif
  // que account-page.js / player-page.js.
  function t(key, fallback) { return (window.I18N && window.I18N.t) ? window.I18N.t(key, fallback) : fallback; }
  function localeTag() { return (window.I18N && window.I18N.localeTag) ? window.I18N.localeTag() : 'fr-FR'; }
  function num(v, d) { return Number(v).toLocaleString(localeTag(), { minimumFractionDigits: d, maximumFractionDigits: d }); }
  // Lien interne dans le repertoire de langue/marche courant (/gb/, /mx/...).
  function lien(p) { return (window.I18N && window.I18N.href) ? window.I18N.href(p) : '/' + p; }
  function estFr() { return !(window.I18N && window.I18N.locale) || window.I18N.locale === 'fr'; }
  function signe(v, d) { return (v >= 0 ? '+' : '') + num(v, d == null ? 1 : d); }
  function points() { return t('tools_page.unit_points', 'pts'); }

  /* ---------------------------------------------------------------------
     PERSONNALISATION (02/10/2026) : ses competitions (etoiles du compte,
     user_metadata.fav_leagues, lib/fav-leagues.js) et ses types de paris
     (pro_preferences.marches, 0044) passent EN PREMIER et portent « Ton
     choix ». Rien d'autre ne change : memes paris, memes chiffres, meme
     ordre a l'interieur de chaque groupe. Jamais un calcul.
     --------------------------------------------------------------------- */
  // 03/10/2026 (decision de Clement) : plus de « ★ Ton choix » ni de tri par competitions ou types de
  // paris : les paris sont les MEMES pour tous, dans le meme ordre. Les competitions preferees ne servent
  // qu'a l'information (matchs du jour et resultats dans les messages Pro).
  function estChoisi() { return false; }
  function choisisDabord(rows) {
    var a = [], b = [];
    (rows || []).forEach(function (r) { (estChoisi(r) ? a : b).push(r); });
    return a.concat(b);
  }
  function badgeChoix(r) {
    return estChoisi(r) ? '<span class="ml-1.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-cyan/10 px-2 py-0.5 align-middle text-[10.5px] font-bold text-cyan">★ ' + esc(t('pro_perso.badge', 'Ton choix')) + '</span>' : '';
  }

  /* ---------------------------------------------------------------------
     DONNEES DE DEMONSTRATION
     Volontairement fictives et reconnaissables comme telles (Club A/B...).
     Elles ne doivent jamais pouvoir etre confondues avec une vraie analyse.
     --------------------------------------------------------------------- */
  var DEMO_SCAN = [
    // marketId : meme marche en identifiant moteur, source du libelle affiche
    // dans la langue de la page (y compris en francais). Le texte `market` est
    // le repli si lib/market-labels.js n'est pas charge.
    { edge: 6.4, match: 'Club A – Club B', market: '1re mi-temps : moins de 1,5 but', marketId: 'fh-under-15', league: 'Championnat 1', modelProbability: 64.2, marketProbability: 57.8, fairOdds: 1.56, risk: 'Faible' },
    { edge: 4.1, match: 'Club C – Club D', market: 'Les deux équipes marquent : Oui', marketId: 'btts-yes', league: 'Championnat 2', modelProbability: 61.0, marketProbability: 56.9, fairOdds: 1.64, risk: 'Modéré' },
    { edge: 3.2, match: 'Club E – Club F', market: 'Plus de 2,5 buts', marketId: 'over-25', league: 'Championnat 1', modelProbability: 55.4, marketProbability: 52.2, fairOdds: 1.81, risk: 'Modéré' }
  ];
  // Chance retenue = le plus petit des deux chiffres, modele ou cote sans marge,
  // comme pour un abonne (lib/tools-domain.js#comboSelections).
  var DEMO_COMBO = [
    { id: 'd1', matchKey: 'd1', match: 'Club A – Club B', market: '1re mi-temps : moins de 1,5 but', marketId: 'fh-under-15', probability: 55.9, modelProbability: 58.2, fairProbability: 55.9, odds: 1.73 },
    { id: 'd2', matchKey: 'd2', match: 'Club C – Club D', market: 'Les deux équipes marquent : Oui', marketId: 'btts-yes', probability: 54.8, modelProbability: 54.8, fairProbability: 56.2, odds: 1.72 },
    { id: 'd3', matchKey: 'd3', match: 'Club E – Club F', market: 'Plus de 2,5 buts', marketId: 'over-25', probability: 50.3, modelProbability: 52.0, fairProbability: 50.3, odds: 1.90 }
  ];
  var DEMO_LEAGUES = { 'Championnat 1': 'tools_page.demo_league_1', 'Championnat 2': 'tools_page.demo_league_2' };
  function ligueAffichee(nom) { return DEMO_LEAGUES[nom] ? t(DEMO_LEAGUES[nom], nom) : (nom || ''); }
  // Libelle d'une ligne (demo ou reelle) dans la langue active, francais
  // compris : l'identifiant moteur est plus sur qu'un texte deja redige
  // (relire "... 1,5 but" comme un libelle moteur le deformerait).
  function marcheLigne(r) {
    var labels = window.IasharkMarketLabels;
    if (r.marketId && labels && labels.marketIdLabel) return labels.marketIdLabel(r.marketId);
    return marcheLisible(r.market);
  }

  /* ---------------------------------------------------------------------
     ACCES AUX DONNEES DE MATCH — passage oblige par le serveur.
     --------------------------------------------------------------------- */
  function chargerMatchs() {
    if (!ctx.isPro) return Promise.resolve(null);      // aucun appel pour un non-abonne
    if (etat.matchs) return Promise.resolve(etat.matchs);
    // Un seul appel en vol : le pre-chargement de init() et le rendu du scanner
    // partagent la meme promesse (16/09/2026).
    if (etat.matchsEnCours) return etat.matchsEnCours;
    // scope 'list' : liste legere (data-home.json) enrichie cote serveur des
    // champs premium pour un abonne. Les outils n'utilisent que des champs de
    // liste (id, equipes, no_signal, pari_rec, cote_rec, model_probability) :
    // inutile de faire lire les ~25 Mo de data.json a la fonction Edge.
    etat.matchsEnCours = window.IasharkApp.supabase.functions.invoke('match-data', { body: { scope: 'list' } }).then(function (r) {
      // Le serveur decide : sans isPro confirme par match-data (plan lu cote
      // serveur), aucune donnee de match n est utilisee, meme si le client se
      // croit abonne. match-data ne sert de toute facon aucun champ premium a un
      // non-abonne.
      if (r.error || !r.data || r.data.isPro !== true) return null;
      etat.matchs = (r.data.matchs || []).filter(function (m) { return m && m.pari_rec && !m.no_signal; });
      return etat.matchs;
    }).catch(function () { return null; }).then(function (res) { etat.matchsEnCours = null; return res; });
    return etat.matchsEnCours;
  }

  /* ---------------------------------------------------------------------
     BRIQUES D'INTERFACE
     --------------------------------------------------------------------- */
  var S = {
    carte: 'rounded-2xl border border-hairline bg-surface/50 p-5 sm:p-6',
    titre: 'text-[19px] font-bold tracking-[-0.02em] text-ink',
    sous: 'mt-1.5 text-[14px] leading-relaxed text-soft',
    label: 'mb-1.5 block text-[13px] font-medium text-soft',
    input: 'w-full rounded-lg border border-hairline bg-panel px-3 py-2.5 text-[15px] font-semibold text-ink outline-none transition focus:border-cyan/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan',
    aide: 'mt-1.5 block text-[12px] leading-snug text-soft/80',
    err: 'mt-1.5 block text-[12.5px] font-medium text-[#ff8f85]'
  };

  // Cle i18n par texte francais plutot que par site d'appel : enTete() reste
  // appelee avec les DEUX literaux francais d'origine (test
  // tests/outils-langue.test.js : regex `enTete\('...', '...'\)`, ne doit
  // jamais voir un appel imbrique comme enTete(t(...), t(...))). La
  // traduction se fait ici, en interne, par correspondance exacte du texte.
  var ENTETES = {
    'Détecteur d’écarts': ['tools_page.scan_title', 'tools_page.scan_sub'],
    'Analyse de combiné': ['tools_page.combo_title', 'tools_page.combo_sub']
  };
  function enTete(titre, sous) {
    var clefs = ENTETES[titre];
    var titreTxt = clefs ? t(clefs[0], titre) : titre;
    var sousTxt = clefs ? t(clefs[1], sous) : sous;
    return '<header class="mb-6"><h2 class="' + S.titre + '">' + esc(titreTxt) + '</h2>'
      + '<p class="' + S.sous + '">' + esc(sousTxt) + '</p></header>';
  }

  function select(id, label, options, valeur) {
    return '<div><label for="' + id + '" class="' + S.label + '">' + esc(label) + '</label>'
      + '<select id="' + id + '" class="' + S.input + '">'
      + options.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(valeur) ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select></div>';
  }

  // Resultat DOMINANT : un seul chiffre porte la reponse, le reste gravite autour.
  function resultat(label, valeur, note, ton) {
    var couleur = ton === 'neg' ? 'text-[#ff8f85]' : ton === 'neutre' ? 'text-ink' : 'text-cyan';
    return '<div class="rounded-xl border border-cyan/20 bg-cyan/[0.05] p-5">'
      + '<div class="text-[11px] font-bold tracking-[0.16em] text-soft">' + esc(label) + '</div>'
      + '<div class="mt-1.5 text-[clamp(30px,4vw,42px)] font-extrabold leading-none tracking-[-0.04em] ' + couleur + ' tabular-nums">' + valeur + '</div>'
      + (note ? '<p class="mt-2.5 text-[13px] leading-relaxed text-soft">' + note + '</p>' : '')
      + '</div>';
  }

  function kpi(valeur, label, ton) {
    var c = ton === 'pos' ? 'text-cyan' : ton === 'neg' ? 'text-[#ff8f85]' : 'text-ink';
    return '<div class="rounded-xl border border-hairline bg-panel/60 px-4 py-3.5">'
      + '<div class="text-[20px] font-extrabold leading-none tracking-[-0.03em] ' + c + ' tabular-nums">' + valeur + '</div>'
      + '<div class="mt-1.5 text-[12px] leading-snug text-soft">' + esc(label) + '</div></div>';
  }

  function bandeauDemo(texte) {
    return '<div class="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-hairline bg-panel/70 px-4 py-3">'
      + '<span class="rounded-full bg-soft/20 px-2.5 py-1 text-[10px] font-extrabold tracking-[0.12em] text-soft">' + esc(t('tools_page.badge_demo_mode', 'MODE DÉMONSTRATION')) + '</span>'
      + '<span class="text-[13px] leading-snug text-soft">' + esc(texte) + '</span></div>';
  }

  // UN SEUL panneau d'abonnement par outil, sobre, en bas du workspace.
  function panneauPro(titre, sous) {
    if (ctx.isPro) return '';
    return '<div class="mt-6 rounded-2xl border border-cyan/25 bg-cyan/[0.05] p-5 sm:flex sm:items-center sm:gap-6">'
      + '<div class="min-w-0 flex-1"><div class="text-[10px] font-extrabold tracking-[0.16em] text-cyan">' + esc(t('tools_page.pro_badge_label', 'PRO')) + '</div>'
      + '<p class="mt-1.5 text-[14px] font-semibold text-ink">' + esc(titre) + '</p>'
      + '<p class="mt-1 text-[13px] leading-relaxed text-soft">' + esc(sous) + '</p></div>'
      + '<a href="' + esc(lien('abonnement.html')) + '" class="mt-4 inline-flex shrink-0 items-center justify-center rounded-xl bg-cyan px-6 py-3 text-[13px] font-extrabold text-page transition hover:brightness-110 sm:mt-0">' + esc(t('tools_page.pro_cta_unlock', 'Débloquer Pro')) + '</a>'
      + '</div>';
  }

  function vide(titre, texte, cta) {
    return '<div class="rounded-2xl border border-dashed border-hairline px-6 py-12 text-center">'
      + '<p class="text-[15.5px] font-semibold text-ink">' + esc(titre) + '</p>'
      + '<p class="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-soft">' + esc(texte) + '</p>'
      + (cta || '') + '</div>';
  }

  window.__iasharkToolsState = null; // pas d'etat premium expose

  /* =====================================================================
     01 — VALUE SCANNER   "Ou IASHARK voit-il un ecart avec le marche ?"
     ===================================================================== */
  function ligneScan(r, i, reel) {
    var edge = '<div class="w-[74px] shrink-0 text-[17px] font-extrabold leading-none tracking-[-0.03em] text-cyan tabular-nums">'
      + signe(r.edge, 1) + '<span class="ml-1 text-[10px] font-bold tracking-normal text-soft">' + esc(points()) + '</span></div>';
    var titre = reel ? esc(r.match) : esc(r.match);
    var action = reel && r.id
      ? '<a href="' + esc(lien('match.html?id=' + encodeURIComponent(r.id))) + '" class="shrink-0 rounded-lg border border-hairline px-3 py-1.5 text-[12.5px] font-semibold text-ink transition hover:border-cyan/40 hover:text-cyan">' + esc(t('tools_page.scan_view_btn', 'Voir')) + '</a>'
      : '<span class="shrink-0 text-[12.5px] text-soft/60">—</span>';
    return '<li class="flex items-center gap-3 border-t border-hairline px-1 py-3 first:border-t-0 sm:gap-4">'
      + edge
      + '<div class="min-w-0 flex-1"><div class="truncate text-[14px] font-semibold text-ink">' + titre + (reel ? badgeChoix(r) : '') + '</div>'
      + '<div class="truncate text-[12.5px] text-soft">' + esc(marcheLigne(r)) + ' · ' + esc(ligueAffichee(r.league)) + '</div></div>'
      + '<div class="hidden w-[76px] shrink-0 text-right sm:block"><div class="text-[14px] font-bold text-ink tabular-nums">' + num(r.modelProbability, r.chanceIashark ? 0 : 1) + '%</div><div class="text-[11px] text-soft">' + esc(t('tools_page.label_model_short', 'modèle')) + '</div></div>'
      + '<div class="hidden w-[76px] shrink-0 text-right sm:block"><div class="text-[14px] font-semibold text-soft tabular-nums">' + (r.marketProbability != null ? num(r.marketProbability, 1) + '%' : '—') + '</div><div class="text-[11px] text-soft">' + esc(t('tools_page.label_market_short', 'marché')) + '</div></div>'
      + action + '</li>';
  }

  // Traduit un libelle de marche en langage courant, dans la langue active
  // (lib/market-labels.js#marketLabel) : "DC 12" ou "Over 2.5" n'ont aucun
  // sens pour qui decouvre le site. Les noms d'equipes ne sont pas connus
  // ici, la traduction reste donc generique ("l'equipe a domicile"), ce qui
  // suffit dans une liste de marches. Un texte libre (journal) ressort tel quel.
  function marcheLisible(libelle) {
    var labels = window.IasharkMarketLabels;
    return labels ? (labels.marketLabel || labels.marketLabelFr)(libelle) : String(libelle == null ? '' : libelle);
  }

  function rendreScanner(panneau) {
    var html = enTete('Détecteur d’écarts', 'Compare nos probabilités aux cotes du jour et remonte les écarts les plus marqués.');

    if (!ctx.isPro) {
      // Aucun vrai match n'est charge ni rendu : uniquement la structure et
      // un exemple explicitement fictif.
      html += bandeauDemo(t('tools_page.scan_demo_text', 'Ces trois lignes sont fictives et servent uniquement à montrer la structure de l’outil.'))
        + '<div class="' + S.carte + '"><ul class="list-none p-0">'
        + DEMO_SCAN.map(function (r, i) { return ligneScan(r, i, false); }).join('')
        + '</ul></div>'
        // Plus de « 5000 simulations par match » ecrit en dur (2e contre-controle de
        // l'avocat du diable, 30/09/2026) : faux pour un pari du moteur v3, calcule
        // exactement sans simulation. Le vrai nombre n'est affiche que par match,
        // quand le champ nb_simulations existe (accueil et liste).
        + '<div class="mt-5 grid grid-cols-2 gap-3">'
        // 48 = config/leagues.json#leagues (tests/controle-chiffres-publics.test.js) ; plus de
        // « 19 championnats analyses chaque jour » ni d'« analyse offerte par jour » (30/09/2026).
        + kpi('48', t('tools_page.scan_kpi_leagues', 'Compétitions couvertes'))
        + kpi('1', t('tools_page.scan_kpi_free', 'Match offert, avec son analyse'))
        + '</div>'
        + panneauPro(t('tools_page.scan_pro_title', 'Le scanner classe tous les marchés du jour par écart.'),
            t('tools_page.scan_pro_sub', 'Les matchs, marchés, probabilités et cotes réels sont servis uniquement aux abonnés.'));
      panneau.innerHTML = html;
      return;
    }

    html += '<div class="mb-4 flex flex-wrap items-end gap-3">'
      + '<div class="w-[180px]">' + select('scanEdge', t('tools_page.scan_filter_edge_label', 'Écart minimum'), [['0', t('tools_page.scan_filter_edge_all', 'Tout afficher')], ['3', t('tools_page.scan_filter_edge_3', '3 points ou plus')], ['5', t('tools_page.scan_filter_edge_5', '5 points ou plus')], ['10', t('tools_page.scan_filter_edge_10', '10 points ou plus')]], '3') + '</div>'
      + '<div class="w-[180px]">' + select('scanTri', t('tools_page.scan_sort_label', 'Trier par'), [['edge', t('tools_page.scan_sort_edge', 'Écart décroissant')], ['heure', t('tools_page.scan_sort_time', 'Heure du match')]], 'edge') + '</div>'
      + '</div><div id="scanBox" class="' + S.carte + '"><p class="py-8 text-center text-[13.5px] text-soft">' + esc(t('tools_page.scan_loading', 'Chargement des marchés du jour…')) + '</p></div>';
    panneau.innerHTML = html;

    chargerMatchs().then(function (matchs) {
      var box = $('#scanBox', panneau);
      if (!box) return;
      if (!matchs || !matchs.length) {
        box.innerHTML = vide(t('tools_page.scan_empty_title', 'Aucune donnée disponible'), t('tools_page.scan_empty_text', 'Les analyses du jour ne sont pas encore publiées, ou la connexion a échoué.'));
        return;
      }
      function peindre() {
        var minEdge = parseFloat(($('#scanEdge') || {}).value || '3');
        var tri = ($('#scanTri') || {}).value || 'edge';
        var rows = D.scanValue(matchs, { minEdge: minEdge }) || [];
        if (tri === 'heure') rows = rows.slice().sort(function (a, b) { return String(a.date || '') < String(b.date || '') ? -1 : 1; });
        rows = choisisDabord(rows).slice(0, 15);
        box.innerHTML = rows.length
          ? '<ul class="list-none p-0">' + rows.map(function (r, i) { return ligneScan(r, i, true); }).join('') + '</ul>'
          : vide(t('tools_page.scan_empty_threshold_title', 'Aucun marché au-dessus de ce seuil'), t('tools_page.scan_empty_threshold_text', 'Aujourd’hui, aucun écart affiché n’atteint ce seuil. Les écarts en faveur du modèle ne sont pas tous affichés.'));
      }
      peindre();
      ['scanEdge', 'scanTri'].forEach(function (id) {
        var n = document.getElementById(id);
        if (n) n.addEventListener('change', peindre);
      });
    });
  }

  /* =====================================================================
     02-04 — (retires) COTE JUSTE, CALCULATEUR DE MISE, SIMULATEUR DE CAPITAL
     Decision de Clement du 30/09/2026 : plus aucune mise, aucun capital ni
     aucune esperance sur le site. Anciennes ancres -> tableau de bord.
     ===================================================================== */

  /* =====================================================================
     05 — COMBINE   "Quelle chance que tout passe ?"
     Decision de Clement (30/09/2026) : plus AUCUNE esperance (ni celle du
     combine, ni celle du « meilleur pari joue seul »). Seulement les
     selections, la cote du combine et la chance calculee par IASHARK : pour
     chaque pari, le PLUS PETIT des deux chiffres, le modele ou la cote sans
     marge (lib/tools-domain.js#comboSelections), meme en Europe. Un pari sans
     cote sans marge n'est pas propose. Plus de saisie manuelle : une
     probabilite tapee a la main ne serait pas une chance calculee par IASHARK.
     ===================================================================== */
  function rendreCombo(panneau) {
    var reel = ctx.isPro;
    panneau.innerHTML = enTete('Analyse de combiné', 'Multiplie les chances des sélections retenues : un combiné ne passe que si toutes passent.')
      + (reel ? '' : bandeauDemo(t('tools_page.combo_demo_text', 'Les trois sélections ci-dessous sont fictives et servent à montrer le fonctionnement de l’outil.')))
      + '<div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">'
      + '<div id="cbList" class="' + S.carte + '"><p class="py-6 text-center text-[13.5px] text-soft">' + esc(t('tools_page.combo_loading', 'Chargement…')) + '</p></div>'
      + '<div id="cbOut" class="min-w-0"></div></div>'
      + panneauPro(t('tools_page.combo_pro_title', 'Compose ton combiné à partir des analyses du jour.'),
          t('tools_page.combo_pro_sub_real', 'Les abonnés cochent les paris réels du jour qui ont une cote sans marge.'));

    function sourceListe() {
      if (!reel) return Promise.resolve(DEMO_COMBO);
      return chargerMatchs().then(function (matchs) { return choisisDabord(D.comboSelections(matchs, { limit: 500 })).slice(0, 12); });
    }

    sourceListe().then(function (liste) {
      var box = document.getElementById('cbList');
      if (!box) return;
      if (!liste.length) { box.innerHTML = vide(t('tools_page.combo_empty_title', 'Aucune sélection disponible'), t('tools_page.combo_empty_nofair', 'Seuls les paris du jour qui ont une cote sans marge peuvent entrer dans un combiné. Il n’y en a pas pour le moment.')); return; }
      box.innerHTML = '<ul class="list-none p-0">' + liste.map(function (s, i) {
        return '<li class="border-t border-hairline first:border-t-0"><label class="flex cursor-pointer items-center gap-3 py-3">'
          + '<input type="checkbox" data-cb="' + i + '" class="h-4 w-4 shrink-0 accent-[#20d5ef]">'
          + '<span class="min-w-0 flex-1"><span class="block truncate text-[14px] font-semibold text-ink">' + esc(s.match) + (reel ? badgeChoix(s) : '') + '</span>'
          + '<span class="block truncate text-[12.5px] text-soft">' + esc(marcheLigne(s)) + ' · ' + num(s.probability, 0) + esc(t('tools_page.combo_chance_suffix', ' % de chance')) + '</span></span>'
          + '<span class="shrink-0 text-[14px] font-bold text-ink tabular-nums">' + num(s.odds, 2) + '</span></label></li>';
      }).join('') + '</ul>';
      $$('input[data-cb]', box).forEach(function (input) {
        input.addEventListener('change', function () { calculer(liste); });
      });
      calculer(liste);
    });

    function calculer(liste) {
      var out = document.getElementById('cbOut'); if (!out) return;
      var picks = [];
      $$('input[data-cb]:checked').forEach(function (input) {
        var s = liste[Number(input.getAttribute('data-cb'))];
        if (s) picks.push(s);
      });
      if (picks.length < 2) {
        out.innerHTML = vide(t('tools_page.combo_min_two_title', 'Sélectionne au moins deux paris'), t('tools_page.combo_min_two_text', 'Un combiné se juge sur la multiplication des probabilités : il en faut au moins deux.'));
        return;
      }
      var r = D.combo(picks.map(function (s) { return { probability: s.probability, odds: s.odds, label: s.market }; }));
      var risque = D.comboRisk(picks);
      if (!r) { out.innerHTML = vide(t('tools_page.title_calc_impossible', 'Calcul impossible'), t('tools_page.combo_calc_impossible_text', 'Vérifie les probabilités et les cotes.')); return; }
      out.innerHTML = resultat(t('tools_page.combo_chance_label', 'Chance calculée par IASHARK'), num(r.probability, 1) + '%',
          t('tools_page.combo_chance_note', 'Pour chaque sélection, IASHARK retient le plus petit des deux chiffres : son modèle ou la cote sans marge. Toutes les sélections doivent passer.'), 'neutre')
        + '<div class="mt-4 grid grid-cols-2 gap-3">'
        + kpi(num(r.bookOdds, 2), t('tools_page.combo_kpi_book_odds', 'Cote du combiné'))
        + kpi(String(picks.length), t('tools_page.combo_kpi_selections', 'Sélections'))
        + '</div>'
        + (risque.correlated
          ? '<div class="mt-4 rounded-xl border border-[#f5a524]/30 bg-[#f5a524]/[0.07] px-4 py-3 text-[13px] leading-relaxed text-soft">' + t('tools_page.combo_correlation_warning', '<b class="text-ink">Ces sélections peuvent être corrélées.</b> Plusieurs portent sur le même match. Le calcul suppose des événements indépendants : il peut surestimer ou sous-estimer la probabilité réelle. Nous ne disposons pas de mesure de dépendance entre marchés.') + '</div>'
          : '');
    }
  }

  /* =====================================================================
     BANDEAU PERSONNEL : bonjour par le prenom (s'il est connu, jamais tire
     de l'adresse e-mail), ses competitions et ses types de paris, et le lien
     vers ses reglages. Premiere visite d'un abonne Pro sans reglages (et
     questionnaire ouvert) : direction le questionnaire, une fois par session.
     ===================================================================== */
  var REGLAGES_OUVERTS = !!(window.IASHARK_OUVERTURE && window.IASHARK_OUVERTURE.reglagesPro === true);
  function prenom(displayName) {
    var meta = (ctx.user && ctx.user.user_metadata) || {};
    var brut = String(displayName || meta.first_name || meta.given_name || meta.full_name || meta.name || '').trim();
    var mot = brut.split(/\s+/)[0] || '';
    // Jamais une adresse ou un identifiant technique.
    return /@|^\d+$/.test(mot) || mot.length > 30 ? '' : mot;
  }
  function nomLigue(k) {
    var LN = window.IasharkLeagueNames;
    return (LN && LN.displayName && LN.displayName(k)) || null;
  }
  function rendreBandeau(displayName) {
    var slot = document.getElementById('proPerso');
    if (!slot || !ctx.user) return;
    var nom = prenom(displayName), p = etat.perso;
    var html = '<p class="text-[17px] font-bold text-ink">' + esc(nom ? t('pro_perso.hello_name', 'Bonjour {name}').replace('{name}', nom) : t('pro_perso.hello', 'Bonjour')) + '</p>';
    if (ctx.isPro) {
      var ligues = p.ligues.map(nomLigue).filter(Boolean);
      if (ligues.length) {
        // Deux-points a la francaise (espace insecable avant) seulement en francais.
        var dp = (window.I18N && window.I18N.locale === 'fr') ? '\u00a0:' : ':';
        var ligne = function (libelle, valeur) {
          return '<p class="mt-1.5 text-[13.5px] leading-relaxed"><span class="text-soft">' + esc(libelle + dp) + '</span> <span class="font-semibold text-ink">' + esc(valeur) + '</span></p>';
        };
        html += ligne(t('pro_perso.your_competitions', 'Tes compétitions'), ligues.join(', '));
      }
      var href = REGLAGES_OUVERTS ? lien('accueil-pro.html?modifier=1') : lien('compte.html#competitions');
      var libelle = REGLAGES_OUVERTS ? t('pro_perso.edit', 'Modifier mes réglages') : t('pro_perso.edit_competitions', 'Choisir mes compétitions');
      html += '<a href="' + esc(href) + '" class="mt-3 inline-flex text-[13.5px] font-semibold text-cyan transition hover:underline">' + esc(libelle) + '</a>';
    }
    slot.innerHTML = html;
    slot.hidden = false;
  }
  function chargerPerso() {
    var sb = window.IasharkApp.supabase, uid = ctx.user.id, P = window.IasharkProPreferences;
    var meta = ctx.user.user_metadata || {};
    etat.perso.ligues = (Array.isArray(meta.fav_leagues) ? meta.fav_leagues : []).filter(function (k) { return typeof k === 'string' && /^[a-z0-9_-]{1,60}$/.test(k); });
    function sur(q) { return q.then(function (x) { return x; }, function () { return { error: true }; }); }
    var lectures = [sur(sb.from('user_preferences').select('display_name').eq('user_id', uid).maybeSingle())];
    if (ctx.isPro && REGLAGES_OUVERTS && P) {
      lectures.push(sur(sb.from(P.TABLE).select('pays,marches').eq('user_id', uid).maybeSingle()).then(function (r) {
        // Base sans 0044 : la ligne existe-t-elle ? (pas de types de paris enregistres)
        return r && r.error && P.erreurColonneAbsente(r.error) ? sur(sb.from(P.TABLE).select('pays').eq('user_id', uid).maybeSingle()) : r;
      }));
    }
    return Promise.all(lectures).then(function (r) {
      var up = r[0] && !r[0].error && r[0].data;
      var pro = r[1];
      if (pro && !pro.error) {
        // Premiere visite d'un abonne Pro sans reglages : le questionnaire, une fois par session.
        var vu = false;
        try { vu = !!sessionStorage.getItem('iashark_accueil_pro_vu'); } catch (_e) { vu = true; }
        if (!pro.data && !vu) {
          try { sessionStorage.setItem('iashark_accueil_pro_vu', '1'); } catch (_e) {}
          location.replace(lien('accueil-pro.html'));
          return;
        }
        if (pro.data && P) etat.perso.marches = P.normaliser(pro.data).marches;
      }
      rendreBandeau(up && up.display_name);
    });
  }

  /* =====================================================================
     ROUTEUR
     ===================================================================== */
  // Espace Pro (V3 du 3/10/2026) : le tableau de bord (pro-dashboard.js) est le
  // premier onglet, puis « Mon combine » et le detecteur d'ecarts. Retires :
  // cote juste, simulateur du capital, journal (devenu « Mes paris » du
  // tableau de bord) et calcul de mise (30/09/2026 : plus aucune mise) ; leurs anciennes ancres menent au tableau de bord.
  function rendreTableau(panneau) {
    if (window.IasharkProDashboard) window.IasharkProDashboard.render(panneau, ctx);
  }
  // LANCEMENT DU 3/10 (avocat du diable, 01/10/2026) : le tableau de bord, le journal et le
  // garde-fou dependent des migrations 0040/0041, pas encore appliquees : ils sont CACHES
  // (ni onglet, ni rendu, ni ancre). « Mon combiné » devient le premier onglet. Passer
  // TABLEAU_OUVERT a true (et remettre l'onglet dans pro.html) le jour de leur ouverture.
  var TABLEAU_OUVERT = !!(window.IASHARK_OUVERTURE && window.IASHARK_OUVERTURE.tableauPro === true);
  var RENDU = TABLEAU_OUVERT ? { tableau: rendreTableau, combo: rendreCombo, scanner: rendreScanner } : { combo: rendreCombo, scanner: rendreScanner };
  var DEFAUT = TABLEAU_OUVERT ? 'tableau' : 'combo';
  var ANCIENNES_ANCRES = { fair: DEFAUT, bankroll: DEFAUT, journal: DEFAUT, stake: DEFAUT, tableau: DEFAUT };

  function activer(outil) {
    if (!RENDU[outil] && ANCIENNES_ANCRES[outil]) outil = ANCIENNES_ANCRES[outil];
    if (!RENDU[outil]) outil = DEFAUT;
    etat.outil = outil;
    $$('[data-tool]').forEach(function (b) {
      var on = b.getAttribute('data-tool') === outil;
      if (on) b.setAttribute('data-active', '1'); else b.removeAttribute('data-active');
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.setAttribute('tabindex', on ? '0' : '-1');
    });
    $$('[data-panel]').forEach(function (p) {
      var on = p.getAttribute('data-panel') === outil;
      p.hidden = !on;
      if (on && !p.dataset.rendu) { RENDU[outil](p); p.dataset.rendu = '1'; }
      else if (on) { RENDU[outil](p); }
    });
    if (history.replaceState) history.replaceState(null, '', '#' + outil);
  }

  function init() {
    var ORDRE = TABLEAU_OUVERT ? ['tableau', 'combo', 'scanner'] : ['combo', 'scanner'];
    $$('[data-tool]').forEach(function (b) {
      b.addEventListener('click', function () { activer(b.getAttribute('data-tool')); });
      // Motif ARIA "tabs" : les fleches deplacent la selection, Debut/Fin
      // sautent aux extremites. Sans ca, un utilisateur clavier doit tabuler
      // a travers les cinq onglets pour atteindre le dernier.
      b.addEventListener('keydown', function (e) {
        var i = ORDRE.indexOf(b.getAttribute('data-tool'));
        var suivant = null;
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') suivant = ORDRE[(i + 1) % ORDRE.length];
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') suivant = ORDRE[(i - 1 + ORDRE.length) % ORDRE.length];
        else if (e.key === 'Home') suivant = ORDRE[0];
        else if (e.key === 'End') suivant = ORDRE[ORDRE.length - 1];
        if (!suivant) return;
        e.preventDefault();
        activer(suivant);
        var cible = b.closest('[role="tablist"]').querySelector('[data-tool="' + suivant + '"]');
        if (cible) cible.focus();
      });
    });
    var depart = (location.hash || '').replace('#', '');
    // I18N.init() charge le dictionnaire de la locale detectee et resout
    // avant que la moindre section ne soit rendue (activer() plus bas) :
    // sans ca, t() renverrait toujours le repli francais meme sur /en/,
    // /es/, etc. Se degrade sans bruit si window.I18N est absent.
    var langue = (window.I18N && window.I18N.init) ? window.I18N.init() : Promise.resolve();
    // Dictionnaire et session en PARALLELE (16/09/2026) : la session ne depend
    // pas de la langue. Avant, l'abonne attendait dictionnaire -> session ->
    // preferences/journal avant le premier appel match-data.
    var contexte = Promise.resolve().then(function () { return window.IasharkApp.context(); });
    Promise.all([langue.catch(function () {}), contexte]).then(function (res) {
      var c = res[1];
      ctx = c || ctx;
      if (!c || !c.user) return null;
      // Bandeau personnel et choix de l'abonne AVANT le premier rendu des listes.
      var perso = chargerPerso().catch(function () {});
      // Abonne confirme cote client : la liste de matchs part tout de suite (le
      // serveur tranche via isPro).
      chargerMatchs();
      // Le journal est lu par le tableau de bord (pro-dashboard.js), pas ici.
      // Les limites personnelles ne servaient qu'au calcul de mise (retire le
      // 30/09/2026) : plus rien a lire ici.
      return perso;
    }).catch(function () {}).then(function () {
      activer(RENDU[depart] || ANCIENNES_ANCRES[depart] ? depart : DEFAUT);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
