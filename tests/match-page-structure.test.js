"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const html=read("match.html"),js=read("match-page.js"),css=read("assets/match-page.css");

test("la page Match est un shell léger sans ancien rendu inline",()=>{
  assert.ok(html.split(/\r?\n/).length<40);
  assert.match(html,/id="matchRoot"/);assert.match(html,/match-page\.js/);
  assert.doesNotMatch(html,/function render\(/);assert.doesNotMatch(html,/crit_home\.att===0/);
});
test("la page simple expose une seule colonne de sections réelles, sans onglets",()=>{
  assert.doesNotMatch(js,/data-tab=/);assert.doesNotMatch(js,/role="tablist"/);
  for(const value of ['Recommandation IASHARK','Notre lecture du match','Buts attendus','Pourquoi le pari ressort','Scores probables','Scénario probable du match','Buteur à surveiller','Absents & incertains'])assert.match(js,new RegExp(value));
});
test("la page est responsive",()=>{
  assert.match(css,/@media\(max-width:640px\)/);
});
test("le rendu ne contient plus les valeurs métier précédemment codées en dur",()=>{
  assert.doesNotMatch(js,/10[\s.,]?000 simulations/i);assert.doesNotMatch(js,/37%/);assert.doesNotMatch(js,/33%/);assert.doesNotMatch(js,/30%/);
});
test("aucune section ne prétend avoir une donnée absente : chaque bloc a un état vide honnête",()=>{
  for(const value of ['Aucun marché ne franchit les seuils','xG indisponibles','Statistiques comparatives indisponibles','Scores probables indisponibles','Scénario du match indisponible'])assert.match(js,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});
test("le workflow alimente les blocs comparatifs sans valeur de secours",()=>{
  const workflow=read(".github/workflows/update-data.yml");
  assert.match(workflow,/markets_compared:marketsCompared/);
  assert.match(workflow,/decision_factors:\(\[pickedMarket&&pickedMarket\.why\]/);
  assert.doesNotMatch(workflow,/markets_compared:\s*\[/);
  assert.match(workflow,/lineups:lineups\?/);
  assert.match(html,/app-client\.js/);
  assert.match(js,/functions\.invoke\('match-data'\)/);
});
