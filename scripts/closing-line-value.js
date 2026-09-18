#!/usr/bin/env node
"use strict";
// Closing Line Value (CLV) des picks publies - outil de mesure hors-ligne,
// jamais branche dans une page ni dans le pipeline quotidien.
//
// Pourquoi : les resultats (win/loss) mettent des milliers de paris a
// separer le signal du bruit. La cote de cloture, elle, dit en quelques
// semaines si le marche a bouge VERS nos picks (nous avions un meilleur
// prix que la cloture) ou CONTRE. Un pick pris a 1.90 qui cloture a 1.75
// a un CLV de +8.6 % ; pris a 1.90 et cloture a 2.05, un CLV de -7.3 %.
// Un moteur rentable sur la duree a un CLV moyen positif ; c'est le
// premier chiffre a regarder pour juger un changement de regle de
// selection - bien avant le ROI.
//
// Donnees : match_snapshots (snapshot_type 'prediction' = cotes au moment
// du pick, 'closing' = cotes dans les 3 h avant le coup d'envoi, voir
// ODDS_SNAPSHOT_POLICY.md) et match_premium_data (market_id du pick),
// croises par fixture_id ; le resultat vient de predictions_archive quand il
// existe (le CLV, lui, ne l'attend pas).
//
// Usage :
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/closing-line-value.js
//   node scripts/closing-line-value.js --from-json rows.json   (memes champs, lus localement)
//
// Aucune cote n'est inventee : un pick sans cote de cloture pour SON marche
// est compte "sans cloture", jamais estime.

const fs = require("fs");

const MAP = {
  "home-win": "c1", draw: "cn", "away-win": "c2",
  "dc-1x": "dc1x", "dc-x2": "dc2x", "dc-12": "dc12",
  "over-15": "co15", "over-25": "co25", "under-25": "cu25", "over-35": "co35", "under-35": "cu35",
  "btts-yes": "btts_oui", "btts-no": "btts_non",
  "home-team-over-15": "home_over15", "home-team-under-15": "home_under15",
  "away-team-over-15": "away_over15", "away-team-under-15": "away_under15",
  "home-win-to-nil": "home_win_to_nil", "away-win-to-nil": "away_win_to_nil",
  "home-clean-sheet": "home_clean_sheet", "away-clean-sheet": "away_clean_sheet",
  "fh-over-05": "fh_over05", "fh-under-05": "fh_under05", "fh-over-15": "fh_over15", "fh-under-15": "fh_under15",
  "home-win-both-halves": "home_win_both_halves", "away-win-both-halves": "away_win_both_halves",
};

// Cote d'un marche dans un objet odds (format lib/odds.js#parseOdds).
function oddsFor(odds, marketId) {
  if (!odds || !marketId) return null;
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) && n > 1 ? n : null; };
  if (MAP[marketId]) return num(odds[MAP[marketId]]);
  const combo = /^(home|away)-win-(over|under)-(\d)(\d)$/.exec(marketId);
  if (combo) return num(odds[`${combo[1]}_win_${combo[2]}${combo[3]}${combo[4]}`]);
  const shots = /^(total-shots(?:-on-target)?)-(over|under)-(\d+)_(\d)$/.exec(marketId);
  if (shots) {
    const line = Number(`${shots[3]}.${shots[4]}`);
    const offer = (odds.dynamic_count_offers || []).find((o) => o.market === shots[1] && o.side === shots[2] && Number(o.line) === line);
    return offer ? num(offer.odds) : null;
  }
  return null;
}

function family(marketId) {
  const id = String(marketId || "");
  if (/^total-shots/.test(id)) return "tirs";
  if (/^(home-win|draw|away-win)$/.test(id)) return "1x2";
  if (/^dc-/.test(id)) return "double chance";
  if (/^(over|under)-/.test(id)) return "o/u buts";
  if (/^btts/.test(id)) return "btts";
  if (/team-/.test(id)) return "total equipe";
  if (/^fh-/.test(id)) return "1re mi-temps";
  if (/win-(over|under)|to-nil|clean-sheet|both-halves/.test(id)) return "resultat+total";
  return "autre";
}

function computeClv(rows) {
  const out = [];
  for (const r of rows) {
    const pred = oddsFor(r.odds, r.market_id);
    const close = oddsFor(r.closing_odds, r.market_id);
    if (pred == null || close == null) { out.push({ fixture_id: r.fixture_id, market_id: r.market_id, clv: null, reason: pred == null ? "SANS_COTE_PICK" : "SANS_CLOTURE" }); continue; }
    out.push({ fixture_id: r.fixture_id, date: r.date, market_id: r.market_id, family: family(r.market_id), pred, close, clv: pred / close - 1, result: r.result || null });
  }
  return out;
}

function summarize(items) {
  const ok = items.filter((i) => i.clv != null);
  const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
  const pct = (v) => (v == null ? "n/a" : (v * 100).toFixed(1) + "%");
  const lines = [];
  lines.push(`picks : ${items.length} | avec cloture : ${ok.length} | sans : ${items.length - ok.length}`);
  if (ok.length) {
    lines.push(`CLV moyen : ${pct(mean(ok.map((i) => i.clv)))} | positif sur ${(100 * ok.filter((i) => i.clv > 0).length / ok.length).toFixed(0)}% des picks | cote pick moy ${mean(ok.map((i) => i.pred)).toFixed(2)} -> cloture ${mean(ok.map((i) => i.close)).toFixed(2)}`);
    const fams = {};
    ok.forEach((i) => { (fams[i.family] = fams[i.family] || []).push(i); });
    Object.entries(fams).sort((a, b) => b[1].length - a[1].length).forEach(([f, l]) => lines.push(`  ${f.padEnd(16)} n=${String(l.length).padStart(3)} CLV=${pct(mean(l.map((i) => i.clv)))} positif=${(100 * l.filter((i) => i.clv > 0).length / l.length).toFixed(0)}%`));
  }
  return lines.join("\n");
}

async function fetchRows() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY absents (ou utilisez --from-json <fichier>)");
  const get = async (p) => { const r = await fetch(url + "/rest/v1/" + p, { headers: { apikey: key, Authorization: "Bearer " + key } }); if (!r.ok) throw new Error(p + " -> HTTP " + r.status); return r.json(); };
  const [premium, snaps, archive] = await Promise.all([
    get("match_premium_data?select=fixture_id,market_id&market_id=not.is.null"),
    get("match_snapshots?select=fixture_id,snapshot_type,raw_inputs"),
    get("predictions_archive?select=fixture_id,date,result&result=in.(win,loss)"),
  ]);
  const byFx = new Map();
  for (const p of premium) byFx.set(p.fixture_id, { fixture_id: p.fixture_id, market_id: p.market_id });
  for (const s of snaps) { const r = byFx.get(s.fixture_id); if (!r) continue; if (s.snapshot_type === "prediction") r.odds = s.raw_inputs && s.raw_inputs.odds; if (s.snapshot_type === "closing") r.closing_odds = s.raw_inputs && s.raw_inputs.odds; }
  for (const a of archive) { const r = byFx.get(a.fixture_id); if (r) { r.result = a.result; r.date = a.date; } }
  return Array.from(byFx.values()).filter((r) => r.odds);
}

async function main() {
  const i = process.argv.indexOf("--from-json");
  const rows = i !== -1 ? JSON.parse(fs.readFileSync(process.argv[i + 1], "utf8")) : await fetchRows();
  const items = computeClv(rows);
  console.log(summarize(items));
  if (process.argv.includes("--json")) console.log(JSON.stringify(items, null, 2));
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(1); });
module.exports = { oddsFor, computeClv, summarize, family };
