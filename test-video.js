const https = require('https');
const fs = require('fs');

async function envoyerVersCreatomate(match) {
    return new Promise((resolve) => {
        const logoHome = `https://media.api-sports.io/football/teams/${match.home.id}.png`;
        const logoAway = `https://media.api-sports.io/football/teams/${match.away.id}.png`;
        const texteIA = match.analyse_card || "Analyse en cours.";

        const data = JSON.stringify({
            template_id: '00468af0-fdc7-4490-81ad-d56b15f773d1',
            modifications: {
                "Logo_Domicile": logoHome, 
                "Logo_Exterieur": logoAway,
                "Voix_IA": texteIA
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
        console.log("Lecture de data.json...");
        if (!fs.existsSync('data.json')) {
            throw new Error("Le fichier data.json n'existe pas. Laisse le workflow du site tourner d'abord.");
        }

        const rawData = fs.readFileSync('data.json');
        const content = JSON.parse(rawData);
        
        const ldcMatchs = (content.matchs || []).filter(m => m.league_key === 'ldc');
        console.log(`Trouvé ${ldcMatchs.length} match(s) de LDC.`);

        for (const m of ldcMatchs) {
            console.log(`Envoi vidéo avec logos : ${m.home.n} vs ${m.away.n}...`);
            const res = await envoyerVersCreatomate(m);
            if (res && res[0]) console.log(`Succès ! Lien : ${res[0].url}`);
            else console.log(`Erreur Creatomate`);
        }
    } catch (err) {
        console.error("Erreur :", err.message);
    }
}
run();
