const https = require('https');
const fs = require('fs');

// 1. La fonction qui envoie la commande à Creatomate
async function envoyerVersCreatomate(match) {
    return new Promise((resolve) => {
        const data = JSON.stringify({
            template_id: '00468af0-fdc7-4490-81ad-d56b15f773d1',
            modifications: {
                "Equipe_Domicile": match.home.n.toUpperCase(),
                "Equipe_Exterieur": match.away.n.toUpperCase(),
                "Voix_IA": match.analyse_card
            }
        });

        const req = https.request({
            hostname: 'api.creatomate.com',
            path: '/v1/renders',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.CREATOMATE_KEY}`,
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        }, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => resolve(JSON.parse(body)));
        });

        req.on('error', (e) => {
            console.error(`❌ Erreur pour ${match.home.n}:`, e.message);
            resolve(null);
        });

        req.write(data);
        req.end();
    });
}

// 2. La fonction principale (Main) qui orchestre tout
async function run() {
    try {
        console.log("📂 Lecture des données de data.json...");
        const rawData = fs.readFileSync('data.json');
        const content = JSON.parse(rawData);
        const matchsData = content.matchs || [];

        // Filtre pour ne prendre QUE la Ligue des Champions (ldc)
        const ldcMatchs = matchsData.filter(m => m.league_key === 'ldc');

        console.log(`🔎 Shark a trouvé ${ldcMatchs.length} match(s) de LDC aujourd'hui.`);

        for (const m of ldcMatchs) {
            console.log(`🎬 Envoi vidéo : ${m.home.n} vs ${m.away.n}...`);
            const res = await envoyerVersCreatomate(m);
            if (res && res[0]) {
                console.log(`✅ Succès ! Lien : ${res[0].url}`);
            }
        }
        
        console.log("🏁 Fin du processus.");
    } catch (err) {
        console.error("❌ Erreur critique :", err.message);
    }
}

// 3. LANCEMENT (C'est ici qu'on évite l'erreur de tout à l'heure)
run();
