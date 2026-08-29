"use strict";
// Echappe une valeur pour l'injecter en toute securite dans un litteral JS
// entre guillemets simples ('...'). Partage entre build-locales.js et
// i18n-manifest.js (qui en a besoin pour precalculer la version FR exacte
// de certaines regles de remplacement generees, ex. LEAGUE_LABELS) - une
// seule implementation, jamais dupliquee.
function jsStr(s) {
  return String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
module.exports = { jsStr: jsStr };
