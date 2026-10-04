/* IASHARK — sections de la page match (04/10/2026, demande de Clement : page
   ludique, chaque information UNE seule fois, panneau Marches reserve aux Pro).

   Ordre de la page (match-page.js) : en-tete, sommaire, L'AVIS IASHARK (inchange,
   rendu par match-page.js#signalCard), puis les sections de ce module :
     D. sim      « Si ce match se jouait 10 000 fois » (comptes exacts tires de la
                 grille du moteur : pourcentage entier x 100, jamais un tirage) ;
     E. film     le film du match en 6 quarts d'heure (buts marques / encaisses,
                 chance d'un but par tranche) ;
     F. premier  qui ouvre le score + « Et si... ? » ;
     G. jumeaux  les matchs deja joues que les bookmakers voyaient comme celui-ci ;
     H. equipes  radar a 6 branches + bilan + compositions ;
     I. joueurs  buteurs du moteur v3 seulement (une seule source buteur) ;
     J. arbitre  cartons, rouges, penaltys face a l'attendu ;
     K. panneau Marches (colonne gauche sur ordinateur, tiroir sur telephone).

   VERDICTS DU MATHEMATICIEN (verdicts-maths-temps.md et verdicts-maths-tickets.md,
   04/10/2026), appliques ici a l'affichage :
   - d1 GO : comptes exacts de la grille ; JAMAIS « rejoue 10 000 fois », jamais de
     compteur qui monte jusqu'a 10 000 ; scores les plus probables SANS le filtre du
     pari ; d2 (score le plus fou) NO-GO : absent.
   - a1 GO : chance d'un but par quart d'heure (sim_15min.tr), en entiers ;
     a3 « zone chaude » NO-GO sous toutes ses formes : absente.
   - b1 / b2 GO : « Et si » arrondi a 5 points ; ecart calcule sur les nombres
     affiches.
   - c1 GO (grille v3, PREMIER_BUT) MAIS le verdict des marches cache
     PREMIER_BUT:ext (tranche 10-20 % fausse) et PREMIER_BUT:dom (tranche 80-90 %) :
     la barre ne s'affiche que hors de ces tranches.
   - g GO : jumeaux en comptes bruts (au moins 200), periode, 3 exemples nommes.
   - f GO : panneau = marches_panneau du pipeline (71 marches justes, arrondi par
     groupe, chance du pari = chance de l'Avis). Aucune autre source.

   REGLES
   - Une section dont la donnee manque (ou n'est pas validee : le pipeline ne pose
     jamais un champ NO-GO) n'est pas rendue : aucun trou, aucun « undefined ».
   - AUCUNE REPETITION : registre unique (registre()) ; chaque section, dans l'ordre
     de la page, inscrit les cles d'information qu'elle affiche et n'ecrit jamais
     un chiffre dont la cle est deja inscrite (l'Avis inscrit les siennes d'abord).
   - GARDE DE COHERENCE : sans le panneau (compte gratuit sur le match offert), les
     issues viennent de p1/pn/p2 ; si la chance du modele s'ecarte de plus de 3
     points de la chance affichee par l'Avis, la section masque ses issues.
   - Pro seulement (serveur) : sim_15min, stats_iashark, v3_marches, marches. Sans
     Pro, la page ne recoit pas ces champs ; elle ecrit une ligne cadenas.
   - Panneau non-Pro et apercus floutes : FAUX CHIFFRES CONSTANTS, jamais lus dans
     une reponse (aria-hidden, inert).

   COMPOSANTS (exigence de Clement du 04/10, 5 h 20 : de vrais composants, aucun
   dessin fait main), licences dans assets/vendor/LICENCES.txt :
   - graphiques : Chart.js 4.5.1 + chartjs-plugin-datalabels 2.2.0 (MIT), charges
     a la demande (lib/composants.js#graphiques) ;
   - jauges : Magic UI « Animated Circular Progress Bar » ; nombres « Et si » :
     Magic UI « Number Ticker » ;
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
  function registre() {
    var cles = {};
    return {
      has: function (k) { return hasOwn.call(cles, k); },
      add: function (k) { cles[k] = true; },
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
    dit.add("pari");
    var id = String(raw && raw.market_id || "");
    if (ISSUE_DU_PARI[id]) dit.add(ISSUE_DU_PARI[id]);
    if (/^dc-/.test(id)) dit.add("dc:" + id.slice(3));
    var raisons = (vm.editorial && vm.editorial.signalReasons || []).filter(function (x) { return x && RAISONS_CONNUES.indexOf(x.key) !== -1; }).slice(0, 3);
    raisons.forEach(function (x) { dit.add("raison:" + x.key); });
  }
  // Garde de coherence : vrai si les issues p1/pn/p2 peuvent s'ecrire sans
  // contredire la chance affichee par l'Avis (ecart <= 3 points).
  var SEUIL_GARDE = 3;
  function gardeIssues(raw, vm) {
    var id = String(raw && raw.market_id || "");
    var r = vm && vm.model && vm.model.recommendation;
    if (!r || !id) return true;
    var affiche = n(raw.chance_iashark) !== null ? n(raw.chance_iashark) : n(r.probability);
    var p1 = n(raw.p1), pn = n(raw.pn), p2 = n(raw.p2);
    if (affiche === null || p1 === null || pn === null || p2 === null) return true;
    var modele = { "home-win": p1, "draw": pn, "away-win": p2, "dc-1x": p1 + pn, "dc-x2": pn + p2, "dc-12": p1 + p2 }[id];
    if (modele == null) return true;
    return Math.abs(modele - affiche) <= SEUIL_GARDE;
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

  // ------------------------------------------------- D. si ce match se jouait 10 000 fois
  // Issues : celles du panneau (meme chiffre que l'Avis pour le pari, somme 100)
  // sinon p1/pn/p2 ramenes a 100 (plus forts restes) sous la garde de coherence.
  function issuesAffichees(raw, vm) {
    var P = lignesPanneau(raw);
    var a = P["home-win"], b = P["draw"], c = P["away-win"];
    if (a && b && c) {
      var v = [n(a.chance), n(b.chance), n(c.chance)];
      if (v.every(function (x) { return x !== null && x >= 0; }) && v[0] + v[1] + v[2] === 100) return v;
    }
    var p = [n(raw.p1), n(raw.pn), n(raw.p2)];
    if (p.every(function (x) { return x !== null && x >= 0; }) && gardeIssues(raw, vm)) return repartir(p, 100);
    return null;
  }
  // Scores les plus probables : grille du panneau (SCORE:i-j), SANS filtre du pari.
  function scoresAffiches(raw) {
    var P = lignesPanneau(raw);
    return Object.keys(P).filter(function (k) { return /^SCORE:\d+-\d+$/.test(k); }).map(function (k) {
      return { score: k.slice(6), v: n(P[k].chance) };
    }).filter(function (x) { return x.v !== null && x.v >= 1; }).sort(function (a, b) { return b.v - a.v || a.score.localeCompare(b.score); }).slice(0, 5);
  }
  function simulation(c) {
    var raw = c.raw, vm = c.vm, dit = c.dit;
    var dom = nomEq(vm.identity.home), ext = nomEq(vm.identity.away);
    var issues = issuesAffichees(raw, vm);
    var scores = scoresAffiches(raw);
    var xg = vm.model && vm.model.expectedGoals;
    if (!issues && !scores.length) return "";
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
        dit.add(cle);
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
        dit.add(cle);
        if (s.score === "0-0") dit.add("zero_zero");
        return deja ? null : s.v * 100;
      });
      corps += '<div class="x-block"><h3>' + esc(t("match_v4.sim_scores_title", "Les scores les plus probables")) + "</h3>"
        + graphe({ type: "bar", data: { labels: lab, datasets: [{ data: vals, backgroundColor: COUL.dom, borderRadius: 6, barThickness: 18 }] },
          options: { indexAxis: "y", layout: { padding: { right: 64 } }, scales: { x: { display: false, beginAtZero: true, grace: "8%" }, y: { grid: { display: false }, border: { display: false }, ticks: { color: "#f4f7fb", font: { family: '"Space Mono", monospace', size: 13, weight: "700" } } } } },
          etiquettes: { format: "environ", ancre: "end", alignement: "end", couleur: "#a3b1c2", taille: 12 } },
          { hauteur: 40 + scores.length * 30, aria: scores.map(function (s, i) { return lab[i] + (vals[i] != null ? " : " + tf("match_v4.sim_about", "≈ {n} fois", { n: ent(vals[i]) }) : ""); }).join(" ; ") })
        + '<p class="x-note">' + esc(t("match_v4.sim_scores_note", "Un score exact reste très incertain : même le plus probable n’arrive pas souvent.")) + "</p></div>";
    }
    if (xg && n(xg.home) !== null && n(xg.away) !== null && !dit.has("raison:xg") && !dit.has("xg")) {
      corps += '<p class="x-line">' + esc(tf("match_v4.sim_xg", "Buts attendus : {home} {hx} – {ax} {away}", { home: dom, away: ext, hx: dec(xg.home, 1), ax: dec(xg.away, 1) })) + "</p>";
      dit.add("xg");
    }
    return carte("sim", "repeat", esc(t("match_v4.sim_title", "Si ce match se jouait 10 000 fois")), corps,
      t("match_v4.sim_sub", "Les chances de notre modèle ramenées à 10 000 matchs, arrondies à la centaine. Une estimation, pas une garantie."));
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
  function film(c) {
    var raw = c.raw, vm = c.vm, dit = c.dit;
    var H = profilTranches(raw, "home", c.vuePro), A = profilTranches(raw, "away", c.vuePro);
    if (!H || !A) return "";
    var dom = nomEq(vm.identity.home), ext = nomEq(vm.identity.away);
    var sim = c.vuePro && raw.sim_15min && Array.isArray(raw.sim_15min.tr) && raw.sim_15min.tr.length === 6 ? raw.sim_15min.tr.map(n) : null;
    if (sim && sim.some(function (x) { return x === null || x < 0 || x > 1; })) sim = null;
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
    if (sim) {
      var pcts = sim.map(function (x) { return Math.round(x * 100); });
      datasets.push({ type: "line", label: t("match_v4.film_line", "Chance d’au moins un but (modèle)"), data: pcts, yAxisID: "y2", borderColor: COUL.ligne, backgroundColor: COUL.ligne,
        borderWidth: 2, pointRadius: 3, tension: 0.35, order: 1 });
      scales.y2 = { position: "right", min: 0, max: 100, grid: { display: false }, border: { display: false }, ticks: { display: false } };
    }
    dit.add("film");
    if (sim) dit.add("but_par_tranche");
    var echantillon = H.source === "book"
      ? tf("match_v4.film_sample_book", "Buts par match, sur {h} matchs de {home} et {a} de {away} (archive IASHARK).", { h: ent(H.n), a: ent(A.n), home: dom, away: ext })
      : (H.n === A.n ? tf("match_v4.film_sample_last_same", "Buts par match, sur leurs {n} derniers matchs.", { n: ent(H.n) })
        : tf("match_v4.film_sample_last", "Buts par match, sur les {h} derniers matchs de {home} et les {a} de {away}.", { h: ent(H.n), a: ent(A.n), home: dom, away: ext }));
    var legende = '<ul class="x-keys"><li><span class="x-sw" style="background:' + COUL.dom + '"></span>' + esc(dom) + '</li><li><span class="x-sw" style="background:' + COUL.ext + '"></span>' + esc(ext) + "</li>"
      + (sim ? '<li><span class="x-sw x-sw-l"></span>' + esc(t("match_v4.film_line", "Chance d’au moins un but (modèle)")) + "</li>" : "") + "</ul>"
      + '<p class="x-note x-note-top">' + esc(t("match_v4.film_legend", "en haut : buts marqués · en bas : buts encaissés")) + "</p>";
    // Detail d'une tranche : onglets HyperUI (clavier) et clic sur le graphique.
    var details = TRANCHES.map(function (lab, i) {
      return tf("match_v4.film_detail", "{slot} : {home} marque {hp} but par match, {away} en encaisse {ac} · {away} marque {ap}, {home} en encaisse {hc}.",
        { slot: lab, home: dom, away: ext, hp: dec(H.pour[i], 2), ac: dec(A.contre[i], 2), ap: dec(A.pour[i], 2), hc: dec(H.contre[i], 2) });
    });
    var onglets = '<div class="hu-tabs x-tabs f-tabs"><div class="hu-tablist" role="tablist" aria-label="' + esc(t("match_v4.film_aria", "Quarts d’heure du match")) + '">'
      + TRANCHES.map(function (lab, i) { return '<button type="button" role="tab" class="hu-tab" aria-selected="' + (i === 5 ? "true" : "false") + '" data-f="' + i + '">' + esc(lab) + "</button>"; }).join("") + "</div></div>";
    var corps = legende
      + graphe(spec, { hauteur: 230, aria: t("match_v4.film_aria", "Quarts d’heure du match"), attrs: 'data-f-chart="1"' })
      + onglets
      + '<p class="f-detail" aria-live="polite" data-f-detail data-f-all="' + esc(JSON.stringify(details)) + '">' + esc(details[5]) + "</p>"
      + '<p class="x-note">' + esc(echantillon) + "</p>"
      + (c.verrouPro ? cadenas(t("match_v4.film_lock", "La chance d’un but par quart d’heure (modèle) : Pro.")) : "");
    return carte("film", "clapperboard", esc(t("match_v4.film_title", "Le film du match")), corps, t("match_v4.film_sub", "Six quarts d’heure. Touche une tranche pour lire ses chiffres."));
  }

  // ---------------------------------------- F. qui ouvre le score + Et si
  function v3Marche(raw, cle) {
    var l = Array.isArray(raw && raw.v3_marches) ? raw.v3_marches : [];
    for (var i = 0; i < l.length; i++) if (l[i] && l[i].cle === cle) return n(l[i].probabilite);
    return null;
  }
  // c1 (GO) : grille v3. Verdict des marches : PREMIER_BUT:ext faux dans la tranche
  // 10-20 %, PREMIER_BUT:dom hors tolerance dans la tranche 80-90 % : rien dans ces cas.
  function premierBut(raw) {
    var h = v3Marche(raw, "PREMIER_BUT:dom"), a = v3Marche(raw, "PREMIER_BUT:ext"), z = v3Marche(raw, "PREMIER_BUT:aucun");
    if (h === null || a === null || z === null || h < 0 || a < 0 || z < 0) return null;
    if (a >= 10 && a < 20) return null;
    if (h >= 80 && h < 90) return null;
    return repartir([h, z, a], 100);
  }
  function arrondi5(v) { return Math.round(v / 5) * 5; }
  // Arrondi a 5 points dont la somme fait 100 : on corrige d'abord l'issue dont
  // l'arrondi s'ecarte le plus de sa valeur (verdict b1 : chiffres « environ »).
  function arrondi5Somme(v) {
    var r = v.map(arrondi5);
    for (var k = 0; k < 4 && r[0] + r[1] + r[2] !== 100; k++) {
      var trop = r[0] + r[1] + r[2] > 100, pire = -1, ecart = -1;
      r.forEach(function (x, i) { var e = trop ? x - v[i] : v[i] - x; if (e > ecart && (!trop || x >= 5)) { ecart = e; pire = i; } });
      if (pire < 0) break;
      r[pire] += trop ? -5 : 5;
    }
    return r;
  }
  function premier(c) {
    var raw = c.raw, vm = c.vm, dit = c.dit;
    var dom = nomEq(vm.identity.home), ext = nomEq(vm.identity.away);
    var parts = c.vuePro ? premierBut(raw) : null;
    var s = c.vuePro && raw.sim_15min;
    var si = s && s.si;
    var SC = [["dom_premier", tf("match_v4.whatif_home", "Si {team} marque en premier", { team: dom })], ["ext_premier", tf("match_v4.whatif_home", "Si {team} marque en premier", { team: ext })], ["nul_pause", t("match_v4.whatif_ht", "Si c’est 0-0 à la pause")]];
    var siOk = !!si && SC.every(function (x) {
      var o = si[x[0]];
      return o && [o.p1, o.pn, o.p2].every(function (v) { return n(v) !== null && n(v) >= 0 && n(v) <= 1; });
    });
    if (!parts && !siOk) {
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
        + '<li><span class="x-sw" style="background:' + COUL.nul + '"></span>' + esc(lab[1]) + (!sansNombre && parts[1] < 9 ? " " + esc(pc(parts[1])) : "") + "</li>"
        + '<li><span class="x-sw" style="background:' + COUL.ext + '"></span>' + esc(tf("match_v4.first_team", "{team} marque en premier", { team: ext })) + (parts[2] < 9 ? " " + esc(pc(parts[2])) : "") + "</li></ul>";
      dit.add("premier_but");
      if (!sansNombre) dit.add("zero_zero");
    } else if (c.verrouPro) {
      corps += cadenas(t("match_v4.first_lock", "Qui marque en premier et « Et si… ? » : Pro."));
    }
    if (siOk) {
      // b1 / b2 : arrondi a 5 points ; ecart calcule sur les nombres affiches (D).
      var base = Array.isArray(c.base) ? c.base : null;
      var donnees = SC.map(function (x) { var o = si[x[0]]; return arrondi5Somme([n(o.p1), n(o.pn), n(o.p2)].map(function (v) { return v * 100; })); });
      var onglets = '<div class="hu-tabs x-tabs"><div class="hu-tablist" role="tablist" aria-label="' + esc(t("match_v4.whatif_aria", "Scénarios")) + '">'
        + SC.map(function (x, i) { return '<button type="button" role="tab" class="hu-tab" aria-selected="' + (i === 0 ? "true" : "false") + '" data-e="' + esc(JSON.stringify(donnees[i])) + '">' + esc(x[1]) + "</button>"; }).join("") + "</div></div>";
      var lignes = [["dom", tf("match_v4.sim_home_wins", "{team} gagne", { team: dom }), COUL.dom], ["nul", t("match_v4.sim_draw", "Match nul"), COUL.nul], ["ext", tf("match_v4.sim_home_wins", "{team} gagne", { team: ext }), COUL.ext]];
      var liste = '<ul class="x-legend e-list">' + lignes.map(function (x, i) {
        return '<li><span class="x-sw" style="background:' + x[2] + '"></span><span class="x-lab">' + esc(x[1]) + '</span><b class="x-count"><span data-mu-ticker="' + donnees[0][i] + '" data-mu-from="' + donnees[0][i] + '" data-mu-suffix="' + esc(pc(0).replace(/^0/, "")) + '">' + esc(pc(donnees[0][i])) + "</span></b>"
          + (base ? '<em class="e-d" data-ed="' + i + '"></em>' : "") + "</li>";
      }).join("") + "</ul>";
      var donut = graphe({ type: "doughnut", data: { labels: lignes.map(function (x) { return x[1]; }), datasets: [{ data: donnees[0], backgroundColor: lignes.map(function (x) { return x[2]; }), borderColor: "#0d1520", borderWidth: 3 }] },
        options: { cutout: "62%", plugins: { tooltip: { enabled: false } } } }, { hauteur: 150, cls: "x-donut", aria: t("match_v4.whatif_title", "Et si… ?"), attrs: 'data-e-chart="1"' });
      corps += '<div class="e-box"' + (base ? ' data-e-base="' + esc(JSON.stringify(base)) + '"' : "") + '><h3 class="e-k">' + esc(t("match_v4.whatif_title", "Et si… ?")) + "</h3>" + onglets
        + '<div class="x-sim-g">' + donut + liste + "</div>"
        + '<p class="x-note">' + esc(base ? t("match_v4.whatif_note5", "Chances de notre modèle selon le scénario, arrondies à 5 points ; écart avec « Si ce match se jouait 10 000 fois ».")
          : t("match_v4.whatif_note5_nobase", "Chances de notre modèle selon le scénario, arrondies à 5 points.")) + "</p></div>";
      dit.add("et_si");
    }
    return carte("premier", "goal", esc(t("match_v4.first_title", "Qui ouvre le score ?")), corps, siOk ? t("match_v4.first_sub", "Le match change selon qui frappe le premier. Touche un scénario.") : "");
  }

  // ------------------------------------------------- G. les jumeaux
  // Contrat (verdict g) : { resultat: { n, depuis, tous_niveaux, dom, nul, ext,
  //   exemples: [{ date, ligue, domicile, exterieur, score }] }, buts: { n, depuis,
  //   plus_2_5, btts } }. Au moins 200 jumeaux, sinon rien. Comptes bruts.
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
      var tot = n(r.n), cpt = [n(r.dom), n(r.nul), n(r.ext)], pcts = repartir(cpt, 100);
      var labs = [t("match_v4.twins_home", "Victoire de l’équipe à domicile"), t("match_v4.twins_draw", "Nul"), t("match_v4.twins_away", "Victoire de l’équipe à l’extérieur")];
      corps += '<h3 class="j-t">' + esc(tf("match_v4.twins_result_title", "{n} matchs jumeaux depuis {y}", { n: ent(tot), y: r.depuis })) + "</h3>"
        + '<p class="x-note x-note-top">' + esc(r.tous_niveaux ? t("match_v4.twins_result_sub_all", "Tous championnats, mêmes chances de victoire à 2 points près.") : t("match_v4.twins_result_sub", "Même niveau, mêmes chances de victoire à 2 points près.")) + "</p>"
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
      corps += '<p class="x-line">' + esc(tf("match_v4.twins_goals", "Buts : {n} matchs jumeaux depuis {y}. Plus de 2,5 buts dans {o} ({op}), les deux équipes ont marqué dans {b} ({bp}).",
        { n: ent(nb), y: b.depuis, o: ent(b.plus_2_5), op: pc(Math.round(b.plus_2_5 / nb * 100)), b: ent(b.btts), bp: pc(Math.round(b.btts / nb * 100)) })) + "</p>";
    }
    c.dit.add("jumeaux");
    return carte("jumeaux", "history", esc(t("match_v4.twins_title", "Les jumeaux du match")), corps
      + '<p class="x-note">' + esc(t("match_v4.twins_note2", "Des matchs déjà joués que les bookmakers voyaient comme celui-ci, la veille. Ce qui s’est passé, pas une prévision.")) + "</p>",
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
    var a = c.vuePro && raw.stats_iashark && raw.stats_iashark.arbitre;
    var nom = a && a.nom || raw.arbitre && raw.arbitre.nom || null;
    if (!nom) return "";
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
        c.dit.add("arbitre_cartons");
      }
    }
    if (!corps && c.vuePro && raw.arbitre && n(raw.arbitre.cartons) !== null) {
      var bits = [tf("match_v4.ref_simple_cards", "{v} cartons par match", { v: dec(raw.arbitre.cartons, 1) })];
      if (n(raw.arbitre.penaltys) !== null) bits.push(tf("match_v4.ref_simple_pens", "{v} penalty par match", { v: dec(raw.arbitre.penaltys, 2) }));
      corps = '<p class="x-line">' + esc(bits.join(" · ")) + (n(raw.arbitre.matchs) !== null ? " " + esc(tf("match_v4.ref_simple_n", "(sur {n} matchs)", { n: ent(raw.arbitre.matchs) })) : "") + "</p>";
      c.dit.add("arbitre_cartons");
    }
    if (!corps && c.verrouPro) corps = cadenas(t("match_v4.ref_lock", "Ses cartons et penaltys face à l’attendu : Pro."));
    if (!corps) return "";
    return carte("arbitre", "flag", esc(t("match_v4.ref_title", "L’arbitre")) + ' <span class="a-nom">' + esc(nom) + "</span>", corps, "");
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
        var issue = ISSUE_DU_PARI[m.id];
        var score = /^SCORE:\d+-\d+$/.test(m.id) ? "score:" + m.id.slice(6) : null;
        var ref = m.pari ? "avis" : ((issue && dit.has(issue)) || (score && dit.has(score)) ? "sim" : null);
        var droite = ref === "avis" ? '<a class="mk-ref" href="#sec-avis">' + esc(t("match_v4.panel_avis", "Pari de l’avis")) + " " + ico("arrow-up", "x-ico x-ico-s") + "</a>"
          : ref === "sim" ? '<a class="mk-ref" href="#sec-sim">' + esc(t("match_v4.panel_sim", "Dans la simulation")) + " " + ico("arrow-up", "x-ico x-ico-s") + "</a>"
            : '<span class="hu-badge lv' + niveau(m.chance) + '">' + esc(pc(m.chance)) + "</span>";
        return '<li data-mk-txt="' + esc((m.libelle + " " + f.libelle).toLowerCase()) + '"><span class="mk-l">' + esc(m.libelle) + '</span><span class="mk-r">' + droite + "</span></li>";
      }).join("") + "</ul></section>";
    }).join("");
    var puces = '<div class="hu-tabs mk-tabs"><div class="hu-tablist" role="tablist" aria-label="' + esc(t("match_v4.panel_families", "Familles de marchés")) + '"><button type="button" role="tab" class="hu-tab" aria-selected="true" data-mk-f="">' + esc(t("match_v4.panel_all", "Tous")) + "</button>"
      + d.familles.map(function (f) { return '<button type="button" role="tab" class="hu-tab" aria-selected="false" data-mk-f="' + f.cle + '">' + esc(f.libelle) + "</button>"; }).join("") + "</div></div>";
    var pied = t("match_v4.panel_foot", "Chance calculée par IASHARK, la plus prudente entre notre modèle et le marché sans marge.")
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
  function apercuFlou() {
    var donut = graphe({ type: "doughnut", data: { labels: ["", "", ""], datasets: [{ data: [44, 27, 29], backgroundColor: [COUL.dom, COUL.nul, COUL.ext], borderColor: "#0d1520", borderWidth: 3 }] }, options: { cutout: "62%", animation: false, events: [] } }, { hauteur: 120 });
    var frise = graphe({ type: "bar", data: { labels: ["", "", "", "", "", ""], datasets: [
      { data: [0.2, 0.25, 0.3, 0.22, 0.28, 0.36], backgroundColor: COUL.dom, stack: "h", borderRadius: 3 }, { data: [-0.14, -0.18, -0.12, -0.2, -0.16, -0.24], backgroundColor: COUL.domL, stack: "h", borderRadius: 3 },
      { data: [0.12, 0.16, 0.14, 0.18, 0.15, 0.22], backgroundColor: COUL.ext, stack: "a", borderRadius: 3 }, { data: [-0.18, -0.2, -0.24, -0.19, -0.22, -0.3], backgroundColor: COUL.extL, stack: "a", borderRadius: 3 }] },
      options: { animation: false, events: [], scales: { x: { stacked: true, display: false }, y: { stacked: true, display: false } } } }, { hauteur: 120 });
    return '<section class="ap" aria-labelledby="apT"><h2 class="ap-t" id="apT">' + esc(t("match_v4.preview_title", "Aperçu : la page Pro de ce match")) + "</h2>"
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
        // Etiquettes (pourcentages entiers) seulement sur la ligne du modele.
        ch.data.datasets.forEach(function (ds) { if (ds.type === "line") ds.datalabels = { display: true, align: "top", anchor: "end", offset: 2, color: "#f4f7fb", font: { size: 10, weight: "700" }, formatter: function (v) { return v + " %"; } }; });
        ch.update("none");
      });
    });
    // Et si... ? : l'anneau Chart.js et les chances (Number Ticker) suivent le scenario.
    racine.querySelectorAll(".e-box").forEach(function (box) {
      var base = null; try { base = JSON.parse(box.getAttribute("data-e-base")); } catch (e) { base = null; }
      var tabs = Array.prototype.slice.call(box.querySelectorAll(".hu-tab"));
      var chart = null;
      box.addEventListener("mu-chart", function (ev) { chart = ev.detail; });
      var vals = Array.prototype.slice.call(box.querySelectorAll("[data-mu-ticker]"));
      var montrer = function (b, premier) {
        tabs.forEach(function (x) { x.setAttribute("aria-selected", String(x === b)); });
        var v = []; try { v = JSON.parse(b.getAttribute("data-e")); } catch (e) {}
        if (chart) { chart.data.datasets[0].data = v.slice(); chart.update(); }
        [0, 1, 2].forEach(function (i) {
          var el = vals[i];
          if (el && !premier) { if (K()) K().compteur(el, v[i]); else el.textContent = pc(v[i]); }
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
      tir = new C.Tiroir(boite, { onHide: function () { place.insertBefore(col, suivant); } });
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
    gardeIssues: gardeIssues,
    SEUIL_GARDE: SEUIL_GARDE,
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
