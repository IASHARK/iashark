"use strict";
// GARDE COUP D'ENVOI (integrite des pronostics, 14/09/2026).
//
// Le pipeline (.github/workflows/update-data.yml) recupere les matchs par date
// de Paris (J, J+1, J+2) a 06:00 UTC, sans regarder l'heure : un match de nuit
// (MLS, Liga MX, Amerique du Sud) pouvait recevoir un "pronostic" alors qu'il
// avait deja commence, voire etait termine, au moment du calcul.
//
// Regle : un match n'est "ouvert au pronostic" que si
//   - son statut api-football est a venir (NS = Not Started, TBD = heure a
//     definir) ;
//   - ET son coup d'envoi est strictement posterieur a maintenant + 15 minutes.
// Sinon : aucun pari retenu, aucune analyse publiee, jamais offert (is_free),
// jamais candidat a la selection canonique. Le match peut rester affiche comme
// fiche d'information (equipes, date, classement, forme...) sans pari.
//
// Un coup d'envoi illisible ferme le match (on ne pronostique pas un match dont
// on ne sait pas s'il a commence).

const KICKOFF_MARGIN_MINUTES = 15;
const UPCOMING_STATUSES = ["NS", "TBD"];

// Accepte un element brut api-football ({fixture:{date,timestamp,status}}) ou
// directement l'objet fixture ({date,timestamp,status}).
function fixtureCore(input) {
  if (!input || typeof input !== "object") return null;
  if (input.fixture && typeof input.fixture === "object") return input.fixture;
  return input;
}

function kickoffMs(core) {
  if (!core) return null;
  const ts = Number(core.timestamp);
  if (Number.isFinite(ts) && ts > 0) return ts * 1000;
  const t = Date.parse(core.date || "");
  return Number.isFinite(t) ? t : null;
}

function statusShort(core) {
  if (!core || !core.status) return "";
  if (typeof core.status === "string") return core.status;
  return String(core.status.short || "");
}

// -> { open, reason, kickoff_ms, status }
// reason : null (ouvert) | FIXTURE_NOT_UPCOMING | KICKOFF_UNKNOWN |
//          KICKOFF_PASSED | KICKOFF_IMMINENT
function kickoffGate(input, nowMs, opts) {
  const margin = opts && Number.isFinite(Number(opts.marginMinutes)) ? Number(opts.marginMinutes) : KICKOFF_MARGIN_MINUTES;
  const now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  const core = fixtureCore(input);
  const status = statusShort(core);
  const ko = kickoffMs(core);
  const out = { open: false, reason: null, kickoff_ms: ko, status: status };
  if (UPCOMING_STATUSES.indexOf(status) === -1) { out.reason = "FIXTURE_NOT_UPCOMING"; return out; }
  if (ko == null) { out.reason = "KICKOFF_UNKNOWN"; return out; }
  if (ko <= now) { out.reason = "KICKOFF_PASSED"; return out; }
  if (ko <= now + margin * 60000) { out.reason = "KICKOFF_IMMINENT"; return out; }
  out.open = true;
  return out;
}

// Retire d'un match ferme tout ce qui constitue un pronostic : champs premium
// (pari, cote, probabilites, textes d'analyse... liste lib/premium-fields.js),
// et vide la ligne premium correspondante. Le match reste une fiche
// d'information : equipes, date, stade, classement, forme, H2H, cotes brutes.
// conf (note sur 10, champ premium) est retiree avec le reste : plus de pari,
// plus de note. Mutation en place ; renvoie le match.
function closeMatchForPick(match, premiumRow, premiumFields, reason) {
  if (!match || typeof match !== "object") return match;
  (premiumFields || []).forEach(function (k) { delete match[k]; });
  match.pari_rec = "";
  match.no_signal = true;
  match.no_signal_reason = reason || "KICKOFF_PASSED";
  match.no_signal_label = "Match commencé ou imminent : aucun pronostic";
  match.has_signal = false;
  match.is_free = false;
  if (premiumRow && typeof premiumRow === "object") {
    premiumRow.pari_rec = "";
    premiumRow.cote_rec = null;
    premiumRow.market_id = null;
    premiumRow.marche = null;
    premiumRow.model_probability = null;
    premiumRow.markets_compared = null;
    premiumRow.kelly = "0";
    premiumRow.edge = "";
    premiumRow.verdict_shark = "";
    premiumRow.facteur_x = "";
    premiumRow.dropping_odds = null;
    premiumRow.player_markets = null;
    premiumRow.premium_fields = null;
    premiumRow.raw_response = { explanation_status: "SKIPPED_" + (reason || "KICKOFF_PASSED") };
  }
  return match;
}

// MATCH OFFERT DU JOUR (pipeline designerMatchGratuit, audit du 16/09/2026).
// L'analyse offerte etait parfois un match de nuit (00:00 heure de Paris) deja
// termine quand les visiteurs la decouvraient. Un match n'est eligible que si
// sa fixture est ouverte au pronostic avec une marge de FREE_MARGIN_MINUTES
// apres l'heure du run (jamais suppose ouvert sans fixture) ; parmi eux, un
// creneau raisonnable en heure de Paris (12:00-22:59) est prefere.
const FREE_MARGIN_MINUTES = 90;
function eligibleForFree(fixture, nowMs, opts) {
  const margin = opts && Number.isFinite(Number(opts.marginMinutes)) ? Number(opts.marginMinutes) : FREE_MARGIN_MINUTES;
  return !!fixture && kickoffGate(fixture, nowMs, { marginMinutes: margin }).open;
}
// match.date : "YYYY-MM-DD HH:MM" en heure de Paris (data.json).
function reasonableParisSlot(match, opts) {
  const from = opts && opts.from != null ? opts.from : 12, to = opts && opts.to != null ? opts.to : 22;
  const m = /^\d{4}-\d{2}-\d{2}[ T](\d{2}):\d{2}/.exec(String(match && match.date || ""));
  if (!m) return false;
  const h = Number(m[1]);
  return h >= from && h <= to;
}

// Candidats de la selection canonique (lib/run-output) : ne garde que ceux dont
// la fixture est encore ouverte. fixturesById : { "<id>": element api-football }.
// Un candidat dont la fixture est inconnue est retire (jamais suppose ouvert).
function filterOpenCandidates(candidates, fixturesById, nowMs, opts) {
  return (candidates || []).filter(function (c) {
    const id = c && c.fixture_id != null ? c.fixture_id : c && c.fixture && c.fixture.fixture_id;
    if (id == null) return false;
    const fx = fixturesById && fixturesById[String(id)];
    return !!fx && kickoffGate(fx, nowMs, opts).open;
  });
}

module.exports = {
  KICKOFF_MARGIN_MINUTES,
  FREE_MARGIN_MINUTES,
  UPCOMING_STATUSES,
  eligibleForFree,
  reasonableParisSlot,
  kickoffGate,
  closeMatchForPick,
  filterOpenCandidates,
};
