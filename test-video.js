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
    'SC Braga': 'Braga', 'Ferencvarosi TC': 'Ferencvaros',
    // Ajouts pour ce soir
    'LOSC Lille': 'Lille', 'LOSC': 'Lille',
    'Olympique Lyonnais': 'Lyon', 'Olympique Lyon': 'Lyon'
  };
  for (const key of Object.keys(map)) {
    if (nom.toLowerCase().includes(key.toLowerCase())) return map[key];
  }
  return nom;
}

// 2. Nettoie les noms pour l'affichage
function nettoyerPourAffichage(texte) {
  if (!texte) return '';
  return texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ç/g, "c").replace(/Ç/g, "C").toUpperCase();
}

// 3. Demande à Claude
function genererScript(match) {
  return new Promise((resolve) => {
    const homeNom = nomNaturel(match.home.n);
    const awayNom = nomNaturel(match.away.n);
    const scorePredit = match.score_predit ? match.score_predit.score : "Inconnu";
    
    let scenariosText = "";
    if (match.scenario_15min) {
      scenariosText = match.scenario_15min.map(s => `Tranche ${s.t}: ${s.txt}`).join('\n');
    }

    const prompt = `Agis comme l'IA Shark. Rédige UNIQUEMENT le texte à prononcer pour une voix off.
    LONGUEUR IMPÉRATIVE : Le texte doit durer 40 secondes MAXIMUM à l'oral (environ 90 à 100 mots). Sois concis.
    RÈGLE ABSOLUE : Ne mets aucun titre, aucune introduction du type "Voici le script". Commence directement par le Hook.

    HOOK : Invente une phrase d'accroche très percutante pour lancer la vidéo ! Utilise des points d'exclamation pour obliger la voix off à mettre un maximum d'énergie !
    
    ANALYSE : Détaille de manière fluide le match de ${match.league || "Europa League"} entre ${homeNom} et ${awayNom} avec ces données minute par minute :
    ${scenariosText}
    
    SCORE : Enchaîne avec : "Le score prédit est de : ${scorePredit}."
    OUTRO OBLIGATOIRE (dernière phrase exacte) : "Tous les autres matchs sont dispos sur I A SHARK point com."
    
    CONTRAINTES DE FORMAT : 
    - Écris ABSOLUMENT TOUS les nombres en toutes lettres (ex: "quarante-cinquième").
    - Fais un texte fluide et naturel à l'oral, sans puces ni tirets.
    - INTERDICTION FORMELLE de parler de joueurs. Ne cite AUCUN nom de joueur, parle uniquement des clubs.`;

    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001', 
      max_tokens: 300,
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

// 4. Envoie à Creatomate
function envoyerVersCreatomate(match, script) {
  return new Promise((resolve) => {
    const logoHome = 'https://media.api-sports.io/football/teams/' + match.home.id + '.png';
    const logoAway = 'https://media.api-sports.io/football/teams/' + match.away.id + '.png';

    const data = JSON.stringify({
      template_id: 'f5ff0fec-0cf2-41a2-bc4d-23c94c858b35', 
      modifications: {
        'VoiceOver_Audio': script,
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

// 5. La boucle principale
async function run() {
  try {
    if (!fs.existsSync('data.json')) throw new Error('data.json introuvable.');
    const content = JSON.parse(fs.readFileSync('data.json', 'utf8'));
    
    // Filtre : Exclure Braga et chercher Lille OU Lyon
    const matchsCibles = (content.matchs || []).filter(m => {
      const home = m.home.n.toLowerCase();
      const away = m.away.n.toLowerCase();
      
      if (home.includes('braga') || away.includes('braga')) return false;
      return home.includes('lille') || away.includes('lille') || 
             home.includes('lyon') || away.includes('lyon');
    });

    if (!matchsCibles.length) { 
        console.log('Aucun match de Lille ou Lyon trouvé dans data.json.'); 
        return; 
    }

    console.log(`🦈 IA SHARK : Lancement pour ${matchsCibles.length} match(s) ciblé(s)...`);

    // On traite tous les matchs trouvés (Lille et/ou Lyon)
    for (const match of matchsCibles) {
      console.log(`\n--- Match : ${match.home.n} vs ${match.away.n} ---`);
      
      let script = await genererScript(match);
      script = script.replace(/\n+/g, ' ').trim();
      
      if (!script) { 
        console.log('⚠️ Script vide pour ce match.'); 
        continue; 
      }
      
      console.log('Script (généré) : \n' + script);

      const res = await envoyerVersCreatomate(match, script);
      if (res && res[0]) {
        console.log(`✅ Vidéo envoyée au rendu pour ${match.home.n} vs ${match.away.n} !`);
        if (res[0].url) console.log(`🔗 Lien direct : ${res[0].url}`);
      }
    }
  } catch(err) {
    console.error('Erreur :', err.message);
    process.exit(1);
  }
}

run();
