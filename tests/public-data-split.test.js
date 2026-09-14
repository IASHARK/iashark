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
    { id: 1, home: { n: "A" }, away: { n: "B" }, has_signal: true, player_history: { home: [1], away: [] }, stade: { desc: "x" }, conf: 7 },
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
  assert.match(wf, /PRELOADED_MATCH='\+JSON\.stringify\(PUBLIC_SPLIT\.toListMatch\(PREMIUM_FIELDS_LIB\.stripPremium\(m\)\)\)/,
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

test("la fonction Edge lit les fichiers decoupes, valide l'identifiant et garde data.json en repli", () => {
  const fn = read("supabase/functions/match-data/index.ts");
  assert.match(fn, /\/data-home\.json/);
  assert.match(fn, /"\/match\/" \+ id \+ "\.json"/);
  assert.match(fn, /\/\^\\d\{1,12\}\$\/\.test\(/);
  assert.match(fn, /https:\/\/iashark\.com\/data\.json/, "repli sur data.json si les fichiers decoupes manquent");
});
