#!/usr/bin/env node
"use strict";
// Videos UGC (03/10/2026) : verifie config/ugc-videos.json (source unique) et en
// ecrit la copie publique assets/ugc-videos.json, lue par assets/ugc-reel.js.
// Le dossier config/ n'est jamais publie (scripts/build-public.js#FORBIDDEN).
// Une entree invalide (type inconnu, fichier hors /assets/ugc/ ou du stockage
// public Supabase, langue inconnue...) fait ECHOUER la publication : jamais une
// video sans son badge « Image virtuelle · Publicité » / « Collaboration commerciale ».
// Usage : node scripts/build-ugc-videos.js [--check]
const fs = require("fs");
const path = require("path");
const UGC = require("../assets/ugc-reel.js");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "config", "ugc-videos.json");
const OUT = path.join(ROOT, "assets", "ugc-videos.json");

function construire(config) {
  const erreurs = [];
  const ids = new Set();
  const videos = [];
  const liste = config && Array.isArray(config.videos) ? config.videos : null;
  if (!liste) return { erreurs: ["config/ugc-videos.json : champ « videos » (liste) manquant"], videos };
  liste.forEach(function (v, i) {
    const r = UGC.valider(v);
    if (r.erreur) { erreurs.push("video " + (i + 1) + " : " + r.erreur); return; }
    if (ids.has(r.video.id)) { erreurs.push("video " + (i + 1) + " : id en double (" + r.video.id + ")"); return; }
    ids.add(r.video.id);
    videos.push(r.video);
  });
  return { erreurs, videos };
}

function run(opts) {
  opts = opts || {};
  const res = construire(JSON.parse(fs.readFileSync(SRC, "utf8")));
  if (res.erreurs.length) {
    const msg = "REFUS (videos UGC) :\n  " + res.erreurs.join("\n  ");
    if (opts.throw) throw new Error(msg);
    console.error(msg);
    process.exit(1);
  }
  const contenu = JSON.stringify({ v: 1, videos: res.videos }, null, 1) + "\n";
  if (!opts.check) {
    const avant = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : null;
    if (avant !== contenu) fs.writeFileSync(OUT, contenu);
  }
  return res.videos;
}

module.exports = { construire, run };
if (require.main === module) {
  const n = run({ check: process.argv.includes("--check") }).length;
  console.log("videos UGC : " + n + " video(s) publiee(s)" + (n ? "" : " (aucun bandeau)"));
}
