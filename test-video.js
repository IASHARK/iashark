const https = require('https');
const fs = require('fs');

function nomNaturel(nom) {
  if (!nom) return '';
  const map = {
    'Bayern München': 'le Bayern', 'Bayern Munchen': 'le Bayern', 'FC Bayern': 'le Bayern',
    'Real Madrid': 'le Real', 'Real Madrid CF': 'le Real',
    'Manchester City': 'City', 'Manchester City FC': 'City',
    'Manchester United': 'United', 'Manchester United FC': 'United',
    'Paris Saint Germain': 'le PSG', 'Paris Saint-Germain': 'le PSG', 'PSG': 'le PSG',
    'Sporting CP': 'le Sporting', 'Sporting Club': 'le Sporting',
    'Arsenal': 'Arsenal', 'Liverpool': 'Liverpool', 'Chelsea': 'Chelsea',
    'Atletico Madrid': "l'Atlético", 'Atlético de Madrid': "l'Atlético",
    'Borussia Dortmund': 'Dortmund', 'BVB': 'Dortmund',
    'Inter Milan': "l'Inter", 'FC Internazionale': "l'Inter",
    'AC Milan': 'le Milan', 'Juventus': 'la Juve', 'Juventus FC': 'la Juve',
    'FC Barcelona': 'le Barça', 'Barcelona': 'le Barça',
    'Bayer Leverkusen': 'Leverkusen', 'Atalanta': "l'Atalanta",
    'Benfica': 'Benfica', 'Porto': 'Porto',
    'Galatasaray': 'Galatasaray', 'Fenerbahce': 'Fener',
  };
  for (const key of Object.keys(map)) {
    if (nom.toLowerCase().includes(key.toLowerCase())) return map[key];
  }
  return nom;
}

function formeEnTexte(forme) {
  if (!forme) return 'forme moyenne';
  const map = { 'W': 'victoire', 'D': 'nul', 'L': 'défaite' };
  const mots = (forme || '').split('').map(c => map[c] || c);
  const wins = (forme || '').split('').filter(c => c === 'W').length;
  return `${wins} victoire${wins > 1 ? 's' : ''} sur les ${mots.length} derniers matchs`;
}

function nombreEnTexte(n) {
  if (!n || n === '?') return 'zéro';
  const m = { '0.5': 'zéro virgule cinq', '1.5': 'un but et demi', '2.5': 'deux buts et demi', '3.5': 'trois buts et demi', '4.5': 'quatre buts et demi' };
  return m[String(n)] || String(n).replace('.', ' virgule ');
}

async function genererScript(match) {
  return new Promise((resolve) => {
    const homeNom = nomNaturel(match.home.n || match.home);
    const awayNom = nomNaturel(match.away.n || match.away);
    
    const prompt = `Tu es le meilleur analyste foot TikTok. Écris un script vocal de 25s max.
RÈGLES : 
- Utilise uniquement "${homeNom}" et "${awayNom}". 
- PAS de jargon de parieur. Parle de "data" et "scénario".
- Oral uniquement : pas d'abréviation, "..." pour les pauses.

DONNÉES :
- Domicile : ${homeNom} (xG: ${nombreEnTexte(match.xgH_avg)}, forme: ${formeEnTexte(match.forme5H)})
- Extérieur : ${awayNom} (xG: ${nombreEnTexte(match.xgA_avg)}, forme: ${formeEnTexte(match.forme5A)})
- Scénario IA : ${match.pari_rec} | Scores: ${match.scores_probables}

Rédige UNIQUEMENT le script vocal.`;

    const body = JSON.stringify({
      model: 'claude-sonnet-4-6', // LE NOM EXACT PRIS DANS TON WORKFLOW
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          if (r.error) {
            console.log("❌ Erreur API Claude :", r.error.message);
            resolve('');
          } else {
            resolve((r.content && r.content[0] && r.content[0].text) || '');
          }
        } catch(e) { resolve(''); }
      });
    });
    req.on('error', () => resolve(''));
    req.write(body);
    req.end();
  });
}

async function envoyerCreatomate(match, script) {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      template_id: '00468af0-fdc7-4490-81ad-d56b15f773d1',
      modifications: {
        'Logo_Domicile': `https://media.api-sports.io/football/teams/${match.home.id || 85}.png`,
        'Logo_Exterieur': `https://media.api-sports.io/football/teams/${match.away.id || 85}.png`,
        'Voix_IA': script,
        'Score_Probable': (match.scores_probables || '1-0').split(',')[0].trim(),
        'Equipe_Dom': nomNaturel(match.home.n || match.home),
        'Equipe_Ext': nomNaturel(match.away.n || match.away)
      }
    });

    const req = https.request({
      hostname: 'api.creatomate.com',
      path: '/v1/renders',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CREATOMATE_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', () => resolve(null));
    req.write(data);
    req.end();
  });
}

async function run() {
  try {
    const content = JSON.parse(fs.readFileSync('data.json', 'utf8'));
    const ldc = (content.matchs || []).filter(m => m.league_key === 'ldc');
    if (!ldc.length) return console.log('Aucun match LDC.');

    const match = ldc.sort((a, b) => (b.conf || 0) - (a.conf || 0))[0];
    console.log(`Sélection : ${match.home.n} vs ${match.away.n}`);

    const script = await genererScript(match);
    if (!script) throw new Error('Script non généré.');

    console.log('=== SCRIPT ===\n' + script + '\n==============');

    const res = await envoyerCreatomate(match, script);
    if (res && res[0] && res[0].url) console.log(`✅ Vidéo OK : ${res[0].url}`);
    else console.log('⏳ Rendu envoyé à Creatomate.');

  } catch(err) {
    console.error('Erreur :', err.message);
  }
}

run();
