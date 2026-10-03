"use strict";
// MODE ECONOMIE (03/10/2026) : compteurs et plafonds des 2 abonnements payants.
//
//   API-Football (offre Pro) : 7 500 requetes PAR JOUR (minuit UTC).
//   The Odds API              : 20 000 credits PAR MOIS.
//
// Reglages : config/quotas.json (Clement peut changer les chiffres). Etat mesure :
// data/quotas-etat.json, ecrit par le pipeline et publie avec les donnees. Les
// chiffres viennent UNIQUEMENT des en-tetes renvoyes par les API (jamais estimes) :
//   - API-Football : x-ratelimit-requests-limit / x-ratelimit-requests-remaining
//     (compteur du jour), ou l'endpoint /status (gratuit) ;
//   - The Odds API : x-requests-used / x-requests-remaining / x-requests-last.
// Aucun secret dans l'etat : seulement des nombres et des dates.

const fs = require("fs");
const path = require("path");

const CONFIG_DEFAUT = require("../config/quotas.json");
const FICHIER_ETAT = path.join(__dirname, "..", "data", "quotas-etat.json");

function lireConfig(fichier) {
  if (!fichier) return CONFIG_DEFAUT;
  try { return JSON.parse(fs.readFileSync(fichier, "utf8")); } catch (e) { return CONFIG_DEFAUT; }
}

function jourUTC(d) { return new Date(d || Date.now()).toISOString().slice(0, 10); }
function moisUTC(d) { return jourUTC(d).slice(0, 7); }
function nombre(v) { if (v == null || v === "") return null; const n = Number(v); return Number.isFinite(n) ? n : null; }

function etatVide() {
  return { maj_le: null, api_football: {}, odds_api: {}, alertes: {} };
}
function lireEtat(fichier) {
  try {
    const e = JSON.parse(fs.readFileSync(fichier || FICHIER_ETAT, "utf8"));
    return Object.assign(etatVide(), e, { alertes: Object.assign({}, e && e.alertes) });
  } catch (e) { return etatVide(); }
}
function ecrireEtat(etat, fichier) {
  const f = fichier || FICHIER_ETAT;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(etat, null, 2) + "\n");
}

// Lecture d'en-tetes : objet simple ({nom: valeur}) ou Headers de fetch (get()).
function entete(headers, nom) {
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(nom);
  const k = Object.keys(headers).find((x) => x.toLowerCase() === nom);
  return k ? headers[k] : null;
}

/** En-tetes API-Football -> { limite, restantes } (compteur du jour), ou null. */
function entetesApiFootball(headers) {
  const limite = nombre(entete(headers, "x-ratelimit-requests-limit"));
  const restantes = nombre(entete(headers, "x-ratelimit-requests-remaining"));
  return limite != null && restantes != null ? { limite, restantes } : null;
}
/** Reponse /status d'API-Football (gratuite) -> { limite, restantes }, ou null. */
function statusApiFootball(json) {
  const r = json && json.response && json.response.requests;
  const cur = nombre(r && r.current), lim = nombre(r && r.limit_day);
  return cur != null && lim != null ? { limite: lim, restantes: Math.max(0, lim - cur) } : null;
}
/** En-tetes The Odds API -> { utilises, restants, dernier }, ou null. */
function entetesOddsApi(headers) {
  const utilises = nombre(entete(headers, "x-requests-used"));
  const restants = nombre(entete(headers, "x-requests-remaining"));
  if (utilises == null && restants == null) return null;
  return { utilises, restants, dernier: nombre(entete(headers, "x-requests-last")) };
}

function noterApiFootball(etat, info, maintenant) {
  if (!info) return etat;
  const jour = jourUTC(maintenant);
  const utilisees = Math.max(0, info.limite - info.restantes);
  const a = etat.api_football || {};
  // Plusieurs lancements le meme jour : on garde le plus grand compteur vu (le compteur ne fait que monter).
  const deja = a.jour === jour ? (a.utilisees_jour || 0) : 0;
  etat.api_football = { jour, limite_jour: info.limite, utilisees_jour: Math.max(deja, utilisees), restantes_jour: Math.min(a.jour === jour && a.restantes_jour != null ? a.restantes_jour : Infinity, info.restantes) };
  etat.maj_le = new Date(maintenant || Date.now()).toISOString();
  return etat;
}

function noterOddsApi(etat, info, maintenant) {
  if (!info || info.utilises == null) return etat;
  const jour = jourUTC(maintenant);
  const o = etat.odds_api || {};
  const neuf = o.jour !== jour || o.debut_jour == null || info.utilises < o.debut_jour;
  const debut = neuf ? Math.max(0, info.utilises - (info.dernier || 0)) : o.debut_jour;
  etat.odds_api = {
    mois: moisUTC(maintenant), jour, debut_jour: debut,
    utilises_mois: info.utilises, restants_mois: info.restants,
    utilises_jour: Math.max(0, info.utilises - debut),
  };
  etat.maj_le = new Date(maintenant || Date.now()).toISOString();
  return etat;
}

function pct(a, b) { return b > 0 ? Math.round((a / b) * 1000) / 10 : 0; }

/**
 * Situation des 2 abonnements. mode : 'normal' | 'plafond_jour' (au-dela du plafond du jour :
 * l'essentiel seulement) | 'minimum' (au-dela de minimum_pct du quota : l'essentiel seulement).
 */
function situation(etat, config, maintenant) {
  const cfg = config || CONFIG_DEFAUT;
  const jour = jourUTC(maintenant);
  const a = (etat && etat.api_football) || {}, o = (etat && etat.odds_api) || {};
  const af = cfg.api_football || {}, od = cfg.odds_api || {};
  const afUtil = a.jour === jour ? (a.utilisees_jour || 0) : 0;
  const afQuota = (a.jour === jour && a.limite_jour) || af.quota_jour || 7500;
  const afPct = pct(afUtil, afQuota);
  const odUtil = o.utilises_mois != null ? o.utilises_mois : 0;
  const odQuota = o.utilises_mois != null && o.restants_mois != null ? o.utilises_mois + o.restants_mois : (od.quota_mois || 20000);
  const odPct = pct(odUtil, odQuota);
  const odJour = o.jour === jour ? (o.utilises_jour || 0) : 0;
  const mode = (p, util, plafond, minPct) => (p >= minPct ? "minimum" : (plafond && util >= plafond ? "plafond_jour" : "normal"));
  return {
    api_football: { utilisees_jour: afUtil, quota_jour: afQuota, pct: afPct, plafond_jour: af.plafond_jour || null,
      mode: mode(afPct, afUtil, af.plafond_jour, af.minimum_pct || 95) },
    odds_api: { utilises_mois: odUtil, quota_mois: odQuota, pct: odPct, utilises_jour: odJour, plafond_jour: od.plafond_jour || null,
      mode: mode(odPct, odJour, od.plafond_jour, od.minimum_pct || 95) },
  };
}

/** Un appel est-il permis ? Les appels essentiels passent toujours (le quota reel reste le vrai garde-fou). */
function autorise(service, etat, config, opts) {
  opts = opts || {};
  if (opts.essentiel) return true;
  return situation(etat, config, opts.maintenant)[service].mode === "normal";
}

function chiffre(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }

/**
 * Alertes a envoyer a Clement (une seule fois par jour pour API-Football, par mois pour The Odds API).
 * Les alertes rendues sont marquees envoyees dans etat.alertes : appeler ecrireEtat ensuite.
 */
function alertesDues(etat, config, maintenant) {
  const cfg = config || CONFIG_DEFAUT;
  const s = situation(etat, cfg, maintenant);
  const out = [];
  const jour = jourUTC(maintenant), mois = moisUTC(maintenant);
  etat.alertes = etat.alertes || {};
  const ajouter = (cle, texte) => { if (!etat.alertes[cle]) { etat.alertes[cle] = new Date(maintenant || Date.now()).toISOString(); out.push({ cle, texte }); } };
  const af = cfg.api_football || {}, od = cfg.odds_api || {};
  if (s.api_football.pct >= (af.minimum_pct || 95)) ajouter(`api-football-${af.minimum_pct || 95}:${jour}`, `API-Football : ${chiffre(s.api_football.utilisees_jour)} requêtes utilisées aujourd'hui sur ${chiffre(s.api_football.quota_jour)} (${s.api_football.pct} %). Mode minimum automatique jusqu'à minuit UTC : seulement l'essentiel.`);
  else if (s.api_football.pct >= (af.alerte_pct || 70)) ajouter(`api-football-${af.alerte_pct || 70}:${jour}`, `API-Football : ${chiffre(s.api_football.utilisees_jour)} requêtes utilisées aujourd'hui sur ${chiffre(s.api_football.quota_jour)} (${s.api_football.pct} %). Réglages dans config/quotas.json.`);
  if (s.odds_api.pct >= (od.minimum_pct || 95)) ajouter(`odds-api-${od.minimum_pct || 95}:${mois}`, `The Odds API : ${chiffre(s.odds_api.utilises_mois)} crédits utilisés ce mois-ci sur ${chiffre(s.odds_api.quota_mois)} (${s.odds_api.pct} %). Mode minimum automatique : seulement la préparation du programme et la cote de clôture des paris Pro.`);
  else if (s.odds_api.pct >= (od.alerte_pct || 70)) ajouter(`odds-api-${od.alerte_pct || 70}:${mois}`, `The Odds API : ${chiffre(s.odds_api.utilises_mois)} crédits utilisés ce mois-ci sur ${chiffre(s.odds_api.quota_mois)} (${s.odds_api.pct} %). Réglages dans config/quotas.json.`);
  // Nettoyage : on ne garde que les marques du jour et du mois en cours.
  Object.keys(etat.alertes).forEach((k) => { const p = k.split(":")[1] || ""; if (p !== jour && p !== mois) delete etat.alertes[k]; });
  return out;
}

/** Alerte Telegram a Clement (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID, meme conversation que les alertes admin). */
async function envoyerAlerte(texte, opts) {
  opts = opts || {};
  const token = opts.token, chatId = opts.chatId;
  const fetchFn = opts.fetchFn || (typeof fetch === "function" ? fetch : null);
  if (!token || !chatId || !fetchFn) return false;
  try {
    const r = await fetchFn("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: "⚠️ IASHARK quotas\n" + texte, disable_web_page_preview: true }),
    });
    return !!(r && r.ok);
  } catch (e) { return false; }
}

/**
 * Competitions dont on releve les cotes sur The Odds API (perimetre 'selection_pro') : les ligues
 * du moteur v3 (config/moteur-v3.json#ligues, par identifiant API-Football) et les competitions de
 * config/leagues.json#fiabilite.ligues_validees_cotes_marche. null = toutes (perimetre 'toutes').
 */
function perimetreOddsApi(configLigues, configMoteur, config) {
  const cfg = config || CONFIG_DEFAUT;
  if (!cfg.odds_api || cfg.odds_api.perimetre !== "selection_pro") return null;
  const cles = new Set(Object.keys((configLigues && configLigues.fiabilite && configLigues.fiabilite.ligues_validees_cotes_marche) || {}));
  const idsV3 = new Set(Object.keys((configMoteur && configMoteur.ligues) || {}).map(String));
  ((configLigues && configLigues.leagues) || []).forEach((l) => { if (l && idsV3.has(String(l.apiFootballId))) cles.add(l.key); });
  return cles;
}

module.exports = {
  CONFIG_DEFAUT, FICHIER_ETAT, lireConfig, etatVide, lireEtat, ecrireEtat, jourUTC, moisUTC,
  entetesApiFootball, statusApiFootball, entetesOddsApi, noterApiFootball, noterOddsApi,
  situation, autorise, alertesDues, envoyerAlerte, perimetreOddsApi,
};
