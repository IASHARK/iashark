const https = require('https');
const fs = require('fs');

// Fonction pour rendre le texte 100% oral et naturel
function humaniserTexte(text) {
    if (!text) return "Analyse en cours.";
    
    return text
        .replace(/\*\*/g, '')                         // Enlève les gras **
        .replace(/2\.5/g, 'deux buts et demi')        // 2.5 -> oral
        .replace(/1\.5/g, 'un but et demi')          // 1.5 -> oral
        .replace(/0\.5/g, 'un demi but')
        .replace(/%/g, ' pour cent')                  // % -> pour cent
        .replace(/\./g, '...')                        // Remplace points par pauses
        .replace(/,/g, '...')                         // Remplace virgules par micro-pauses
        .replace(/vs/gi, 'contre')                    // vs -> contre
        .replace(/xG/gi, 'expected goals')            // xG -> terme complet
        .trim();
}

// Nettoyage des noms pour pas que la voix dise "Manchester City Football Club"
function nomNaturel(nom) {
    if (!nom) return '';
    const map = {
        'FC Barcelona': 'le Barça', 'Barcelona': 'le Barça',
        'Newcastle': 'Newcastle', 'Manchester City': 'City',
        'Real Madrid': 'le Real', 'Bayern Munich': 'le Bayern',
        'Sporting CP': 'le Sporting', 'Paris Saint Germain': 'le PSG',
        'Atletico Madrid': "l'Atlético", 'Juventus': 'la Juve'
    };
    for (const key in map) {
        if (nom.includes(key)) return map[key];
    }
    return nom;
}

async function envoyerVersCreatomate(match) {
    return new Promise((resolve) => {
        const scoreSite = (match.scores_probables || "1-0").split(',')[0].trim();
        
        // --- FILTRAGE ANTI-ROBOT ICI ---
        const texteBrut = match.analyse_card || match.verdict_shark || "Analyse indisponible";
        const textePourLaVoix = humaniserTexte(texteBrut);
        
        const idHome = match.home.id || 85;
        const idAway = match.away.id || 85;

        console.log(`🎙️ Texte envoyé à ElevenLabs : ${textePourLaVoix.slice(0, 100)}...`);

        const data = JSON.stringify({
            template_id: '00468af0-fdc7-4490-81ad-d56b15f773d1',
            modifications: {
                "Logo_Domicile": `https://media.api-sports.io/football/teams/${idHome}.png`,
                "Logo_Exterieur": `https://media.api-sports.io/football/teams/${idAway}.id}.png`,
                "Equipe_Dom": nomNaturel(match.home.n || match.home),
                "Equipe_Ext": nomNaturel(match.away.n || match.away),
                "Score_Probable": scoreSite,
                "Voix_IA": textePourLaVoix // LE TEXTE EST MAINTENANT FLUIDE
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
        if (!fs.existsSync('data.json')) throw new Error("Fichier data.json absent.");
        const content = JSON.parse(fs.readFileSync('data.json', 'utf8'));
        const ldcMatchs = (content.matchs || []).filter(m => m.league_key === 'ldc');

        if (ldcMatchs.length > 0) {
            const match = ldcMatchs.sort((a, b) => (b.conf || 0) - (a.conf || 0))[0];
            console.log(`🦈 SHARK MODE : Vidéo pour ${match.home.n} vs ${match.away.n}`);
            const res = await envoyerVersCreatomate(match);
            
            if (res && res[0]) {
                console.log(`✅ VIDÉO GÉNÉRÉE : ${res[0].url}`);
            } else {
                console.log("⚠️ Erreur :", JSON.stringify(res, null, 2));
            }
        }
    } catch (err) {
        console.error("❌ Erreur :", err.message);
    }
}
run();
