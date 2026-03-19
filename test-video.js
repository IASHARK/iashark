const https = require('https');
const fs = require('fs');

// 1. Configuration des noms pour l'oral (IA)
function nomNaturel(nom) {
  if (!nom) return '';
  const map = {
    'Bayern München': 'le Bayern', 'Real Madrid': 'le Real', 'Manchester City': 'City',
    'Paris Saint Germain': 'le PSG', 'Atletico Madrid': "l'Atlético", 'Inter Milan': "l'Inter",
    'AC Milan': 'le Milan', 'Juventus': 'la Juve', 'FC Barcelona': 'le Barça',
    'Tottenham Hotspur': 'Tottenham', 'Newcastle United': 'Newcastle', 'Galatasaray': 'Galatasaray'
  };
  for (const key of Object.keys(map)) {
    if (nom.toLowerCase().includes(key.toLowerCase())) return map[key];
  }
  return nom;
}

// 2. Nettoyage pour l'affichage visuel (Hook)
function nettoyerPourAffichage(texte) {
  if (!texte) return '';
  return texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
}

// 3. Le Cerveau IA : Génération du script de 35 secondes
function genererScript(match) {
  return new Promise((resolve) => {
    const homeNom = nomNaturel(match.home.n);
    const awayNom = nomNaturel(match.away.n);
    const scorePredit = match.score_predit ? match.score_predit.score : "Inconnu";
    const nomLigue = match.league || "Europa League";

    // On prépare tes données 15-15 pour l'IA
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
    2. Intro : Mentionne le match de ${nomLigue} entre ${homeNom} et ${awayNom}.
    3. Le Match : Utilise ces données pour raconter le match minute par minute :
    ${scenariosText}
    (Fais monter la pression sur les moments à forte probabilité, sois percutant).
    4. Score : "Le score prédit par l'algorithme est de : ${scorePredit}."
    5. Outro OBLIGATOIRE : "Tous les autres matchs sont dispos sur I A SHARK point com."
    
    IMPORTANT : Utilise les accents. Écris les nombres en lettres (soixante, quinze). Fais des pauses avec des points.`;

    const body = JSON.stringify({
      model: 'claude-3-5-haiku-20241022', 
      max_tokens: 450,
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

// 4. Envoi à Creatomate (Paramètres 35s)
function envoyerVersCreatomate(match, script) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      template_id: 'TON_ID_TEMPLATE_ICI', // ⚠️ METS TON NOUVEAU ID ICI
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

// 5. Exécution (Debug & Filtre Europa League)
async function run() {
  try {
    if (!fs.existsSync('data.json')) throw new Error('data.json manquant.');
    const content = JSON.parse(fs.readFileSync('data.json', 'utf8'));
    
    // Gère si ton JSON a une clé "matchs" ou s'il est un tableau direct
    const tousLesMatchs = content.matchs || content;
    
    // Filtre sur l'Europa League (el)
    const matchesEL = tousLesMatchs.filter(m => m.league_key === 'el');

    if (matchesEL.length === 0) {
      console.log("⚠️ Aucun match 'el' trouvé. Codes dispo :", [...new Set(tousLesMatchs.map(m => m.league_key))]);
      return;
    }

    const match = matchesEL[0]; // On prend le 1er match pour le test
    console.log(`\n🦈 TEST EUROPA LEAGUE : ${match.home.n} vs ${match.away.n}`);

    const script = await genererScript(match);
    console.log(`\n🗣️ SCRIPT GÉNÉRÉ :\n${script}`);

    const res = await envoyerVersCreatomate(match, script);
    console.log(`\n✅ Réponse Creatomate :`, JSON.stringify(res));

  } catch(err) {
    console.error('❌ ERREUR :', err.message);
  }
}

run();
