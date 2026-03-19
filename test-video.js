const https = require('https');
const fs = require('fs');

// 1. Noms naturels pour l'oral
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

// 2. Nettoyage pour l'affichage visuel
function nettoyerPourAffichage(texte) {
  if (!texte) return '';
  return texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

// 3. Le Cerveau IA
function genererScript(match) {
  return new Promise((resolve) => {
    const homeNom = nomNaturel(match.home.n);
    const awayNom = nomNaturel(match.away.n);
    const scorePredit = match.score_predit ? match.score_predit.score : "Inconnu";
    const nomLigue = match.league || "Europa League";

    let scenariosText = "";
    if (match.scenario_15min) {
      scenariosText = match.scenario_15min.map(s => 
        `Tranche ${s.t} | Probabilité: ${s.prob} | Analyse: ${s.txt}`
      ).join('\n');
    }

    const prompt = `Tu es l'IA Shark. Écris un script TikTok de 35 secondes (environ 85 mots).
    COMPÉTITION : ${nomLigue}
    STRUCTURE STRICTE :
    1. Hook OBLIGATOIRE : "Dix mille stats analysées. Voici le scénario EXACT du match."
    2. Intro : Parle du match de ${nomLigue} entre ${homeNom} et ${awayNom}.
    3. Le Match : Raconte le scénario minute par minute basé sur ces données :
    ${scenariosText}
    (Sois percutant, marque les pauses avec des points).
    4. Score : "Le score prédit par l'algorithme est de : ${scorePredit}."
    5. Outro OBLIGATOIRE : "Tous les autres matchs sont dispos sur I A SHARK point com."
    
    IMPORTANT : Utilise les accents. Écris les nombres en lettres.`;

    const body = JSON.stringify({
      model: 'claude-3-5-haiku-20241022', 
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        // ⚠️ REMPLACE 'sk-ant-...' PAR TA VRAIE CLÉ CI-DESSOUS :
        'x-api-key': process.env.ANTHROPIC_KEY || 'sk-ant-api03-METS_TA_CLE_ICI', 
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve((parsed.content && parsed.content[0]) ? parsed.content[0].text : '');
        } catch(e) { resolve(''); }
      });
    });
    req.write(body);
    req.end();
  });
}

// 4. Envoi à Creatomate
function envoyerVersCreatomate(match, script) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      template_id: 'f5ff0fec-0cf2-41a2-bc4d-23c94c858b35', // ID déjà mis à jour !
      modifications: {
        'Hook_Texte': "SIMULATION TERMINÉE ⏳",
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
    req.write(payload);
    req.end();
  });
}

// 5. Exécution
async function run() {
  try {
    const content = JSON.parse(fs.readFileSync('data.json', 'utf8'));
    const matches = (content.matchs || content).filter(m => m.league_key === 'el');
    if (!matches.length) { console.log("Aucun match EL trouvé."); return; }

    const match = matches[0];
    console.log(`\n🦈 TEST EUROPA LEAGUE : ${match.home.n} vs ${match.away.n}`);

    const script = await genererScript(match);
    if (!script) {
        console.log("❌ Le script est vide. Vérifie ta clé API Anthropic à la ligne 58.");
        return;
    }
    console.log(`\n🗣️ SCRIPT GÉNÉRÉ :\n${script}`);

    const res = await envoyerVersCreatomate(match, script);
    console.log(`\n✅ Réponse Creatomate :`, JSON.stringify(res));

  } catch(err) {
    console.error('❌ ERREUR :', err.message);
  }
}

run();
