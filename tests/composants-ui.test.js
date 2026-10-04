"use strict";
// Composants de bibliotheques reconnues (04/10/2026, exigence de Clement : « prends
// des elements, des composants » ; aucun dessin fait main). Ces tests gardent :
//  - chaque composant cite sa source et sa licence ;
//  - les icones viennent de Lucide (contenu SVG d'origine), jamais tracees a la main ;
//  - les graphiques passent par Chart.js (fichier d'origine), charge a la demande ;
//  - le mouvement est coupe si prefers-reduced-motion ;
//  - aucun <path>/<rect> ecrit a la main dans les modules de l'interface.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

test("icones Lucide : contenu SVG d'origine, licence ISC, chaque icone utilisee existe", () => {
  const I = require("../lib/icones.js");
  const src = read("lib/icones.js");
  assert.match(src, /lucide-static v1\.51\.0|lucide-static 1\.51\.0/);
  assert.match(src, /Licence ISC/);
  const lock = I.svg("lock", "x");
  assert.match(lock, /^<svg class="lucide lucide-lock x" xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">/);
  assert.match(lock, /<rect width="18" height="11" x="3" y="11" rx="2" ry="2"\/> <path d="M7 11V7a5 5 0 0 1 10 0v4"\/>/, "trace exact de lucide-static");
  assert.equal(I.svg("inconnue"), "");
  // Toutes les icones demandees par le code existent.
  const fichiers = ["lib/offre-pro.js", "lib/aujourdhui.js", "lib/match-sections.js", "lib/composants.js", "match-page.js"];
  const noms = new Set();
  for (const f of fichiers) {
    for (const m of read(f).matchAll(/(?:\bico|icone|IasharkIcones\.svg|I\.svg)\(\s*"([a-z0-9-]+)"/g)) noms.add(m[1]);
    for (const m of read(f).matchAll(/(?:\bico|icone|IasharkIcones\.svg|\blucide)\(\s*'([a-z0-9-]+)'/g)) noms.add(m[1]);
    for (const m of read(f).matchAll(/const LUCIDE=\{([^}]*)\}/g)) for (const x of m[1].matchAll(/:'([a-z0-9-]+)'/g)) noms.add(x[1]);
    for (const m of read(f).matchAll(/\['(signal-[a-z]+)','(signal-[a-z]+)','(signal-[a-z]+)'\]/g)) [m[1], m[2], m[3]].forEach((x) => noms.add(x));
    for (const m of read(f).matchAll(/\[\s*"([a-z0-9-]+)",\s*t\("offre_pro\./g)) noms.add(m[1]);
    for (const m of read(f).matchAll(/icone: "([a-z0-9-]+)"/g)) noms.add(m[1]);
    for (const m of read(f).matchAll(/carte\("\w+", "([a-z0-9-]+)"/g)) noms.add(m[1]);
  }
  assert.ok(noms.size >= 15, [...noms].join(" "));
  for (const n of noms) assert.ok(I.noms.includes(n), "icone absente de lib/icones.js : " + n);
});

test("aucun dessin fait main : ni <path>, ni <rect>, ni <circle> ecrits dans les modules de l'interface", () => {
  for (const f of ["lib/offre-pro.js", "lib/aujourdhui.js", "lib/match-sections.js", "abonnement.html", "abonnement-page.js"]) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(src, /<path\b|<rect\b|<polygon\b|<polyline\b|<circle\b/, f + " : trace SVG ecrit a la main");
  }
  // Les seuls cercles SVG du site neuf sont ceux de la jauge Magic UI (r=45, epaisseur 10).
  const c = read("lib/composants.js");
  assert.equal((c.match(/<circle class="mu-gauge-(sec|pri)" cx="50" cy="50" r="45" stroke-width="10"/g) || []).length, 2);
  // Page match (assemblage du 04/10) : icones Lucide partout ; seul le trace de la cible de
  // l'Avis reste (l'Avis ne change pas d'un caractere) ; plus de barres « niveau » dessinees.
  const mp = read("match-page.js");
  const icons = mp.slice(mp.indexOf("const ICONS={"), mp.indexOf("};", mp.indexOf("const ICONS={")));
  assert.deepEqual([...icons.matchAll(/^\s*([a-z0-9]+):/gm)].map((m) => m[1]), ["target"]);
  assert.doesNotMatch(mp + read("assets/match-page.css"), /band-bars/);
  assert.match(mp, /signal-low','signal-medium','signal-high/);
});

test("chaque composant cite sa source et sa licence ; mouvement reduit respecte", () => {
  const css = read("assets/composants.css");
  for (const [nom, url] of [
    ["Magic UI — Shimmer Button", "magicui/shimmer-button.tsx"], ["Magic UI — Border Beam", "magicui/border-beam.tsx"],
    ["Magic UI — Shine Border", "magicui/shine-border.tsx"], ["Magic UI — Animated Circular Progress Bar", "animated-circular-progress-bar.tsx"],
    ["Magic UI — Animated Subscribe Button", "animated-subscribe-button.tsx"], ["HyperUI — Radio Groups", "radio-groups/2-dark.html"],
    ["HyperUI — Tabs", "tabs/2-dark.html"], ["HyperUI — Badges", "badges/2-dark.html"], ["HyperUI — Stats", "stats/3-dark.html"],
    ["Flowbite — Drawer", "flowbite/blob/main/src/components/drawer/index.ts"], ["21st.dev — « Ticket Confirmation Card »", "ravikatiyar162/components/ticket-confirmation-card"]
  ]) {
    assert.ok(css.includes(nom), "source citee : " + nom);
    assert.ok(css.includes(url), "lien : " + url);
  }
  // Keyframes d'origine (registre Magic UI).
  assert.match(css, /@keyframes mu-shimmer-slide\{to\{transform:translate\(calc\(100cqw - 100%\),0\)\}\}/);
  assert.match(css, /@keyframes mu-spin-around\{0%\{transform:translateZ\(0\) rotate\(0\)\}15%,35%\{transform:translateZ\(0\) rotate\(90deg\)\}65%,85%\{transform:translateZ\(0\) rotate\(270deg\)\}100%\{transform:translateZ\(0\) rotate\(360deg\)\}\}/);
  assert.match(css, /@keyframes mu-shine\{0%\{background-position:0% 0%\}50%\{background-position:100% 100%\}to\{background-position:0% 0%\}\}/);
  const reduit = css.slice(css.lastIndexOf("@media (prefers-reduced-motion:reduce)"));
  for (const sel of [".mu-shimmer-spark", ".mu-beam", ".mu-gauge", ".mu-sub", ".fb-drawer", ".tc"]) assert.ok(reduit.includes(sel), "mouvement reduit : " + sel);
  assert.match(css, /@media \(prefers-reduced-motion:no-preference\)\{\.mu-shine\{animation:/, "reflet seulement sans mouvement reduit");
  const lic = read("assets/vendor/LICENCES.txt");
  for (const x of ["Chart.js 4.5.1", "MIT License", "Lucide", "ISC License", "Magic UI", "HyperUI", "Flowbite", "chartjs-plugin-datalabels 2.2.0", "ravikatiyar162"]) assert.ok(lic.includes(x), "licence : " + x);
});

test("Chart.js et son greffon : fichiers d'origine, charges a la demande depuis le site, jamais un CDN", () => {
  const chart = read("assets/vendor/chart.umd.min.js");
  assert.match(chart.slice(0, 200), /Chart\.js v4\.5\.1[\s\S]*Released under the MIT License/);
  assert.match(read("assets/vendor/chartjs-plugin-datalabels.min.js").slice(0, 200), /chartjs-plugin-datalabels v2\.2\.0[\s\S]*MIT license/);
  const c = read("lib/composants.js");
  assert.match(c, /script\("\/assets\/vendor\/chart\.umd\.min\.js"\)/);
  assert.match(c, /script\("\/assets\/vendor\/chartjs-plugin-datalabels\.min\.js"\)/);
  assert.match(c, /IntersectionObserver[\s\S]*rootMargin: "300px 0px"/, "dessin quand le graphique approche de l'ecran");
  assert.match(c, /if \(reduit\(\)\) C\.defaults\.animation = false;/);
  for (const page of ["index.html", "abonnement.html", "compte.html", "match.html"]) assert.doesNotMatch(read(page), /chart\.umd|chartjs/, page + " : Chart.js charge d'office");
});

test("Magic UI Shimmer Button : structure d'origine ; jauge et bascule d'origine", () => {
  global.window = undefined;
  const C = require("../lib/composants.js");
  const b = C.boutonShimmer({ href: "/abonnement.html?duree=month", label: "Passe <Pro>", cls: "op-cta", attrs: 'data-track="x"' });
  assert.match(b, /^<a class="mu-shimmer op-cta" href="\/abonnement\.html\?duree=month" data-track="x"><span class="mu-shimmer-spark-c" aria-hidden="true"><span class="mu-shimmer-spark"><span class="mu-shimmer-spark-b"><\/span><\/span><\/span><span data-mu-label>Passe &lt;Pro&gt;<\/span><span class="mu-shimmer-hl" aria-hidden="true"><\/span><span class="mu-shimmer-bd" aria-hidden="true"><\/span><\/a>$/);
  const j = C.jauge(35, "35 %", { aria: "Chance de marquer : 35 %" });
  assert.match(j, /data-mu-gauge="35" role="img" aria-label="Chance de marquer : 35 %"/);
  assert.match(j, /viewBox="0 0 100 100"/);
  const s = C.boutonBascule({ avant: "Copier le ticket", apres: "Copié", attrs: 'data-tk-copy="x5"' });
  assert.match(s, /^<button type="button" class="mu-sub" data-tk-copy="x5"><span class="mu-sub-s mu-sub-a">/);
  assert.match(s, /<span class="mu-sub-s mu-sub-b">[\s\S]*Copié/);
  const cv = C.canvas({ type: "bar", data: { labels: ["a"], datasets: [{ data: [1] }] } }, { hauteur: 120, aria: "Graphique" });
  assert.match(cv, /^<div class="ch-box" style="height:120px"><canvas role="img" aria-label="Graphique" data-ch="\{&quot;type&quot;:&quot;bar&quot;/);
});
