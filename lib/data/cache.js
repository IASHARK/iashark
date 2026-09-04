"use strict";
// GATE B2 (SPEC LAB PRO v1.0 SS36) - cache API immuable. Un appel deja
// present en cache ne doit jamais declencher un nouvel appel reseau ; un
// appel deja ecrit ne doit jamais etre ecrase silencieusement - une
// reponse differente pour les memes parametres cree un NOUVEAU snapshot
// horodate, jamais un remplacement.
//
// Cle canonique : SHA256(provider + endpoint + params_tries_canoniques).
// Chemin : raw_api/{provider}/{endpoint}/{request_hash}/{captured_at}.json

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const RAW_API_ROOT = path.join(__dirname, "..", "..", "raw_api");

function canonicalParams(params) {
  const sorted = {};
  for (const key of Object.keys(params || {}).sort()) sorted[key] = params[key];
  return JSON.stringify(sorted);
}

function requestHash(provider, endpoint, params) {
  const input = provider + "|" + endpoint + "|" + canonicalParams(params);
  return crypto.createHash("sha256").update(input).digest("hex");
}

function responseHash(body) {
  return crypto.createHash("sha256").update(typeof body === "string" ? body : JSON.stringify(body)).digest("hex");
}

function cacheDir(provider, endpoint, params) {
  return path.join(RAW_API_ROOT, provider, endpoint, requestHash(provider, endpoint, params));
}

// Renvoie la liste des snapshots deja presents pour cette requete exacte
// (peut en contenir plusieurs si l'API a renvoye des versions differentes
// au fil du temps - jamais un seul fichier ecrase).
function listCachedSnapshots(provider, endpoint, params) {
  const dir = cacheDir(provider, endpoint, params);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(dir, f));
}

// Le snapshot le plus recent pour cette requete, ou null si aucun cache.
function getLatestCached(provider, endpoint, params) {
  const snapshots = listCachedSnapshots(provider, endpoint, params);
  if (!snapshots.length) return null;
  return JSON.parse(fs.readFileSync(snapshots[snapshots.length - 1], "utf8"));
}

// Ecrit un nouveau snapshot. N'ecrase JAMAIS un fichier existant (flag
// 'wx' - echoue si le fichier existe deja). Si le response_hash est deja
// present parmi les snapshots existants pour cette requete, ne reecrit
// rien (evite un doublon exact) et renvoie le snapshot existant.
function writeSnapshot(provider, endpoint, params, options) {
  const { body, httpStatus, pagingCurrent, pagingTotal, retrievedAt, schemaVersion } = options;
  const dir = cacheDir(provider, endpoint, params);
  fs.mkdirSync(dir, { recursive: true });

  const bodyHash = responseHash(body);
  const existing = listCachedSnapshots(provider, endpoint, params);
  for (const snapPath of existing) {
    const snap = JSON.parse(fs.readFileSync(snapPath, "utf8"));
    if (snap.response_hash === bodyHash) {
      return { path: snapPath, created: false, reason: "identical_response_hash_already_cached" };
    }
  }

  const capturedAt = retrievedAt || new Date().toISOString();
  const fileName = capturedAt.replace(/[:.]/g, "-") + ".json";
  const filePath = path.join(dir, fileName);
  const record = {
    provider,
    endpoint,
    request_params: params,
    retrieved_at: capturedAt,
    response_hash: bodyHash,
    schema_version: schemaVersion || "v1",
    http_status: httpStatus != null ? httpStatus : null,
    paging: { current: pagingCurrent != null ? pagingCurrent : null, total: pagingTotal != null ? pagingTotal : null },
    body,
  };
  fs.writeFileSync(filePath, JSON.stringify(record, null, 1), { flag: "wx" });
  return { path: filePath, created: true };
}

module.exports = { requestHash, responseHash, cacheDir, listCachedSnapshots, getLatestCached, writeSnapshot, RAW_API_ROOT };
