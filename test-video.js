const https = require('https');
const fs = require('fs');

// 1. Rend les noms des clubs naturels pour l'IA (oral)
function nomNaturel(nom) {
  if (!nom) return '';
  const map = {
    'Bayern München': 'le Bayern', 'Real Madrid': 'le Real', 'Manchester City': 'City',
    'Paris Saint Germain': 'le PSG', 'Atletico Madrid': "l'Atlético", 'Inter Milan': "l'Inter",
    'FC Barcelona': 'le Barça', 'SC Braga': 'Braga', 'Ferencvarosi TC': 'Ferencvaros'
  };
  for (const key of Object.keys(map)) {
    if (nom.toLowerCase().includes(key.toLowerCase())) return map[key];
  }
  return nom;
}

// 2. Nettoie les noms pour l'affichage
function nettoyerPourAffichage(texte) {
  if (!texte) return '';
  return texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ç/g, "c").toUpperCase();
}

// 3. Demande à Claude de générer le script (35 secondes + Scénarios 15min)
function genererScript(match) {
  return new Promise((resolve) => {
    const homeNom = nomNaturel(match.home.n);
    const awayNom = nomNaturel(match.away.n);
    const scorePredit = match.score_predit ? match.score_predit.score : "0-0";
    
    // On prépare le texte des tranches de 15 minutes pour Claude
    const scenariosText = (match.scenario_15min || []).map(s => 
      `Tranche ${s.t} (Intensité ${s.prob}): ${s.txt}`
    ).join('\n');

    const prompt = `Tu es l'IA Shark. Fais un script de 35 secondes (environ 85 mots).
    STYLE : Expert, percutant, monte en pression.
    
    RÈGLES :
    1. HOOK OBLIGATOIRE : "Dix mille stats analysées. Voici le scénario EXACT du match."
    2. ANALYSE : Utilise ces données pour détailler le match minute par minute :
    ${scenariosText}
    3. SCORE : Annonce le score prédit de ${scorePredit}.
    4. OUTRO OBLIGATOIRE : "Tous les autres matchs sont dispos sur I A SHARK point com."
    
    Utilise les accents normalement. Écris les nombres en lettres. Un seul bloc de texte.`;

    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001', 
      max_tokens: 400,
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

// 4. Envoie à Creatomate
function envoyerVersCreatomate(match, script) {
  return new Promise((resolve) => {
    const data = JSON.stringify({
      template_id: 'f5ff0fec-0cf2-41a2-bc4d-23c94c858b35', 
      modifications: {
        'VoiceOver_Audio': script,
        'Equipe_Dom_Nom': nettoyerPourAffichage(nomNaturel(match.home.n)),
        'Equipe_Ext_Nom': nettoyerPourAffichage(nomNaturel(match.away.n)),
        'Equipe_Dom_Logo': `https://media.api-sports.io/football/teams/${match.home.id}.png`,
        'Equipe_Ext_Logo': `https://media.api-sports.io/football/teams/${match.away.id}.png`
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

// 5. Run (Filtre Europa League 'el' + Test sur 1 match)
async function run() {
  try {
    const content = JSON.parse(fs.readFileSync('data.json', 'utf8'));
    const matches = (content.matchs || content).filter(m => m.league_key === 'el');

    if (!matches.length) { console.log('Aucun match Europa League trouvé.'); return; }

    const match = matches[0]; // On prend le premier pour le test
    console.log(`\n🚀 TEST EUROPA LEAGUE : ${match.home.n} vs ${match.away.n}`);

    let script = await genererScript(match);
    script = script.replace(/\n+/g, ' ').trim();
    
    if (!script) { console.log('⚠️ Script vide.'); return; }
    console.log('🗣️ Script généré : ' + script);

    const res = await envoyerVersCreatomate(match, script);
    console.log(`✅ Envoyé ! Lien :`, JSON.stringify(res));

  } catch(err) {
    console.error('Erreur :', err.message);
  }
}

run();
