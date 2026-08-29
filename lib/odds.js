"use strict";
// Parsing des cotes brutes api-football (medianes multi-bookmakers), extrait
// de update-data.yml pour etre reutilisable a l'identique par le pipeline
// principal ET par le job de cotes de cloture (closing-odds.yml) - une seule
// version testee au lieu de deux copies qui pourraient diverger.

function parseOdds(o) {
  const empty = { c1: "--", cn: "--", c2: "--", co15: "--", co25: "--", cu25: "--", dc1x: "--", dc2x: "--", dc12: "--", btts_oui: "--", btts_non: "--" };
  if (!o || !o.bookmakers || !o.bookmakers.length) return empty;
  const arr1 = [], arrN = [], arr2 = [], arr15 = [], arr25 = [], arru25 = [], arr35 = [], arru35 = [], arr1x = [], arrx2 = [], arr12 = [], arrby = [], arrbn = [], arrAHH = [], arrAHA = [];
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
  return { c1, cn, c2, co15, co25, cu25, co35: med(arr35), cu35: med(arru35), dc1x, dc2x, dc12, btts_oui, btts_non, ah_dom, ah_ext };
}

module.exports = { parseOdds };
