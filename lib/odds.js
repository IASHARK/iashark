"use strict";
// Parsing des cotes brutes api-football (medianes multi-bookmakers), extrait
// de update-data.yml pour etre reutilisable a l'identique par le pipeline
// principal ET par le job de cotes de cloture (closing-odds.yml) - une seule
// version testee au lieu de deux copies qui pourraient diverger.
//
// Refactor du 2026-09-04 (item 5, audit) : parseOdds() detruisait
// l'identite bookmaker - chaque cote acceptee etait immediatement reduite
// a un nombre anonyme dans un tableau, la mediane multi-bookmakers
// ("consensus") ecrasant silencieusement toute tracabilite individuelle.
// Aucune cote "bookmaker X @ 1.93" precise n'etait recuperable apres coup,
// ce qui interdit tout futur ROI reel base sur un prix d'EXECUTION (un
// vrai pari se place chez UN bookmaker precis, jamais "au consensus").
//
// Desormais :
//   1. extractRawOffers(o, context) construit la liste COMPLETE des cotes
//      acceptees, CHACUNE avec bookmaker_id/bookmaker_name/fixture_id/
//      market/selection/odds/captured_at - jamais reduite.
//   2. computeMarketConsensus(rawOffers) calcule SEPAREMENT la mediane par
//      (market, selection) a partir de cette liste - jamais l'inverse, la
//      liste brute n'est jamais reconstruite depuis un consensus.
//   3. parseOdds(o, context) orchestre les deux et republie EN PLUS les
//      noms de champs historiques (c1, co25, dc1x, ...) pour ne casser
//      aucun consommateur existant - ce sont des ALIAS de
//      market_consensus, jamais une troisieme source de verite.
//
// Convention stricte : un champ nomme consensus_* ou legacy (c1, co25...)
// est TOUJOURS une mediane multi-bookmakers, jamais un prix executable.
// Un prix executable (execution_price) se lit UNIQUEMENT dans raw_offers,
// jamais fabrique a partir du consensus.

// Ligne minimale acceptee pour "Total Shots" (tirs du match, tous tirs
// confondus).
//
// Le flux de cotes contient deux familles de lignes sous ce meme nom, et
// elles ne decrivent manifestement pas la meme chose :
//   - 19.5, 20.5, 21.5, 22.5, 24.5 : coherentes avec un match entier, ou
//     l'on compte une vingtaine de tirs. Le marche les price autour de
//     1.20-1.75, notre modele leur donne 63 a 84 %. Les deux s'accordent.
//   - 7.5, 8.5, 9.5, 10.5, 11.5 : incoherentes. Un match de football sous
//     12 tirs au total n'arrive pratiquement jamais, et notre modele le dit
//     - il repond 100 % a chacune de ces lignes. Or le bookmaker price
//     "over 9.5" autour de 1.60, soit 62 % : s'il s'agissait vraiment du
//     total de tirs du match, sa cote serait a 1.01. Ces lignes comptent
//     donc autre chose (un seul camp, ou une autre definition), et les
//     comparer a notre total produit un ecart de +40 points entierement
//     faux.
//
// Consequence observee sur les donnees du 03/09/2026 : 4 matchs sur 46
// etaient recommandes a "100 % de probabilite" sur ces lignes basses -
// les 4 seules recommandations du jour au-dessus de 97 %. On les ecarte a
// l'entree : elles ne sont ni modelisees, ni comparees, ni recommandables.
//
// Les tirs CADRES ne sont pas concernes : leurs lignes (4.5 a 13.5) sont
// coherentes avec un match entier et le modele s'accorde avec le marche.
const MIN_LIGNE_TIRS_MATCH = 15.5;

// Construit la liste BRUTE et COMPLETE des cotes acceptees, chacune avec
// l'identite du bookmaker qui l'a proposee. Reproduit EXACTEMENT les
// memes regles d'acceptation que l'ancien parseOdds (par marche - elles
// ne sont pas uniformes d'un marche a l'autre dans les donnees source,
// et ce n'est pas le perimetre de ce refactor de les harmoniser) : Match
// Winner accepte [1.05,15], la plupart des marches "extra"/"dynamic"
// acceptent [1.05,100], Double Chance/BTTS/Asian Handicap n'ont
// historiquement AUCUNE validation numerique.
//
// context = { fixtureId, capturedAt } (tous deux optionnels - un
// appelant qui ne les fournit pas obtient simplement null sur ces deux
// champs, jamais une valeur fabriquee).
function extractRawOffers(o, context) {
  context = context || {};
  const fixtureId = context.fixtureId != null ? context.fixtureId : null;
  const capturedAt = context.capturedAt || null;
  const offers = [];

  function record(bk, market, selection, rawOdd, options) {
    options = options || {};
    const odd = parseFloat(rawOdd);
    if (!Number.isFinite(odd)) return;
    const min = options.min != null ? options.min : -Infinity;
    const max = options.max != null ? options.max : Infinity;
    if (odd < min || odd > max) return;
    offers.push({
      bookmaker_id: bk && bk.id != null ? bk.id : null,
      bookmaker_name: bk && bk.name ? bk.name : null,
      fixture_id: fixtureId,
      market,
      selection,
      odds: odd,
      captured_at: capturedAt,
    });
  }

  (o && o.bookmakers ? o.bookmakers : []).forEach((bk) => {
    (bk.bets || []).forEach((bet) => {
      if (bet.name === "Match Winner" || bet.name === "Home/Draw/Away") {
        const hm = (bet.values || []).find((v) => v.value === "Home");
        const dr = (bet.values || []).find((v) => v.value === "Draw");
        const aw = (bet.values || []).find((v) => v.value === "Away");
        if (hm) record(bk, "1x2", "home", hm.odd, { min: 1.05, max: 15 });
        if (dr) record(bk, "1x2", "draw", dr.odd, { min: 1.05, max: 15 });
        if (aw) record(bk, "1x2", "away", aw.odd, { min: 1.05, max: 15 });
      }
      // MARKET LAB PHASE 2.5 (2026-09-05, item 1) : extension a 0.5/1.5/2.5/
      // 3.5/4.5 (les DEUX cotes) - audit reel contre 62 snapshots Supabase
      // (odds_snapshots) confirme que l'API renvoie deja "Over 0.5"/
      // "Under 0.5", "Under 1.5" et "Over 4.5"/"Under 4.5" (9-10
      // bookmakers, 34 fixtures), simplement jamais extraits jusqu'ici -
      // aucune nouvelle donnee, seulement une extraction plus complete de
      // ce que le payload contenait deja.
      if (bet.name === "Goals Over/Under") {
        (bet.values || []).forEach((v) => {
          const match = /^(Over|Under)\s+(0\.5|1\.5|2\.5|3\.5|4\.5)$/.exec(v.value || "");
          if (!match) return;
          record(bk, "goals_ou", `${match[1].toLowerCase()}_${match[2]}`, v.odd);
        });
      }
      if (bet.name === "Double Chance") {
        const d1x = (bet.values || []).find((v) => v.value === "Home/Draw");
        const dx2 = (bet.values || []).find((v) => v.value === "Draw/Away");
        const d12 = (bet.values || []).find((v) => v.value === "Home/Away");
        if (d1x) record(bk, "double_chance", "1x", d1x.odd);
        if (dx2) record(bk, "double_chance", "x2", dx2.odd);
        if (d12) record(bk, "double_chance", "12", d12.odd);
      }
      if (bet.name === "Both Teams Score") {
        const by = (bet.values || []).find((v) => v.value === "Yes");
        const bn = (bet.values || []).find((v) => v.value === "No");
        if (by) record(bk, "btts", "yes", by.odd);
        if (bn) record(bk, "btts", "no", bn.odd);
      }
      if (bet.name === "Asian Handicap") {
        (bet.values || []).forEach((v) => {
          const val = (v.value || "").toLowerCase();
          if (val.includes("home") && val.includes("-0.5")) record(bk, "asian_handicap", "home_-0.5", v.odd);
          if (val.includes("away") && val.includes("+0.5")) record(bk, "asian_handicap", "away_+0.5", v.odd);
        });
      }
      // BUG REEL (verifie le 02/09/2026 contre 29 snapshots de cotes) :
      // le code cherchait "Home Team Total Goals", nom qu'API-Football ne
      // renvoie JAMAIS. Le marche s'appelle "Total - Home". Consequence : le
      // total de buts par equipe n'a jamais ete recupere depuis la mise en
      // service, silencieusement - aucune erreur, juste un marche absent.
      // Les valeurs internes ("Over 1.5"/"Under 1.5") etaient bonnes, elles.
      // MARKET LAB PHASE 2.5 (2026-09-05, item 1) : extension a 0.5/1.5/
      // 2.5/3.5 (memes 62 snapshots reels audites : 0.5/2.5/3.5 sont deja
      // presentes dans le payload, 10 bookmakers/33-34 fixtures chacune,
      // simplement jamais extraites). Cle de marche INCHANGEE pour 1.5
      // (home_over15/home_under15) - compatibilite ascendante stricte.
      if (bet.name === "Total - Home" || bet.name === "Home Team Total Goals") {
        (bet.values || []).forEach((v) => {
          const match = /^(Over|Under)\s+(0\.5|1\.5|2\.5|3\.5)$/.exec(v.value || "");
          if (!match) return;
          record(bk, `home_${match[1].toLowerCase()}${match[2].replace(".", "")}`, "yes", v.odd, { min: 1.05, max: 100 });
        });
      }
      // Meme bug que ci-dessus : "Total - Away", jamais "Away Team Total Goals".
      if (bet.name === "Total - Away" || bet.name === "Away Team Total Goals") {
        (bet.values || []).forEach((v) => {
          const match = /^(Over|Under)\s+(0\.5|1\.5|2\.5|3\.5)$/.exec(v.value || "");
          if (!match) return;
          record(bk, `away_${match[1].toLowerCase()}${match[2].replace(".", "")}`, "yes", v.odd, { min: 1.05, max: 100 });
        });
      }
      if (bet.name === "Win to Nil - Home") {
        (bet.values || []).forEach((v) => { if (v.value === "Yes") record(bk, "home_win_to_nil", "yes", v.odd, { min: 1.05, max: 100 }); });
      }
      if (bet.name === "Win to Nil - Away") {
        (bet.values || []).forEach((v) => { if (v.value === "Yes") record(bk, "away_win_to_nil", "yes", v.odd, { min: 1.05, max: 100 }); });
      }
      // Clean Sheet - Home/Away (bet_id 27/28, confirmes reellement observes
      // chez nos bookmakers echantillonnes - voir market-audit-classification.json).
      if (bet.name === "Clean Sheet - Home") {
        (bet.values || []).forEach((v) => { if (v.value === "Yes") record(bk, "home_clean_sheet", "yes", v.odd, { min: 1.05, max: 100 }); });
      }
      if (bet.name === "Clean Sheet - Away") {
        (bet.values || []).forEach((v) => { if (v.value === "Yes") record(bk, "away_clean_sheet", "yes", v.odd, { min: 1.05, max: 100 }); });
      }
      if (bet.name === "Result/Total Goals") {
        const resultKeys = { Home: "home", Away: "away" };
        (bet.values || []).forEach((v) => {
          const match = /^(Home|Away)\/(Over|Under) (1\.5|2\.5|3\.5)$/.exec(v.value || "");
          if (!match) return;
          const line = match[3].replace(".", "");
          record(bk, resultKeys[match[1]] + "_win_" + match[2].toLowerCase() + line, "yes", v.odd, { min: 1.05, max: 100 });
        });
      }
      if (bet.name === "Goals Over/Under First Half") {
        (bet.values || []).forEach((v) => {
          if (v.value === "Over 0.5") record(bk, "fh_over05", "yes", v.odd, { min: 1.05, max: 100 });
          if (v.value === "Under 0.5") record(bk, "fh_under05", "yes", v.odd, { min: 1.05, max: 100 });
          if (v.value === "Over 1.5") record(bk, "fh_over15", "yes", v.odd, { min: 1.05, max: 100 });
          if (v.value === "Under 1.5") record(bk, "fh_under15", "yes", v.odd, { min: 1.05, max: 100 });
        });
      }
      if (bet.name === "Win Both Halves") {
        (bet.values || []).forEach((v) => {
          if (/^home$/i.test(v.value || "")) record(bk, "home_win_both_halves", "yes", v.odd, { min: 1.05, max: 100 });
          if (/^away$/i.test(v.value || "")) record(bk, "away_win_both_halves", "yes", v.odd, { min: 1.05, max: 100 });
        });
      }
      if (bet.name === "Total Shots") {
        (bet.values || []).forEach((v) => {
          const match = /^(Over|Under)\s+(\d+(?:\.\d+)?)$/i.exec(v.value || "");
          if (!match) return;
          const line = Number(match[2]);
          if (line < MIN_LIGNE_TIRS_MATCH) return;
          record(bk, "total-shots", match[1].toLowerCase() + "_" + line, v.odd, { min: 1.05, max: 100 });
        });
      }
      if (bet.name === "Total ShotOnGoal") {
        (bet.values || []).forEach((v) => {
          const match = /^(Over|Under)\s+(\d+(?:\.\d+)?)$/i.exec(v.value || "");
          if (!match) return;
          const line = Number(match[2]);
          record(bk, "total-shots-on-target", match[1].toLowerCase() + "_" + line, v.odd, { min: 1.05, max: 100 });
        });
      }
    });
  });

  return offers;
}

// Calcule la mediane par (market, selection) a partir d'une liste de
// cotes BRUTES DEJA construite - jamais l'inverse. C'est la SEULE
// fonction de ce module qui a le droit de fusionner plusieurs bookmakers
// en un seul chiffre ; en dehors d'elle, une cote reste toujours
// attachee a son bookmaker.
function computeMarketConsensus(rawOffers) {
  const buckets = new Map();
  for (const offer of rawOffers) {
    const key = offer.market + "|" + offer.selection;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(offer.odds);
  }
  const consensus = {};
  for (const [key, values] of buckets) {
    const [market, selection] = key.split("|");
    const sorted = values.slice().sort((x, y) => x - y);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    if (!consensus[market]) consensus[market] = {};
    consensus[market][selection] = { median: Number(median.toFixed(2)), n_bookmakers: values.length };
  }
  return consensus;
}

function consensusValue(consensus, market, selection) {
  return consensus[market] && consensus[market][selection] ? consensus[market][selection].median.toFixed(2) : "--";
}

// API historique preservee a l'identique (memes noms de champs, meme
// format string ".toFixed(2)" ou "--") - reconstruite comme un ALIAS de
// market_consensus, jamais une source de calcul independante.
function parseOdds(o, context) {
  const empty = { c1: "--", cn: "--", c2: "--", co15: "--", co25: "--", cu25: "--", dc1x: "--", dc2x: "--", dc12: "--", btts_oui: "--", btts_non: "--", dynamic_count_offers: [], raw_offers: [], market_consensus: {} };
  if (!o || !o.bookmakers || !o.bookmakers.length) return empty;

  const rawOffers = extractRawOffers(o, context);
  const consensus = computeMarketConsensus(rawOffers);

  const parsed = {
    c1: consensusValue(consensus, "1x2", "home"),
    cn: consensusValue(consensus, "1x2", "draw"),
    c2: consensusValue(consensus, "1x2", "away"),
    co15: consensusValue(consensus, "goals_ou", "over_1.5"),
    co25: consensusValue(consensus, "goals_ou", "over_2.5"),
    cu25: consensusValue(consensus, "goals_ou", "under_2.5"),
    co35: consensusValue(consensus, "goals_ou", "over_3.5"),
    cu35: consensusValue(consensus, "goals_ou", "under_3.5"),
    dc1x: consensusValue(consensus, "double_chance", "1x"),
    dc2x: consensusValue(consensus, "double_chance", "x2"),
    dc12: consensusValue(consensus, "double_chance", "12"),
    btts_oui: consensusValue(consensus, "btts", "yes"),
    btts_non: consensusValue(consensus, "btts", "no"),
    ah_dom: consensusValue(consensus, "asian_handicap", "home_-0.5"),
    ah_ext: consensusValue(consensus, "asian_handicap", "away_+0.5"),
  };
  // Marches "extra" (un seul selection="yes" par marche) : republies sous
  // leur nom de marche directement, comme le faisait l'ancien extra[key].
  for (const market of Object.keys(consensus)) {
    if (["1x2", "goals_ou", "double_chance", "btts", "asian_handicap", "total-shots", "total-shots-on-target"].includes(market)) continue;
    parsed[market] = consensusValue(consensus, market, "yes");
  }

  const countMarketOrder = { "total-shots": 0, "total-shots-on-target": 1 };
  const dynamicKeys = [];
  for (const market of ["total-shots", "total-shots-on-target"]) {
    if (!consensus[market]) continue;
    for (const selection of Object.keys(consensus[market])) dynamicKeys.push(market + "|" + selection);
  }
  parsed.dynamic_count_offers = dynamicKeys.sort((a, b) => {
    const ap = a.split("|"), bp = b.split("|");
    const aLine = Number(ap[1].split("_")[1]), bLine = Number(bp[1].split("_")[1]);
    const aSide = ap[1].split("_")[0], bSide = bp[1].split("_")[0];
    return (countMarketOrder[ap[0]] - countMarketOrder[bp[0]]) || (aLine - bLine) || aSide.localeCompare(bSide);
  }).map((key) => {
    const [market, selection] = key.split("|");
    const [side, line] = selection.split("_");
    return { market, side, line: Number(line), odds: consensus[market][selection].median };
  });

  parsed.raw_offers = rawOffers;
  parsed.market_consensus = consensus;
  return parsed;
}

module.exports = { parseOdds, extractRawOffers, computeMarketConsensus };
