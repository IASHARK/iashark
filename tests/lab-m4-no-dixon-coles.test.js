"use strict";
// EXP-004 item 3 + item 21.B (SPEC LAB PRO v1.0, M4 NB2) - M4 remplace la
// FAMILLE de distribution du score (NB2 independant) tout en conservant
// exactement les memes moyennes M2. AUCUN tau Dixon-Coles ne doit
// intervenir dans la matrice/vraisemblance M4 - contrat qui echoue si
// `rho`, `dixonColesCorr` ou toute fonction du module DC apparait dans le
// code M4 (import ou reference litterale).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const M4_SOURCE_FILES = [
  "lib/lab/nb2.js",
  "lib/lab/nb2-matrix.js",
  "lib/lab/nb2-log-probability.js",
  "lib/lab/nb2-python-fitter.js",
  "lib/lab/nb2-synthetic-identifiability.js",
  "lib/lab/walkforward-m4-runner.js",
];

// Ne scanne QUE le code executable reel (imports/appels de fonction),
// jamais la prose des commentaires - plusieurs fichiers M4 EXPLIQUENT
// dans leurs commentaires pourquoi dixonColesCorr/tau NE sont PAS
// utilises (voir headers), ce qui ferait un faux-positif sur un scan
// naif du texte brut.
const FORBIDDEN_CALL_PATTERNS = [
  { name: "dixonColesCorr(...)", re: /dixonColesCorr\s*\(/ },
  { name: "tau(...) (fonction Dixon-Coles)", re: /(?<!\w)tau\s*\(/ },
  { name: "predictWithRho(...)", re: /predictWithRho\s*\(/ },
  { name: "require(...dc-matrix-with-rho...)", re: /require\([^)]*dc-matrix-with-rho[^)]*\)/ },
  { name: "require(...dc-log-probability...)", re: /require\([^)]*dc-log-probability[^)]*\)/ },
];

function stripComments(source) {
  return source
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
}

test("aucun fichier source M4 n'importe ni n'appelle une fonction Dixon-Coles (dixonColesCorr/tau/predictWithRho, hors commentaires explicatifs)", () => {
  for (const relPath of M4_SOURCE_FILES) {
    const fullPath = path.join(__dirname, "..", relPath);
    assert.ok(fs.existsSync(fullPath), `fichier attendu manquant: ${relPath}`);
    const codeOnly = stripComments(fs.readFileSync(fullPath, "utf8"));
    for (const { name, re } of FORBIDDEN_CALL_PATTERNS) {
      assert.doesNotMatch(codeOnly, re, `${relPath} contient un APPEL interdit (${name}) - M4 ne doit JAMAIS appliquer le tau Dixon-Coles a ses cellules NB`);
    }
  }
});

test("walkforward-m4-runner.js n'importe QUE des modules NB2/M2, jamais lib/models.js ni lib/lab/dc-*", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "lib", "lab", "walkforward-m4-runner.js"), "utf8");
  const requireLines = source.match(/require\(["'][^"']+["']\)/g) || [];
  assert.ok(requireLines.length > 0);
  for (const line of requireLines) {
    assert.doesNotMatch(line, /dc-matrix-with-rho|dc-log-probability|\/models\.js/, `import suspect dans walkforward-m4-runner.js: ${line}`);
  }
});
