"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const html=read("match.html"),js=read("match-page.js"),css=read("assets/match-page.css");

test("la page Match est un shell léger sans ancien rendu inline",()=>{
  assert.ok(html.split(/\r?\n/).length<40);
  assert.match(html,/id="matchRoot"/);assert.match(html,/match-page\.js/);
  assert.doesNotMatch(html,/function render\(/);assert.doesNotMatch(html,/crit_home\.att===0/);
});
test("la page expose les trois vues dynamiques de la maquette",()=>{
  for(const tab of ['summary','advanced','players'])assert.match(js,new RegExp(`data-tab=["']${tab}`));
  for(const value of ['Notre lecture du match','Buts attendus','Ce qu’il faut savoir','Scénario probable du match','Buteur à surveiller','Matchup : comment les équipes se correspondent','Les 3 marchés à surveiller'])assert.match(js,new RegExp(value));
});
test("la page est responsive",()=>{
  assert.match(css,/@media\(max-width:760px\)/);
});
test("le rendu ne contient plus les valeurs métier précédemment codées en dur",()=>{
  assert.doesNotMatch(js,/10[\s.,]?000 simulations/i);assert.doesNotMatch(js,/37%/);assert.doesNotMatch(js,/33%/);assert.doesNotMatch(js,/30%/);
});
test("les blocs optionnels sont conditionnels et aucune équipe de maquette n'est codée en dur",()=>{
  assert.match(js,/if\(!x\)return''/);assert.match(js,/a\.length\?card/);
  assert.doesNotMatch(js,/Arsenal|Liverpool|Barcelona|Rayo|Salah|Lewandowski|Yamal/i);
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
