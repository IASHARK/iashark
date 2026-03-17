const https = require('https');
const fs = require('fs');

function nomNaturel(nom) {
  if (!nom) return '';
  const map = {
    'Bayern München': 'le Bayern', 'Bayern Munchen': 'le Bayern', 'FC Bayern': 'le Bayern',
    'Real Madrid': 'le Real', 'Real Madrid CF': 'le Real',
    'Manchester City': 'City', 'Manchester City FC': 'City',
    'Manchester United': 'United', 'Manchester United FC': 'United',
    'Paris Saint Germain': 'le PSG', 'Paris Saint-Germain': 'le PSG',
    'Sporting CP': 'le Sporting',
    'Atletico Madrid': "l'Atlético", 'Club Atletico de Madrid': "l'Atlético",
    'Borussia Dortmund': 'Dortmund',
    'Inter Milan': "l'Inter", 'FC Internazionale': "l'Inter",
    'AC Milan': 'le Milan', 'Juventus': 'la Juve', 'Juventus FC': 'la Juve',
    'FC Barcelona': 'le Barça', 'Barcelona': 'le Barça',
    'Bayer Leverkusen': 'Leverkusen',
    'Tottenham Hotspur': 'Tottenham',
    'Newcastle United': 'Newcastle',
    'Galatasaray': 'Galatasaray', 'Fenerbahce': 'Fener', 'Fenerbahçe': 'Fener',
    'Chapecoense-sc': 'Chapecoense', 'Racing Club': 'Racing',
  };
  for (const key of Object.keys(map)) {
    if (nom.toLowerCase().includes(key.toLowerCase())) return map[key];
  }
  return nom;
}

function genererScript(match) {
  return new Promise((resolve) => {
    const homeNom = nomNaturel(match.home.n);
    const awayNom = nomNaturel(match.away.n);
    const scoreProb = (match.scores || []).slice(0, 3).join(', ') || '1-0';
    const verdict = match.verdict_shark || '';
    const facteur = match.facteur_x || '';
    const conseil = match.conseil_public || match.analyse_card || '';
    const edge = match.edge || '';
    const conf = match.conf || '';
    const pari = match.pari_rec || '';

    const prompt = `Tu es le meilleur analyste data football sur TikTok. Écris le script vocal d'une vidéo de vingt-cinq secondes maximum.

RÈGLES STRICTES :
1. Utilise UNIQUEMENT "${homeNom}" et "${awayNom}" — jamais les noms officiels complets.
2. ZÉRO jargon de parieur : bannis "cote", "bookmaker", "pari", "mise", "ticket", "pronostic". Utilise "probabilités", "data", "scénario", "tendance".
3. Écris les chiffres en lettres. Utilise des points de suspension pour les pauses.
4. Commence DIRECTEMENT avec la stat la plus forte. Jamais "Bonjour" ou "Bienvenue".
5. Structure : hook percutant → data qui explique → verdict annoncé cash.

DONNÉES RÉELLES DU MATCH :
- ${homeNom} reçoit ${awayNom}
- Verdict IA : ${verdict}
- Facteur clé : ${facteur}
- Analyse : ${conseil}
- Scores probables : ${scoreProb}
- Edge mathématique : ${edge}
- Confiance IA : ${conf} sur dix

Rédige UNIQUEMENT le texte brut que la voix lira. Zéro titre, zéro hashtag, zéro markdown. Une seule ligne de texte continu.`;

    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
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
        try { resolve((JSON.parse(data).content[0] || {}).text || ''); }
        catch(e) { resolve(''); }
      });
    });
    req.on('error', () => resolve(''));
    req.write(body);
    req.end();
  });
}

function envoyerVersCreatomate(match, script) {
  return new Promise((resolve) => {
    const logoHome = `https://media.api-sports.io/football/teams/${match.home.id}.png`;
    const logoAway = `https://media.api-sports.io/football/teams/${match.away.id}.png`;
    const score = (match.scores || ['1-0'])[0];

    const data = JSON.stringify({
      template_id: '00468af0-fdc7-4490-81ad-d56b15f773d1',
      modifications: {
        'Voix_IA': script,
        'Logo_Domicile': logoHome,
        'Logo_Exterieur': logoAway,
        'Text-59T': score,
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
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.write(data);
    req.end();
  });
}

async function run() {
  try {
    if (!fs.existsSync('data.json')) throw new Error('data.json introuvable.');
    const content = JSON.parse(fs.readFileSync('data.json', 'utf8'));
    const ldcMatchs = (content.matchs || []).filter(m => m.league_key === 'ldc');

    if (!ldcMatchs.length) { console.log('Aucun match LDC aujourd\'hui.'); return; }

    const match = ldcMatchs.sort((a, b) => (b.conf || 0) - (a.conf || 0))[0];
    console.log(`Match : ${match.home.n} vs ${match.away.n} (conf: ${match.conf})`);

    let script = await genererScript(match);
    script = script.replace(/^[#\*\-].*/gm, '').replace(/\n+/g, ' ').trim();
    console.log('\n=== SCRIPT ===\n' + script + '\n==============\n');

    if (!script) throw new Error('Script vide.');

    const res = await envoyerVersCreatomate(match, script);
    if (res && res[0]) {
      console.log(`Statut : ${res[0].status}`);
      if (res[0].url) console.log(`Vidéo : ${res[0].url}`);
      else console.log(`ID : ${res[0].id}`);
    } else {
      console.log(JSON.stringify(res, null, 2));
    }
  } catch(err) {
    console.error('Erreur :', err.message);
    process.exit(1);
  }
}

run();
