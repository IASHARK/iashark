"use strict";
// Temps de lecture des articles du blog, calcule depuis le contenu reel.
//
// Pourquoi ce fichier existe : les durees affichees sur /blog.html etaient
// saisies a la main et avaient derive tres loin du contenu. "Coupe du monde
// 2026" annoncait 11 minutes pour 945 mots, soit environ 5 minutes de lecture
// - plus du double. Une duree gonflee est une petite promesse fausse, et elle
// se paie : le lecteur arrive en fin d'article bien avant ce qu'on lui a
// annonce.
//
// Ce module est la source unique. blog.html affiche ce qu'il calcule, et
// tests/blog.test.js verifie que les deux ne peuvent plus diverger.
//
// 200 mots par minute : moyenne courante pour un texte informatif en francais.
// Seul le corps de l'article compte (<main class="body">), jamais l'en-tete,
// la navigation ni le pied de page.
const fs = require("fs");
const path = require("path");

const MOTS_PAR_MINUTE = 200;
const RACINE = path.resolve(__dirname, "..");
const DOSSIER = path.join(RACINE, "blog", "guides");

function corpsDeLArticle(html) {
  const m = html.match(/<main class="body"[\s\S]*?<\/main>/i);
  return m ? m[0] : html;
}

function compterMots(html) {
  const texte = corpsDeLArticle(html)
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return texte.split(/\s+/).filter(Boolean).length;
}

function minutesDeLecture(html) {
  return Math.max(1, Math.round(compterMots(html) / MOTS_PAR_MINUTE));
}

// { "xg-expected-goals-guide-complet.html": 9, ... }
function tousLesArticles() {
  const table = {};
  for (const fichier of fs.readdirSync(DOSSIER)) {
    if (!fichier.endsWith(".html") || fichier === "index.html") continue;
    const html = fs.readFileSync(path.join(DOSSIER, fichier), "utf8");
    table[fichier] = minutesDeLecture(html);
  }
  return table;
}

module.exports = { MOTS_PAR_MINUTE, compterMots, minutesDeLecture, tousLesArticles };

if (require.main === module) {
  const table = tousLesArticles();
  for (const [fichier, minutes] of Object.entries(table).sort()) {
    console.log(String(minutes).padStart(3) + " min  " + fichier);
  }
}
