"use strict";
// Integration du moteur v3 dans le depot du site (dossier moteur-v3/ et etapes Python du
// pipeline). Ne s'applique que si moteur-v3/ est present.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const present = fs.existsSync(path.join(root, "moteur-v3", "moteur"));

test("pipeline : les etapes Python du moteur v3 ne tournent que si MOTEUR_V3 vaut 1, et ne bloquent jamais le site", { skip: !present }, () => {
  const wf = fs.readFileSync(path.join(root, ".github", "workflows", "update-data.yml"), "utf8");
  const etapes = wf.split("\n      - name: ").filter((b) => /^Moteur v3 - /.test(b));
  // 3 etapes Python + 3 etapes « depot prive » (source, recuperation, raccord ;
  // contre-controle du 30/09/2026) : toutes eteintes tant que MOTEUR_V3 ne vaut pas 1.
  assert.equal(etapes.length, 6);
  for (const e of etapes) assert.match(e, /\n        if: \$\{\{ vars\.MOTEUR_V3 == '1'( && steps\.moteur_v3_source\.outputs\.prive == 'oui')? \}\}\n/, e.split("\n")[0]);
  const prod = etapes.find((e) => /produire la sortie/.test(e));
  assert.match(prod, /continue-on-error: true/);
  assert.match(prod, /python -m branchement\.reconstruire_etats/);
  assert.match(prod, /python -m moteur\.produire --jours 3 --essai/);
  assert.ok(wf.indexOf("- name: Moteur v3 - produire") < wf.indexOf("- name: Run pipeline"));
  assert.match(wf, /MOTEUR_V3_SORTIE:\s+\$\{\{ vars\.MOTEUR_V3_SORTIE \|\| format\('\{0\}\/sortie_essai', env\.MOTEUR_V3_DIR \|\| 'moteur-v3'\) \}\}/);
});

test("moteur-v3/ dans git : aucun pickle, aucune cle, aucune donnee brute", { skip: !present }, () => {
  const { execSync } = require("node:child_process");
  let fichiers;
  try { fichiers = execSync("git ls-files moteur-v3", { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean); }
  catch (e) { fichiers = []; }
  const tous = fichiers.length ? fichiers : (function lister(d) { return fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((x) => x.isDirectory() ? (["data", ".venv", "__pycache__", "sortie", "archive", "sortie_essai", "archive_essai"].includes(x.name) ? [] : lister(d + "/" + x.name)) : (["resultats_recents.csv", "complement_forme.csv"].includes(x.name) ? [] : [d + "/" + x.name])); })("moteur-v3");
  for (const f of tous) {
    assert.doesNotMatch(f, /\.(pkl|pickle)$|(^|\/)\.env$|\/data\/|resultats_recents\.csv$|complement_forme\.csv$/, f);
    assert.ok(fs.statSync(path.join(root, f)).size < 2.5e6, f + " : fichier trop lourd pour un etat leger");
  }
  const ignore = fs.readFileSync(path.join(root, "moteur-v3", ".gitignore"), "utf8");
  for (const r of [".env", "*.pkl", "data/", "etats/resultats_recents.csv", "etats/complement_forme.csv", "sortie/", "archive/"]) assert.ok(ignore.split("\n").includes(r), r);
  // Les modeles sont lus sans code executable (NPZ sans pickle).
  assert.match(fs.readFileSync(path.join(root, "moteur-v3", "moteur", "etats.py"), "utf8"), /np\.load\(f, allow_pickle=False\)/);
});
