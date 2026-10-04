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
//    SAUF si l'heure d'origine est deja passee (ronde 5, voir POSTPONED_CLOSED) ;
//  - match reporte APRES l'heure d'origine du pari de l'historique -> POSTPONED_CLOSED :
//    aucun nouveau pari publie, et le pari en attente est annule
//    (voidPostponedPrediction), comme pour un match au statut PST ;
//  - ligne premium deja fermee comme « reporte » par un run precedent (marque
//    SKIPPED_KICKOFF_POSTPONED) -> POSTPONED_CLOSED a chaque run suivant
//    (PREVIOUS_POSTPONED), meme si le pari A est sorti de historique.json.
//
// Tout est pur (aucune E/S, entrees jamais modifiees) sauf alignPendingPrediction
// et voidPostponedPrediction qui, comme l'historique du pipeline, completent une
// prediction EN PLACE.

const PREMIUM = require("./premium-fields.js");
const { kickoffGate, closeMatchForPick, parisLocalToMs, KICKOFF_MARGIN_MINUTES } = require("./kickoff-guard.js");

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
//    joueur blesse depuis la publication ne doit pas rester mis en avant) ;
//  - v3_suivi : voyant de composition et alertes de cote du moteur v3
//    (lib/moteur-v3.js, absent tant que MOTEUR_V3 est eteint) ;
//  - v3_buteurs : buteurs du moteur v3 (01/10/2026), suivent les compositions comme top_scorers ;
//  - v3_premiers_buteurs : premier buteur le plus probable (04/10/2026), meme regle (jamais un
//    joueur annonce absent depuis la publication) ;
//  - stats_iashark : faits descriptifs (profils equipes, ligue, arbitre), jamais l'analyse du pari.
//    Recalcule a chaque run (04/10/2026, controle du mathematicien : l'arbitre revenait chez les
//    Pro par le gel, recopie de la ligne publiee, sans feu vert ni arbitre lu avant le match).
const LIVE_PREMIUM_FIELDS = ["dropping_odds", "player_markets", "top_scorers", "v3_suivi", "v3_buteurs", "v3_premiers_buteurs", "stats_iashark"];
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
//   KICKOFF_CLOSED | PREVIOUS_UNKNOWN | POSTPONED_CLOSED (match reporte apres
//   l'heure d'origine : aucun nouveau pari, voir plus bas).
function analyseDuJour(fresh, previous, opts) {
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
  // Match deja ferme comme reporte (avocat du diable, ronde 5, preuve S3b) : le 1er
  // run a vide la ligne premium (closeMatchForPick) en y laissant la marque
  // SKIPPED_KICKOFF_POSTPONED. Sans cette lecture, le 2e run y voyait une ligne
  // « sans pari » et publiait un nouveau pari C des que le pari A etait sorti de
  // historique.json (500 paris, environ 27 jours).
  if (isPostponedMark(previous)) return postponedClosed(fresh, row, "PREVIOUS_POSTPONED");
  if (!hasRetainedMarket(previous)) return firstPublication(fresh, row, nowIso, "PREVIOUS_WITHOUT_PICK");
  const meta = freezeMetaOf(previous);
  // JAMAIS AFFICHEE = RIEN A GELER (23/09/2026). Une analyse publiee avec
  // model_output_available === false n'apparait pas sur la page : le visiteur
  // lit « donnees insuffisantes », jamais le pari. La geler reviendrait a
  // rendre une correction du calcul invisible jusqu'au coup d'envoi - c'est ce
  // qui est arrive aux 16 matchs de Ligue des nations des 24 et 25/09. Elle est
  // donc recalculee avec les donnees du jour. Le gel protege ce qui a ete VU.
  const publieVisible = function (snap) { return !snap || snap.model_output_available !== false; };
  if (!publieVisible(meta && meta.public) || !publieVisible(opts.previousPublic)) {
    return firstPublication(fresh, row, nowIso, "PREVIOUS_NOT_DISPLAYED");
  }
  const refKickoff = txt(meta && meta.kickoff) || txt(opts.previousPublic && opts.previousPublic.date);
  const shift = kickoffShiftHours(refKickoff, fresh.date);
  if (shift !== null && shift > MAX_KICKOFF_SHIFT_HOURS) {
    // Nouvelle date connue APRES l'heure d'origine (ronde 5) : le pari de l'historique
    // est deja verrouille a cette heure, il ne peut plus suivre un nouveau pari.
    const koOrigine = parisLocalToMs(refKickoff);
    if (koOrigine !== null && nowMs >= koOrigine) return postponedClosed(fresh, row, "KICKOFF_MOVED_AFTER_KICKOFF");
    return firstPublication(fresh, row, nowIso, "KICKOFF_MOVED");
  }
  // EXCEPTION AU GEL (decision de Clement du 04/10/2026) : un pari publie sur un marche non verifie
  // (ex. « tirs du match ») ou sans aucune cote reelle n'est PAS conserve : le match repart en premiere
  // publication et recoit le pari de la regle du jour (lib/pronostic.js#publierPronostics). Seulement
  // avant le coup d'envoi (garde ouverte, plus haut). La trace de l'ancien pari (remplacement) part
  // dans la ligne premium (raw_response.remplacement, privee) et dans l'historique public, ou elle
  // reste masquee jusqu'au coup d'envoi : rien n'est efface en silence.
  // opts.exceptionGel(previous) -> motif (« marche_non_verifie », « sans_cote ») ou null.
  const motifEx = typeof opts.exceptionGel === "function" ? opts.exceptionGel(previous) : null;
  if (motifEx) {
    const remplacement = { motif: String(motifEx), le: nowIso, ancien: ancienPari(previous, meta) };
    const out = firstPublication(fresh, row, nowIso, "GEL_EXCEPTION");
    if (out.premiumRow) {
      out.premiumRow = Object.assign({}, out.premiumRow, { raw_response: Object.assign({}, rawResponseOf(out.premiumRow) || {}, { remplacement: remplacement }) });
    }
    out.match.remplacement_gel = remplacement;
    out.remplacement = remplacement;
    return out;
  }
  return frozen(fresh, previous, row, nowIso, meta, refKickoff, opts.previousPublic || null);
}

// L'ancien pari publie (celui qu'ont vu les abonnes), pour la trace d'une exception au gel.
function ancienPari(previous, meta) {
  const cote = num(previous && previous.cote_rec);
  return {
    prediction: txt(previous && previous.pari_rec),
    market: txt(previous && previous.market_id) || txt(previous && previous.marche),
    cote: cote !== null && cote > 1 ? cote : null,
    model_probability: num(previous && previous.model_probability),
    publie_le: (meta && isoOf(meta.frozen_at)) || isoOf(previous && previous.updated_at) || null,
  };
}

// MATCH REPORTE APRES L'HEURE PREVUE (avocat du diable, ronde 4.2 ; corrige ronde 5,
// 30/09/2026). L'historique (historique.json, predictions_archive) garde UNE ligne par
// match, et la base la verrouille a l'heure d'origine du pari (migration 0035 : le
// pipeline n'envoie jamais de nouveau kickoff_at). Apres cette heure, un nouveau pari
// B publie sur la page n'entrerait jamais dans l'historique : la page montrerait B et
// le reglement jugerait A sur le match rejoue. Regle prudente, comme le statut PST et
// la plupart des bookmakers : AUCUN nouveau pari sur ce match, et le pari A encore en
// attente est annule (voidPostponedPrediction). Seul cas garde : le pari fige A, encore
// en attente dans l'historique (retard de moins de 24 h) : page et historique ont alors
// le meme pari.
// opts.historyLock : { kickoffMs, result } de la ligne d'historique du match
// (historyLocks : historique.json, puis predictions_archive), absent si le match
// n'y est pas. Tant qu'il reste au calcul, un match ferme ici le reste aux runs
// suivants grace a la marque de sa ligne premium (isPostponedMark), meme sans ligne
// d'historique relue.
const POSTPONED_REASON = "KICKOFF_POSTPONED";
// Marque laissee dans la ligne premium par closeMatchForPick (raw_response.explanation_status).
const POSTPONED_MARK = "SKIPPED_" + POSTPONED_REASON;
const SETTLED_RESULTS = ["win", "loss", "void"];
function isPostponedMark(row) {
  const raw = rawResponseOf(row);
  return !!raw && raw.explanation_status === POSTPONED_MARK && !hasRetainedMarket(row);
}
function postponedClosed(fresh, row, reason) {
  const match = Object.assign({}, fresh);
  const premiumRow = row ? Object.assign({}, row) : row;
  closeMatchForPick(match, premiumRow, PREMIUM.PREMIUM_FIELDS, POSTPONED_REASON);
  match.no_signal_label = "Match reporté : aucun pronostic";
  delete match.pick_frozen_at;
  return result("POSTPONED_CLOSED", reason, match, premiumRow);
}
function freezeAnalysis(fresh, previous, opts) {
  opts = opts || {};
  const out = analyseDuJour(fresh, previous, opts);
  const lock = opts.historyLock;
  if (!lock || ["NO_MATCH", "KICKOFF_CLOSED", "FROZEN_CLOSED", "POSTPONED_CLOSED"].indexOf(out.status) !== -1) return out;
  const nowMs = num(opts.nowMs) !== null ? num(opts.nowMs) : Date.now();
  const ko = num(lock.kickoffMs);
  // Pari deja regle (annule par le statut PST, par exemple) et match de nouveau a venir.
  if (SETTLED_RESULTS.indexOf(lock.result) !== -1) return postponedClosed(fresh, opts.premiumRow || null, "HISTORY_SETTLED");
  // Heure d'origine passee : seul le pari fige (le meme que l'historique) peut rester.
  if (ko !== null && nowMs >= ko && out.status !== "FROZEN") return postponedClosed(fresh, opts.premiumRow || null, "HISTORY_LOCKED");
  return out;
}

// { "<fixture_id>": { kickoffMs, result } } : la ligne d'historique de chaque match
// (predictions simples ; la plus recente d'abord, comme l'ajout du pipeline).
// archiveRows (avocat du diable, ronde 5) : lignes de predictions_archive (sans
// plafond) des matchs absents de historique.json, qui ne garde que 500 paris
// (environ 27 jours). Le fichier passe toujours en premier ; l'archive complete.
function historyLocks(predictions, archiveRows) {
  const out = {};
  const lignes = (Array.isArray(predictions) ? predictions : []).concat(Array.isArray(archiveRows) ? archiveRows : []);
  lignes.forEach(function (p) {
    if (!p || p.fixture_id == null || (p.type && p.type !== "single")) return;
    const k = String(p.fixture_id);
    if (out[k]) return;
    const t = Date.parse(String(p.kickoff_at || ""));
    out[k] = { kickoffMs: Number.isFinite(t) ? t : null, result: txt(p.result) };
  });
  return out;
}

// Pari en attente d'un match ferme par POSTPONED_CLOSED : annule (result void, sans
// score), comme un match au statut PST. Jamais un pari masque non relu (meme regle
// que le reglement). Mutation EN PLACE ; true si la prediction a change.
function voidPostponedPrediction(prediction, match, opts) {
  opts = opts || {};
  if (!prediction || !match || match.no_signal_reason !== POSTPONED_REASON) return false;
  if (prediction.result !== "scheduled" && prediction.result !== "pending") return false;
  if (prediction.type && prediction.type !== "single") return false;
  if (prediction.redacted) return false;
  if (prediction.fixture_id == null || match.id == null || String(prediction.fixture_id) !== String(match.id)) return false;
  prediction.result = "void";
  prediction.score = null;
  prediction.reporte = true;
  prediction.resolved_date = txt(opts.today) || new Date().toISOString().slice(0, 10);
  return true;
}

// REGLEMENT D'UN MATCH REPORTE OU ANNULE (04/10/2026, « tout match reporte est traite »).
// prediction : ligne d'historique (kickoff_at = heure d'origine du coup d'envoi, ISO, posee au
// premier archivage ; date = jour ou le pari a ete enregistre, PAS le jour du match).
// fixture : element api-football ({ fixture: { status: { short }, timestamp, date } }).
// -> "reporte" | "annule" | null :
//  - statut PST -> reporte ; CANC ou ABD -> annule (meme liste que le reglement depuis le 14/09) ;
//  - match REPROGRAMME : coup d'envoi actuel plus de MAX_KICKOFF_SHIFT_HOURS apres l'heure
//    d'origine du pari, quel que soit son statut (a venir ou deja rejoue) -> reporte, comme
//    POSTPONED_CLOSED : le pari A n'est jamais regle sur le match rejoue. Sans heure d'origine
//    (lignes anciennes), seul le statut compte (jamais devine).
// Le pari annule pour report est marque reporte : true ; son pari reste masque dans
// historique.json (lib/premium-fields.js#redactPendingPredictions) : le match peut encore se jouer.
const STATUTS_REPORT = ["PST"];
const STATUTS_ANNULATION = ["CANC", "ABD"];
function motifAnnulation(prediction, fixture) {
  const core = fixture && isPlainObject(fixture.fixture) ? fixture.fixture : fixture;
  if (!core || typeof core !== "object") return null;
  const st = String((core.status && core.status.short) || (typeof core.status === "string" ? core.status : "") || "").toUpperCase();
  if (STATUTS_REPORT.indexOf(st) !== -1) return "reporte";
  if (STATUTS_ANNULATION.indexOf(st) !== -1) return "annule";
  const origine = Date.parse(String((prediction && prediction.kickoff_at) || ""));
  const ts = num(core.timestamp);
  const actuel = ts !== null ? ts * 1000 : Date.parse(String(core.date || ""));
  if (Number.isFinite(origine) && Number.isFinite(actuel) && actuel - origine > MAX_KICKOFF_SHIFT_HOURS * 3600000) return "reporte";
  return null;
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
// opts (historique-public, 29/09/2026) : { moteur, moteur_version } du pari
// publie (le moteur suit le pari realigne), { kickoffMs, nowMs } : jamais de
// realignement une fois le coup d'envoi passe (l'archive est alors verrouillee).
function alignPendingPrediction(prediction, match, opts) {
  opts = opts || {};
  if (!prediction || !match || !txt(match.pari_rec) || match.no_signal === true) return false;
  if (prediction.result !== "scheduled" && prediction.result !== "pending") return false;
  if (prediction.type && prediction.type !== "single") return false;
  if (prediction.fixture_id == null || match.id == null || String(prediction.fixture_id) !== String(match.id)) return false;
  const ko = num(opts.kickoffMs), maintenant = num(opts.nowMs) !== null ? num(opts.nowMs) : Date.now();
  if (ko !== null && maintenant >= ko) return false;
  // MATCH REPORTE (avocat du diable, ronde 4.2, 30/09/2026) : le pipeline ecrit
  // kickoff_at une seule fois (premier archivage) et ne l'envoie jamais mis a jour.
  // La base (migration 0035) verrouille donc la ligne a CETTE heure d'origine. Si le
  // match est reporte, opts.kickoffMs (nouvelle date) est plus tard : sans cette
  // garde, le pari local etait realigne apres l'heure d'origine, la base gardait
  // l'ancien pari et recevait le resultat du nouveau (deux paris melanges). On
  // s'arrete donc aussi a l'heure d'origine : meme verrou que la base.
  const koOrigine = Date.parse(String(prediction.kickoff_at || ""));
  if (Number.isFinite(koOrigine) && maintenant >= koOrigine) return false;
  const cote = num(match.cote_rec);
  const coteValide = cote !== null && cote > 1 ? cote : null;
  const prob = num(match.model_probability);
  const moteur = opts.moteur === "v3" || opts.moteur === "ancien" ? opts.moteur : null;
  const memeMoteur = !moteur || (prediction.moteur === moteur && (prediction.moteur_version || null) === (opts.moteur_version || null));
  if (!prediction.redacted && memeMoteur && prediction.prediction === match.pari_rec && sameNumber(prediction.cote, coteValide) && sameNumber(prediction.model_probability, prob)) return false;
  if (moteur) { prediction.moteur = moteur; prediction.moteur_version = opts.moteur_version || null; }
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
  POSTPONED_REASON: POSTPONED_REASON,
  POSTPONED_MARK: POSTPONED_MARK,
  isPostponedMark: isPostponedMark,
  historyLocks: historyLocks,
  voidPostponedPrediction: voidPostponedPrediction,
  motifAnnulation: motifAnnulation,
  ancienPari: ancienPari,
};
