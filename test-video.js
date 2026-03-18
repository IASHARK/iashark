const https = require('https');
const fs = require('fs');

// 1. Rend les noms des clubs naturels pour l'IA (oral)
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

// 2. Nettoie les noms pour l'affichage (haut d'écran) pour éviter les bugs de police
function nettoyerPourAffichage(texte) {
  if (!texte) return '';
  return texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ç/g, "c").replace(/Ç/g, "C").toUpperCase();
}

// 3. Demande à Claude de générer un script humain avec accents
function genererScript(match) {
  return new Promise((resolve) => {
    const homeNom = nomNaturel(match.home.n);
    const awayNom = nomNaturel(match.away.n);
    const contexte = match.verdict_shark || match.analyse_card || (homeNom + ' contre ' + awayNom);

    const prompt = `Tu es un analyste foot data. Tu parles de manière naturelle et calme à ton audience.
    STYLE : Conversationnel, simple, fluide. Pas de cris.
    REGLES :
    1. MAXIMUM 35 MOTS (pour tenir en 15 secondes).
    2. UTILISE LES ACCENTS (é, à, ç) normalement. C'est vital pour la prononciation de l'IA.
    3. Phrases courtes. Utilise des "..." pour les petites pauses.
    4. Commence par une stat ou un fait direct.
    5. Termine par : "Tous les détails sont sur le site. À bientôt."
    
    MATCH : ${homeNom} vs ${awayNom}. ANALYSE : ${contexte}.
    Une seule ligne de texte continu.`;

    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001', 
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }]
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve((JSON.parse(data).content[0] || {}).text || ''); }
        catch(e) { resolve(''); }
      });
    });
    req.write(body);
    req.end();
  });
}

// 4. Envoie les données à Creatomate (Voix humaine + Noms propres)
function envoyerVersCreatomate(match, script) {
  return new Promise((resolve) => {
    const logoHome = 'https://media.api-sports.io/football/teams/' + match.home.id + '.png';
    const logoAway = 'https://media.api-sports.io/football/teams/' + match.away.id + '.png';

    const data = JSON.stringify({
      template_id: 'f5ff0fec-0cf2-41a2-bc4d-23c94c858b35', 
      modifications: {
        'VoiceOver_Audio': script, // On garde les ACCENTS pour que Donny parle bien !
        'Equipe_Dom_Nom': nettoyerPourAffichage(nomNaturel(match.home.n)),
        'Equipe_Ext_Nom': nettoyerPourAffichage(nomNaturel(match.away.n)),
        'Equipe_Dom_Logo': logoHome,
        'Equipe_Ext_Logo': logoAway
      }
    });

    const req = https.request({
      hostname: 'api.creatomate.com',
      path: '/v1/renders',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.CREATOMATE_KEY,
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve(null); } });
    });
    req.write(data);
    req.end();
  });
}

// 5. La boucle principale qui traite tous les matchs LDC
async function run() {
  try {
    if (!fs.existsSync('data.json')) throw new Error('data.json introuvable.');
    const content = JSON.parse(fs.readFileSync('data.json', 'utf8'));
    const ldcMatchs = (content.matchs || []).filter(m => m.league_key === 'ldc');

    if (!ldcMatchs.length) { console.log('Aucun match LDC aujourd\'hui.'); return; }

    console.log(`🦈 IA SHARK : Lancement de ${ldcMatchs.length} vidéos...`);

    for (const match of ldcMatchs) {
      console.log(`\n--- Match : ${match.home.n} vs ${match.away.n} ---`);
      
      let script = await genererScript(match);
      script = script.replace(/\n+/g, ' ').trim();
      
      if (!script) { console.log('⚠️ Script vide, match sauté.'); continue; }
      
      console.log('Script (humain) : ' + script);

      const res = await envoyerVersCreatomate(match, script);
      if (res && res[0]) {
        console.log(`✅ Vidéo envoyée au rendu !`);
        if (res[0].url) console.log(`🔗 Lien direct : ${res[0].url}`);
      }
    }
    console.log('\nFinit ! Les vidéos arrivent dans ton dashboard Creatomate.');
  } catch(err) {
    console.error('Erreur :', err.message);
    process.exit(1);
  }
}

run();
