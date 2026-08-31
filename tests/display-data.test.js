const test=require('node:test');
const assert=require('node:assert/strict');
const display=require('../lib/display-data');

test('les critères sans provenance API et sans échantillon ne sont jamais affichables',()=>{
  const fabricated={att:0,def:88,fr:0,mot:70};
  assert.equal(display.hasReliableCriteria(fabricated,fabricated),false);
});

test('les critères API avec un échantillon suffisant sont affichables',()=>{
  const real={source:'api-sports-team-statistics',sample_size:8,att:54,def:63,fr:47};
  assert.equal(display.hasReliableCriteria(real,real),true);
});

test('un graphique par périodes fondé sur un seul match reste masqué',()=>{
  const sparse={source:'api-sports-fixture-events',games:1,slots:Array(6).fill({n:0}),slots_against:Array(6).fill({n:0})};
  assert.equal(display.hasReliableEventPatterns(sparse,sparse),false);
});

test('une météo sans source et sans heure de prévision reste masquée',()=>{
  assert.equal(display.weatherForDisplay({temp:'37C',desc:'ciel dégagé'}),null);
});

test('une prévision OpenWeather horodatée peut être affichée avec sa source',()=>{
  const value=display.weatherForDisplay({weather_source:'openweathermap',weather_forecast_at:'2026-08-31T18:00:00Z',temp:'29C',desc:'ciel dégagé'});
  assert.equal(value.source,'OpenWeather');
  assert.equal(value.temperature,'29C');
});

test('une carte xG sans deux valeurs réelles reste masquée',()=>{
  assert.equal(display.expectedGoalsForDisplay({match_stats_home:{xg:null},match_stats_away:{xg:null}}),null);
});

test('la liste des sources ne prétend pas utiliser des données absentes',()=>{
  const labels=display.sourceLabels({injuries:[],market_source:'Aucune cote fiable'});
  assert.deepEqual(labels,['Calendrier et équipes · API-Football']);
});

test('les probabilités du modèle restent masquées quand la complétude vaut zéro',()=>{
  assert.equal(display.hasReliableModelOutput({data_quality_score:0,p1:37,pn:33,p2:30}),false);
});

test('les probabilités peuvent être affichées quand les entrées réelles sont disponibles',()=>{
  assert.equal(display.hasReliableModelOutput({data_quality_score:75,model_output_available:true}),true);
});
