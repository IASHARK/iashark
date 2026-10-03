/* IASHARK — rendu d'une « Sélection Pro du jour » (03/10/2026).

   UNE SEULE SOURCE avec le message Telegram : memes lignes de public.pro_paris (RLS 0040 : paris
   PUBLIES et ENVOYES du mode ouvert, colonnes accordees seulement, jamais « select * »), memes
   phrases que le robot (supabase/functions/_shared/canal-pro.mjs#blocPari, #chanceTxt).

   Copie fidele du rendu ecrit pour la page match (match-page.js, bloc « Sélection Pro du jour ») :
   memes fonctions, memes cles i18n (match_page.selpro.*), meme HTML. La page match garde sa copie
   (elle est aussi servie par les pages statiques du pipeline) ; tests/dashboard-pro.test.js
   verifie que les deux rendus restent IDENTIQUES, mot pour mot.

   Lu par l'espace Pro (pro-dashboard.js, « Ton programme du jour ») et par node --test.
   Module sans reseau ni DOM : textes par o.t / o.tf / o.estFr / o.localeTag (repli : window.I18N). */
(function (root) {
  'use strict';

  var COLONNES = 'id,numero,famille,fixture_id,ligue,dom,ext,coup_envoi,marche,ligne,selection,selections,proba,source_proba,meilleure_cote,meilleur_bookmaker,cote_vue_at,publie_at';
  var COMBINES = ['combine', 'fun10', 'fun25', 'reve'];
  var SOURCE_MARCHE = 'chance calculée par IASHARK à partir des cotes du marché';
  // Noms des bookmakers agrees (France, programme commun) : canal-pro.mjs#BOOKMAKERS_AGREES.FR.
  var BOOKMAKERS = { betclic: 'Betclic', netbet: 'NetBet', pmu: 'PMU', unibet: 'Unibet', winamax: 'Winamax', bet365: 'bet365', betsson: 'Betsson', bwin: 'Bwin', circus: 'Circus', daznbet: 'DAZN Bet', feelingbet: 'Feelingbet', genybet: 'Genybet', olybet: 'Olybet', pokerstars: 'PokerStars Sports', vbet: 'Vbet', yesorno: 'Yesorno' };
  // Marche du robot -> marche du moteur v3.
  var MARCHES = { '1': 'home-win', N: 'draw', '2': 'away-win', '1X': 'dc-1x', X2: 'dc-x2', '12': 'dc-12', O25: 'over-25', U25: 'under-25' };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Textes : ceux de la page (o), sinon window.I18N, sinon le francais d'origine.
  function outils(o) {
    o = o || {};
    var I = (typeof window !== 'undefined' && window.I18N) || null;
    var t = o.t || function (k, f) { return I && I.t ? I.t(k, f) : f; };
    var tf = o.tf || function (k, f, vars) {
      var s = String(t(k, f));
      return vars ? s.replace(/\{(\w+)\}/g, function (m, x) { return vars[x] != null ? vars[x] : m; }) : s;
    };
    var estFr = o.estFr || function () { return !(I && I.locale) || I.locale === 'fr'; };
    var localeTag = o.localeTag || function () { return I && I.localeTag ? I.localeTag() : 'fr-FR'; };
    return { t: t, tf: tf, estFr: estFr, localeTag: localeTag, nomBookmaker: o.nomBookmaker || null };
  }

  function estCombine(p) { return COMBINES.indexOf(p && p.famille) !== -1; }
  function nombre(x, d, o) { var s = Number(x).toFixed(d); return o.t('match_page.selpro.decimal', ',') === '.' ? s : s.replace('.', ','); }
  function pct1(p, o) { var x = p * 100; return x >= 10 ? String(Math.round(x)) : nombre(x, 1, o); }
  function uneSurN(p, o) { var k = 1 / p; return k < 10 ? nombre(k, 1, o) : String(Math.round(k)); }
  // D'ou vient la chance : canal-pro.mjs#voieChance.
  function voie(p) {
    if (!p || p.famille === 'buteur') return 'v3';
    if (estCombine(p)) {
      var s = Array.isArray(p.selections) ? p.selections : [];
      var k = s.filter(function (j) { return j && j.voie === 'cotes_marche'; }).length;
      return !k ? 'v3' : k === s.length ? 'marche' : 'mixte';
    }
    return String(p.source_proba || '').indexOf(SOURCE_MARCHE) === 0 ? 'marche' : 'v3';
  }
  // La chance, mot pour mot comme dans Telegram : canal-pro.mjs#chanceTxt.
  function chance(p, oo) {
    var o = outils(oo), v = voie(p), pr = Number(p.proba);
    if (p.famille === 'buteur') return o.tf('match_page.selpro.chance_buteur', 'Chance calculée par IASHARK : environ {p} % (1 chance sur {n}), lue dans la grille des scores du match.', { p: pct1(pr, o), n: uneSurN(pr, o) });
    if (estCombine(p)) {
      var quoi = v === 'marche' ? ' à partir des cotes du marché' : v === 'mixte' ? ' (moteur v3 et cotes du marché)' : '';
      var k = v === 'marche' ? 'chance_combine_marche' : v === 'mixte' ? 'chance_combine_mixte' : 'chance_combine';
      return o.tf('match_page.selpro.' + k, 'Chance calculée par IASHARK' + quoi + ' : environ 1 chance sur {n} ({p} %), toutes les sélections doivent passer.', { p: pct1(pr, o), n: uneSurN(pr, o) });
    }
    return v === 'marche'
      ? o.tf('match_page.selpro.chance_marche', 'Chance calculée par IASHARK à partir des cotes du marché : {p} %.', { p: Math.round(pr * 100) })
      : o.tf('match_page.selpro.chance_simple', 'Chance calculée par IASHARK : {p} %.', { p: Math.round(pr * 100) });
  }
  // La selection : en francais le texte archive (celui du message) ; ailleurs, recalculee dans la langue.
  function marche(j, o) {
    if (!j) return '';
    if (o.estFr() && j.selection) return String(j.selection);
    if (!j.marche || (!Object.prototype.hasOwnProperty.call(MARCHES, j.marche) && j.marche !== 'AHH' && j.marche !== 'AHA')) return String(j.selection || '');
    var l = j.ligne == null || j.ligne === '' ? '' : (Number(j.ligne) > 0 ? '+' : '') + (o.t('match_page.selpro.decimal', ',') === '.' ? String(Number(j.ligne)) : String(Number(j.ligne)).replace('.', ','));
    return o.tf('match_page.selpro.m_' + j.marche, String(j.selection || ''), { home: j.dom || '', away: j.ext || '', line: l });
  }
  function selection(p, oo) {
    var o = outils(oo);
    if (o.estFr() && p.selection) return String(p.selection);
    if (p.famille === 'buteur') {
      var b = (Array.isArray(p.selections) && p.selections[0]) || {};
      return b.equipe && b.joueur ? o.tf('match_page.selpro.buteur', '{team} gagne + {player} marque (à n’importe quel moment)', { team: b.equipe, player: b.joueur }) : String(p.selection || '');
    }
    if (estCombine(p)) return (p.selections || []).map(function (j) { return marche(j, o); }).filter(Boolean).join(' + ') || String(p.selection || '');
    return marche(p, o);
  }
  // Heure de Paris, comme le robot (« 14 h 05 » en francais).
  function heure(d, oo) {
    var o = outils(oo), x = new Date(d);
    if (!d || isNaN(x)) return '';
    try {
      var hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(x).split(':');
      if (o.estFr()) return Number(hm[0]) + ' h' + (hm[1] === '00' ? '' : ' ' + hm[1]);
      var tz = o.t('match_page.selpro.tz', '');
      return new Intl.DateTimeFormat(o.localeTag(), { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(x) + (tz ? ' ' + tz : '');
    } catch (e) { return ''; }
  }
  function cote(p, oo) {
    var o = outils(oo);
    if (p.famille === 'buteur') return esc(o.t('match_page.selpro.sans_preuve_buteur', 'Cote buteur : à voir chez ton bookmaker (nous ne la relevons pas).'));
    var c = Number(p.meilleure_cote);
    if (!(c > 1) || !p.meilleur_bookmaker) return esc(o.t('match_page.selpro.sans_cote', 'Cote : pas encore relevée chez les opérateurs autorisés dans ton pays.'));
    var combi = estCombine(p);
    var lib = combi ? (p.famille === 'combine' ? o.t('match_page.selpro.cote_combine', 'Cote du combiné') : o.t('match_page.selpro.cote_ticket', 'Cote du ticket')) : o.t('match_page.selpro.cote_simple', 'Cote');
    // Nom : celui de la liste du pays de l'abonne si l'appelant la donne (espace Pro), sinon la liste France.
    var nom = (o.nomBookmaker && o.nomBookmaker(p.meilleur_bookmaker)) || BOOKMAKERS[p.meilleur_bookmaker] || p.meilleur_bookmaker;
    var h = heure(p.cote_vue_at, o);
    return esc(lib) + (o.estFr() ? ' : ' : ': ') + '<b>' + esc(nombre(c, 2, o)) + '</b> ' + esc(o.t('match_page.selpro.chez', 'chez')) + ' ' + esc(nom)
      + (combi ? esc(o.t('match_page.selpro.chez_lui', ' (toutes les sélections chez lui)')) : '')
      + (h ? ' · ' + esc(o.tf('match_page.selpro.relevee', 'relevée à {h}', { h: h })) : '');
  }
  function jambes(p, oo) {
    var o = outils(oo);
    if (!estCombine(p)) return '';
    var L = (p.selections || []).map(function (j, k) {
      var c = Number(j && j.cote);
      return '<li>' + (k + 1) + '. ' + esc(j.ligue || '') + (j.ligue ? ' · ' : '') + esc(j.dom || '') + ' – ' + esc(j.ext || '') + (j.coup_envoi ? ' · ' + esc(heure(j.coup_envoi, o)) : '')
        + (o.estFr() ? ' : ' : ': ') + '<b>' + esc(marche(j, o)) + '</b>' + (c > 1 ? ' (' + esc(nombre(c, 2, o)) + ')' : '') + '</li>';
    }).join('');
    return L ? '<ol class="selpro-legs">' + L + '</ol>' : '';
  }
  /* Une selection : meme article que la page match. avant / apres : HTML ajoute par l'appelant
     (l'espace Pro y met le match et l'heure, et le bouton « Je l'ai joue »). */
  function article(p, oo, avant, apres) {
    var o = outils(oo);
    var fam = o.t('match_page.selpro.fam_' + p.famille, String(p.famille || '').toUpperCase());
    return '<article class="selpro-item">' + (avant || '')
      + '<p class="selpro-fam">' + esc(fam) + '</p>'
      + jambes(p, o)
      + '<p class="selpro-sel">' + esc(o.t('match_page.selpro.sel_label', 'Sélection')) + (o.estFr() ? ' : ' : ': ') + '<b>' + esc(selection(p, o)) + '</b></p>'
      + '<p class="selpro-chance">' + esc(chance(p, o)) + '</p>'
      + '<p class="selpro-cote">' + cote(p, o) + '</p>'
      + (p.numero ? '<p class="selpro-num">N° PRO-' + esc(p.numero) + '</p>' : '')
      + (apres || '') + '</article>';
  }
  function sources(liste, oo) {
    var o = outils(oo);
    var m = liste.some(function (p) { return voie(p) !== 'v3'; }), v3 = liste.some(function (p) { return voie(p) !== 'marche'; });
    return (v3 ? '<p class="selpro-source">' + esc(o.t('match_page.selpro.source_v3', 'Chances calculées par IASHARK (moteur v3).')) + '</p>' : '')
      + (m ? '<p class="selpro-source">' + esc(o.t('match_page.selpro.source_marche', 'Quand c’est écrit « à partir des cotes du marché », la chance vient des cotes des bookmakers, marge retirée.')) + '</p>' : '');
  }
  // Ligne valide (meme filtre que la page match) : publiee, chance entre 0 et 1.
  function valide(p) { return !!(p && p.publie_at && Number(p.proba) > 0 && Number(p.proba) < 1); }

  var api = {
    COLONNES: COLONNES, COMBINES: COMBINES, BOOKMAKERS: BOOKMAKERS, MARCHES: MARCHES,
    estCombine: estCombine, voie: voie, chance: chance, selection: selection, heure: heure, cote: cote,
    jambes: jambes, article: article, sources: sources, valide: valide
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.IasharkSelectionPro = api;
})(typeof window !== 'undefined' ? window : this);
