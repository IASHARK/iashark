"use strict";
// Echappe une valeur pour l'injecter en toute securite dans un litteral JS
// entre guillemets simples ('...'). Partage entre build-locales.js et
// i18n-manifest.js (qui en a besoin pour precalculer la version FR exacte
// de certaines regles de remplacement generees, ex. LEAGUE_LABELS) - une
// seule implementation, jamais dupliquee.
//
// Echappe aussi les retours a la ligne reels (\n/\r) en sequences \n/\r
// litterales - un dictionnaire JSON peut contenir un "\n" qui, une fois
// JSON.parse() par Node, devient un VRAI caractere de nouvelle ligne dans
// la chaine JS ; insere tel quel dans un litteral '...'/"...", ce caractere
// casse la syntaxe JS (bug reel trouve sur compte.html : le corps de la
// demande de suppression de compte contient \n\n et cassait le script
// genere - JSON.parse() ne re-echappe jamais automatiquement un caractere
// deja "deroule").
function jsStr(s) {
  return String(s)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
}
module.exports = { jsStr: jsStr };
