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

// Mapping nom joueur → ID depuis le classement ATP/WTA
// On fetch les rankings pour avoir les IDs
async function getRankings(tour) {
  try {
    const r = await get(`${TENNIS_BASE}/tennis/v2/${tour}/ranking/singles/?pageSize=300`);
    const items = (r&&r.data)||[];
    const map = {};
    items.forEach(item => {
      if(item.player) map[item.player.name.toLowerCase()] = item.player.id;
    });
    return map;
  } catch(e) { return {}; }
}

function clean(n){ return (n||'').toLowerCase().replace(/[^a-z]/g,''); }

function findPlayerId(name, rankMap) {
  const nl = name.toLowerCase();
  if(rankMap[nl]) return rankMap[nl];
  // Cherche par correspondance partielle
  for(const [rname, rid] of Object.entries(rankMap)) {
    if(clean(rname).includes(clean(nl).slice(0,6)) || clean(nl).includes(clean(rname).slice(0,6))) {
      return rid;
    }
  }
  return null;
}

function getWinner(result, p1Name, p2Name) {
  if(!result || result==='' || result.includes('walkover')) return null;
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
  const p = clean(pred), w = clean(winner);
  const wLast = winner.split(' ').pop();
  return p.includes(w.slice(0,6)) || p.includes(clean(wLast).slice(0,5));
}

async function main() {
  const histoPath = 'historique.json';
  let histo;
  try { histo = JSON.parse(fs.readFileSync(histoPath, 'utf8')); }
  catch(e) { console.log('Erreur lecture historique:', e.message); process.exit(1); }

  const today = new Date().toISOString().split('T')[0];
  const pending = histo.predictions.filter(p => p.result==='pending' && p.sport==='tennis' && p.date < today);
  console.log(`${pending.length} paris tennis pending à résoudre`);

  // Charger rankings ATP + WTA pour avoir les IDs joueurs
  console.log('Chargement rankings...');
  const atpMap = await getRankings('atp');
  const wtaMap = await getRankings('wta');
  console.log(`ATP: ${Object.keys(atpMap).length} joueurs | WTA: ${Object.keys(wtaMap).length} joueurs`);

  let resolved = 0;

  for(const pari of pending) {
    const tour = (pari.league_key||'atp').toLowerCase();
    const rankMap = tour==='wta' ? wtaMap : atpMap;
    const pariDate = pari.date;

    // Trouver l'ID du joueur home
    // Essayer home puis away, et aussi chercher les deux joueurs
    const homeId = findPlayerId(pari.home, rankMap);
    const awayId = findPlayerId(pari.away, rankMap);
    const playerId = homeId || awayId;
    const playerIds = [homeId, awayId].filter(Boolean);
    if(!playerId) {
      console.log(`  ⚠ ${pari.match} — joueur introuvable dans rankings`);
      continue;
    }

    try {
      // Essayer les deux joueurs pour trouver le match
      let matches = [];
      for(const pid of playerIds) {
        const r = await get(`${TENNIS_BASE}/tennis/v2/${tour}/player/past-matches/${pid}?pageSize=50`);
        const m = (r&&r.data)||[];
        if(m.length > matches.length) matches = m;
        await sleep(300);
      }

      // Chercher le match correspondant par date et adversaire
      const awayClean = clean(pari.away);
      const homeClean = clean(pari.home);

      // Date flexible +-1 jour (décalage UTC)
        const pDate = new Date(pariDate);
        const dM1 = new Date(pDate); dM1.setDate(dM1.getDate()-1);
        const dP1 = new Date(pDate); dP1.setDate(dP1.getDate()+1);
        const validDates = [dM1.toISOString().substring(0,10), pariDate, dP1.toISOString().substring(0,10)];
        const found = matches.find(m => {
          if(m.result_type==='upcoming') return false;
          const mDate = (m.date||'').substring(0,10);
          if(!validDates.includes(mDate)) return false;
          const p1 = clean(m.player1&&m.player1.name||'');
          const p2 = clean(m.player2&&m.player2.name||'');
          return (p1.includes(homeClean.slice(0,5)) || p2.includes(homeClean.slice(0,5))) &&
                 (p1.includes(awayClean.slice(0,5)) || p2.includes(awayClean.slice(0,5)));
        });

      if(!found) {
        console.log(`  ⏳ ${pari.match} (${pariDate}) — match non trouvé dans past-matches`);
        await sleep(400);
        continue;
      }

      if(!found.match_winner) {
        console.log(`  ⏳ ${pari.match} — pas encore de gagnant`);
        await sleep(400);
        continue;
      }

      // Déterminer le nom du gagnant
      const winnerName = found.match_winner === found.player1Id
        ? (found.player1&&found.player1.name||pari.home)
        : (found.player2&&found.player2.name||pari.away);

      const isWin = nameMatch(pari.prediction, winnerName);
      pari.result = isWin ? 'win' : 'loss';
      pari.score = winnerName + ' | ' + found.result;
      pari.resolved_date = today;
      resolved++;
      console.log(`  ${isWin?'✅':'❌'} ${pari.match} → ${pari.result} (${winnerName} | ${found.result})`);

    } catch(e) {
      console.log(`  ⚠ Erreur ${pari.match}:`, e.message);
    }
    await sleep(500);
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
  console.log(`Stats: ${wins}W/${losses}L | Winrate: ${histo.stats.winrate}% | ROI: ${histo.stats.roi}%`);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
