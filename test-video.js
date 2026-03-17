// ── GÉNÉRATION VIDÉO AUTOMATIQUE LDC ──────────────────────
          async function genererVideosAutomatiques(matchsData) {
            console.log('\n=== GÉNÉRATION VIDÉOS LDC ===');
            const ldcMatchs = matchsData.filter(m => m.league_key === 'ldc');
            
            console.log(`🔎 Shark a trouvé ${ldcMatchs.length} matchs de LDC à traiter.`);

            for (const m of ldcMatchs) {
              console.log(`🎬 Envoi vidéo : ${m.home.n} vs ${m.away.n}`);
              try {
                // On utilise le fetch déjà présent ou on fait un appel direct
                const res = await new Promise((resolve) => {
                  const data = JSON.stringify({
                    template_id: '00468af0-fdc7-4490-81ad-d56b15f773d1',
                    modifications: {
                      "Equipe_Domicile": m.home.n.toUpperCase(),
                      "Equipe_Exterieur": m.away.n.toUpperCase(),
                      "Voix_IA": m.analyse_card
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
                    let d = '';
                    res.on('data', (chunk) => d += chunk);
                    res.on('end', () => resolve(JSON.parse(d)));
                  });
                  req.write(data);
                  req.end();
                });
                console.log(`✅ Vidéo commandée ! Lien : ${res[0].url}`);
              } catch (e) {
                console.log(`❌ Erreur vidéo pour ${m.home.n}: ${e.message}`);
              }
            }
          }

          // Modifier l'appel final dans main() :
          // Juste avant la fin du main(), appelle la fonction :
          await genererVideosAutomatiques(matchsData);
