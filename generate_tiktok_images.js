// Fichier : generate_images.js
// Tu peux lancer ce script avec la commande : node generate_images.js

const CREATOMATE_API_KEY = process.env.CREATOMATE_API_KEY || 'TA_CLE_API_CREATOMATE_ICI';
const TEMPLATE_ID = 'c9cdb560-9789-469c-8ba1-3658cb15c50b'; // Ton vrai template

// 1. Fonction pour récupérer et trier tes matchs
async function getTop3Matches() {
    // ICI : Tu remplaces ça par l'appel à ton algorithme IA ou API-Sports
    // Pour l'exemple, voici toutes les prédictions brutes de la journée
    const tousLesMatchsDuJour = [
        {
            match_id: "match_1",
            confiance: 95, // Ton IA note ce match à 95% de confiance
            team_dom: "LILLE", team_ext: "ASTON VILLA",
            logo_dom: "https://media.api-sports.io/football/teams/79.png", logo_ext: "https://media.api-sports.io/football/teams/66.png",
            score_dom: 1, score_ext: 1, proba_Over25: 0.40, proba_BTTS: 0.80,
            tirs: 21, cadres: 8, corners: 9, jaunes: 3, rouges: 0
        },
        {
            match_id: "match_2",
            confiance: 88, // 88% de confiance
            team_dom: "MARSEILLE", team_ext: "VILLARREAL",
            logo_dom: "https://media.api-sports.io/football/teams/81.png", logo_ext: "https://media.api-sports.io/football/teams/533.png",
            score_dom: 2, score_ext: 0, proba_Over25: 0.45, proba_BTTS: 0.40,
            tirs: 18, cadres: 7, corners: 8, jaunes: 5, rouges: 1
        },
        {
            match_id: "match_3",
            confiance: 99, // La plus grosse confiance du jour (99%)
            team_dom: "LYON", team_ext: "CELTA VIGO",
            logo_dom: "https://media.api-sports.io/football/teams/85.png", logo_ext: "https://media.api-sports.io/football/teams/532.png",
            score_dom: 3, score_ext: 2, proba_Over25: 0.85, proba_BTTS: 0.90,
            tirs: 25, cadres: 12, corners: 11, jaunes: 4, rouges: 0
        },
        {
            match_id: "match_4",
            confiance: 60, // Match ignoré car confiance trop basse
            team_dom: "RENNES", team_ext: "MILAN",
            // ...
        }
    ];

    // LE SECRET EST ICI : On trie par confiance (du plus grand au plus petit) et on prend les 3 premiers
    const top3 = tousLesMatchsDuJour
        .sort((a, b) => b.confiance - a.confiance)
        .slice(0, 3);
        
    return top3;
}

// 2. Fonction principale pour générer les images sur Creatomate
async function generateTikTokCarrousel() {
    const top3Matchs = await getTop3Matches();
    console.log(`Préparation de ${top3Matchs.length} images pour le carrousel...`);

    // On prépare le tableau des rendus (renders) pour Creatomate
    const renders = top3Matchs.map(match => {
        return {
            template_id: TEMPLATE_ID,
            modifications: {
                // Les Logos (liens API-Sports)
                "Logo_Domicile": match.logo_dom,
                "Logo_Exterieur": match.logo_ext,
                
                // Les Noms
                "Nom_EquipeDom": match.team_dom,
                "Nom_EquipeExt": match.team_ext,
                
                // Les Scores
                "Score_Prediction_Dom": match.score_dom.toString(),
                "Score_Prediction_Ext": match.score_ext.toString(),
                
                // Textes pour les marchés globaux
                "Prediction_Buts25": match.proba_Over25 > 0.55 ? "+ 2.5 BUTS" : "- 2.5 BUTS",
                "Prediction_BTTS": match.proba_BTTS > 0.55 ? "OUI" : "NON",
                
                // CHIFFRES PURS (Exactement comme tu l'as demandé)
                "Prediction_TirsTotaux": match.tirs.toString(),
                "Prediction_TirsCadres": match.cadres.toString(),
                "Prediction_Corners": match.corners.toString(),
                "Prediction_YellowCards": match.jaunes.toString(),
                "Prediction_RedCard": match.rouges.toString()
            }
        };
    });

    // 3. Envoi de la requête à Creatomate (Génération des 3 images en un seul coup)
    try {
        const response = await fetch('https://api.creatomate.com/v1/renders', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${CREATOMATE_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ renders: renders })
        });

        const result = await response.json();
        
        console.log("✅ Succès ! Tes images sont en cours de création.");
        console.log("Voici les liens pour les télécharger (ils seront prêts dans quelques secondes) :");
        result.forEach((image, index) => {
            console.log(`Image ${index + 1} (${top3Matchs[index].team_dom} vs ${top3Matchs[index].team_ext}) : ${image.url}`);
        });

    } catch (error) {
        console.error("❌ Erreur lors de la génération :", error);
    }
}

// Lancement du script
generateTikTokCarrousel();
