function genererScript(match) {
  return new Promise((resolve) => {
    const homeNom = nomNaturel(match.home.n);
    const awayNom = nomNaturel(match.away.n);
    const scorePredit = match.score_predit ? match.score_predit.score : "Inconnu";
    const nomLigue = match.league || "Europa League"; // Récupère le nom de la ligue

    // Extraction des scénarios 15-15 du JSON
    let scenariosText = "";
    if (match.scenario_15min) {
      scenariosText = match.scenario_15min.map(s => 
        `Tranche ${s.t} | Probabilité: ${s.prob} | Analyse: ${s.txt}`
      ).join('\n');
    }

    const prompt = `Tu es l'IA Shark. Écris un script TikTok de 35 secondes (environ 85 mots).
    COMPÉTITION : ${nomLigue}

    STRUCTURE STRICTE :
    1. Hook OBLIGATOIRE : "Dix mille stats analysées. Voici le scénario EXACT du match."
    2. Introduction : Mentionne brièvement que c'est un match de ${nomLigue} entre ${homeNom} et ${awayNom}.
    3. Le Match : Utilise ces données pour raconter le match minute par minute :
    ${scenariosText}
    (Ne lis pas tout, sois percutant, fais monter la pression sur les moments à forte probabilité).
    4. Score : "Le score prédit par l'algorithme est de : ${scorePredit}."
    5. Outro OBLIGATOIRE : "Tous les autres matchs sont dispos sur I A SHARK point com."
    
    IMPORTANT : Utilise les accents. Écris les nombres en lettres (soixante, quinze). Fais des pauses avec des points.`;

    const body = JSON.stringify({
      model: 'claude-3-5-haiku-20241022', 
      max_tokens: 450,
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
        try { resolve((JSON.parse(data).content[0] || {}).text || ''); }
        catch(e) { resolve(''); }
      });
    });
    req.write(body);
    req.end();
  });
}
