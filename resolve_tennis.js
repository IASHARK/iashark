// Script de résolution manuelle des paris tennis pending
// Usage: node resolve_tennis.js

const https = require('https');
const fs = require('fs');

const TENNIS_KEY = process.env.RAPIDAPI_TENNIS_KEY;
const TENNIS_BASE = 'https://tennis-api-atp-wta-itf.p.rapidapi.com';
const TENNIS_HEADERS = {
  'x-rapidapi-key': TENNIS_KEY,
  'x-rapidapi-host': 'tennis-api-atp-wta-itf.p.rapidapi.com',
  'Content-Type': 'application/json'
};

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function get(url, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = { hostname: u.hostname, path: u.pathname+u.search, headers: headers };
    https.get(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch(e) { resolve({}); }
      });
    }).on('error', reject);
  });
}

function getArr(url, headers) {
  return get(url, headers).then(r => Array.isArray(r)?r:(r&&r.data)||[]);
}

async function main() {
  const histoPath = 'historique.json';
  let histo = { predictions: [], stats: { winrate: 0, roi: 0, total: 0, wins: 0, losses: 0 } };
  try { histo = JSON.parse(fs.readFileSync(histoPath, 'utf8')); } catch(e) { console.log('Erreur lecture historique:', e.message); process.exit(1); }

  const pending = histo.predictions.filter(p => p.result === 'pending' && p.sport === 'tennis');
  console.log(`${pending.length} paris tennis pending à résoudre`);

  // Grouper par date
  const byDate = {};
  pending.forEach(p => {
    const d = (p.date||'').substring(0, 10);
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(p);
  });

  const today = new Date().toISOString().split('T')[0];
  let resolved = 0;

  for (const date of Object.keys(byDate).sort()) {
    if (date >= today) { console.log(`Skip ${date} (aujourd'hui ou futur)`); continue; }
    console.log(`\nRésolution du ${date}...`);

    for (const tour of ['atp', 'wta']) {
      try {
        const fixtures = await getArr(
          `${TENNIS_BASE}/tennis/v2/${tour}/fixtures/${date}?filter=PlayerGroup:singles&pageSize=50`,
          TENNIS_HEADERS
        );
        console.log(`  ${tour.toUpperCase()} ${date}: ${fixtures.length} fixtures`);

        for (const fx of fixtures) {
          if (!fx.result || fx.result === '') continue; // pas terminé

          const p1n = fx.player1 && fx.player1.name || '';
          const p2n = fx.player2 && fx.player2.name || '';
          const fxId = 't_' + fx.id;

          // Calculer le gagnant depuis le score
          const sets = fx.result.split(' ');
          let p1sets = 0, p2sets = 0;
          sets.forEach(s => {
            const parts = s.replace(/\([^)]*\)/g, '').split('-');
            if (parts.length === 2) {
              const a = parseInt(parts[0])||0, b = parseInt(parts[1])||0;
              if (a > b) p1sets++; else if (b > a) p2sets++;
            }
          });
          const winnerName = p1sets > p2sets ? p1n : p2n;

          // Trouver le pari correspondant
          const match = byDate[date] && byDate[date].find(p => {
            if (p.fixture_id === fxId) return true;
            const ph = (p.home||'').toLowerCase(), pa = (p.away||'').toLowerCase();
            const fn1 = p1n.toLowerCase(), fn2 = p2n.toLowerCase();
            return (fn1.includes(ph.split(' ').pop().slice(0,4)) && fn2.includes(pa.split(' ').pop().slice(0,4)));
          });

          if (!match) continue;

          const predLow = (match.prediction||'').toLowerCase();
          const winLow = winnerName.toLowerCase();
          const isWin = predLow.includes(winLow.slice(0,4)) ||
                        predLow.includes(winLow.split(' ').pop().slice(0,4));

          match.result = isWin ? 'win' : 'loss';
          match.score = winnerName + ' W ' + fx.result;
          match.resolved_date = date;
          resolved++;
          console.log(`  ✅ ${match.match} → ${match.result} (${winnerName})`);
        }
        await sleep(400);
      } catch(e) { console.log(`  Erreur ${tour} ${date}:`, e.message); }
    }
  }

  console.log(`\n${resolved} paris résolus sur ${pending.length} pending`);

  // Recalculer les stats
  const singles = histo.predictions.filter(p => p.type === 'single');
  const wins = singles.filter(p => p.result === 'win').length;
  const losses = singles.filter(p => p.result === 'loss').length;
  const total = wins + losses;
  let roi = 0;
  singles.forEach(p => {
    if (p.result === 'win') roi += (parseFloat(p.cote)||1) - 1;
    else if (p.result === 'loss') roi -= 1;
  });

  histo.stats.wins = wins;
  histo.stats.losses = losses;
  histo.stats.total = total;
  histo.stats.winrate = total > 0 ? Math.round(wins/total*100) : 0;
  histo.stats.roi = total > 0 ? Math.round(roi/total*100*10)/10 : 0;

  fs.writeFileSync(histoPath, JSON.stringify(histo, null, 2));
  console.log(`\nStats: ${wins}W/${losses}L | Winrate: ${histo.stats.winrate}% | ROI: ${histo.stats.roi}%`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
