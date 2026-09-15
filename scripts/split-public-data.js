#!/usr/bin/env node
"use strict";
// Regenere localement les fichiers publics depuis le data.json courant, avec
// le MEME code que le pipeline, pour que le site soit juste avant le prochain
// run quotidien :
//   - data.json lui-meme (matchs assainis, run_output public) ;
//   - data-home.json et match/<id>.json (lib/public-data-split.js) ;
//   - PRELOADED_MATCH des pages statiques match/<id>.html.
//
// Le data.json local peut dater d'avant un durcissement de la liste premium
// (market_id/marche le 14/09/2026, puis toutes les sorties du modele et de
// l'analyse : lib/premium-fields.js). On applique donc ici la meme regle que
// matchsPublics (PEUT_PROTEGER=true en production) : champs premium retires
// de tout match non offert. Les champs retires ne sont pas perdus : le
// pipeline les ecrit dans match_premium_data a chaque run.
//
// Usage : node scripts/split-public-data.js
const fs = require("fs");
const path = require("path");
const split = require("../lib/public-data-split.js");
const PREMIUM = require("../lib/premium-fields.js");
const { publicSafePick, publicTopScorers, publicDailyCombos } = require("../lib/public-run-output.js");

const ROOT = path.join(__dirname, "..");
const DATA = path.join(ROOT, "data.json");
const data = JSON.parse(fs.readFileSync(DATA, "utf8"));

// prob_band (niveau grossier, public) calcule AVANT le retrait des champs
// premium d'un match non offert, comme dans le pipeline ; une copie deja
// assainie garde le sien.
const matchsPublics = (data.matchs || []).map(function (m) { return m && m.is_free !== true ? split.withProbBand(m) : m; }).map(PREMIUM.stripPremium);

// data.json : meme forme que dataJsonPayload du pipeline.
const ro = data.run_output;
const dataPublic = Object.assign({}, data, { matchs: matchsPublics });
if (ro && typeof ro === "object") {
  dataPublic.run_output = Object.assign({}, ro, {
    safe_pick: publicSafePick(ro.safe_pick, matchsPublics),
    top5_scorers: publicTopScorers(ro.top5_scorers),
    daily_combos: publicDailyCombos(ro.daily_combos),
  });
}
const avantData = fs.statSync(DATA).size;
fs.writeFileSync(DATA, JSON.stringify(dataPublic, null, 2));
console.log("data.json : " + matchsPublics.length + " matchs assainis, " + avantData + " -> " + fs.statSync(DATA).size + " octets");

const meta = {
  generated_at: (ro && ro.snapshot) || null,
  run_id: (ro && ro.run_id) || null,
};
const stats = split.writePublicSplit(fs, matchsPublics, meta, ROOT);
console.log("data-home.json : " + stats.listBytes + " octets, " + matchsPublics.length + " matchs");
console.log("match/<id>.json : " + stats.detailCount + " fichiers, " + stats.detailBytes + " octets au total");

// PRELOADED_MATCH des pages statiques : allege si le detail existe, et
// champs premium retires pour tout match non offert (pages perimees comprises).
const RE = /<script>var PRELOADED_MATCH=([\s\S]*?);<\/script>/;
let pages = 0, avant = 0, apres = 0;
fs.readdirSync(path.join(ROOT, "match")).filter(function (f) { return /^\d+\.html$/.test(f); }).forEach(function (f) {
  const p = path.join(ROOT, "match", f);
  const html = fs.readFileSync(p, "utf8");
  const mm = html.match(RE);
  if (!mm) return;
  let m;
  try { m = JSON.parse(mm[1]); } catch (e) { console.warn("PRELOADED_MATCH illisible : " + f); return; }
  m = PREMIUM.stripPremium(m);
  if (m && fs.existsSync(path.join(ROOT, split.detailPath(m.id)))) m = split.toListMatch(m);
  const out = html.replace(RE, function () {
    return "<script>var PRELOADED_MATCH=" + JSON.stringify(m).replace(/</g, "\\u003c") + ";</script>";
  });
  avant += Buffer.byteLength(html); apres += Buffer.byteLength(out); pages++;
  if (out !== html) fs.writeFileSync(p, out);
});
console.log("match/<id>.html : " + pages + " pages, " + avant + " -> " + apres + " octets");
