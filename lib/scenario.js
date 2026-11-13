"use strict";
// MOTEUR « SCENARIO » (plan valide par Clement le 13/11/2026) : RACCORD DU SITE.
// Le moteur predit d'abord ce qui va se passer dans le match (equipes, adversaire, arbitre, absents, fatigue, enjeu) ;
// la cote n'est lue qu'a la fin (lib/pronostic.js : parmi les paris juges probables, la plus belle cote Bet365).
// LES FORMULES NE SONT PAS ICI : elles vivent dans le depot PRIVE IASHARK/iashark-moteur (dossier scenario/), recupere
// par le calcul du matin dans .moteur-scenario-prive/ (jamais commite). Sans ce dossier : aucun nouveau pari, alerte.
// Ici : charger le moteur, lui donner les matchs gardes en base, ranger ses reponses, suivre chaque famille.
const path = require("path");
const fs = require("fs");
const SD = require("./scenario-donnees.js");

const DOSSIER = ".moteur-scenario-prive";
const SEUIL_SUIVI = 0.5, FENETRE_SUIVI = 50;

// -> { M (module du moteur), P (reglages), version } ou null si le moteur prive n'est pas la.
function charger(dossier) {
  const d = path.resolve(dossier || process.env.MOTEUR_SCENARIO_DIR || DOSSIER, "scenario");
  try {
    if (!fs.existsSync(path.join(d, "index.js")) || !fs.existsSync(path.join(d, "params.json"))) return null;
    const M = require(path.join(d, "index.js"));
    const P = JSON.parse(fs.readFileSync(path.join(d, "params.json"), "utf8"));
    return { M: M, P: P, version: String(M.VERSION || "") + "/" + String(P.version || "") };
  } catch (e) { return null; }
}

// Ligne courte d'un match fini -> faits pour le reglement (lib/flux-paris.js#regler). Les marches de l'ordre des buts
// ne sont pas reglables d'ici (pas d'evenements de but dans la ligne courte) : le moteur ne les propose pas.
function faitsDeLigne(L) {
  if (!L || !L.ft) return null;
  const s = L.s && L.st === "FT" ? L.s : null;
  const paire = (i) => (s && s[0][i] != null && s[1][i] != null ? [s[0][i], s[1][i]] : null);
  return { ft: L.ft, ht: L.ht || null, statut: L.st, buts: null, penaltys: null, joueurs: null, vainqueur: null,
    stats: s ? { tirs: paire(0), tirs_cadres: paire(1), fautes: paire(3), hors_jeu: paire(4), corners: paire(2) } : null,
    cartons: L.st === "FT" && L.ev && Array.isArray(L.ev.b365) ? L.ev.b365.slice() : null };
}

// CALCUL (pur) : matchs a predire + matchs gardes -> { "<fixture>": { issues: { code: { p, note, famille, sous_famille,
// faits } }, attendus, version } }. matchs : [{ id, t (ms), h, a, lg, ref, absents: { h: [ids], a: [ids] }, raw (releve
// de cotes : sert SEULEMENT a savoir quelles issues Bet365 propose, jamais au calcul de la chance), nomDom, nomExt }].
function calculer(moteur, lignes, ligues, matchs, opts) {
  opts = opts || {};
  const FP = opts.FP || require("./flux-paris.js");
  const regle = opts.regle || { tousMarches: true, scenario: true, referenceSeule: true, controleTous: true };
  const idx = moteur.M.preparer(lignes, ligues, moteur.P);
  const out = {};
  (matchs || []).forEach((m) => {
    let A;
    try { A = moteur.M.evaluer(idx, { t: m.t, h: m.h, a: m.a, lg: m.lg, ref: m.ref || null, absents: m.absents || null }, moteur.P); } catch (e) { return; }
    if (!A || !A.ok) { out[String(m.id)] = { issues: {}, ferme: (A && A.raison) || "données insuffisantes", version: moteur.version }; return; }
    const issues = {};
    const sel = m.raw ? FP.selectionsDuMatch(m.raw, { match: { home: { name: m.nomDom }, away: { name: m.nomExt } }, couverture: opts.couverture ? opts.couverture(m) : null, regle: regle }).selections : [];
    sel.forEach((s) => {
      const f = moteur.M.famille(s.bet_id);
      if (!f) return;
      // brut = chance du moteur (sert au seuil « juge probable » et a la securite d'ecart avec le bookmaker) ;
      // p = chance affichee, recalee sur les paris reellement choisis dans le rejeu (un pari annonce a 55 % passe 55 fois sur 100).
      const brut = moteur.M.chanceBrute(A, s.bet_id, s.value, FP);
      const p = brut === null ? null : moteur.M.chance(A, s.bet_id, s.value, FP);
      if (p === null) return;
      const sol = moteur.M.solidite(A, s.bet_id);
      issues[s.code] = { p: Math.round(p * 1000) / 1000, brut: Math.round(brut * 1000) / 1000, note: moteur.M.note(p, sol), famille: f.famille, sous_famille: f.sous_famille, faits: moteur.M.faits(A, s.bet_id) };
    });
    const r1 = (x) => Math.round(x * 10) / 10;
    const attendus = {};
    Object.keys(A.att).forEach((k) => { if (A.ouvert[k]) attendus[k] = [r1(A.att[k][0]), r1(A.att[k][1])]; });
    out[String(m.id)] = { issues: issues, attendus: attendus, version: moteur.version };
  });
  return out;
}

// COLLECTE DU JOUR (calcul du matin) : complete la base pour les equipes des matchs a predire et leurs adversaires
// recents, puis rend les lignes utiles au moteur. Chaque match n'est demande qu'UNE fois a API-Sports.
// opts : { api (SD.client), magasin (SD.magasinBase), equipes: [ids], arbitres: [noms normalises], finMs, maintenant }.
async function collecterEtLire(opts) {
  const mag = opts.magasin, api = opts.api, T1 = [...new Set(opts.equipes)];
  const maintenant = opts.maintenant || Date.now(), depuis = new Date(maintenant - 400 * 86400e3).toISOString();
  const rapport = { equipes: T1.length, adversaires: 0, matchs_nouveaux: 0, appels: 0, arrete_quota: false, arrete_budget: false };
  await mag.chargerEquipes(T1);
  const r1 = await SD.collecterEquipes(api, mag, T1, { derniers: 22, fraicheurH: 20, finMs: opts.finMs, maintenant: maintenant });
  rapport.matchs_nouveaux += r1.matchs_nouveaux;
  await mag.enregistrerEquipes();
  // Adversaires rencontres dans les 20 derniers matchs de chaque equipe : leurs matchs disent ce qu'ils laissent faire.
  const l1 = await mag.matchsDesEquipes(T1, depuis);
  const par = new Map();
  l1.forEach((L) => [L.h, L.a].forEach((t) => { if (!par.has(t)) par.set(t, []); par.get(t).push(L); }));
  const T2 = new Set();
  T1.forEach((t) => (par.get(t) || []).sort((a, b) => (a.d < b.d ? 1 : -1)).slice(0, 20).forEach((L) => T2.add(L.h === t ? L.a : L.h)));
  T1.forEach((t) => T2.delete(t));
  rapport.adversaires = T2.size;
  if (!r1.arrete_quota) {
    await mag.chargerEquipes([...T2]);
    const r2 = await SD.collecterEquipes(api, mag, [...T2], { derniers: 22, fraicheurH: 72, finMs: opts.finMs, maintenant: maintenant });
    rapport.matchs_nouveaux += r2.matchs_nouveaux;
    rapport.arrete_quota = r2.arrete_quota; rapport.arrete_budget = r1.arrete_budget || r2.arrete_budget;
    await mag.enregistrerEquipes();
  } else rapport.arrete_quota = true;
  const tous = new Map();
  (await mag.matchsDesEquipes(T1.concat([...T2]), depuis)).forEach((L) => tous.set(L.id, L));
  if (opts.arbitres && opts.arbitres.length) (await mag.matchsDesArbitres([...new Set(opts.arbitres)], depuis)).forEach((L) => tous.set(L.id, L));
  rapport.appels = api.appels();
  rapport.quota_restant = api.restant();
  return { lignes: [...tous.values()], rapport: rapport };
}

// ---------------------------------------------------------------------------- suivi apres ouverture (etape 8 du plan)
// Regle un pari suivi a partir de la ligne courte du match : « gagne » | « perdu » | « rembourse » | null (en attente).
function reglerSuivi(code, L, FP) {
  FP = FP || require("./flux-paris.js");
  const F = faitsDeLigne(L);
  if (!F) return null;
  const r = FP.regler(code, F);
  return r === true ? "gagne" : r === false ? "perdu" : r === "rembourse" ? "rembourse" : null;
}
// paris : [{ famille, resultat (« gagne » / « perdu » / autre), publie_le }]. Une famille se ferme toute seule quand son
// dernier BLOC COMPLET de 50 paris regles est sous la moitie. Blocs sans chevauchement (avocat du diable du 13/11/2026 :
// une fenetre glissante relue chaque nuit fermait a tort une bonne famille presque a coup sur) et comptes seulement
// depuis opts.depuis[famille] (date de reouverture par Clement) : une famille rouverte repart de zero.
// -> { famille: { total, gagnes, taux, blocs, fermee } } (total / gagnes = dernier bloc complet, sinon bloc en cours).
function etatFamilles(paris, opts) {
  const seuil = (opts && opts.seuil) || SEUIL_SUIVI, fen = (opts && opts.fenetre) || FENETRE_SUIVI, depuis = (opts && opts.depuis) || {};
  const listes = {};
  (paris || []).filter((p) => p && (p.resultat === "gagne" || p.resultat === "perdu")).forEach((p) => {
    const k = String(p.famille || "");
    if (depuis[k] && String(p.publie_le) <= String(depuis[k])) return;
    (listes[k] || (listes[k] = [])).push(p);
  });
  const par = {};
  Object.keys(listes).forEach((k) => {
    const l = listes[k].sort((a, b) => (String(a.publie_le) < String(b.publie_le) ? -1 : 1)), blocs = Math.floor(l.length / fen);
    const bloc = blocs ? l.slice((blocs - 1) * fen, blocs * fen) : l;
    const g = bloc.filter((p) => p.resultat === "gagne").length;
    par[k] = { total: bloc.length, gagnes: g, taux: bloc.length ? Math.round(g / bloc.length * 1000) / 1000 : null, blocs: blocs, fermee: blocs > 0 && g / bloc.length < seuil };
  });
  return par;
}

module.exports = { DOSSIER, SEUIL_SUIVI, FENETRE_SUIVI, charger, faitsDeLigne, calculer, collecterEtLire, reglerSuivi, etatFamilles };
