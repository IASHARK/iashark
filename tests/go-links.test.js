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
  // 1win retire le 10/11 : ses anciens liens menent chez Lolly Bet (11/11).
  for (const s of ["site", "x", "telegram"]) assert.strictEqual(GO_LINKS["1win"][s], GO_LINKS.lolly[s]);
});

test("go : Vavada (10/11) pour le site, X et Telegram", async () => {
  const { resolveGo, GO_LINKS } = await import("../netlify/edge-functions/lib/go-links.mjs");
  for (const s of ["site", "x", "telegram"]) {
    assert.strictEqual(resolveGo("/go/vavada/" + s).location, GO_LINKS.vavada[s]);
    assert.match(GO_LINKS.vavada[s], /^https:\/\/standarttrack\.com\/\?promo=[0-9a-f-]{36}&target=register$/);
  }
});

test("go : Lolly Bet (11/11), une campagne par source", async () => {
  const { resolveGo } = await import("../netlify/edge-functions/lib/go-links.mjs");
  for (const s of ["site", "x", "telegram"]) {
    assert.strictEqual(resolveGo("/go/lolly/" + s).location, "https://www.lolly-bet888.com?faff=1258&sub=" + s);
  }
  assert.strictEqual(resolveGo("/go/lolly").location, "https://www.lolly-bet888.com?faff=1258&sub=site");
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
  assert.match(ft, /bookmaker_vavada: true, bookmaker_vavada_mur: true, bookmaker_vavada_direct: true/);
  assert.match(ft, /bookmaker_lolly: true, bookmaker_lolly_mur: true, bookmaker_lolly_direct: true/);
  assert.match(src, /const BK_ACTIF='lolly';/);
  // Logo officiel du site de paris dans le bouton quand on l'a (fichier publie avec assets/), sinon le nom.
  assert.match(src, /src="\/assets\/bk\/\$\{L\.f\}"/);
  assert.match(src, /'lolly':\{f:'lolly\.svg'/);
  assert.ok(require("fs").existsSync(require("path").join(__dirname, "..", "assets", "bk", "lolly.svg")));
  assert.match(src, /bk-cta-nom/);
  assert.ok(require("fs").existsSync(require("path").join(__dirname, "..", "assets", "bk", "1win.png")));
});

test("page match : bouton 1win aussi sur les matchs fermes et en direct, rien apres le match", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "match-page.js"), "utf8");
  const mur = src.slice(src.indexOf("function renderProWall(raw,ctx)"), src.indexOf("function renderAuthWall"));
  // 12/11/2026 (Clement) : plus de bouton bookmaker sous le cadenas ; le Pro offert (Lolly Bet, partenaire) passe en premier.
  assert.ok(mur.indexOf("boutonParieurHtml(") === -1);
  assert.ok(mur.indexOf("['prooffert',") < mur.indexOf("['offre',"));
  assert.match(src, /remplirBoutonsParieur\(root,vm\._raw\)/);
  assert.match(src, /if\(moment==='fini'\)return;/);
  const ft = require("fs").readFileSync(require("path").join(__dirname, "..", "funnel-track.js"), "utf8");
  assert.match(ft, /bookmaker_1win_mur: true, bookmaker_1win_direct: true/);
  for (const l of ["fr", "en", "de", "it", "es", "es-mx", "pt"]) {
    const d = require("../i18n/dict/" + l + ".json").match_page;
    assert.match(d.bk_cta_live, /\{match\}.*\{book\}|\{book\}.*\{match\}/, l + " bk_cta_live");
    assert.match(d.bk_cta_mur, /\{book\}/, l + " bk_cta_mur");
    assert.doesNotMatch(d.bk_cta_mur, /\{match\}/, l + " bk_cta_mur sans match (une ligne)");
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
