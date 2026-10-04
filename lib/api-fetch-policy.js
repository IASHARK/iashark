"use strict";
// OPERATIONAL_FIX (2026-09-06). Politique d'appel API-Football, extraite
// pour etre testable (meme discipline que lib/models.js, lib/decision.js,
// lib/markets/early-season.js : .github/workflows/update-data.yml importe
// ce module au lieu de redefinir sa logique inline).
//
// BUG REEL CORRIGE : api-sports repond HTTP 200 avec
// {"errors":{"requests":"Too many requests"},"response":[]} quand le
// quota/rate-limit est atteint. Le pipeline lisait `response` vide et
// concluait "donnee absente cette saison", declenchant un repli
// silencieux sur la saison precedente comme si c'etait un vrai debut de
// saison. Ce module fournit la classification EXPLICITE (RATE_LIMIT !=
// API_ERROR != donnee reellement absente) et la regle de decision qui
// empeche ce repli quand la cause est un rate-limit/erreur API, jamais
// une absence de donnee confirmee.

// Meme regex que l'existant noteApiError() du pipeline (item 1 du
// commentaire historique en tete de update-data.yml) - "limit" nu
// englobe aussi bien "rate limit" que "you have reached the request
// limit" (le texte reel observe en production), jamais uniquement
// "rate limit" au sens strict.
const RATE_LIMIT_PATTERN = /limit|quota|subscription|plan|too many requests/i;

// classifyApiResponse : 'OK' (reponse exploitable, avec ou sans donnee),
// 'RATE_LIMIT' (429/quota - jamais traite comme une absence de donnee),
// 'API_ERROR' (erreur API non-quota, ex: parametre invalide type
// "The Referee field do not exist" - ou erreur reseau/JSON illisible,
// marquee par le sentinel __ia_network_error pose par l'appelant HTTP).
function classifyApiResponse(parsed) {
  if (!parsed || typeof parsed !== "object") return "API_ERROR";
  if (parsed.__ia_network_error) return "API_ERROR";
  const errs = parsed.errors;
  if (!errs) return "OK";
  const keys = Array.isArray(errs) ? errs : Object.keys(errs);
  if (!keys.length) return "OK";
  const text = Array.isArray(errs) ? errs.join(" ") : keys.map((k) => `${k}: ${errs[k]}`).join(" ");
  return RATE_LIMIT_PATTERN.test(text) ? "RATE_LIMIT" : "API_ERROR";
}

function shouldRetryRateLimit(status, attempt, maxRetries) {
  return status === "RATE_LIMIT" && attempt < maxRetries;
}

// Backoff croissant, jamais un martelement a intervalle fixe apres un
// 429 (item 2 : "le run ne doit pas continuer a marteler l'API apres un
// 429"). attempt commence a 1 pour le premier retry.
function backoffDelayMs(attempt, baseMs) {
  return (baseMs || 800) * attempt;
}

// decideSeasonFallback : la SEULE regle qui protege contre le bug reel.
// Un fallback vers une autre saison n'est JAMAIS autorise si la cause de
// "reponse vide" est un rate-limit/erreur API - uniquement si l'appel a
// reellement reussi (status OK) et que la donnee est confirmee absente.
function decideSeasonFallback({ status, isEmpty }) {
  if (status === "RATE_LIMIT") return { fallback: false, reason: "RATE_LIMIT_NO_FALLBACK" };
  if (status === "API_ERROR") return { fallback: false, reason: "API_ERROR_NO_FALLBACK" };
  if (!isEmpty) return { fallback: false, reason: "DATA_PRESENT_NO_FALLBACK_NEEDED" };
  return { fallback: true, reason: "EMPTY_CONFIRMED_FALLBACK_ALLOWED" };
}

// decideCurrentSeasonGate : empeche le Score Engine de traiter un echec
// d'API comme une saison legitimement demarree a 0 match (ce qui
// declencherait a tort le blend early-season canonique - lib/markets/
// early-season.js - sur une donnee dont on ignore en realite l'etat).
// Le Score Engine garde son comportement valide (current-season-only +
// early-season prior canonique) UNIQUEMENT quand les deux appels de
// saison courante ont reellement reussi (OK), qu'ils soient vides
// (vrai debut de saison, blend legitime) ou non.
function decideCurrentSeasonGate({ statusHome, statusAway }) {
  const failing = [];
  if (statusHome === "RATE_LIMIT" || statusHome === "API_ERROR") failing.push({ side: "HOME", status: statusHome });
  if (statusAway === "RATE_LIMIT" || statusAway === "API_ERROR") failing.push({ side: "AWAY", status: statusAway });
  if (!failing.length) return { dataQualityOk: true, reason: null };
  const reason = failing.some((f) => f.status === "RATE_LIMIT") ? "DATA_QUALITY_FAIL_RATE_LIMIT" : "DATA_QUALITY_FAIL_API_ERROR";
  return { dataQualityOk: false, reason, failing };
}

// Cache in-memory par URL (portee = un run du pipeline). Ne met jamais
// en cache une reponse en erreur (RATE_LIMIT/API_ERROR) - sinon on
// figerait un echec transitoire pour tout le reste du run.
function createApiCache() {
  const store = new Map();
  return {
    get(url) { return store.has(url) ? store.get(url) : null; },
    set(url, status, parsed) { if (status === "OK") store.set(url, parsed); },
    size() { return store.size; },
  };
}

// createThrottledFetcher : file d'attente API globale (item 2 - "eviter
// les bursts fixture par fixture"). rawFetch(url) doit resoudre la
// reponse JSON deja parsee (ou {__ia_network_error:true} en cas
// d'echec reseau/parse - jamais un objet vide indistinguable d'une
// vraie reponse OK). sleepFn/nowFn injectables pour des tests
// deterministes sans vrai timer/reseau.
// MODE ECONOMIE (03/10/2026) : cache DISQUE garde d'un lancement a l'autre (dossier
// restaure/sauve par actions/cache dans update-data.yml). Une entree n'est relue que
// si son age est inferieur au ttl demande PAR L'APPELANT (ex. feuille d'un match deja
// joue : 30 jours ; classement : 20 h). Jamais une reponse en erreur ni vide (une
// donnee pas encore publiee doit etre redemandee). L'URL ne contient aucun secret
// (la cle API-Football part dans un en-tete) ; le nom de fichier est son empreinte.
function createDiskCache(dir, options) {
  const fs = require("fs");
  const path = require("path");
  const crypto = require("crypto");
  const nowFn = (options && options.nowFn) || (() => Date.now());
  const stats = { hits: 0, writes: 0 };
  const file = (url) => path.join(dir, crypto.createHash("sha1").update(url).digest("hex") + ".json");
  function nonVide(parsed) {
    if (!parsed || typeof parsed !== "object") return false;
    const r = parsed.response;
    if (Array.isArray(r)) return r.length > 0;
    return r != null && typeof r === "object" && Object.keys(r).length > 0;
  }
  return {
    get(url, ttlMs) {
      if (!dir || !(ttlMs > 0)) return null;
      try {
        const f = file(url);
        const st = fs.statSync(f);
        if (nowFn() - st.mtimeMs > ttlMs) return null;
        const parsed = JSON.parse(fs.readFileSync(f, "utf8"));
        stats.hits++;
        return parsed;
      } catch (e) { return null; }
    },
    set(url, status, parsed) {
      if (!dir || status !== "OK" || !nonVide(parsed)) return;
      try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file(url), JSON.stringify(parsed)); stats.writes++; } catch (e) { /* cache facultatif */ }
    },
    // Menage : fichiers plus vieux que maxAgeMs supprimes (taille du cache bornee).
    prune(maxAgeMs) {
      let n = 0;
      try {
        fs.readdirSync(dir).forEach((nom) => {
          const f = path.join(dir, nom);
          try { if (nowFn() - fs.statSync(f).mtimeMs > maxAgeMs) { fs.unlinkSync(f); n++; } } catch (e) { /* ignore */ }
        });
      } catch (e) { /* dossier absent */ }
      return n;
    },
    stats,
  };
}

// Reponse fabriquee quand le PLAFOND DU JOUR (config/quotas.json) est atteint : meme
// forme qu'un refus de quota d'api-sports, donc classee RATE_LIMIT par
// classifyApiResponse - les gardes existantes la traitent comme « donnee inconnue »
// (abstention), jamais comme « aucune donnee ».
const BUDGET_REFUSAL = Object.freeze({ errors: { requests: "IASHARK : plafond du jour atteint (limit, config/quotas.json)" }, response: [] });

function createThrottledFetcher(rawFetch, options) {
  const opts = options || {};
  const minIntervalMs = opts.minIntervalMs != null ? opts.minIntervalMs : 150;
  const maxRetries = opts.maxRetries != null ? opts.maxRetries : 2;
  const baseBackoffMs = opts.baseBackoffMs != null ? opts.baseBackoffMs : 800;
  const sleepFn = opts.sleepFn || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const nowFn = opts.nowFn || (() => Date.now());
  const onError = opts.onError; // (url, parsed) => void, pour noteApiError existant

  const cache = createApiCache();
  const diskCache = opts.diskCache || null;
  // budget() -> true si un appel NON essentiel est encore permis (lib/quotas.js#autorise).
  const budget = typeof opts.budget === "function" ? opts.budget : null;
  const stats = { calls: 0, cache_hits: 0, disk_hits: 0, budget_refusals: 0, rate_limit_retries: 0, rate_limit_failures: 0 };
  let lastCallAt = 0;

  async function throttle() {
    const wait = minIntervalMs - (nowFn() - lastCallAt);
    if (wait > 0) await sleepFn(wait);
    lastCallAt = nowFn();
  }

  // callOpts : { ttlMs (cache disque), essentiel (passe meme au-dela du plafond du jour) }.
  async function fetchWithPolicy(url, callOpts) {
    const co = callOpts || {};
    const cached = cache.get(url);
    if (cached != null) { stats.cache_hits++; return { parsed: cached, status: "OK", fromCache: true }; }
    if (diskCache && co.ttlMs > 0) {
      const fromDisk = diskCache.get(url, co.ttlMs);
      if (fromDisk != null) { stats.disk_hits++; cache.set(url, "OK", fromDisk); return { parsed: fromDisk, status: "OK", fromCache: true }; }
    }
    if (budget && !co.essentiel && !budget()) {
      stats.budget_refusals++;
      if (onError) onError(url, BUDGET_REFUSAL);
      return { parsed: BUDGET_REFUSAL, status: "RATE_LIMIT", fromCache: false, budgetRefused: true };
    }
    let attempt = 0;
    for (;;) {
      await throttle();
      stats.calls++;
      const parsed = await rawFetch(url);
      if (onError) onError(url, parsed);
      const status = classifyApiResponse(parsed);
      if (shouldRetryRateLimit(status, attempt, maxRetries)) {
        stats.rate_limit_retries++;
        attempt++;
        await sleepFn(backoffDelayMs(attempt, baseBackoffMs));
        continue;
      }
      if (status === "RATE_LIMIT") stats.rate_limit_failures++;
      cache.set(url, status, parsed);
      if (diskCache && co.ttlMs > 0) diskCache.set(url, status, parsed);
      return { parsed, status, fromCache: false };
    }
  }

  return { fetchWithPolicy, stats, cache };
}

module.exports = {
  classifyApiResponse,
  shouldRetryRateLimit,
  backoffDelayMs,
  decideSeasonFallback,
  decideCurrentSeasonGate,
  createApiCache,
  createThrottledFetcher,
  createDiskCache,
  BUDGET_REFUSAL,
  RATE_LIMIT_PATTERN,
};
