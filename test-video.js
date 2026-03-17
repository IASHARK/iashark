const https = require('https');
const fs = require('fs');

// Fonction pour nettoyer les noms pour la voix (on enlève les détails inutiles)
function nomOral(nom) {
    if (!nom) return '';
    const map = {
        'Manchester City FC': 'Manchester City',
        'Bayern München': 'le Bayern Munich',
        'Real Madrid CF': 'le Real Madrid',
        'Paris Saint-Germain FC': 'le PSG',
        'Sporting CP': 'le Sporting Lisbonne',
    };
    for (const key in map) { if (nom.includes(key)) return map[key]; }
    return nom;
}

// ÉTAPE 1 : Claude génère un script oral de 25s
async function genererScript(match) {
    return new Promise((resolve) => {
        const home = nomOral(match.home.n);
        const away = nomOral(match.away.n);
        const analyseBrute = match.analyse_card || match.verdict_shark || "";

        // PROMPT SHARK : On lui donne le persona et les données
        const prompt = `Tu es "The Shark", le meilleur analyste foot sur TikTok. Écris un script vocal de 25 secondes maximum pour une vidéo.

DONNÉES :
- Match : ${home} vs ${away}
- Analyse du site : ${analyseBrute}
- Confiance : ${match.conf || 'moyenne'} / 10

RÈGLES DE SCRIPT :
1. **Persona** : Énergique, percutant, parle direct. Pas de bla-bla.
2. **Oral** : Écris exactement comment ça doit être dit. Utilise "..." pour les pauses. Pas d'abréviations.
3. **Contenu** : Donne le scénario du match et ton verdict, mais ne dis pas "expected goals". Dis "data offensives".
4. **Conclusion** : Termine par une phrase qui engage.

Rédige UNIQUEMENT le texte vocal du script, rien d'autre.`;

        const body = JSON.stringify({
            model: 'claude-3-5-sonnet-20241022',
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
                    if (r.content && r.content[0] && r.content[0].text) {
                        resolve(r.content[0].text);
                    } else { resolve(analyseBrute.slice(0, 300)); } // Repli
                } catch(e) { resolve(analyseBrute.slice(0, 300)); }
            });
        });
        req.on('error', () => resolve(analyseBrute.slice(0, 300)));
        req.write(body);
        req.end();
    });
}

// ÉTAPE 2 : Envoi à Creatomate
async function envoyerVersCreatomate(match, script) {
    return new Promise((resolve) => {
        // CORRECTION LOGOS : On utilise l'ID principal de l'équipe (API-Sports)
        // Les logos sans fond sont souvent des PNG. Si tu as un carré blanc,
        // c'est que ton template Creatomate n'a pas un masque rond ou que l'image source est un JPG.
        const idHome = match.home.id;
        const idAway = match.away.id;

        console.log(`📡 Envoi à Creatomate...`);
        console.log(`🎙️ Script vocal : ${script}`);

        const data = JSON.stringify({
            template_id: '00468af0-fdc7-4490-81ad-d56b15f773d1',
            modifications: {
                // Liens direct vers les logos officiels (PNG transparents normalement)
                "Logo_Domicile": `https://media.api-sports.io/football/teams/${idHome}.png`,
                "Logo_Exterieur": `https://media.api-sports.io/football/teams/${idAway}.png`,
                "Equipe_Dom": match.home.n, // On garde le nom complet pour l'affichage
                "Equipe_Ext": match.away.n,
                "Score_Probable": (match.scores_probables || "1-0").split(',')[0].trim(),
                "Voix_IA": script // Maintenant c'est le script de Claude !
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
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve(JSON.parse(body)));
        });

        req.on('error', () => resolve(null));
        req.write(data);
        req.end();
    });
}

async function run() {
    try {
        if (!fs.existsSync('data.json')) throw new Error("data.json absent.");
        const content = JSON.parse(fs.readFileSync('data.json', 'utf8'));
        
        // On cible uniquement les matchs LDC
        const ldcMatchs = (content.matchs || []).filter(m => m.league_key === 'ldc');

        if (ldcMatchs.length > 0) {
            // On prend LE meilleur match (plus haute confiance)
            const match = ldcMatchs.sort((a, b) => (b.conf || 0) - (a.conf || 0))[0];
            
            console.log(`🦈 SHARK MODE ACTIVÉ : ${match.home.n} vs ${match.away.n}`);
            
            // 1. On demande à Claude d'écrire le script
            console.log("✍️ Génération du script vocal par Claude...");
            const scriptVocal = await genererScript(match);
            
            // 2. On envoie tout à Creatomate
            const res = await envoyerVersCreatomate(match, scriptVocal);
            
            if (res && res[0]) {
                console.log(`✅ VIDÉO EN COURS : ${res[0].url}`);
            } else {
                console.log("⚠️ Erreur :", JSON.stringify(res, null, 2));
            }
        }
    } catch (err) {
        console.error("❌ Erreur :", err.message);
    }
}
run();
