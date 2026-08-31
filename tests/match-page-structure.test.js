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
  for(const value of ['data-tab="summary"','data-tab="advanced"','data-tab="players"','Conditions du match','Arbitre & discipline','Scénario par tranches de 15 min','Questions sur ce match'])assert.match(js,new RegExp(value));
});
test("les onglets sont accessibles et la page est responsive",()=>{
  assert.match(js,/role="tablist"/);assert.match(js,/hidden/);assert.match(css,/@media\(max-width:720px\)/);
});
test("le rendu ne contient plus les valeurs métier précédemment codées en dur",()=>{
  assert.doesNotMatch(js,/10[\s.,]?000 simulations/i);assert.doesNotMatch(js,/37%/);assert.doesNotMatch(js,/33%/);assert.doesNotMatch(js,/30%/);
});
