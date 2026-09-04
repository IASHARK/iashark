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
  for(const value of ['Le signal IASHARK','Notre lecture du match','Buts attendus','Comparatif des deux équipes','Scores probables','Quand les buts tombent','Buteur à surveiller','Questions sur ce match'])assert.match(js,new RegExp(value));
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
  // Ordre revu le 04/09/2026 : "Stats a ne pas surinterpreter" et "Valeur
  // potentielle" fusionnent dans prudenceCard (deux colonnes separees d'un
  // filet), et "Scenario probable du match" devient "Quand les buts tombent",
  // desormais construit sur les buts reellement comptes par tranche.
  const attendu=[
    "signalCard","matchReadingCard","keyInsightsCard","outputsCard",
    "Comparatif des deux équipes","threatsCard","matchupCard",
    "prudenceCard","Quand les buts tombent","faqCard"
  ];
  let curseur=-1;
  for(const jalon of attendu){
    const i=bloc.indexOf(jalon);
    assert.ok(i>curseur,`"${jalon}" n'est pas a sa place dans l'ordre de lecture`);
    curseur=i;
  }
});

test("les blocs retires a la demande de l'utilisateur ne reviennent pas",()=>{
  for(const parti of ["reasonsCard","marketsVsMarketCard","marketsWatchCard","h2hCard","refereeCard","valuePotentialCard","formNoteCard"]){
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

// ---------------------------------------------------------------------------
// Page match V3 (04/09/2026)
// ---------------------------------------------------------------------------

// Le comparatif etait conditionne a crit_home/crit_away, des donnees qu'il
// n'affiche PAS. crit_* est null tant qu'une equipe n'a pas trois matchs
// joues : en debut de saison le comparatif disparaissait de toute la Premier
// League, de la Bundesliga, de la Ligue 1 et de la Serie A.
test("le comparatif ne depend plus d'une donnee qu'il n'affiche pas",()=>{
  const vmSrc=fs.readFileSync(path.join(__dirname,"..","lib","match-view-model.js"),"utf8");
  const bloc=vmSrc.slice(vmSrc.indexOf("function comparison(raw)"),vmSrc.indexOf("function headToHead"));
  assert.ok(!/hasReliableCriteria/.test(bloc),
    "le comparatif est de nouveau conditionne aux criteres d'equipe");
  // Il expose la taille d'echantillon, pour que le lecteur sache sur combien
  // de matchs reposent ces moyennes.
  assert.match(bloc,/sampleSize/);
});

// Sur un radar, une aire plus grande se lit comme une superiorite. Les buts
// encaisses, les fautes et les hors-jeu n'y ont donc pas leur place.
test("le radar ne compare que des mesures ou 'plus' veut dire 'plus de'",()=>{
  const axes=js.slice(js.indexOf("const AXES_RADAR=["),js.indexOf("const LIGNES_CHIFFREES"));
  for(const interdit of ["Buts concédés","Fautes","Hors-jeu","Arrêts"]){
    assert.ok(!axes.includes(interdit),`"${interdit}" ne doit pas etre un axe du radar`);
  }
  const chiffrees=js.slice(js.indexOf("const LIGNES_CHIFFREES"),js.indexOf("function radarComparatif"));
  for(const attendu of ["Buts concédés","Fautes","Hors-jeu","Arrêts"]){
    assert.ok(chiffrees.includes(attendu),`"${attendu}" doit rester affiche en clair`);
  }
  // Le radar reste lisible sans le graphique : un tableau porte les valeurs.
  assert.match(js,/radar-table/);
  assert.match(js,/role="img" aria-label="Profil de jeu comparé/);
});

// "Scenario probable du match" affichait un texte du LLM present sur 1 seul
// des 46 matchs publies. Il est remplace par les buts reellement comptes.
test("la repartition des buts est calculee, pas redigee",()=>{
  const vmSrc=fs.readFileSync(path.join(__dirname,"..","lib","match-view-model.js"),"utf8");
  assert.match(vmSrc,/function goalTiming\(raw\)/);
  const bloc=js.slice(js.indexOf("function scenarioCard(vm)"),js.indexOf("function scenarioCard(vm)")+2600);
  assert.match(bloc,/vm\.editorial\.goalTiming/);
  // La page dit que c'est une frequence observee, jamais une prevision.
  assert.match(bloc,/Fréquence observée, pas une prévision/);
  // Et elle indique sur combien de buts elle repose.
  assert.match(bloc,/totalGoals/);
});

// Deux blocs cote a cote qui ne disent pas la meme chose.
test("'Ce qu'il faut savoir' oppose ce qui soutient le pari et ce qui le menace",()=>{
  const bloc=js.slice(js.indexOf("function keyInsightsCard(vm)"),js.indexOf("function outputsCard"));
  assert.match(bloc,/Ce qui va dans ce sens/);
  assert.match(bloc,/Ce qui peut le contrarier/);
  assert.match(bloc,/marketJustifications/);
  // Les matchups sont detailles plus bas dans la page : ils ne doivent plus
  // etre repris ici.
  assert.ok(!/positive_home|positive_away/.test(bloc),
    "les matchups sont repetes dans 'Ce qu'il faut savoir'");
});

// Chaque justification doit porter un nombre : sans chiffre, ce n'est pas une
// justification, c'est une formule.
test("les justifications du marche s'appuient toutes sur un nombre",()=>{
  const ins=require("../lib/insights.js");
  const cas={market:"Over 2.5",homeName:"Alpha",awayName:"Beta",
    statsHome:{shots_total:12.1,shots_on:4.3,possession:53,xg:1.6},
    statsAway:{shots_total:11.9,shots_on:2.9,possession:47,xg:1.1},
    eventsHome:{goals_avg:"1.60",conceded_avg:"1.40",slots:[{t:"0-15",n:5},{t:"15-30",n:2},{t:"30-45",n:3},{t:"45-60",n:9},{t:"60-75",n:4},{t:"75-90",n:9}]},
    eventsAway:{goals_avg:"2.20",conceded_avg:"1.00",slots:[{t:"0-15",n:10},{t:"15-30",n:7},{t:"30-45",n:5},{t:"45-60",n:9},{t:"60-75",n:4},{t:"75-90",n:9}]}};
  const faits=ins.buildMarketJustifications(cas);
  assert.ok(faits.length>=1&&faits.length<=2,"il faut une ou deux justifications, pas davantage");
  for(const f of faits){
    assert.ok(/\d/.test(f.texte),`justification sans chiffre : "${f.texte}"`);
    assert.ok(f.titre&&f.texte.length>20);
  }
  // Jamais deux fois le meme angle.
  assert.equal(new Set(faits.map(f=>f.titre)).size,faits.length);
  // Un marche inconnu ne doit pas produire de phrase creuse.
  const inconnu=ins.buildMarketJustifications(Object.assign({},cas,{market:"???"}));
  for(const f of inconnu)assert.ok(/\d/.test(f.texte));
});

// La FAQ ne doit plus reposer les questions dont la reponse est deja en grand
// plus haut dans la page.
test("la FAQ ne repete pas ce que la page affiche deja",()=>{
  const bloc=js.slice(js.indexOf("function faqCard(vm)"));
  for(const repetition of ["Qui est favori","Quel pari IASHARK retient","d’accord avec le marché","niveau de risque de ce pari"]){
    assert.ok(!bloc.includes(repetition),`la FAQ repose la question deja traitee : "${repetition}"`);
  }
  // Et elle pose bien des questions dont la reponse n'est nulle part ailleurs.
  assert.match(bloc,/marquent-elles avant la mi-temps/);
  assert.match(bloc,/but tardif/);
  assert.match(bloc,/gardien est le plus sollicité/);
});

// Le marche recommande est la premiere chose que voit un visiteur : il doit
// etre comprehensible sans connaitre la notation des bookmakers.
test("le marche recommande est traduit en francais courant",()=>{
  // La fonction est extraite du fichier reel et instanciee ici : le test
  // verifie la traduction reellement livree, pas une copie.
  const src=js.slice(js.indexOf("function marcheEnClair"),js.indexOf("function signalCard"));
  const marcheEnClair=new Function(src+"; return marcheEnClair;")();
  const cas=[
    ["Premiere mi-temps moins de 1.5 but","Au plus 1 but inscrit avant la pause."],
    ["Over 2.5","Au moins 3 buts dans le match."],
    ["Under 3.5","Au plus 3 buts dans le match."],
    ["DC 12","Une des deux équipes gagne : pas de match nul."],
    ["BTTS Oui","Les deux équipes marquent au moins une fois."],
    ["Tirs cadres du match over 7.5","Au moins 8 tirs cadrés dans le match, les deux équipes confondues."]
  ];
  for(const [marche,attendu] of cas){
    assert.equal(marcheEnClair(marche,"Alpha","Beta"),attendu,`traduction incorrecte pour "${marche}"`);
  }
  assert.equal(marcheEnClair("Marché jamais vu","Alpha","Beta"),null,
    "un marche inconnu doit rester sans phrase plutot que d'etre approxime");
});
