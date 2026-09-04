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
  for(const value of ['Aucun marché ne franchit les seuils','xG indisponibles','Statistiques comparatives indisponibles','Scores probables indisponibles','Pas assez de buts enregistrés pour établir une répartition fiable'])assert.match(js,new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
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

// Les sections vides ne doivent toujours pas laisser de trou dans la page.
test("seules les sections non vides sont rendues",()=>{
  assert.match(js,/sections\.filter\(Boolean\)/);
});

// Numerotation "01 02 03..." retiree a la demande de l'utilisateur : les
// titres de cartes suffisent a situer la lecture.
test("les sections ne sont plus numerotees",()=>{
  assert.doesNotMatch(js,/sec-num/);
  assert.doesNotMatch(css,/sec-num/);
  assert.doesNotMatch(js,/padStart\(2,'0'\)/);
});

// Bug remonte par l'utilisateur : sur un match dont le pari recommande est un
// BTTS, la rangee "Notre lecture du match" affichait DEUX tuiles BTTS cote a
// cote, avec le meme libelle et le meme pourcentage.
test("le bandeau 'Notre lecture' ne repete pas BTTS quand le pari recommande est deja un BTTS",()=>{
  // On evalue la condition REELLEMENT ecrite dans la page, pas une copie.
  const m=js.match(/const btts=(\/[^\n]*?\/i)\n?\s*\.test\(marketLower\)|const btts=(\/[^\n]*?\/i)\.test\(marketLower\)/);
  assert.ok(m,"le garde-fou BTTS a disparu de matchReadingCard");
  const litteral=m[1]||m[2];
  const re=new RegExp(litteral.slice(1,-2),"i");
  for(const marche of ["BTTS Oui","BTTS Non","Les deux équipes marquent Oui","Les deux equipes marquent Non"]){
    assert.ok(re.test(marche.toLowerCase()),`la tuile BTTS devrait etre masquee pour "${marche}"`);
  }
  for(const marche of ["Over 2.5","Domicile plus de 1.5 but","DC 12","Premiere mi-temps moins de 1.5 but","Tirs du match over 22.5"]){
    assert.ok(!re.test(marche.toLowerCase()),`la tuile BTTS reste utile pour "${marche}"`);
  }
});

// La carte buteur menait avec un tableau plat de quatre lignes, puis avec la
// probabilite de marquer en 42px cyan. Le chiffre etait juste mais criait
// plus fort que le nom du joueur. Elle est desormais lue dans l'ordre : qui,
// puis quelle probabilite, puis les chiffres de contexte.
test("la carte buteur affiche la probabilite de marquer sans ecraser le joueur",()=>{
  assert.match(js,/scoringProbability/);
  assert.match(js,/Probabilité de marquer/);
  // La probabilite est aussi lisible autrement que par la jauge.
  assert.match(js,/role="img" aria-label="Probabilité de marquer/);
  assert.match(css,/\.threat-jauge/);
  assert.match(css,/\.threat-panneau/);
});

// "Un truc propre, pas trop ecrit en gros" : plus rien au-dessus de 20px
// dans cette carte, contre 42px auparavant.
test("la carte buteur ne comporte plus de tres gros caracteres",()=>{
  const bloc=css.slice(css.indexOf("==================== Buteur"),css.indexOf("==================== FAQ"));
  assert.ok(bloc.length>400,"bloc CSS de la carte buteur introuvable");
  const tailles=[...bloc.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)].map(m=>Number(m[1]));
  assert.ok(tailles.length>0,"aucune taille de police trouvee");
  const maxi=Math.max(...tailles);
  assert.ok(maxi<=20,`la carte buteur contient du ${maxi}px, au-dela des 20px voulus`);
});

// Le panneau ne doit jamais reprendre un chiffre deja donne juste au-dessus.
test("la carte buteur ne repete pas la probabilite dans son panneau",()=>{
  const bloc=js.slice(js.indexOf("function threatsCard"),js.indexOf("function keyInsightsCard"));
  const panneau=bloc.slice(bloc.indexOf("const stats=["),bloc.indexOf("].filter(Boolean)"));
  assert.ok(!/scoringProbability/.test(panneau),
    "la probabilite de marquer est repetee dans le panneau de chiffres");
  // Trois chiffres au maximum, pour que le panneau reste lisible.
  assert.match(bloc,/\.slice\(0,3\)/);
});
