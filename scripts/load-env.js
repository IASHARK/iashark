"use strict";
// Charge .env (racine du depot) dans process.env pour les scripts locaux,
// sans dependance npm tierce (invariant du projet) et sans jamais afficher/
// loguer une valeur. Ne fait rien si une variable est deja definie dans
// l'environnement (CI passe ses propres secrets via env:, ne doit jamais
// etre ecrase par un .env local qui n'existe pas en CI de toute facon).
// require('./load-env.js') suffit, aucun appel de fonction necessaire.
const fs = require("fs");
const path = require("path");

const ENV_PATH = path.join(__dirname, "..", ".env");
try {
  var content = fs.readFileSync(ENV_PATH, "utf8");
  content.split("\n").forEach(function (line) {
    var trimmed = line.trim();
    if (!trimmed || trimmed[0] === "#") return;
    var eq = trimmed.indexOf("=");
    if (eq === -1) return;
    var key = trimmed.slice(0, eq).trim();
    var value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (process.env[key] === undefined) process.env[key] = value;
  });
} catch (e) {
  // .env absent (CI, ou pas encore cree localement) : rien a faire, les
  // variables d'environnement deja presentes (CI secrets) restent utilisees.
}
