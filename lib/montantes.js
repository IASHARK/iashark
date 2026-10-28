/* IASHARK — LES 3 MONTANTES de la page Combines (demande de Clement du 28/10/2026 : « les tickets or, parfait on
   garde, mais on va placer une montante : debrouille-toi pour trouver un truc fun »).

   La regle, la meme chaque jour, sans exception :
   - les 3 paris de la Selection en or nourrissent chacun SA montante : montante 1 = pari or classe 1 du jour,
     montante 2 = pari classe 2, montante 3 = pari classe 3 (rang publie, sinon l'ordre de la liste) ;
   - palier = nombre de PARIS gagnes d'affilee (un jour sans Selection en or ne casse pas la serie) ; cote cumulee =
     produit des cotes des paris gagnes (au centime, moitie vers le haut, comme lib/run-output/combo-math.js) ;
     objectif : cote 10 ;
   - un pari perdu : la montante repart au palier 1 le lendemain ; un pari annule (match reporte, annule ou
     abandonne, ou buteur qui n'a pas joue, comme chez un operateur) ne compte pas et ne casse rien ; objectif
     atteint : il est annonce et la montante repart ;
   - un jour sans Selection en or (ou sans pari de ce rang) : la montante ne bouge pas ;
   - un pari pas encore regle : la montante attend (« en attente ») ; « non regle » seulement s'il n'existe vraiment
     aucune donnee 72 h apres la fin du match : il ne compte JAMAIS comme gagne et la montante repart au palier 1.
   Reglement d'un pari (aucun chiffre invente, controle historique-public du 28/10/2026) :
     1. la regle de la bande des resultats (lib/bandeau-preuves.js#creerRegleur : archive predictions_archive, meme
        marche publie avant le coup d'envoi, sinon score final) ;
     2. sinon un resultat deja etabli par un calcul precedent (preuves/montantes.json : les faits d'un match termine
        ne changent plus) ;
     3. sinon les faits du match chez API-Sports (fixtures?id=, lus par le calcul du matin : faitsDuMatch) : statut,
        score reglementaire (lib/resolvers.js#extractRegulationScore), score a la pause, buts par joueur (evenements,
        sans les buts contre son camp ni les penaltys manques, temps reglementaire), minutes jouees.
   Fichier public : l'HISTORIQUE COMPLET de chaque montante depuis le debut (jour, match, pari, cote, resultat, cote
   cumulee apres), gagnes ET perdus, objectifs passes compris, et le bilan (gagnes, perdus, annules, non regles).
   Depart : la premiere Selection en or publiee (DEBUT), jamais une date choisie apres coup.
   Jamais de mise ni de gain : seulement des paliers et des cotes.

   Module double : construireMontantes() / aRegler() / faitsDuMatch() (pipeline .github/workflows/update-data.yml,
   tests node) ecrivent preuves/montantes.json (jours PASSES seulement) ; produitCotes(), soir() servent a la page
   (lib/combines-page.js) pour « si ca passe ce soir », avec le pari du jour qui reste reserve a Pro. */
(function (root, factory) {
  var dep = {};
  if (typeof module === "object" && module.exports && typeof require === "function") {
    try { dep.BP = require("./bandeau-preuves.js"); } catch (e) { dep.BP = null; }
    try { dep.R = require("./resolvers.js"); } catch (e) { dep.R = null; }
    try { dep.MP = require("./marches-paris.js"); } catch (e) { dep.MP = null; }
    try { dep.FM = require("./film-du-match.js"); } catch (e) { dep.FM = null; }
  }
  var api = factory(dep);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IasharkMontantes = api;
})(typeof window !== "undefined" ? window : null, function (dep) {
  "use strict";
  var BP = dep.BP, R = dep.R, MP = dep.MP, FM = dep.FM;
  var DEBUT = "2026-10-06";            // premiere Selection en or publiee (table tickets_du_jour)
  var OBJECTIF = 10;                   // cote cumulee visee
  var NB = 3;                          // une montante par pari de la Selection en or
  var DUREE_MATCH_MS = 3 * 3600000;    // un match est « termine » 3 h apres son coup d'envoi
  var DELAI_REGLEMENT_MS = 72 * 3600000; // au-dela, un pari sans aucune donnee est « non regle »
  var NON_JOUES = ["PST", "CANC", "ABD"], JOUES = ["FT", "AET", "PEN"];

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

  // ---------------------------------------------------------------- faits d'un match (API-Sports)
  // fx : un element de la reponse API-Sports « fixtures?id= » (fixture, score, events, players). -> faits ou null.
  function faitsDuMatch(fx) {
    if (!fx || typeof fx !== "object" || !fx.fixture) return null;
    var st = String(fx.fixture.status && fx.fixture.status.short || "").toUpperCase();
    var reg = R && R.extractRegulationScore ? R.extractRegulationScore(fx) : { gh: null, ga: null };
    var ht = fx.score && fx.score.halftime;
    var entier = function (v) { var x = Number(v); return v != null && isFinite(x) && x >= 0 && Math.floor(x) === x ? x : null; };
    var buts = null, joue = null;
    // Buts par joueur seulement si les evenements, nettoyes des buts annules par la VAR, redonnent EXACTEMENT le score
    // a 90 minutes (lib/film-du-match.js#controlerMatch, controle de l'avocat du diable du 28/10/2026) ; sinon aucun
    // verdict buteur (null).
    var controle = FM && FM.controlerMatch ? FM.controlerMatch(fx, fx.events) : { ok: false, events: null };
    if (controle.ok && Array.isArray(controle.events)) {
      buts = {};
      controle.events.forEach(function (e) {
        // But de joueur en temps reglementaire (arrets de jeu compris) : ni contre son camp, ni penalty manque,
        // ni prolongation, ni seance de tirs au but.
        if (!e || e.type !== "Goal" || e.detail === "Own Goal" || e.detail === "Missed Penalty") return;
        if (!e.time || !(Number(e.time.elapsed) <= 90) || !e.player || e.player.id == null) return;
        buts[String(e.player.id)] = (buts[String(e.player.id)] || 0) + 1;
      });
    }
    if (Array.isArray(fx.players) && fx.players.length) {
      joue = {};
      fx.players.forEach(function (eq) {
        (eq && Array.isArray(eq.players) ? eq.players : []).forEach(function (p) {
          var g = p && Array.isArray(p.statistics) && p.statistics[0] && p.statistics[0].games;
          if (p && p.player && p.player.id != null) joue[String(p.player.id)] = !!g && Number(g.minutes) > 0;
        });
      });
    }
    return {
      statut: st,
      score: entier(reg.gh) !== null && entier(reg.ga) !== null ? [reg.gh, reg.ga] : null,
      mt: ht && entier(ht.home) !== null && entier(ht.away) !== null ? [ht.home, ht.away] : null,
      buts: buts, joue: joue,
    };
  }
  // marche + faits -> "win" | "loss" | "void" | null.
  function reglerParFaits(marche, f) {
    if (!f || !marche) return null;
    if (NON_JOUES.indexOf(f.statut) !== -1) return "void";
    if (JOUES.indexOf(f.statut) === -1) return null;
    var b = /^anytime-scorer-(\d+)$/.exec(String(marche));
    if (b) {
      // Buteur : gagne s'il a marque ; sinon perdu s'il a joue, annule s'il n'a pas joue (comme chez un operateur).
      var n = f.buts ? Number(f.buts[b[1]]) || 0 : null;
      if (n > 0) return "win";
      if (n === null || !f.joue || !Object.keys(f.joue).length) return null;
      return f.joue[b[1]] === true ? "loss" : "void";
    }
    if (!f.score) return null;
    var r = BP && BP.reglerParScore ? BP.reglerParScore(marche, f.score) : null;
    if (r) return r;
    // Mi-temps : score a la pause, regle du site (lib/resolvers.js) sur le libelle du catalogue (lib/marches-paris.js).
    if (f.mt && R && R.resolveMarketWin && MP && MP.definition) {
      var def = MP.definition(marche);
      if (def && def.marche) {
        var w = R.resolveMarketWin(def.marche, f.score[0], f.score[1], { halftimeHome: f.mt[0], halftimeAway: f.mt[1] });
        return w === true ? "win" : w === false ? "loss" : w === "void" ? "void" : null;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- construction (pipeline)
  function joursValides(o, jourCalcul) {
    var vus = {};
    return (Array.isArray(o.tickets) ? o.tickets : []).filter(function (t) {
      if (!t || t.type !== "or" || !jourValide(t.jour) || t.jour < DEBUT || t.jour >= jourCalcul || vus[t.jour]) return false;
      // Publiee avant son premier coup d'envoi (sinon pas une preuve : jamais comptee), un ticket par jour.
      var pub = ms(t.publie_a), premier = ms(t.premier_coup_envoi);
      if (pub == null || premier == null || pub >= premier) return false;
      if (!t.contenu || !Array.isArray(t.contenu.paris) || !t.contenu.paris.length) return false;
      vus[t.jour] = true;
      return true;
    }).sort(function (a, b) { return a.jour < b.jour ? -1 : a.jour > b.jour ? 1 : 0; });
  }
  function regleur(o) { return typeof o.regleur === "function" ? o.regleur : (BP && BP.creerRegleur ? BP.creerRegleur(o.archive, o.matchs) : null); }
  function cle(j, p) { return j + "|" + p.fixture_id + "|" + p.market_id; }
  function resultatsPrecedents(prec) {
    var out = {};
    (prec && Array.isArray(prec.montantes) ? prec.montantes : []).forEach(function (M) {
      (M && Array.isArray(M.historique) ? M.historique : []).forEach(function (x) {
        // « non regle » est DEFINITIF une fois pose : un resultat reapparu apres coup ne cree jamais un palier ni un
        // objectif retroactif (controle de l'avocat du diable du 28/10/2026).
        if (x && (x.r === "gagne" || x.r === "perdu" || x.r === "annule" || x.r === "non_regle")) out[x.j + "|" + x.f + "|" + x.m] = x.r;
      });
    });
    return out;
  }

  // Matchs dont le calcul du matin doit lire l'archive : paris passes dont le resultat n'est pas deja fige dans le
  // calcul precedent, les plus recents d'abord, 80 au plus (jamais tous les matchs depuis le debut dans l'adresse).
  function aLireArchive(o) {
    o = o || {};
    if (!jourValide(o.jour)) return [];
    var prec = resultatsPrecedents(o.precedent), out = [], vus = {};
    joursValides(o, o.jour).reverse().forEach(function (t) {
      (t.contenu.paris || []).forEach(function (p) {
        if (!p || p.fixture_id == null || !texte(p.market_id) || vus[p.fixture_id] || prec[cle(t.jour, p)]) return;
        vus[p.fixture_id] = true;
        out.push(Number(p.fixture_id));
      });
    });
    return out.slice(0, 80);
  }

  // Matchs dont le calcul du matin doit lire les faits chez API-Sports : paris passes, termines, que ni l'archive ni
  // un calcul precedent ne reglent (« non regle » compris : definitif), les plus recents d'abord.
  // o : memes champs que construireMontantes. -> [numeros de match].
  function aRegler(o) {
    o = o || {};
    var maintenant = typeof o.maintenant === "number" ? o.maintenant : Date.now();
    var regler = regleur(o);
    if (!regler || !jourValide(o.jour)) return [];
    var prec = resultatsPrecedents(o.precedent), out = [], vus = {};
    joursValides(o, o.jour).reverse().forEach(function (t) {
      (t.contenu.paris || []).forEach(function (p) {
        if (!p || p.fixture_id == null || !texte(p.market_id) || vus[p.fixture_id]) return;
        var ke = coupEnvoi(p);
        if (ke == null || maintenant < ke + DUREE_MATCH_MS) return;
        if (regler(p.fixture_id, p.market_id) || prec[cle(t.jour, p)]) return;
        vus[p.fixture_id] = true;
        out.push(Number(p.fixture_id));
      });
    });
    return out;
  }

  // o : { tickets: lignes tickets_du_jour (jour, type, contenu, publie_a, premier_coup_envoi),
  //       archive: lignes predictions_archive des matchs de ces tickets (fixture_id, market, result, score,
  //       published_at, kickoff_at), matchs: matchs du run (statut), faits: { "<fixture>": faitsDuMatch(...) },
  //       precedent: preuves/montantes.json precedent, jour: jour de Paris du calcul (AAAA-MM-JJ), maintenant: ms,
  //       genereLe: ISO, regleur: (fixture, marche) -> win|loss|void|null (tests) }
  function construireMontantes(o) {
    o = o || {};
    var maintenant = typeof o.maintenant === "number" ? o.maintenant : Date.now();
    var jourCalcul = jourValide(o.jour) ? o.jour : null;
    var regler = regleur(o);
    if (!regler || !jourCalcul) return null;
    var prec = resultatsPrecedents(o.precedent);
    var faits = o.faits && typeof o.faits === "object" ? o.faits : {};
    function resultat(j, p) {
      if (prec[cle(j, p)] === "non_regle") return "non_regle"; // definitif
      var r = regler(p.fixture_id, p.market_id);
      if (r) return RESULTAT[r] || null;
      if (prec[cle(j, p)]) return prec[cle(j, p)];
      var x = reglerParFaits(p.market_id, faits[String(p.fixture_id)]);
      return x ? RESULTAT[x] || null : null;
    }
    var montantes = [];
    for (var r = 1; r <= NB; r++) montantes.push({ rang: r, paliers: [], gagnes: 0, cote: null, etat: "en_cours", attente: null, dernier: null, objectifs: [], historique: [], bilan: null });

    joursValides(o, jourCalcul).forEach(function (t) {
      var paris = parRang(t.contenu.paris);
      montantes.forEach(function (M) {
        if (M.etat === "en_attente") return; // la suite attend le resultat en cours
        var p = paris[M.rang];
        var k = p ? cote(p.cote) : null;
        if (!p || k === null || p.fixture_id == null || !texte(p.market_id)) return; // pas de pari de ce rang ce jour-la
        var res = resultat(t.jour, p);
        var gagnesAvant = function () { return M.paliers.filter(function (x) { return x.r === "gagne"; }); };
        var pas = { j: t.jour, f: Number(p.fixture_id), h: texte(p.domicile), a: texte(p.exterieur), m: texte(p.market_id), p: texte(p.pari), c: k, r: res, cc: null };
        if (res === "gagne") {
          M.paliers.push(pas);
          var g = gagnesAvant();
          pas.cc = produitCotes(g.map(function (x) { return x.c; }));
          M.historique.push(pas);
          if (pas.cc !== null && pas.cc >= OBJECTIF) {
            pas.o = 1;
            M.objectifs.push({ j: t.jour, n: g.length, c: pas.cc });
            M.dernier = { t: "objectif", j: t.jour, n: g.length, c: pas.cc };
            M.paliers = [];
          }
          return;
        }
        if (res === "annule") {
          var ga = gagnesAvant();
          pas.cc = ga.length ? produitCotes(ga.map(function (x) { return x.c; })) : null;
          M.paliers.push(pas);
          M.historique.push(pas);
          return;
        }
        if (res === "perdu") {
          M.historique.push(pas);
          M.dernier = { t: "perdu", j: t.jour, n: gagnesAvant().length, h: pas.h, a: pas.a, p: pas.p, k: k };
          M.paliers = [];
          return;
        }
        // Pas de resultat : attente tant qu'il peut encore venir, puis « non regle » (jamais gagne, definitif).
        var ke = coupEnvoi(p);
        if (res !== "non_regle" && (ke == null || maintenant < ke + DUREE_MATCH_MS + DELAI_REGLEMENT_MS)) {
          pas.r = "en_attente";
          M.historique.push(pas);
          M.etat = "en_attente";
          M.attente = { j: t.jour };
          return;
        }
        pas.r = "non_regle";
        M.historique.push(pas);
        M.dernier = { t: "non_regle", j: t.jour, n: gagnesAvant().length, h: pas.h, a: pas.a, p: pas.p, k: k };
        M.paliers = [];
      });
    });
    montantes.forEach(function (M) {
      var g = M.paliers.filter(function (x) { return x.r === "gagne"; });
      M.gagnes = g.length;
      M.cote = g.length ? produitCotes(g.map(function (x) { return x.c; })) : null;
      var compte = function (r) { return M.historique.filter(function (x) { return x.r === r; }).length; };
      M.bilan = { gagnes: compte("gagne"), perdus: compte("perdu"), annules: compte("annule"), non_regles: compte("non_regle"), objectifs: M.objectifs.length };
    });
    return {
      version: 1,
      genere_le: o.genereLe || new Date(maintenant).toISOString(),
      jour: jourCalcul,
      debut: DEBUT,
      objectif: OBJECTIF,
      regle: "Montante n = pari classe n de la Selection en or de chaque jour (table tickets_du_jour, type or, publiee avant son premier coup d'envoi), depuis le " + DEBUT + ", jours avant le " + jourCalcul + ". Pari regle par lib/bandeau-preuves.js#creerRegleur (archive, meme marche, sinon score final), sinon par un calcul precedent, sinon par les faits du match chez API-Sports (score reglementaire, score a la pause, buts sans contre son camp, minutes jouees). Gagne : palier suivant, cote cumulee = produit des cotes gagnees (au centime, moitie vers le haut). Perdu : retour au palier 1. Annule (match reporte, annule ou abandonne ; buteur qui n'a pas joue) : ne compte pas. Un jour sans Selection en or ne casse pas la serie. Cote " + OBJECTIF + " atteinte : objectif annonce, retour au palier 1. Pas de resultat : en attente ; aucune donnee 72 h apres la fin du match : non regle, retour au palier 1 (jamais compte gagne). historique : tous les paris depuis le debut, cc = cote cumulee apres le pari.",
      montantes: montantes,
    };
  }

  // ---------------------------------------------------------------- lecture (page)
  // Etat d'une montante pour ce soir. fichier : preuves/montantes.json ; jour : jour de Paris de la reponse
  // tickets-du-jour. -> { rang, gagnes, cote, palier (du soir), cotes (gagnees), pret, attente, dernier, objectifs,
  // historique, bilan }. pret = le fichier a ete calcule CE jour-la et la montante n'attend aucun resultat : « si ca
  // passe ce soir » peut etre calcule. Sinon (fichier d'hier, resultat attendu) : aucun chiffre du soir.
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
        historique: Array.isArray(M && M.historique) ? M.historique : [],
        bilan: M && M.bilan && typeof M.bilan === "object" ? M.bilan : null,
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

  // ---------------------------------------------------------------- empreinte des Selections en or
  // Controles historique-public et avocat du diable du 28/10/2026 : la Selection en or DU JOUR entre, juste apres sa
  // publication et AVANT son premier match, dans une chaine d'empreintes (meme construction que lib/empreintes-paris.js :
  // SHA-256 sale du jour, maillons chaines, sel revele deux jours plus tard ; registre preuves/empreintes-or.json).
  // Champs empreints = ceux que l'historique public des montantes montre ensuite, RANG compris : rang (= numero de la
  // montante), f, h, a, m, p, c. Une fois le sel revele, chacun peut refaire le calcul.
  var EXPLICATION_EMPREINTES_OR = "Empreinte SHA-256 de la Selection en or publiee chaque jour (2 ou 3 paris, avec leur rang), chainee a la precedente, ajoutee le jour meme juste apres la publication et avant le premier match. Un pari modifie apres coup ou un maillon retire casse la chaine. Le sel de chaque jour est revele deux jours plus tard : empreinte_paris = SHA-256(sel + saut de ligne + JSON canonique de la liste des paris tries par rang, chacun { rang, fixture_id, home, away, prediction, cote, market } = { numero de la montante, f, h, a, p, c, m } de l'historique de preuves/montantes.json).";
  function parisEmpreintsOr(t) {
    var r = parRang(t && t.contenu && t.contenu.paris), out = [];
    for (var i = 1; i <= NB; i++) {
      var p = r[i];
      if (p && p.fixture_id != null) out.push({ rang: i, fixture_id: Number(p.fixture_id), home: texte(p.domicile), away: texte(p.exterieur), prediction: texte(p.pari), cote: cote(p.cote), market: texte(p.market_id) });
    }
    return out;
  }
  // E : lib/empreintes-paris.js ; t : ligne tickets_du_jour (jour, contenu, publie_a, premier_coup_envoi).
  // -> { ajoute, raison, maillon }. Seulement publiee avant son premier match, et AVANT ce premier match.
  function ajouterEmpreinteOr(E, registre, t, secret, genereLe, maintenant) {
    if (!E || !secret) return { ajoute: false, raison: "secret absent" };
    if (!t || !jourValide(t.jour)) return { ajoute: false, raison: "ticket illisible" };
    var pub = ms(t.publie_a), premier = ms(t.premier_coup_envoi);
    var now = typeof maintenant === "number" ? maintenant : Date.now();
    if (pub == null || premier == null || pub >= premier) return { ajoute: false, raison: "publiee apres son premier match" };
    if (now >= premier) return { ajoute: false, raison: "premier match commence" };
    var paris = parisEmpreintsOr(t);
    if (!paris.length) return { ajoute: false, raison: "aucun pari" };
    var ep = E.empreinteParis(paris, E.sel(secret, t.jour));
    var chaine = registre.chaine;
    var dernier = chaine.filter(function (m) { return m.jour === t.jour; }).pop();
    if (dernier && dernier.empreinte_paris === ep) return { ajoute: false, raison: "inchange" };
    var m = { n: chaine.length + 1, jour: t.jour, genere_le: genereLe || new Date(now).toISOString(), nb_paris: paris.length, empreinte_paris: ep,
      precedente: chaine.length ? chaine[chaine.length - 1].empreinte : E.GENESE };
    m.empreinte = E.empreinteMaillon(m);
    chaine.push(m);
    return { ajoute: true, raison: dernier ? "revision" : "nouveau", maillon: m };
  }

  return { construireMontantes: construireMontantes, aRegler: aRegler, faitsDuMatch: faitsDuMatch, reglerParFaits: reglerParFaits,
    aLireArchive: aLireArchive, parisEmpreintsOr: parisEmpreintsOr, ajouterEmpreinteOr: ajouterEmpreinteOr, EXPLICATION_EMPREINTES_OR: EXPLICATION_EMPREINTES_OR,
    produitCotes: produitCotes, soir: soir, siCaPasse: siCaPasse, avancement: avancement,
    parRang: parRang, DEBUT: DEBUT, OBJECTIF: OBJECTIF, NB: NB, DELAI_REGLEMENT_MS: DELAI_REGLEMENT_MS };
});
