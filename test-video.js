const https = require('https');
const fs = require('fs');

function nomNaturel(nom) {
  if (!nom) return '';
  const map = {
    'Bayern München': 'le Bayern', 'Real Madrid': 'le Real', 'Manchester City': 'City',
    'Paris Saint Germain': 'le PSG', 'Atletico Madrid': "l'Atlético", 'Inter Milan': "l'Inter",
    'AC Milan': 'le Milan', 'Juventus': 'la Juve', 'FC Barcelona': 'le Barça',
    'SC Braga': 'Braga', 'Ferencvarosi TC': 'Ferencvaros'
  };
  for (const key of Object.keys(map)) {
    if (nom.toLowerCase().includes(key.toLowerCase())) return map[key];
  }
  return nom;
}

function nettoyerPourAffichage(texte) {
  if (!texte) return '';
  return texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ç/g, "c").toUpperCase();
}

function genererScript(match) {
  return new Promise((resolve) => {
    const homeNom = nomNaturel(match.home.n);
    const awayNom = nomNaturel(match.away.n);
    const scorePredit = match.score_predit ? match.score_predit.score : "Inconnu";
    
    // On prend tes données 15min
    const scenariosText = (match.scenario_15min || []).map(s => `Tranche ${s.t}: ${s.txt}`).join('\n');

    const prompt = `Tu es l'IA Shark. Fais un script de 35 secondes (environ 85 mots).
    HOOK : "Dix mille stats analysées. Voici le scénario EXACT du match."
    ANALYSE : Détaille le match de ${match.league} entre ${homeNom} et ${awayNom} avec ces données : ${scenariosText}. Fais monter la pression.
    SCORE : "Le score prédit est de : ${scorePredit}."
    OUTRO : "Tous les autres matchs sont dispos sur I A SHARK point com."
    Utilise les accents, écris les nombres en lettres.`;

    const body = JSON.stringify({
      model: 'claude-3-5-haiku-20241022', 
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }]
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_KEY, // <-- C'EST REVENU COMME AVANT
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { 
            const parsed = JSON.parse(data);
            if(parsed.error) console.log("🚨 ERREUR CLAUDE :", parsed.error.message);
            resolve((parsed.content && parsed.content[0]) ? parsed.content[0].text : ''); 
        }
        catch(e) { resolve(''); }
      });
    });
    req.write(body);
    req.end();
  });
}

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
        'Authorization': 'Bearer ' + process.env.CREATOMATE_KEY, // <-- COMME AVANT
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

async function run() {
  try {
    const content = JSON.parse(fs.readFileSync('data.json', 'utf8'));
    const matches = (content.matchs || content).filter(m => m.league_key === 'el');
    if (!matches.length) return;
    
    const match = matches[0];
    console.log(`\n🦈 TEST EUROPA LEAGUE : ${match.home.n} vs ${match.away.n}`);

    let script = await genererScript(match);
    if (!script) { console.log('⚠️ Erreur script vide.'); return; }
    
    console.log('🗣️ Script : ' + script);
    const res = await envoyerVersCreatomate(match, script);
    console.log(`✅ Envoyé ! Lien :`, JSON.stringify(res));

  } catch(err) {
    console.error('Erreur :', err.message);
  }
}

run();
