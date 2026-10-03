"use strict";
// Migration 0047 (audit V3 du 02/10/2026, point I6) : l'archive des paris n'est
// plus lisible avec la cle publique, et aucune page publique n'en a besoin.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const sql = fs.readFileSync(path.join(ROOT, "supabase/migrations/0047_predictions_archive_privee.sql"), "utf8")
  .split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");

test("0047 retire la lecture anon/authenticated de l'archive et du journal des corrections", () => {
  assert.match(sql, /drop policy if exists predictions_archive_select_settled on public\.predictions_archive/);
  assert.match(sql, /revoke select on public\.predictions_archive from anon, authenticated/);
  assert.match(sql, /drop policy if exists predictions_archive_corrections_lecture/);
  assert.match(sql, /revoke select, insert, update, delete on public\.predictions_archive_corrections from anon, authenticated/);
  assert.doesNotMatch(sql, /create policy/i);
});

test("aucun script charge par le navigateur ne lit predictions_archive", () => {
  const fichiers = execFileSync("git", ["ls-files", "*.js", "*.html"], { cwd: ROOT, encoding: "utf8" })
    .split("\n").filter(Boolean)
    .filter((f) => !/^(tests|scripts|docs|supabase|lab|moteur-v3|iashark-v2-concept|netlify)\//.test(f))
    .filter((f) => !/^lib\/(match-results|pick-freeze|premium-fields)\.js$/.test(f)); // modules du pipeline (cle service)
  const lecteurs = fichiers.filter((f) => /rest\/v1\/predictions_archive|from\(['"]predictions_archive/.test(fs.readFileSync(path.join(ROOT, f), "utf8")));
  assert.deepEqual(lecteurs, []);
});
