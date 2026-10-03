"use strict";
// Decoupage de data.json (perf, 14/09/2026) : data-home.json (liste legere)
// et match/<id>.json (detail). Ces fichiers sont PUBLICS : aucun champ premium
// ne doit y figurer hors match offert (is_free === true).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const split = require("../lib/public-data-split.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

test("la liste des champs premium couvre la fonction Edge et le pipeline", () => {
  const fn = read("supabase/functions/match-data/index.ts");
  const bloc = fn.slice(fn.indexOf("const PREMIUM_FIELDS"), fn.indexOf("];", fn.indexOf("const PREMIUM_FIELDS")));
  for (const m of bloc.matchAll(/"([A-Za-z0-9_]+)"/g)) {
    assert.ok(split.PREMIUM_FIELDS.includes(m[1]), m[1] + " manque dans lib/public-data-split.js");
  }
  const wf = read(".github/workflows/update-data.yml");
  // Pipeline : plus de liste litterale, la liste unique lib/premium-fields.js.
  assert.match(wf, /var CHAMPS_PREMIUM=PREMIUM_FIELDS_LIB\.PREMIUM_FIELDS\.slice\(\);/);
  assert.equal(split.PREMIUM_FIELDS, require("../lib/premium-fields.js").PREMIUM_FIELDS);
  const { PREMIUM_I18N_FIELDS } = require("../lib/narrative-i18n.js");
  for (const c of PREMIUM_I18N_FIELDS) assert.ok(split.PREMIUM_FIELDS.includes(c), c);
});

// 14/09/2026 : certains champs de detail (top_scorers, mc_scores, analyse...) sont
// desormais premium ; ils n'existent alors que sur le match offert. Le decoupage
// ne retire ni n'ajoute rien : c'est ce que ce test verifie.
test("aucun champ premium n'est ajoute par le decoupage", () => {
  const publics = [
    { id: 1, home: { n: "A" }, away: { n: "B" }, has_signal: true, player_history: { home: [1], away: [] }, stade: { desc: "x" } },
    { id: 2, home: { n: "C" }, away: { n: "D" }, is_free: true, pari_rec: "Over 2.5", cote_rec: "1.9", player_history: { home: [], away: [] } },
  ];
  const s = split.buildPublicSplit(publics, { generated_at: "2026-09-14T08:00:00Z", run_id: "DAILY" });
  assert.equal(s.list.matchs.length, 2);
  assert.equal(s.list.matchs[0].player_history, undefined);
  assert.deepEqual(s.list.matchs[0].stade, { desc: "x" }, "stade reste lu par les cartes d'accueil");
  assert.equal(s.list.matchs[0].detail_omitted, true);
  assert.deepEqual(split.premiumLeaks(s.list.matchs[0]), []);
  assert.equal(s.list.matchs[1].pari_rec, "Over 2.5", "le match offert garde son pari");
  assert.equal(s.list.run_output, undefined, "run_output n'est jamais recopie dans la liste");
  assert.equal(s.details[0].match, publics[0], "le detail est la copie assainie telle quelle");
  assert.equal(s.details[0].path, "match/1.json");
  assert.equal(split.buildPublicSplit([{ id: "../x" }]).details.length, 0, "identifiant non numerique refuse");
});

test("fichier reel data-home.json : leger, sans detail, sans champ premium hors match offert", () => {
  const p = path.join(root, split.LIST_FILE);
  assert.ok(fs.existsSync(p), "data-home.json absent : lancer node scripts/split-public-data.js");
  const d = JSON.parse(fs.readFileSync(p, "utf8"));
  assert.ok(Array.isArray(d.matchs) && d.matchs.length > 0);
  assert.equal(d.run_output, undefined);
  assert.ok(fs.statSync(p).size < 1024 * 1024, "la liste doit rester sous 1 Mo");
  for (const m of d.matchs) {
    assert.deepEqual(split.premiumLeaks(m), [], "fuite premium dans data-home.json, match " + m.id);
    for (const f of split.DETAIL_ONLY_FIELDS) assert.equal(m[f], undefined, f + " dans data-home.json");
  }
});

test("fichiers reels match/<id>.json : un par match de la liste, sans champ premium hors match offert", () => {
  const d = JSON.parse(read(split.LIST_FILE));
  const fichiers = fs.readdirSync(path.join(root, "match")).filter((f) => /\.json$/.test(f));
  assert.ok(fichiers.length > 0);
  for (const f of fichiers) {
    assert.match(f, /^\d{1,12}\.json$/);
    const m = JSON.parse(read("match/" + f));
    assert.equal(String(m.id) + ".json", f);
    assert.deepEqual(split.premiumLeaks(m), [], "fuite premium dans match/" + f);
  }
  for (const m of d.matchs) assert.ok(fichiers.includes(m.id + ".json"), "detail manquant pour " + m.id);
});

test("pages statiques match/<id>.html : PRELOADED_MATCH sans champ premium hors match offert", () => {
  const pages = fs.readdirSync(path.join(root, "match")).filter((f) => /\.html$/.test(f));
  for (const f of pages) {
    const mm = read("match/" + f).match(/<script>var PRELOADED_MATCH=([\s\S]*?);<\/script>/);
    if (!mm) continue;
    const m = JSON.parse(mm[1]);
    assert.deepEqual(split.premiumLeaks(m), [], "fuite premium dans PRELOADED_MATCH de match/" + f);
  }
});

test("le pipeline ecrit les fichiers decoupes depuis matchsPublics et les publie", () => {
  const wf = read(".github/workflows/update-data.yml");
  assert.match(wf, /require\('\.\/lib\/public-data-split\.js'\)/);
  assert.match(wf, /PUBLIC_SPLIT\.writePublicSplit\(fs,matchsPublics,/,
    "les fichiers publics decoupes doivent venir de la copie assainie");
  assert.doesNotMatch(wf, /writePublicSplit\(fs,allMatchsData/);
  assert.match(wf, /PUBLIC_SPLIT\.writePublicSplit\(fs,\[\],/, "jour sans matchs : liste videe aussi");
  // PUBLIC_SPLIT.preloadedMatch = toListMatch(stripPremium(withProbBand(m))) (16/09/2026).
  assert.match(wf, /PRELOADED_MATCH='\+JSON\.stringify\(PUBLIC_SPLIT\.preloadedMatch\(m\)\)/,
    "PRELOADED_MATCH est la version legere du match assaini");
  assert.match(wf, /keepFiles\[String\(m\.id\)\+'\.json'\]=true;/);
  const outputs = wf.match(/OUTPUTS="([^"]*)"/)[1].split(/\s+/);
  assert.ok(outputs.includes("data-home.json"), "data-home.json doit etre commite");
  assert.ok(outputs.includes("match"), "match/ (html et json) doit etre commite");
});

test("les pages lisent les fichiers legers, sans casser le cache avec Date.now()", () => {
  const pages = { "index.html": read("index.html"), "marches.html": read("marches.html"), "match-page.js": read("match-page.js"), "player-page.js": read("player-page.js") };
  for (const [f, s] of Object.entries(pages)) {
    assert.doesNotMatch(s, /data\.json\?t=/, f + " : ?t=Date.now() contourne le cache CDN");
  }
  assert.match(pages["index.html"], /fetch\('\/data-home\.json'/);
  assert.match(pages["marches.html"], /fetch\('\/data-home\.json'/);
  assert.match(pages["match-page.js"], /lire\('\/data-home\.json'\)/);
  assert.match(pages["match-page.js"], /lire\('\/match\/'\+encodeURIComponent\(id\)\+'\.json'\)/);
  assert.match(pages["player-page.js"], /fetch\('\/match\/' \+ encodeURIComponent\(matchId\) \+ '\.json'/);
  // Abonne : la fonction Edge recoit la portee demandee.
  assert.match(pages["index.html"], /functions\.invoke\('match-data',\{body:\{scope:'list'\}\}\)/);
  assert.match(pages["match-page.js"], /functions\.invoke\('match-data',\{body:\{id:String\(id\)\}\}\)/);
});

// 16/09/2026 (quota Netlify depasse le 15/09) : la fonction ne telecharge plus
// jamais data.json (~13 Mo par appel), meme sans portee ; data.json n'est plus publie.
test("la fonction Edge lit uniquement les fichiers decoupes et valide l'identifiant", () => {
  const fn = read("supabase/functions/match-data/index.ts");
  assert.match(fn, /\/data-home\.json/);
  assert.match(fn, /"\/match\/" \+ id \+ "\.json"/);
  assert.match(fn, /\/\^\\d\{1,12\}\$\/\.test\(/);
  assert.doesNotMatch(fn.replace(/\/\/.*$/gm, ""), /data\.json"/, "aucun telechargement de data.json");
});

// 16/09/2026 : champs publics derives de la liste d'accueil.
test("prob_band : 3 niveaux seulement, calcules depuis la probabilite du pari retenu, jamais sans analyse", () => {
  assert.deepEqual(split.PROB_BANDS, ["high", "good", "moderate"]);
  const b = (extra) => split.probBand(Object.assign({ id: 1, pari_rec: "Over 2.5" }, extra));
  assert.equal(b({ model_probability: 75 }), "high");
  assert.equal(b({ model_probability: 74.9 }), "good");
  assert.equal(b({ model_probability: 65 }), "good");
  assert.equal(b({ model_probability: 64.9 }), "moderate");
  assert.equal(b({ model_probability: null, conf: 7.6 }), "high", "repli sur conf (= probabilite / 10)");
  assert.equal(b({ model_probability: 80, no_signal: true }), null, "no_signal : aucun niveau");
  assert.equal(split.probBand({ id: 2, model_probability: 80 }), null, "sans pari : aucun niveau");
  assert.equal(split.probBand({ id: 3, has_signal: true, prob_band: "good" }), "good", "copie assainie : garde son niveau");
  assert.equal(split.probBand({ id: 4, has_signal: true, prob_band: "76" }), null, "valeur hors liste ignoree");
  const pub = require("../lib/premium-fields.js").stripPremium(split.withProbBand({ id: 5, home: { n: "A" }, away: { n: "B" }, pari_rec: "Over 2.5", model_probability: 71.3, conf: 7.13 }));
  assert.equal(pub.prob_band, "good");
  assert.equal(pub.model_probability, undefined);
  assert.equal(pub.conf, undefined);
  assert.deepEqual(require("../lib/premium-fields.js").deepPremiumLeaks([pub]), [], "prob_band n'est pas un champ premium");
  assert.ok(!require("../lib/premium-fields.js").PREMIUM_FIELDS.includes("prob_band"));
});

test("fichier reel data-home.json : prob_band dans la liste fermee, aucune probabilite chiffree derivable", () => {
  const d = JSON.parse(read(split.LIST_FILE));
  for (const m of d.matchs) {
    if (m.prob_band !== undefined) assert.ok(split.PROB_BANDS.includes(m.prob_band), "prob_band invalide, match " + m.id);
    if (m.is_free === true) continue;
    for (const k of ["model_probability", "conf", "conf_bucket", "p1", "pn", "p2", "po25", "btts", "edge"]) assert.equal(m[k], undefined, k + " sur le match " + m.id);
    if (m.prob_band !== undefined) assert.equal(m.has_signal, true, "niveau sans analyse, match " + m.id);
  }
});

// Page match V8 (16/09/2026) : le niveau public est lu par la page match du
// visiteur. Il est porte par match/<id>.json (copie publique) et PRELOADED_MATCH.
test("prob_band : dans match/<id>.json et PRELOADED_MATCH, jamais la valeur exacte", () => {
  const PREM = require("../lib/premium-fields.js");
  const brut = { id: 77, home: { n: "A" }, away: { n: "B" }, date: "2026-09-16 21:00", pari_rec: "Over 2.5", model_probability: 76.2, conf: 7.6, p1: 50, h2h: [{ s: "1-0" }] };
  const pub = PREM.stripPremium(split.withProbBand(brut));
  const s = split.buildPublicSplit([pub], {});
  assert.equal(s.list.matchs[0].prob_band, "high");
  assert.equal(s.details[0].match.prob_band, "high", "detail match/<id>.json");
  const pre = split.preloadedMatch(brut);
  assert.equal(pre.prob_band, "high", "PRELOADED_MATCH depuis le match complet");
  assert.equal(split.preloadedMatch(pub).prob_band, "high", "PRELOADED_MATCH depuis la copie assainie");
  assert.equal(pre.detail_omitted, true);
  assert.equal(pre.h2h, undefined, "version legere");
  for (const k of ["model_probability", "conf", "p1", "pari_rec"]) assert.equal(pre[k], undefined, k);
  assert.deepEqual(PREM.deepPremiumLeaks([pre, s.details[0].match]), []);
  assert.doesNotMatch(JSON.stringify(pre), /76/);
  assert.equal(split.preloadedMatch({ id: 78, home: { n: "A" }, away: { n: "B" }, no_signal: true, model_probability: 80 }).prob_band, undefined, "pas d'analyse : aucun niveau");
  const offert = split.preloadedMatch({ id: 79, is_free: true, home: { n: "A" }, away: { n: "B" }, pari_rec: "Over 2.5", model_probability: 70 });
  assert.equal(offert.pari_rec, "Over 2.5", "match offert : inchange");
  // Meme fonction dans le pipeline, les pages localisees et la regeneration locale.
  assert.match(read(".github/workflows/update-data.yml"), /'<script>var PRELOADED_MATCH='\+JSON\.stringify\(PUBLIC_SPLIT\.preloadedMatch\(m\)\)/);
  assert.match(read("scripts/seo-pages.js"), /JSON\.stringify\(PUBLIC_SPLIT\.preloadedMatch\(m\)\)/);
  assert.match(read("scripts/split-public-data.js"), /m\.prob_band = bandeParId\[String\(m\.id\)\]/);
  // Fichiers reels : un match/<id>.json porte le meme niveau que la liste.
  const liste = JSON.parse(read(split.LIST_FILE)).matchs;
  for (const m of liste) {
    const f = path.join(root, split.detailPath(m.id));
    if (!fs.existsSync(f)) continue;
    const d = JSON.parse(fs.readFileSync(f, "utf8"));
    assert.equal(d.prob_band, m.prob_band, "prob_band liste/detail, match " + m.id);
  }
});

test("derby : { key, name } depuis data/derby-index.json, ajoute a la liste seulement", () => {
  const index = { pairs: { "2278-2287": { key: "clasico-nacional", pages: { mx: { name: "Clásico Nacional" } } } } };
  const derby = { id: 9, home: { n: "America", id: 2287 }, away: { n: "Guadalajara Chivas", id: 2278 } };
  const autre = { id: 10, home: { n: "A", id: 1 }, away: { n: "B", id: 2 } };
  const s = split.buildPublicSplit([derby, autre], { derbyIndex: index });
  assert.deepEqual(s.list.matchs[0].derby, { key: "clasico-nacional", name: "Clásico Nacional" });
  assert.equal(s.list.matchs[1].derby, undefined);
  assert.equal(s.details[0].match, derby, "le detail reste la copie assainie telle quelle");
  assert.equal(split.derbyKeyOf(derby), "2278-2287");
  const fs2 = require("node:fs");
  const real = split.loadDerbyIndex(fs2, root);
  assert.ok(real && real.pairs && Object.keys(real.pairs).length > 0, "data/derby-index.json lisible");
});

test("pipeline : prob_band pose avant le retrait des champs premium, statut API public", () => {
  const wf = read(".github/workflows/update-data.yml");
  const bloc = wf.slice(wf.indexOf("var matchsPublics=allMatchsData.map(function(m){"), wf.indexOf("var retires=allMatchsData.length"));
  assert.match(bloc, /if\(!m\|\|m\.is_free\|\|!PEUT_PROTEGER\)return m;\s*m=PUBLIC_SPLIT\.withProbBand\(m\);\s*var copie=\{\};/);
  assert.match(wf, /status:\(f\.status&&f\.status\.short\)\|\|null,/);
  assert.match(read("scripts/split-public-data.js"), /m && m\.is_free !== true \? split\.withProbBand\(m\) : m; \}\)\.map\(PREMIUM\.stripPremium\)/);
});
