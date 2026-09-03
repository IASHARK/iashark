/* =========================================================================
   IASHARK TOOL CENTER
   Six outils : detecter, evaluer, dimensionner, simuler, combiner, mesurer.

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
  var etat = { outil: 'scanner', matchs: null, decisions: [], prefs: null, bankroll: null, combo: [] };

  function $(sel, racine) { return (racine || document).querySelector(sel); }
  function $$(sel, racine) { return Array.prototype.slice.call((racine || document).querySelectorAll(sel)); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v, d) { return Number(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function euros(v) { return num(v, 0) + ' €'; }
  function signe(v, d) { return (v >= 0 ? '+' : '') + num(v, d == null ? 1 : d); }

  /* ---------------------------------------------------------------------
     DONNEES DE DEMONSTRATION
     Volontairement fictives et reconnaissables comme telles (Club A/B...).
     Elles ne doivent jamais pouvoir etre confondues avec une vraie analyse.
     --------------------------------------------------------------------- */
  var DEMO_SCAN = [
    { edge: 6.4, match: 'Club A – Club B', market: 'Moins de 1,5 but en 1re mi-temps', league: 'Championnat 1', modelProbability: 64.2, marketProbability: 57.8, fairOdds: 1.56, risk: 'Faible' },
    { edge: 4.1, match: 'Club C – Club D', market: 'Les deux equipes marquent', league: 'Championnat 2', modelProbability: 61.0, marketProbability: 56.9, fairOdds: 1.64, risk: 'Modere' },
    { edge: 3.2, match: 'Club E – Club F', market: 'Plus de 2,5 buts', league: 'Championnat 1', modelProbability: 55.4, marketProbability: 52.2, fairOdds: 1.81, risk: 'Modere' }
  ];
  var DEMO_COMBO = [
    { id: 'd1', matchKey: 'd1', match: 'Club A – Club B', market: 'Moins de 1,5 but 1re MT', probability: 64.2, odds: 1.73 },
    { id: 'd2', matchKey: 'd2', match: 'Club C – Club D', market: 'Les deux equipes marquent', probability: 61.0, odds: 1.72 },
    { id: 'd3', matchKey: 'd3', match: 'Club E – Club F', market: 'Plus de 2,5 buts', probability: 55.4, odds: 1.90 }
  ];

  /* ---------------------------------------------------------------------
     ACCES AUX DONNEES DE MATCH — passage oblige par le serveur.
     --------------------------------------------------------------------- */
  function chargerMatchs() {
    if (!ctx.isPro) return Promise.resolve(null);      // aucun appel pour un non-abonne
    if (etat.matchs) return Promise.resolve(etat.matchs);
    return window.IasharkApp.supabase.functions.invoke('match-data').then(function (r) {
      if (r.error || !r.data) return null;
      etat.matchs = (r.data.matchs || []).filter(function (m) { return m && m.pari_rec && !m.no_signal; });
      return etat.matchs;
    }).catch(function () { return null; });
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

  function enTete(titre, sous) {
    return '<header class="mb-6"><h2 class="' + S.titre + '">' + esc(titre) + '</h2>'
      + '<p class="' + S.sous + '">' + esc(sous) + '</p></header>';
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

  function bandeauDemo(texte) {
    return '<div class="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-hairline bg-panel/70 px-4 py-3">'
      + '<span class="rounded-full bg-soft/20 px-2.5 py-1 text-[10px] font-extrabold tracking-[0.12em] text-soft">MODE DÉMONSTRATION</span>'
      + '<span class="text-[13px] leading-snug text-soft">' + esc(texte) + '</span></div>';
  }

  // UN SEUL panneau d'abonnement par outil, sobre, en bas du workspace.
  function panneauPro(titre, sous) {
    if (ctx.isPro) return '';
    return '<div class="mt-6 rounded-2xl border border-cyan/25 bg-cyan/[0.05] p-5 sm:flex sm:items-center sm:gap-6">'
      + '<div class="min-w-0 flex-1"><div class="text-[10px] font-extrabold tracking-[0.16em] text-cyan">PRO</div>'
      + '<p class="mt-1.5 text-[14px] font-semibold text-ink">' + esc(titre) + '</p>'
      + '<p class="mt-1 text-[13px] leading-relaxed text-soft">' + esc(sous) + '</p></div>'
      + '<a href="/abonnement.html" class="mt-4 inline-flex shrink-0 items-center justify-center rounded-xl bg-cyan px-6 py-3 text-[13px] font-extrabold text-page transition hover:brightness-110 sm:mt-0">Débloquer Pro</a>'
      + '</div>';
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
  function ligneScan(r, i, reel) {
    var edge = '<div class="w-[74px] shrink-0 text-[17px] font-extrabold leading-none tracking-[-0.03em] text-cyan tabular-nums">'
      + signe(r.edge, 1) + '<span class="ml-1 text-[10px] font-bold tracking-normal text-soft">pts</span></div>';
    var titre = reel ? esc(r.match) : esc(r.match);
    var action = reel && r.id
      ? '<a href="/match/' + esc(r.id) + '.html" class="shrink-0 rounded-lg border border-hairline px-3 py-1.5 text-[12.5px] font-semibold text-ink transition hover:border-cyan/40 hover:text-cyan">Voir</a>'
      : '<span class="shrink-0 text-[12.5px] text-soft/60">—</span>';
    return '<li class="flex items-center gap-3 border-t border-hairline px-1 py-3 first:border-t-0 sm:gap-4">'
      + edge
      + '<div class="min-w-0 flex-1"><div class="truncate text-[14px] font-semibold text-ink">' + titre + '</div>'
      + '<div class="truncate text-[12.5px] text-soft">' + esc(r.market) + ' · ' + esc(r.league || '') + '</div></div>'
      + '<div class="hidden w-[76px] shrink-0 text-right sm:block"><div class="text-[14px] font-bold text-ink tabular-nums">' + num(r.modelProbability, 1) + '%</div><div class="text-[11px] text-soft">modèle</div></div>'
      + '<div class="hidden w-[76px] shrink-0 text-right sm:block"><div class="text-[14px] font-semibold text-soft tabular-nums">' + (r.marketProbability != null ? num(r.marketProbability, 1) + '%' : '—') + '</div><div class="text-[11px] text-soft">marché</div></div>'
      + action + '</li>';
  }

  function rendreScanner(panneau) {
    var html = enTete('Value Scanner', 'Les écarts les plus significatifs détectés aujourd’hui entre le modèle et le marché.');

    if (!ctx.isPro) {
      // Aucun vrai match n'est charge ni rendu : uniquement la structure et
      // un exemple explicitement fictif.
      html += bandeauDemo('Ces trois lignes sont fictives et servent uniquement à montrer la structure de l’outil.')
        + '<div class="' + S.carte + '"><ul class="list-none p-0">'
        + DEMO_SCAN.map(function (r, i) { return ligneScan(r, i, false); }).join('')
        + '</ul></div>'
        + '<div class="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">'
        + kpi('13', 'Championnats analysés chaque jour')
        + kpi('4', 'Modèles croisés par match')
        + kpi('1', 'Analyse complète offerte par jour')
        + '</div>'
        + panneauPro('Le scanner classe tous les marchés du jour par écart.',
            'Les matchs, marchés, probabilités et cotes réels sont servis uniquement aux abonnés.');
      panneau.innerHTML = html;
      return;
    }

    html += '<div class="mb-4 flex flex-wrap items-end gap-3">'
      + '<div class="w-[180px]">' + select('scanEdge', 'Écart minimum', [['0', 'Tout afficher'], ['3', '3 points ou plus'], ['5', '5 points ou plus'], ['10', '10 points ou plus']], '3') + '</div>'
      + '<div class="w-[180px]">' + select('scanTri', 'Trier par', [['edge', 'Écart décroissant'], ['heure', 'Heure du match']], 'edge') + '</div>'
      + '</div><div id="scanBox" class="' + S.carte + '"><p class="py-8 text-center text-[13.5px] text-soft">Chargement des marchés du jour…</p></div>';
    panneau.innerHTML = html;

    chargerMatchs().then(function (matchs) {
      var box = $('#scanBox', panneau);
      if (!box) return;
      if (!matchs || !matchs.length) {
        box.innerHTML = vide('Aucune donnée disponible', 'Les analyses du jour ne sont pas encore publiées, ou la connexion a échoué.');
        return;
      }
      function peindre() {
        var minEdge = parseFloat(($('#scanEdge') || {}).value || '3');
        var tri = ($('#scanTri') || {}).value || 'edge';
        var rows = D.scanValue(matchs, { minEdge: minEdge }) || [];
        if (tri === 'heure') rows = rows.slice().sort(function (a, b) { return String(a.date || '') < String(b.date || '') ? -1 : 1; });
        rows = rows.slice(0, 15);
        box.innerHTML = rows.length
          ? '<ul class="list-none p-0">' + rows.map(function (r, i) { return ligneScan(r, i, true); }).join('') + '</ul>'
          : vide('Aucun marché au-dessus de ce seuil', 'C’est une information en soi : aujourd’hui, le marché est aligné sur nos calculs.');
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
    panneau.innerHTML = enTete('Fair Odds', 'Compare la probabilité que tu estimes au prix réellement proposé par le bookmaker.')
      + '<div class="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">'
      + '<div class="' + S.carte + ' space-y-4">'
      + champ('foProb', 'Probabilité estimée', { unit: '%', min: 0.1, max: 99.9, step: 0.1, value: 58, help: 'Ta propre estimation, ou celle d’une analyse IASHARK.' })
      + champ('foOdds', 'Cote disponible', { min: 1.01, step: 0.01, value: 1.90, help: 'La cote décimale proposée par le bookmaker.' })
      + '</div>'
      + '<div id="foOut" class="min-w-0"></div></div>'
      + panneauPro('Utilise les probabilités du modèle plutôt que les tiennes.',
          'Les abonnés retrouvent la probabilité IASHARK directement dans chaque analyse.');

    function calculer() {
      var p = document.getElementById('foProb'), o = document.getElementById('foOdds');
      var out = document.getElementById('foOut');
      if (!p || !o || !out) return;
      erreurChamp('foProb', ''); erreurChamp('foOdds', '');
      var vp = Number(p.value), vo = Number(o.value);
      var ko = false;
      if (!(vp > 0 && vp < 100)) { erreurChamp('foProb', 'Entre une probabilité entre 0 et 100 %.'); ko = true; }
      if (!(vo > 1)) { erreurChamp('foOdds', 'La cote décimale doit être supérieure à 1.'); ko = true; }
      if (ko) { out.innerHTML = vide('Résultat indisponible', 'Corrige les champs signalés pour lancer le calcul.'); return; }

      var r = D.fairOdds({ probability: vp, odds: vo });
      var note = r.favourable
        ? 'La cote proposée est <b class="text-ink">plus généreuse</b> que ta probabilité ne le justifie : c’est un écart en ta faveur.'
        : 'La cote proposée est <b class="text-ink">moins intéressante</b> que ta probabilité ne le justifie. Le pari est défavorable sur la durée.';
      var largeurMax = Math.max(r.estimatedProbability, r.impliedProbability, 1);
      out.innerHTML = resultat('Écart', signe(r.edgePoints, 1) + ' pts', note, r.favourable ? 'pos' : 'neg')
        + '<div class="' + S.carte + ' mt-4">'
        + barreProb('Ta probabilité estimée', r.estimatedProbability, r.estimatedProbability / largeurMax * 100, true)
        + barreProb('Probabilité implicite de la cote', r.impliedProbability, r.impliedProbability / largeurMax * 100, false)
        + '<p class="mt-3 border-t border-hairline pt-3 text-[13px] leading-relaxed text-soft">Un écart positif signifie que tu estimes l’événement plus probable que ne le fait le prix affiché.</p>'
        + '</div>'
        + '<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">'
        + kpi(num(r.fairOdds, 2), 'Cote juste')
        + kpi(num(r.marketOdds, 2), 'Cote disponible')
        + kpi(signe(r.expectedValue, 1) + '%', 'Espérance théorique', r.expectedValue >= 0 ? 'pos' : 'neg')
        + '</div>';
    }
    ['foProb', 'foOdds'].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.addEventListener('input', calculer);
    });
    calculer();
  }

  /* =====================================================================
     03 — STAKE PLANNER   "Quelle mise est coherente avec mon capital ?"
     Les limites personnelles ALERTENT mais ne modifient jamais les calculs.
     ===================================================================== */
  function rendreStake(panneau) {
    var bk = etat.bankroll || 1000;
    var plafondJour = etat.prefs && etat.prefs.daily_exposure_pct != null ? Number(etat.prefs.daily_exposure_pct) : 5;
    var stopLoss = etat.prefs && etat.prefs.stop_loss_pct != null ? Number(etat.prefs.stop_loss_pct) : 10;

    panneau.innerHTML = enTete('Stake Planner', 'Dimensionne la mise à partir de ton capital, de la cote et de ton profil de risque.')
      + '<div class="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">'
      + '<div class="' + S.carte + ' space-y-4">'
      + champ('spBank', 'Capital disponible', { unit: '€', min: 1, step: 1, value: bk })
      + champ('spOdds', 'Cote décimale', { min: 1.01, step: 0.01, value: 2.10 })
      + champ('spProb', 'Probabilité estimée', { unit: '%', min: 0.1, max: 99.9, step: 0.1, value: 55 })
      + select('spProfil', 'Profil de risque', [['0.25', 'Prudent · quart de Kelly'], ['0.5', 'Équilibré · demi-Kelly'], ['1', 'Dynamique · Kelly plafonné']], '0.5')
      + champ('spCap', 'Plafond par décision', { unit: '%', min: 0.5, max: 100, step: 0.5, value: plafondJour, help: 'Ta limite personnelle. Elle plafonne la mise, elle ne change jamais la probabilité.' })
      + (ctx.user ? '<button id="spSave" type="button" class="w-full rounded-xl border border-hairline px-4 py-2.5 text-[13px] font-semibold text-ink transition hover:border-cyan/40">Enregistrer le capital</button><span id="spMsg" class="block text-[12.5px] text-soft"></span>' : '')
      + '</div>'
      + '<div id="spOut" class="min-w-0"></div></div>'
      + '<p class="mt-5 text-[12.5px] leading-relaxed text-soft/85">Le critère de Kelly maximise la croissance du capital <b class="text-soft">si</b> la probabilité saisie est juste. Il ne garantit aucun gain : une probabilité surestimée conduit à surmiser.</p>'
      + (stopLoss ? '<p class="mt-2 text-[12.5px] text-soft/85">Ton seuil d’arrêt personnel est fixé à −' + num(stopLoss, 0) + ' % du capital.</p>' : '');

    function calculer() {
      var out = document.getElementById('spOut'); if (!out) return;
      ['spBank', 'spOdds', 'spProb', 'spCap'].forEach(function (id) { erreurChamp(id, ''); });
      var b = Number(($('#spBank') || {}).value), o = Number(($('#spOdds') || {}).value),
          p = Number(($('#spProb') || {}).value), f = Number(($('#spProfil') || {}).value),
          cap = Number(($('#spCap') || {}).value);
      var ko = false;
      if (!(b > 0)) { erreurChamp('spBank', 'Le capital doit être supérieur à 0.'); ko = true; }
      if (!(o > 1)) { erreurChamp('spOdds', 'La cote doit être supérieure à 1.'); ko = true; }
      if (!(p > 0 && p < 100)) { erreurChamp('spProb', 'Entre une probabilité entre 0 et 100 %.'); ko = true; }
      if (!(cap > 0 && cap <= 100)) { erreurChamp('spCap', 'Le plafond doit être entre 0 et 100 %.'); ko = true; }
      if (ko) { out.innerHTML = vide('Calcul impossible', 'Corrige les champs signalés.'); return; }

      var brut = D.calculateStake({ bankroll: b, odds: o, probability: p, fraction: f, cap: 1 });
      var plafonne = D.calculateStake({ bankroll: b, odds: o, probability: p, fraction: f, cap: cap / 100 });
      if (!brut || !plafonne) { out.innerHTML = vide('Calcul impossible', 'Vérifie les valeurs saisies.'); return; }

      var limite = brut.bankrollPct > plafonne.bankrollPct + 0.01;
      var note = !plafonne.hasEdge
        ? 'À cette cote et cette probabilité, le pari n’a <b class="text-ink">aucun avantage mathématique</b> : la mise cohérente est nulle.'
        : limite
          ? 'Le calcul brut suggère <b class="text-ink">' + euros(brut.stake) + '</b> (' + num(brut.bankrollPct, 1) + ' % du capital). Ton plafond personnel ramène la mise à ' + euros(plafonne.stake) + '.'
          : 'Cette mise représente ' + num(plafonne.bankrollPct, 1) + ' % de ton capital et reste sous ton plafond personnel.';

      out.innerHTML = resultat('Mise recommandée', euros(plafonne.stake), note, plafonne.hasEdge ? 'pos' : 'neutre')
        + '<div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">'
        + kpi(num(plafonne.bankrollPct, 1) + '%', 'du capital')
        + kpi(signe(plafonne.expectedValue, 1) + '%', 'Espérance par pari', plafonne.expectedValue >= 0 ? 'pos' : 'neg')
        + kpi(num(brut.bankrollPct, 1) + '%', 'Kelly avant plafond')
        + '</div>'
        + (limite ? '<div class="mt-4 rounded-xl border border-[#f5a524]/30 bg-[#f5a524]/[0.07] px-4 py-3 text-[13px] leading-relaxed text-soft"><b class="text-ink">Limite atteinte.</b> Le calcul dépasse ton plafond de ' + num(cap, 1) + ' % par décision. La mise a été réduite, la probabilité n’a pas été touchée.</div>' : '');
    }
    ['spBank', 'spOdds', 'spProb', 'spProfil', 'spCap'].forEach(function (id) {
      var n = document.getElementById(id);
      if (n) n.addEventListener('input', calculer);
      if (n && n.tagName === 'SELECT') n.addEventListener('change', calculer);
    });
    var save = document.getElementById('spSave');
    if (save) save.addEventListener('click', function () {
      var v = Number(($('#spBank') || {}).value), msg = document.getElementById('spMsg');
      if (!(v > 0)) { if (msg) msg.textContent = 'Montant invalide.'; return; }
      window.IasharkApp.supabase.from('users').update({ capital: v }).eq('id', ctx.user.id).then(function (q) {
        if (msg) msg.textContent = q.error ? q.error.message : 'Capital enregistré.';
        if (!q.error) etat.bankroll = v;
      });
    });
    calculer();
  }

  /* =====================================================================
     04 — BANKROLL LAB   "A quoi peut ressembler mon capital sur la duree ?"
     Monte-Carlo local (aucun appel serveur). Le graphique montre la MEDIANE
     et une bande de percentiles : l'objectif est de rendre l'incertitude
     visible, pas d'empiler 5 000 courbes illisibles.
     ===================================================================== */
  function graphique(courbe, depart) {
    if (!courbe || courbe.length < 2) return '';
    var W = 640, H = 220, P = 8;
    var vals = courbe.reduce(function (a, c) { return a.concat([c.p05, c.p95]); }, [depart]);
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
    if (max - min < 1) max = min + 1;
    var x = function (i) { return P + i * (W - 2 * P) / (courbe.length - 1); };
    var y = function (v) { return H - P - (v - min) / (max - min) * (H - 2 * P); };
    var haut = courbe.map(function (c, i) { return x(i) + ',' + y(c.p95); }).join(' ');
    var bas = courbe.map(function (c, i) { return x(i) + ',' + y(c.p05); }).reverse().join(' ');
    var med = courbe.map(function (c, i) { return (i ? 'L' : 'M') + x(i) + ' ' + y(c.p50); }).join(' ');
    var ligneDepart = y(depart);
    return '<figure class="' + S.carte + ' mt-4">'
      + '<figcaption class="mb-3 text-[13px] text-soft">Trajectoire simulée du capital — <b class="text-ink">médiane</b> et bande couvrant 90 % des scénarios.</figcaption>'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" class="h-[200px] w-full" role="img" aria-label="Graphique de simulation du capital : ligne médiane et bande de percentiles.">'
      + '<polygon points="' + haut + ' ' + bas + '" fill="rgba(32,213,239,.12)"/>'
      + '<line x1="' + P + '" x2="' + (W - P) + '" y1="' + ligneDepart + '" y2="' + ligneDepart + '" stroke="rgba(166,180,198,.35)" stroke-dasharray="4 4"/>'
      + '<path d="' + med + '" fill="none" stroke="#20d5ef" stroke-width="2" stroke-linejoin="round"/>'
      + '</svg>'
      + '<div class="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-soft">'
      + '<span><span aria-hidden="true" class="mr-1.5 inline-block h-[2px] w-4 align-middle" style="background:#20d5ef"></span>Scénario médian</span>'
      + '<span><span aria-hidden="true" class="mr-1.5 inline-block h-2.5 w-4 align-middle" style="background:rgba(32,213,239,.2)"></span>5 % – 95 % des cas</span>'
      + '<span><span aria-hidden="true" class="mr-1.5 inline-block h-[2px] w-4 align-middle" style="background:rgba(166,180,198,.5)"></span>Capital de départ</span>'
      + '</div></figure>';
  }

  function rendreBankroll(panneau) {
    panneau.innerHTML = enTete('Bankroll Lab', 'Rejoue des milliers de séries à partir de tes hypothèses et montre la dispersion réelle.')
      + '<div class="grid grid-cols-1 gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">'
      + '<div class="' + S.carte + ' space-y-4">'
      + champ('blBank', 'Capital de départ', { unit: '€', min: 1, step: 1, value: etat.bankroll || 1000 })
      + champ('blStake', 'Mise par décision', { unit: '%', min: 0.1, max: 20, step: 0.1, value: 3 })
      + champ('blBets', 'Nombre de décisions', { min: 10, max: 2000, step: 10, value: 300 })
      + champ('blWin', 'Taux de réussite estimé', { unit: '%', min: 1, max: 99, step: 0.1, value: 54 })
      + champ('blOdds', 'Cote moyenne', { min: 1.01, step: 0.01, value: 1.80 })
      + '</div><div id="blOut" class="min-w-0"></div></div>';

    function lancer() {
      var out = document.getElementById('blOut'); if (!out) return;
      ['blBank', 'blStake', 'blBets', 'blWin', 'blOdds'].forEach(function (id) { erreurChamp(id, ''); });
      var b = Number(($('#blBank') || {}).value), s = Number(($('#blStake') || {}).value),
          n = Number(($('#blBets') || {}).value), w = Number(($('#blWin') || {}).value),
          o = Number(($('#blOdds') || {}).value);
      var ko = false;
      if (!(b > 0)) { erreurChamp('blBank', 'Le capital doit être supérieur à 0.'); ko = true; }
      if (!(s > 0 && s <= 20)) { erreurChamp('blStake', 'La mise doit être entre 0 et 20 %.'); ko = true; }
      if (!(n >= 10 && n <= 2000)) { erreurChamp('blBets', 'Entre 10 et 2000 décisions.'); ko = true; }
      if (!(w > 0 && w < 100)) { erreurChamp('blWin', 'Entre un taux entre 0 et 100 %.'); ko = true; }
      if (!(o > 1)) { erreurChamp('blOdds', 'La cote doit être supérieure à 1.'); ko = true; }
      if (ko) { out.innerHTML = vide('Simulation impossible', 'Corrige les champs signalés.'); return; }

      out.innerHTML = '<div class="' + S.carte + ' animate-pulse"><div class="h-[42px] w-2/3 rounded bg-panel"></div><div class="mt-4 h-[200px] rounded bg-panel"></div></div>';
      window.requestAnimationFrame(function () {
        var r = D.simulateVariance({ bankroll: b, stakePct: s, bets: n, winRate: w, odds: o, runs: 5000, curve: true });
        if (!r) { out.innerHTML = vide('Simulation impossible', 'Vérifie les valeurs saisies.'); return; }
        var ev = (w / 100) * o - 1;
        var note = ev < 0
          ? 'Chaque décision a une espérance de <b class="text-ink">' + signe(ev * 100, 1) + ' %</b>. Elle est négative : aucune gestion de mise ne rend cette série gagnante sur la durée.'
          : 'Chaque décision a une espérance de <b class="text-ink">' + signe(ev * 100, 1) + ' %</b>. La bande montre le creux qu’il faut pouvoir traverser sans dévier.';
        out.innerHTML = resultat('Capital médian après ' + num(n, 0) + ' décisions', euros(r.median), note, r.median >= b ? 'pos' : 'neg')
          + graphique(r.curve, b)
          + '<div class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">'
          + kpi(euros(r.p05), 'Scénario défavorable (5 %)')
          + kpi(euros(r.p95), 'Scénario favorable (5 %)')
          + kpi(num(r.drawdown30Probability, 0) + '%', 'Risque de baisse de 30 %', r.drawdown30Probability > 40 ? 'neg' : '')
          + kpi(num(r.halfBankrollProbability, 0) + '%', 'Risque de perdre la moitié', r.halfBankrollProbability > 20 ? 'neg' : '')
          + '</div>'
          + '<p class="mt-4 text-[12.5px] leading-relaxed text-soft/85">Simulation de 5 000 séries à partir des hypothèses saisies ci-contre. Ce ne sont pas des résultats observés, mais la dispersion que produirait ce profil de mise.</p>';
      });
    }
    ['blBank', 'blStake', 'blBets', 'blWin', 'blOdds'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', lancer);
    });
    lancer();
  }

  /* =====================================================================
     05 — COMBO AUDITOR   "Ce combine est-il coherent mathematiquement ?"
     ===================================================================== */
  function rendreCombo(panneau) {
    var reel = ctx.isPro;
    panneau.innerHTML = enTete('Combo Auditor', 'Mesure ce qu’un combiné retire réellement à ton espérance de gain.')
      + (reel ? '' : bandeauDemo('Les trois sélections ci-dessous sont fictives et servent à montrer le fonctionnement de l’outil.'))
      + '<div class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">'
      + '<div><div id="cbList" class="' + S.carte + '"><p class="py-6 text-center text-[13.5px] text-soft">Chargement…</p></div>'
      + '<div class="' + S.carte + ' mt-4"><p class="mb-3 text-[13px] font-semibold text-ink">Ajouter une sélection manuelle</p>'
      + '<div class="grid grid-cols-1 gap-3 sm:grid-cols-3">'
      + champ('cbMatch', 'Match', { type: 'text', placeholder: 'Équipe A – Équipe B' })
      + champ('cbProb', 'Probabilité', { unit: '%', min: 0.1, max: 99.9, step: 0.1, value: 60 })
      + champ('cbOdds', 'Cote', { min: 1.01, step: 0.01, value: 1.80 })
      + '</div><button id="cbAdd" type="button" class="mt-3 rounded-xl border border-hairline px-4 py-2.5 text-[13px] font-semibold text-ink transition hover:border-cyan/40">Ajouter au combiné</button></div></div>'
      + '<div id="cbOut" class="min-w-0"></div></div>'
      + panneauPro('Compose ton combiné à partir des analyses du jour.',
          'Les abonnés cochent directement les sélections réelles au lieu de les saisir à la main.');

    function sourceListe() {
      if (!reel) return Promise.resolve(DEMO_COMBO);
      return chargerMatchs().then(function (matchs) {
        return (matchs || []).filter(function (m) {
          return Number(m.model_probability) > 0 && Number(m.cote_rec) > 1;
        }).slice(0, 12).map(function (m) {
          return {
            id: String(m.id), matchKey: String(m.id),
            match: (m.home && m.home.n) + ' – ' + (m.away && m.away.n),
            market: m.pari_rec, probability: Number(m.model_probability), odds: Number(m.cote_rec)
          };
        });
      });
    }

    sourceListe().then(function (liste) {
      var box = document.getElementById('cbList');
      if (!box) return;
      if (!liste.length) { box.innerHTML = vide('Aucune sélection disponible', 'Les analyses du jour ne sont pas encore publiées.'); return; }
      box.innerHTML = '<ul class="list-none p-0">' + liste.map(function (s, i) {
        return '<li class="border-t border-hairline first:border-t-0"><label class="flex cursor-pointer items-center gap-3 py-3">'
          + '<input type="checkbox" data-cb="' + i + '" class="h-4 w-4 shrink-0 accent-[#20d5ef]">'
          + '<span class="min-w-0 flex-1"><span class="block truncate text-[14px] font-semibold text-ink">' + esc(s.match) + '</span>'
          + '<span class="block truncate text-[12.5px] text-soft">' + esc(s.market) + ' · ' + num(s.probability, 1) + ' % estimés</span></span>'
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
        out.innerHTML = vide('Sélectionne au moins deux paris', 'Un combiné se juge sur la multiplication des probabilités : il en faut au moins deux.');
        return;
      }
      var r = D.combo(picks.map(function (s) { return { probability: s.probability, odds: s.odds, label: s.market }; }));
      var risque = D.comboRisk(picks);
      if (!r) { out.innerHTML = vide('Calcul impossible', 'Vérifie les probabilités et les cotes.'); return; }
      var note = r.worseThanSingle
        ? 'Ce combiné rapporte <b class="text-ink">moins</b> que le meilleur de ces paris joué seul (' + signe(r.bestSingleEv, 1) + ' % d’espérance).'
        : 'Espérance du meilleur pari joué seul : ' + signe(r.bestSingleEv, 1) + ' %. Un combiné reste plus volatil : toutes les sélections doivent passer.';
      out.innerHTML = resultat('Espérance du combiné', signe(r.expectedValue, 1) + '%', note, r.expectedValue >= 0 ? 'pos' : 'neg')
        + '<div class="mt-4 grid grid-cols-2 gap-3">'
        + kpi(num(r.probability, 1) + '%', 'Probabilité combinée')
        + kpi(num(r.fairOdds, 2), 'Cote juste estimée')
        + kpi(num(r.bookOdds, 2), 'Cote du combiné')
        + kpi(String(picks.length), 'Sélections')
        + '</div>'
        + (risque.correlated
          ? '<div class="mt-4 rounded-xl border border-[#f5a524]/30 bg-[#f5a524]/[0.07] px-4 py-3 text-[13px] leading-relaxed text-soft"><b class="text-ink">Ces sélections peuvent être corrélées.</b> Plusieurs portent sur le même match. Le calcul suppose des événements indépendants : il peut surestimer ou sous-estimer la probabilité réelle. Nous ne disposons pas de mesure de dépendance entre marchés.</div>'
          : '');
    }

    var add = document.getElementById('cbAdd');
    if (add) add.addEventListener('click', function () {
      var m = ($('#cbMatch') || {}).value, p = Number(($('#cbProb') || {}).value), o = Number(($('#cbOdds') || {}).value);
      erreurChamp('cbProb', ''); erreurChamp('cbOdds', '');
      var ko = false;
      if (!(p > 0 && p < 100)) { erreurChamp('cbProb', 'Entre une probabilité entre 0 et 100 %.'); ko = true; }
      if (!(o > 1)) { erreurChamp('cbOdds', 'La cote doit être supérieure à 1.'); ko = true; }
      if (ko) return;
      // La cle vient du NOM DU MATCH normalise : deux selections saisies sur
      // le meme match declenchent alors l'alerte de correlation. Avec une cle
      // unique par ajout, cette alerte n'aurait jamais pu se declencher.
      var cle = (m || '').trim().toLowerCase().replace(/\s+/g, ' ');
      etat.combo.push({
        matchKey: cle || 'manuel-' + etat.combo.length,
        match: m || 'Sélection manuelle', market: 'Saisie manuelle', probability: p, odds: o
      });
      activer('combo');
    });
  }

  /* =====================================================================
     06 — JOURNAL / PERFORMANCE   "Mes decisions sont-elles bonnes ?"
     ===================================================================== */
  function rendreJournal(panneau) {
    var head = enTete('Journal de décisions', 'Mesure tes décisions dans la durée : rien n’est calculé sur des données de démonstration.');

    if (!ctx.user) {
      panneau.innerHTML = head + vide('Connecte-toi pour ouvrir ton journal',
        'Le journal enregistre tes décisions et calcule ta performance réelle. Il ne contient que tes propres données.',
        '<a href="/compte.html" class="mt-5 inline-flex rounded-xl bg-cyan px-6 py-3 text-[13px] font-extrabold text-page transition hover:brightness-110">Créer un compte</a>');
      return;
    }

    var s = D.summarize(etat.bankroll, etat.decisions);
    var bloc;
    if (!etat.decisions.length) {
      bloc = vide('Aucune décision enregistrée',
        'Ajoute ta première décision pour commencer à mesurer ta performance. Aucun chiffre n’est affiché tant qu’il n’y a rien à mesurer.',
        '<button id="jrAdd" type="button" class="mt-5 inline-flex rounded-xl bg-cyan px-6 py-3 text-[13px] font-extrabold text-page transition hover:brightness-110">Ajouter une décision</button>');
    } else {
      var lignes = etat.decisions.map(function (d) {
        var pl = d.result_pnl == null ? D.pnl(d) : Number(d.result_pnl);
        var badge = d.status === 'won' ? 'text-cyan' : d.status === 'lost' ? 'text-[#ff8f85]' : 'text-soft';
        return '<li class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-hairline py-3 first:border-t-0 sm:grid-cols-[minmax(0,1fr)_80px_80px_90px]">'
          + '<div class="min-w-0"><div class="truncate text-[14px] font-semibold text-ink">' + esc(d.match_label) + '</div>'
          + '<div class="truncate text-[12.5px] text-soft">' + esc(d.market) + '</div></div>'
          + '<div class="hidden text-right text-[13.5px] text-soft tabular-nums sm:block">' + num(d.odds, 2) + '</div>'
          + '<div class="hidden text-right text-[13.5px] text-soft tabular-nums sm:block">' + euros(d.stake) + '</div>'
          + '<div class="text-right text-[14px] font-bold ' + badge + ' tabular-nums">' + (d.status === 'pending' ? '—' : signe(pl, 0) + ' €') + '</div></li>';
      }).join('');
      bloc = '<div class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">'
        + kpi(String(s.total), 'Décisions')
        + kpi(signe(s.roi, 1) + '%', 'ROI', s.roi >= 0 ? 'pos' : 'neg')
        + kpi(signe(s.profit, 0) + ' €', 'Profit / perte', s.profit >= 0 ? 'pos' : 'neg')
        + kpi(num(s.winRate, 1) + '%', 'Taux de réussite')
        + '</div>'
        + '<div class="' + S.carte + '">'
        + '<div class="mb-2 hidden grid-cols-[minmax(0,1fr)_80px_80px_90px] gap-3 border-b border-hairline pb-2 text-[11px] font-bold tracking-[0.1em] text-soft sm:grid">'
        + '<span>MATCH / MARCHÉ</span><span class="text-right">COTE</span><span class="text-right">MISE</span><span class="text-right">P/L</span></div>'
        + '<ul class="list-none p-0">' + lignes + '</ul></div>'
        + '<button id="jrAdd" type="button" class="mt-4 rounded-xl border border-hairline px-4 py-2.5 text-[13px] font-semibold text-ink transition hover:border-cyan/40">+ Ajouter une décision</button>';
    }

    panneau.innerHTML = head + bloc
      + '<p class="mt-5 text-[12.5px] leading-relaxed text-soft/85">Le suivi de la <b class="text-soft">closing line value</b> (comparaison entre la cote prise et la cote de clôture) n’est pas encore disponible : les cotes de clôture ne sont pas collectées à ce jour.</p>'
      + (ctx.isPro ? '' : panneauPro('Le journal synchronisé est réservé aux abonnés.', 'Tes décisions sont conservées et ta performance calculée dans la durée.'))
      + '<dialog id="jrDlg" class="w-[min(440px,92vw)] rounded-2xl border border-hairline bg-surface p-0 text-ink backdrop:bg-black/60">'
      + '<form method="dialog" class="p-6"><h3 class="text-[17px] font-bold text-ink">Nouvelle décision</h3>'
      + '<div class="mt-4 space-y-3">'
      + champ('jrMatch', 'Match', { type: 'text', placeholder: 'PSG – Marseille' })
      + champ('jrMarket', 'Marché', { type: 'text', placeholder: 'Plus de 2,5 buts' })
      + champ('jrOdds', 'Cote', { min: 1.01, step: 0.01, value: 1.90 })
      + champ('jrStake', 'Mise', { unit: '€', min: 0.01, step: 0.01 })
      + '</div><p id="jrMsg" class="mt-3 text-[12.5px] text-soft"></p>'
      + '<div class="mt-5 flex gap-3"><button value="cancel" class="flex-1 rounded-xl border border-hairline px-4 py-2.5 text-[13px] font-semibold text-ink">Annuler</button>'
      + '<button id="jrSave" type="button" class="flex-1 rounded-xl bg-cyan px-4 py-2.5 text-[13px] font-extrabold text-page">Enregistrer</button></div>'
      + '</form></dialog>';

    var dlg = document.getElementById('jrDlg');
    var open = document.getElementById('jrAdd');
    if (open && dlg) open.addEventListener('click', function () { dlg.showModal(); });
    var save = document.getElementById('jrSave');
    if (save) save.addEventListener('click', function () {
      var msg = document.getElementById('jrMsg');
      if (!ctx.isPro) { if (msg) msg.textContent = 'Le journal synchronisé est réservé au plan Pro.'; return; }
      var row = {
        user_id: ctx.user.id,
        match_label: (($('#jrMatch') || {}).value || '').trim(),
        market: (($('#jrMarket') || {}).value || '').trim(),
        odds: Number(($('#jrOdds') || {}).value),
        stake: Number(($('#jrStake') || {}).value)
      };
      if (!row.match_label || !row.market || !(row.stake > 0) || !(row.odds > 1)) {
        if (msg) msg.textContent = 'Complète le match, le marché, une cote > 1 et une mise > 0.';
        return;
      }
      window.IasharkApp.supabase.from('betting_decisions').insert(row).select().single().then(function (q) {
        if (q.error) { if (msg) msg.textContent = q.error.message; return; }
        etat.decisions.unshift(q.data);
        if (dlg) dlg.close();
        activer('journal');
      });
    });
  }

  /* =====================================================================
     ROUTEUR
     ===================================================================== */
  var RENDU = { scanner: rendreScanner, fair: rendreFair, stake: rendreStake, bankroll: rendreBankroll, combo: rendreCombo, journal: rendreJournal };

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

  function pied() {
    var el = document.getElementById('sidebarFoot');
    if (!el) return;
    el.innerHTML = etat.bankroll
      ? '<div class="px-3"><div class="text-[11px] font-bold tracking-[0.14em] text-soft">CAPITAL</div>'
        + '<div class="mt-1 text-[18px] font-extrabold text-ink tabular-nums">' + euros(etat.bankroll) + '</div></div>'
      : '';
  }

  function init() {
    var ORDRE = ['scanner', 'fair', 'stake', 'bankroll', 'combo', 'journal'];
    $$('[data-tool]').forEach(function (b) {
      b.addEventListener('click', function () { activer(b.getAttribute('data-tool')); });
      // Motif ARIA "tabs" : les fleches deplacent la selection, Debut/Fin
      // sautent aux extremites. Sans ca, un utilisateur clavier doit tabuler
      // a travers les six onglets pour atteindre le dernier.
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
    window.IasharkApp.context().then(function (c) {
      ctx = c || ctx;
      if (c && c.profile && c.profile.capital) etat.bankroll = Number(c.profile.capital);
      if (!c || !c.user) return null;
      return Promise.all([
        window.IasharkApp.supabase.from('user_preferences').select('daily_exposure_pct,stop_loss_pct').eq('user_id', c.user.id).maybeSingle(),
        window.IasharkApp.supabase.from('betting_decisions').select('*').eq('user_id', c.user.id).order('created_at', { ascending: false }).limit(100)
      ]).then(function (res) {
        if (res[0] && res[0].data) etat.prefs = res[0].data;
        if (res[1] && !res[1].error) etat.decisions = res[1].data || [];
      });
    }).catch(function () {}).then(function () {
      pied();
      activer(RENDU[depart] ? depart : 'scanner');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
