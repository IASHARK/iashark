"use strict";
// Lancement du 3/10 (avocat du diable, 01/10/2026) : le moteur v3 ne doit jamais entrer dans le
// depot public. scripts/preparer-branche-v3-sans-moteur.sh fabrique, sans pousser, une branche
// neuve depuis origin/main avec UN seul commit sans moteur-v3/, puis fait les 2 controles.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const script = fs.readFileSync(path.join(ROOT, "scripts/preparer-branche-v3-sans-moteur.sh"), "utf8");
const code = script.split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

test("script : branche neuve depuis origin/main, un seul commit, moteur-v3/ retire dans un index temporaire", () => {
  assert.match(code, /BASE="\$\(git rev-parse --verify -q origin\/main\)"/);
  assert.match(code, /GIT_INDEX_FILE="\$INDEX_TEMP" git read-tree "\$SRC"/);
  assert.match(code, /git rm -r -q --cached --ignore-unmatch -- "\$DOSSIER_MOTEUR"/);
  assert.match(code, /git commit-tree "\$ARBRE" -p "\$BASE"/, "un seul parent : origin/main");
  assert.match(code, /DOSSIER_MOTEUR="moteur-v3"/);
});

test("script : les 2 controles (aucun moteur-v3/ dans l'arbre, 69681458f pas ancetre) et un seul commit", () => {
  assert.match(code, /COMMIT_MOTEUR="69681458f"/);
  assert.match(code, /RESTE="\$\(git ls-tree -r --name-only "\$BRANCHE" -- "\$DOSSIER_MOTEUR"\)"/);
  assert.match(code, /git merge-base --is-ancestor "\$COMMIT_MOTEUR" "\$BRANCHE"/);
  assert.match(code, /git rev-list --count "\$BASE\.\.\$BRANCHE"/);
  assert.doesNotMatch(code, /ls-tree[^\n]*\| *grep -q/, "jamais ls-tree | grep -q (SIGPIPE sous pipefail)");
});

test("script : ne pousse jamais, n'ecrase jamais une branche, ne touche pas au dossier de travail", () => {
  assert.doesNotMatch(code, /git push|git reset|git checkout|git stash|git clean/);
  assert.match(code, /la branche \$BRANCHE existe deja/);
  assert.match(script, /^set -euo pipefail$/m);
});

test("doc : la methode de l'avocat est ecrite pour Clement", () => {
  const doc = fs.readFileSync(path.join(ROOT, "docs/MOTEUR-V3-DEPOT-PRIVE.md"), "utf8");
  assert.match(doc, /scripts\/preparer-branche-v3-sans-moteur\.sh/);
  assert.match(doc, /Contrôle 1/);
  assert.match(doc, /Contrôle 2/);
  assert.match(doc, /69681458f/);
  assert.match(doc, /MOTEUR_V3_DEPOT_PRIVE/);
});
