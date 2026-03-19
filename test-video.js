// 3. Demande à Claude
function genererScript(match) {
  return new Promise((resolve) => {
    const homeNom = nomNaturel(match.home.n);
    const awayNom = nomNaturel(match.away.n);
    const scorePredit = match.score_predit ? match.score_predit.score : "Inconnu";
    
    let scenariosText = "";
    if (match.scenario_15min) {
      scenariosText = match.scenario_15min.map(s => `Tranche ${s.t}: ${s.txt}`).join('\n');
    }

    // LE PROMPT CORRIGÉ (Interdiction des joueurs ajoutée)
    const prompt = `Agis comme l'IA Shark. Rédige UNIQUEMENT le texte à prononcer pour une voix off.
    LONGUEUR IMPÉRATIVE : Le texte doit durer 40 secondes MAXIMUM à l'oral (environ 90 à 100 mots). Sois concis.
    
    RÈGLES ABSOLUES : 
    1. Ne mets aucun titre, aucune intro du type "Voici le script". Commence directement par le Hook.
    2. INTERDICTION FORMELLE DE CITER DES NOMS DE JOUEURS. Tu vas te tromper sur les effectifs actuels. Parle UNIQUEMENT au nom des équipes (ex: "Lille attaque", "Lyon encaisse un but").

    HOOK : Invente une phrase d'accroche très percutante pour lancer la vidéo ! Utilise des points d'exclamation pour obliger la voix off à mettre un maximum d'énergie !
    
    ANALYSE : Détaille de manière fluide le match de ${match.league || "Europa League"} entre ${homeNom} et ${awayNom} avec ces données minute par minute :
    ${scenariosText}
    
    SCORE : Enchaîne avec : "Le score prédit est de : ${scorePredit}."
    OUTRO OBLIGATOIRE (dernière phrase exacte) : "Tous les autres matchs sont dispos sur I A SHARK point com."
    
    CONTRAINTES DE FORMAT : 
    - Écris ABSOLUMENT TOUS les nombres en toutes lettres (ex: "quarante-cinquième", "deux à un").
    - Fais un texte fluide et naturel à l'oral, sans puces ni tirets.`;

    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001', 
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
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { 
            const parsed = JSON.parse(data);
            if(parsed.error) console.log("🚨 ERREUR CLAUDE :", parsed.error.message);
            resolve((parsed.content && parsed.content[0]) ? parsed.content[0].text : ''); 
        }
        catch(e) { resolve(''); }
      });
    });
    req.write(body);
    req.end();
  });
}
