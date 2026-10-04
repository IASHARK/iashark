"use strict";
// RETRAITS DECIDES PAR LE PROPRIETAIRE (config/results-exclusions.json) :
// regles de transparence demandees par historique-public (29/09/2026).
//
//  1. Un retrait n'est applique que s'il porte une raison ECRITE (reason) et la
//     DATE de la decision (decided_on, AAAA-MM-JJ). Sinon il est ignore et le
//     pipeline le signale : jamais de retrait silencieux ou non motive.
//  2. Un retrait ne sort JAMAIS un pari du moteur v3 : ceux-ci restent dans la
//     liste et dans le compte, quoi que dise le fichier.
//  3. Le retrait apparait dans le bilan public de la journee (champ exclusions de
//     results/<jour>.json) : raison, date, championnats, et combien de paris
//     gagnes / perdus / rembourses / en attente il a sortis du compte.

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

function txt(v) { return typeof v === "string" && v.trim() ? v.trim() : null; }

// -> { ok, raison, league_keys, decided_on, erreur }
function lireRetrait(entree) {
  const e = entree && typeof entree === "object" ? entree : null;
  if (!e) return { ok: false, erreur: "entree illisible" };
  const cles = Array.isArray(e.league_keys) ? e.league_keys.filter(txt) : [];
  const raison = txt(e.reason);
  const date = txt(e.decided_on);
  if (!cles.length) return { ok: false, erreur: "aucun championnat (league_keys)" };
  if (!raison) return { ok: false, erreur: "raison ecrite manquante (reason)" };
  if (!date || !JOUR.test(date)) return { ok: false, erreur: "date de decision manquante (decided_on AAAA-MM-JJ)" };
  return { ok: true, raison: raison, league_keys: cles, decided_on: date };
}

function compter(matches) {
  const t = { settled: 0, won: 0, lost: 0, void: 0, pending: 0 };
  (matches || []).forEach(function (m) {
    if (!m || !m.result) return;
    if (m.result === "win") t.won++;
    else if (m.result === "loss") t.lost++;
    else if (m.result === "void") t.void++;
    else t.pending++;
  });
  t.settled = t.won + t.lost;
  return t;
}

// fichier : contenu de results/<jour>.json (lib/match-results.js#buildDayFile).
// entree  : days[<jour>] de config/results-exclusions.json (ou undefined).
// -> { file, retires, v3Gardes, erreur }  (file est une copie, jamais modifie en place)
function appliquerRetraits(fichier, entree) {
  const file = Object.assign({}, fichier || {});
  if (entree == null) return { file: file, retires: 0, v3Gardes: 0, erreur: null };
  const r = lireRetrait(entree);
  if (!r.ok) return { file: file, retires: 0, v3Gardes: 0, erreur: r.erreur };
  const tous = Array.isArray(file.matches) ? file.matches : [];
  const dansLigue = function (m) { return !!(m && m.league_key && r.league_keys.indexOf(m.league_key) !== -1); };
  const v3Gardes = tous.filter(function (m) { return dansLigue(m) && m.moteur === "v3"; }).length;
  const sortis = tous.filter(function (m) { return dansLigue(m) && m.moteur !== "v3"; });
  file.matches = tous.filter(function (m) { return sortis.indexOf(m) === -1; });
  file.totals = compter(file.matches);
  if (Array.isArray(file.scorers)) {
    file.scorers = file.scorers.filter(function (s) {
      return file.matches.some(function (m) { return m && String(m.id) === String(s && s.match_id); });
    });
  }
  const t = compter(sortis);
  file.exclusions = {
    raison: r.raison,
    decidee_le: r.decided_on,
    championnats: r.league_keys.slice(),
    paris_retires: sortis.length,
    gagnes_retires: t.won,
    perdus_retires: t.lost,
    rembourses_retires: t.void,
    en_attente_retires: t.pending,
    paris_v3_gardes: v3Gardes,
  };
  return { file: file, retires: sortis.length, v3Gardes: v3Gardes, erreur: null };
}

module.exports = { lireRetrait: lireRetrait, appliquerRetraits: appliquerRetraits, compter: compter };
