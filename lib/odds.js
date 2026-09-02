"use strict";
// Parsing des cotes brutes api-football (medianes multi-bookmakers), extrait
// de update-data.yml pour etre reutilisable a l'identique par le pipeline
// principal ET par le job de cotes de cloture (closing-odds.yml) - une seule
// version testee au lieu de deux copies qui pourraient diverger.

function parseOdds(o) {
  const empty = { c1: "--", cn: "--", c2: "--", co15: "--", co25: "--", cu25: "--", dc1x: "--", dc2x: "--", dc12: "--", btts_oui: "--", btts_non: "--", dynamic_count_offers: [] };
  if (!o || !o.bookmakers || !o.bookmakers.length) return empty;
  const arr1 = [], arrN = [], arr2 = [], arr15 = [], arr25 = [], arru25 = [], arr35 = [], arru35 = [], arr1x = [], arrx2 = [], arr12 = [], arrby = [], arrbn = [], arrAHH = [], arrAHA = [];
  const extra = {};
  const dynamic = {};
  function addExtra(key, value) {
    const odd = parseFloat(value && value.odd);
    if (!Number.isFinite(odd) || odd < 1.05 || odd > 100) return;
    (extra[key] || (extra[key] = [])).push(odd);
  }
  function addDynamic(market, value) {
    const match = /^(Over|Under)\s+(\d+(?:\.\d+)?)$/i.exec(value && value.value || "");
    const odd = parseFloat(value && value.odd);
    if (!match || !Number.isFinite(odd) || odd < 1.05 || odd > 100) return;
    const side = match[1].toLowerCase();
    const line = Number(match[2]);
    const key = market + "|" + side + "|" + line;
    (dynamic[key] || (dynamic[key] = [])).push(odd);
  }
  o.bookmakers.forEach((bk) => {
    (bk.bets || []).forEach((bet) => {
      if (bet.name === "Match Winner" || bet.name === "Home/Draw/Away") {
        const hm = (bet.values || []).find((v) => v.value === "Home");
        const dr = (bet.values || []).find((v) => v.value === "Draw");
        const aw = (bet.values || []).find((v) => v.value === "Away");
        if (hm && parseFloat(hm.odd) >= 1.05 && parseFloat(hm.odd) <= 15) arr1.push(parseFloat(hm.odd));
        if (dr && parseFloat(dr.odd) >= 1.05 && parseFloat(dr.odd) <= 15) arrN.push(parseFloat(dr.odd));
        if (aw && parseFloat(aw.odd) >= 1.05 && parseFloat(aw.odd) <= 15) arr2.push(parseFloat(aw.odd));
      }
      if (bet.name === "Goals Over/Under") {
        (bet.values || []).forEach((v) => {
          if (v.value === "Over 1.5") arr15.push(parseFloat(v.odd));
          if (v.value === "Over 2.5") arr25.push(parseFloat(v.odd));
          if (v.value === "Under 2.5") arru25.push(parseFloat(v.odd));
          if (v.value === "Over 3.5") arr35.push(parseFloat(v.odd));
          if (v.value === "Under 3.5") arru35.push(parseFloat(v.odd));
        });
      }
      if (bet.name === "Double Chance") {
        const d1x = (bet.values || []).find((v) => v.value === "Home/Draw");
        const dx2 = (bet.values || []).find((v) => v.value === "Draw/Away");
        const d12 = (bet.values || []).find((v) => v.value === "Home/Away");
        if (d1x) arr1x.push(parseFloat(d1x.odd));
        if (dx2) arrx2.push(parseFloat(dx2.odd));
        if (d12) arr12.push(parseFloat(d12.odd));
      }
      if (bet.name === "Both Teams Score") {
        const by = (bet.values || []).find((v) => v.value === "Yes");
        const bn = (bet.values || []).find((v) => v.value === "No");
        if (by) arrby.push(parseFloat(by.odd));
        if (bn) arrbn.push(parseFloat(bn.odd));
      }
      if (bet.name === "Asian Handicap") {
        (bet.values || []).forEach((v) => {
          const val = (v.value || "").toLowerCase();
          if (val.includes("home") && val.includes("-0.5")) arrAHH.push(parseFloat(v.odd));
          if (val.includes("away") && val.includes("+0.5")) arrAHA.push(parseFloat(v.odd));
        });
      }
      // BUG REEL (verifie le 02/09/2026 contre 29 snapshots de cotes) :
      // le code cherchait "Home Team Total Goals", nom qu'API-Football ne
      // renvoie JAMAIS. Le marche s'appelle "Total - Home". Consequence : le
      // total de buts par equipe n'a jamais ete recupere depuis la mise en
      // service, silencieusement - aucune erreur, juste un marche absent.
      // Les valeurs internes ("Over 1.5"/"Under 1.5") etaient bonnes, elles.
      if (bet.name === "Total - Home" || bet.name === "Home Team Total Goals") {
        (bet.values || []).forEach((v) => {
          if (v.value === "Over 1.5") addExtra("home_over15", v);
          if (v.value === "Under 1.5") addExtra("home_under15", v);
        });
      }
      // Meme bug que ci-dessus : "Total - Away", jamais "Away Team Total Goals".
      if (bet.name === "Total - Away" || bet.name === "Away Team Total Goals") {
        (bet.values || []).forEach((v) => {
          if (v.value === "Over 1.5") addExtra("away_over15", v);
          if (v.value === "Under 1.5") addExtra("away_under15", v);
        });
      }
      if (bet.name === "Win to Nil - Home") {
        (bet.values || []).forEach((v) => { if (v.value === "Yes") addExtra("home_win_to_nil", v); });
      }
      if (bet.name === "Win to Nil - Away") {
        (bet.values || []).forEach((v) => { if (v.value === "Yes") addExtra("away_win_to_nil", v); });
      }
      // Clean Sheet - Home/Away (bet_id 27/28, confirmes reellement observes
      // chez nos bookmakers echantillonnes - voir market-audit-classification.json).
      if (bet.name === "Clean Sheet - Home") {
        (bet.values || []).forEach((v) => { if (v.value === "Yes") addExtra("home_clean_sheet", v); });
      }
      if (bet.name === "Clean Sheet - Away") {
        (bet.values || []).forEach((v) => { if (v.value === "Yes") addExtra("away_clean_sheet", v); });
      }
      if (bet.name === "Result/Total Goals") {
        const resultKeys = { Home: "home", Away: "away" };
        (bet.values || []).forEach((v) => {
          const match = /^(Home|Away)\/(Over|Under) (1\.5|2\.5|3\.5)$/.exec(v.value || "");
          if (!match) return;
          const line = match[3].replace(".", "");
          addExtra(resultKeys[match[1]] + "_win_" + match[2].toLowerCase() + line, v);
        });
      }
      if (bet.name === "Goals Over/Under First Half") {
        (bet.values || []).forEach((v) => {
          if (v.value === "Over 0.5") addExtra("fh_over05", v);
          if (v.value === "Under 0.5") addExtra("fh_under05", v);
          if (v.value === "Over 1.5") addExtra("fh_over15", v);
          if (v.value === "Under 1.5") addExtra("fh_under15", v);
        });
      }
      if (bet.name === "Win Both Halves") {
        (bet.values || []).forEach((v) => {
          if (/^home$/i.test(v.value || "")) addExtra("home_win_both_halves", v);
          if (/^away$/i.test(v.value || "")) addExtra("away_win_both_halves", v);
        });
      }
      if (bet.name === "Total Shots") (bet.values || []).forEach((v) => addDynamic("total-shots", v));
      if (bet.name === "Total ShotOnGoal") (bet.values || []).forEach((v) => addDynamic("total-shots-on-target", v));
    });
  });
  function med(a) {
    if (!a.length) return "--";
    const s = a.slice().sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2).toFixed(2);
  }
  const c1 = med(arr1), cn = med(arrN), c2 = med(arr2);
  const co15 = med(arr15), co25 = med(arr25), cu25 = med(arru25);
  const dc1x = med(arr1x), dc2x = med(arrx2), dc12 = med(arr12);
  const btts_oui = med(arrby), btts_non = med(arrbn);
  const ah_dom = med(arrAHH), ah_ext = med(arrAHA);
  const parsed = { c1, cn, c2, co15, co25, cu25, co35: med(arr35), cu35: med(arru35), dc1x, dc2x, dc12, btts_oui, btts_non, ah_dom, ah_ext };
  Object.keys(extra).forEach((key) => { parsed[key] = med(extra[key]); });
  const countMarketOrder = { "total-shots": 0, "total-shots-on-target": 1 };
  parsed.dynamic_count_offers = Object.keys(dynamic).sort((a, b) => {
    const ap = a.split("|"), bp = b.split("|");
    return (countMarketOrder[ap[0]] - countMarketOrder[bp[0]]) || Number(ap[2]) - Number(bp[2]) || ap[1].localeCompare(bp[1]);
  }).map((key) => {
    const parts = key.split("|");
    return { market: parts[0], side: parts[1], line: Number(parts[2]), odds: Number(med(dynamic[key])) };
  });
  return parsed;
}

module.exports = { parseOdds };
