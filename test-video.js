const https = require('https');
const fs = require('fs');

// Convertit les noms d'équipes en noms naturels pour la voix
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

// Convertit la forme WWWDW en texte oral
function formeEnTexte(forme) {
  if (!forme) return '';
  const map = { 'W': 'victoire', 'D': 'nul', 'L': 'défaite' };
  const mots = forme.split('').map(c => map[c] || c);
  const nb = mots.length;
  const wins = forme.split('').filter(c => c === 'W').length;
  return `${wins} victoire${wins > 1 ? 's' : ''} sur les ${nb} derniers matchs`;
}

// Convertit un décimal en texte oral
function nombreEnTexte(n) {
  if (!n) return '?';
  const m = { '0.5': 'zéro virgule cinq', '1.5': 'un but et demi', '2.5': 'deux buts et demi', '3.5': 'trois buts et demi', '4.5': 'quatre buts et demi' };
  return m[String(n)] || String(n).replace('.', ' virgule ');
}

// Appel Claude pour générer le script vocal
function genererScript(match) {
  return new Promise((resolve) => {
    const nomDomStr = match.home.n || match.home || 'Domicile';
    const nomExtStr = match.away.n || match.away || 'Extérieur';
    const homeNom = nomNaturel(nomDomStr);
    const awayNom = nomNaturel(nomExtStr);
    const scoreProb = match.scores_probables || '1-0, 2-0, 2-1';
    const scenarioIA = match.pari_rec || 'victoire à domicile';
    const xgH = match.xgH_avg || match.xg_home || match.xg || '?';
    const xgA = match.xgA_avg || match.xg_away || '?';
    const formeH = formeEnTexte(match.forme5H || match.forme_home || match.formeH || '');
    const formeA = formeEnTexte(match.forme5A || match.forme_away || match.formeA || '');
    const conseil = match.conseil || '';

    const prompt = `Tu es le meilleur analyste data football sur TikTok. Ton but est d'écrire le script vocal d'une vidéo courte de vingt-cinq secondes maximum pour prédire le scénario d'un match.

RÈGLES STRICTES :
1. NOMS D'ÉQUIPES : Utilise uniquement "${homeNom}" et "${awayNom}". Jamais les noms officiels complets.
2. ZÉRO JARGON DE PARIEUR : Bannis totalement "cote", "bookmaker", "pari", "mise", "ticket", "pronostic". Utilise uniquement "probabilités", "data", "scénario", "tendance".
3. ÉCRIT POUR L'ORAL : Zéro abréviation. Écris les chiffres en lettres. Utilise des points de suspension (...) pour les pauses.
4. TON : Cash, expert, direct. Commence DIRECTEMENT avec une stat choc ou l'enjeu. Jamais "Bonjour" ou "Bienvenue".
5. STRUCTURE EN 3 TEMPS :
   - Phrase 1 (hook) : une stat ou un fait qui arrête le scroll
   - Phrase 2-3 : la tendance data qui explique le scénario
   - Phrase finale : le score le plus probable annoncé avec conviction

DONNÉES DU MATCH :
- Équipe domicile : ${homeNom} (xG moyen : ${nombreEnTexte(xgH)}, forme : ${formeH})
- Équipe extérieur : ${awayNom} (xG moyen : ${nombreEnTexte(xgA)}, forme : ${formeA})
- Scénario calculé par l'IA : ${scenarioIA}
- Scores les plus probables : ${scoreProb}
- Analyse : ${conseil}

Rédige UNIQUEMENT le script que la voix off va lire. Zéro blabla avant ou après. Maximum vingt-cinq secondes à l'oral.`;

    const body = JSON.stringify({
      model: 'claude-3-haiku-20240307', // CORRECTION : Le vrai modèle API qui fonctionne
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
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const r = JSON.parse(data);
          resolve((r.content && r.content[0] && r.content[0].text) || '');
        } catch(e) { resolve(''); }
      });
    });
    req.on('error', () => resolve(''));
    req.write(body);
    req.end();
  });
}

// Envoi vers Creatomate
function envoyerVersCreatomate(match, scriptVocal) {
  return new Promise((resolve) => {
    // CORRECTION : Sécurité si le format JSON change un peu
    const idHome = match.home.id || match.home_id || 85;
    const idAway = match.away.id || match.away_id || 85;
    const logoHome = `https://media.api-sports.io/football/teams/${idHome}.png`;
    const logoAway = `https://media.api-sports.io/football/teams/${idAway}.png`;
    const scoreProb = (match.scores_probables || '1-0').split(',')[0].trim();
    
    const nomDomStr = match.home.n || match.home || 'Domicile';
    const nomExtStr = match.away.n || match.away || 'Extérieur';

    const data = JSON.stringify({
      template_id: '00468af0-fdc7-4490-81ad-d56b15f773d1',
      modifications: {
        'Logo_Domicile': logoHome,
        'Logo_Exterieur': logoAway,
        'Voix_IA': scriptVocal,
        'Score_Probable': scoreProb,
        'Equipe_Dom': nomNaturel(nomDomStr),
        'Equipe_Ext': nomNaturel(nomExtStr),
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
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch(e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.write(data);
    req.end();
  });
}

async function run() {
  try {
    console.log('Lecture de data.json...');
    if (!fs.existsSync('data.json')) {
      throw new Error('data.json introuvable. Lance le pipeline principal d\'abord.');
    }

    const content = JSON.parse(fs.readFileSync('data.json', 'utf8'));
    const ldcMatchs = (content.matchs || []).filter(m => m.league_key === 'ldc');

    if (!ldcMatchs.length) {
      console.log('Aucun match LDC trouvé aujourd\'hui.');
      return;
    }

    // Un seul match — le meilleur par confiance
    const match = ldcMatchs.sort((a, b) => (b.conf || 0) - (a.conf || 0))[0];
    const nomDomStr = match.home.n || match.home || 'Domicile';
    const nomExtStr = match.away.n || match.away || 'Extérieur';
    console.log(`Match sélectionné : ${nomDomStr} vs ${nomExtStr}`);

    console.log('Génération du script vocal avec Claude...');
    const script = await genererScript(match);
    console.log('\n=== SCRIPT GÉNÉRÉ ===');
    console.log(script);
    console.log('=====================\n');

    if (!script) {
      throw new Error('Script vide — vérifier la clé ANTHROPIC_KEY.');
    }

    console.log('Envoi vers Creatomate...');
    const res = await envoyerVersCreatomate(match, script);

    if (res && res[0] && res[0].url) {
      console.log(`Succès ! Vidéo disponible : ${res[0].url}`);
    } else if (res && res[0] && res[0].id) {
      console.log(`Rendu lancé. ID : ${res[0].id} — Statut : ${res[0].status}`);
    } else {
      console.log('Réponse Creatomate :', JSON.stringify(res, null, 2));
    }

  } catch(err) {
    console.error('Erreur :', err.message);
    process.exit(1);
  }
}

run();
