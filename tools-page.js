/* =========================================================================
   IASHARK — PAGE PRO (pro.html)
   Visiteur sans compte ou compte gratuit : la page de VENTE (lib/pro-vente.js,
   21/10/2026). Abonne Pro : ses outils, quatre depuis le 21/10/2026 : detecter,
   evaluer, combiner, mesurer. Le calculateur de mise et le simulateur de capital
   sont retires (regle de Clement : ni mise, ni capital, ni esperance affiches),
   et avec eux l'esperance de la cote juste et du combine, la mise, le ROI et le
   profit / perte du journal : aucun montant ni aucune esperance sur cette page.

   SECURITE — regle centrale de ce fichier.
   Cette page ne lit JAMAIS /data.json. Les donnees de match arrivent
   uniquement par la fonction Edge `match-data`, qui applique l'autorisation
   cote serveur (elle verifie le plan de l'utilisateur avant de repondre).
   Un visiteur non abonne ne declenche aucun appel de donnees de match : il voit
   la page de vente, sans aucun outil ni aucune ligne de match dans le DOM.
   ========================================================================= */
(function () {
  'use strict';

  var D = window.IasharkToolsDomain;
  var ctx = { user: null, isPro: false, isAdmin: false };
  var etat = { outil: 'scanner', matchs: null, decisions: [], combo: [] };

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

  // Libelle d'une ligne dans la langue active, francais
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
    'Cote juste': ['tools_page.fair_title', 'tools_page.fair_sub'],
    'Analyse de combiné': ['tools_page.combo_title', 'tools_page.combo_sub'],
    'Journal des décisions': ['tools_page.journal_title', 'tools_page.journal_sub']
  };
  function enTete(titre, sous) {
    var clefs = ENTETES[titre];
    var titreTxt = clefs ? t(clefs[0], titre) : titre;
    var sousTxt = clefs ? t(clefs[1], sous) : sous;
    return '<header class="mb-6"><h2 class="' + S.titre + '">' + esc(titreTxt) + '</h2>'
      + '<p class="' + S.sous + '">' + esc(sousTxt) + '</p></header>';
  }

  function champ(id, label, opts) {
    var o = opts || {};
    var suffixe = o.unit ? '<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-medium text-soft">' + esc(o.unit) + '</span>' : '';
    return '<div><label for="' + id + '" class="' + S.label + '">' + esc(label) + '</label>'
      + '<div class="relative">'
      + '<input id="' + id + '" type="' + (o.type || 'number') + '"' + (o.step ? ' step="' + o.step + '"' : '')
      + (o.min != null ? ' min="' + o.min + '"' : '') + (o.max != null ? ' max="' + o.max + '"' : '')
      + ' value="' + esc(o.value == null ? '' : o.value) + '"'
      + (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '')
      + ' class="' + S.input + (o.unit ? ' pr-12' : '') + '">'
      + suffixe + '</div>'
      + (o.help ? '<span class="' + S.aide + '">' + esc(o.help) + '</span>' : '')
      + '<span class="' + S.err + '" data-err="' + id + '" hidden></span></div>';
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

  function vide(titre, texte, cta) {
    return '<div class="rounded-2xl border border-dashed border-hairline px-6 py-12 text-center">'
      + '<p class="text-[15.5px] font-semibold text-ink">' + esc(titre) + '</p>'
      + '<p class="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-soft">' + esc(texte) + '</p>'
      + (cta || '') + '</div>';
  }

  function erreurChamp(id, message) {
    var el = document.querySelector('[data-err="' + id + '"]');
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
    var input = document.getElementById(id);
    if (input) {
      input.setAttribute('aria-invalid', message ? 'true' : 'false');
      input.classList.toggle('border-[#ff8f85]/60', !!message);
    }
  }
  window.__iasharkToolsState = null; // pas d'etat premium expose

  /* =====================================================================
     01 — VALUE SCANNER   "Ou IASHARK voit-il un ecart avec le marche ?"
     ===================================================================== */
  function ligneScan(r) {
    var edge = '<div class="w-[74px] shrink-0 text-[17px] font-extrabold leading-none tracking-[-0.03em] text-cyan tabular-nums">'
      + signe(r.edge, 1) + '<span class="ml-1 text-[10px] font-bold tracking-normal text-soft">' + esc(points()) + '</span></div>';
    var titre = esc(r.match);
    var action = r.id
      ? '<a href="' + esc(lien('match.html?id=' + encodeURIComponent(r.id))) + '" class="shrink-0 rounded-lg border border-hairline px-3 py-1.5 text-[12.5px] font-semibold text-ink transition hover:border-cyan/40 hover:text-cyan">' + esc(t('tools_page.scan_view_btn', 'Voir')) + '</a>'
      : '<span class="shrink-0 text-[12.5px] text-soft/60">—</span>';
    return '<li class="flex items-center gap-3 border-t border-hairline px-1 py-3 first:border-t-0 sm:gap-4">'
      + edge
      + '<div class="min-w-0 flex-1"><div class="truncate text-[14px] font-semibold text-ink">' + titre + '</div>'
      + '<div class="truncate text-[12.5px] text-soft">' + esc(marcheLigne(r)) + ' · ' + esc(r.league || '') + '</div></div>'
      + '<div class="hidden w-[76px] shrink-0 text-right sm:block"><div class="text-[14px] font-bold text-ink tabular-nums">' + num(r.modelProbability, 1) + '%</div><div class="text-[11px] text-soft">' + esc(t('tools_page.label_model_short', 'modèle')) + '</div></div>'
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
        rows = rows.slice(0, 15);
        box.innerHTML = rows.length
          ? '<ul class="list-none p-0">' + rows.map(function (r) { return ligneScan(r); }).join('') + '</ul>'
          : vide(t('tools_page.scan_empty_threshold_title', 'Aucun marché au-dessus de ce seuil'), t('tools_page.scan_empty_threshold_text', 'C’est une information en soi : aujourd’hui, le marché est aligné sur nos calculs.'));
      }
      peindre();
      ['scanEdge', 'scanTri'].forEach(function (id) {
        var n = document.getElementById(id);
        if (n) n.addEventListener('change', peindre);
      });
    });
  }

  /* =====================================================================
     02 — FAIR ODDS   "Cette cote reflete-t-elle la probabilite ?"
     Calculateur pur : il ne consomme AUCUNE donnee du modele, il est donc
     entierement utilisable par un visiteur gratuit avec ses propres chiffres.
     ===================================================================== */
  function barreProb(label, valeur, largeur, accent) {
    return '<div class="mb-3"><div class="mb-1.5 flex items-baseline justify-between">'
      + '<span class="text-[12.5px] font-medium text-soft">' + esc(label) + '</span>'
      + '<span class="text-[15px] font-bold ' + (accent ? 'text-cyan' : 'text-ink') + ' tabular-nums">' + num(valeur, 1) + '%</span></div>'
      + '<div class="h-2.5 overflow-hidden rounded-full bg-panel">'
      + '<div class="h-full rounded-full ' + (accent ? 'bg-cyan' : 'bg-soft/45') + '" style="width:' + Math.max(0, Math.min(100, largeur)) + '%"></div></div></div>';
  }

  function rendreFair(panneau) {
    panneau.innerHTML = enTete('Cote juste', 'Traduit une probabilité en cote équitable, et la compare au prix réellement proposé.')
      + '<div class="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">'
      + '<div class="' + S.carte + ' space-y-4">'
      + champ('foProb', t('tools_page.fair_prob_label', 'Probabilité estimée'), { unit: '%', min: 0.1, max: 99.9, step: 0.1, value: 58, help: t('tools_page.fair_prob_help', 'Ta propre estimation, ou celle d’une analyse IASHARK.') })
      + champ('foOdds', t('tools_page.fair_odds_label', 'Cote disponible'), { min: 1.01, step: 0.01, value: 1.90, help: t('tools_page.fair_odds_help', 'La cote décimale proposée par le bookmaker.') })
      + '</div>'
      + '<div id="foOut" class="min-w-0"></div></div>';

    function calculer() {
      var p = document.getElementById('foProb'), o = document.getElementById('foOdds');
      var out = document.getElementById('foOut');
      if (!p || !o || !out) return;
      erreurChamp('foProb', ''); erreurChamp('foOdds', '');
      var vp = Number(p.value), vo = Number(o.value);
      var ko = false;
      if (!(vp > 0 && vp < 100)) { erreurChamp('foProb', t('tools_page.err_probability_range', 'Entre une probabilité entre 0 et 100 %.')); ko = true; }
      if (!(vo > 1)) { erreurChamp('foOdds', t('tools_page.err_odds_gt_one_decimal', 'La cote décimale doit être supérieure à 1.')); ko = true; }
      if (ko) { out.innerHTML = vide(t('tools_page.fair_empty_title', 'Résultat indisponible'), t('tools_page.msg_fix_highlighted_fields_calc', 'Corrige les champs signalés pour lancer le calcul.')); return; }

      var r = D.fairOdds({ probability: vp, odds: vo });
      // Ecart arrondi a 0,0 point : on ne parle ni de faveur ni de defaveur.
      var aucunEcart = r.edgePoints === 0;
      var note = aucunEcart
        ? t('tools_page.note_no_gap', 'La cote proposée correspond à la cote juste : aucun écart.')
        : r.favourable
          ? t('tools_page.fair_note_favourable', 'La cote proposée est <b class="text-ink">plus généreuse</b> que ta probabilité ne le justifie : c’est un écart en ta faveur.')
          : t('tools_page.fair_note_unfavourable', 'La cote proposée est <b class="text-ink">moins intéressante</b> que ta probabilité ne le justifie : c’est un écart en ta défaveur.');
      var largeurMax = Math.max(r.estimatedProbability, r.impliedProbability, 1);
      out.innerHTML = resultat(t('tools_page.fair_result_label_gap', 'Écart'), signe(r.edgePoints, 1) + ' ' + esc(points()), note, aucunEcart ? 'neutre' : r.favourable ? 'pos' : 'neg')
        + '<div class="' + S.carte + ' mt-4">'
        + barreProb(t('tools_page.fair_bar_your_prob', 'Ta probabilité estimée'), r.estimatedProbability, r.estimatedProbability / largeurMax * 100, true)
        + barreProb(t('tools_page.fair_bar_implied_prob', 'Probabilité implicite de la cote'), r.impliedProbability, r.impliedProbability / largeurMax * 100, false)
        + '<p class="mt-3 border-t border-hairline pt-3 text-[13px] leading-relaxed text-soft">' + esc(t('tools_page.fair_note_static', 'Un écart positif signifie que tu estimes l’événement plus probable que ne le fait le prix affiché.')) + '</p>'
        + '</div>'
        + '<div class="mt-4 grid grid-cols-2 gap-3">'
        + kpi(num(r.fairOdds, 2), t('tools_page.fair_kpi_fair_odds', 'Cote juste'))
        + kpi(num(r.marketOdds, 2), t('tools_page.fair_odds_label', 'Cote disponible'))
        + '</div>';
    }
    ['foProb', 'foOdds'].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.addEventListener('input', calculer);
    });
    calculer();
  }

  /* =====================================================================
     03 — COMBO AUDITOR   "Quelle est la vraie probabilite de ce combine ?"
     Probabilite combinee, cote juste du combine, cote totale proposee.
     Ni esperance ni montant (21/10/2026).
     ===================================================================== */
  function rendreCombo(panneau) {
    panneau.innerHTML = enTete('Analyse de combiné', 'Multiplie les probabilités de chaque sélection et compare la cote juste du combiné à la cote proposée.')
      + '<div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">'
      + '<div><div id="cbList" class="' + S.carte + '"><p class="py-6 text-center text-[13.5px] text-soft">' + esc(t('tools_page.combo_loading', 'Chargement…')) + '</p></div>'
      + '<div class="' + S.carte + ' mt-4"><p class="mb-3 text-[13px] font-semibold text-ink">' + esc(t('tools_page.combo_manual_add_title', 'Ajouter une sélection manuelle')) + '</p>'
      + '<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">'
      + champ('cbMatch', t('tools_page.label_match', 'Match'), { type: 'text', placeholder: t('tools_page.combo_match_placeholder', 'Équipe A – Équipe B') })
      + champ('cbProb', t('tools_page.combo_prob_label', 'Probabilité'), { unit: '%', min: 0.1, max: 99.9, step: 0.1, value: 60 })
      + champ('cbOdds', t('tools_page.label_odds', 'Cote'), { min: 1.01, step: 0.01, value: 1.80 })
      + '</div><button id="cbAdd" type="button" class="mt-3 rounded-xl border border-hairline px-4 py-2.5 text-[13px] font-semibold text-ink transition hover:border-cyan/40">' + esc(t('tools_page.combo_add_btn', 'Ajouter au combiné')) + '</button></div></div>'
      + '<div id="cbOut" class="min-w-0"></div></div>';

    function sourceListe() {
      return chargerMatchs().then(function (matchs) {
        return (matchs || []).filter(function (m) {
          return Number(m.model_probability) > 0 && Number(m.cote_rec) > 1;
        }).slice(0, 12).map(function (m) {
          return {
            id: String(m.id), matchKey: String(m.id),
            match: (m.home && m.home.n) + ' – ' + (m.away && m.away.n),
            market: m.pari_rec, marketId: /^F\d+:/.test(String(m.market_id || '')) ? m.market_id : null, probability: Number(m.model_probability), odds: Number(m.cote_rec)
          };
        });
      });
    }

    sourceListe().then(function (liste) {
      var box = document.getElementById('cbList');
      if (!box) return;
      if (!liste.length) { box.innerHTML = vide(t('tools_page.combo_empty_title', 'Aucune sélection disponible'), t('tools_page.combo_empty_text', 'Les analyses du jour ne sont pas encore publiées.')); return; }
      box.innerHTML = '<ul class="list-none p-0">' + liste.map(function (s, i) {
        return '<li class="border-t border-hairline first:border-t-0"><label class="flex cursor-pointer items-center gap-3 py-3">'
          + '<input type="checkbox" data-cb="' + i + '" class="h-4 w-4 shrink-0 accent-[#20d5ef]">'
          + '<span class="min-w-0 flex-1"><span class="block truncate text-[14px] font-semibold text-ink">' + esc(s.match) + '</span>'
          + '<span class="block truncate text-[12.5px] text-soft">' + esc(marcheLigne(s)) + ' · ' + num(s.probability, 1) + esc(t('tools_page.combo_estimated_suffix', ' % estimés')) + '</span></span>'
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
      picks = picks.concat(etat.combo);
      if (picks.length < 2) {
        out.innerHTML = vide(t('tools_page.combo_min_two_title', 'Sélectionne au moins deux paris'), t('tools_page.combo_min_two_text', 'Un combiné se juge sur la multiplication des probabilités : il en faut au moins deux.'));
        return;
      }
      var r = D.combo(picks.map(function (s) { return { probability: s.probability, odds: s.odds, label: s.market }; }));
      var risque = D.comboRisk(picks);
      if (!r) { out.innerHTML = vide(t('tools_page.title_calc_impossible', 'Calcul impossible'), t('tools_page.combo_calc_impossible_text', 'Vérifie les probabilités et les cotes.')); return; }
      var note = r.comparison === 'above'
        ? t('tools_page.combo_note_favourable', 'La cote du combiné est <b class="text-ink">plus généreuse</b> que la probabilité combinée ne le justifie : c’est un écart en ta faveur.')
        : r.comparison === 'below'
          ? t('tools_page.combo_note_unfavourable', 'La cote du combiné est <b class="text-ink">moins intéressante</b> que la probabilité combinée ne le justifie : c’est un écart en ta défaveur.')
          : t('tools_page.note_no_gap', 'La cote proposée correspond à la cote juste : aucun écart.');
      out.innerHTML = resultat(t('tools_page.combo_kpi_prob', 'Probabilité combinée'), num(r.probability, 1) + '%', note, 'neutre')
        + '<div class="mt-4 grid grid-cols-2 gap-3">'
        + kpi(num(r.fairOdds, 2), t('tools_page.combo_kpi_fair_odds', 'Cote juste estimée'))
        + kpi(num(r.bookOdds, 2), t('tools_page.combo_kpi_book_odds', 'Cote du combiné'))
        + '</div>'
        + '<p class="mt-3 text-[13px] leading-relaxed text-soft">' + esc(t('tools_page.combo_note_multiply', 'Toutes les sélections doivent passer : leurs probabilités se multiplient.')) + '</p>'
        + (risque.correlated
          ? '<div class="mt-4 rounded-xl border border-[#f5a524]/30 bg-[#f5a524]/[0.07] px-4 py-3 text-[13px] leading-relaxed text-soft">' + t('tools_page.combo_correlation_warning', '<b class="text-ink">Ces sélections peuvent être corrélées.</b> Plusieurs portent sur le même match. Le calcul suppose des événements indépendants : il peut surestimer ou sous-estimer la probabilité réelle. Nous ne disposons pas de mesure de dépendance entre marchés.') + '</div>'
          : '');
    }

    var add = document.getElementById('cbAdd');
    if (add) add.addEventListener('click', function () {
      var m = ($('#cbMatch') || {}).value, p = Number(($('#cbProb') || {}).value), o = Number(($('#cbOdds') || {}).value);
      erreurChamp('cbProb', ''); erreurChamp('cbOdds', '');
      var ko = false;
      if (!(p > 0 && p < 100)) { erreurChamp('cbProb', t('tools_page.err_probability_range', 'Entre une probabilité entre 0 et 100 %.')); ko = true; }
      if (!(o > 1)) { erreurChamp('cbOdds', t('tools_page.err_odds_gt_one', 'La cote doit être supérieure à 1.')); ko = true; }
      if (ko) return;
      // La cle vient du NOM DU MATCH normalise : deux selections saisies sur
      // le meme match declenchent alors l'alerte de correlation. Avec une cle
      // unique par ajout, cette alerte n'aurait jamais pu se declencher.
      var cle = (m || '').trim().toLowerCase().replace(/\s+/g, ' ');
      etat.combo.push({
        matchKey: cle || 'manuel-' + etat.combo.length,
        match: m || t('tools_page.combo_default_match', 'Sélection manuelle'), market: t('tools_page.combo_default_market', 'Saisie manuelle'), probability: p, odds: o
      });
      activer('combo');
    });
  }

  /* =====================================================================
     04 — JOURNAL   "Combien de mes paris sont passes ?"
     Paris notes, gagnes, perdus, taux de reussite. Aucun montant : ni mise,
     ni ROI, ni profit / perte (21/10/2026). La table betting_decisions exige
     toujours une colonne stake > 0 (migration 0010) : on y ecrit une valeur
     technique fixe (STAKE_TECHNIQUE), jamais saisie, jamais lue, jamais affichee.
     ===================================================================== */
  var STAKE_TECHNIQUE = 1;
  var STATUTS = {
    won: ['tools_page.journal_status_won', 'Gagné', 'text-cyan'],
    lost: ['tools_page.journal_status_lost', 'Perdu', 'text-[#ff8f85]'],
    void: ['tools_page.journal_status_void', 'Annulé', 'text-soft'],
    pending: ['tools_page.journal_status_pending', 'En attente', 'text-soft']
  };
  function ligneJournal(d) {
    // Ancienne ligne sans statut connu : « En attente », jamais une erreur.
    var st = d && Object.prototype.hasOwnProperty.call(STATUTS, d.status) ? STATUTS[d.status] : STATUTS.pending;
    var cote = Number(d && d.odds) > 1 ? num(d.odds, 2) : '—';
    return '<li class="flex items-center gap-3 border-t border-hairline py-3 first:border-t-0 sm:gap-4">'
      + '<div class="min-w-0 flex-1"><div class="truncate text-[14px] font-semibold text-ink">' + esc(d && d.match_label) + '</div>'
      + '<div class="truncate text-[12.5px] text-soft">' + esc(marcheLisible(d && d.market)) + '</div></div>'
      + '<div class="hidden w-[76px] shrink-0 text-right text-[13.5px] text-soft tabular-nums sm:block">' + cote + '</div>'
      // Sur mobile, la cote passe sous le resultat : un nom de marche long ne la masque jamais.
      + '<div class="w-[104px] shrink-0 text-right"><div class="text-[14px] font-bold ' + st[2] + '">' + esc(t(st[0], st[1])) + '</div>'
      + '<div class="text-[12px] text-soft tabular-nums sm:hidden">' + esc(t('tools_page.label_odds', 'Cote')) + ' ' + cote + '</div></div></li>';
  }
  function rendreJournal(panneau) {
    var head = enTete('Journal des décisions', 'Mesure les décisions enregistrées dans la durée : rien n’est calculé sur des données de démonstration.');

    if (!ctx.user) {
      panneau.innerHTML = head + vide(t('tools_page.journal_login_title', 'Connecte-toi pour ouvrir ton journal'),
        t('tools_page.journal_login_text', 'Le journal enregistre tes décisions et calcule ton taux de réussite. Il ne contient que tes propres données.'),
        '<a href="' + esc(lien('compte.html')) + '" class="mt-5 inline-flex rounded-xl bg-cyan px-6 py-3 text-[13px] font-extrabold text-page transition hover:brightness-110">' + esc(t('tools_page.journal_login_cta', 'Créer un compte')) + '</a>');
      return;
    }

    var s = D.summarize(etat.decisions);
    var bloc;
    if (!etat.decisions.length) {
      bloc = vide(t('tools_page.journal_empty_title', 'Aucune décision enregistrée'),
        t('tools_page.journal_empty_text', 'Ajoute ta première décision pour commencer à suivre ton taux de réussite. Aucun chiffre n’est affiché tant qu’il n’y a rien à mesurer.'),
        '<button id="jrAdd" type="button" class="mt-5 inline-flex rounded-xl bg-cyan px-6 py-3 text-[13px] font-extrabold text-page transition hover:brightness-110">' + esc(t('tools_page.journal_add_btn_first', 'Ajouter une décision')) + '</button>');
    } else {
      var lignes = etat.decisions.map(ligneJournal).join('');
      bloc = '<div class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">'
        + kpi(String(s.total), t('tools_page.journal_kpi_count', 'Décisions'))
        + kpi(String(s.won), t('tools_page.journal_kpi_won', 'Gagnés'))
        + kpi(String(s.lost), t('tools_page.journal_kpi_lost', 'Perdus'))
        // Aucun pari gagne ou perdu : pas de taux, un tiret (jamais un 0 % trompeur).
        + kpi(s.winRate == null ? '—' : num(s.winRate, 1) + '%', t('tools_page.journal_kpi_winrate', 'Taux de réussite'))
        + '</div>'
        + '<div class="' + S.carte + '">'
        + '<div class="mb-2 hidden items-center gap-3 border-b border-hairline pb-2 text-[11px] font-bold tracking-[0.1em] text-soft sm:flex sm:gap-4">'
        + '<span class="min-w-0 flex-1">' + esc(t('tools_page.journal_th_match_market', 'MATCH / MARCHÉ')) + '</span><span class="w-[76px] shrink-0 text-right">' + esc(t('tools_page.journal_th_odds', 'COTE')) + '</span><span class="w-[104px] shrink-0 text-right">' + esc(t('tools_page.journal_th_result', 'RÉSULTAT')) + '</span></div>'
        + '<ul class="list-none p-0">' + lignes + '</ul></div>'
        + '<button id="jrAdd" type="button" class="mt-4 rounded-xl border border-hairline px-4 py-2.5 text-[13px] font-semibold text-ink transition hover:border-cyan/40">' + esc(t('tools_page.journal_add_btn', '+ Ajouter une décision')) + '</button>';
    }

    panneau.innerHTML = head + bloc
      + '<p class="mt-5 text-[12.5px] leading-relaxed text-soft/85">' + t('tools_page.journal_clv_note', 'Le suivi de la <b class="text-soft">closing line value</b> (comparaison entre la cote prise et la cote de clôture) n’est pas encore disponible : les cotes de clôture ne sont pas collectées à ce jour.') + '</p>'
      + '<dialog id="jrDlg" class="w-[min(440px,92vw)] rounded-2xl border border-hairline bg-surface p-0 text-ink backdrop:bg-black/60">'
      + '<form method="dialog" class="p-6"><h3 class="text-[17px] font-bold text-ink">' + esc(t('tools_page.journal_dialog_title', 'Nouvelle décision')) + '</h3>'
      + '<div class="mt-4 space-y-3">'
      + champ('jrMatch', t('tools_page.label_match', 'Match'), { type: 'text', placeholder: 'PSG – Marseille' })
      + champ('jrMarket', t('tools_page.journal_market_label', 'Marché'), { type: 'text', placeholder: t('tools_page.journal_market_placeholder', 'Plus de 2,5 buts') })
      + champ('jrOdds', t('tools_page.label_odds', 'Cote'), { min: 1.01, step: 0.01, value: 1.90 })
      // Probabilite estimee : colonne obligatoire de betting_decisions (0 < p < 100).
      // BUG REEL (audit du 18/09/2026) : le formulaire ne l'envoyait pas, chaque
      // enregistrement du journal Pro echouait. Pre-remplie avec la probabilite
      // de la cote (100 / cote), modifiable ; suit la cote tant qu'elle n'est pas modifiee.
      + champ('jrProb', t('tools_page.journal_prob_label', 'Ta probabilité estimée'), { unit: '%', min: 1, max: 99, step: 0.1, value: 52.6, help: t('tools_page.journal_prob_help', 'Par défaut : la probabilité correspondant à la cote.') })
      + '</div><p id="jrMsg" class="mt-3 text-[12.5px] text-soft"></p>'
      + '<div class="mt-5 flex gap-3"><button value="cancel" class="flex-1 rounded-xl border border-hairline px-4 py-2.5 text-[13px] font-semibold text-ink">' + esc(t('tools_page.journal_cancel_btn', 'Annuler')) + '</button>'
      + '<button id="jrSave" type="button" class="flex-1 rounded-xl bg-cyan px-4 py-2.5 text-[13px] font-extrabold text-page">' + esc(t('tools_page.journal_save_btn', 'Enregistrer')) + '</button></div>'
      + '</form></dialog>';

    var dlg = document.getElementById('jrDlg');
    var open = document.getElementById('jrAdd');
    if (open && dlg) open.addEventListener('click', function () { dlg.showModal(); });
    var probEl = document.getElementById('jrProb'), oddsEl = document.getElementById('jrOdds'), probTouchee = false;
    if (probEl) probEl.addEventListener('input', function () { probTouchee = true; });
    if (oddsEl && probEl) oddsEl.addEventListener('input', function () {
      var c = Number(oddsEl.value);
      if (!probTouchee && c > 1) probEl.value = String(Math.round(1000 / c) / 10);
    });
    var save = document.getElementById('jrSave');
    if (save) save.addEventListener('click', function () {
      var msg = document.getElementById('jrMsg');
      if (!ctx.isPro) { if (msg) msg.textContent = t('tools_page.journal_pro_only_msg', 'Le journal synchronisé est réservé au plan Pro.'); return; }
      var row = {
        user_id: ctx.user.id,
        match_label: (($('#jrMatch') || {}).value || '').trim(),
        market: (($('#jrMarket') || {}).value || '').trim(),
        odds: Number(($('#jrOdds') || {}).value),
        estimated_probability: Number(($('#jrProb') || {}).value),
        stake: STAKE_TECHNIQUE
      };
      if (!row.match_label || !row.market || !(row.odds > 1) || !(row.estimated_probability > 0 && row.estimated_probability < 100)) {
        if (msg) msg.textContent = t('tools_page.journal_form_incomplete_prob_msg', 'Complète le match, le marché, une cote supérieure à 1 et une probabilité entre 1 et 99 %.');
        return;
      }
      window.IasharkApp.supabase.from('betting_decisions').insert(row).select().single().then(function (q) {
        // Jamais le message brut de la base (anglais, technique) a l'ecran.
        if (q.error) { if (msg) msg.textContent = t('tools_page.journal_save_error', 'Impossible d’enregistrer cette décision pour le moment. Vérifie les champs puis réessaie.'); return; }
        etat.decisions.unshift(q.data);
        if (dlg) dlg.close();
        activer('journal');
      });
    });
  }

  /* =====================================================================
     ROUTEUR
     ===================================================================== */
  var RENDU = { scanner: rendreScanner, fair: rendreFair, combo: rendreCombo, journal: rendreJournal };

  function activer(outil) {
    if (!RENDU[outil]) outil = 'scanner';
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

  // Un seul des deux blocs de pro.html existe a l'ecran : la page de vente
  // (#proVente, visiteur non abonne) ou les outils (#proOutils, abonne Pro).
  // data-pro-etat sur <html> : « attente » pose par le script du <head> quand une
  // session existe (assets/pro-vente.css masque alors la vente jusqu'a la reponse).
  function montrer(mode) {
    document.documentElement.setAttribute('data-pro-etat', mode);
    var vente = document.getElementById('proVente'), outils = document.getElementById('proOutils');
    if (vente) vente.hidden = mode === 'outils';
    if (outils) outils.hidden = mode !== 'outils';
  }

  // En-tete des outils, rendu seulement pour un abonne (un seul h1 a l'ecran).
  function teteOutils() {
    var el = document.getElementById('outilsTete');
    if (!el) return;
    el.innerHTML = '<h1 class="text-[clamp(26px,3.4vw,38px)] font-extrabold leading-[1.1] tracking-[-0.035em] text-ink">'
      + '<span>' + esc(t('tools_page.static_hero_title_pre', 'Vos outils. ')) + '</span>'
      + '<span class="text-cyan">' + esc(t('tools_page.static_hero_title_hl', 'Nos probabilités.')) + '</span></h1>'
      + '<p class="mt-3 max-w-2xl text-[15px] leading-relaxed text-soft">' + esc(t('pro_vente.tools_sub', 'Quatre outils qui partent des probabilités du modèle : détecter, évaluer, combiner, mesurer.')) + '</p>';
  }

  function init() {
    var ORDRE = ['scanner', 'fair', 'combo', 'journal'];
    $$('[data-tool]').forEach(function (b) {
      b.addEventListener('click', function () { activer(b.getAttribute('data-tool')); });
      // Motif ARIA "tabs" : les fleches deplacent la selection, Debut/Fin
      // sautent aux extremites. Sans ca, un utilisateur clavier doit tabuler
      // a travers tous les onglets pour atteindre le dernier.
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
    // pas de la langue.
    var contexte = Promise.resolve().then(function () { return window.IasharkApp.context(); });
    // Filet : sans reponse en 4 s, la page de vente s'affiche (jamais une page vide).
    var filet = setTimeout(function () {
      if (document.documentElement.getAttribute('data-pro-etat') === 'attente') montrer('vente');
    }, 4000);
    Promise.all([langue.catch(function () {}), contexte]).then(function (res) {
      var c = res[1];
      ctx = c || ctx;
      if (!ctx.isPro) return null;
      // Abonne confirme cote client : la liste de matchs part tout de suite, en
      // parallele du journal (le serveur tranche via isPro).
      chargerMatchs();
      return window.IasharkApp.supabase.from('betting_decisions').select('*').eq('user_id', ctx.user.id).order('created_at', { ascending: false }).limit(100)
        .then(function (q) { if (q && !q.error) etat.decisions = q.data || []; });
    }).catch(function () {}).then(function () {
      clearTimeout(filet);
      if (ctx.isPro) {
        montrer('outils');
        teteOutils();
        activer(RENDU[depart] ? depart : 'scanner');
        return;
      }
      montrer('vente');
      if (window.IasharkProVente) window.IasharkProVente.mount(document.getElementById('proVente'), { connecte: !!(ctx && ctx.user) });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
