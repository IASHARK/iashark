const https = require('https');
const fs = require('fs');

const TENNIS_KEY = process.env.RAPIDAPI_TENNIS_KEY;
const ODDS_KEY = process.env.ODDS_API_KEY;
const TENNIS_BASE = 'https://tennis-api-atp-wta-itf.p.rapidapi.com';
const TENNIS_HEADERS = {
  'x-rapidapi-key': TENNIS_KEY,
  'x-rapidapi-host': 'tennis-api-atp-wta-itf.p.rapidapi.com',
  'Content-Type': 'application/json'
};

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function clean(n){ return (n||'').toLowerCase().replace(/[^a-z]/g,''); }

function get(url, headers) {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const opts = { hostname: u.hostname, path: u.pathname+u.search, headers: headers||{} };
      https.get(opts, res => {
        let d = '';
        res.on('data', c => d += c);
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e){ resolve({}); } });
      }).on('error', () => resolve({}));
    } catch(e) { resolve({}); }
  });
}

async function getRankings(tour) {
  const r = await get(`${TENNIS_BASE}/tennis/v2/${tour}/ranking/singles/?pageSize=300`, TENNIS_HEADERS);
  const map = {};
  ((r&&r.data)||[]).forEach(item => {
    if(item.player) map[clean(item.player.name)] = item.player.id;
  });
  return map;
}

function findPlayerId(name, map) {
  const nc = clean(name);
  if(map[nc]) return map[nc];
  for(const [k,v] of Object.entries(map)) {
    if(clean(k).includes(nc.slice(0,6)) || nc.includes(clean(k).slice(0,6))) return v;
  }
  return null;
}

function getWinner(result, p1Name, p2Name) {
  if(!result||result==='') return null;
  const sets = result.split(' ');
  let p1=0, p2=0;
  sets.forEach(s => {
    const parts = s.replace(/\([^)]*\)/g,'').split('-');
    if(parts.length===2){
      const a=parseInt(parts[0])||0, b=parseInt(parts[1])||0;
      if(a>b) p1++; else if(b>a) p2++;
    }
  });
  return p1>p2?p1Name:p2>p1?p2Name:null;
}

function nameMatch(pred, winner) {
  const p=clean(pred), w=clean(winner);
  return p.includes(w.slice(0,6)) || w.includes(p.slice(0,6)) ||
         p.includes(winner.split(' ').pop().toLowerCase().replace(/[^a-z]/g,'').slice(0,5));
}

// Charger les cotes The Odds API pour tous les tournois tennis
async function loadOddsIndex() {
  if(!ODDS_KEY) return {};
  const index = {};
  try {
    // Fetch sports actifs
    const sports = await get(`https://api.the-odds-api.com/v4/sports/?apiKey=${ODDS_KEY}`, {});
    const tennisSports = (Array.isArray(sports)?sports:[]).filter(s => s.key&&s.key.includes('tennis'));
    console.log(`Odds API tennis sports: ${tennisSports.map(s=>s.key).join(', ')}`);

    for(const sport of tennisSports) {
      try {
        const r = await get(`https://api.the-odds-api.com/v4/sports/${sport.key}/odds/?apiKey=${ODDS_KEY}&regions=eu&markets=h2h&bookmakers=pinnacle,bet365&oddsFormat=decimal`, {});
        const events = Array.isArray(r)?r:[];
        events.forEach(e => {
          if(!e.home_team||!e.away_team) return;
          const k1 = clean(e.home_team).slice(0,6)+'|'+clean(e.away_team).slice(0,6);
          const k2 = clean(e.away_team).slice(0,6)+'|'+clean(e.home_team).slice(0,6);
          index[k1] = e; index[k2] = e;
        });
        console.log(`  ${sport.key}: ${events.length} events`);
        await sleep(500);
      } catch(e2){}
    }
  } catch(e) { console.log('Odds API error:', e.message); }
  return index;
}

function getOddsFromEvent(event, predName) {
  if(!event||!event.bookmakers) return null;
  const bk = event.bookmakers.find(b=>b.key==='pinnacle') ||
             event.bookmakers.find(b=>b.key==='bet365') ||
             event.bookmakers[0];
  if(!bk) return null;
  const ml = (bk.markets||[]).find(m=>m.key==='h2h');
  if(!ml||!ml.outcomes) return null;
  const predC = clean(predName);
  const outcome = ml.outcomes.find(o => {
    const oc = clean(o.name);
    return oc.includes(predC.slice(0,6)) || predC.includes(oc.slice(0,6));
  });
  return outcome ? parseFloat(outcome.price) : null;
}

async function main() {
  const histoPath = 'historique.json';
  let histo;
  try { histo = JSON.parse(fs.readFileSync(histoPath, 'utf8')); }
  catch(e) { console.log('Erreur lecture historique:', e.message); process.exit(1); }

  const today = new Date().toISOString().split('T')[0];
  const pending = histo.predictions.filter(p => p.result==='pending' && p.sport==='tennis' && p.date < today);
  console.log(`${pending.length} paris tennis pending à résoudre`);

  // Charger rankings + cotes
  console.log('Chargement rankings...');
  const [atpMap, wtaMap] = await Promise.all([getRankings('atp'), getRankings('wta')]);
  console.log(`ATP: ${Object.keys(atpMap).length} | WTA: ${Object.keys(wtaMap).length}`);

  console.log('Chargement cotes The Odds API...');
  const oddsIndex = await loadOddsIndex();
  console.log(`Cotes indexées: ${Object.keys(oddsIndex).length/2} matchs`);

  let resolved = 0;

  for(const pari of pending) {
    const tour = (pari.league_key||'atp').toLowerCase();
    const rankMap = tour==='wta' ? wtaMap : atpMap;
    const homeId = findPlayerId(pari.home, rankMap);
    const awayId = findPlayerId(pari.away, rankMap);
    const playerIds = [homeId, awayId].filter(Boolean);

    if(!playerIds.length) {
      console.log(`  ⚠ ${pari.match} — joueurs introuvables`);
      continue;
    }

    // Dates valides +-1 jour
    const pd = new Date(pari.date);
    const validDates = [-1,0,1].map(d => {
      const dd = new Date(pd); dd.setDate(dd.getDate()+d);
      return dd.toISOString().substring(0,10);
    });

    let found = null;
    for(const pid of playerIds) {
      try {
        const r = await get(`${TENNIS_BASE}/tennis/v2/${tour}/player/past-matches/${pid}?pageSize=50`, TENNIS_HEADERS);
        const matches = (r&&r.data)||[];
        const hc = clean(pari.home), ac = clean(pari.away);
        const m = matches.find(m => {
          if(m.result_type==='upcoming') return false;
          const mDate = (m.date||'').substring(0,10);
          if(!validDates.includes(mDate)) return false;
          const p1 = clean(m.player1&&m.player1.name||'');
          const p2 = clean(m.player2&&m.player2.name||'');
          return (p1.includes(hc.slice(0,5))||p2.includes(hc.slice(0,5))) &&
                 (p1.includes(ac.slice(0,5))||p2.includes(ac.slice(0,5)));
        });
        if(m) { found = m; break; }
      } catch(e){}
      await sleep(300);
    }

    if(!found) {
      console.log(`  ⏳ ${pari.match} (${pari.date}) — introuvable`);
      continue;
    }

    if(!found.match_winner) {
      console.log(`  ⏳ ${pari.match} — pas de gagnant`);
      continue;
    }

    const winnerName = found.match_winner===found.player1Id
      ? (found.player1&&found.player1.name||pari.home)
      : (found.player2&&found.player2.name||pari.away);

    const isWin = nameMatch(pari.prediction, winnerName);
    pari.result = isWin ? 'win' : 'loss';
    pari.score = winnerName + ' | ' + found.result;
    pari.resolved_date = today;

    // Cotes : 1. past-matches API tennis
    const odd1 = parseFloat(found.odd1)||null;
    const odd2 = parseFloat(found.odd2)||null;
    if(odd1&&odd2) {
      const p1c = clean(found.player1&&found.player1.name||'');
      const predC = clean(pari.prediction);
      const isPredP1 = p1c.includes(predC.slice(0,5)) || predC.includes(p1c.slice(0,5));
      pari.cote = isPredP1 ? odd1 : odd2;
    }

    // Cotes : 2. The Odds API si pas trouvé
    if(!pari.cote) {
      const k = clean(pari.home).slice(0,6)+'|'+clean(pari.away).slice(0,6);
      const oddsEvent = oddsIndex[k];
      if(oddsEvent) {
        const cote = getOddsFromEvent(oddsEvent, pari.prediction);
        if(cote&&cote>1) { pari.cote=cote; console.log(`     Cote The Odds API: ${cote}`); }
      }
    }

    resolved++;
    console.log(`  ${isWin?'✅':'❌'} ${pari.match} → ${pari.result} (${winnerName})${pari.cote?' cote:'+pari.cote:''}`);
    await sleep(400);
  }

  console.log(`\n${resolved} paris résolus sur ${pending.length}`);

  // Stats
  const singles = histo.predictions.filter(p=>p.type==='single');
  const wins = singles.filter(p=>p.result==='win').length;
  const losses = singles.filter(p=>p.result==='loss').length;
  const total = wins+losses;
  let roi=0, roiCount=0;
  singles.forEach(p => {
    if(p.result==='pending'||!p.cote) return;
    roiCount++;
    if(p.result==='win') roi+=parseFloat(p.cote)-1;
    else if(p.result==='loss') roi-=1;
  });

  histo.stats.wins=wins; histo.stats.losses=losses; histo.stats.total=total;
  histo.stats.winrate=total>0?Math.round(wins/total*100):0;
  histo.stats.roi=roiCount>0?Math.round(roi/roiCount*1000)/10:0;

  fs.writeFileSync(histoPath, JSON.stringify(histo,null,2));
  console.log(`Stats: ${wins}W/${losses}L | Winrate: ${histo.stats.winrate}% | ROI: ${histo.stats.roi}% (sur ${roiCount} paris avec cotes)`);
}

main().catch(e=>{ console.error('FATAL:', e.message); process.exit(1); });
