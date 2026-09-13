#!/usr/bin/env node
"use strict";
// Merges every i18n/parts/<namespace>.<locale>.json into i18n/dict/<locale>.json.
// Parts win over existing keys (deep merge). Idempotent and safe to run many
// times from several agents: each run re-reads the dict and ALL part files, then
// writes atomically (temp file + rename), so no part is ever lost.
// Usage: node scripts/merge-i18n-parts.js
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const DICT_DIR = path.join(ROOT, "i18n", "dict");
const PARTS_DIR = path.join(ROOT, "i18n", "parts");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];

function isObj(v) {
  return v && typeof v === "object" && !Array.isArray(v);
}
function deepMerge(target, src) {
  for (const k of Object.keys(src)) {
    if (isObj(src[k]) && isObj(target[k])) deepMerge(target[k], src[k]);
    else target[k] = src[k];
  }
  return target;
}
function trimStrings(v) {
  if (typeof v === "string") return v.replace(/\s+$/, (m) => (/\n/.test(m) ? m : ""));
  if (isObj(v)) for (const k of Object.keys(v)) v[k] = trimStrings(v[k]);
  return v;
}

if (!fs.existsSync(PARTS_DIR)) fs.mkdirSync(PARTS_DIR, { recursive: true });
const partFiles = fs.readdirSync(PARTS_DIR).filter((f) => f.endsWith(".json"));

let errors = 0;
for (const locale of LOCALES) {
  const dictPath = path.join(DICT_DIR, locale + ".json");
  const dict = JSON.parse(fs.readFileSync(dictPath, "utf8"));
  const suffix = "." + locale + ".json";
  const mine = partFiles.filter((f) => f.endsWith(suffix) && !f.slice(0, -suffix.length).includes("."));
  let merged = 0;
  for (const f of mine.sort()) {
    try {
      deepMerge(dict, trimStrings(JSON.parse(fs.readFileSync(path.join(PARTS_DIR, f), "utf8"))));
      merged++;
    } catch (e) {
      errors++;
      console.error("INVALID JSON:", f, e.message);
    }
  }
  const tmp = dictPath + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(dict, null, 2) + "\n");
  fs.renameSync(tmp, dictPath);
  console.log(locale + ": merged " + merged + " part file(s)");
}
process.exit(errors ? 1 : 0);
