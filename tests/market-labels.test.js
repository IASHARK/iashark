"use strict";
// Libelles de paris au standard bookmaker (lib/market-labels.js), revue du
// 14/09/2026 a la demande du proprietaire : courts, compris par un parieur,
// nom de l'equipe quand on le connait, dans les 9 versions du site
// (fr, en, es, de, it, pt + gb/za -> en, mx -> es-mx).
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const L = require("../lib/market-labels.js");

const ROOT = path.join(__dirname, "..");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const dict = (l) => JSON.parse(fs.readFileSync(path.join(ROOT, "i18n", "dict", l + ".json"), "utf8"));
const opts = (l) => ({ locale: l, dict: dict(l) });
const NB = " ";
const EQ = { home: "Leeds", away: "Newcastle" };

// Tous les market_id du pipeline : cites dans le workflow ou le moteur de
// decision, plus les familles gerees par le moteur (corners, cartons,
// rembourse si nul, handicap, score exact).
function idsDuPipeline() {
  const sources = [".github/workflows/update-data.yml", "lib/decision.js", "lib/match-view-model.js"]
    .map((f) => path.join(ROOT, f)).filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n");
  const re = /["'`]((?:home|away|dc|btts|over|under|fh|draw|total)(?:-[a-z0-9_]+)*)["'`]/g;
  const ids = new Set();
  let m;
  while ((m = re.exec(sources))) {
    const id = m[1];
    if (/^(home|away|draw)$/.test(id)) continue;
    if (/^(?:home-win|away-win|draw|dc-(?:1x|x2|12)|btts-(?:yes|no)|(?:over|under)-\d{2}|fh-(?:over|under)-\d{2}|(?:home|away)-(?:team|win)-(?:over|under)-\d{2}|(?:home|away)-(?:win-to-nil|clean-sheet|win-both-halves)|total-(?:shots|shots-on-target|corners|cards)-(?:over|under)-\d+_\d)$/.test(id)) ids.add(id);
  }
  return ids;
}
const EXTRA = ["draw", "dc-12", "btts-no", "fh-over-05", "away-team-over-05", "home-dnb", "away-dnb", "home-ah-minus-1", "away-handicap-plus-1_5",
  "total-corners-over-9_5", "total-corners-under-10_5", "total-cards-over-4_5", "total-cards-under-3_5", "exact-score-2-1", "away-win-both-halves"];

test("exemples du proprietaire, mot pour mot", () => {
  const fr = (id, eq) => L.marketIdLabelFr(id, eq);
  assert.equal(fr("home-team-under-15"), "Domicile" + NB + ": moins de 1,5 but");
  assert.equal(fr("over-25", EQ), "Plus de 2,5 buts");
  assert.equal(fr("btts-yes", EQ), "Les deux équipes marquent" + NB + ": Oui");
  assert.equal(fr("home-win", EQ), "Victoire Leeds");
  assert.equal(fr("dc-x2", { home: "Newcastle", away: "Leeds" }), "Nul ou Leeds (double chance)");
  assert.equal(fr("away-team-over-05"), "Extérieur" + NB + ": plus de 0,5 but");
  assert.equal(fr("home-ah-minus-1", EQ), "Leeds -1 (handicap)");

  const en = opts("en");
  assert.equal(L.marketIdLabel("over-25", EQ, en), "Over 2.5 goals");
  assert.equal(L.marketIdLabel("btts-yes", EQ, en), "Both teams to score – Yes");
  assert.equal(L.marketIdLabel("home-team-under-15", {}, en), "Home under 1.5 goals");

  for (const l of ["es", "es-mx"]) assert.equal(L.marketIdLabel("btts-yes", EQ, opts(l)), "Ambos marcan: Sí", l);
  assert.equal(L.marketIdLabel("over-25", EQ, opts("es")), "Más de 2,5 goles");
  // Mexique : point decimal (convention es-MX).
  assert.equal(L.marketIdLabel("over-25", EQ, opts("es-mx")), "Más de 2.5 goles");
});

test("jamais une phrase : les formulations longues ont disparu", () => {
  const interdits = /ne marque pas|l’équipe|dans le match|au moins|au plus|the home team|in the match|n’encaisse aucun/i;
  const ids = [...idsDuPipeline(), ...EXTRA];
  for (const l of LOCALES) {
    for (const id of ids) {
      const txt = L.marketIdLabel(id, EQ, opts(l));
      assert.ok(!interdits.test(txt), `${l} ${id} : "${txt}"`);
      assert.ok(txt.length <= 60, `${l} ${id} trop long : "${txt}"`);
    }
  }
});

test("tous les market_id du pipeline ont un libelle dans les 7 dictionnaires", () => {
  const ids = [...idsDuPipeline(), ...EXTRA];
  assert.ok(idsDuPipeline().size >= 30, "extraction des ids du pipeline trop pauvre : " + idsDuPipeline().size);
  for (const l of LOCALES) {
    const o = opts(l);
    for (const id of ids) {
      const txt = L.marketIdLabel(id, EQ, o);
      assert.notEqual(txt, id, `${l} : ${id} non traduit`);
      assert.ok(!/[a-z]+-[a-z]+-/.test(txt), `${l} : identifiant technique visible dans "${txt}"`);
    }
  }
});

test("aucun repli francais hors FR : chaque gabarit existe dans chaque dictionnaire", () => {
  const cles = Object.keys(L.FR_TEMPLATES);
  for (const l of LOCALES.filter((x) => x !== "fr")) {
    const ns = dict(l).market_labels || {};
    const manquantes = cles.filter((k) => ns[k] == null);
    assert.deepEqual(manquantes, [], `${l} : gabarits manquants`);
  }
});

test("separateur decimal de la langue (virgule, point en anglais et au Mexique)", () => {
  const attendu = { fr: ",", en: ".", es: ",", "es-mx": ".", de: ",", it: ",", pt: "," };
  for (const [l, sep] of Object.entries(attendu)) {
    const txt = L.marketIdLabel("total-shots-on-target-under-10_5", EQ, opts(l));
    assert.ok(txt.includes("10" + sep + "5"), `${l} : "${txt}"`);
  }
});

test("nom de l'equipe quand il est connu, cote generique sinon", () => {
  for (const l of LOCALES) {
    const o = opts(l);
    for (const id of ["home-win", "dc-1x", "home-team-over-15", "home-win-over-25", "home-dnb", "home-ah-minus-1", "home-clean-sheet"]) {
      assert.ok(L.marketIdLabel(id, EQ, o).includes("Leeds"), `${l} ${id}`);
      assert.ok(!L.marketIdLabel(id, EQ, o).includes("Newcastle"), `${l} ${id} cite l'autre equipe`);
    }
    for (const id of ["away-win", "dc-x2", "away-team-under-15"]) assert.ok(L.marketIdLabel(id, EQ, o).includes("Newcastle"), `${l} ${id}`);
    assert.ok(/Leeds.*Newcastle/.test(L.marketIdLabel("dc-12", EQ, o)), `${l} dc-12`);
  }
});

test("double chance dans l'ordre du ticket : 1X = equipe puis nul, X2 = nul puis equipe", () => {
  const cas = {
    fr: ["Leeds ou nul (double chance)", "Nul ou Newcastle (double chance)"],
    en: ["Leeds or draw (double chance)", "Draw or Newcastle (double chance)"],
    es: ["Leeds o empate (doble oportunidad)", "Empate o Newcastle (doble oportunidad)"],
    de: ["Leeds oder Unentschieden (Doppelte Chance)", "Unentschieden oder Newcastle (Doppelte Chance)"],
    it: ["Leeds o pareggio (doppia chance)", "Pareggio o Newcastle (doppia chance)"],
    pt: ["Leeds ou empate (hipótese dupla)", "Empate ou Newcastle (hipótese dupla)"]
  };
  for (const [l, [x1, x2]] of Object.entries(cas)) {
    assert.equal(L.marketIdLabel("dc-1x", EQ, opts(l)), x1, l);
    assert.equal(L.marketIdLabel("dc-x2", EQ, opts(l)), x2, l);
  }
  // Dictionnaire ancien sans cles dediees : repli sur dc_win_or_draw, jamais du francais.
  assert.equal(L.marketIdLabel("dc-x2", EQ, { locale: "en", dict: { market_labels: { dc_win_or_draw: "{team} or draw" } } }), "Newcastle or draw");
});

test("libelle moteur (pari_rec) et identifiant donnent le meme texte et la meme famille", () => {
  for (const id of [...idsDuPipeline(), ...EXTRA]) {
    const moteur = L.marketIdToEngineLabel(id);
    assert.equal(L.marketLabelFr(moteur, EQ), L.marketIdLabelFr(id, EQ), `${id} -> "${moteur}"`);
    const a = L.marketFamily(id), b = L.marketFamily(moteur);
    assert.equal(b.family, a.family, `famille ${id} -> "${moteur}"`);
    assert.equal(b.side, a.side, `cote ${id} -> "${moteur}"`);
  }
});

test("les 9 versions du site pointent vers un dictionnaire qui a ces libelles", () => {
  const i18n = fs.readFileSync(path.join(ROOT, "i18n", "i18n.js"), "utf8");
  for (const [dir, locale] of [["gb", "en"], ["za", "en"], ["mx", "es-mx"]]) {
    assert.match(i18n, new RegExp(`dir:"${dir}", locale:"${locale}"`), `${dir} -> ${locale}`);
  }
  assert.equal(L.marketIdLabel("home-team-under-15", EQ, opts("en")), "Leeds under 1.5 goals");
});

test("marche inconnu : rendu tel quel, jamais reformule", () => {
  assert.equal(L.marketIdLabel("nouveau-marche-x", EQ, opts("en")), "nouveau-marche-x");
  assert.equal(L.marketLabel("Marché jamais vu 2.5", EQ, opts("de")), "Marché jamais vu 2,5");
});
