"use strict";
// GEL DE L'ANALYSE A SA PREMIERE PUBLICATION (decision du proprietaire, 19/09/2026).
//
// Probleme : le pipeline quotidien (.github/workflows/update-data.yml) recalculait
// a chaque passage TOUS les matchs pas encore joues. Un abonne Pro qui avait vu
// vendredi le pari retenu d'un match du dimanche pouvait le voir changer samedi
// (cotes ou donnees qui bougent, nouvelle regle de selection du 19/09), au
// milieu d'un combine prepare sur deux jours.
//
// Regle : une fois l'analyse d'un match publiee avec un pari retenu (marche
// nomme), ce pari, sa probabilite affichee, sa cote et tout ce que l'analyse en
// dit (chiffres du modele, comparatif des marches, fiabilite, risque, textes
// rediges et leurs traductions) ne changent plus jusqu'au coup d'envoi. Les
// nouvelles regles et donnees ne s'appliquent qu'aux matchs publies pour la
// premiere fois. Les FAITS publics (cotes brutes des bookmakers, forme,
// classement, H2H, blessures, compositions, meteo, statistiques d'equipe)
// continuent de se mettre a jour.
//
// SOURCE DE LA PUBLICATION PRECEDENTE : la ligne match_premium_data du match,
// relue par le pipeline (service role) avant tout calcul. C'est exactement ce
// que la fonction match-data sert aux abonnes Pro (colonnes dediees +
// premium_fields + raw_response.narrative_i18n), pour TOUS les matchs, payants
// comme offert. Les fichiers publics (data.json, match/<id>.json) n'ont
// l'analyse complete que pour le match offert ; predictions_archive ne garde
// que le pari, sa cote et sa probabilite (ni comparatif ni textes) ;
// match_snapshots ne garde que les donnees d'entree. Le data.json publie par le
// run precedent sert seulement de complement public (qualite des donnees,
// match offert du jour), jamais de source du pari.
//
// CAS (freezeAnalysis) :
//  - garde coup d'envoi fermee parce que le match SE JOUE ou S'EST JOUE
//    (commence, imminent, en cours, termine) ET une analyse avec pari avait
//    ete publiee -> FROZEN_CLOSED (corrige le 20/09/2026) : l'analyse publiee
//    est RESTAUREE figee, marquee pick_closed, au lieu d'etre effacee. Avant,
//    le run de midi passait ces matchs en « aucun pronostic » et la ligne
//    premium videe ecrasait l'analyse servie la veille : un visiteur qui
//    revenait voyait « donnees insuffisantes » sur un match qu'il avait vu
//    analyse. Le pari publie avant le coup d'envoi reste donc visible tel
//    quel (jamais un nouveau pari : la garde interdit toujours d'en creer) ;
//  - garde fermee parce que le match est reporte (PST), annule (CANC, ABD,
//    AWD, WO) ou que la fixture est inconnue -> rien n'est restaure : les
//    bookmakers annulent ces paris, l'analyse retiree ne revient pas. Si le
//    match revient plus tard en NS, c'est une nouvelle premiere publication ;
//  - publication precedente illisible (Supabase en panne) -> calcul du jour,
//    sans horodatage (le pipeline emet un ::warning : les paris peuvent changer) ;
//  - publication precedente avec un pari retenu (pari_rec non vide, pas
//    « aucun signal ») -> FIGE : tous les champs de l'analyse reprennent
//    EXACTEMENT les valeurs publiees. Y compris un pari publie SANS cote (repli
//    NO_ODDS) : il reste sans cote jusqu'au coup d'envoi (voir hasRetainedMarket) ;
//  - aucune publication ou publication sans pari (aucun signal, donnees
//    insuffisantes) -> calcul du jour. S'il retient un pari, c'est la premiere
//    publication : pick_frozen_at = heure du run ;
//  - coup d'envoi deplace de plus de MAX_KICKOFF_SHIFT_HOURS depuis la premiere
//    publication (match reprogramme, la plupart des bookmakers annulent alors
//    les paris engages) -> l'ancienne analyse est liberee : nouvelle premiere
//    publication. Deplacement plus court (horaire TV...) : reste fige.
//
// Tout est pur (aucune E/S, entrees jamais modifiees) sauf alignPendingPrediction
// qui, comme l'historique du pipeline, complete une prediction EN PLACE.

const PREMIUM = require("./premium-fields.js");
const { kickoffGate, KICKOFF_MARGIN_MINUTES } = require("./kickoff-guard.js");

// Le pari lui-meme : champs du match public ET colonnes de match_premium_data.
const PICK_COLUMNS = ["pari_rec", "cote_rec", "model_probability", "markets_compared", "market_id", "marche"];
// Colonnes de match_premium_data sans equivalent sur le match (Kelly, ecart,
// textes premium) : figees avec le reste. Leurs traductions (facteur_x_i18n,
// verdict_shark_i18n) vivent dans raw_response.narrative_i18n, restaure tel quel.
const PREMIUM_ONLY_COLUMNS = ["kelly", "edge", "verdict_shark", "facteur_x"];
// Champs premium qui NE SONT PAS l'analyse du pari et continuent de vivre :
//  - dropping_odds : mouvement des cotes depuis la veille (flux de marche) ;
//  - player_markets : projections joueurs, suivent les compositions officielles ;
//  - top_scorers : buteurs probables, suivent les absences annoncees (un
//    joueur blesse depuis la publication ne doit pas rester mis en avant).
const LIVE_PREMIUM_FIELDS = ["dropping_odds", "player_markets", "top_scorers"];
// Champs de premium_fields figes : toute la sortie du modele et de l'analyse.
const FROZEN_PAYLOAD_FIELDS = PREMIUM.PREMIUM_PAYLOAD_FIELDS.filter(function (k) { return LIVE_PREMIUM_FIELDS.indexOf(k) === -1; });
// Amorces PUBLIQUES qui decrivent l'analyse publiee : la page match n'affiche
// le pari que si model_output_available !== false et data_quality_score > 0
// (lib/display-data.js#hasReliableModelOutput) ; la qualite des donnees et la
// source des cotes sont citees dans « Sur quoi repose cette analyse ».
const FROZEN_PUBLIC_FIELDS = ["model_output_available", "data_quality_score", "data_quality_label", "market_source"];
// Tout ce qui est retire du match frais avant d'y reposer l'analyse publiee.
const FROZEN_MATCH_FIELDS = PICK_COLUMNS.concat(FROZEN_PAYLOAD_FIELDS);
// Colonnes relues dans match_premium_data (sans premium_fields si la migration
// 0020 manque : l'objet est alors dans raw_response.premium_fields).
const PREMIUM_ROW_SELECT = ["fixture_id"].concat(PICK_COLUMNS, PREMIUM_ONLY_COLUMNS, ["premium_fields", "raw_response", "pipeline_sha", "updated_at"]).join(",");
const MAX_KICKOFF_SHIFT_HOURS = 24;
// Statuts api-football d'un match qui SE JOUE ou S'EST JOUE : l'analyse
// publiee avant le coup d'envoi reste servie (FROZEN_CLOSED). Reporte (PST),
// annule (CANC/ABD/AWD/WO) ou inconnu : jamais restaure, les bookmakers
// annulent ces paris.
const LIVE_OR_PLAYED_STATUSES = ["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE", "FT", "AET", "PEN"];

const isPlainObject = function (v) { return !!v && typeof v === "object" && !Array.isArray(v); };
const txt = function (v) { return typeof v === "string" && v.trim() ? v.trim() : null; };
const own = function (o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); };
const clone = function (v) { return v && typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v; };
function num(v) {
  if (v === null || v === undefined || (typeof v === "string" && !v.trim())) return null;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : null;
}

// Un pari retenu = un marche nomme (pari_rec non vide) sur un match qui n'est
// pas « aucun signal ». Un pari publie sans cote (repli NO_ODDS, aucun
// bookmaker ne cotait encore le match) compte : il a ete montre aux abonnes, il
// reste donc tel quel, sans cote, jusqu'au coup d'envoi. Pour le laisser se
// recalculer quand les cotes arrivent, exiger ici num(r.cote_rec) > 1.
function hasRetainedMarket(r) {
  if (!r || typeof r !== "object" || r.no_signal === true) return false;
  return !!txt(r.pari_rec);
}

function rawResponseOf(row) { return row && isPlainObject(row.raw_response) ? row.raw_response : null; }
// premium_fields : colonne (migration 0020), sinon repli raw_response.premium_fields.
function payloadOf(row) {
  if (row && isPlainObject(row.premium_fields)) return row.premium_fields;
  const raw = rawResponseOf(row);
  return raw && isPlainObject(raw.premium_fields) ? raw.premium_fields : {};
}
function freezeMetaOf(row) {
  const raw = rawResponseOf(row);
  return raw && isPlainObject(raw.pick_freeze) ? raw.pick_freeze : null;
}
function isoOf(v) {
  const t = Date.parse(String(v || ""));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
function publicSnapshot(m) {
  if (!m || typeof m !== "object") return null;
  const out = {};
  FROZEN_PUBLIC_FIELDS.forEach(function (k) { if (own(m, k) && m[k] !== undefined) out[k] = m[k]; });
  return Object.keys(out).length ? out : null;
}

// Ecart en heures entre deux coups d'envoi au format public du match
// ("YYYY-MM-DD HH:MM", heure de Paris). Les deux sont lus dans le meme fuseau :
// l'ecart est juste (a l'heure d'ete pres). null si l'un est illisible.
function kickoffShiftHours(a, b) {
  const lire = function (s) {
    const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/.exec(String(s || ""));
    return m ? Date.parse(m[1] + "T" + m[2] + ":00Z") : NaN;
  };
  const ta = lire(a), tb = lire(b);
  return Number.isFinite(ta) && Number.isFinite(tb) ? Math.abs(tb - ta) / 3600000 : null;
}

function result(status, reason, match, premiumRow) {
  return { status: status, reason: reason || null, match: match, premiumRow: premiumRow, frozenAt: (match && match.pick_frozen_at) || null };
}

// Calcul du jour. S'il retient un pari cote, c'est la premiere publication :
// horodatage pick_frozen_at (conserve ensuite a chaque run) et metadonnees
// raw_response.pick_freeze (heure, coup d'envoi, amorces publiques).
function firstPublication(fresh, row, nowIso, reason) {
  const match = Object.assign({}, fresh);
  if (!hasRetainedMarket(fresh)) {
    delete match.pick_frozen_at;
    return result("NOT_FREEZABLE", reason, match, row);
  }
  match.pick_frozen_at = nowIso;
  let premiumRow = row;
  if (row) {
    premiumRow = Object.assign({}, row, {
      raw_response: Object.assign({}, rawResponseOf(row) || {}, {
        pick_freeze: { frozen_at: nowIso, kickoff: txt(fresh.date), public: publicSnapshot(fresh) },
      }),
    });
  }
  return result("FIRST_PUBLICATION", reason, match, premiumRow);
}

// Analyse deja publiee : reprise EXACTE de ce qui a ete servi.
function frozen(fresh, previous, row, nowIso, meta, refKickoff, previousPublic) {
  const payload = payloadOf(previous);
  const frozenAt = (meta && isoOf(meta.frozen_at)) || isoOf(previous.updated_at) || nowIso;
  const match = Object.assign({}, fresh);
  FROZEN_MATCH_FIELDS.forEach(function (k) { delete match[k]; });
  PICK_COLUMNS.forEach(function (k) { if (previous[k] !== undefined) match[k] = clone(previous[k]); });
  // Format du fichier public : cote en chaine (comme String(pickedMarket.cote)),
  // chaine vide pour un pari publie sans cote.
  match.cote_rec = num(previous.cote_rec) !== null ? String(previous.cote_rec) : "";
  // Un champ absent de la publication precedente reste absent : il n'a pas ete
  // servi aux abonnes, on ne le complete jamais avec une valeur du jour.
  FROZEN_PAYLOAD_FIELDS.forEach(function (k) { if (own(payload, k) && payload[k] !== undefined) match[k] = clone(payload[k]); });
  // conf (note /10) : lignes anciennes sans conf dans premium_fields. Meme
  // formule que la fonction match-data qui la servait alors aux abonnes.
  if ((match.conf === undefined || match.conf === null) && num(match.model_probability) !== null) {
    match.conf = Math.round(num(match.model_probability)) / 10;
  }
  // Amorces publiques de l'analyse publiee : metadonnees du gel, sinon le
  // data.json du run precedent (lignes ecrites avant le gel), sinon le jour.
  const pub = (meta && isPlainObject(meta.public)) ? meta.public : publicSnapshot(previousPublic);
  FROZEN_PUBLIC_FIELDS.forEach(function (k) { if (pub && own(pub, k) && pub[k] !== undefined) match[k] = clone(pub[k]); });
  match.no_signal = false;
  match.no_signal_label = "";
  delete match.no_signal_reason;
  match.pick_frozen_at = frozenAt;

  let premiumRow = row;
  if (row) {
    const raw = clone(rawResponseOf(previous)) || {};
    // premium_fields est recalcule par le pipeline depuis le match fige.
    delete raw.premium_fields;
    raw.pick_freeze = { frozen_at: frozenAt, kickoff: refKickoff || txt(fresh.date), public: publicSnapshot(match) };
    const columns = { raw_response: raw };
    PICK_COLUMNS.concat(PREMIUM_ONLY_COLUMNS).forEach(function (k) { columns[k] = previous[k] === undefined ? null : clone(previous[k]); });
    columns.cote_rec = num(previous.cote_rec);
    // Le SHA qui a produit l'analyse (tracabilite, migration 0002).
    if (txt(previous.pipeline_sha)) columns.pipeline_sha = previous.pipeline_sha;
    premiumRow = Object.assign({}, row, columns);
  }
  return result("FROZEN", null, match, premiumRow);
}

// fresh : match calcule par ce run (garde coup d'envoi deja appliquee).
// previous : ligne match_premium_data du meme match (select PREMIUM_ROW_SELECT),
//   null si aucune ligne, undefined si la lecture a echoue.
// opts : { nowMs, fixture (element api-football du run), premiumRow (ligne
//   premium fraiche du match), previousPublic (match du data.json precedent) }.
// -> { status, reason, match, premiumRow, frozenAt } ; status :
//   FROZEN | FROZEN_CLOSED (match commence/joue, analyse publiee restauree
//   figee) | FIRST_PUBLICATION | NOT_FREEZABLE (aucun pari a figer) |
//   KICKOFF_CLOSED | PREVIOUS_UNKNOWN.
function freezeAnalysis(fresh, previous, opts) {
  opts = opts || {};
  const row = opts.premiumRow || null;
  if (!fresh || typeof fresh !== "object") return result("NO_MATCH", null, fresh, row);
  const nowMs = num(opts.nowMs) !== null ? num(opts.nowMs) : Date.now();
  const nowIso = new Date(nowMs).toISOString();
  // Garde coup d'envoi : un match ferme ne retrouve jamais un NOUVEAU pari
  // ici. Mais si le match se joue (ou s'est joue) et qu'une analyse avec pari
  // avait ete publiee, elle est restauree figee (20/09/2026) : la ligne
  // premium videe par closeMatchForPick n'ecrase plus l'analyse servie.
  const gate = kickoffGate(opts.fixture, nowMs, { marginMinutes: KICKOFF_MARGIN_MINUTES });
  if (!gate.open) {
    const playedOrLive = gate.reason === "KICKOFF_PASSED" || gate.reason === "KICKOFF_IMMINENT" ||
      (gate.reason === "FIXTURE_NOT_UPCOMING" && LIVE_OR_PLAYED_STATUSES.indexOf(gate.status) !== -1);
    const sameFixture = previous && (previous.fixture_id == null || fresh.id == null || String(previous.fixture_id) === String(fresh.id));
    if (playedOrLive && previous && sameFixture && hasRetainedMarket(previous)) {
      const metaClosed = freezeMetaOf(previous);
      const refKickoffClosed = txt(metaClosed && metaClosed.kickoff) || txt(opts.previousPublic && opts.previousPublic.date);
      const out = frozen(fresh, previous, row, nowIso, metaClosed, refKickoffClosed, opts.previousPublic || null);
      // Fermeture affichable : l'analyse publiee reste servie, mais le match
      // n'est plus ni offert ni candidat (gardes du pipeline en aval).
      out.match.pick_closed = true;
      out.match.is_free = false;
      return result("FROZEN_CLOSED", gate.reason, out.match, out.premiumRow);
    }
    return result("KICKOFF_CLOSED", gate.reason, fresh, row);
  }
  // Etat precedent inconnu (lecture en echec) ou ligne d'un autre match :
  // calcul du jour, sans horodatage de premiere publication.
  if (previous === undefined) return result("PREVIOUS_UNKNOWN", "READ_FAILED", fresh, row);
  if (previous && previous.fixture_id != null && fresh.id != null && String(previous.fixture_id) !== String(fresh.id)) {
    return result("PREVIOUS_UNKNOWN", "FIXTURE_MISMATCH", fresh, row);
  }
  if (!previous) return firstPublication(fresh, row, nowIso, "NO_PREVIOUS");
  if (!hasRetainedMarket(previous)) return firstPublication(fresh, row, nowIso, "PREVIOUS_WITHOUT_PICK");
  const meta = freezeMetaOf(previous);
  const refKickoff = txt(meta && meta.kickoff) || txt(opts.previousPublic && opts.previousPublic.date);
  const shift = kickoffShiftHours(refKickoff, fresh.date);
  if (shift !== null && shift > MAX_KICKOFF_SHIFT_HOURS) return firstPublication(fresh, row, nowIso, "KICKOFF_MOVED");
  return frozen(fresh, previous, row, nowIso, meta, refKickoff, opts.previousPublic || null);
}

// MATCH OFFERT DU JOUR : une designation faite par un run precedent (is_free du
// data.json publie) est gardee pour son jour (heure de Paris) tant que le match
// peut etre servi : meme fixture, toujours ce jour-la, pari publie, garde coup
// d'envoi ouverte (NS/TBD, coup d'envoi > maintenant + 15 min). Le proprietaire
// l'annonce aux membres le matin : elle ne change pas au run de midi.
// -> { "YYYY-MM-DD": match du run }, jours anterieurs a opts.today ignores.
// opts : { today, nowMs, fixturesById }.
function parisDay(m) { const d = /^(\d{4}-\d{2}-\d{2})/.exec(String((m && m.date) || "")); return d ? d[1] : null; }
function servableAsFree(m, opts) {
  if (!m || !txt(m.pari_rec) || m.no_signal === true) return false;
  const fx = opts.fixturesById ? opts.fixturesById[String(m.id)] : null;
  const nowMs = num(opts.nowMs) !== null ? num(opts.nowMs) : Date.now();
  return kickoffGate(fx, nowMs, { marginMinutes: KICKOFF_MARGIN_MINUTES }).open;
}
function keptFreeDesignations(previousMatches, currentMatches, opts) {
  opts = opts || {};
  const today = String(opts.today || "");
  const parId = {};
  (currentMatches || []).forEach(function (m) { if (m && m.id != null && !parId[String(m.id)]) parId[String(m.id)] = m; });
  const kept = {};
  (previousMatches || [])
    .filter(function (m) { return m && m.is_free === true && m.id != null; })
    .sort(function (a, b) { return String(a.date || "").localeCompare(String(b.date || "")); })
    .forEach(function (prev) {
      const day = parisDay(prev);
      if (!day || (today && day < today) || kept[day]) return;
      const cur = parId[String(prev.id)];
      if (!cur || parisDay(cur) !== day || !servableAsFree(cur, opts)) return;
      kept[day] = cur;
    });
  return kept;
}

// Selection canonique (SAFE_PICK, combines) : uniquement sur les matchs publies
// pour la premiere fois. Un match fige garde son pari, jamais remplace.
function candidateFixtureId(c) {
  if (!c) return null;
  if (c.fixture_id != null) return c.fixture_id;
  return c.fixture && c.fixture.fixture_id != null ? c.fixture.fixture_id : null;
}
function withoutFrozenCandidates(candidates, frozenIds) {
  const figes = frozenIds || {};
  return (candidates || []).filter(function (c) {
    const id = candidateFixtureId(c);
    return id == null || !figes[String(id)];
  });
}

// SUIVI DES RESULTATS : une prediction encore en attente (historique.json,
// predictions_archive) suit le pari PUBLIE, celui que voient les abonnes
// jusqu'au coup d'envoi, jamais un pari recalcule puis abandonne. En regime
// normal elles sont deja egales (le pari enregistre a la premiere publication
// est celui qui est fige) ; sert quand la prediction a ete enregistree avant le
// gel, apres un run sans lecture de match_premium_data, ou apres une nouvelle
// premiere publication (coup d'envoi deplace). Mutation EN PLACE ; true si la
// prediction a change.
function confBucket(conf) {
  const c = num(conf);
  if (c === null) return "<6";
  return c >= 8 ? "8+" : c >= 7 ? "7-8" : c >= 6 ? "6-7" : "<6";
}
function sameNumber(a, b) {
  const x = num(a), y = num(b);
  return x === y;
}
function alignPendingPrediction(prediction, match) {
  if (!prediction || !match || !txt(match.pari_rec) || match.no_signal === true) return false;
  if (prediction.result !== "scheduled" && prediction.result !== "pending") return false;
  if (prediction.type && prediction.type !== "single") return false;
  if (prediction.fixture_id == null || match.id == null || String(prediction.fixture_id) !== String(match.id)) return false;
  const cote = num(match.cote_rec);
  const coteValide = cote !== null && cote > 1 ? cote : null;
  const prob = num(match.model_probability);
  if (!prediction.redacted && prediction.prediction === match.pari_rec && sameNumber(prediction.cote, coteValide) && sameNumber(prediction.model_probability, prob)) return false;
  prediction.prediction = match.pari_rec;
  prediction.cote = coteValide;
  prediction.conf = match.conf != null ? match.conf : null;
  prediction.conf_bucket = confBucket(match.conf);
  prediction.model_probability = prob;
  prediction.reliability = match.reliability || null;
  prediction.market = match.market_id || match.marche || prediction.market || "autre";
  delete prediction.redacted;
  return true;
}

module.exports = {
  PICK_COLUMNS: PICK_COLUMNS,
  PREMIUM_ONLY_COLUMNS: PREMIUM_ONLY_COLUMNS,
  LIVE_PREMIUM_FIELDS: LIVE_PREMIUM_FIELDS,
  FROZEN_PAYLOAD_FIELDS: FROZEN_PAYLOAD_FIELDS,
  FROZEN_PUBLIC_FIELDS: FROZEN_PUBLIC_FIELDS,
  FROZEN_MATCH_FIELDS: FROZEN_MATCH_FIELDS,
  PREMIUM_ROW_SELECT: PREMIUM_ROW_SELECT,
  MAX_KICKOFF_SHIFT_HOURS: MAX_KICKOFF_SHIFT_HOURS,
  hasRetainedMarket: hasRetainedMarket,
  kickoffShiftHours: kickoffShiftHours,
  freezeAnalysis: freezeAnalysis,
  keptFreeDesignations: keptFreeDesignations,
  withoutFrozenCandidates: withoutFrozenCandidates,
  alignPendingPrediction: alignPendingPrediction,
};
