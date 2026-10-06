"use strict";
// TICKETS DU JOUR : GEL ET ARCHIVAGE AVANT MATCH (demande de Clement du 04/10/2026 ;
// regles du trader de cotes, regles-tickets.md §2.7, §2.8, §4.1).
//
// Appele UNE fois par calcul quotidien (.github/workflows/update-data.yml), juste apres
// la publication des paris (lib/pronostic.js#publierPronostics, alignerChancesAffichees,
// poserOptionCote) : les jambes sont alors exactement les paris affiches sur les pages.
//
//  1. Rien n'est produit sans le feu vert du mathematicien (config/verdicts-maths.json :
//     tickets.chance_ticket, selection_or, buteur_du_jour = « GO »).
//  2. Lecture de la table tickets_du_jour (migration 0050) pour le jour J de Paris.
//     Lecture impossible (table absente, cle absente, reseau) : on N'ECRIT RIEN ce jour-la
//     (jamais remplacer un ticket deja vu) et le calcul quotidien continue (avertissement).
//  3. Un type deja publie aujourd'hui ne se recalcule JAMAIS (gel) : seul son etat peut
//     changer (match reporte / annule, buteur retire), plus « sans ce match » (cote et
//     chance recalculees sur les jambes restantes, memes regles).
//  4. Un type absent : calcule (lib/run-output/combos.js, jambes-du-jour.js) puis ecrit
//     une seule fois (insert « ignore-duplicates », jamais un upsert qui ecrase). L'heure
//     de publication est posee par la base ; un ticket dont un match a deja commence est
//     refuse par la base (preuve « publie avant le match »).
//  5. Aucun ticket possible : rien n'est ecrit ; un calcul plus tard le meme jour peut en
//     publier un. Le statut du dernier calcul (publie, aucun, indisponible) va dans
//     tickets_du_jour_calculs, que la fonction tickets-du-jour lit pour dire « aucun »
//     ou « en preparation ».
//  6. Controle de coherence : une jambe figee qui ne correspond plus au pari affiche sur
//     sa page (gel des paris en echec) -> alerte (compteur seulement), ticket inchange.
//  7. BUTEUR DU JOUR (regle de Clement du 04/10/2026, 20 h : « chaque decision affichee ne doit
//     plus jamais changer ; seule exception : les buteurs, si le joueur n'est pas dans la
//     composition ») : le buteur publie n'est REMPLACE que s'il est ABSENT de son match
//     (lib/buteurs-figes.js#absenceDe : composition officielle publiee sans lui, absence annoncee
//     par API-Football pour ce match, hors de l'effectif convoque). Le remplacant : le plus probable
//     du jour (memes regles, buteurDuJour), jamais un joueur deja remplace, avant SON coup d'envoi.
//     La trace de l'ancien joueur va dans etats.remplacements (motif, ancien = contenu publie) ; la
//     base n'accepte que ce remplacement-la (migration 0051). Aucun remplacant, ou migration 0051
//     absente (contenu inchange apres l'ecriture : avertissement) : joueur marque « retire ». Avant,
//     un buteur seulement sorti des titulaires probables du moteur etait marque « retire » : ce
//     n'est plus le cas. Verifie aussi pendant la journee (actualiserButeurDuJour, appele par la mise
//     a jour legere des jours de match, scripts/buteurs-jour-de-match.js).
// Journal : statuts et compteurs seulement, jamais un match, un pari, une cote ou une
// chance (depot public).

const JAMBES = require("./run-output/jambes-du-jour.js");
const PRONOSTIC = require("./pronostic.js");
const MP = require("./marches-paris.js");
const BUTEURS_FIGES = require("./buteurs-figes.js");
const COMBOS = require("./run-output/combos.js");
const REGLES = require("../config/tickets.json");
const VERDICTS = require("../config/verdicts-maths.json");

const TYPES = ["x5", "x10", "or", "buteur"];
const TABLE = "tickets_du_jour";
const TABLE_CALCULS = "tickets_du_jour_calculs";
const STATUTS_REPORTE = ["PST"];
const STATUTS_ANNULE = ["CANC", "ABD", "AWD", "WO"];
const VERDICT_DE = { x5: "chance_ticket", x10: "chance_ticket", or: "selection_or", buteur: "buteur_du_jour" };

function estObjet(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function go(verdicts, type) {
  const t = estObjet(verdicts) && estObjet(verdicts.tickets) ? verdicts.tickets : {};
  return t[VERDICT_DE[type]] === "GO";
}

function statutFixture(fx) {
  const core = fx && fx.fixture && typeof fx.fixture === "object" ? fx.fixture : fx;
  const s = core && core.status;
  return String(typeof s === "string" ? s : (s && s.short) || "").toUpperCase();
}
function etatDeFixture(fx) {
  const s = statutFixture(fx);
  if (STATUTS_REPORTE.indexOf(s) !== -1) return "reporte";
  if (STATUTS_ANNULE.indexOf(s) !== -1) return "annule";
  return "a_venir";
}

// ---------------------------------------------------------------- calcul pur

// Candidats de chaque match : ceux du calcul (opts.candidatsPar, lib/pronostic.js#marchesCandidats), sinon
// recalcules ; le pari AFFICHE sur la page (publie, verifie, jamais un repli hors fourchette) y est toujours,
// avec sa cote et sa chance de la page (cas d'un pari fige dont le marche n'est plus recalcule).
function candidatsAvecPariAffiche(matchs, opts) {
  const base = opts.candidatsPar || PRONOSTIC.marchesCandidats(matchs, { configLigues: opts.configLigues });
  const out = {};
  Object.keys(base || {}).forEach(function (k) { out[k] = Array.isArray(base[k]) ? base[k].slice() : []; });
  (matchs || []).forEach(function (m) {
    const id = JAMBES.pariAffiche(m);
    const p = estObjet(m && m.pronostic) ? m.pronostic : null;
    if (!id || !p || p.publie !== true || String(p.market_id || "") !== id || p.hors_fourchette === true) return;
    const k = String(m.id);
    const liste = out[k] || (out[k] = []);
    if (liste.some(function (c) { return c && String(c.market_id) === id; })) return;
    liste.push({ market_id: id, famille: (PRONOSTIC.MARCHE[id] || {}).famille || null, libelle_fr: p.libelle_fr || null, cote: Number(String(m.cote_rec).replace(",", ".")),
      cote_anj: m.cote_source === "anj", bookmaker: m.cote_source === "anj" ? m.cote_bookmaker || null : null, chance: Number(m.chance_iashark), chance_affichee: Number(m.chance_iashark),
      p_modele: null, q: null, voie: p.voie || null, fiabilite: p.fiabilite || null });
  });
  return out;
}

// Contenu (fige) et meta (non revelateur) de chaque type calculable aujourd'hui (regle du 06/10/2026,
// config/tickets.json). opts.deja : { or, x5, x10 : contenu deja publie aujourd'hui } : jamais recalcule, ses
// selections sont ENGAGEES (une nouvelle selection du meme match doit aller dans le meme sens). Ordre : Selection
// en or, petit combine, grand combine.
// -> { x5: {meta, contenu} | null, x10: ..., or: ..., buteur: ..., exclus, exclus_or, nb_jambes, nb_candidats_or }.
function calculerDuJour(matchs, opts) {
  opts = opts || {};
  const regles = opts.regles || REGLES;
  const deja = estObjet(opts.deja) ? opts.deja : {};
  const matchParId = {};
  (matchs || []).forEach(function (m) { if (m && m.id != null) matchParId[String(m.id)] = m; });
  const candidatsPar = candidatsAvecPariAffiche(matchs, opts);
  const base = { jour: opts.jour, nowMs: opts.nowMs, fixtureById: opts.fixtureById, categoriesNoGo: opts.categoriesNoGo, competitions: opts.competitions, regles: regles };
  const jambes = JAMBES.candidatsDuJour(matchs, candidatsPar, "jambe", base);
  const candOr = JAMBES.candidatsDuJour(matchs, candidatsPar, "or", base);
  const out = { exclus: jambes.exclus, exclus_or: candOr.exclus, nb_jambes: jambes.selections.length, nb_candidats_or: candOr.selections.length };
  const engagees = [];
  ["or", "x5", "x10"].forEach(function (t) { jambesDe(t, deja[t]).forEach(function (j) { engagees.push({ fixture_id: j.fixture_id, market_id: j.market_id }); }); });
  // 1. Selection en or (valeur).
  const or = deja.or ? null : JAMBES.selectionEnOrValeur(candOr.selections, { regles: regles, engagees: engagees, matchParId: matchParId });
  if (or) or.forEach(function (p) { engagees.push({ fixture_id: p.fixture_id, market_id: p.market_id }); });
  out.or = or ? { meta: { nb_paris: or.length }, contenu: { paris: or } } : null;
  // 2. Petit puis grand combine.
  const combos = COMBOS.generateDailyCombos({ jambes: jambes.selections, snapshotTime: opts.snapshotTime || new Date(opts.nowMs || Date.now()).toISOString(), regles: regles,
    engagees: engagees, matchParId: matchParId, deja: { x5: deja.x5, x10: deja.x10 } });
  combos.combos.forEach(function (c) {
    if (c.status !== "GENERATED") { out[c.type] = null; return; }
    const contenu = {
      nb_matchs: c.nb_matchs, cote_totale: c.cote_totale, chance: c.chance, chance_exacte: c.chance_exacte,
      operateur_unique: c.operateur_unique, jambes: c.jambes, paires_meme_ligue_meme_heure: c.paires_meme_ligue_meme_heure,
    };
    out[c.type] = { meta: { nb_matchs: c.nb_matchs, cote_totale: c.cote_totale }, contenu: contenu };
  });
  const b = JAMBES.buteurDuJour(matchs, { jour: opts.jour, nowMs: opts.nowMs, fixtureById: opts.fixtureById, categoriesNoGo: opts.categoriesNoGo, competitions: opts.competitions });
  out.buteur = b ? { meta: {}, contenu: b } : null;
  return out;
}

// Premier coup d'envoi (ISO) d'un contenu : la base refuse un ticket publie apres lui.
function premierCoupEnvoi(type, contenu) {
  const ms = [];
  if (type === "buteur") ms.push(Number(contenu && contenu.coup_envoi_ms));
  else ((type === "or" ? contenu && contenu.paris : contenu && contenu.jambes) || []).forEach((j) => ms.push(Number(j && j.coup_envoi_ms)));
  const ok = ms.filter((x) => Number.isFinite(x) && x > 0);
  return ok.length ? new Date(Math.min.apply(null, ok)).toISOString() : null;
}

function jambesDe(type, contenu) {
  if (type === "or") return (contenu && Array.isArray(contenu.paris)) ? contenu.paris : [];
  if (type === "x5" || type === "x10") return (contenu && Array.isArray(contenu.jambes)) ? contenu.jambes : [];
  return [];
}

// Le buteur publie est-il ABSENT de son match ? -> motif (« absent_composition », « absent_annonce »,
// « hors_effectif ») ou null (present, ou doute : il reste). lib/buteurs-figes.js#absenceDe.
function buteurAbsent(contenu, matchParId) {
  const m = contenu && matchParId ? matchParId[String(contenu.fixture_id)] : null;
  return m ? BUTEURS_FIGES.absenceDe(m, { id: contenu.joueur_id, nom: contenu.joueur }, contenu.cote) : null;
}
// Trace des remplacements deja faits (etats.remplacements), jamais perdue.
function remplacementsDe(etats) {
  return estObjet(etats) && Array.isArray(etats.remplacements) ? etats.remplacements : [];
}

// Etats d'un type deja publie (jambes reportees/annulees, buteur retire) et, pour un
// ticket, cote et chance « sans ce match ». Tout « a venir » : {} (rien a ecrire).
// ctx.etatsActuels : etats deja ecrits (la trace des remplacements du buteur y est gardee).
// -> {} | { jambes: {fid: etat}, sans_matchs_reportes } | { joueur: etat, remplacements }.
function etatsDe(type, contenu, ctx) {
  const fx = (ctx && ctx.fixtureById) || {};
  const matchParId = (ctx && ctx.matchParId) || {};
  if (type === "buteur") {
    const fid = String(contenu && contenu.fixture_id);
    let etat = fx[fid] ? etatDeFixture(fx[fid]) : "a_venir";
    // Retire SEULEMENT s'il est absent de son match (regle du 04/10/2026, 20 h) ; un joueur seulement sorti
    // des titulaires probables du moteur reste affiche.
    if (etat === "a_venir" && buteurAbsent(contenu, matchParId)) etat = "retire";
    const out = etat === "a_venir" ? {} : { joueur: etat };
    const remp = remplacementsDe(ctx && ctx.etatsActuels);
    if (remp.length) out.remplacements = remp;
    return out;
  }
  const jambes = jambesDe(type, contenu);
  const etats = {};
  jambes.forEach((j) => { const f = String(j.fixture_id); etats[f] = fx[f] ? etatDeFixture(fx[f]) : "a_venir"; });
  if (!jambes.some((j) => etats[String(j.fixture_id)] !== "a_venir")) return {};
  let sans = null;
  if (type === "x5" || type === "x10") {
    const restantes = jambes.filter((j) => etats[String(j.fixture_id)] === "a_venir");
    if (restantes.length) {
      const t = COMBOS.decrireTicket(type, restantes);
      sans = { nb_matchs: t.nb_matchs, cote_totale: t.cote_totale, chance: t.chance };
    }
  }
  return { jambes: etats, sans_matchs_reportes: sans };
}

// Selections figees qui ne vont plus dans le meme sens que le pari affiche sur leur page (regle du 06/10/2026 :
// une jambe peut porter sur un autre marche que le pari affiche, jamais le contredire ; lib/marches-paris.js
// #coherent, niveau « jambe » pour un combine, « or » pour la Selection en or). Meme marche : la cote doit etre
// la meme que celle de la page (gel des paris en echec sinon).
function incoherences(type, contenu, matchParId) {
  let n = 0;
  const seuil = REGLES.coherence && Number.isFinite(Number(REGLES.coherence.seuil_jambe)) ? Number(REGLES.coherence.seuil_jambe) : 0.8;
  jambesDe(type, contenu).forEach(function (j) {
    const m = matchParId[String(j.fixture_id)];
    if (!m || !m.market_id || m.no_signal === true) return; // match ferme ou sans pari : rien a comparer
    if (String(m.market_id) === String(j.market_id)) {
      const cote = Math.round(Number(String(m.cote_rec).replace(",", ".")) * 100);
      if (cote !== Math.round(Number(j.cote) * 100)) n++;
      return;
    }
    if (!MP.coherent(m, m.market_id, j.market_id, type === "or" ? MP.NIVEAU.OR : MP.NIVEAU.JAMBE, seuil).ok) n++;
  });
  return n;
}

// ---------------------------------------------------------------- stockage (PostgREST)

function client(ctx) {
  const url = ctx && ctx.supabase && ctx.supabase.url ? String(ctx.supabase.url).replace(/\/$/, "") : null;
  const cle = ctx && ctx.supabase && ctx.supabase.cle ? String(ctx.supabase.cle) : null;
  const f = (ctx && ctx.fetch) || (typeof fetch === "function" ? fetch : null);
  if (!url || !cle || !f) return null;
  const entetes = function (extra) { return Object.assign({ apikey: cle, Authorization: "Bearer " + cle, "Content-Type": "application/json" }, extra || {}); };
  return {
    lire: async function (jour) {
      const r = await f(url + "/rest/v1/" + TABLE + "?select=jour,type,meta,contenu,etats,publie_a&jour=eq." + jour, { headers: entetes() });
      if (!r.ok) throw new Error(TABLE + " " + r.status);
      const rows = await r.json();
      if (!Array.isArray(rows)) throw new Error(TABLE + " reponse illisible");
      return rows;
    },
    inserer: async function (ligne) {
      const r = await f(url + "/rest/v1/" + TABLE + "?on_conflict=jour,type", { method: "POST", headers: entetes({ Prefer: "resolution=ignore-duplicates,return=representation" }), body: JSON.stringify([ligne]) });
      if (!r.ok) throw new Error(TABLE + " insert " + r.status);
      const rows = await r.json().catch(() => []);
      return Array.isArray(rows) && rows.length > 0;
    },
    // Remplacement du buteur du jour (migration 0051). -> true si la base a garde le nouveau contenu ;
    // false si elle l'a remis (migration 0051 absente : le gel de 0050 remet l'ancien contenu).
    remplacerButeur: async function (jour, champs) {
      const r = await f(url + "/rest/v1/" + TABLE + "?jour=eq." + jour + "&type=eq.buteur", { method: "PATCH", headers: entetes({ Prefer: "return=representation" }), body: JSON.stringify(champs) });
      if (!r.ok) throw new Error(TABLE + " remplacement " + r.status);
      const rows = await r.json().catch(() => []);
      return Array.isArray(rows) && rows.length > 0 && memeJson(rows[0] && rows[0].contenu, champs.contenu);
    },
    etats: async function (jour, type, etats) {
      const r = await f(url + "/rest/v1/" + TABLE + "?jour=eq." + jour + "&type=eq." + type, { method: "PATCH", headers: entetes({ Prefer: "return=minimal" }), body: JSON.stringify({ etats: etats }) });
      if (!r.ok) throw new Error(TABLE + " etats " + r.status);
    },
    calcul: async function (ligne) {
      const r = await f(url + "/rest/v1/" + TABLE_CALCULS + "?on_conflict=jour", { method: "POST", headers: entetes({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify([ligne]) });
      if (!r.ok) throw new Error(TABLE_CALCULS + " " + r.status);
    },
  };
}

// Comparaison sans tenir compte de l'ordre des cles (jsonb les reordonne).
function stable(v) {
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
  return JSON.stringify(v === undefined ? null : v);
}
function memeJson(a, b) { return stable(a == null ? null : a) === stable(b == null ? null : b); }

// Statut public d'un emplacement de run_output.daily_combos (data.json : statut seulement).
const STATUT_COMBO = { publie: "GENERATED", deja_publie: "GENERATED", aucun: "NO_QUALIFYING_COMBINATION", non_go: "NOT_VALIDATED", indisponible: "UNAVAILABLE" };
function dailyCombosPublics(rapport, snapshotTime) {
  return {
    generated_at: snapshotTime || null,
    regle_version: REGLES.regle_version,
    combos: ["x5", "x10"].map((t) => ({ combo_id: COMBOS.COMBO_ID[t], type: t, status: STATUT_COMBO[rapport[t]] || "UNAVAILABLE" })),
  };
}

// ctx : { matchs, fixtureById, nowMs, configLigues, regles, verdicts, supabase: {url, cle},
//         fetch, pipelineSha, avertir(texte), erreur(texte) }
// -> rapport { jour, x5, x10, or, buteur (statut), alertes, exclus, ecrits, daily_combos }.
async function publierTicketsDuJour(ctx) {
  ctx = ctx || {};
  const nowMs = Number.isFinite(Number(ctx.nowMs)) ? Number(ctx.nowMs) : Date.now();
  const jour = JAMBES.jourParis(nowMs);
  const verdicts = ctx.verdicts || VERDICTS;
  const avertir = typeof ctx.avertir === "function" ? ctx.avertir : function () {};
  const erreur = typeof ctx.erreur === "function" ? ctx.erreur : function () {};
  const rapport = { jour: jour, alertes: 0, ecrits: 0, etats_mis_a_jour: 0, exclus: {} };
  const actifs = TYPES.filter((t) => go(verdicts, t));
  TYPES.forEach((t) => { rapport[t] = actifs.indexOf(t) === -1 ? "non_go" : "indisponible"; });
  if (!actifs.length) { rapport.daily_combos = dailyCombosPublics(rapport, ctx.snapshotTime); return rapport; }

  const db = client(ctx);
  if (!db) {
    avertir("cle Supabase absente : tickets non publies aujourd'hui.");
    rapport.daily_combos = dailyCombosPublics(rapport, ctx.snapshotTime);
    return rapport;
  }
  let lignes;
  try { lignes = await db.lire(jour); }
  catch (e) {
    avertir("table indisponible, tickets non publies aujourd'hui (" + String(e && e.message || e).slice(0, 80) + ").");
    rapport.daily_combos = dailyCombosPublics(rapport, ctx.snapshotTime);
    return rapport;
  }
  const existantes = {};
  lignes.forEach((l) => { if (l && TYPES.indexOf(l.type) !== -1) existantes[l.type] = l; });
  const matchParId = {};
  (ctx.matchs || []).forEach((m) => { if (m && m.id != null) matchParId[String(m.id)] = m; });

  let calcul = null;
  rapport.buteurs_remplaces = 0;
  for (const type of actifs) {
    const ligne = existantes[type];
    if (ligne) {
      rapport[type] = "deja_publie";
      rapport.alertes += incoherences(type, ligne.contenu, matchParId);
      // 7. Buteur du jour absent de son match : remplace (migration 0051), sinon retire.
      let forcer = false;
      const motif = type === "buteur" && estObjet(ligne.contenu) ? buteurAbsent(ligne.contenu, matchParId) : null;
      if (motif) {
        const r = await remplacerButeur(db, jour, ligne, ctx, nowMs, verdicts, motif);
        if (r === "remplace") { rapport.buteurs_remplaces++; continue; }
        if (r === "migration_absente") {
          avertir("migration 0051 non appliquee : buteur du jour absent marque retire (sans remplacant).");
          forcer = true;
        }
      }
      const etats = etatsDe(type, ligne.contenu, { fixtureById: ctx.fixtureById || {}, matchParId: matchParId, etatsActuels: ligne.etats });
      if (forcer || !memeJson(etats, estObjet(ligne.etats) ? ligne.etats : {})) {
        try { await db.etats(jour, type, etats); rapport.etats_mis_a_jour++; }
        catch (e) { avertir("etat du ticket " + type + " non mis a jour (" + String(e && e.message || e).slice(0, 60) + ")."); }
      }
      continue;
    }
    if (!calcul) {
      // Selections deja publiees aujourd'hui : jamais recalculees, engagees pour la coherence des nouvelles.
      const deja = {};
      ["or", "x5", "x10"].forEach(function (t) { if (existantes[t] && estObjet(existantes[t].contenu)) deja[t] = existantes[t].contenu; });
      calcul = calculerDuJour(ctx.matchs || [], { jour: jour, nowMs: nowMs, fixtureById: ctx.fixtureById || {}, configLigues: ctx.configLigues,
        categoriesNoGo: verdicts.categories_no_go, competitions: verdicts.competitions_jambes, regles: ctx.regles || REGLES, snapshotTime: ctx.snapshotTime,
        candidatsPar: ctx.candidatsPar || null, deja: deja });
      rapport.exclus = calcul.exclus;
      rapport.nb_jambes = calcul.nb_jambes;
    }
    const c = calcul[type];
    if (!c) { rapport[type] = "aucun"; continue; }
    const nouvelle = {
      jour: jour, type: type, regle_version: (ctx.regles || REGLES).regle_version || REGLES.regle_version,
      meta: c.meta, contenu: c.contenu, etats: {}, premier_coup_envoi: premierCoupEnvoi(type, c.contenu),
      pipeline_sha: ctx.pipelineSha || null,
    };
    try {
      const ecrite = await db.inserer(nouvelle);
      rapport[type] = ecrite ? "publie" : "deja_publie";
      if (ecrite) rapport.ecrits++;
    } catch (e) {
      rapport[type] = "indisponible";
      avertir("ticket " + type + " non ecrit (" + String(e && e.message || e).slice(0, 60) + ").");
    }
  }
  if (rapport.alertes) erreur(rapport.alertes + " jambe(s) de ticket ne correspondent plus au pari affiche sur leur page (gel des paris a verifier).");
  try {
    const statuts = {};
    TYPES.forEach((t) => { statuts[t] = rapport[t] === "deja_publie" ? "publie" : rapport[t]; });
    await db.calcul({ jour: jour, dernier_calcul_a: new Date(nowMs).toISOString(), statuts: statuts, pipeline_sha: ctx.pipelineSha || null });
  } catch (e) { avertir("statut du calcul des tickets non ecrit (" + String(e && e.message || e).slice(0, 60) + ")."); }
  rapport.daily_combos = dailyCombosPublics(rapport, ctx.snapshotTime);
  return rapport;
}

// Remplacement du buteur du jour publie (point 7 de l'en-tete) : le plus probable du jour parmi les joueurs
// qui ne sont ni l'ancien, ni un joueur deja remplace, ni absents, avant leur coup d'envoi (garde de
// buteurDuJour). -> « remplace » | « aucun » (pas de remplacant) | « migration_absente » | « erreur »
// (ecriture impossible : avertissement, rien de plus).
const MOTIFS_REMPLACEMENT = ["absent_composition", "absent_annonce", "hors_effectif"];
async function remplacerButeur(db, jour, ligne, ctx, nowMs, verdicts, motif) {
  const avertir = typeof ctx.avertir === "function" ? ctx.avertir : function () {};
  const anciens = remplacementsDe(ligne.etats);
  const exclure = [ligne.contenu].concat(anciens.map(function (x) { return x && x.ancien; })).filter(estObjet);
  const nouveau = JAMBES.buteurDuJour(ctx.matchs || [], { jour: jour, nowMs: nowMs, fixtureById: ctx.fixtureById || {},
    categoriesNoGo: verdicts.categories_no_go, competitions: verdicts.competitions_jambes, exclure: exclure });
  if (!nouveau) return "aucun";
  const trace = { motif: MOTIFS_REMPLACEMENT.indexOf(motif) !== -1 ? motif : "absent_composition", ancien: ligne.contenu, le: new Date(nowMs).toISOString() };
  try {
    const garde = await db.remplacerButeur(jour, { contenu: nouveau, premier_coup_envoi: premierCoupEnvoi("buteur", nouveau), etats: { remplacements: anciens.concat([trace]) } });
    return garde ? "remplace" : "migration_absente";
  } catch (e) {
    avertir("buteur du jour non remplace (" + String(e && e.message || e).slice(0, 60) + ").");
    return "erreur";
  }
}

// MISE A JOUR LEGERE DES JOURS DE MATCH (demande de Clement du 04/10/2026 : « Cristiano Ronaldo encore
// propose alors qu'il a quitte le rassemblement ») : appele par scripts/buteurs-jour-de-match.js, toutes les
// 30 min en journee, avec les compositions officielles et les absences relues pour les matchs proches
// (ctx.matchs : matchs du jour avec v3_buteurs, lineups, injuries, effectif). Seulement le buteur du jour :
// absent -> remplace (migration 0051) ou retire ; present ou doute -> rien. Jamais un ticket, jamais
// la Selection en or. ctx : { matchs, fixtureById, nowMs, supabase, fetch, verdicts, avertir }.
// -> { jour, statut : « absent_de_la_table » | « present » | « remplace » | « retire » | « deja_retire » |
//      « indisponible » | « non_go » }.
async function actualiserButeurDuJour(ctx) {
  ctx = ctx || {};
  const nowMs = Number.isFinite(Number(ctx.nowMs)) ? Number(ctx.nowMs) : Date.now();
  const jour = JAMBES.jourParis(nowMs);
  const verdicts = ctx.verdicts || VERDICTS;
  const avertir = typeof ctx.avertir === "function" ? ctx.avertir : function () {};
  if (!go(verdicts, "buteur")) return { jour: jour, statut: "non_go" };
  const db = client(ctx);
  if (!db) return { jour: jour, statut: "indisponible" };
  let lignes;
  try { lignes = await db.lire(jour); }
  catch (e) { avertir("tickets illisibles, buteur du jour non verifie (" + String(e && e.message || e).slice(0, 60) + ")."); return { jour: jour, statut: "indisponible" }; }
  const ligne = (lignes || []).find(function (l) { return l && l.type === "buteur" && estObjet(l.contenu); });
  if (!ligne) return { jour: jour, statut: "absent_de_la_table" };
  const matchParId = {};
  (ctx.matchs || []).forEach(function (m) { if (m && m.id != null) matchParId[String(m.id)] = m; });
  const motif = buteurAbsent(ligne.contenu, matchParId);
  if (!motif) return { jour: jour, statut: "present" };
  const r = await remplacerButeur(db, jour, ligne, ctx, nowMs, verdicts, motif);
  if (r === "remplace") return { jour: jour, statut: "remplace" };
  if (r === "migration_absente") avertir("migration 0051 non appliquee : buteur du jour absent marque retire (sans remplacant).");
  const anciens = estObjet(ligne.etats) ? ligne.etats : {};
  if (anciens.joueur === "retire" && r !== "migration_absente") return { jour: jour, statut: "deja_retire" };
  const etats = Object.assign({}, anciens, { joueur: "retire" });
  try { await db.etats(jour, "buteur", etats); }
  catch (e) { avertir("etat du buteur du jour non mis a jour (" + String(e && e.message || e).slice(0, 60) + ")."); return { jour: jour, statut: "indisponible" }; }
  return { jour: jour, statut: "retire" };
}

// ETATS DES MATCHS DES TICKETS DEJA PUBLIES, TOUTE LA JOURNEE (controle de l'ingenieur donnees du
// 04/10/2026 : le calcul quotidien ne tourne qu'une fois, la nuit ; un match reporte dans la journee
// restait « a venir » sur un ticket fige). Appele par .github/workflows/closing-odds.yml (toutes les
// 30 min), qui lit DEJA le statut API-Football de chaque match proche de son coup d'envoi (aucun
// appel en plus). Ne recalcule jamais un ticket : seulement ses etats (reporte, annule) et la ligne
// « sans ce match » (memes regles, lib/run-output/combos.js#decrireTicket). Un etat deja connu ne
// revient jamais a « a venir » le meme jour ; un buteur deja marque (retire, reporte) ne change plus.
// ctx : { fixtureById (statuts vus a ce lancement), nowMs, supabase: {url, cle}, fetch, avertir }.
// -> { jour, lus, mis_a_jour }.
const STATUT_DE_ETAT = { reporte: "PST", annule: "CANC" };
async function actualiserEtats(ctx) {
  ctx = ctx || {};
  const nowMs = Number.isFinite(Number(ctx.nowMs)) ? Number(ctx.nowMs) : Date.now();
  const jour = JAMBES.jourParis(nowMs);
  const avertir = typeof ctx.avertir === "function" ? ctx.avertir : function () {};
  const rapport = { jour: jour, lus: 0, mis_a_jour: 0 };
  const db = client(ctx);
  if (!db) return rapport;
  let lignes;
  try { lignes = await db.lire(jour); }
  catch (e) { avertir("tickets illisibles, etats non mis a jour (" + String(e && e.message || e).slice(0, 60) + ")."); return rapport; }
  const vus = estObjet(ctx.fixtureById) ? ctx.fixtureById : {};
  for (const l of lignes) {
    if (!l || TYPES.indexOf(l.type) === -1 || !estObjet(l.contenu)) continue;
    rapport.lus++;
    const anciens = estObjet(l.etats) ? l.etats : {};
    if (l.type === "buteur" && anciens.joueur && anciens.joueur !== "a_venir") continue;
    const fx = Object.assign({}, vus);
    const connus = l.type !== "buteur" && estObjet(anciens.jambes) ? anciens.jambes : {};
    Object.keys(connus).forEach(function (fid) { if (STATUT_DE_ETAT[connus[fid]]) fx[fid] = { fixture: { status: { short: STATUT_DE_ETAT[connus[fid]] } } }; });
    const etats = etatsDe(l.type, l.contenu, { fixtureById: fx, matchParId: {}, etatsActuels: anciens });
    if (memeJson(etats, anciens)) continue;
    try { await db.etats(jour, l.type, etats); rapport.mis_a_jour++; }
    catch (e) { avertir("etat du ticket " + l.type + " non mis a jour (" + String(e && e.message || e).slice(0, 60) + ")."); }
  }
  return rapport;
}

// Une ligne de journal : statuts et compteurs seulement (depot public).
function ligneJournal(r) {
  const ex = Object.keys(r.exclus || {}).sort().map((k) => k + "=" + r.exclus[k]).join(" ");
  return "[TICKETS] jour=" + r.jour + " x5=" + r.x5 + " x10=" + r.x10 + " or=" + r.or + " buteur=" + r.buteur
    + " jambes=" + (r.nb_jambes != null ? r.nb_jambes : "-") + " ecrits=" + r.ecrits + " etats=" + r.etats_mis_a_jour
    + " alertes=" + r.alertes + (r.buteurs_remplaces ? " buteur_remplace=" + r.buteurs_remplaces : "") + (ex ? " exclus: " + ex : "");
}

module.exports = { publierTicketsDuJour, actualiserEtats, actualiserButeurDuJour, calculerDuJour, etatsDe, incoherences, buteurAbsent, MOTIFS_REMPLACEMENT, premierCoupEnvoi, dailyCombosPublics, ligneJournal, etatDeFixture, go, TYPES, TABLE, TABLE_CALCULS };
