const https = require('https');
const fs = require('fs');

async function envoyerVersCreatomate(match) {
    return new Promise((resolve) => {
        // Sécurité : on vérifie que le texte existe
        const texte = match.analyse_card || match.conseil_public || "Analyse en cours pour ce match de Ligue des Champions.";

        const data = JSON.stringify({
            template_id: '00468af0-fdc7-4490-81ad-d56b15f773d1',
            modifications: {
                "Equipe_Domicile": (match.home.n || "DOMICILE").toUpperCase(),
                "Equipe_Exterieur": (match.away.n || "EXTERIEUR").toUpperCase(),
                "Voix_IA": texte
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
            res.on('end', () => {
                const parsed = JSON.parse(body);
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ success: true, data: parsed });
                } else {
                    resolve({ success: false, error: parsed });
                }
            });
        });

        req.on('error', (e) => resolve({ success: false, error: e.message }));
        req.write(data);
        req.end();
    });
}

async function run() {
    try {
        console.log("📂 Lecture de data.json...");
        const rawData = fs.readFileSync('data.json');
        const content = JSON.parse(rawData);
        const ldcMatchs = (content.matchs || []).filter(m => m.league_key === 'ldc');

        console.log(`🔎 Shark a trouvé ${ldcMatchs.length} match(s).`);

        for (const m of ldcMatchs) {
            console.log(`🎬 Envoi : ${m.home.n} vs ${m.away.n}...`);
            const result = await envoyerVersCreatomate(m);
            
            if (result.success) {
                console.log(`✅ SUCCÈS ! Lien : ${result.data[0].url}`);
            } else {
                console.log(`❌ ÉCHEC :`, JSON.stringify(result.error));
            }
        }
    } catch (err) {
        console.error("❌ ERREUR CRITIQUE :", err.message);
    }
}

run();
