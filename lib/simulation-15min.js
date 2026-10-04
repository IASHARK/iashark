"use strict";
// SIMULATION PAR TRANCHES DE 15 MINUTES (C), calcul exact.
//
// Port JS de iashark-simulation/simulation.py (propager), validé sur 6 127 matchs
// jamais vus (iashark-simulation/RAPPORT-SIMULATION.md) et vérifié à 0,001 près contre
// le Python par tests/simulation-15min.test.js (jeu « golden » de 50 matchs).
//
// Principe : on rejoue le match minute par minute (arrêts de jeu découpés en sous-pas)
// en suivant la probabilité de CHAQUE état (score 0-7 de chaque côté, carton rouge
// ou non de chaque côté). C'est l'équivalent d'une infinité de simulations, sans tirage.
// Chance de but d'une équipe à un instant =
//   kappa x lambda x exp(alpha[bloc][côté]) x effet du score du moment (écart,
//   période, favori ou non) x effet des cartons rouges.
// kappa est recalé pour que les buts attendus restent EXACTEMENT ceux du moteur
// (lambda_h / lambda_a) : la simulation répartit le total dans le temps, elle ne le change pas.
// Aucun profil propre à une équipe : mesuré, il n'apporte rien (c'est du bruit).
//
// Peut repartir de n'importe quel état en cours (minute, score, cartons rouges).
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./simulation-15min-params.json"));
  } else {
    root.IasharkSimulation15 = factory(null);
  }
})(typeof self !== "undefined" ? self : this, function (PARAMS_DEFAUT) {
  var TRANCHES = ["1-15", "16-30", "31-45+", "46-60", "61-75", "76-90+"];

  // Découpage du temps : 92 cases (minutes 1-45, arrêts 1re MT, 46-90, arrêts 2e MT),
  // arrêts de jeu découpés en sous-pas (3 et 5) pour permettre plusieurs buts.
  function construirePas(P) {
    var bloc92 = [];
    var i;
    for (i = 0; i < 15; i++) bloc92.push(0);
    for (i = 0; i < 15; i++) bloc92.push(1);
    for (i = 0; i < 15; i++) bloc92.push(2);
    bloc92.push(3);
    for (i = 0; i < 15; i++) bloc92.push(4);
    for (i = 0; i < 15; i++) bloc92.push(5);
    for (i = 0; i < 15; i++) bloc92.push(6);
    bloc92.push(7);
    var sous = P.sous_pas_arrets || { "3": 3, "7": 5 };
    var pas = [];
    for (var c = 0; c < 92; c++) {
      var b = bloc92[c], n = sous[String(b)] || 1;
      for (var k = 0; k < n; k++) {
        pas.push({ caseIdx: c, bloc: b, frac: 1 / n, tranche: P.tranche_de_bloc[b], bande: P.bande_de_bloc[b] });
      }
    }
    var miTemps = 0, p75 = -1;
    for (i = 0; i < pas.length; i++) {
      if (pas[i].bloc === 3) miTemps = i + 1;
      if (p75 < 0 && pas[i].caseIdx === 76) p75 = i;
    }
    return { pas: pas, PAS_MI_TEMPS: miTemps, PAS_75: p75 };
  }

  function clip(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function sign(x) { return x > 0 ? 1 : (x < 0 ? -1 : 0); }

  function creer(P) {
    P = P || PAS_DEFAUT_OU_ERREUR();
    var G = P.grille_buts;
    var T = construirePas(P);
    var PAS = T.pas, NPAS = PAS.length;
    var NS = 4 * G * G;
    function ix(rh, ra, i, j) { return ((rh * 2 + ra) * G + i) * G + j; }

    // Multiplicateurs d'état (sans kappa ni lambda) : [bande][état] pour chaque côté.
    function tablesEtat(favH, favA) {
      var MH = [], MA = [];
      for (var bd = 0; bd < 3; bd++) {
        var mh = new Float64Array(NS), ma = new Float64Array(NS);
        for (var rh = 0; rh < 2; rh++) for (var ra = 0; ra < 2; ra++) for (var i = 0; i < G; i++) for (var j = 0; j < G; j++) {
          var s = ix(rh, ra, i, j);
          mh[s] = Math.exp(P.beta[bd][favH][clip(i - j, -2, 2) + 2]) * Math.exp(P.gamma_rouge_propre * rh + P.gamma_rouge_adverse * ra);
          ma[s] = Math.exp(P.beta[bd][favA][clip(j - i, -2, 2) + 2]) * Math.exp(P.gamma_rouge_propre * ra + P.gamma_rouge_adverse * rh);
        }
        MH.push(mh); MA.push(ma);
      }
      return { MH: MH, MA: MA };
    }

    function base(lambdaH, lambdaA) {
      var bh = new Float64Array(NPAS), ba = new Float64Array(NPAS);
      for (var t = 0; t < NPAS; t++) {
        bh[t] = lambdaH * Math.exp(P.alpha[PAS[t].bloc][0]) * PAS[t].frac;
        ba[t] = lambdaA * Math.exp(P.alpha[PAS[t].bloc][1]) * PAS[t].frac;
      }
      return { h: bh, a: ba };
    }

    // Un pas de buts (état X) ; compteur : nb de buts depuis la 76e (0..3+), X de taille 4*NS.
    function pasButs(X, ph, pa, compteur) {
      var nc = compteur ? 4 : 1;
      var Y = new Float64Array(X.length);
      for (var c = 0; c < nc; c++) {
        var o = c * NS;
        for (var rh = 0; rh < 2; rh++) for (var ra = 0; ra < 2; ra++) for (var i = 0; i < G; i++) for (var j = 0; j < G; j++) {
          var s = ix(rh, ra, i, j), x = X[o + s];
          if (x === 0) continue;
          var a = ph[s], b = pa[s];
          var xh = x * a, xn = x - xh, an = xn * b, y0 = xn - an, bo = xh * b, hh = xh - bo;
          var i1 = Math.min(i + 1, G - 1), j1 = Math.min(j + 1, G - 1);
          var c1 = compteur ? Math.min(c + 1, 3) : 0, c2 = compteur ? Math.min(c + 2, 3) : 0;
          Y[o + s] += y0;
          Y[c1 * NS + ix(rh, ra, i1, j)] += hh;
          Y[c1 * NS + ix(rh, ra, i, j1)] += an;
          Y[c2 * NS + ix(rh, ra, i1, j1)] += bo;
        }
      }
      return Y;
    }

    // 1er carton rouge de chaque équipe (seulement si elle n'en a pas encore).
    function pasRouges(Y, rh_, ra_, nc) {
      var Z = new Float64Array(Y.length);
      for (var c = 0; c < nc; c++) {
        var o = c * NS;
        for (var i = 0; i < G; i++) for (var j = 0; j < G; j++) {
          var k = i * G + j, rh = rh_[k], ra = ra_[k];
          var y00 = Y[o + ix(0, 0, i, j)], y10 = Y[o + ix(1, 0, i, j)], y01 = Y[o + ix(0, 1, i, j)], y11 = Y[o + ix(1, 1, i, j)];
          Z[o + ix(0, 0, i, j)] = y00 * (1 - rh) * (1 - ra);
          Z[o + ix(1, 0, i, j)] = y10 * (1 - ra) + y00 * rh * (1 - ra);
          Z[o + ix(0, 1, i, j)] = y01 * (1 - rh) + y00 * (1 - rh) * ra;
          Z[o + ix(1, 1, i, j)] = y11 + y10 * ra + y01 * rh + y00 * rh * ra;
        }
      }
      return Z;
    }

    function etatDepart(e) {
      var X = new Float64Array(NS);
      e = e || {};
      X[ix(Math.min(e.rougeDom || 0, 1), Math.min(e.rougeExt || 0, 1), Math.min(e.butsDom || 0, G - 1), Math.min(e.butsExt || 0, G - 1))] = 1;
      return X;
    }

    // Premier pas à jouer quand `minute` minutes sont jouées (45 = mi-temps, arrêts compris ;
    // 90 = fin du temps réglementaire, reste le temps additionnel).
    function pasDepuisMinute(minute) {
      var m = Math.round(Number(minute) || 0);
      if (m <= 0) return 0;
      if (m < 45) return m;
      if (m === 45) return T.PAS_MI_TEMPS;
      return Math.min(T.PAS_MI_TEMPS + (m - 45), NPAS);
    }

    // detail (04/10/2026, verdicts-maths-temps.md a2 et b1) : en plus, pour chaque tranche, la
    // chance que CHAQUE equipe marque (masse « sans but de l'equipe » : seule l'autre equipe
    // deplace la masse), et l'issue finale sachant qui a ouvert le score (drapeau « premier
    // buteur » : la masse a 0-0 qui marque bascule dans F1 / F2 ; deux buts au meme pas :
    // moitie-moitie, la meme regle que `premier`). Valeurs de controle du mathematicien :
    // tests/simulation-15min-detail.test.js.
    function propager(bs, kappa, favH, favA, facRouges, depart, pas0, suivre, detail) {
      var tb = tablesEtat(favH, favA);
      var Pm = depart || etatDepart(null);
      var Eh = 0, Ea = 0;
      var res = {};
      var pSans = [NaN, NaN, NaN, NaN, NaN, NaN], premier = [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];
      var Q = null, tCour = -1, P6 = null;
      var avecDetail = !!(suivre && detail);
      var pSansH = [NaN, NaN, NaN, NaN, NaN, NaN], pSansA = [NaN, NaN, NaN, NaN, NaN, NaN];
      var Qh = null, Qa = null, F1 = avecDetail ? new Float64Array(NS) : null, F2 = avecDetail ? new Float64Array(NS) : null;
      var zero = avecDetail ? new Float64Array(NS) : null;
      var ph = new Float64Array(NS), pa = new Float64Array(NS);
      var rhT = new Float64Array(G * G), raT = new Float64Array(G * G);
      var s, k;
      for (var t = pas0 || 0; t < NPAS; t++) {
        var st = PAS[t], bl = st.bloc, bd = st.bande, tr = st.tranche;
        var kh = kappa[0] * bs.h[t], ka = kappa[1] * bs.a[t];
        var mh = tb.MH[bd], ma = tb.MA[bd];
        for (s = 0; s < NS; s++) {
          ph[s] = 1 - Math.exp(-kh * mh[s]);
          pa[s] = 1 - Math.exp(-ka * ma[s]);
          Eh += Pm[s] * ph[s]; Ea += Pm[s] * pa[s];
        }
        for (var i = 0; i < G; i++) for (var j = 0; j < G; j++) {
          k = i * G + j;
          var sg = sign(i - j) + 1;
          rhT[k] = Math.min(P.rouges_taux[bl][sg] * facRouges * st.frac, 0.5);
          raT[k] = Math.min(P.rouges_taux[bl][2 - sg] * facRouges * st.frac, 0.5);
        }
        if (suivre) {
          if (tr !== tCour) {
            if (Q) pSans[tCour] = somme(Q);
            if (avecDetail && Qh) { pSansH[tCour] = somme(Qh); pSansA[tCour] = somme(Qa); }
            Q = new Float64Array(Pm); tCour = tr;
            if (avecDetail) { Qh = new Float64Array(Pm); Qa = new Float64Array(Pm); }
          }
          for (var rh = 0; rh < 2; rh++) for (var ra = 0; ra < 2; ra++) {
            s = ix(rh, ra, 0, 0);
            var a = ph[s], b = pa[s], p00 = Pm[s];
            premier[0][tr] += p00 * (a * (1 - b) + 0.5 * a * b);
            premier[1][tr] += p00 * (b * (1 - a) + 0.5 * a * b);
          }
          var Qn = new Float64Array(NS);
          for (s = 0; s < NS; s++) Qn[s] = Q[s] * (1 - ph[s]) * (1 - pa[s]);
          Q = pasRouges(Qn, rhT, raT, 1);
          if (avecDetail) {
            var qh = new Float64Array(NS), qa = new Float64Array(NS);
            for (s = 0; s < NS; s++) { qh[s] = Qh[s] * (1 - ph[s]); qa[s] = Qa[s] * (1 - pa[s]); }
            Qh = pasRouges(pasButs(qh, zero, pa, false), rhT, raT, 1);
            Qa = pasRouges(pasButs(qa, ph, zero, false), rhT, raT, 1);
            var m00 = new Float64Array(NS);
            for (var rh2 = 0; rh2 < 2; rh2++) for (var ra2 = 0; ra2 < 2; ra2++) m00[ix(rh2, ra2, 0, 0)] = Pm[ix(rh2, ra2, 0, 0)];
            var Xm = pasButs(m00, ph, pa, false);
            var F1n = pasButs(F1, ph, pa, false), F2n = pasButs(F2, ph, pa, false);
            for (var rh3 = 0; rh3 < 2; rh3++) for (var ra3 = 0; ra3 < 2; ra3++) {
              var deux = Xm[ix(rh3, ra3, 1, 1)];
              F1n[ix(rh3, ra3, 1, 0)] += Xm[ix(rh3, ra3, 1, 0)];
              F2n[ix(rh3, ra3, 0, 1)] += Xm[ix(rh3, ra3, 0, 1)];
              F1n[ix(rh3, ra3, 1, 1)] += 0.5 * deux;
              F2n[ix(rh3, ra3, 1, 1)] += 0.5 * deux;
            }
            F1 = pasRouges(F1n, rhT, raT, 1);
            F2 = pasRouges(F2n, rhT, raT, 1);
          }
          if (t === T.PAS_75) { P6 = new Float64Array(4 * NS); P6.set(Pm, 0); }
          if (P6) P6 = pasRouges(pasButs(P6, ph, pa, true), rhT, raT, 4);
        }
        Pm = pasRouges(pasButs(Pm, ph, pa, false), rhT, raT, 1);
        if (t === T.PAS_MI_TEMPS - 1) res.miTemps = scores(Pm);
      }
      if (suivre) {
        pSans[tCour] = somme(Q);
        res.pButTranche = pSans.map(function (x) { return isNaN(x) ? null : 1 - x; });
        res.premier = premier;
        if (avecDetail) {
          pSansH[tCour] = somme(Qh); pSansA[tCour] = somme(Qa);
          res.pButTrancheDom = pSansH.map(function (x) { return isNaN(x) ? null : 1 - x; });
          res.pButTrancheExt = pSansA.map(function (x) { return isNaN(x) ? null : 1 - x; });
          res.siPremier = { dom: unXdeux(scores(F1)), ext: unXdeux(scores(F2)) };
        }
        if (P6) {
          res.butsApres75 = [0, 1, 2, 3].map(function (c) { var z = 0; for (var q = 0; q < NS; q++) z += P6[c * NS + q]; return z; });
        }
      }
      res.final = scores(Pm);
      res.E = [Eh, Ea];
      return res;
    }

    function somme(X) { var z = 0; for (var q = 0; q < X.length; q++) z += X[q]; return z; }
    function scores(X) {
      var m = [];
      for (var i = 0; i < G; i++) { m.push([]); for (var j = 0; j < G; j++) m[i].push(X[ix(0, 0, i, j)] + X[ix(0, 1, i, j)] + X[ix(1, 0, i, j)] + X[ix(1, 1, i, j)]); }
      return m;
    }
    function unXdeux(m) {
      var p = [0, 0, 0];
      for (var i = 0; i < G; i++) for (var j = 0; j < G; j++) p[i > j ? 0 : (i === j ? 1 : 2)] += m[i][j];
      return p;
    }

    // Entrée : { lambdaH, lambdaA, favori: 'home'|'away'|null, ligueApi, etat: {minute, butsDom, butsExt, rougeDom, rougeExt} }
    function simuler(opts) {
      var lh = Number(opts && opts.lambdaH), la = Number(opts && opts.lambdaA);
      if (!(lh > 0) || !(la > 0)) return null;
      var favH = opts.favori === "home" ? 1 : 0, favA = opts.favori === "away" ? 1 : 0;
      var fac = (P.rouges_facteur_ligue_api && P.rouges_facteur_ligue_api[String(opts.ligueApi)]) || P.rouges_facteur_defaut || 1;
      var bs = base(lh, la);
      var kappa = opts.kappa ? opts.kappa.slice() : [1, 1];
      if (!opts.kappa) {
        for (var it = 0; it < (P.iterations_kappa || 3); it++) {
          var r0 = propager(bs, kappa, favH, favA, fac, null, 0, false);
          kappa = [kappa[0] * lh / Math.max(r0.E[0], 1e-9), kappa[1] * la / Math.max(r0.E[1], 1e-9)];
        }
      }
      var e = opts.etat || null;
      var pas0 = e ? pasDepuisMinute(e.minute) : 0;
      var r = propager(bs, kappa, favH, favA, fac, e ? etatDepart(e) : null, pas0, true, !e && opts.detail === true);
      var tranches = TRANCHES.map(function (l, k) { return { label: l, pBut: r.pButTranche[k] }; });
      var dispo = tranches.filter(function (x) { return x.pBut !== null; });
      var chaude = dispo.reduce(function (a, b) { return b.pBut > a.pBut ? b : a; }, dispo[0]);
      var pH = r.premier[0].reduce(function (a, b) { return a + b; }, 0), pA = r.premier[1].reduce(function (a, b) { return a + b; }, 0);
      var dejaMarque = e && ((e.butsDom || 0) + (e.butsExt || 0)) > 0;
      var out = {
        version: P.version,
        kappa: kappa,
        tranches: tranches,
        trancheChaude: chaude ? { index: TRANCHES.indexOf(chaude.label), label: chaude.label, pBut: chaude.pBut } : null,
        premierBut: dejaMarque ? null : { home: pH, away: pA, aucun: Math.max(0, 1 - pH - pA), parTranche: r.premier },
        final: { dist: r.final, p1n2: unXdeux(r.final) },
        butsApres75: r.butsApres75 || null,
        butsAttendus: r.E
      };
      if (r.miTemps) {
        var l = [];
        for (var i = 0; i < G; i++) for (var j = 0; j < G; j++) l.push({ score: i + "-" + j, p: r.miTemps[i][j] });
        l.sort(function (a, b) { return b.p - a.p; });
        out.miTemps = { dist: r.miTemps, top: l.slice(0, 3) };
      }
      if (r.pButTrancheDom) {
        // Chance que chaque equipe marque dans chaque tranche (a2) ; issue finale sachant qui
        // ouvre le score (b1) = masse finale du drapeau / chance que cette equipe ouvre ;
        // issue finale si c'est 0-0 a la pause (b2) = le meme calcul reparti de la pause.
        out.tranchesEquipes = { dom: r.pButTrancheDom, ext: r.pButTrancheExt };
        var parSi = function (v, total) { return total > 1e-9 ? v.map(function (x) { return x / total; }) : null; };
        var pause = propager(bs, kappa, favH, favA, fac, etatDepart({ minute: 45, butsDom: 0, butsExt: 0, rougeDom: 0, rougeExt: 0 }), T.PAS_MI_TEMPS, true, false);
        out.etSi = { domPremier: parSi(r.siPremier.dom, pH), extPremier: parSi(r.siPremier.ext, pA), nulPause: unXdeux(pause.final) };
        out.minuteMedianePremierBut = minuteMediane(r.premier);
      }
      return out;
    }

    // Minute avant laquelle tombe le premier but une fois sur deux (c2) : interpolation
    // lineaire, dans les quarts d'heure, du cumul de « premier but » ; null si la chance
    // d'au moins un but dans le match est sous 50 %.
    function minuteMediane(premier) {
      var bornes = [0, 15, 30, 45, 60, 75, 90], cumul = 0;
      for (var k = 0; k < 6; k++) {
        var avant = cumul;
        cumul += premier[0][k] + premier[1][k];
        if (cumul >= 0.5) return bornes[k] + 15 * (0.5 - avant) / (cumul - avant);
      }
      return null;
    }

    // Arrondi au pas `pas` (5 points pour « Et si », b1) avec la methode du plus grand reste :
    // les trois issues affichees font exactement 100.
    function arrondiPas(v, pas) {
      var unites = Math.round(100 / pas);
      var s = v[0] + v[1] + v[2];
      if (!(s > 0)) return null;
      var brut = v.map(function (x) { return x / s * unites; });
      var ent = brut.map(function (x) { return Math.floor(x + 1e-9); });
      var reste = unites - ent[0] - ent[1] - ent[2];
      var ordre = [0, 1, 2].sort(function (a, b) { return ((brut[b] - Math.floor(brut[b] + 1e-9)) - (brut[a] - Math.floor(brut[a] + 1e-9))) || (a - b); });
      for (var q = 0; q < ordre.length && reste > 0; q++, reste--) ent[ordre[q]]++;
      return ent.map(function (x) { return x * pas; });
    }

    // Champ compact publié par le pipeline (sim_15min), arrondi au millième.
    // Validation du mathématicien (28/09/2026) : ni « tranche la plus chaude » (76e-fin pour
    // 100 % des matchs) ni « score le plus probable à la pause » (0-0 dans 97 % des matchs) :
    // ils ne disent rien du match et ne sont donc pas publiés.
    // opts.ajouts (04/10/2026, verdicts-maths-temps.md, chaque cle seulement avec le feu vert
    // du mathematicien, lu par le pipeline dans config/verdicts-maths.json) :
    //   tr_equipes     -> tr_dom, tr_ext : chance que le domicile / l'exterieur marque dans
    //                     chaque tranche (a2 ; « encaisse » de l'un = « marque » de l'autre) ;
    //   et_si          -> si : { dom_premier, ext_premier, nul_pause } = { p1, pn, p2 } au
    //                     millieme (b1, b2) et si_affiche : les memes arrondis a 5 points,
    //                     somme 100 (condition d'affichage du mathematicien) ;
    //   minute_mediane -> minute_mediane_premier_but : entier, ou absent si la chance d'au
    //                     moins un but est sous 50 % (c2).
    // Sans ajouts : exactement le champ du 28/09 (v, tr, premier).
    function champPipeline(opts) {
      var ajouts = (opts && opts.ajouts) || {};
      var detail = !!(ajouts.tr_equipes || ajouts.et_si || ajouts.minute_mediane);
      var s = simuler(detail ? Object.assign({}, opts, { detail: true }) : opts);
      if (!s) return null;
      var r3 = function (x) { return Math.round(x * 1000) / 1000; };
      var out = {
        v: s.version,
        tr: s.tranches.map(function (x) { return r3(x.pBut); }),
        premier: { h: r3(s.premierBut.home), a: r3(s.premierBut.away), n: r3(s.premierBut.aucun) }
      };
      if (ajouts.tr_equipes && s.tranchesEquipes) {
        out.tr_dom = s.tranchesEquipes.dom.map(r3);
        out.tr_ext = s.tranchesEquipes.ext.map(r3);
      }
      if (ajouts.et_si && s.etSi && s.etSi.domPremier && s.etSi.extPremier) {
        var trois = function (v) { return { p1: r3(v[0]), pn: r3(v[1]), p2: r3(v[2]) }; };
        var cinq = function (v) { var a = arrondiPas(v, 5); return a ? { p1: a[0], pn: a[1], p2: a[2] } : null; };
        out.si = { dom_premier: trois(s.etSi.domPremier), ext_premier: trois(s.etSi.extPremier), nul_pause: trois(s.etSi.nulPause) };
        var aff = { dom_premier: cinq(s.etSi.domPremier), ext_premier: cinq(s.etSi.extPremier), nul_pause: cinq(s.etSi.nulPause) };
        if (aff.dom_premier && aff.ext_premier && aff.nul_pause) out.si_affiche = aff; else delete out.si;
      }
      if (ajouts.minute_mediane && s.minuteMedianePremierBut !== null && s.minuteMedianePremierBut !== undefined) {
        out.minute_mediane_premier_but = Math.round(s.minuteMedianePremierBut);
      }
      // Nombre de simulations reellement tirees (decision de Clement, 29/09/2026) :
      // seulement si la simulation en fait (cerveau 4, a venir). Le calcul exact
      // actuel n'en tire aucune : le champ est absent et aucune video ne dit
      // « base sur N simulations ».
      var nb = Number(s.nb_simulations);
      if (Number.isInteger(nb) && nb > 0) out.nb_simulations = nb;
      return out;
    }

    return { simuler: simuler, champPipeline: champPipeline, pasDepuisMinute: pasDepuisMinute, _propager: propager,
      _base: base, _etatDepart: etatDepart, PAS_MI_TEMPS: T.PAS_MI_TEMPS, PAS_75: T.PAS_75, NPAS: NPAS, TRANCHES: TRANCHES, params: P };
  }

  function PAS_DEFAUT_OU_ERREUR() {
    if (!PARAMS_DEFAUT) throw new Error("simulation-15min : paramètres absents (passer le JSON à creer()).");
    return PARAMS_DEFAUT;
  }

  var defaut = PARAMS_DEFAUT ? creer(PARAMS_DEFAUT) : null;
  return {
    creer: creer,
    TRANCHES: TRANCHES,
    simuler: function (o) { return (defaut || creer()).simuler(o); },
    champPipeline: function (o) { return (defaut || creer()).champPipeline(o); },
    pasDepuisMinute: function (m) { return (defaut || creer()).pasDepuisMinute(m); }
  };
});
