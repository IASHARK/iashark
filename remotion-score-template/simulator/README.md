# Simulateur API-Sports → Remotion

Le moteur recherche le fixture Real Madrid–Inter du 8 septembre 2026, récupère les données disponibles via API-Sports, met les réponses en cache, exécute 50 000 simulations et écrit `public/match-simulation.json`.

```bash
npm install
npm run simulate
```

La clé reste dans `.env` et n’est jamais loguée. Le programme accepte temporairement l’ancien nom `APISPORTS_KEY` utilisé par le dépôt parent.
