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
  // Libelles mis a jour le 02/09/2026 apres decisions produit explicites :
  // "Recommandation IASHARK" -> "Le signal IASHARK" (remontee en tete de page) ;
  // "Pourquoi le pari ressort" -> "Comparatif des deux equipes" (l'ancien titre
  // promettait une justification que le tableau ne donnait pas) ;
  // "Absents & incertains" supprimee (n'affichait le plus souvent que
  // "aucune absence" pour les deux equipes) ;
  // "Questions sur ce match" ajoutee.
  for(const value of ['Le signal IASHARK','Notre lecture du match','Buts attendus','Comparatif des deux équipes','Scores probables','Scénario probable du match','Buteur à surveiller','Questions sur ce match'])assert.match(js,new RegExp(value));
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

// ORDRE DE LECTURE fixe par l'utilisateur le 03/09/2026. Il a ete demande
// explicitement, section par section : ce n'est pas un detail cosmetique,
// donc il est verrouille ici plutot que laisse a la relecture.
test("la page match assemble les sections dans l'ordre demande",()=>{
  const bloc=js.slice(js.indexOf("const sections=["),js.indexOf("];",js.indexOf("const sections=[")));
  const attendu=[
    "signalCard","matchReadingCard","keyInsightsCard","outputsCard",
    "Comparatif des deux équipes","threatsCard","matchupCard",
    "formNoteCard","valuePotentialCard","Scénario probable du match","faqCard"
  ];
  let curseur=-1;
  for(const jalon of attendu){
    const i=bloc.indexOf(jalon);
    assert.ok(i>curseur,`"${jalon}" n'est pas a sa place dans l'ordre de lecture`);
    curseur=i;
  }
});

test("les blocs retires a la demande de l'utilisateur ne reviennent pas",()=>{
  for(const parti of ["reasonsCard","marketsVsMarketCard","marketsWatchCard","h2hCard","refereeCard"]){
    assert.doesNotMatch(js,new RegExp("function\\s+"+parti+"\\s*\\("),`${parti} a ete reintroduit`);
  }
});

// La numerotation doit suivre ce qui est REELLEMENT affiche : une section
// absente faute de donnees ne doit pas laisser un trou (01, 02, 04...).
test("la numerotation des sections se base sur les sections non vides",()=>{
  assert.match(js,/sections\.filter\(Boolean\)/);
});
