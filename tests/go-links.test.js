"use strict";
// Liens d'affiliation /go/<site>/<source> (09/11/2026) : netlify/edge-functions/lib/go-links.mjs.
const test = require("node:test");
const assert = require("node:assert");

test("go : 1win par source, source inconnue = site, site inconnu = accueil", async () => {
  const { resolveGo, goResponse, GO_LINKS } = await import("../netlify/edge-functions/lib/go-links.mjs");
  assert.strictEqual(resolveGo("/go/1win/site").location, GO_LINKS["1win"].site);
  assert.strictEqual(resolveGo("/go/1win/x").location, GO_LINKS["1win"].x);
  assert.strictEqual(resolveGo("/go/1win/telegram").location, GO_LINKS["1win"].telegram);
  assert.strictEqual(resolveGo("/go/1win").location, GO_LINKS["1win"].site);
  assert.strictEqual(resolveGo("/go/1WIN/inconnu").location, GO_LINKS["1win"].site);
  assert.strictEqual(resolveGo("/go/autre/site").location, "/");
  assert.strictEqual(resolveGo("/go/__proto__/site").location, "/");
  const r = goResponse("/go/1win/x");
  assert.strictEqual(r.status, 302);
  assert.match(r.headers["Cache-Control"], /no-store/);
  for (const src of Object.values(GO_LINKS["1win"])) assert.match(src, /^https:\/\/[^/]+\/betting\?open=register&p=[a-z0-9]+$/);
});

test("go : declaree dans netlify.toml", () => {
  const toml = require("fs").readFileSync(require("path").join(__dirname, "..", "netlify.toml"), "utf8");
  assert.match(toml, /path = "\/go\/\*"\s*\n\s*function = "go"/);
});

test("page match : bouton 1win sous l'Avis, pour tous les pays, clic suivi", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "match-page.js"), "utf8");
  assert.match(src, /querySelectorAll\('.signal-card.avis'\)/);
  assert.match(src, /href="\/go\/\$\{bk\}\/site"/);
  assert.match(src, /rel="sponsored noopener"/);
  assert.doesNotMatch(src, /BK_PAYS_FERMES/);
  assert.match(src, /remplirBoutonsParieur\(root,vm\._raw\)/);
  const ft = require("fs").readFileSync(require("path").join(__dirname, "..", "funnel-track.js"), "utf8");
  assert.match(ft, /bookmaker_1win: true/);
  // Logo officiel du site de paris dans le bouton (fichier publie avec assets/).
  assert.match(src, /src="\/assets\/bk\/\$\{bk\}\.png"/);
  assert.ok(require("fs").existsSync(require("path").join(__dirname, "..", "assets", "bk", "1win.png")));
});

test("page match : bouton 1win aussi sur les matchs fermes et en direct, rien apres le match", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "match-page.js"), "utf8");
  const mur = src.slice(src.indexOf("function renderProWall(raw,ctx)"), src.indexOf("function renderAuthWall"));
  // Sous l'offre Pro (qui reste le bouton principal), avant l'apercu flou.
  assert.ok(mur.indexOf("['offre',") < mur.indexOf("boutonParieurHtml(") && mur.indexOf("boutonParieurHtml(") < mur.indexOf("MS.apercuFlou("));
  assert.match(mur, /momentParieur\(pub\)/);
  assert.match(src, /remplirBoutonsParieur\(root,vm\._raw\)/);
  assert.match(src, /if\(moment==='fini'\)return;/);
  const ft = require("fs").readFileSync(require("path").join(__dirname, "..", "funnel-track.js"), "utf8");
  assert.match(ft, /bookmaker_1win_mur: true, bookmaker_1win_direct: true/);
  for (const l of ["fr", "en", "de", "it", "es", "es-mx", "pt"]) {
    const d = require("../i18n/dict/" + l + ".json").match_page;
    for (const k of ["bk_cta_live", "bk_cta_mur"]) assert.match(d[k], /\{match\}.*\{book\}|\{book\}.*\{match\}/, l + " " + k);
  }
});

test("page match : moment du bouton (avant, direct, fini)", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "match-page.js"), "utf8");
  const bloc = src.slice(src.indexOf("var STATUTS_FINIS"), src.indexOf("function matchTermine")) +
    src.slice(src.indexOf("function matchTermine"), src.indexOf("// Lien vers la page Methodologie") > src.indexOf("function matchTermine") ? src.indexOf("// Lien vers la page Methodologie") : src.indexOf("const BK_NOMS")) +
    src.slice(src.indexOf("function momentParieur"), src.indexOf("function boutonParieurHtml"));
  const now = Date.now();
  const fn = new Function("window", "Date", bloc + ";return momentParieur;");
  const MT = { matchTimestamp: m => m.ts };
  const D = { now: () => now };
  const moment = fn({ IasharkMatchTime: MT }, D);
  assert.strictEqual(moment({ ts: now + 3600e3, status: "NS" }), "avant");
  assert.strictEqual(moment({ ts: now - 1800e3, status: "1H" }), "direct");
  assert.strictEqual(moment({ ts: now - 1800e3, status: "PST" }), "avant");
  assert.strictEqual(moment({ ts: now - 1800e3, status: "FT" }), "fini");
  assert.strictEqual(moment({ ts: now - 5 * 3600e3, status: "" }), "fini");
  assert.strictEqual(moment({ ts: Infinity }), "avant");
});
