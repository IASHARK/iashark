/* IASHARK — LES 3 MONTANTES de la page Combines (demande de Clement du 28/10/2026 : « les tickets or, parfait on
   garde, mais on va placer une montante : debrouille-toi pour trouver un truc fun »).

   La regle, la meme chaque jour, sans exception :
   - les 3 paris de la Selection en or nourrissent chacun SA montante : montante 1 = pari or classe 1 du jour,
     montante 2 = pari classe 2, montante 3 = pari classe 3 (rang publie, sinon l'ordre de la liste) ;
   - palier = nombre de jours gagnes d'affilee ; cote cumulee = produit des cotes des paliers gagnes (au centime,
     moitie vers le haut, comme lib/run-output/combo-math.js) ; objectif : cote 10 ;
   - un pari perdu : la montante repart au palier 1 le lendemain ; un pari annule (match reporte, annule ou
     abandonne) ne compte pas et ne casse rien ; objectif atteint : il est annonce et la montante repart ;
   - un jour sans Selection en or (ou sans pari de ce rang) : la montante ne bouge pas ;
   - un pari pas encore regle : la montante attend (« en attente ») ; un pari que ni l'archive ni le score final ne
     reglent 72 h apres la fin de son match (buteur, mi-temps sans score a la pause) est « non regle » : il ne compte
     JAMAIS comme gagne et la montante repart au palier 1 (prudence : jamais une serie gonflee).
   Sources (aucun chiffre invente) : la table tickets_du_jour (type « or », lignes publiees AVANT leur premier coup
   d'envoi, meme regle que la bande des resultats), et le reglement de lib/bandeau-preuves.js#creerRegleur (archive
   predictions_archive, meme marche ou score final ; controle historique-public du 27/10/2026). Depart : la premiere
   Selection en or publiee (DEBUT), jamais une date choisie apres coup.
   Jamais de mise ni de gain : seulement des paliers et des cotes.

   Module double : construireMontantes() (pipeline .github/workflows/update-data.yml, tests node) ecrit le fichier
   public preuves/montantes.json (jours PASSES seulement : matchs termines) ; produitCotes(), soir() servent a la page
   (lib/combines-page.js) pour « si ca passe ce soir », avec le pari du jour qui reste reserve a Pro. */
(function (root, factory) {
  var BP = null;
  if (typeof module === "object" && module.exports && typeof require === "function") { try { BP = require("./bandeau-preuves.js"); } catch (e) { BP = null; } }
  var api = factory(BP);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IasharkMontantes = api;
})(typeof window !== "undefined" ? window : null, function (BP) {
  "use strict";
  var DEBUT = "2026-10-06";            // premiere Selection en or publiee (table tickets_du_jour)
  var OBJECTIF = 10;                   // cote cumulee visee
  var NB = 3;                          // une montante par pari de la Selection en or
  var DUREE_MATCH_MS = 3 * 3600000;    // un match est « termine » 3 h apres son coup d'envoi
  var DELAI_REGLEMENT_MS = 72 * 3600000; // au-dela, un pari sans resultat est « non regle »

  function texte(v) { return typeof v === "string" && v.trim() ? v.trim() : null; }
  function ms(v) { var t = Date.parse(v); return isFinite(t) ? t : null; }
  function jourValide(j) { return /^\d{4}-\d{2}-\d{2}$/.test(String(j || "")); }
  function cote(v) {
    var x = Number(String(v == null ? "" : v).replace(",", "."));
    return isFinite(x) && x > 1 ? Math.round(x * 100) / 100 : null;
  }
  function centimes(c) { var x = cote(c); return x === null ? null : Math.round(Number((x * 100).toPrecision(12))); }

  // Produit des cotes au centime, moitie vers le haut (entiers exacts : BigInt quand il existe). [] -> null.
  function produitCotes(liste) {
    var l = (Array.isArray(liste) ? liste : []).map(centimes);
    if (!l.length || l.some(function (c) { return c === null; })) return null;
    if (l.length === 1) return l[0] / 100;
    if (typeof BigInt === "function") {
      var p = BigInt(1), div = BigInt(1), cent = BigInt(100), deux = BigInt(2);
      l.forEach(function (c, i) { p *= BigInt(c); if (i > 0) div *= cent; });
      return Number((p * deux + div) / (div * deux)) / 100;
    }
    var x = 1; l.forEach(function (c) { x *= c / 100; });
    return Math.round(x * 100 + 1e-9) / 100;
  }

  // Coup d'envoi d'un pari (ms) : coup_envoi_ms exact, sinon « AAAA-MM-JJ HH:MM » lu comme UTC (ordre de grandeur
  // seulement, comme lib/bandeau-preuves.js : 2 h d'ecart ne changent rien a un delai de 72 h).
  function coupEnvoi(p) {
    if (p && typeof p.coup_envoi_ms === "number" && isFinite(p.coup_envoi_ms)) return p.coup_envoi_ms;
    var m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(String(p && p.coup_envoi || ""));
    return m ? ms(m[1] + "T" + m[2] + ":00Z") : null;
  }
  // Paris d'une Selection en or, par rang (rang publie s'il est present partout, sinon l'ordre de la liste).
  function parRang(paris) {
    var l = (Array.isArray(paris) ? paris : []).filter(function (p) { return p && typeof p === "object"; });
    var avecRang = l.length && l.every(function (p) { return Number.isInteger(Number(p.rang)) && Number(p.rang) >= 1; });
    var out = {};
    l.forEach(function (p, i) { var r = avecRang ? Number(p.rang) : i + 1; if (r >= 1 && r <= NB && !out[r]) out[r] = p; });
    return out;
  }
  var RESULTAT = { win: "gagne", loss: "perdu", void: "annule" };

  // ---------------------------------------------------------------- construction (pipeline)
  // o : { tickets: lignes tickets_du_jour (jour, type, contenu, publie_a, premier_coup_envoi),
  //       archive: lignes predictions_archive des matchs de ces tickets (fixture_id, market, result, score,
  //       published_at, kickoff_at), matchs: matchs du run (statut), jour: jour de Paris du calcul (AAAA-MM-JJ),
  //       maintenant: ms, genereLe: ISO, regleur: (fixture, marche) -> win|loss|void|null (tests) }
  function construireMontantes(o) {
    o = o || {};
    var maintenant = typeof o.maintenant === "number" ? o.maintenant : Date.now();
    var jourCalcul = jourValide(o.jour) ? o.jour : null;
    var regler = typeof o.regleur === "function" ? o.regleur : (BP && BP.creerRegleur ? BP.creerRegleur(o.archive, o.matchs) : null);
    var montantes = [];
    for (var r = 1; r <= NB; r++) montantes.push({ rang: r, paliers: [], gagnes: 0, cote: null, etat: "en_cours", attente: null, dernier: null, objectifs: [] });
    if (!regler || !jourCalcul) return null;
    // Jours PASSES, publies avant leur premier coup d'envoi (sinon pas une preuve : jamais compte), un par jour.
    var vus = {};
    var jours = (Array.isArray(o.tickets) ? o.tickets : []).filter(function (t) {
      if (!t || t.type !== "or" || !jourValide(t.jour) || t.jour < DEBUT || t.jour >= jourCalcul || vus[t.jour]) return false;
      var pub = ms(t.publie_a), premier = ms(t.premier_coup_envoi);
      if (pub == null || premier == null || pub >= premier) return false;
      if (!t.contenu || !Array.isArray(t.contenu.paris) || !t.contenu.paris.length) return false;
      vus[t.jour] = true;
      return true;
    }).sort(function (a, b) { return a.jour < b.jour ? -1 : a.jour > b.jour ? 1 : 0; });

    jours.forEach(function (t) {
      var paris = parRang(t.contenu.paris);
      montantes.forEach(function (M) {
        if (M.etat === "en_attente") return; // la suite attend le resultat en cours
        var p = paris[M.rang];
        var k = p ? cote(p.cote) : null;
        if (!p || k === null || p.fixture_id == null || !texte(p.market_id)) return; // pas de pari de ce rang ce jour-la
        var res = regler(p.fixture_id, p.market_id);
        var pas = { j: t.jour, f: Number(p.fixture_id), h: texte(p.domicile), a: texte(p.exterieur), m: texte(p.market_id), p: texte(p.pari), c: k, r: RESULTAT[res] || null };
        if (pas.r === "gagne") {
          M.paliers.push(pas);
          var cumul = produitCotes(M.paliers.filter(function (x) { return x.r === "gagne"; }).map(function (x) { return x.c; }));
          if (cumul !== null && cumul >= OBJECTIF) {
            var n = M.paliers.filter(function (x) { return x.r === "gagne"; }).length;
            M.objectifs.push({ j: t.jour, n: n, c: cumul });
            M.dernier = { t: "objectif", j: t.jour, n: n, c: cumul };
            M.paliers = [];
          }
          return;
        }
        if (pas.r === "annule") { M.paliers.push(pas); return; }
        if (pas.r === "perdu") {
          M.dernier = { t: "perdu", j: t.jour, n: M.paliers.filter(function (x) { return x.r === "gagne"; }).length, h: pas.h, a: pas.a, p: pas.p, k: k };
          M.paliers = [];
          return;
        }
        // Pas de resultat : attente tant que le match n'est pas fini depuis 72 h, puis « non regle » (jamais gagne).
        var ke = coupEnvoi(p);
        if (ke == null || maintenant < ke + DUREE_MATCH_MS + DELAI_REGLEMENT_MS) {
          M.etat = "en_attente";
          M.attente = { j: t.jour };
          return;
        }
        M.dernier = { t: "non_regle", j: t.jour, n: M.paliers.filter(function (x) { return x.r === "gagne"; }).length, h: pas.h, a: pas.a, p: pas.p, k: k };
        M.paliers = [];
      });
    });
    montantes.forEach(function (M) {
      var g = M.paliers.filter(function (x) { return x.r === "gagne"; });
      M.gagnes = g.length;
      M.cote = g.length ? produitCotes(g.map(function (x) { return x.c; })) : null;
    });
    return {
      version: 1,
      genere_le: o.genereLe || new Date(maintenant).toISOString(),
      jour: jourCalcul,
      debut: DEBUT,
      objectif: OBJECTIF,
      regle: "Montante n = pari classe n de la Selection en or de chaque jour (table tickets_du_jour, type or, publiee avant son premier coup d'envoi), depuis le " + DEBUT + ", jours avant le " + jourCalcul + ". Pari regle par lib/bandeau-preuves.js#creerRegleur (archive, meme marche, sinon score final). Gagne : palier suivant, cote cumulee = produit des cotes gagnees (au centime, moitie vers le haut). Perdu : retour au palier 1. Annule : ne compte pas. Cote " + OBJECTIF + " atteinte : objectif annonce, retour au palier 1. Pas de resultat : en attente ; toujours sans resultat 72 h apres la fin du match : non regle, retour au palier 1 (jamais compte gagne).",
      montantes: montantes,
    };
  }

  // ---------------------------------------------------------------- lecture (page)
  // Etat d'une montante pour ce soir. fichier : preuves/montantes.json ; jour : jour de Paris de la reponse
  // tickets-du-jour. -> { rang, gagnes, cote, palier (du soir), cotes (gagnees), pret, attente, dernier, objectifs }
  // pret = le fichier a ete calcule CE jour-la et la montante n'attend aucun resultat : « si ca passe ce soir » peut
  // etre calcule. Sinon (fichier d'hier, resultat attendu) : aucun chiffre du soir.
  function soir(fichier, jour) {
    if (!fichier || fichier.version !== 1 || !Array.isArray(fichier.montantes)) return [];
    var frais = jourValide(jour) && fichier.jour === jour;
    return fichier.montantes.slice(0, NB).map(function (M, i) {
      var paliers = Array.isArray(M && M.paliers) ? M.paliers : [];
      var cotes = paliers.filter(function (x) { return x && x.r === "gagne" && cote(x.c) !== null; }).map(function (x) { return cote(x.c); });
      return {
        rang: M && Number.isInteger(M.rang) ? M.rang : i + 1,
        gagnes: cotes.length,
        cote: cotes.length ? produitCotes(cotes) : null,
        cotes: cotes,
        palier: cotes.length + 1,
        paliers: paliers,
        attente: M && M.etat === "en_attente" ? (M.attente || {}) : null,
        pret: frais && !(M && M.etat === "en_attente"),
        dernier: M && M.dernier || null,
        objectifs: Array.isArray(M && M.objectifs) ? M.objectifs : [],
      };
    });
  }
  // Cote cumulee si le pari du soir passe : produit des cotes gagnees et de la cote du soir. Jamais sans etat pret.
  function siCaPasse(etat, coteDuSoir) {
    if (!etat || !etat.pret || cote(coteDuSoir) === null) return null;
    return produitCotes(etat.cotes.concat([cote(coteDuSoir)]));
  }
  // Avancement vers l'objectif, 0 a 1, en echelle logarithmique (chaque palier a 1,40 avance d'autant).
  function avancement(c) {
    var x = cote(c);
    if (x === null) return 0;
    return Math.max(0, Math.min(1, Math.log(x) / Math.log(OBJECTIF)));
  }

  return { construireMontantes: construireMontantes, produitCotes: produitCotes, soir: soir, siCaPasse: siCaPasse, avancement: avancement,
    parRang: parRang, DEBUT: DEBUT, OBJECTIF: OBJECTIF, NB: NB, DELAI_REGLEMENT_MS: DELAI_REGLEMENT_MS };
});
