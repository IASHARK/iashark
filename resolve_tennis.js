const https = require('https');
const fs = require('fs');

const TENNIS_KEY = process.env.RAPIDAPI_TENNIS_KEY;
const TENNIS_BASE = 'https://tennis-api-atp-wta-itf.p.rapidapi.com';
const HEADERS = {
  'x-rapidapi-key': TENNIS_KEY,
  'x-rapidapi-host': 'tennis-api-atp-wta-itf.p.rapidapi.com',
  'Content-Type': 'application/json'
};

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

function get(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    https.get({ hostname: u.hostname, path: u.pathname+u.search, headers: HEADERS }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e){ resolve({}); } });
    }).on('error', reject);
  });
}

function getWinner(result, p1Name, p2Name) {
  if(!result || result === '') return null;
  const sets = result.split(' ');
  let p1=0, p2=0;
  sets.forEach(s => {
    const parts = s.replace(/\([^)]*\)/g,'').split('-');
    if(parts.length===2){
      const a=parseInt(parts[0])||0, b=parseInt(parts[1])||0;
      if(a>b) p1++; else if(b>a) p2++;
    }
  });
  if(p1===0&&p2===0) return null;
  return p1>p2 ? p1Name : p2Name;
}

function nameMatch(pred, winner) {
  const p = pred.toLowerCase();
  const w = winner.toLowerCase();
  const wLast = w.split(' ').pop();
  return p.includes(w.slice(0,5)) || p.includes(wLast.slice(0,5)) || w.includes(p.split(' ').pop().slice(0,5));
}

async function main() {
  const histoPath = 'historique.json';
  let histo;
  try { histo = JSON.parse(fs.readFileSync(histoPath, 'utf8')); }
  catch(e) { console.log('Erreur lecture historique:', e.message); process.exit(1); }

  const today = new Date().toISOString().split('T')[0];
  const pending = histo.predictions.filter(p => p.result==='pending' && p.sport==='tennis' && p.date < today);
  console.log(`${pending.length} paris tennis pending à résoudre (avant ${today})`);

  let resolved = 0;
  for(const pari of pending) {
    const fixtureId = String(pari.fixture_id||'').replace('t_','');
    if(!fixtureId) continue;
    const tour = (pari.league_key||'atp').toLowerCase();

    try {
      const r = await get(`${TENNIS_BASE}/tennis/v2/${tour}/fixtures/${fixtureId}`);
      const fx = r && (r.data || r);

      if(!fx || !fx.result || fx.result==='') {
        console.log(`  ⏳ ${pari.match} — résultat non disponible`);
        await sleep(300);
        continue;
      }

      const p1Name = fx.player1 && fx.player1.name || pari.home;
      const p2Name = fx.player2 && fx.player2.name || pari.away;
      const winner = getWinner(fx.result, p1Name, p2Name);

      if(!winner) {
        console.log(`  ⚠ ${pari.match} — impossible de déterminer le gagnant (${fx.result})`);
        await sleep(300);
        continue;
      }

      const isWin = nameMatch(pari.prediction, winner);
      pari.result = isWin ? 'win' : 'loss';
      pari.score = winner + ' | ' + fx.result;
      pari.resolved_date = today;
      resolved++;
      console.log(`  ${isWin?'✅':'❌'} ${pari.match} → ${pari.result} (${winner})`);
    } catch(e) {
      console.log(`  ⚠ Erreur ${pari.match}:`, e.message);
    }
    await sleep(400);
  }

  console.log(`\n${resolved} paris résolus sur ${pending.length} pending`);

  // Recalcul stats
  const singles = histo.predictions.filter(p => p.type==='single');
  const wins = singles.filter(p => p.result==='win').length;
  const losses = singles.filter(p => p.result==='loss').length;
  const total = wins + losses;
  let roi = 0;
  singles.forEach(p => {
    if(p.result==='win') roi += (parseFloat(p.cote)||2)-1;
    else if(p.result==='loss') roi -= 1;
  });

  histo.stats.wins = wins;
  histo.stats.losses = losses;
  histo.stats.total = total;
  histo.stats.winrate = total>0 ? Math.round(wins/total*100) : 0;
  histo.stats.roi = total>0 ? Math.round(roi/total*1000)/10 : 0;

  fs.writeFileSync(histoPath, JSON.stringify(histo, null, 2));
  console.log(`\nStats: ${wins}W/${losses}L | Winrate: ${histo.stats.winrate}% | ROI: ${histo.stats.roi}%`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
