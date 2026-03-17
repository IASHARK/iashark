async function genererVideoTest() {
  console.log("🎬 Envoi de la commande à Creatomate...");

  try {
    const response = await fetch('https://api.creatomate.com/v1/renders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CREATOMATE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template_id: '00468af0-fdc7-4490-81ad-d56b15f773d1',
        modifications: {
          "Equipe_Domicile": "MARSEILLE",
          "Equipe_Exterieur": "PSG",
          "Voix_IA": "Gros choc ce soir sur I A Shark ! Marseille affronte le PSG. Voici le pronostic de l'intelligence artificielle."
        }
      })
    });

    const data = await response.json();
    
    if (response.ok) {
      console.log("✅ Vidéo en cours de création !");
      console.log("Lien pour voir la vidéo :", data[0].url);
    } else {
      console.error("❌ Erreur Creatomate :", data);
    }
  } catch (error) {
    console.error("❌ Erreur de connexion :", error);
  }
}

genererVideoTest();
