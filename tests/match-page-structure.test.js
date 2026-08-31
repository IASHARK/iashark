"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const html=read("match.html"),js=read("match-page.js"),css=read("assets/match-page.css");

test("la page Match est un shell léger sans ancien rendu inline",()=>{
  assert.ok(html.split(/\r?\n/).length<40);
  assert.match(html,/id="matchRoot"/);assert.match(html,/match-page\.js/);
  assert.doesNotMatch(html,/function render\(/);assert.doesNotMatch(html,/crit_home\.att===0/);
});
test("la nouvelle interface expose les trois espaces validés",()=>{
  for(const value of ['data-tab="summary"','data-tab="advanced"','data-tab="players"','Marchés comparés','Scénario probable','Conditions du match','Arbitre & discipline','Scénario par tranches de 15 min','Questions sur ce match','Projections joueurs IASHARK','pitch-player'])assert.match(js,new RegExp(value));
});
test("les onglets sont accessibles et la page est responsive",()=>{
  assert.match(js,/role="tablist"/);assert.match(js,/hidden/);assert.match(css,/@media\(max-width:720px\)/);
});
test("le rendu ne contient plus les valeurs métier précédemment codées en dur",()=>{
  assert.doesNotMatch(js,/10[\s.,]?000 simulations/i);assert.doesNotMatch(js,/37%/);assert.doesNotMatch(js,/33%/);assert.doesNotMatch(js,/30%/);
});
test("la maquette compacte verrouille les trois compositions de grille",()=>{
  assert.match(css,/\.summary-top\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,1\.12fr\)/);
  assert.match(css,/\.advanced-top\{display:grid;grid-template-columns:1\.05fr 1fr 1fr/);
  assert.match(css,/\.players-top\{display:grid;grid-template-columns:1\.35fr 1fr/);
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
