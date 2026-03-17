const https = require('https');
const fs = require('fs');

async function envoyerVersCreatomate(match) {
    return new Promise((resolve) => {
        const idHome = match.home.id || 85;
        const idAway = match.away.id || 85;

        const data = JSON.stringify({
            template_id: '00468af0-fdc7-4490-81ad-d56b15f773d1',
            modifications: {
                "Logo_Domicile": `https://media.api-sports.io/football/teams/${idHome}.png`,
                "Logo_Exterieur": `https://media.api-sports.io/football/teams/${idAway}.png`,
                "Score_Probable": (match.scores && match.scores[0]) || "1-0",
                "Equipe_Dom": match.home.n || match.home,
                "Equipe_Ext": match.away.n || match.away
                // Voix_IA supprimé pour éviter l'erreur OpenAI
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
        if (!fs.existsSync('data.json')) throw new Error("Fichier data.json introuvable.");
        const content = JSON.parse(fs.readFileSync('data.json', 'utf8'));
        
        const ldcMatchs = (content.matchs || []).filter(m => m.league_key === 'ldc');

        if (ldcMatchs.length > 0) {
            const match = ldcMatchs.sort((a, b) => (b.conf || 0) - (a.conf || 0))[0];
            console.log(`🎬 Envoi vidéo (SANS TEXTE) : ${match.home.n} vs ${match.away.n}`);
            const res = await envoyerVersCreatomate(match);
            console.log(JSON.stringify(res, null, 2));
        } else {
            console.log("Aucun match LDC trouvé.");
        }
    } catch (err) {
        console.error("❌ Erreur :", err.message);
    }
}
run();
