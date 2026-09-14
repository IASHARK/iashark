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
  // Refonte du 14/09/2026 (demande du proprietaire) : le signal au centre,
  // "Probabilites et cotes", "Forme et face-a-face", "Absences" et "Marches
  // joueurs" ; "Notre lecture du match" est fondue dans le signal.
  for(const value of ['Le signal IASHARK','Pari recommandé','Probabilités et cotes','Forme et face-à-face','Absences','Buts attendus','Comparatif des deux équipes','Scores les plus probables','Marchés joueurs','Scénario probable du match','Questions sur ce match'])assert.match(js,new RegExp(value));
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
  assert.match(js,/functions\.invoke\('match-data'[,)]/);
});

// ORDRE DE LECTURE revu le 14/09/2026 a la demande du proprietaire (fixture
// mise a jour deliberement) : signal au centre, probabilites et cotes, forme
// et face-a-face, absences, statistiques, scores, marches joueurs, repartition
// des buts, FAQ en dernier. L'en-tete (hero) precede les sections.
test("la page match assemble les sections dans l'ordre demande",()=>{
  const bloc=js.slice(js.indexOf("const sections=["),js.indexOf("];",js.indexOf("const sections=[")));
  const attendu=[
    "signalCard","marketsCard","formH2HCard","absencesCard",
    "Comparatif des deux équipes","outputsCard","threatsCard",
    "Scénario probable du match","faqCard"
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

// Le bandeau "Notre lecture du match" (et son doublon BTTS) a disparu le
// 14/09/2026 : le pari recommande n'apparait plus qu'une fois dans le tableau
// des marches, signale comme tel, jamais en double ligne.
test("le tableau des marches ne duplique pas le pari du signal",()=>{
  const {buildMatchViewModel}=require("../lib/match-view-model.js");
  const raw={id:1,home:{id:1,n:"PSG"},away:{id:2,n:"Monaco"},model_output_available:true,data_quality_score:70,
    p1:55,pn:25,p2:20,market_consensus_p1:52,market_consensus_pN:26,market_consensus_p2:22,c1:"1.80",cn:"3.60",c2:"4.20",
    btts:61,cbtts:"1.70",cbtts_non:"2.10",pari_rec:"BTTS Oui",model_probability:61,cote_rec:1.7,
    markets_compared:[{id:"btts-yes",market:"BTTS Oui",probability:61,consensus:55,edge:6}]};
  const rows=buildMatchViewModel(raw).model.marketTable;
  const btts=rows.filter(r=>r.family&&r.family.family==="btts");
  assert.equal(btts.length,1,"une seule ligne BTTS");
  assert.equal(btts[0].recommended,true,"la ligne BTTS est signalee comme le pari du signal");
  assert.equal(rows.filter(r=>r.recommended).length,1);
});

// LE SIGNAL IASHARK : tout ce que le proprietaire a demande est rendu, et la
// mention 18+ / estimation statistique figure DANS le bloc.
test("le signal IASHARK montre pari, jauge, cote, probabilite implicite, ecart, fiabilite, raisons, risques et 18+",()=>{
  const bloc=js.slice(js.indexOf("function signalCard(vm)"),js.indexOf("function marketsCard"));
  for(const attendu of ["sig-market","sig-bar","sig-bar-market","Cote utilisée","Probabilité implicite","Écart (value)",
    "Le modèle voit {model} contre {market} pour le marché ({gap}).","relBadge(info)","Pourquoi ce pari","À surveiller",
    "18+ · Estimation statistique, pas une garantie."]){
    assert.ok(bloc.includes(attendu),`element du signal manquant : ${attendu}`);
  }
  // Une probabilite nulle ou absente n'est jamais affichee "0 %".
  assert.match(bloc,/r\.probability>0/);
  // Revue du 14/09/2026 : ticket du pari (libelle + cote), indice de
  // confiance 0-10 en visuel, niveau de risque, "pourquoi" en 3 puces maximum.
  for(const attendu of ["sig-slip","sig-odds-box","confMeter(r.confidence)","riskStat(vm.editorial.riskCode)","raisons.slice(0,3)"]){
    assert.ok(bloc.includes(attendu),`element du signal manquant : ${attendu}`);
  }
  assert.match(js,/function confMeter\(conf\)[\s\S]*role="meter"[\s\S]*aria-valuemax="10"/);
  // Analyse annoncee mais champs premium absents : jamais "aucun marche".
  assert.match(bloc,/raw\.has_signal===true&&raw\.no_signal!==true/);
});

// PREMIUM : le mur d'acces n'affiche aucune donnee du modele, et l'en-tete
// commun (hero) ne montre plus les probabilites 1N2 du modele.
test("le mur d'acces et l'en-tete n'exposent ni pari, ni probabilite du modele",()=>{
  const gate=js.slice(js.indexOf("function gateCard(vm,opts)"),js.indexOf("function renderAuthWall"));
  for(const interdit of ["recommendation","probabilities","marketTable","recommendedOdds","recommendedEdge","scoringProbability","signalReasons"]){
    assert.ok(!gate.includes(interdit),`le mur d'acces lit ${interdit}`);
  }
  assert.match(gate,/oddsCount/);
  assert.match(gate,/sig-ghost/);
  // Teaser : "une analyse existe" et indice de confiance (champs publics),
  // jamais pari, cote ni probabilite.
  assert.match(gate,/confMeter\(pub\.conf\)/);
  assert.match(gate,/sig_teaser_exists/);
  for(const interdit of ["pari_rec","cote_rec","model_probability","market_id","riskCode","odds(","pct("]){
    assert.ok(!gate.includes(interdit),`le mur d'acces lit ${interdit}`);
  }
  const hero=js.slice(js.indexOf("function hero(vm)"),js.indexOf("const REL_NIVEAUX"));
  assert.ok(!/probabilities|probBar|recommendation/.test(hero),"l'en-tete ne doit montrer aucune probabilite du modele");
  assert.doesNotMatch(js,/function probBar\(/);
});

// SEO : le resume statique des pages match n'est plus masque en CSS (texte
// cache) ; l'application le remplace par son en-tete, qui porte le seul h1.
test("le resume SEO n'est pas masque et la page garde un seul h1",()=>{
  assert.doesNotMatch(css,/\.match-shell>div:not\(#matchRoot\)\{[^}]*display:none/);
  assert.match(js,/function remplacerResumeSeo\(\)/);
  assert.equal((js.match(/<h1\b/g)||[]).length,1,"un seul h1 genere par la page");
  assert.match(js,/<h1 class="hero-teams">/);
});

// La carte buteur menait avec un tableau plat de quatre lignes, puis avec la
// probabilite de marquer en 42px cyan. Le chiffre etait juste mais criait
// plus fort que le nom du joueur. Elle est desormais lue dans l'ordre : qui,
// puis quelle probabilite, puis les chiffres de contexte.
test("la carte buteur affiche la probabilite de marquer sans ecraser le joueur",()=>{
  assert.match(js,/scoringProbability/);
  assert.match(js,/Probabilité de marquer/);
  // La probabilite est aussi lisible autrement que par la jauge. Le libelle
  // passe desormais par t('match_page.scoring_probability_label', ...) (i18n,
  // 13/09/2026) : on verifie donc que role="img" et aria-label portent
  // toujours le repli francais "Probabilité de marquer", meme si le texte
  // n'est plus colle immediatement apres aria-label=" dans le code source.
  assert.match(js,/role="img" aria-label="[^"]*Probabilité de marquer/);
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
  const bloc=js.slice(js.indexOf("function threatsCard"),js.indexOf("const ALERTES_ABSENCE"));
  const panneau=bloc.slice(bloc.indexOf("const stats=["),bloc.indexOf("].filter(Boolean)"));
  assert.ok(!/scoringProbability/.test(panneau),
    "la probabilite de marquer est repetee dans le panneau de chiffres");
  // Trois chiffres au maximum, pour que le panneau reste lisible.
  assert.match(bloc,/\.slice\(0,3\)/);
});

// ---------------------------------------------------------------------------
// Vocabulaire (04/09/2026) : plus de jargon de bookmaker a l'ecran
// ---------------------------------------------------------------------------

// "DC 12" ou "Over 2.5" ne veulent rien dire pour qui decouvre le site, et
// c'est la premiere chose qu'il lit.
// Fixtures revues DELIBEREMENT le 14/09/2026 : la ligne du bookmaker est
// conservee avec la virgule decimale ("1,5 but"), accents, accord et
// majuscule initiale (retour QA : "Exterieur moins de 1.5 but" sur l'accueil).
const NB=" ";
// Revues a nouveau DELIBEREMENT (regle du proprietaire, 14/09/2026) : un pari
// s'ecrit comme chez un bookmaker, court et standard - "Monaco : moins de
// 1,5 but", jamais "L'equipe a l'exterieur ne marque pas plus d'un but".
test("les libelles de marches sont ecrits dans la forme standard des bookmakers",()=>{
  const {marketLabelFr}=require("../lib/market-labels.js");
  const eq={home:"PSG",away:"Monaco"};
  const cas=[
    ["DC 12","PSG ou Monaco (double chance)"],
    ["DC 1X","PSG ou nul (double chance)"],
    ["DC X2","Nul ou Monaco (double chance)"],
    ["Victoire domicile","Victoire PSG"],
    ["Match nul","Match nul"],
    ["BTTS Oui","Les deux équipes marquent"+NB+": Oui"],
    ["BTTS Non","Les deux équipes marquent"+NB+": Non"],
    ["Over 2.5","Plus de 2,5 buts"],
    ["Under 3.5","Moins de 3,5 buts"],
    ["Over 1.5","Plus de 1,5 but"],
    ["Premiere mi-temps moins de 1.5 but","1re mi-temps"+NB+": moins de 1,5 but"],
    ["Premiere mi-temps plus de 0.5 but","1re mi-temps"+NB+": plus de 0,5 but"],
    ["Tirs du match over 22.5","Plus de 22,5 tirs"],
    ["Tirs cadres du match over 7.5","Plus de 7,5 tirs cadrés"],
    ["Domicile plus de 1.5 but","PSG"+NB+": plus de 1,5 but"],
    ["Exterieur moins de 1.5 but","Monaco"+NB+": moins de 1,5 but"],
    ["Domicile gagne + plus de 2.5 buts","Victoire PSG et plus de 2,5 buts"],
    ["Domicile clean sheet","PSG"+NB+": clean sheet"],
    ["DNB Exterieur","Monaco (remboursé si nul)"],
    ["Handicap Domicile -1","PSG -1 (handicap)"]
  ];
  for(const [brut,attendu] of cas)assert.equal(marketLabelFr(brut,eq),attendu,`traduction incorrecte pour "${brut}"`);
  // Sans noms d'equipes : "Extérieur : moins de 1,5 but".
  assert.equal(marketLabelFr("Exterieur moins de 1.5 but"),"Extérieur"+NB+": moins de 1,5 but");
  assert.equal(marketLabelFr("DC 1X"),"Domicile ou nul (double chance)");
  // Jamais une phrase a la place d'un pari.
  for(const [brut] of cas)assert.ok(!/l’équipe|dans le match|n’encaisse aucun/.test(marketLabelFr(brut)),`phrase au lieu d'un pari pour "${brut}"`);
  // Un marche non prevu doit ressortir tel quel plutot que reformule au hasard.
  assert.equal(marketLabelFr("Marché jamais vu",eq),"Marché jamais vu");
});

// Un libelle affiche ne garde jamais le point decimal ni l'orthographe du
// moteur ("Exterieur", "Premiere", "cadres") : virgule decimale en francais.
test("les libelles traduits ecrivent la ligne a la francaise",()=>{
  const {marketLabelFr,marketIdLabelFr}=require("../lib/market-labels.js");
  const bruts=["Over 1.5","Over 2.5","Over 3.5","Under 2.5","Under 3.5",
    "Premiere mi-temps plus de 1.5 but","Tirs du match under 21.5","Tirs cadres du match under 10.5",
    "Domicile gagne + plus de 2.5 buts","Exterieur plus de 1.5 but"];
  for(const b of bruts){
    const t=marketLabelFr(b,{home:"A",away:"B"});
    assert.ok(/\d,5\b/.test(t),`"${b}" traduit en "${t}" : ligne absente ou mal ecrite`);
    assert.ok(!/\d\.\d|Exterieur|Premiere|cadres\b/.test(t),`"${b}" traduit en "${t}" : point decimal ou accent manquant`);
  }
  for(const id of ["over-25","fh-under-15","home-team-over-15","away-win-under-35","total-shots-on-target-over-7_5"]){
    const t=marketIdLabelFr(id,{home:"A",away:"B"});
    assert.ok(/\d,5\b/.test(t)&&!/\d\.\d/.test(t),`"${id}" traduit en "${t}"`);
  }
});

test("la page match affiche les marches traduits, jamais le libelle brut",()=>{
  // Chaque endroit qui montre un nom de marche passe par marcheFr().
  assert.match(js,/function marcheFr\(vm,libelle\)/);
  assert.ok(!/\$\{esc\(r\.market\)\}/.test(js),"un libelle de marche brut est encore affiche");
  assert.ok(!/\$\{esc\(top\.market\)\}/.test(js),"un libelle de marche brut est encore affiche");
  assert.match(html,/lib\/market-labels\.js/);
});

// La FAQ ne doit reposer aucune question dont la reponse est deja affichee.
test("la FAQ ne repose pas les questions deja traitees dans la page",()=>{
  const bloc=js.slice(js.indexOf("function faqCard(vm)"));
  for(const deja of ["Qui est favori","Combien de buts sont attendus","Quel pari IASHARK retient",
                     "d’accord avec le marché","niveau de risque de ce pari"]){
    assert.ok(!bloc.includes(deja),`la FAQ repose une question deja traitee : "${deja}"`);
  }
  // Elle s'appuie sur des donnees qu'aucune carte n'affiche.
  assert.match(bloc,/exclusiveFacts/);
  for(const attendu of ["marque le plus tôt","craque-t-elle en fin de match","cartons","occasions"]){
    assert.ok(bloc.includes(attendu),`question exclusive manquante : "${attendu}"`);
  }
});

// Les logos d'equipe ne doivent jamais etre masques en rond : un ecusson a sa
// propre forme.
test("les logos d'equipe sont detoures, pas mis en pastille ronde",()=>{
  assert.match(js,/function logoEquipe/);
  assert.match(css,/\.logo-eq\{[^}]*border-radius:0/);
  assert.match(css,/\.logo-eq\{[^}]*object-fit:contain/);
  assert.match(css,/\.logo-eq\{[^}]*background:none/);
});
