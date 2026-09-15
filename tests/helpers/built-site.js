"use strict";
// Site construit pour les tests SEO (tests/internal-links.test.js,
// tests/seo-meta.test.js) : sortie de scripts/build-public.js dans un
// repertoire temporaire (jamais dist/, que la suite E2E peut utiliser en
// parallele). SEO_AUDIT_DIST=<chemin> reutilise un site deja construit.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..", "..");

function buildSite() {
  if (process.env.SEO_AUDIT_DIST) return { dir: path.resolve(ROOT, process.env.SEO_AUDIT_DIST), cleanup: function () {} };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-site-"));
  execFileSync("node", ["scripts/build-public.js", "--out", dir], { cwd: ROOT, stdio: "pipe" });
  return { dir: dir, cleanup: function () { fs.rmSync(dir, { recursive: true, force: true }); } };
}

module.exports = { ROOT: ROOT, buildSite: buildSite };
