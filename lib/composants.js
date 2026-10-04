/* IASHARK — COMPORTEMENT DES COMPOSANTS DE BIBLIOTHEQUES (04/10/2026).
   Exigence de Clement : de vrais composants, jamais de dessins faits main.
   Chaque fonction reprend le composant d'origine (structure, effets, valeurs par
   defaut) ; le CSS correspondant est dans assets/composants.css. Licences :
   assets/vendor/LICENCES.txt.

   - boutonShimmer : Magic UI « Shimmer Button » (MIT) — gros bouton d'action.
   - faisceau      : Magic UI « Border Beam » (MIT) — cadre du bloc de paiement.
   - reflet        : Magic UI « Shine Border » (MIT) — Selection en or.
   - jauge / animerJauges : Magic UI « Animated Circular Progress Bar » (MIT).
   - compteur      : Magic UI « Number Ticker » (MIT) — ressort de motion/react
                     useSpring({ damping: 60, stiffness: 100 }), une fois a l'entree
                     a l'ecran, Intl.NumberFormat.
   - boutonBascule : Magic UI « Animated Subscribe Button » (MIT).
   - Tiroir        : Flowbite « Drawer » (MIT), placement bottom, fond, Echap,
                     body sans defilement ; focus rendu au declencheur.
   - graphiques    : Chart.js 4.5.1 (MIT) + chartjs-plugin-datalabels 2.2.0 (MIT),
                     charges a la demande depuis assets/vendor/ (seulement sur la
                     page qui en a besoin, quand le graphique approche de l'ecran).
   Mouvement reduit (prefers-reduced-motion) : valeurs finales, aucune animation. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IasharkComposants = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (G) {
  "use strict";
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function ico(nom, cls) { var I = G && G.IasharkIcones; return I ? I.svg(nom, cls) : ""; }
  function reduit() { return !!(G && G.matchMedia && G.matchMedia("(prefers-reduced-motion: reduce)").matches); }
  function locale() { return (G && G.I18N && G.I18N.localeTag) ? G.I18N.localeTag() : "fr-FR"; }

  // ------------------------------------------------ Magic UI : Shimmer Button
  // o : { href | type, label (texte), icone (nom Lucide, a droite), attrs (chaine deja echappee), cls }
  function boutonShimmer(o) {
    o = o || {};
    var dedans = '<span class="mu-shimmer-spark-c" aria-hidden="true"><span class="mu-shimmer-spark"><span class="mu-shimmer-spark-b"></span></span></span>'
      + '<span data-mu-label>' + esc(o.label || "") + "</span>" + (o.icone ? ico(o.icone) : "")
      + '<span class="mu-shimmer-hl" aria-hidden="true"></span><span class="mu-shimmer-bd" aria-hidden="true"></span>';
    var cls = "mu-shimmer" + (o.cls ? " " + o.cls : "");
    var attrs = o.attrs ? " " + o.attrs : "";
    if (o.href != null) return '<a class="' + cls + '" href="' + esc(o.href) + '"' + attrs + ">" + dedans + "</a>";
    return '<button type="button" class="' + cls + '"' + attrs + ">" + dedans + "</button>";
  }

  // ------------------------------------------------ Magic UI : Border Beam / Shine Border
  function faisceau(o) {
    o = o || {};
    var st = (o.taille ? "--size:" + o.taille + "px;offset-path:rect(0 auto auto 0 round " + o.taille + "px);" : "") + (o.duree ? "--duration:" + o.duree + "s;" : "");
    return '<span class="mu-beam" aria-hidden="true"><span class="mu-beam-i"' + (st ? ' style="' + st + '"' : "") + "></span></span>";
  }
  function reflet() { return '<span class="mu-shine" aria-hidden="true"></span>'; }

  // ------------------------------------------------ Magic UI : Animated Circular Progress Bar
  // La valeur part de 0 puis rejoint « valeur » a l'entree a l'ecran (transition CSS
  // d'origine, 1 s) ; le texte affiche est fourni deja formate (« 35 % »).
  var CIRC = 2 * Math.PI * 45;
  function jauge(valeur, texte, o) {
    o = o || {};
    var v = Math.max(0, Math.min(100, Math.round(Number(valeur) || 0)));
    var depart = reduit() ? v : 0;
    var sec = '<circle class="mu-gauge-sec" cx="50" cy="50" r="45" stroke-width="10" stroke-dashoffset="0" stroke-linecap="round" stroke-linejoin="round" style="--stroke-percent:' + (90 - depart) + '"></circle>';
    return '<span class="mu-gauge' + (o.grand ? " mu-gauge--lg" : "") + '" data-mu-gauge="' + v + '" role="img" aria-label="' + esc(o.aria || texte) + '">'
      + '<svg fill="none" stroke-width="2" viewBox="0 0 100 100" aria-hidden="true">' + (depart <= 90 ? sec : "")
      + '<circle class="mu-gauge-pri" cx="50" cy="50" r="45" stroke-width="10" stroke-dashoffset="0" stroke-linecap="round" stroke-linejoin="round" style="--stroke-percent:' + depart + '"></circle></svg>'
      + '<span class="mu-gauge-v" aria-hidden="true">' + esc(texte) + "</span></span>";
  }
  function poserJauge(el) {
    var v = Number(el.getAttribute("data-mu-gauge")) || 0;
    var pri = el.querySelector(".mu-gauge-pri"), sec = el.querySelector(".mu-gauge-sec");
    if (pri) pri.style.setProperty("--stroke-percent", String(v));
    if (sec) { if (v <= 90) sec.style.setProperty("--stroke-percent", String(90 - v)); else sec.remove(); }
  }
  function animerJauges(racine) {
    if (!racine) return;
    var liste = Array.prototype.slice.call(racine.querySelectorAll("[data-mu-gauge]"));
    if (!liste.length) return;
    if (reduit() || !("IntersectionObserver" in G)) { liste.forEach(poserJauge); return; }
    var io = new G.IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); G.requestAnimationFrame(function () { poserJauge(e.target); }); } });
    }, { threshold: 0.4 });
    liste.forEach(function (el) { io.observe(el); });
  }

  // ------------------------------------------------ Magic UI : Number Ticker
  // Ressort de Motion (useSpring) : raideur 100, amortissement 60, masse 1.
  function ressort(depart, arrivee, maj, fin) {
    var x = depart, v = 0, k = 100, c = 60, dernier = null;
    function pas(now) {
      if (dernier === null) dernier = now;
      var dt = Math.min(0.064, (now - dernier) / 1000); dernier = now;
      for (var t = 0; t < dt; t += 0.004) { var h = Math.min(0.004, dt - t); var a = -k * (x - arrivee) - c * v; v += a * h; x += v * h; }
      if (Math.abs(x - arrivee) < 0.004 && Math.abs(v) < 0.01) { maj(arrivee); if (fin) fin(); return; }
      maj(x); G.requestAnimationFrame(pas);
    }
    G.requestAnimationFrame(pas);
  }
  // el porte data-mu-ticker="valeur" (et data-mu-dec, data-mu-suffix). Au premier
  // passage a l'ecran, le nombre monte de data-mu-from (0) a la valeur.
  function formater(x, dec, suffixe) {
    return new Intl.NumberFormat(locale(), { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(Number(x.toFixed(dec))) + (suffixe || "");
  }
  function compteur(el, cible) {
    var dec = Number(el.getAttribute("data-mu-dec")) || 0, suf = el.getAttribute("data-mu-suffix") || "";
    var fin = cible != null ? Number(cible) : Number(el.getAttribute("data-mu-ticker"));
    var dep = el._muVal != null ? el._muVal : Number(el.getAttribute("data-mu-from") || 0);
    el.setAttribute("data-mu-ticker", String(fin));
    if (reduit() || !G.requestAnimationFrame) { el._muVal = fin; el.textContent = formater(fin, dec, suf); return; }
    var jeton = {}; el._muJeton = jeton;
    ressort(dep, fin, function (x) { if (el._muJeton !== jeton) return; el._muVal = x; el.textContent = formater(x, dec, suf); });
  }
  function animerCompteurs(racine) {
    if (!racine) return;
    var liste = Array.prototype.slice.call(racine.querySelectorAll("[data-mu-ticker]"));
    if (!liste.length) return;
    if (reduit() || !("IntersectionObserver" in G)) { liste.forEach(function (el) { compteur(el); }); return; }
    var io = new G.IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); compteur(e.target); } });
    }, { threshold: 0.6 });
    liste.forEach(function (el) { io.observe(el); });
  }

  // ------------------------------------------------ Magic UI : Animated Subscribe Button
  // Deux <span> enfants : le libelle de depart et celui d'apres. basculer(btn, 2000)
  // passe a l'etat 2 puis revient a l'etat 1 apres le delai.
  function boutonBascule(o) {
    return '<button type="button" class="mu-sub"' + (o.attrs ? " " + o.attrs : "") + '><span class="mu-sub-s mu-sub-a">' + (o.icone ? ico(o.icone) : "") + "<span>" + esc(o.avant) + "</span></span>"
      + '<span class="mu-sub-s mu-sub-b">' + ico("check") + "<span>" + esc(o.apres) + "</span></span></button>";
  }
  function basculer(btn, duree) {
    if (!btn) return;
    clearTimeout(btn._muT);
    if (reduit()) { btn.classList.add("is-on"); }
    else {
      btn.classList.add("is-out");
      btn._muT = setTimeout(function () { btn.classList.remove("is-out"); btn.classList.add("is-on"); }, 100);
    }
    btn._muT2 && clearTimeout(btn._muT2);
    btn._muT2 = setTimeout(function () { btn.classList.remove("is-on", "is-out"); }, duree || 2000);
  }

  // ------------------------------------------------ Flowbite : Drawer (placement bottom)
  function Tiroir(el, opts) {
    this._el = el; this._o = opts || {}; this._visible = false; this._decl = null; var self = this;
    el.classList.add("fb-drawer");
    el.setAttribute("aria-hidden", "true");
    this._echap = function (ev) { if (ev.key === "Escape" && self._visible) self.hide(); };
  }
  Tiroir.prototype.show = function (declencheur) {
    if (this._visible) return;
    var D = G.document, self = this;
    this._decl = declencheur || D.activeElement || null;
    this._el.classList.add("is-open");
    this._el.setAttribute("aria-modal", "true");
    this._el.setAttribute("role", "dialog");
    this._el.removeAttribute("aria-hidden");
    D.body.classList.add("fb-no-scroll");
    var fond = D.createElement("div");
    fond.setAttribute("drawer-backdrop", "");
    fond.className = "fb-backdrop";
    fond.addEventListener("click", function () { self.hide(); });
    D.body.appendChild(fond);
    this._fond = fond;
    D.addEventListener("keydown", this._echap);
    this._visible = true;
    if (this._o.onShow) this._o.onShow(this);
  };
  Tiroir.prototype.hide = function () {
    if (!this._visible) return;
    var D = G.document;
    this._el.classList.remove("is-open");
    this._el.setAttribute("aria-hidden", "true");
    this._el.removeAttribute("aria-modal");
    this._el.removeAttribute("role");
    D.body.classList.remove("fb-no-scroll");
    if (this._fond) { this._fond.remove(); this._fond = null; }
    D.removeEventListener("keydown", this._echap);
    this._visible = false;
    if (this._o.onHide) this._o.onHide(this);
    if (this._decl && this._decl.focus) try { this._decl.focus(); } catch (e) {}
  };
  Tiroir.prototype.toggle = function (d) { if (this._visible) this.hide(); else this.show(d); };
  Tiroir.prototype.isVisible = function () { return this._visible; };

  // ------------------------------------------------ Chart.js (+ datalabels)
  var chartPromesse = null;
  function script(src) {
    return new Promise(function (ok, ko) {
      var s = G.document.createElement("script"); s.src = src; s.async = true;
      s.onload = function () { ok(); }; s.onerror = function () { ko(new Error(src)); };
      G.document.head.appendChild(s);
    });
  }
  function chargerChart() {
    if (chartPromesse) return chartPromesse;
    chartPromesse = (G.Chart ? Promise.resolve() : script("/assets/vendor/chart.umd.min.js"))
      .then(function () { return G.ChartDataLabels ? null : script("/assets/vendor/chartjs-plugin-datalabels.min.js"); })
      .then(function () {
        var C = G.Chart;
        if (!C) return null;
        // Theme du site (sombre, cyan et gris), une fois.
        C.defaults.color = "#a3b1c2";
        C.defaults.borderColor = "rgba(255,255,255,.08)";
        C.defaults.font.family = '"DM Sans", system-ui, sans-serif';
        C.defaults.font.size = 12;
        C.defaults.plugins.legend.display = false;
        C.defaults.plugins.tooltip.enabled = false;
        C.defaults.maintainAspectRatio = false;
        if (reduit()) C.defaults.animation = false;
        if (G.ChartDataLabels) C.register(G.ChartDataLabels);
        C.defaults.set("plugins.datalabels", { display: false });
        return C;
      })
      .catch(function () { return null; });
    return chartPromesse;
  }
  // Formats nommes (les configurations des pages sont du JSON : pas de fonctions).
  function fmt(nom) {
    var L = locale();
    if (nom === "pct") return function (v) { return v == null ? "" : new Intl.NumberFormat(L, { maximumFractionDigits: 0 }).format(v) + " %"; };
    if (nom === "pctAbs") return function (v) { return v == null ? "" : new Intl.NumberFormat(L, { maximumFractionDigits: 0 }).format(Math.abs(v)) + " %"; };
    if (nom === "int") return function (v) { return v == null ? "" : new Intl.NumberFormat(L, { maximumFractionDigits: 0 }).format(v); };
    if (nom === "environ") return function (v) { return v == null ? "" : "≈ " + new Intl.NumberFormat(L, { maximumFractionDigits: 0 }).format(v); };
    if (nom === "dec2abs") return function (v) { return v == null ? "" : new Intl.NumberFormat(L, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v)); };
    return null;
  }
  // spec : { type, data, options, labels: { format, ancre, couleur } , ticks: { y: "pctAbs" } }
  function construire(C, canvas, spec) {
    var options = spec.options || {};
    options.plugins = options.plugins || {};
    if (spec.etiquettes) {
      var f = fmt(spec.etiquettes.format) || function (v) { return v; };
      options.plugins.datalabels = Object.assign({ display: function (ctx) { var v = ctx.dataset.data[ctx.dataIndex]; return v != null && Math.abs(Number(v)) >= (spec.etiquettes.min || 0); },
        color: spec.etiquettes.couleur || "#f4f7fb", font: { weight: "700", family: '"Space Mono", monospace', size: spec.etiquettes.taille || 12 },
        anchor: spec.etiquettes.ancre || "end", align: spec.etiquettes.alignement || "end", offset: 4, clamp: true,
        formatter: function (v, ctx) { var lab = spec.etiquettes.avecNom ? (ctx.dataset.label ? ctx.dataset.label + " " : "") : ""; return lab + f(v); } }, spec.etiquettes.extra || {});
    }
    if (spec.ticks) {
      Object.keys(spec.ticks).forEach(function (axe) {
        var f2 = fmt(spec.ticks[axe]);
        options.scales = options.scales || {}; options.scales[axe] = options.scales[axe] || {};
        options.scales[axe].ticks = Object.assign({}, options.scales[axe].ticks || {}, { callback: function (v) { return f2 ? f2(v) : v; } });
      });
    }
    if (reduit()) options.animation = false;
    var ch = new C(canvas.getContext("2d"), { type: spec.type, data: spec.data, options: options });
    canvas._chart = ch;
    canvas.dispatchEvent(new G.CustomEvent("mu-chart", { bubbles: true, detail: ch }));
    return ch;
  }
  // Dessine chaque <canvas data-ch='{json}'> de racine quand il approche de l'ecran.
  function graphiques(racine) {
    if (!racine || !G.document) return;
    var liste = Array.prototype.slice.call(racine.querySelectorAll("canvas[data-ch]")).filter(function (c) { return !c._chart && !c._chOk; });
    if (!liste.length) return;
    var go = function (c) {
      if (c._chOk) return; c._chOk = true;
      var spec = null; try { spec = JSON.parse(c.getAttribute("data-ch")); } catch (e) { spec = null; }
      if (!spec) return;
      chargerChart().then(function (C) { if (C) construire(C, c, spec); });
    };
    if (!("IntersectionObserver" in G)) { liste.forEach(go); return; }
    var io = new G.IntersectionObserver(function (en) {
      en.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); go(e.target); } });
    }, { rootMargin: "300px 0px" });
    liste.forEach(function (c) { io.observe(c); });
  }
  // <div class="ch-box" style="height:Hpx"><canvas data-ch=... role="img" aria-label=...></canvas></div>
  function canvas(spec, o) {
    o = o || {};
    return '<div class="ch-box' + (o.cls ? " " + o.cls : "") + '" style="height:' + (o.hauteur || 220) + 'px"><canvas role="img" aria-label="' + esc(o.aria || "") + '" data-ch="' + esc(JSON.stringify(spec)) + '"' + (o.attrs ? " " + o.attrs : "") + ">" + esc(o.repli || "") + "</canvas></div>";
  }

  // Tout ce qu'une racine contient : graphiques, jauges, compteurs.
  function activer(racine) { graphiques(racine); animerJauges(racine); animerCompteurs(racine); }

  return {
    ico: ico, esc: esc, reduit: reduit,
    boutonShimmer: boutonShimmer, faisceau: faisceau, reflet: reflet,
    jauge: jauge, animerJauges: animerJauges, poserJauge: poserJauge,
    compteur: compteur, animerCompteurs: animerCompteurs, ressort: ressort,
    boutonBascule: boutonBascule, basculer: basculer,
    Tiroir: Tiroir,
    chargerChart: chargerChart, graphiques: graphiques, canvas: canvas, fmt: fmt,
    activer: activer, CIRC: CIRC
  };
});
