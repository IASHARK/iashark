"use strict";
// ARCHIVE DES MATCHS OFFERTS (mathematicien, 29/09/2026) : chaque match offert est
// archive avec la cote affichee au moment ou il est designe, puis sa cote de
// cloture (releve closing-odds.yml, match_snapshots 'closing', dans les 3 h avant
// le coup d'envoi). But : mesurer la CLV du « match offert v3 » sur plusieurs
// centaines de jours. Fichier public : preuves/matchs-offerts.json (le pari d'un
// match offert est deja public). Ajout seulement : une entree n'est jamais
// retiree, seule sa cote de cloture est completee, une fois.

// market_id du site -> cle de lib/odds.js#parseOdds (cotes de cloture).
const CLE_COTE = {
  "home-win": "c1", "draw": "cn", "away-win": "c2",
  "over-15": "co15", "over-25": "co25", "under-25": "cu25", "over-35": "co35",
  "dc-1x": "dc1x", "dc-x2": "dc2x", "dc-12": "dc12",
  "btts-yes": "btts_oui", "btts-no": "btts_non",
};

const { parisLocalToMs } = require("./kickoff-guard.js");

function num(v) { const x = Number(String(v == null ? "" : v).replace(",", ".")); return Number.isFinite(x) && x > 1 ? x : null; }

function vide() {
  return {
    version: 1,
    explication: "Chaque match offert, avec la cote affichee quand il a ete designe et sa cote de cloture (dernier releve dans les 3 heures avant le coup d'envoi). Sert a mesurer la valeur du match offert dans le temps. Rien n'est retire.",
    matchs: [],
  };
}

// elus : matchs designes offerts ce run ({ id, date, home, away, league, pari_rec,
// market_id, cote_rec, model_probability, moteur_v3 }). -> nombre d'ajouts.
function enregistrer(registre, elus, opts) {
  opts = opts || {};
  let n = 0;
  (elus || []).forEach(function (m) {
    if (!m || m.id == null || !m.pari_rec) return;
    const jour = String(m.date || "").slice(0, 10);
    const deja = registre.matchs.some(function (x) { return x.fixture_id === Number(m.id) && x.jour === jour; });
    if (deja) return;
    const v3 = !!(m.v3_pari && m.moteur_v3 && m.moteur_v3.source === "v3");
    registre.matchs.push({
      jour: jour,
      fixture_id: Number(m.id),
      match: ((m.home && m.home.n) || "") + " - " + ((m.away && m.away.n) || ""),
      ligue: m.league || null,
      coup_envoi: m.date || null,
      pari: m.pari_rec,
      market_id: m.market_id || null,
      probabilite: m.model_probability != null ? Number(m.model_probability) : null,
      // Chance IASHARK affichee (une seule source, 01/10/2026 : lib/chance-iashark.js).
      chance_iashark: m.chance_iashark != null && m.chance_iashark !== "" ? Number(m.chance_iashark) : null,
      cote_affichee: num(m.cote_rec),
      moteur: v3 ? "v3" : "ancien",
      moteur_version: v3 ? (m.moteur_v3.version_moteur || null) : (opts.versionAncien || null),
      designe_le: opts.nowIso || new Date().toISOString(),
      cote_cloture: null,
      cloture_relevee_le: null,
    });
    n++;
  });
  return n;
}

// Fixtures dont la cote de cloture reste a lire.
function aCompleter(registre) {
  return registre.matchs.filter(function (x) { return x.cloture_relevee_le == null; }).map(function (x) { return x.fixture_id; });
}

// snapshots : lignes match_snapshots 'closing' ({ fixture_id, captured_at, raw_inputs: { odds } }).
// Une cote de cloture absente pour ce marche reste null, mais le releve est note.
// termine(x) : vrai si le coup d'envoi est passe (sinon le releve peut encore changer).
// COTE DE CLOTURE = le DERNIER releve pris AVANT le coup d'envoi (ronde 5, 30/09/2026).
// Avant, la derniere ligne renvoyee par la base gagnait : sans tri, un releve plus ancien
// (ou pris apres le coup d'envoi, cote en direct) pouvait passer pour la cloture. Un
// releve sans heure lisible, ou un coup d'envoi illisible, ne prouve rien : ignore.
function heure(v) { const t = Date.parse(String(v || "")); return Number.isFinite(t) ? t : null; }
function completerClotures(registre, snapshots, termine) {
  const parId = {};
  (snapshots || []).forEach(function (s) {
    if (!s || s.fixture_id == null || heure(s.captured_at) === null) return;
    const k = String(s.fixture_id);
    (parId[k] = parId[k] || []).push(s);
  });
  let n = 0;
  registre.matchs.forEach(function (x) {
    if (x.cloture_relevee_le != null) return;
    if (typeof termine === "function" && !termine(x)) return;
    const ko = parisLocalToMs(x.coup_envoi);
    if (ko === null) return;
    const s = (parId[String(x.fixture_id)] || [])
      .filter(function (r) { return heure(r.captured_at) < ko; })
      .sort(function (a, b) { return heure(b.captured_at) - heure(a.captured_at); })[0];
    if (!s) return;
    const odds = s.raw_inputs && s.raw_inputs.odds ? s.raw_inputs.odds : {};
    const cle = CLE_COTE[x.market_id];
    x.cote_cloture = cle ? num(odds[cle]) : null;
    x.cloture_relevee_le = s.captured_at || null;
    if (x.cloture_relevee_le == null) return;
    n++;
  });
  return n;
}

module.exports = { CLE_COTE: CLE_COTE, vide: vide, enregistrer: enregistrer, aCompleter: aCompleter, completerClotures: completerClotures };
