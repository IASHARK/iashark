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
    'Tottenham Hotspur': 'Tottenham', 'Newcastle United': 'Newcastle',
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
    const verdict = match.verdict_shark || match.analyse_card || match.conseil_public || '';
    const facteur = match.facteur_x || '';
    const edge = match.edge || '';
    const conf = match.conf || '';
    const pari = match.pari_rec || '';
    const p1 = match.p1 || 0, pn = match.pn || 0, p2 = match.p2 || 0;

    const contexte = verdict || facteur ||
      (pari ? 'Scenario ' + pari + ' edge ' + edge + ' confiance ' + conf + '/10' : '') ||
      homeNom + ' recoit ' + awayNom + ' probas dom ' + p1 + '% nul ' + pn + '% ext ' + p2 + '%';

    const prompt = 'Tu es le meilleur analyste data football sur TikTok. Ecris le script vocal d\'une video de quinze secondes maximum.\n\n'
      + 'REGLES STRICTES :\n'
      + '1. Utilise UNIQUEMENT "' + homeNom + '" et "' + awayNom + '".\n'
      + '2. ZERO jargon de parieur : bannis cote, bookmaker, pari, mise, ticket, pronostic. Utilise probabilites, data, scenario, tendance.\n'
      + '3. ZERO mention de joueurs ou de buteurs.\n'
      + '4. Ecris les chiffres en lettres. Utilise des points de suspension pour les pauses.\n'
      + '5. Commence avec UNE stat choc. Jamais Bonjour ou Bienvenue.\n'
      + '6. Structure : stat choc > pourquoi ce scenario > verdict cash.\n\n'
      + 'DONNEES DU MATCH :\n'
      + '- ' + homeNom + ' recoit ' + awayNom + '\n'
      + '- Analyse : ' + contexte + '\n'
      + '- Edge : ' + edge + ' — Confiance : ' + conf + ' sur dix\n'
      + '- Scenario : ' + pari + '\n\n'
      + 'Maximum quarante mots. Zero titre, zero hashtag, zero markdown. Une seule ligne de texte continu.';

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
    const logoHome = 'https://media.api-sports.io/football/teams/' + match.home.id + '.png';
    const logoAway = 'https://media.api-sports.io/football/teams/' + match.away.id + '.png';

    const data = JSON.stringify({
      template_id: '00468af0-fdc7-4490-81ad-d56b15f773d1',
      modifications: {
        'Voix_IA': script,
        'Logo_Domicile': logoHome,
        'Logo_Exterieur': logoAway,
      }
    });

    const req = https.request({
      hostname: 'api.creatomate.com',
      path: '/v1/renders',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.CREATOMATE_KEY,
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
    const ldcMatchs = (content.matchs || []).filter(function(m){ return m.league_key === 'ldc'; });

    if (!ldcMatchs.length) { console.log('Aucun match LDC aujourd\'hui.'); return; }

    const ldcComplets = ldcMatchs.filter(function(m){ return m.verdict_shark || m.analyse_card || m.conseil_public; });
    const pool = ldcComplets.length ? ldcComplets : ldcMatchs;
    const match = pool.sort(function(a, b){ return (b.conf || 0) - (a.conf || 0); })[0];
    console.log('Match : ' + match.home.n + ' vs ' + match.away.n + ' (conf: ' + match.conf + ')');

    let script = await genererScript(match);
    script = script.replace(/^[#\*\-].*/gm, '').replace(/\n+/g, ' ').trim();
    console.log('\n=== SCRIPT ===\n' + script + '\n==============\n');

    if (!script) throw new Error('Script vide.');

    const res = await envoyerVersCreatomate(match, script);
    if (res && res[0]) {
      console.log('Statut : ' + res[0].status);
      if (res[0].url) console.log('Video : ' + res[0].url);
      else console.log('ID : ' + res[0].id);
    } else {
      console.log(JSON.stringify(res, null, 2));
    }
  } catch(err) {
    console.error('Erreur :', err.message);
    process.exit(1);
  }
}

run();
