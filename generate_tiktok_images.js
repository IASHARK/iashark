const https = require('https');
const fs = require('fs');

// 1. Rend les noms des clubs naturels (On garde ta fonction)
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
    'LOSC Lille': 'Lille', 'LOSC': 'Lille',
    'Olympique Lyonnais': 'Lyon', 'Olympique Lyon': 'Lyon'
  };
  for (const key of Object.keys(map)) {
    if (nom.toLowerCase().includes(key.toLowerCase())) return map[key];
  }
  return nom;
}

// 2. Nettoie les noms pour l'affichage (On garde ta fonction)
function nettoyerPourAffichage(texte) {
  if (!texte) return '';
  return texte.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ç/g, "c").replace(/Ç/g, "C").toUpperCase();
}

// 3. Demande à Claude HAIKU de générer les STATS exactes basées sur ton fichier
function genererStatsJSON(match) {
  return new Promise((resolve) => {
    const homeNom = nomNaturel(match.home.n);
    const awayNom = nomNaturel(match.away.n);
    const scorePredit = match.score_predit ? match.score_predit.score : "2-1"; // Fallback
    
    let scenariosText = "";
    if (match.scenario_15min) {
      scenariosText = match.scenario_15min.map(s => `Tranche ${s.t}: ${s.txt}`).join('\n');
    }

    // Le prompt est modifié : on demande à Claude de sortir un JSON strict avec des chiffres
    const prompt = `Agis comme un analyste data IA. Voici les données et scénarios du match entre ${homeNom} et ${awayNom} :
    Score de base prévu : ${scorePredit}
    Scénarios :
    ${scenariosText}
    
    En te basant UNIQUEMENT sur l'intensité de ces scénarios, estime les statistiques globales du match.
    Tu dois renvoyer STRICTEMENT ET UNIQUEMENT un objet JSON valide, sans aucun autre texte avant ou après.
    Voici le format exact attendu :
    {
      "score_dom": 2,
      "score_ext": 1,
      "plus_de_25_buts": true,
      "btts": true,
      "tirs_totaux": 24,
      "tirs_cadres": 9,
      "corners": 10,
      "cartons_jaunes": 4,
      "cartons_rouges": 0
    }`;

    // On garde EXACTEMENT le modèle que tu m'as demandé
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
            if(parsed.error) {
                console.log("🚨 ERREUR CLAUDE :", parsed.error.message);
                resolve(null);
            } else {
                // On parse le texte de Claude qui doit être un JSON
                const statsJSON = JSON.parse(parsed.content[0].text);
                resolve(statsJSON);
            }
        }
        catch(e) { 
            console.log("🚨 ERREUR PARSING CLAUDE : L'IA n'a pas renvoyé un JSON valide.");
            resolve(null); 
        }
      });
    });
    req.write(body);
    req.end();
  });
}

// 4. Envoie à Creatomate avec le NOUVEAU template d'image
function envoyerVersCreatomateImage(match, stats) {
  return new Promise((resolve) => {
    const logoHome = 'https://media.api-sports.io/football/teams/' + match.home.id + '.png';
    const logoAway = 'https://media.api-sports.io/football/teams/' + match.away.id + '.png';

    const data = JSON.stringify({
      template_id: 'c9cdb560-9789-469c-8ba1-3658cb15c50b', // Ton nouveau template IMAGE
      modifications: {
        // Les Logos et Noms
        'Logo_Domicile': logoHome,
        'Logo_Exterieur': logoAway,
        'Nom_EquipeDom': nettoyerPourAffichage(nomNaturel(match.home.n)),
        'Nom_EquipeExt': nettoyerPourAffichage(nomNaturel(match.away.n)),
        
        // Les Scores
        'Score_Prediction_Dom': stats.score_dom.toString(),
        'Score_Prediction_Ext': stats.score_ext.toString(),

        // Les Textes
        'Prediction_Buts25': stats.plus_de_25_buts ? "+ 2.5 BUTS" : "- 2.5 BUTS",
        'Prediction_BTTS': stats.btts ? "OUI" : "NON",

        // LES CHIFFRES PURS
        'Prediction_TirsTotaux': stats.tirs_totaux.toString(),
        'Prediction_TirsCadres': stats.tirs_cadres.toString(),
        'Prediction_Corners': stats.corners.toString(),
        'Prediction_YellowCards': stats.cartons_jaunes.toString(),
        'Prediction_RedCard': stats.cartons_rouges.toString()
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
    
    // Filtre : Exclure Braga et chercher Lille OU Lyon (On garde ta logique)
    const matchsCibles = (content.matchs || []).filter(m => {
      const home = m.home.n.toLowerCase();
      const away = m.away.n.toLowerCase();
      
      if (home.includes('braga') || away.includes('braga')) return false;
      return home.includes('lille') || away.includes('lille') || 
             home.includes('lyon') || away.includes('lyon');
    });

    if (!matchsCibles.length) { 
        console.log('Aucun match cible trouvé dans data.json.'); 
        return; 
    }

    console.log(`🦈 IA SHARK : Lancement GÉNÉRATION IMAGES pour ${matchsCibles.length} match(s)...`);

    for (const match of matchsCibles) {
      console.log(`\n--- Analyse Claude Haiku : ${match.home.n} vs ${match.away.n} ---`);
      
      // On demande les stats à Claude
      const statsGenerees = await genererStatsJSON(match);
      
      if (!statsGenerees) { 
        console.log('⚠️ Impossible de générer les stats avec Claude pour ce match.'); 
        continue; 
      }
      
      console.log('Stats extraites du data.json par Claude :', statsGenerees);

      // On envoie à Creatomate
      const res = await envoyerVersCreatomateImage(match, statsGenerees);
      
      if (res && res[0]) {
        console.log(`✅ Image envoyée au rendu pour ${match.home.n} vs ${match.away.n} !`);
        if (res[0].url) console.log(`🔗 Lien direct : ${res[0].url}`);
      }
    }
  } catch(err) {
    console.error('Erreur :', err.message);
    process.exit(1);
  }
}

run();
