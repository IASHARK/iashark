"use strict";
// Parsing des cotes brutes api-football (medianes multi-bookmakers), extrait
// de update-data.yml pour etre reutilisable a l'identique par le pipeline
// principal ET par le job de cotes de cloture (closing-odds.yml) - une seule
// version testee au lieu de deux copies qui pourraient diverger.

// Lignes reelles offertes sur "Total - Home"/"Total - Away" (verifie en
// session live, /odds?fixture=X reel) - memes lignes que homeTotalLines dans
// lib/markets/score-matrix.js#deriveMarketsFromMatrix, pour que le modele et
// la cote parlent toujours de la meme ligne.
const TEAM_TOTAL_LINES = [0.5, 1.5, 2.5, 3.5];

// bet_id 25 "Result/Total Goals" et bet_id 24 "Results/Both Teams Score" -
// valeurs reelles confirmees en direct ("Home/Over 2.5", "Home/Yes", etc).
const COMBO_RESULT_KEYS = { Home: "home", Draw: "draw", Away: "away" };

function parseOdds(o) {
  const empty = { c1: "--", cn: "--", c2: "--", co15: "--", co25: "--", cu25: "--", dc1x: "--", dc2x: "--", dc12: "--", btts_oui: "--", btts_non: "--", cs_home: "--", cs_away: "--", wtn_home: "--", wtn_away: "--" };
  TEAM_TOTAL_LINES.forEach((l) => {
    const key = String(l).replace(".", "");
    empty["th_o" + key] = "--"; empty["th_u" + key] = "--";
    empty["ta_o" + key] = "--"; empty["ta_u" + key] = "--";
  });
  ["home", "draw", "away"].forEach((side) => {
    empty["combo_" + side + "_over25"] = "--"; empty["combo_" + side + "_under25"] = "--";
    empty["combo_" + side + "_btts"] = "--"; empty["combo_" + side + "_nobtts"] = "--";
  });
  if (!o || !o.bookmakers || !o.bookmakers.length) return empty;
  const arr1 = [], arrN = [], arr2 = [], arr15 = [], arr25 = [], arru25 = [], arr35 = [], arru35 = [], arr1x = [], arrx2 = [], arr12 = [], arrby = [], arrbn = [], arrAHH = [], arrAHA = [];
  const arrCsHome = [], arrCsAway = [], arrWtnHome = [], arrWtnAway = [];
  const arrThOver = {}, arrThUnder = {}, arrTaOver = {}, arrTaUnder = {};
  TEAM_TOTAL_LINES.forEach((l) => { arrThOver[l] = []; arrThUnder[l] = []; arrTaOver[l] = []; arrTaUnder[l] = []; });
  const arrComboOver25 = { home: [], draw: [], away: [] }, arrComboUnder25 = { home: [], draw: [], away: [] };
  const arrComboBtts = { home: [], draw: [], away: [] }, arrComboNoBtts = { home: [], draw: [], away: [] };
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
      // Clean Sheet - Home/Away : deux bets separes ("Yes"/"No" chacun), pas
      // un seul bet a 3 valeurs - verifie sur donnees reelles (/odds live).
      if (bet.name === "Clean Sheet - Home") {
        const y = (bet.values || []).find((v) => v.value === "Yes");
        if (y) arrCsHome.push(parseFloat(y.odd));
      }
      if (bet.name === "Clean Sheet - Away") {
        const y = (bet.values || []).find((v) => v.value === "Yes");
        if (y) arrCsAway.push(parseFloat(y.odd));
      }
      // Win To Nil : UN SEUL bet avec les deux equipes en valeurs (pas
      // "Win to Nil - Home"/"Away" separes, contrairement a Clean Sheet -
      // difference reelle confirmee sur donnees live, ne pas uniformiser a
      // tort).
      if (bet.name === "Win To Nil") {
        const h = (bet.values || []).find((v) => v.value === "Home");
        const a = (bet.values || []).find((v) => v.value === "Away");
        if (h) arrWtnHome.push(parseFloat(h.odd));
        if (a) arrWtnAway.push(parseFloat(a.odd));
      }
      if (bet.name === "Total - Home") {
        (bet.values || []).forEach((v) => {
          const m = String(v.value || "").match(/^(Over|Under)\s+(\d+(?:\.\d+)?)$/);
          if (!m) return;
          const line = parseFloat(m[2]);
          if (arrThOver[line] === undefined) return; // ligne pas suivie (ex: 4.5+), ignoree plutot que fabriquee
          (m[1] === "Over" ? arrThOver : arrThUnder)[line].push(parseFloat(v.odd));
        });
      }
      if (bet.name === "Total - Away") {
        (bet.values || []).forEach((v) => {
          const m = String(v.value || "").match(/^(Over|Under)\s+(\d+(?:\.\d+)?)$/);
          if (!m) return;
          const line = parseFloat(m[2]);
          if (arrTaOver[line] === undefined) return;
          (m[1] === "Over" ? arrTaOver : arrTaUnder)[line].push(parseFloat(v.odd));
        });
      }
      // "Result/Total Goals" (bet_id 25) : uniquement la ligne 2.5, la plus
      // liquide et la seule que le modele derive aujourd'hui (voir
      // score-matrix.js#resultAndOver25/resultAndUnder25).
      if (bet.name === "Result/Total Goals") {
        (bet.values || []).forEach((v) => {
          const m = String(v.value || "").match(/^(Home|Draw|Away)\/(Over|Under)\s+2\.5$/);
          if (!m) return;
          const side = COMBO_RESULT_KEYS[m[1]];
          (m[2] === "Over" ? arrComboOver25 : arrComboUnder25)[side].push(parseFloat(v.odd));
        });
      }
      // "Results/Both Teams Score" (bet_id 24).
      if (bet.name === "Results/Both Teams Score") {
        (bet.values || []).forEach((v) => {
          const m = String(v.value || "").match(/^(Home|Draw|Away)\/(Yes|No)$/);
          if (!m) return;
          const side = COMBO_RESULT_KEYS[m[1]];
          (m[2] === "Yes" ? arrComboBtts : arrComboNoBtts)[side].push(parseFloat(v.odd));
        });
      }
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
  const result = {
    c1, cn, c2, co15, co25, cu25, co35: med(arr35), cu35: med(arru35), dc1x, dc2x, dc12, btts_oui, btts_non, ah_dom, ah_ext,
    cs_home: med(arrCsHome), cs_away: med(arrCsAway),
    wtn_home: med(arrWtnHome), wtn_away: med(arrWtnAway),
  };
  TEAM_TOTAL_LINES.forEach((l) => {
    const key = String(l).replace(".", "");
    result["th_o" + key] = med(arrThOver[l]); result["th_u" + key] = med(arrThUnder[l]);
    result["ta_o" + key] = med(arrTaOver[l]); result["ta_u" + key] = med(arrTaUnder[l]);
  });
  ["home", "draw", "away"].forEach((side) => {
    result["combo_" + side + "_over25"] = med(arrComboOver25[side]);
    result["combo_" + side + "_under25"] = med(arrComboUnder25[side]);
    result["combo_" + side + "_btts"] = med(arrComboBtts[side]);
    result["combo_" + side + "_nobtts"] = med(arrComboNoBtts[side]);
  });
  return result;
}

module.exports = { parseOdds };
