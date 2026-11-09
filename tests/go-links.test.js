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

test("page match : bouton 1win sous l'Avis, pays fermes, clic suivi", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "match-page.js"), "utf8");
  assert.match(src, /querySelectorAll\('.signal-card.avis'\)/);
  assert.match(src, /href="\/go\/\$\{bk\}\/site"/);
  assert.match(src, /rel="sponsored noopener"/);
  assert.match(src, /'1win':\['FR'/);
  assert.match(src, /remplirBoutonsParieur\(root\)/);
  const ft = require("fs").readFileSync(require("path").join(__dirname, "..", "funnel-track.js"), "utf8");
  assert.match(ft, /bookmaker_1win: true/);
});
