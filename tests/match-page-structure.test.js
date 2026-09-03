"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const read=file=>fs.readFileSync(path.join(__dirname,"..",file),"utf8");
const html=read("match.html"),js=read("match-page.js"),css=read("assets/match-page.css");

test("la page Match est un shell léger sans ancien rendu inline",()=>{
  assert.ok(html.split(/\r?\n/).length<40);
  assert.match(html,/id="matchRoot"/);assert.match(html,/match-page\.js/);
  assert.doesNotMatch(html,/function render\(/);assert.doesNotMatch(html,/crit_home\.att===0/);
});
test("la page expose une lecture principale et un résumé sticky desktop, sans onglets",()=>{
  assert.doesNotMatch(js,/data-tab=/);assert.doesNotMatch(js,/role="tablist"/);
  // Libelles mis a jour le 02/09/2026 apres decisions produit explicites :
  // "Recommandation IASHARK" -> "Le signal IASHARK" (remontee en tete de page) ;
  // "Pourquoi le pari ressort" -> "Comparatif des deux equipes" (l'ancien titre
  // promettait une justification que le tableau ne donnait pas) ;
  // "Absents & incertains" supprimee (n'affichait le plus souvent que
  // "aucune absence" pour les deux equipes) ;
  // "Questions sur ce match" ajoutee.
  for(const value of ['Le signal IASHARK','Pourquoi ce signal','Buts attendus','Comparatif des deux équipes','Scores probables','Scénario probable du match','Buteur à surveiller','Questions sur ce match','Résumé du signal'])assert.match(js,new RegExp(value));
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

// ORDRE DE LECTURE. Trois niveaux, dans cet ordre : la decision (en-tete +
// signal), le pourquoi (narratif + resume collant), puis les preuves. Les
// preuves sortent volontairement de la colonne narrative pour occuper toute
// la largeur en deux colonnes : dans la version precedente elles restaient
// dans la colonne etroite et laissaient ~3 100 px de vide a droite sur un
// ecran 1440.
test("la page match assemble les sections dans l'ordre demande",()=>{
  const render=js.slice(js.indexOf('function render(raw'),js.indexOf('function bindMotion'));
  const attendu=[
    "hero(vm)","signalCard(vm)","analysis-layout","proof-zone","analysis-end"
  ];
  let curseur=-1;
  for(const jalon of attendu){
    const i=render.indexOf(jalon);
    assert.ok(i>curseur,`"${jalon}" n'est pas a sa place dans l'ordre de lecture`);
    curseur=i;
  }
  // Le narratif precede les preuves, et la fin de page ferme la lecture.
  const narratif=js.slice(js.indexOf('const narratif='),js.indexOf('const preuves='));
  for(const bloc of ["whySignal(vm)","risksSection(vm)"]){
    assert.ok(narratif.includes(bloc),bloc+" doit etre dans le narratif");
  }
  const preuves=js.slice(js.indexOf('const preuves='),js.indexOf('const fin='));
  for(const bloc of ["outputsCard","Comparatif des deux équipes","matchupCard","threatsCard","formNoteCard","Scénario probable du match"]){
    assert.ok(preuves.includes(bloc),bloc+" doit etre dans la zone de preuves");
  }
  const finBloc=js.slice(js.indexOf('const fin='),js.indexOf('root.innerHTML'));
  for(const bloc of ["methodology(vm)","faqCard(vm)","contextualCta("]){
    assert.ok(finBloc.includes(bloc),bloc+" doit fermer la page");
  }
});

test("le signal principal précède la grille d'analyse et la value n'est pas répétée",()=>{
  const render=js.slice(js.indexOf('function render(raw'),js.indexOf('function bindMotion'));
  assert.ok(render.indexOf('signalCard(vm)')<render.indexOf('analysis-layout'));
  assert.doesNotMatch(render,/valuePotentialCard\(vm\)/);
  assert.match(render,/stickySummary\(vm\)/);
});

test("les blocs retires a la demande de l'utilisateur ne reviennent pas",()=>{
  for(const parti of ["reasonsCard","marketsVsMarketCard","marketsWatchCard","h2hCard","refereeCard"]){
    assert.doesNotMatch(js,new RegExp("function\\s+"+parti+"\\s*\\("),`${parti} a ete reintroduit`);
  }
});

test("les sections absentes sont filtrées sans créer de vide",()=>{
  const render=js.slice(js.indexOf('function render(raw'),js.indexOf('function bindMotion'));
  // Les trois groupes filtrent leurs blocs vides : une donnee absente ne doit
  // jamais produire une carte vide ni un trou dans la page.
  assert.equal((render.match(/\.filter\(Boolean\)/g)||[]).length,3,
    "narratif, preuves et fin doivent chacun filtrer leurs blocs vides");
  // Et les conteneurs eux-memes disparaissent s'ils n'ont rien a montrer.
  assert.match(render,/narratif\?`<div class="analysis-layout"/);
  assert.match(render,/preuves\.length\?`<section class="proof-zone reveal"/);
});
