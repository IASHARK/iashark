/* IASHARK — sections de la page match (04/10/2026, demande de Clement : page
   ludique, chaque information UNE seule fois, panneau Marches reserve aux Pro).

   Ordre de la page (match-page.js) : en-tete, sommaire, L'AVIS IASHARK (inchange,
   rendu par match-page.js#signalCard), puis les sections de ce module :
     D. sim      « Si ce match se jouait 10 000 fois » (comptes exacts tires de la
                 grille du moteur : pourcentage entier x 100, jamais un tirage) ;
     E. film     le film du match en 6 quarts d'heure (buts marques / encaisses,
                 chance d'un but par tranche) ;
     F. premier  qui ouvre le score, premier but avant la pause, minute mediane,
                 premiers buteurs probables + « Et si... ? » ;
     G. jumeaux  les matchs deja joues que les bookmakers voyaient comme celui-ci ;
     H. equipes  radar a 6 branches + bilan + compositions ;
     I. joueurs  buteurs du moteur v3 seulement (une seule source buteur) ;
     J. arbitre  cartons, rouges, penaltys face a l'attendu (feu du mathematicien) ;
     K. panneau Marches (colonne gauche sur ordinateur, tiroir sur telephone).

   CHAMPS LUS (assemblage du 04/10/2026 : EXACTEMENT ceux que le pipeline produit,
   lib/sections-match.js, lib/simulation-15min.js, lib/marches-panneau.js,
   lib/jumeaux.js, lib/moteur-v3.js ; aucun chiffre recalcule ici) :
     D. sim_resume { base: 10000, issues {dom,nul,ext}, scores [{score,n}],
        total_buts [{buts,n}] } (comptes = pourcentage entier x 100) ;
     E. sim_15min.tr, tr_dom, tr_ext (Pro) ; faits : stats_iashark (Pro) ou events_* ;
     F. premier_but { dom, ext, aucun, avant_pause } (Pro), sim_15min.si_affiche
        (deja arrondi a 5 points, somme 100) et minute_mediane_premier_but (Pro),
        v3_premiers_buteurs (Pro) ;
     G. jumeaux { resultat { n, depuis, niveau, dom, nul, ext, pct, exemples },
        buts { n, depuis, plus_2_5, btts, pct } } ;
     I. v3_buteurs ; J. stats_iashark.arbitre (Pro) ; K. marches_panneau (Pro).

   VERDICTS DU MATHEMATICIEN (verdicts-maths-temps.md et verdicts-maths-tickets.md,
   04/10/2026), appliques ici a l'affichage :
   - d1 GO : comptes exacts de la grille ; JAMAIS « rejoue 10 000 fois », jamais de
     compteur qui monte jusqu'a 10 000 ; scores les plus probables SANS le filtre du
     pari ; d2 (score le plus fou) NO-GO : absent.
   - a1 / a2 GO : chance d'un but par quart d'heure (sim_15min.tr) et par equipe
     (tr_dom, tr_ext), en entiers ; a3 « zone chaude » NO-GO sous toutes ses
     formes : absente.
   - b1 / b2 GO : « Et si » arrondi a 5 points (si_affiche du pipeline) ; ecart
     calcule sur les nombres affiches.
   - c1 GO (grille v3, premier_but) MAIS le verdict des marches cache
     PREMIER_BUT:ext (tranche 10-20 % fausse) et PREMIER_BUT:dom (tranche 80-90 %) :
     la barre ne s'affiche que hors de ces tranches. c2 GO : premier but avant la
     pause, minute mediane (jamais « le quart d'heure le plus probable »). c3 GO :
     premier buteur = toujours une chance, jamais « il marquera le premier ».
   - g GO : jumeaux en comptes bruts (au moins 200), periode, 3 exemples nommes.
   - f GO : panneau = marches_panneau du pipeline (71 marches justes, arrondi par
     groupe, chance du pari = chance de l'Avis). Aucune autre source.
   - arbitre : « jamais l'arbitre tant que l'heure de sa nomination n'est pas
     mesuree » : rien sans stats_iashark.arbitre (le pipeline ne le pose qu'avec le
     feu vert, lib/sections-match.js#feuArbitre).

   REGLES
   - Une section dont la donnee manque (ou n'est pas validee : le pipeline ne pose
     jamais un champ NO-GO) n'est pas rendue : aucun trou, aucun « undefined ».
   - AUCUNE REPETITION : registre unique (registre()) ; chaque section, dans l'ordre
     de la page, inscrit les cles d'information qu'elle affiche et n'ecrit jamais
     un chiffre dont la cle est deja inscrite (l'Avis inscrit les siennes d'abord).
   - UNE SEULE SOURCE : les issues de « 10 000 fois » viennent de sim_resume, qui
     donne a l'issue du pari exactement la chance de l'Avis ; sans sim_resume, la
     section ne s'affiche pas (aucun repli sur p1/pn/p2).
   - Pro seulement (serveur) : sim_15min, stats_iashark, v3_marches, marches_panneau,
     premier_but, v3_premiers_buteurs. Sans Pro, la page ne recoit pas ces champs ;
     elle ecrit une ligne cadenas.
   - Panneau non-Pro et apercus floutes : FAUX CHIFFRES CONSTANTS, jamais lus dans
     une reponse (aria-hidden, inert).

   COMPOSANTS (exigence de Clement du 04/10, 5 h 20 : de vrais composants, aucun
   dessin fait main), licences dans assets/vendor/LICENCES.txt :
   - graphiques : Chart.js 4.5.1 + chartjs-plugin-datalabels 2.2.0 (MIT), charges
     a la demande (lib/composants.js#graphiques) ;
   - jauges : Magic UI « Animated Circular Progress Bar » ; « Et si » : anneau Chart.js,
     chances ecrites directement a leur valeur finale (aucun compteur qui defile) ;
   - onglets : HyperUI « Tabs » n° 2 ; pastilles de chance : HyperUI « Badges » ;
     arbitre : HyperUI « Stats » n° 3 ;
   - tiroir du telephone : Flowbite « Drawer » (placement bottom) ;
   - icones : Lucide (lib/icones.js). */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IasharkMatchSections = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (G) {
  "use strict";

  // ---------------------------------------------------------------- outils
  var hasOwn = Object.prototype.hasOwnProperty;
  function t(key, fb) { return (G && G.I18N && G.I18N.t) ? G.I18N.t(key, fb) : fb; }
  function tf(key, fb, vars) {
    var s = String(t(key, fb));
    return vars ? s.replace(/\{(\w+)\}/g, function (m, k) { return hasOwn.call(vars, k) && vars[k] != null ? vars[k] : m; }) : s;
  }
  function L() { return (G && G.I18N && G.I18N.localeTag) ? G.I18N.localeTag() : "fr-FR"; }
  function estFr() { return !(G && G.I18N && G.I18N.locale) || G.I18N.locale === "fr"; }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function n(v) { if (v === null || v === undefined || v === "") return null; var x = Number(v); return Number.isFinite(x) ? x : null; }
  function dec(v, d) { return Number(v).toLocaleString(L(), { minimumFractionDigits: d, maximumFractionDigits: d }); }
  function ent(v) { return Number(v).toLocaleString(L(), { maximumFractionDigits: 0 }); }
  function pc(v) { return (Number(v) / 100).toLocaleString(L(), { style: "percent", maximumFractionDigits: 0 }); }
  function pts(v) { var r = Math.round(v); return (r > 0 ? "+" : r < 0 ? "−" : "") + ent(Math.abs(r)) + " " + t("match_v4.pts", "pts"); }
  function lien(p) { return (G && G.I18N && G.I18N.href) ? G.I18N.href(p) : "/" + p; }
  function nomEq(e) { return e && (e.name || e.n) || ""; }
  function K() { return G && G.IasharkComposants; }
  function ico(k, cls) { var I = G && G.IasharkIcones; return I ? I.svg(k, cls || "x-ico") : ""; }
  // Graphique Chart.js (spec JSON) ; sans le module, rien (la section garde ses textes).
  function graphe(spec, o) { var C = K(); return C ? C.canvas(spec, o) : ""; }
  // Ligne cadenas (Pro seulement) : texte seul, aucun chiffre, aucun lien de paiement
  // (le panneau Marches porte le seul bouton « Passe Pro » de la page).
  function cadenas(texte) { return '<p class="x-lock">' + ico("lock") + "<span>" + esc(texte) + "</span></p>"; }
  function carte(cle, icone, titre, corps, sous) {
    return '<section class="card x-card x-' + cle + ' reveal" aria-labelledby="x-' + cle + '-t"><div class="x-h"><h2 id="x-' + cle + '-t">' + (icone ? '<span class="x-hico">' + ico(icone) + "</span>" : "") + "<span>" + titre + "</span></h2>"
      + (sous ? '<p class="x-sub">' + esc(sous) + "</p>" : "") + "</div>" + corps + "</section>";
  }
  // Repartition en entiers dont la somme vaut exactement total (plus forts restes).
  function repartir(valeurs, total) {
    var s = valeurs.reduce(function (a, b) { return a + b; }, 0);
    if (!(s > 0)) return valeurs.map(function () { return 0; });
    var brut = valeurs.map(function (v) { return v / s * total; });
    var base = brut.map(Math.floor);
    var reste = total - base.reduce(function (a, b) { return a + b; }, 0);
    brut.map(function (v, i) { return { i: i, r: v - Math.floor(v) }; }).sort(function (a, b) { return b.r - a.r || a.i - b.i; })
      .slice(0, reste).forEach(function (x) { base[x.i]++; });
    return base;
  }
  // Couleurs des graphiques (cyan et gris du site ; vert / rouge jamais ici).
  var COUL = { dom: "#20d5ef", domL: "rgba(32,213,239,.38)", nul: "#64748b", ext: "#cbd5e1", extL: "rgba(203,213,225,.34)", ligne: "#f4f7fb", grille: "rgba(255,255,255,.07)" };

  // ------------------------------------------------------------ registre
  // add(cle, section) : la section (ancre « sec-<section> ») ou l'information est ecrite ;
  // ou(cle) la rend (le panneau y renvoie au lieu de reecrire le chiffre).
  function registre() {
    var cles = {};
    return {
      has: function (k) { return hasOwn.call(cles, k); },
      add: function (k, ou) { if (!hasOwn.call(cles, k)) cles[k] = ou || true; },
      ou: function (k) { return hasOwn.call(cles, k) && typeof cles[k] === "string" ? cles[k] : null; },
      list: function () { return Object.keys(cles); }
    };
  }
  var ISSUE_DU_PARI = { "home-win": "issue:dom", "draw": "issue:nul", "away-win": "issue:ext" };
  var RAISONS_CONNUES = ["xg", "goals_avg", "h2h_hits", "absences", "form_wins", "count_shots", "count_shots_on", "count_corners", "count_cards"];
  // Cles affichees par l'Avis (match-page.js#signalCard) : le pari, son issue, et les
  // 3 premieres raisons de « Pourquoi ce pari » qui ont un texte.
  function clesAvis(vm, raw, dit) {
    var r = vm && vm.model && vm.model.recommendation;
    if (!r) return;
    dit.add("pari", "avis");
    var id = String(raw && raw.market_id || "");
    if (ISSUE_DU_PARI[id]) dit.add(ISSUE_DU_PARI[id], "avis");
    if (/^dc-/.test(id)) dit.add("dc:" + id.slice(3), "avis");
    var raisons = (vm.editorial && vm.editorial.signalReasons || []).filter(function (x) { return x && RAISONS_CONNUES.indexOf(x.key) !== -1; }).slice(0, 3);
    raisons.forEach(function (x) { dit.add("raison:" + x.key, "avis"); });
  }
  // ------------------------------------------------- D. si ce match se jouait 10 000 fois
  // Source UNIQUE : sim_resume (pipeline, lib/sections-match.js#resumeSur10000) : comptes
  // exacts de la grille du v3 (pourcentage entier x 100), memes arrondis que le panneau,
  // l'issue du pari portant exactement la chance de l'Avis. Absent (couverture du v3 non
  // verifiee, feu du mathematicien non vert) : la section n'existe pas.
  function resume(raw) {
    var r = raw && raw.sim_resume;
    return r && typeof r === "object" && n(r.base) === 10000 ? r : null;
  }
  // Compte sur 10 000 -> pourcentage entier (null si ce n'est pas un multiple de 100).
  function centaines(v) { var x = n(v); return x !== null && x >= 0 && x <= 10000 && x % 100 === 0 ? x / 100 : null; }
  function issuesAffichees(raw) {
    var r = resume(raw), i = r && r.issues;
    if (!i || typeof i !== "object") return null;
    var v = [centaines(i.dom), centaines(i.nul), centaines(i.ext)];
    return v.every(function (x) { return x !== null; }) && v[0] + v[1] + v[2] === 100 ? v : null;
  }
  // Scores les plus probables de la grille, SANS filtre du pari (5 au plus, ordre du pipeline).
  function scoresAffiches(raw) {
    var r = resume(raw);
    return (r && Array.isArray(r.scores) ? r.scores : []).map(function (s) { return { score: String(s && s.score || ""), v: centaines(s && s.n) }; })
      .filter(function (x) { return /^\d+-\d+$/.test(x.score) && x.v !== null && x.v >= 1; }).slice(0, 5);
  }
  // Nombre de buts : 0 / 1 / 2 / 3 / 4+ (ou « 1-2 » fusionne par le pipeline), somme 100.
  function butsAffiches(raw) {
    var r = resume(raw);
    var l = (r && Array.isArray(r.total_buts) ? r.total_buts : []).map(function (b) { return { buts: String(b && b.buts || ""), v: centaines(b && b.n) }; });
    if (!l.length || !l.every(function (x) { return /^\d+(\+|-\d+)?$/.test(x.buts) && x.v !== null; })) return null;
    return l.reduce(function (s, x) { return s + x.v; }, 0) === 100 ? l : null;
  }
  // Lignes du panneau (marches_panneau, Pro) par identifiant.
  function lignesPanneau(raw) {
    var mp = raw && raw.marches_panneau, out = {};
    if (!mp || !Array.isArray(mp.familles)) return out;
    mp.familles.forEach(function (f) {
      (f && Array.isArray(f.marches) ? f.marches : []).forEach(function (m) { if (m && m.id != null && n(m.chance) !== null) out[String(m.id)] = m; });
    });
    return out;
  }
  var AXE_SCORES = { grid: { display: false }, border: { display: false }, ticks: { color: "#f4f7fb", font: { family: '"DM Sans", system-ui, sans-serif', size: 13, weight: "700" } } };
  function simulation(c) {
    var raw = c.raw, vm = c.vm, dit = c.dit;
    var dom = nomEq(vm.identity.home), ext = nomEq(vm.identity.away);
    var issues = issuesAffichees(raw);
    var scores = scoresAffiches(raw);
    var buts = butsAffiches(raw);
    var xg = vm.model && vm.model.expectedGoals;
    if (!issues && !scores.length && !buts) return "";
    var corps = "";
    if (issues) {
      var ISS = [["dom", tf("match_v4.sim_home_wins", "{team} gagne", { team: dom }), COUL.dom], ["nul", t("match_v4.sim_draw", "Match nul"), COUL.nul], ["ext", tf("match_v4.sim_home_wins", "{team} gagne", { team: ext }), COUL.ext]];
      // Nombres affiches (pour l'ecart de « Et si ») : ceux de cette section, ou
      // la chance de l'Avis pour l'issue de son pari (une seule source).
      c.base = issues.slice();
      var idPari = { "home-win": 0, "draw": 1, "away-win": 2 }[String(raw.market_id || "")];
      if (idPari !== undefined && n(raw.chance_iashark) !== null) c.base[idPari] = Math.round(n(raw.chance_iashark));
      var legende = ISS.map(function (x, i) {
        var cle = "issue:" + x[0], deja = dit.has(cle);
        var val = deja ? '<a class="x-ref" href="#sec-avis">' + ico("arrow-up", "x-ico x-ico-s") + esc(t("match_v4.in_avis", "dans l’avis")) + "</a>"
          : '<b class="x-count">' + esc(tf("match_v4.sim_about", "≈ {n} fois", { n: ent(issues[i] * 100) })) + "</b>";
        dit.add(cle, "sim");
        return '<li><span class="x-sw" style="background:' + x[2] + '"></span><span class="x-lab">' + esc(x[1]) + "</span>" + val + "</li>";
      }).join("");
      var donut = graphe({ type: "doughnut", data: { labels: ISS.map(function (x) { return x[1]; }), datasets: [{ data: issues, backgroundColor: ISS.map(function (x) { return x[2]; }), borderColor: "#0d1520", borderWidth: 3, hoverOffset: 0 }] },
        options: { cutout: "62%", plugins: { tooltip: { enabled: false } } } },
        { hauteur: 170, cls: "x-donut", aria: tf("match_v4.sim_aria", "Sur 10 000 matchs : {home} gagne environ {a} fois, nul environ {b} fois, {away} gagne environ {c} fois.", { home: dom, away: ext, a: ent(issues[0] * 100), b: ent(issues[1] * 100), c: ent(issues[2] * 100) }) });
      corps += '<div class="x-sim-g">' + donut + '<ul class="x-legend">' + legende + "</ul></div>";
    }
    if (scores.length) {
      var lab = scores.map(function (s) { return s.score.replace("-", " – "); });
      var vals = scores.map(function (s) {
        var cle = "score:" + s.score;
        var deja = dit.has(cle);
        dit.add(cle, "sim");
        if (s.score === "0-0") dit.add("zero_zero", "sim");
        return deja ? null : s.v * 100;
      });
      corps += '<div class="x-block"><h3>' + esc(t("match_v4.sim_scores_title", "Les scores les plus probables")) + "</h3>"
        + graphe({ type: "bar", data: { labels: lab, datasets: [{ data: vals, backgroundColor: COUL.dom, borderRadius: 6, barThickness: 18 }] },
          options: { indexAxis: "y", layout: { padding: { right: 64 } }, scales: { x: { display: false, beginAtZero: true, grace: "8%" }, y: AXE_SCORES } },
          etiquettes: { format: "environ", ancre: "end", alignement: "end", couleur: "#a3b1c2", taille: 12 } },
          { hauteur: 40 + scores.length * 30, aria: scores.map(function (s, i) { return lab[i] + (vals[i] != null ? " : " + tf("match_v4.sim_about", "≈ {n} fois", { n: ent(vals[i]) }) : ""); }).join(" ; ") })
        + '<p class="x-note">' + esc(t("match_v4.sim_scores_note", "Un score exact reste très incertain : même le plus probable n’arrive pas souvent.")) + "</p></div>";
    }
    if (buts) {
      // « 0 but » = le score 0-0 (meme evenement, meme chiffre) : deja ecrit, la barre
      // garde sa place mais son nombre n'est pas reecrit (une note renvoie au 0 – 0).
      var zero = dit.has("zero_zero");
      var labB = buts.map(function (b) { return b.buts; });
      var valsB = buts.map(function (b) { return b.v * 100; });
      var montrerB = buts.map(function (b) { return !(b.buts === "0" && zero); });
      if (buts.some(function (b) { return b.buts === "0"; })) { dit.add("zero_zero", "sim"); dit.add("ligne_buts:0.5", "sim"); }
      // Derniere barre « k+ » = « plus de k - 0,5 buts » (et son contraire « moins de ») :
      // meme evenement, meme chiffre, ecrit ici une seule fois (controle UX du 04/10).
      var der = /^(\d+)\+$/.exec(buts[buts.length - 1].buts);
      if (der && Number(der[1]) >= 1) dit.add("ligne_buts:" + (Number(der[1]) - 0.5), "sim");
      dit.add("buts_total", "sim");
      corps += '<div class="x-block"><h3>' + esc(t("match_v4.sim_goals_title", "Le nombre de buts du match")) + "</h3>"
        + graphe({ type: "bar", data: { labels: labB, datasets: [{ data: valsB, backgroundColor: COUL.domL, borderColor: COUL.dom, borderWidth: 1, borderRadius: 6, maxBarThickness: 46, datalabels: { display: montrerB } }] },
          options: { layout: { padding: { top: 24 } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: "#f4f7fb", maxRotation: 0, font: { family: '"DM Sans", system-ui, sans-serif', size: 13, weight: "700" } } }, y: { display: false, beginAtZero: true, grace: "12%" } } },
          etiquettes: { format: "environ", ancre: "end", alignement: "end", couleur: "#a3b1c2", taille: 12 } },
          { hauteur: 190, aria: buts.map(function (b, i) { return tf("match_v4.sim_goals_aria", "{n} but(s)", { n: b.buts }) + (montrerB[i] ? " : " + tf("match_v4.sim_about", "≈ {n} fois", { n: ent(valsB[i]) }) : ""); }).join(" ; ") })
        + (montrerB.indexOf(false) !== -1 ? '<p class="x-note">' + esc(t("match_v4.sim_goals_zero_ref", "0 but = le score 0 – 0 ci-dessus.")) + "</p>" : "")
        + "</div>";
    }
    if (xg && n(xg.home) !== null && n(xg.away) !== null && !dit.has("raison:xg") && !dit.has("xg")) {
      corps += '<p class="x-line">' + esc(tf("match_v4.sim_xg", "Buts attendus : {home} {hx} – {ax} {away}", { home: dom, away: ext, hx: dec(xg.home, 1), ax: dec(xg.away, 1) })) + "</p>";
      dit.add("xg", "sim");
    }
    return carte("sim", "repeat", esc(t("match_v4.sim_title", "Si ce match se jouait 10 000 fois")), corps,
      t("match_v4.sim_sub", "Nos chances ramenées à 10 000 matchs, arrondies à la centaine ; l’issue du pari garde la chance de l’avis. Une estimation, pas une garantie."));
  }

  // ------------------------------------------------- E. le film du match
  var TRANCHES = ["1-15", "16-30", "31-45+", "46-60", "61-75", "76-90+"];
  function serie6(x) {
    if (!Array.isArray(x) || x.length !== 6) return null;
    var v = x.map(function (y) { return Array.isArray(y) ? n(y[0]) : n(y); });
    return v.every(function (y) { return y !== null && y >= 0; }) ? v : null;
  }
  // Buts par match et par tranche : Book (Pro, 2 ans) sinon derniers matchs (public).
  function profilTranches(raw, cote, vuePro) {
    var sb = vuePro && raw.stats_iashark && typeof raw.stats_iashark === "object" ? raw.stats_iashark : null;
    var p = sb && sb[cote === "home" ? "dom" : "ext"];
    var tr = p && p.tout && p.tout.tranches;
    if (tr && n(tr.n) !== null && n(tr.n) >= 15) {
      var pour = serie6(tr.pour), contre = serie6(tr.contre);
      if (pour && contre) return { pour: pour, contre: contre, n: n(tr.n), source: "book" };
    }
    var ev = raw["events_" + cote];
    var g = ev && n(ev.games);
    var lire = function (l) {
      if (!Array.isArray(l) || l.length !== 6 || !(g > 0)) return null;
      var v = l.map(function (x) { return n(x && x.n); });
      return v.every(function (y) { return y !== null && y >= 0; }) ? v.map(function (y) { return y / g; }) : null;
    };
    var a = lire(ev && ev.slots), b = lire(ev && ev.slots_against);
    return a && b ? { pour: a, contre: b, n: g, source: "derniers" } : null;
  }
  function arr2(v) { return Math.round(v * 100) / 100; }
  // 6 chances entre 0 et 1 (sim_15min.tr, tr_dom, tr_ext), sinon null.
  function chances6(x) {
    if (!Array.isArray(x) || x.length !== 6) return null;
    var v = x.map(n);
    return v.every(function (y) { return y !== null && y >= 0 && y <= 1; }) ? v : null;
  }
  function film(c) {
    var raw = c.raw, vm = c.vm, dit = c.dit;
    var H = profilTranches(raw, "home", c.vuePro), A = profilTranches(raw, "away", c.vuePro);
    if (!H || !A) return "";
    var dom = nomEq(vm.identity.home), ext = nomEq(vm.identity.away);
    var s15 = c.vuePro && raw.sim_15min && typeof raw.sim_15min === "object" ? raw.sim_15min : null;
    var sim = s15 ? chances6(s15.tr) : null;
    // a2 : chance que CHAQUE equipe marque dans la tranche (tr_dom, tr_ext ; « encaisse »
    // de l'une = « marque » de l'autre : un seul chiffre par equipe).
    var simD = sim && s15 ? chances6(s15.tr_dom) : null, simE = sim && s15 ? chances6(s15.tr_ext) : null;
    if (!simD || !simE) { simD = null; simE = null; }
    var datasets = [
      { label: tf("match_v4.film_scores", "{team} marque", { team: dom }), data: H.pour.map(arr2), backgroundColor: COUL.dom, stack: "h", borderRadius: 3, order: 2 },
      { label: tf("match_v4.film_concedes", "{team} encaisse", { team: dom }), data: H.contre.map(function (v) { return -arr2(v); }), backgroundColor: COUL.domL, stack: "h", borderRadius: 3, order: 2 },
      { label: tf("match_v4.film_scores", "{team} marque", { team: ext }), data: A.pour.map(arr2), backgroundColor: COUL.ext, stack: "a", borderRadius: 3, order: 2 },
      { label: tf("match_v4.film_concedes", "{team} encaisse", { team: ext }), data: A.contre.map(function (v) { return -arr2(v); }), backgroundColor: COUL.extL, stack: "a", borderRadius: 3, order: 2 }
    ];
    // Axe du temps = la rangee d'onglets juste dessous (6 colonnes alignees sur les
    // 6 tranches) : le graphique n'a ni graduation ni etiquette propre.
    var scales = { x: { stacked: true, grid: { display: false }, border: { color: "rgba(255,255,255,.18)" }, ticks: { display: false } },
      // Axe vertical sans graduation : seules ses lignes restent (la ligne du zero
      // separe les buts marques, au-dessus, des buts encaisses, en dessous).
      y: { stacked: true, display: true, ticks: { display: false, maxTicksLimit: 3 }, border: { display: false }, grid: { color: "rgba(255,255,255,.12)", drawTicks: false } } };
    var spec = { type: "bar", data: { labels: TRANCHES, datasets: datasets }, options: { scales: scales, layout: { padding: { top: 18, left: 0, right: 0 } }, interaction: { mode: "index", intersect: false } } };
    // La chance d'au moins un but (modele, en %) a SON graphique, avec son echelle, sous les
    // barres et aligne sur les memes 6 colonnes (controle UX du 04/10 : la courbe posee sur
    // l'axe des buts, sans echelle, recouvrait les barres).
    var courbe = "";
    if (sim) {
      var pcts = sim.map(function (x) { return Math.round(x * 100); });
      var haut = Math.min(100, Math.max(40, Math.ceil((Math.max.apply(null, pcts) + 12) / 10) * 10));
      courbe = '<h3 class="f-line-t">' + esc(t("match_v4.film_line", "Chance d’au moins un but (modèle)")) + "</h3>"
        + graphe({ type: "line", data: { labels: TRANCHES, datasets: [{ label: t("match_v4.film_line", "Chance d’au moins un but (modèle)"), data: pcts, borderColor: COUL.dom, backgroundColor: COUL.dom,
          borderWidth: 2, pointRadius: 3, pointHoverRadius: 3, tension: 0.35, fill: false }] },
          options: { layout: { padding: { top: 20, left: 6, right: 6 } }, scales: { x: { offset: true, grid: { display: false }, border: { display: false }, ticks: { display: false } },
            y: { min: 0, max: haut, border: { display: false }, grid: { color: "rgba(255,255,255,.07)", drawTicks: false }, ticks: { maxTicksLimit: 3, padding: 6 } } } },
          etiquettes: { format: "pct", ancre: "end", alignement: "top", taille: 11, extra: { display: true } }, ticks: { y: "pct" } },
          { hauteur: 130, aria: TRANCHES.map(function (lab, i) { return lab + " : " + pc(pcts[i]); }).join(" ; "), attrs: 'data-f-chart="2"' });
    }
    dit.add("film", "film");
    if (sim) dit.add("but_par_tranche", "film");
    if (simD) dit.add("but_equipe_tranche", "film");
    var echantillon = H.source === "book"
      ? tf("match_v4.film_sample_book", "Buts par match, sur {h} matchs de {home} et {a} de {away} (archive IASHARK).", { h: ent(H.n), a: ent(A.n), home: dom, away: ext })
      : (H.n === A.n ? tf("match_v4.film_sample_last_same", "Buts par match, sur leurs {n} derniers matchs.", { n: ent(H.n) })
        : tf("match_v4.film_sample_last", "Buts par match, sur les {h} derniers matchs de {home} et les {a} de {away}.", { h: ent(H.n), a: ent(A.n), home: dom, away: ext }));
    var legende = '<ul class="x-keys"><li><span class="x-sw" style="background:' + COUL.dom + '"></span>' + esc(dom) + '</li><li><span class="x-sw" style="background:' + COUL.ext + '"></span>' + esc(ext) + "</li></ul>"
      + '<p class="x-note x-note-top">' + esc(t("match_v4.film_legend", "en haut : buts marqués · en bas : buts encaissés")) + "</p>";
    // Detail d'une tranche : onglets HyperUI (clavier) et clic sur le graphique.
    var details = TRANCHES.map(function (lab, i) {
      return tf("match_v4.film_detail", "{slot} : {home} marque {hp} but par match, {away} en encaisse {ac} · {away} marque {ap}, {home} en encaisse {hc}.",
        { slot: lab, home: dom, away: ext, hp: dec(H.pour[i], 2), ac: dec(A.contre[i], 2), ap: dec(A.pour[i], 2), hc: dec(H.contre[i], 2) })
        + (simD ? " " + tf("match_v4.film_detail_model", "Chance de marquer dans ce quart d’heure (modèle) : {home} {hp}, {away} {ap}.",
          { home: dom, away: ext, hp: pc(Math.round(simD[i] * 100)), ap: pc(Math.round(simE[i] * 100)) }) : "");
    });
    var onglets = '<div class="hu-tabs x-tabs f-tabs"><div class="hu-tablist" role="tablist" aria-label="' + esc(t("match_v4.film_aria", "Quarts d’heure du match")) + '">'
      + TRANCHES.map(function (lab, i) { return '<button type="button" role="tab" class="hu-tab" aria-selected="' + (i === 5 ? "true" : "false") + '" data-f="' + i + '">' + esc(lab) + "</button>"; }).join("") + "</div></div>";
    var corps = legende
      + graphe(spec, { hauteur: 210, aria: t("match_v4.film_aria", "Quarts d’heure du match"), attrs: 'data-f-chart="1"' })
      + courbe
      + onglets
      + '<p class="f-detail" aria-live="polite" data-f-detail data-f-all="' + esc(JSON.stringify(details)) + '">' + esc(details[5]) + "</p>"
      + '<p class="x-note">' + esc(echantillon) + "</p>"
      + (c.verrouPro ? cadenas(t("match_v4.film_lock", "La chance d’un but par quart d’heure (modèle) : Pro.")) : "");
    return carte("film", "clapperboard", esc(t("match_v4.film_title", "Le film du match")), corps, t("match_v4.film_sub", "Six quarts d’heure. Touche une tranche pour lire ses chiffres."));
  }

  // ---------------------------------------- F. qui ouvre le score + Et si
  function entier(v, min, max) { var x = n(v); return x !== null && Math.round(x) === x && x >= min && x <= max ? x : null; }
  // c1 (GO) : premier_but du pipeline (grille v3, memes arrondis que le panneau, somme
  // 100, « aucun » = le 0-0 affiche). Verdict des marches : PREMIER_BUT:ext faux dans la
  // tranche 10-20 %, PREMIER_BUT:dom hors tolerance dans la tranche 80-90 % : rien dans
  // ces cas. -> [domicile, aucun but, exterieur] ou null.
  function premierBut(raw) {
    var pb = raw && raw.premier_but;
    if (!pb || typeof pb !== "object") return null;
    var h = entier(pb.dom, 0, 100), a = entier(pb.ext, 0, 100), z = entier(pb.aucun, 0, 100);
    if (h === null || a === null || z === null || h + a + z !== 100) return null;
    if (a >= 10 && a < 20) return null;
    if (h >= 80 && h < 90) return null;
    return [h, z, a];
  }
  // b1 / b2 : si_affiche du pipeline (deja arrondi a 5 points, somme 100), jamais
  // recalcule ici. -> [[p1, pn, p2] x 3 scenarios] ou null.
  var SCENARIOS = ["dom_premier", "ext_premier", "nul_pause"];
  function etSi(s15) {
    var sa = s15 && s15.si_affiche;
    if (!sa || typeof sa !== "object") return null;
    var d = SCENARIOS.map(function (k) { var o = sa[k]; return o && typeof o === "object" ? [entier(o.p1, 0, 100), entier(o.pn, 0, 100), entier(o.p2, 0, 100)] : null; });
    return d.every(function (v) { return v && v.every(function (x) { return x !== null && x % 5 === 0; }) && v[0] + v[1] + v[2] === 100; }) ? d : null;
  }
  // c3 (GO avec condition) : v3_premiers_buteurs, 3 au plus, titulaires probables,
  // pourcentage entier. Toujours une chance, jamais « il marquera le premier ».
  function premiersButeurs(raw) {
    var l = Array.isArray(raw && raw.v3_premiers_buteurs) ? raw.v3_premiers_buteurs : [];
    return l.filter(function (b) { return b && (b.cote === "home" || b.cote === "away") && typeof b.joueur === "string" && b.joueur.trim() && entier(b.chance, 1, 99) !== null; }).slice(0, 3);
  }
  function premier(c) {
    var raw = c.raw, vm = c.vm, dit = c.dit;
    var dom = nomEq(vm.identity.home), ext = nomEq(vm.identity.away);
    var pb = c.vuePro && raw.premier_but && typeof raw.premier_but === "object" ? raw.premier_but : null;
    var parts = c.vuePro ? premierBut(raw) : null;
    var avant = pb ? entier(pb.avant_pause, 1, 99) : null;
    var s15 = c.vuePro && raw.sim_15min && typeof raw.sim_15min === "object" ? raw.sim_15min : null;
    var minute = s15 ? entier(s15.minute_mediane_premier_but, 1, 90) : null;
    var donnees = s15 ? etSi(s15) : null;
    var buteurs = c.vuePro ? premiersButeurs(raw) : [];
    var SC = [tf("match_v4.whatif_home", "Si {team} marque en premier", { team: dom }), tf("match_v4.whatif_home", "Si {team} marque en premier", { team: ext }), t("match_v4.whatif_ht", "Si c’est 0-0 à la pause")];
    // Onglets : libelles courts, 3 colonnes egales (controle UX du 04/10 : au telephone, les
    // phrases entieres sortaient de l'ecran sans signe qu'on pouvait faire glisser).
    var COURT = [tf("match_v4.whatif_tab_team", "{team} ouvre", { team: dom }), tf("match_v4.whatif_tab_team", "{team} ouvre", { team: ext }), t("match_v4.whatif_tab_ht", "0-0 à la pause")];
    if (!parts && avant === null && minute === null && !buteurs.length && !donnees) {
      return c.verrouPro ? carte("premier", "goal", esc(t("match_v4.first_title", "Qui ouvre le score ?")), cadenas(t("match_v4.first_lock", "Qui marque en premier et « Et si… ? » : Pro.")), "") : "";
    }
    var corps = "";
    if (parts) {
      var sansNombre = dit.has("zero_zero") || dit.has("score:0-0");
      var lab = [dom, t("match_v4.first_none", "aucun but"), ext];
      var data = [[parts[0]], [parts[1]], [parts[2]]];
      corps += graphe({ type: "bar", data: { labels: [""], datasets: [0, 1, 2].map(function (i) {
        return { label: lab[i], data: data[i], backgroundColor: [COUL.dom, COUL.nul, COUL.ext][i], borderWidth: 0, borderRadius: 4, borderSkipped: false, barThickness: 34,
          datalabels: { display: !(i === 1 && sansNombre) && parts[i] >= 9, anchor: "center", align: "center", color: i === 1 ? "#f4f7fb" : "#04131c" } };
      }) }, options: { indexAxis: "y", scales: { x: { stacked: true, display: false, max: 100 }, y: { stacked: true, display: false } } },
        etiquettes: { format: "pct", ancre: "center", alignement: "center", taille: 12, extra: { display: true } } },
        { hauteur: 46, cls: "x-first", aria: lab.map(function (l, i) { return l + (i === 1 && sansNombre ? "" : " " + pc(parts[i])); }).join(" · ") })
        + '<ul class="x-keys"><li><span class="x-sw" style="background:' + COUL.dom + '"></span>' + esc(tf("match_v4.first_team", "{team} marque en premier", { team: dom })) + (parts[0] < 9 ? " " + esc(pc(parts[0])) : "") + "</li>"
        + '<li><span class="x-sw" style="background:' + COUL.nul + '"></span>' + esc(lab[1]) + (sansNombre ? ' <a class="x-ref" href="#sec-' + (dit.ou("zero_zero") || "sim") + '">' + ico("arrow-up", "x-ico x-ico-s") + esc(t("match_v4.in_sim", "dans « 10 000 matchs »")) + "</a>" : (parts[1] < 9 ? " " + esc(pc(parts[1])) : "")) + "</li>"
        + '<li><span class="x-sw" style="background:' + COUL.ext + '"></span>' + esc(tf("match_v4.first_team", "{team} marque en premier", { team: ext })) + (parts[2] < 9 ? " " + esc(pc(parts[2])) : "") + "</li></ul>";
      dit.add("premier_but", "premier");
      dit.add("zero_zero", "premier");
    }
    // c2 : « premier but avant la pause » (= au moins un but en 1re mi-temps, meme chiffre
    // que le panneau) et la minute mediane ; jamais « le quart d'heure le plus probable ».
    var faits = [];
    if (avant !== null) { faits.push(tf("match_v4.first_before_ht", "Premier but avant la pause : {p}.", { p: pc(avant) })); dit.add("mt_plus05", "premier"); }
    if (minute !== null) { faits.push(tf("match_v4.first_median", "Une fois sur deux, le premier but tombe avant la {m}e minute.", { m: minute })); dit.add("minute_mediane", "premier"); }
    if (faits.length) corps += '<ul class="x-facts">' + faits.map(function (f) { return "<li>" + ico("clock", "x-ico x-ico-s") + "<span>" + esc(f) + "</span></li>"; }).join("") + "</ul>";
    if (buteurs.length) {
      var POSTE = { G: ["match_v4.pos_g", "Gardien"], D: ["match_v4.pos_d", "Défenseur"], M: ["match_v4.pos_m", "Milieu"], F: ["match_v4.pos_f", "Attaquant"] };
      var haut = entier(buteurs[0].chance, 1, 99);
      corps += '<div class="x-block"><h3>' + esc(t("match_v4.first_scorer_title", "Les plus probables pour ouvrir le score")) + '</h3><ul class="b-more">' + buteurs.map(function (b) {
        dit.add("premier_buteur:" + (b.joueur_id != null ? b.joueur_id : b.joueur), "premier");
        var poste = POSTE[b.poste] ? t(POSTE[b.poste][0], POSTE[b.poste][1]) : "";
        return "<li><span>" + esc(b.joueur) + " <small>" + esc(nomEq(b.cote === "home" ? vm.identity.home : vm.identity.away) + (poste ? " · " + poste : "")) + '</small></span><span class="hu-badge lv' + niveau(b.chance) + '">' + esc(pc(b.chance)) + "</span></li>";
      }).join("") + "</ul>"
        + '<p class="x-note">' + esc(tf("match_v4.first_scorer_note", "Chance d’ouvrir le score, titulaires probables. Une chance, pas une certitude : à {p}, c’est à peu près 1 fois sur {k}.", { p: pc(haut), k: ent(Math.max(2, Math.round(100 / haut))) })) + "</p></div>";
    }
    if (!parts && avant === null && minute === null && !buteurs.length && c.verrouPro) {
      corps += cadenas(t("match_v4.first_lock", "Qui marque en premier et « Et si… ? » : Pro."));
    }
    if (donnees) {
      // b1 / b2 : arrondi a 5 points (pipeline) ; ecart calcule sur les nombres affiches (D).
      var base = Array.isArray(c.base) ? c.base : null;
      var onglets = '<div class="hu-tabs x-tabs"><div class="hu-tablist" role="tablist" aria-label="' + esc(t("match_v4.whatif_aria", "Scénarios")) + '">'
        + SC.map(function (x, i) { return '<button type="button" role="tab" class="hu-tab" aria-selected="' + (i === 0 ? "true" : "false") + '" aria-label="' + esc(x) + '" data-e="' + esc(JSON.stringify(donnees[i])) + '">' + esc(COURT[i]) + "</button>"; }).join("") + "</div></div>";
      var lignes = [["dom", tf("match_v4.sim_home_wins", "{team} gagne", { team: dom }), COUL.dom], ["nul", t("match_v4.sim_draw", "Match nul"), COUL.nul], ["ext", tf("match_v4.sim_home_wins", "{team} gagne", { team: ext }), COUL.ext]];
      var liste = '<ul class="x-legend e-list">' + lignes.map(function (x, i) {
        return '<li><span class="x-sw" style="background:' + x[2] + '"></span><span class="x-lab">' + esc(x[1]) + '</span><b class="x-count"><span data-e-v="' + i + '">' + esc(pc(donnees[0][i])) + "</span></b>"
          + (base ? '<em class="e-d" data-ed="' + i + '"></em>' : "") + "</li>";
      }).join("") + "</ul>";
      var donut = graphe({ type: "doughnut", data: { labels: lignes.map(function (x) { return x[1]; }), datasets: [{ data: donnees[0], backgroundColor: lignes.map(function (x) { return x[2]; }), borderColor: "#0d1520", borderWidth: 3 }] },
        options: { cutout: "62%", plugins: { tooltip: { enabled: false } } } }, { hauteur: 150, cls: "x-donut", aria: t("match_v4.whatif_title", "Et si… ?"), attrs: 'data-e-chart="1"' });
      corps += '<div class="e-box"' + (base ? ' data-e-base="' + esc(JSON.stringify(base)) + '"' : "") + '><h3 class="e-k">' + esc(t("match_v4.whatif_title", "Et si… ?")) + "</h3>" + onglets
        + '<div class="x-sim-g">' + donut + liste + "</div>"
        + '<p class="x-note">' + esc(base ? t("match_v4.whatif_note5", "Chances de notre modèle selon le scénario, arrondies à 5 points ; écart avec « Si ce match se jouait 10 000 fois ».")
          : t("match_v4.whatif_note5_nobase", "Chances de notre modèle selon le scénario, arrondies à 5 points.")) + "</p></div>";
      dit.add("et_si", "premier");
    }
    return carte("premier", "goal", esc(t("match_v4.first_title", "Qui ouvre le score ?")), corps, donnees ? t("match_v4.first_sub", "Le match change selon qui frappe le premier. Touche un scénario.") : "");
  }

  // ------------------------------------------------- G. les jumeaux
  // Contrat (verdict g ; lib/jumeaux.js#jumeauxDuMatch, version « jumeaux-1 ») :
  //   { resultat: { n, depuis, niveau: "meme" | "tous", dom, nul, ext, pct: { dom, nul, ext },
  //     exemples: [{ date, ligue, domicile, exterieur, score }] } | null,
  //     buts: { n, depuis, plus_2_5, btts, pct: { plus_2_5, btts } } | null }.
  // Au moins 200 jumeaux, sinon rien. Comptes bruts ; pourcentages du pipeline.
  function jumeaux(c) {
    var raw = c.raw;
    var j = raw.jumeaux;
    if (!j || typeof j !== "object") return "";
    var r = j.resultat, b = j.buts;
    var rOk = r && n(r.n) >= 200 && [r.dom, r.nul, r.ext].every(function (x) { return n(x) !== null && n(x) >= 0; }) && n(r.dom) + n(r.nul) + n(r.ext) === n(r.n) && /^\d{4}$/.test(String(r.depuis || ""));
    var bOk = b && n(b.n) >= 200 && n(b.plus_2_5) !== null && n(b.btts) !== null && n(b.plus_2_5) <= n(b.n) && n(b.btts) <= n(b.n) && /^\d{4}$/.test(String(b.depuis || ""));
    if (!rOk && !bOk) return "";
    var corps = "";
    if (rOk) {
      var tot = n(r.n), cpt = [n(r.dom), n(r.nul), n(r.ext)];
      var pp = r.pct && typeof r.pct === "object" ? [entier(r.pct.dom, 0, 100), entier(r.pct.nul, 0, 100), entier(r.pct.ext, 0, 100)] : null;
      var pcts = pp && pp.every(function (x) { return x !== null; }) ? pp : repartir(cpt, 100);
      var labs = [t("match_v4.twins_home", "Victoire de l’équipe à domicile"), t("match_v4.twins_draw", "Nul"), t("match_v4.twins_away", "Victoire de l’équipe à l’extérieur")];
      corps += '<h3 class="j-t">' + esc(tf("match_v4.twins_result_title", "{n} matchs jumeaux depuis {y}", { n: ent(tot), y: r.depuis })) + "</h3>"
        + '<p class="x-note x-note-top">' + esc(r.niveau === "tous" ? t("match_v4.twins_result_sub_all", "Tous championnats, mêmes chances de victoire à 2 points près.") : t("match_v4.twins_result_sub", "Même niveau, mêmes chances de victoire à 2 points près.")) + "</p>"
        + graphe({ type: "bar", data: { labels: [""], datasets: [0, 1, 2].map(function (i) {
          return { label: labs[i], data: [cpt[i]], backgroundColor: [COUL.dom, COUL.nul, COUL.ext][i], borderRadius: 4, borderSkipped: false, barThickness: 28 };
        }) }, options: { indexAxis: "y", scales: { x: { stacked: true, display: false, max: tot }, y: { stacked: true, display: false } } } },
          { hauteur: 40, cls: "x-first", aria: labs.map(function (l, i) { return l + " : " + ent(cpt[i]); }).join(" · ") })
        // Les nombres ne sont ecrits qu'une fois : dans la legende (pas sur la barre).
        + '<ul class="x-keys">' + labs.map(function (l, i) { return '<li><span class="x-sw" style="background:' + [COUL.dom, COUL.nul, COUL.ext][i] + '"></span>' + esc(l) + " " + esc(tf("match_v4.twins_count", "{c} ({p})", { c: ent(cpt[i]), p: pc(pcts[i]) })) + "</li>"; }).join("") + "</ul>";
      var ex = (Array.isArray(r.exemples) ? r.exemples : []).filter(function (x) { return x && /^\d{4}-\d{2}-\d{2}$/.test(String(x.date || "")) && x.domicile && x.exterieur && /^\d+-\d+$/.test(String(x.score || "").replace(/\s/g, "")); }).slice(0, 3);
      if (ex.length) {
        var date = function (d) { var x = new Date(d + "T12:00:00Z"); return isNaN(x) ? d : x.toLocaleDateString(L(), { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }); };
        corps += '<h3 class="j-t">' + esc(t("match_v4.twins_examples", "Exemples")) + '</h3><ul class="j-ex">' + ex.map(function (x) {
          return '<li class="tc-box"><span class="j-teams"><span>' + esc(x.domicile) + "</span><b>" + esc(String(x.score).replace("-", " – ")) + "</b><span>" + esc(x.exterieur) + '</span></span><small>' + esc(date(x.date) + (x.ligue ? " · " + x.ligue : "")) + "</small></li>";
        }).join("") + "</ul>";
      }
    }
    if (bOk) {
      var nb = n(b.n);
      var po = b.pct && entier(b.pct.plus_2_5, 0, 100) !== null ? b.pct.plus_2_5 : Math.round(b.plus_2_5 / nb * 100);
      var pbt = b.pct && entier(b.pct.btts, 0, 100) !== null ? b.pct.btts : Math.round(b.btts / nb * 100);
      corps += '<p class="x-line">' + esc(tf("match_v4.twins_goals", "Buts : {n} matchs jumeaux depuis {y}. Plus de 2,5 buts dans {o} ({op}), les deux équipes ont marqué dans {b} ({bp}).",
        { n: ent(nb), y: b.depuis, o: ent(b.plus_2_5), op: pc(po), b: ent(b.btts), bp: pc(pbt) })) + "</p>";
    }
    c.dit.add("jumeaux", "jumeaux");
    return carte("jumeaux", "history", esc(t("match_v4.twins_title", "Les jumeaux du match")), corps
      + '<p class="x-note">' + esc(t("match_v4.twins_note2", "Des matchs déjà joués que les bookmakers voyaient comme celui-ci, d’après leurs cotes de clôture. Ce qui s’est passé, pas une prévision.")) + "</p>",
      t("match_v4.twins_sub", "Comment ont fini les matchs qui lui ressemblaient."));
  }

  // --------------------------------------------- H. les deux equipes
  // Radar Chart.js a 6 branches ; echelle : la plus grande des deux valeurs = 80 %
  // (branche inversee : la plus petite). Les valeurs sont dans le tableau (une seule
  // fois) ; une branche citee par l'Avis garde sa forme sans reecrire ses valeurs.
  var AXES = [
    { k: "att", lib: ["match_v4.axis_attack", "Attaque"], unit: ["match_v4.axis_attack_u", "buts marqués par match"], v: function (s, e) { return n(e && e.goals_avg); }, haut: true, d: 1, raison: "goals_avg" },
    { k: "def", lib: ["match_v4.axis_defense", "Défense"], unit: ["match_v4.axis_defense_u", "buts encaissés par match"], v: function (s, e) { return n(e && e.conceded_avg); }, haut: false, d: 1, raison: "goals_avg" },
    { k: "tc", lib: ["match_v4.axis_shots_on", "Tirs cadrés"], unit: ["match_v4.axis_shots_on_u", "par match"], v: function (s) { return n(s && s.shots_on); }, haut: true, d: 1, raison: "count_shots_on" },
    { k: "pos", lib: ["match_v4.axis_possession", "Possession"], unit: ["match_v4.axis_possession_u", "%"], v: function (s) { return n(s && s.possession); }, haut: true, d: 0, raison: null },
    { k: "cor", lib: ["match_v4.axis_corners", "Corners"], unit: ["match_v4.axis_corners_u", "par match"], v: function (s) { return n(s && s.corners); }, haut: true, d: 1, raison: "count_corners" },
    { k: "dis", lib: ["match_v4.axis_discipline", "Discipline"], unit: ["match_v4.axis_discipline_u", "cartons jaunes par match"], v: function (s, e) { return n(e && e.yellow_per_game); }, haut: false, d: 1, raison: "count_cards" }
  ];
  function equipes(c) {
    var raw = c.raw, vm = c.vm, dit = c.dit;
    var sh = raw.match_stats_home, sa = raw.match_stats_away, eh = raw.events_home, ea = raw.events_away;
    var axes = AXES.map(function (a) { return { a: a, h: a.v(sh, eh), w: a.v(sa, ea) }; }).filter(function (x) { return x.h !== null && x.w !== null && (x.h > 0 || x.w > 0); });
    var dom = nomEq(vm.identity.home), ext = nomEq(vm.identity.away);
    var radar = "";
    if (axes.length >= 4) {
      var score = function (x, v) {
        var m = x.a.haut ? Math.max(x.h, x.w) : Math.min(x.h, x.w);
        if (x.a.haut) return m > 0 ? 80 * v / m : 0;
        return v > 0 ? Math.min(100, 80 * m / v) : 80;
      };
      var labs = axes.map(function (x) { return t(x.a.lib[0], x.a.lib[1]); });
      radar = graphe({ type: "radar", data: { labels: labs, datasets: [
        { label: dom, data: axes.map(function (x) { return Math.round(Math.max(6, score(x, x.h))); }), borderColor: COUL.dom, backgroundColor: "rgba(32,213,239,.22)", borderWidth: 2, pointRadius: 2, pointBackgroundColor: COUL.dom },
        { label: ext, data: axes.map(function (x) { return Math.round(Math.max(6, score(x, x.w))); }), borderColor: COUL.ext, backgroundColor: "rgba(203,213,225,.08)", borderWidth: 2, borderDash: [5, 4], pointRadius: 2, pointBackgroundColor: COUL.ext }
      ] }, options: { scales: { r: { min: 0, max: 100, ticks: { display: false, stepSize: 20 }, grid: { color: "rgba(255,255,255,.08)" }, angleLines: { color: "rgba(255,255,255,.08)" },
        pointLabels: { color: "#cbd5e1", font: { size: 12, weight: "600" } } } } } },
        { hauteur: 280, cls: "x-radar", aria: tf("match_v4.radar_aria", "Comparaison de {home} et {away} sur {n} critères", { home: dom, away: ext, n: axes.length }) });
      var lignes = axes.map(function (x) {
        var cache = x.a.raison && dit.has("raison:" + x.a.raison);
        var val = function (v) { return x.a.d ? dec(v, x.a.d) : ent(v) + (x.a.k === "pos" ? " %" : ""); };
        var meilleur = x.h === x.w ? null : (x.a.haut ? (x.h > x.w ? "h" : "a") : (x.h < x.w ? "h" : "a"));
        return '<tr><th scope="row">' + esc(t(x.a.lib[0], x.a.lib[1])) + (x.a.k === "pos" ? "" : " <small>" + esc(t(x.a.unit[0], x.a.unit[1])) + "</small>") + "</th>"
          + (cache ? '<td colspan="2" class="r-ref"><a class="x-ref" href="#sec-avis">' + ico("arrow-up", "x-ico x-ico-s") + esc(t("match_v4.in_avis", "dans l’avis")) + "</a></td>"
            : '<td class="' + (meilleur === "h" ? "is-best" : "") + '">' + esc(val(x.h)) + '</td><td class="' + (meilleur === "a" ? "is-best" : "") + '">' + esc(val(x.w)) + "</td>") + "</tr>";
      }).join("");
      radar += '<ul class="x-keys"><li><span class="x-sw" style="background:' + COUL.dom + '"></span>' + esc(dom) + '</li><li><span class="x-sw x-sw-d"></span>' + esc(ext) + "</li></ul>"
        + '<table class="r-table"><thead><tr><th scope="col"><span class="x-sr">' + esc(t("match_v4.radar_col", "Critère")) + '</span></th><th scope="col">' + esc(dom) + '</th><th scope="col">' + esc(ext) + "</th></tr></thead><tbody>" + lignes + "</tbody></table>";
      axes.forEach(function (x) { dit.add("eq:" + x.a.k); });
    }
    // Bilan au classement (rang et points sont deja dans l'en-tete).
    var cl = raw.classement;
    var ligneDe = function (team, cote) {
      if (!cl || typeof cl !== "object") return null;
      var st = Array.isArray(cl.standings) ? cl.standings.filter(function (s) { return s && team.id != null && Number(s.team_id) === Number(team.id); })[0] : null;
      st = st || (cl[cote] && typeof cl[cote] === "object" ? cl[cote] : null);
      return st && n(st.played) !== null ? st : null;
    };
    var bil = [[vm.identity.home, ligneDe(vm.identity.home, "home")], [vm.identity.away, ligneDe(vm.identity.away, "away")]].filter(function (x) { return x[1]; });
    var bilan = bil.length ? '<ul class="r-rec">' + bil.map(function (x) {
      var s = x[1], gd = n(s.gd);
      return "<li><b>" + esc(nomEq(x[0])) + "</b> " + esc(tf("match_v4.record", "J {p} · V {w} · N {d} · D {l}", { p: s.played, w: s.won, d: s.drawn, l: s.lost }))
        + (gd !== null ? " · " + esc(tf("match_v4.record_gd", "diff. {gd}", { gd: (gd > 0 ? "+" : gd < 0 ? "−" : "") + Math.abs(gd) })) : "") + "</li>";
    }).join("") + "</ul>" : "";
    // Compositions officielles : seulement quand elles existent.
    var lu = raw.lineups && typeof raw.lineups === "object" ? raw.lineups : null;
    var onze = function (team, x) {
      if (!x || !Array.isArray(x.startXI) || !x.startXI.length) return "";
      var j = function (p) { return p && p.player ? p.player : p || {}; };
      return '<div class="r-lu"><h4>' + esc(nomEq(team)) + (x.formation ? " <em>" + esc(x.formation) + "</em>" : "") + "</h4><ol>" + x.startXI.map(j).map(function (p) { return "<li>" + esc(p.name || "") + "</li>"; }).join("") + "</ol>"
        + (x.coach ? "<p>" + esc(t("match_page.lineup_coach", "Entraîneur")) + " : " + esc(x.coach) + "</p>" : "") + "</div>";
    };
    var compos = lu ? onze(vm.identity.home, lu.home) + onze(vm.identity.away, lu.away) : "";
    var plie = compos ? '<details class="r-compos"><summary>' + esc(t("match_v4.lineups_show", "Voir les compositions")) + '</summary><div class="r-lu-grid">' + compos + "</div></details>" : "";
    if (!radar && !bilan && !plie) return "";
    return carte("equipes", "radar", esc(t("match_v4.teams_title", "Les deux équipes")), radar + bilan + plie, radar ? t("match_v4.teams_sub", "Six critères, la plus forte des deux valeurs touche le bord.") : "");
  }

  // --------------------------------------------- I. les joueurs
  function joueurs(c) {
    var raw = c.raw, vm = c.vm, dit = c.dit;
    var v3 = Array.isArray(raw.v3_buteurs) ? raw.v3_buteurs.filter(function (b) {
      return b && (b.cote === "home" || b.cote === "away") && n(b.chance) !== null && n(b.chance) >= 10 && n(b.chance) <= 45 && b.joueur;
    }) : [];
    if (!v3.length) return "";
    v3 = v3.slice().sort(function (a, b) { return (n(b.p_marque) || 0) - (n(a.p_marque) || 0); });
    var saison = {};
    var an = vm.players && vm.players.analytics;
    [an && an.home && an.home.players, an && an.away && an.away.players].forEach(function (l) { (l || []).forEach(function (p) { if (p && p.id != null) saison[String(p.id)] = p; }); });
    var POSTE = { G: ["match_v4.pos_g", "Gardien"], D: ["match_v4.pos_d", "Défenseur"], M: ["match_v4.pos_m", "Milieu"], F: ["match_v4.pos_f", "Attaquant"] };
    var equipe = function (b) { return nomEq(b.cote === "home" ? vm.identity.home : vm.identity.away); };
    var initiales = function (nom) { return String(nom).split(/\s+/).filter(Boolean).slice(0, 2).map(function (m) { return m.charAt(0).toUpperCase(); }).join(""); };
    var C = K();
    var fiche = function (b, i) {
      var s = saison[String(b.joueur_id)] || {};
      var photo = s.photo ? '<img src="' + esc(s.photo) + '" alt="" width="52" height="52" loading="lazy" decoding="async">' : '<span class="b-ini" aria-hidden="true">' + esc(initiales(b.joueur)) + "</span>";
      var stats = [];
      if (n(s.shotsOn90) !== null && n(s.minutes) >= 90) stats.push([dec(s.shotsOn90, 2), t("match_v4.stat_shots_on90", "tirs cadrés / 90 min")]);
      if (n(s.goals90) !== null && n(s.minutes) >= 90) stats.push([dec(s.goals90, 2), t("match_v4.stat_goals90", "buts / 90 min")]);
      var ech = n(s.minutes) >= 90 ? tf("match_v4.stat_sample", "sur {m} minutes jouées", { m: ent(s.minutes) }) : "";
      var pid = n(b.joueur_id);
      var href = pid !== null ? lien("joueur.html?m=" + encodeURIComponent(vm.id) + "&p=" + pid) : null;
      var poste = POSTE[b.poste] ? t(POSTE[b.poste][0], POSTE[b.poste][1]) : "";
      dit.add("buteur:" + b.joueur_id);
      var jauge = C ? C.jauge(b.chance, pc(b.chance), { aria: t("match_v4.scorer_label", "Marquer pendant le match") + " : " + pc(b.chance), grand: i === 0 }) : "<b>" + esc(pc(b.chance)) + "</b>";
      return '<li class="b-card' + (i === 0 ? " is-top" : "") + '"><div class="b-id">' + photo + '<span class="b-n"><b>' + esc(b.joueur) + "</b><small>" + esc(equipe(b)) + (poste ? " · " + esc(poste) : "") + " · " + esc(t("match_v4.probable_starter", "titulaire probable")) + "</small></span>" + jauge + "</div>"
        + '<p class="b-g">' + esc(t("match_v4.scorer_label", "Marquer pendant le match")) + "</p>"
        + (stats.length ? '<dl class="b-stats">' + stats.map(function (x) { return "<div><dt>" + esc(x[1]) + "</dt><dd>" + esc(x[0]) + "</dd></div>"; }).join("") + "</dl>" + (ech ? '<p class="b-ech">' + esc(ech) + "</p>" : "") : "")
        + (href ? '<a class="b-link" href="' + esc(href) + '">' + esc(t("match_page.view_profile_link", "Voir la fiche")) + " " + ico("arrow-right", "x-ico x-ico-s") + "</a>" : "") + "</li>";
    };
    var top = v3.slice(0, 2), autres = v3.slice(2, 6);
    var corps = '<ul class="b-top">' + top.map(fiche).join("") + "</ul>"
      + (autres.length ? '<ul class="b-more">' + autres.map(function (b) { dit.add("buteur:" + b.joueur_id); return "<li><span>" + esc(b.joueur) + " <small>" + esc(equipe(b)) + '</small></span><span class="hu-badge lv' + niveau(b.chance) + '">' + esc(pc(b.chance)) + "</span></li>"; }).join("") + "</ul>" : "")
      + '<p class="x-note">' + esc(t("match_v4.players_note", "Estimé avant les compositions officielles, titulaires probables seulement. Chance arrondie vers le bas, 45 % au plus.")) + "</p>";
    return carte("joueurs", "user-round", esc(t("match_v4.players_title", "Les joueurs")), corps, "");
  }

  // --------------------------------------------- J. l'arbitre (HyperUI Stats n° 3)
  function intervalle(x) { return Array.isArray(x) && x.length === 3 && x.every(function (v) { return n(v) !== null; }) && x[1] <= x[0] && x[0] <= x[2] ? { p: n(x[0]), lo: n(x[1]), hi: n(x[2]) } : null; }
  function arbitre(c) {
    var raw = c.raw;
    // Seule source : stats_iashark.arbitre (Pro), que le pipeline ne pose qu'avec le feu
    // vert du mathematicien (« jamais l'arbitre tant que l'heure de sa nomination n'est
    // pas mesuree ») : jamais le champ public arbitre, jamais le nom seul.
    var a = c.vuePro && raw.stats_iashark && raw.stats_iashark.arbitre;
    var annonce = raw.stats_iashark_gratuit && Array.isArray(raw.stats_iashark_gratuit.detail_pro) && raw.stats_iashark_gratuit.detail_pro.indexOf("arbitre") !== -1;
    var nom = a && typeof a.nom === "string" && a.nom.trim() ? a.nom.trim() : null;
    if (!nom && !(c.verrouPro && annonce)) return "";
    var LIG = [["cartons", "match_v4.ref_cards", "Cartons par match"], ["rouges", "match_v4.ref_reds", "Cartons rouges par match"], ["penaltys", "match_v4.ref_pens", "Penaltys par match"]];
    var corps = "";
    if (a && n(a.n) !== null && n(a.n) >= 30) {
      var tuiles = LIG.map(function (l) {
        var x = a[l[0]], m = x && intervalle(x.m), att = x ? n(x.attendu) : null, ec = x && intervalle(x.ecart);
        if (!m || att === null) return "";
        var net = ec && (ec.lo > 0 || ec.hi < 0);
        var d = m.p < 1 ? 2 : 1;
        var tend = net
          ? '<div class="hu-stat-tr ' + (ec.p > 0 ? "is-up" : "is-down") + '">' + ico(ec.p > 0 ? "trending-up" : "trending-down") + '<span class="x-sr">' + esc(ec.p > 0 ? t("match_v4.ref_more", "Plus que l’attendu :") : t("match_v4.ref_less", "Moins que l’attendu :")) + "</span><span>" + esc((ec.p > 0 ? "+" : "−") + dec(Math.abs(ec.p), d)) + "</span></div>"
          : '<div class="hu-stat-tr">' + ico("minus") + "<span>" + esc(t("match_v4.ref_normal", "dans la norme")) + "</span></div>";
        return '<article class="hu-stat"><div><p class="hu-stat-k">' + esc(t(l[1], l[2])) + '</p><p><span class="hu-stat-v">' + esc(dec(m.p, d)) + '</span> <span class="hu-stat-f">' + esc(tf("match_v4.ref_expected", "attendu {v}", { v: dec(att, d) })) + "</span></p></div>" + tend + "</article>";
      }).filter(Boolean);
      if (tuiles.length) {
        var a0 = String(a.debut || "").slice(0, 4), a1 = String(a.fin || "").slice(0, 4);
        var per = /^\d{4}$/.test(a0) && /^\d{4}$/.test(a1) ? (a0 === a1 ? a0 : a0 + "-" + a1) : "";
        corps = '<div class="hu-stats">' + tuiles.join("") + "</div>"
          + '<p class="x-note">' + esc(per ? tf("match_v4.ref_note", "Sur {n} matchs arbitrés ({period}). Attendu : la moyenne des compétitions et saisons de ses matchs. Écart en couleur seulement s’il est net.", { n: ent(a.n), period: per })
            : tf("match_v4.ref_note_np", "Sur {n} matchs arbitrés. Attendu : la moyenne des compétitions et saisons de ses matchs. Écart en couleur seulement s’il est net.", { n: ent(a.n) })) + "</p>";
        c.dit.add("arbitre_cartons", "arbitre");
      }
    }
    if (!corps && c.verrouPro && annonce) corps = cadenas(t("match_v4.ref_lock", "Ses cartons et penaltys face à l’attendu : Pro."));
    if (!corps) return "";
    return carte("arbitre", "flag", esc(t("match_v4.ref_title", "L’arbitre")) + (nom && corps.indexOf("hu-stats") !== -1 ? ' <span class="a-nom">' + esc(nom) + "</span>" : ""), corps, "");
  }

  // --------------------------------------------- K. le panneau Marches
  // Source UNIQUE : marches_panneau (pipeline, lib/marches-panneau.js, Pro seulement).
  var FAMILLES = {
    resultat: ["match_v4.fam_result", "Résultat"], buts: ["match_v4.fam_goals", "Buts"], btts: ["match_v4.fam_btts", "Les deux marquent"],
    mi_temps: ["match_v4.fam_half", "Mi-temps"], premier_but: ["match_v4.fam_first", "Premier but"], score_exact: ["match_v4.fam_score", "Score exact"],
    corners: ["match_v4.fam_corners", "Corners"], cartons: ["match_v4.fam_cards", "Cartons"], meme_match: ["match_v4.fam_same", "Même match"]
  };
  function donneesPanneau(raw) {
    var mp = raw && raw.marches_panneau;
    if (!mp || !Array.isArray(mp.familles)) return null;
    var out = { familles: [], nb: 0, releve: mp.releve_at || null };
    mp.familles.forEach(function (f) {
      if (!f || !hasOwn.call(FAMILLES, f.cle)) return;
      var lignes = [];
      (Array.isArray(f.marches) ? f.marches : []).forEach(function (m) {
        var ch = n(m && m.chance);
        // Libelles du pipeline en francais : hors France, une ligne n'apparait que traduite.
        var lib = m && (estFr() ? m.libelle : (m.libelle_i18n && G.I18N && m.libelle_i18n[G.I18N.locale]) || null);
        if (!lib || ch === null || ch < 1 || ch > 99) return;
        lignes.push({ id: String(m.id || ""), libelle: String(lib), chance: ch, pari: m.pari_avis === true });
      });
      if (!lignes.length) return;
      out.familles.push({ cle: f.cle, libelle: t(FAMILLES[f.cle][0], FAMILLES[f.cle][1]), marches: lignes });
      out.nb += lignes.length;
    });
    return out.nb ? out : null;
  }
  function niveau(ch) { return ch >= 70 ? 5 : ch >= 60 ? 4 : ch >= 50 ? 3 : ch >= 40 ? 2 : 1; }
  // Ligne du panneau deja ecrite plus haut (meme evenement, meme chiffre) : la section ou
  // elle l'est (ancre), sinon null. Le chiffre n'est jamais reecrit (aucune repetition).
  var REF_LIBELLE = { avis: ["match_v4.panel_avis", "Pari de l’avis"], sim: ["match_v4.panel_sim", "Dans « 10 000 matchs »"], premier: ["match_v4.panel_first", "Dans « 1er but »"], film: ["match_v4.panel_film", "Dans « Film »"] };
  // Identifiants du site des lignes « plus / moins de k,5 buts » (lib/pronostic.js#MARCHE) ->
  // cle du moteur v3 (le panneau garde l'identifiant du site quand il existe).
  var LIGNES_SITE = { "over-15": "TOTAL:plus1.5", "under-15": "TOTAL:moins1.5", "over-25": "TOTAL:plus2.5", "under-25": "TOTAL:moins2.5", "over-35": "TOTAL:plus3.5", "under-35": "TOTAL:moins3.5" };
  function dejaEcrit(id, dit) {
    var issue = ISSUE_DU_PARI[id];
    if (issue && dit.has(issue)) return dit.ou(issue) || "sim";
    if (id === "SCORE:0-0" && dit.has("zero_zero")) return dit.ou("zero_zero") || "sim";
    var score = /^SCORE:\d+-\d+$/.test(id) ? "score:" + id.slice(6) : null;
    if (score && dit.has(score)) return dit.ou(score) || "sim";
    // « Plus / moins de k,5 buts » = une barre du nombre de buts (« 0 but », « 4+ ») : meme
    // evenement (ou son contraire), deja ecrit dans « 10 000 matchs ».
    var ligne = /^TOTAL:(?:plus|moins)(\d+(?:\.\d+)?)$/.exec(LIGNES_SITE[id] || id);
    if (ligne && dit.has("ligne_buts:" + Number(ligne[1]))) return dit.ou("ligne_buts:" + Number(ligne[1])) || "sim";
    // « 1re mi-temps : plus de 0,5 but » = « premier but avant la pause » (section F).
    if (id === "MT_TOTAL:plus0.5" && dit.has("mt_plus05")) return dit.ou("mt_plus05") || "premier";
    // « Premier but avant la 15e minute » = « au moins un but de 1 a 15 » (le film, premier
    // onglet) : un seul chiffre sur la page, celui du film.
    if (id === "PREMIER_BUT:avant15" && dit.has("but_par_tranche")) return dit.ou("but_par_tranche") || "film";
    return null;
  }
  function heure(iso) { var d = new Date(iso); return isNaN(d) ? "" : d.toLocaleTimeString(L(), { hour: "2-digit", minute: "2-digit" }); }
  function legende() {
    return '<p class="mk-legend"><span>' + esc(t("match_v4.panel_legend", "Chance")) + "</span>" + ["< 40", "40", "50", "60", "70+"].map(function (x, i) {
      return '<span class="hu-badge lv' + (i + 1) + '">' + esc(x) + "</span>";
    }).join("") + "</p>";
  }
  function tete(nb) {
    return '<div class="mk-head"><h2 class="mk-title" id="mkTitle">' + ico("sliders-horizontal", "x-ico") + "<span>" + esc(t("match_v4.panel_title", "Marchés")) + "</span>" + (nb ? ' <span class="mk-nb">' + esc(ent(nb)) + "</span>" : "") + "</h2>"
      + '<button type="button" class="fb-close mk-close" data-mk-close aria-label="' + esc(t("match_v4.panel_close", "Fermer les marchés")) + '">' + ico("x") + "</button></div>";
  }
  function panneau(c) {
    var raw = c.raw, vm = c.vm, dit = c.dit;
    var d = donneesPanneau(raw);
    if (!d) return null;
    var groupes = d.familles.map(function (f) {
      return '<section class="mk-fam" data-mk-fam="' + f.cle + '"><h3>' + esc(f.libelle) + "</h3><ul>" + f.marches.map(function (m) {
        var ref = m.pari ? "avis" : dejaEcrit(m.id, dit);
        var droite = ref ? '<a class="mk-ref" href="#sec-' + ref + '">' + esc(REF_LIBELLE[ref] ? t(REF_LIBELLE[ref][0], REF_LIBELLE[ref][1]) : t("match_v4.panel_above", "Plus haut")) + " " + ico("arrow-up", "x-ico x-ico-s") + "</a>"
          : '<span class="hu-badge lv' + niveau(m.chance) + '">' + esc(pc(m.chance)) + "</span>";
        return '<li data-mk-txt="' + esc((m.libelle + " " + f.libelle).toLowerCase()) + '"><span class="mk-l">' + esc(m.libelle) + '</span><span class="mk-r">' + droite + "</span></li>";
      }).join("") + "</ul></section>";
    }).join("");
    var puces = '<div class="hu-tabs mk-tabs"><div class="hu-tablist" role="tablist" aria-label="' + esc(t("match_v4.panel_families", "Familles de marchés")) + '"><button type="button" role="tab" class="hu-tab" aria-selected="true" data-mk-f="">' + esc(t("match_v4.panel_all", "Tous")) + "</button>"
      + d.familles.map(function (f) { return '<button type="button" role="tab" class="hu-tab" aria-selected="false" data-mk-f="' + f.cle + '">' + esc(f.libelle) + "</button>"; }).join("") + "</div></div>";
    var pied = t("match_v4.panel_foot", "Chances calculées par IASHARK : notre modèle, ou le marché sans marge quand le modèle ne le couvre pas. Le pari de l’avis garde la chance affichée dans l’avis.")
      + (d.releve && heure(d.releve) ? " " + tf("match_v4.panel_read_at", "Relevé à {h}.", { h: heure(d.releve) }) : "");
    var dom = nomEq(vm.identity.home), ext = nomEq(vm.identity.away);
    dit.add("marches");
    return {
      nb: d.nb,
      html: tete(d.nb) + '<p class="mk-match">' + esc(dom + " – " + ext) + "</p>"
        + '<label class="mk-search">' + ico("search", "x-ico") + '<span class="x-sr">' + esc(t("match_v4.panel_search_label", "Rechercher un marché")) + '</span><input type="search" data-mk-q placeholder="' + esc(tf("match_v4.panel_search", "Rechercher : buts, mi-temps, {team}…", { team: dom })) + '" autocomplete="off"></label>'
        + puces + legende() + '<div class="mk-groups">' + groupes + '</div><p class="mk-empty" data-mk-empty hidden>' + esc(t("match_v4.panel_empty", "Aucun marché ne correspond.")) + "</p>"
        + '<p class="mk-foot">' + esc(pied) + "</p>"
    };
  }
  // Panneau non-Pro : FAUX libelles et FAUX chiffres CONSTANTS (jamais lus dans une
  // reponse), floutes, aria-hidden et inert ; un cadenas, une ligne, un bouton.
  var FAUX_MARCHES = [["Xxxxxxx xx xxx", 5], ["Xxxx xx x,x xxxx", 4], ["Xxx xxxx xxxxxx xxxxxxx", 3], ["Xxxxxxx xxxxx", 2], ["Xxxx xx x,x xxxxxx", 4], ["Xx xxxxxx", 1], ["Xxxxx xx xxxxxxx", 3], ["Xxxx xx xx,x xxxxxxx", 2]];
  function panneauFlou(nb, cta) {
    var faux = '<div class="mk-fake" aria-hidden="true" inert>' + legende() + "<ul>" + FAUX_MARCHES.map(function (x) {
      return '<li><span class="mk-l">' + x[0] + '</span><span class="mk-r"><span class="hu-badge lv' + x[1] + '">?? %</span></span></li>';
    }).join("") + "</ul></div>";
    var quoi = n(nb) !== null && n(nb) > 0 ? tf("match_v4.panel_unlock_n", "Ce que tu débloques : les {n} marchés de ce match, avec leur chance.", { n: ent(nb) }) : t("match_v4.panel_unlock", "Ce que tu débloques : tous les marchés de ce match, avec leur chance.");
    return tete(n(nb)) + '<div class="mk-locked">' + faux + '<div class="mk-over"><span class="mk-lock">' + ico("lock") + "</span><p>" + esc(quoi) + "</p>" + cta + "</div></div>";
  }

  // --------------------------------------------- apercu flou (match bloque)
  // Court : une fausse ligne de pari, un faux anneau et une fausse frise, dessines
  // par les MEMES composants (Chart.js) avec des constantes. Aucune donnee reelle.
  // o.offert : match offert du jour (analyse gratuite avec un compte), titre adapte.
  function apercuFlou(o) {
    var donut = graphe({ type: "doughnut", data: { labels: ["", "", ""], datasets: [{ data: [44, 27, 29], backgroundColor: [COUL.dom, COUL.nul, COUL.ext], borderColor: "#0d1520", borderWidth: 3 }] }, options: { cutout: "62%", animation: false, events: [] } }, { hauteur: 120 });
    var frise = graphe({ type: "bar", data: { labels: ["", "", "", "", "", ""], datasets: [
      { data: [0.2, 0.25, 0.3, 0.22, 0.28, 0.36], backgroundColor: COUL.dom, stack: "h", borderRadius: 3 }, { data: [-0.14, -0.18, -0.12, -0.2, -0.16, -0.24], backgroundColor: COUL.domL, stack: "h", borderRadius: 3 },
      { data: [0.12, 0.16, 0.14, 0.18, 0.15, 0.22], backgroundColor: COUL.ext, stack: "a", borderRadius: 3 }, { data: [-0.18, -0.2, -0.24, -0.19, -0.22, -0.3], backgroundColor: COUL.extL, stack: "a", borderRadius: 3 }] },
      options: { animation: false, events: [], scales: { x: { stacked: true, display: false }, y: { stacked: true, display: false } } } }, { hauteur: 120 });
    var titre = o && o.offert ? t("match_v4.preview_title_free", "Aperçu : l’analyse offerte de ce match") : t("match_v4.preview_title", "Aperçu : la page Pro de ce match");
    return '<section class="ap" aria-labelledby="apT"><h2 class="ap-t" id="apT">' + esc(titre) + "</h2>"
      + '<div class="ap-body" aria-hidden="true" inert><div class="ap-slip tc-box"><span><small>Xxxx xxxxxxxxx</small><b>Xxxxxxx xx Xxxxx</b></span><b class="ap-odds">?,??</b></div>'
      + '<div class="ap-row"><div class="ap-g">' + donut + '</div><div class="ap-g">' + frise + "</div></div></div></section>";
  }

  // --------------------------------------------- assemblage
  // c : { raw, vm, vuePro, verrouPro (lignes cadenas : compte gratuit sur le match offert), dit }
  function sections(c) {
    return [
      ["sim", simulation(c), ["match_v4.nav_sim", "10 000 matchs"]],
      ["film", film(c), ["match_v4.nav_film", "Film"]],
      ["premier", premier(c), ["match_v4.nav_first", "1er but"]],
      ["jumeaux", jumeaux(c), ["match_v4.nav_twins", "Jumeaux"]],
      ["equipes", equipes(c), ["match_v4.nav_teams", "Équipes"]],
      ["joueurs", joueurs(c), ["match_v4.nav_players", "Joueurs"]],
      ["arbitre", arbitre(c), ["match_v4.nav_ref", "Arbitre"]]
    ].filter(function (x) { return x[1]; });
  }

  // --------------------------------------------- interactions (navigateur)
  function mouvementReduit() { return !!(G.matchMedia && G.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  // Onglets HyperUI : un seul selectionne ; fleches gauche / droite au clavier.
  function onglets(liste, choisir) {
    liste.forEach(function (b, i) {
      b.addEventListener("click", function () { choisir(b, i); });
      b.addEventListener("keydown", function (ev) {
        if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
        ev.preventDefault();
        var j = (i + (ev.key === "ArrowRight" ? 1 : liste.length - 1)) % liste.length;
        liste[j].focus(); choisir(liste[j], j);
      });
    });
  }
  function bind(racine) {
    if (!racine) return;
    // Film : un quart d'heure choisi (onglet ou clic sur le graphique) ecrit sa ligne.
    racine.querySelectorAll(".x-film").forEach(function (sec) {
      var out = sec.querySelector("[data-f-detail]"), tabs = Array.prototype.slice.call(sec.querySelectorAll("[data-f]"));
      var textes = []; try { textes = JSON.parse(out.getAttribute("data-f-all")); } catch (e) {}
      var choisir = function (b, i) {
        tabs.forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
        if (textes[i]) out.textContent = textes[i];
      };
      onglets(tabs, choisir);
      sec.addEventListener("mu-chart", function (ev) {
        var ch = ev.detail;
        if (!ch || !ch.options) return;
        ch.options.onClick = function (e, el) { if (el && el.length && tabs[el[0].index]) choisir(tabs[el[0].index], el[0].index); };
        ch.update("none");
      });
    });
    // Et si... ? : l'anneau Chart.js suit le scenario ; les chances s'ecrivent TOUT DE SUITE a
    // leur valeur finale (controle UX du 04/10 : un compteur qui defile montrait pendant 3 s des
    // chances fausses, ni multiples de 5 ni coherentes avec l'ecart affiche).
    racine.querySelectorAll(".e-box").forEach(function (box) {
      var base = null; try { base = JSON.parse(box.getAttribute("data-e-base")); } catch (e) { base = null; }
      var tabs = Array.prototype.slice.call(box.querySelectorAll(".hu-tab"));
      var chart = null;
      box.addEventListener("mu-chart", function (ev) { chart = ev.detail; });
      var vals = Array.prototype.slice.call(box.querySelectorAll("[data-e-v]"));
      var montrer = function (b, premier) {
        tabs.forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
        var v = []; try { v = JSON.parse(b.getAttribute("data-e")); } catch (e) {}
        if (chart) { chart.data.datasets[0].data = v.slice(); chart.update(); }
        [0, 1, 2].forEach(function (i) {
          var el = vals[i];
          if (el && !premier && v[i] != null) el.textContent = pc(v[i]);
          var ed = box.querySelector('[data-ed="' + i + '"]');
          if (ed && base && base[i] != null) { var dlt = v[i] - base[i]; ed.textContent = "(" + pts(dlt) + ")"; ed.className = "e-d " + (dlt > 0 ? "is-pos" : dlt < 0 ? "is-neg" : ""); }
        });
      };
      onglets(tabs, function (b) { montrer(b, false); });
      if (tabs[0]) montrer(tabs[0], true);
    });
    if (K()) K().activer(racine);
  }
  // Panneau : recherche, familles (onglets HyperUI), liens vers l'Avis / la simulation.
  function bindPanneau(col, tir) {
    if (!col) return;
    var q = col.querySelector("[data-mk-q]"), vide = col.querySelector("[data-mk-empty]");
    var filtre = "";
    var appliquer = function () {
      var mot = q ? q.value.trim().toLowerCase() : "", visibles = 0;
      col.querySelectorAll(".mk-fam").forEach(function (f) {
        var okF = !filtre || f.getAttribute("data-mk-fam") === filtre, nf = 0;
        f.querySelectorAll("li").forEach(function (li) {
          var ok = okF && (!mot || (li.getAttribute("data-mk-txt") || "").indexOf(mot) !== -1);
          li.hidden = !ok; if (ok) nf++;
        });
        f.hidden = nf === 0; visibles += nf;
      });
      if (vide) vide.hidden = visibles > 0;
    };
    if (q) q.addEventListener("input", appliquer);
    onglets(Array.prototype.slice.call(col.querySelectorAll("[data-mk-f]")), function (b) {
      filtre = b.getAttribute("data-mk-f") || "";
      col.querySelectorAll("[data-mk-f]").forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
      appliquer();
    });
    col.querySelectorAll(".mk-ref").forEach(function (a) {
      a.addEventListener("click", function (ev) {
        var cible = G.document.querySelector(a.getAttribute("href"));
        if (!cible) return;
        ev.preventDefault();
        if (tir && tir.fermer) tir.fermer();
        cible.scrollIntoView({ behavior: mouvementReduit() ? "auto" : "smooth", block: "start" });
      });
    });
  }
  // Tiroir du bas (Flowbite « Drawer », placement bottom, lib/composants.js#Tiroir) :
  // au telephone, la colonne du panneau passe dans le tiroir ; Echap, fond, bouton
  // fermer ; focus dans le tiroir puis rendu au bouton qui l'a ouvert.
  function tiroir(col, boutons) {
    var D = G.document, C = K();
    var bureau = function () { return G.matchMedia && G.matchMedia("(min-width: 1100px)").matches; };
    var place = col.parentNode, suivant = col.nextSibling;
    var tir = null, boite = null;
    if (C && C.Tiroir) {
      boite = D.createElement("div");
      boite.setAttribute("aria-labelledby", "mkTitle");
      boite.tabIndex = -1;
      D.body.appendChild(boite);
      tir = new C.Tiroir(boite, { poignee: true, libelleFermer: t("match_v4.panel_close", "Fermer les marchés"), onHide: function () { place.insertBefore(col, suivant); } });
    }
    var fermer = function () { if (tir) tir.hide(); };
    var ouvrir = function (ev) {
      if (bureau() || !tir) { col.scrollIntoView({ block: "nearest" }); var q0 = col.querySelector("[data-mk-q]"); if (q0) q0.focus(); return; }
      boite.appendChild(col);
      tir.show(ev && ev.currentTarget || null);
      // Focus sur le tiroir lui-meme (pas sur la recherche : au telephone, le
      // clavier s'ouvrirait et cacherait les marches).
      try { boite.focus({ preventScroll: true }); } catch (e) {}
    };
    col.querySelectorAll("[data-mk-close]").forEach(function (b) { b.addEventListener("click", fermer); });
    (boutons || []).forEach(function (b) { if (b) b.addEventListener("click", ouvrir); });
    return { ouvrir: ouvrir, fermer: fermer };
  }

  return {
    registre: registre,
    clesAvis: clesAvis,
    butsAffiches: butsAffiches,
    etSi: etSi,
    premiersButeurs: premiersButeurs,
    dejaEcrit: dejaEcrit,
    repartir: repartir,
    issuesAffichees: issuesAffichees,
    scoresAffiches: scoresAffiches,
    premierBut: premierBut,
    simulation: simulation,
    film: film,
    premier: premier,
    jumeaux: jumeaux,
    equipes: equipes,
    joueurs: joueurs,
    arbitre: arbitre,
    sections: sections,
    donneesPanneau: donneesPanneau,
    panneau: panneau,
    panneauFlou: panneauFlou,
    apercuFlou: apercuFlou,
    FAUX_MARCHES: FAUX_MARCHES,
    bind: bind,
    bindPanneau: bindPanneau,
    tiroir: tiroir
  };
});
