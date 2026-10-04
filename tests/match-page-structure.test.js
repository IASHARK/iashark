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
  // Page match V4 (04/10/2026, demande de Clement) : l'Avis IASHARK inchange, puis
  // les sections de lib/match-sections.js ; « Confrontations directes » et
  // « Questions fréquentes » retirees ; « Probabilites et cotes » absorbees par
  // le panneau Marches. Les onglets HyperUI vivent DANS les sections (quarts
  // d'heure, scenarios, familles de marches), jamais pour decouper la page.
  const ms=read("lib/match-sections.js");
  assert.doesNotMatch(js,/data-tab=/);assert.doesNotMatch(js,/role="tablist"/);
  for(const value of ['L’avis IASHARK','Pari recommandé'])assert.match(js,new RegExp(value));
  for(const value of ['Si ce match se jouait 10 000 fois','Le film du match','Qui ouvre le score ?','Les jumeaux du match','Les deux équipes','Les joueurs','L’arbitre','Marchés'])assert.match(ms,new RegExp(value.replace(/[?]/g,'\\?')));
  for(const retire of ['Confrontations directes','Questions fréquentes','Probabilités et cotes','function faqCard','function h2hFold','function marketsCard'])assert.ok(!js.includes(retire)&&!ms.includes(retire),retire+" reintroduit");
  assert.doesNotMatch(js,/function absencesCard|absences_title|abs-grid|formh2h_title/);
  assert.doesNotMatch(css,/\.abs-|\.mk-table|\.mk-scroll/);
  assert.doesNotMatch(js+ms,/IAShark/);
});

test("la page est responsive",()=>{
  assert.match(css,/@media\(max-width:640px\)/);
});
test("le rendu ne contient plus les valeurs métier précédemment codées en dur",()=>{
  assert.doesNotMatch(js,/10[\s.,]?000 simulations/i);assert.doesNotMatch(js,/37%/);assert.doesNotMatch(js,/33%/);assert.doesNotMatch(js,/30%/);
});
test("aucune section ne prétend avoir une donnée absente : chaque bloc a un état vide honnête",()=>{
  // L'Avis garde son etat vide honnete ; une section de lib/match-sections.js
  // sans donnee n'est PAS rendue (aucun trou, aucun « indisponible » en serie).
  assert.match(js,/Aucun marché ne franchit les seuils/);
  const MS=require("../lib/match-sections.js");
  const vm={identity:{home:{name:"A"},away:{name:"B"}},model:{},players:{}};
  const c={raw:{},vm,vuePro:true,verrouPro:false,dit:MS.registre()};
  assert.deepEqual(MS.sections(c),[],"sections rendues sans aucune donnee");
  assert.equal(MS.panneau(c),null);
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

// ORDRE DE LECTURE revu le 16/09/2026 (maquette V8 validee par le proprietaire,
// fixture mise a jour deliberement) : en-tete, l'avis IASHARK, les stats du
// match (ouvertes), l'analyse IASHARK, les questions frequentes A LA FIN. Vue
// visiteur : un rappel unique entre les stats et l'analyse fermee.
const blocDe=(debut,fin)=>js.slice(js.indexOf(debut),js.indexOf(fin,js.indexOf(debut)));
function dansLOrdre(bloc,attendu,nom){
  let curseur=-1;
  for(const jalon of attendu){
    const i=bloc.indexOf(jalon);
    assert.ok(i>curseur,`${nom} : "${jalon}" n'est pas a sa place dans l'ordre de lecture`);
    curseur=i;
  }
}
test("la page match assemble les sections dans l'ordre demande",()=>{
  // Page match V4 (04/10/2026) : l'Avis IASHARK puis, dans cet ordre, la
  // simulation (10 000 matchs), le film, le premier but, les jumeaux, les deux
  // equipes, les joueurs, l'arbitre ; panneau Marches a gauche / en tiroir.
  const rendu=blocDe("function render(raw,o)","function enTeteOffre");
  dansLOrdre(rendu,["['avis',signalCard(vm)","MS.clesAvis(vm,raw,dit)","MS.sections(c)","MS.panneau(c)"],"abonne");
  const ms=read("lib/match-sections.js");
  dansLOrdre(ms.slice(ms.indexOf("function sections(c)")),['["sim", simulation(c)','["film", film(c)','["premier", premier(c)','["jumeaux", jumeaux(c)','["equipes", equipes(c)','["joueurs", joueurs(c)','["arbitre", arbitre(c)'],"sections");
  // Match bloque : le composant de paiement juste sous l'en-tete, l'apercu flou dessous.
  dansLOrdre(blocDe("function renderProWall(raw,ctx)","function renderAuthWall"),["['offre',","['apercu',MS.apercuFlou()","IasharkOffrePro.mount(box"],"mur Pro");
  dansLOrdre(blocDe("function renderAuthWall(raw)","function renderApercu"),["['offre',carte","['apercu',MS.apercuFlou()"],"match offert sans compte");
  assert.match(js,/hero\(viewModel\(raw\),\{sansStats:true\}\)/,"apercu de chargement sans stats non plus");
  for(const parti of ["rappelCta","analyseVisiteur","ctaBar","bindCtaBar","signalSticky","faqCard"])assert.doesNotMatch(js,new RegExp("function\\s+"+parti+"\\s*\\("),parti+" reintroduit");
});

test("les blocs retires a la demande de l'utilisateur ne reviennent pas",()=>{
  for(const parti of ["reasonsCard","marketsVsMarketCard","marketsWatchCard","h2hCard","refereeCard","absencesCard","categorieAbsence","formH2HCard"]){
    assert.doesNotMatch(js,new RegExp("function\\s+"+parti+"\\s*\\("),`${parti} a ete reintroduit`);
  }
});

// Suivi (funnel-track.js) : un identifiant par bouton « Debloquer », libelle
// fixe sans donnee personnelle. Depuis le 19/09/2026, un seul bouton par vue :
// panneau Pro (match payant) ou avis « compte gratuit » (match offert). Les
// anciens emplacements (rappel, analyse, FAQ, barre mobile) ont disparu.
test("vue visiteur : un seul bouton Debloquer par vue, avec son identifiant de suivi",()=>{
  assert.match(js,/const suivi=kind=>` data-track="\$\{kind\}" data-track-kind="\$\{kind\}"`;/);
  // Match offert sans compte : un bouton « compte gratuit ».
  assert.equal((js.match(/suivi\('match_avis_unlock'\)/g)||[]).length,1);
  // Match bloque : LE composant de paiement porte le suivi ; le panneau Marches
  // flou de l'ordinateur ne fait que remonter jusqu'a lui (aucun second chemin).
  const mur=blocDe("function renderProWall(raw,ctx)","function renderAuthWall");
  assert.match(mur,/suivi:'match_gate_unlock'/);
  assert.match(mur,/href:'#sec-offre'[^}]*attrs:'data-mk-scroll'/);
  for(const k of ["match_recall_unlock","match_analysis_unlock","match_faq_unlock","match_bar_unlock"]){
    assert.ok(!js.includes(k),k+" : emplacement retire le 19/09/2026");
  }
});

// Les sections vides ne doivent toujours pas laisser de trou dans la page.
test("seules les sections non vides sont rendues",()=>{
  assert.match(js,/const S=sections\.filter\(x=>x&&x\[1\]\);/);
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

// L'AVIS IASHARK (abonne / match offert) : tout ce que le proprietaire a
// demande est rendu, et la mention « estimation statistique » figure DANS le
// bloc. V8 : « Nos chances face a la cote » en deux barres.
// 21/09/2026 (demande du proprietaire) : « Detail des chiffres », lien
// Methodologie et mentions 18+ / jeu responsable retires de la page match -
// outil d'analyse, pas un bookmaker. La mention 18+ reste au pied de page.
test("l'avis IASHARK montre pari, cote, deux barres, ecart, fiabilite, raisons et risques",()=>{
  // 04/10/2026 : l'Avis ne change pas d'un caractere (demande de Clement).
  const bloc=js.slice(js.indexOf("function signalCard(vm)"),js.indexOf("function texteRisque("));
  for(const attendu of ["sig-market","Cote utilisée","duoBars(","sig2-cmp","Nos chances face à la cote","relBadge(info)","Pourquoi ce pari","À surveiller",
    "Estimation statistique, pas une garantie."]){
    assert.ok(bloc.includes(attendu),`element de l'avis manquant : ${attendu}`);
  }
  for(const absent of ["Détail des chiffres","methodLink(","18+","Jouez responsable"]){
    assert.ok(!bloc.includes(absent),`retire le 21/09/2026, toujours present : ${absent}`);
  }
  assert.match(bloc,/r\.probability>0/);
  for(const attendu of ["sig-slip","sig-odds-box","confMeter(r.confidence)","riskStat(vm.editorial.riskCode)","raisons.slice(0,3)"]){
    assert.ok(bloc.includes(attendu),`element de l'avis manquant : ${attendu}`);
  }
  assert.match(js,/function confMeter\(conf\)[\s\S]*role="meter"[\s\S]*aria-valuemax="10"/);
  assert.match(js,/t\('match_page\.sig_conf_label','Probabilité estimée'\)/);
  assert.match(bloc,/raw\.has_signal===true&&raw\.no_signal!==true/);
  // A l'octet pres : la fonction est celle de la version d'origine (29/09).
  const crypto=require("node:crypto");
  const debut=js.indexOf("function signalCard(vm){");let p=0,fin=-1;
  for(let i=js.indexOf("{",debut);i<js.length;i++){if(js[i]==="{")p++;else if(js[i]==="}"){p--;if(!p){fin=i+1;break;}}}
  assert.equal(crypto.createHash("sha256").update(js.slice(debut,fin)).digest("hex"),"fce71ea0c37fadb1ed60d79d274daeac974bac3c54badcd1706d4569a33b827a");
});

// REGLE DU PROPRIETAIRE (16/09/2026) : tout ce que l'IA donne est FERME pour le
// visiteur, toutes les stats brutes sont OUVERTES. Les blocs fermes (avis,
// analyse, rappel, barre mobile) et la vue visiteur ne lisent aucune sortie du
// modele ; l'en-tete commun (hero) ne montre aucune probabilite.
test("vue visiteur : blocs fermes sans aucune donnee du modele, copie publique avant tout calcul",()=>{
  const gate=js.slice(js.indexOf("function enTeteOffre(raw)"),js.indexOf("function renderApercu"));
  assert.ok(gate.length>1500,"vue visiteur introuvable");
  for(const fn of ["function renderProWall","function renderAuthWall"])assert.ok(gate.includes(fn),fn+" hors de la tranche controlee");
  for(const interdit of ["recommendation","probabilities","marketTable","recommendedOdds","recommendedEdge","recommendedImplied","scoringProbability","signalReasons","expectedGoals","goalTiming","simulationCount","pari_rec","cote_rec","model_probability","market_id","riskCode","odds(","pct(","pts(","confMeter","signalCard(","MS.sections(","MS.panneau(","sim_15min","marches_panneau","v3_buteurs"]){
    assert.ok(!gate.includes(interdit),`la vue visiteur lit ${interdit}`);
  }
  assert.doesNotMatch(gate,/\.conf\b/);
  assert.equal((gate.match(/const vm=viewModel\(publicCopy\(raw\)\);/g)||[]).length,2,"copie publique avant tout calcul, dans les deux murs");
  assert.match(gate,/etatAnalyse\(raw\)/);
  assert.match(gate,/bandeDe\(raw\)/);
  assert.match(js,/const bandeDe=m=>m&&Object\.prototype\.hasOwnProperty\.call\(BANDES,m\.prob_band\)\?m\.prob_band:null;/);
  // Copie locale de la liste premium : au moins lib/premium-fields.js, plus les
  // champs du 04/10 (panneau, simulation, jumeaux) meme avant leur ajout la-bas.
  const copie=JSON.parse(js.match(/const CHAMPS_PREMIUM=(\[[^\]]*\]);/)[1]);
  const ref=require("../lib/premium-fields.js").PREMIUM_FIELDS;
  ref.forEach(k=>assert.ok(copie.includes(k),k+" absent de la copie"));
  copie.filter(k=>!ref.includes(k)).forEach(k=>assert.ok(["marches_panneau","sim_resume","jumeaux"].includes(k),k+" : champ inconnu"));
  // Apercu flou et panneau flou : constantes seulement (aucune donnee lue).
  const MS=require("../lib/match-sections.js");
  assert.equal(MS.apercuFlou.length,0,"l'apercu ne prend aucune donnee");
  assert.equal(MS.panneauFlou(46,"").replace(/46/g,""),MS.panneauFlou(12,"").replace(/12/g,""),"panneau flou : seul le nombre public change");
  const hero=js.slice(js.indexOf("function hero(vm,o)"),js.indexOf("const REL_NIVEAUX"));
  assert.ok(!/probabilities|probBar|recommendation/.test(hero),"l'en-tete ne doit montrer aucune probabilite du modele");
  assert.doesNotMatch(js,/function probBar\(/);
});

// SEO : le resume statique des pages match n'est plus masque en CSS (texte
// cache). Revu DELIBEREMENT le 15/09/2026 (audit perf, CLS 0,7) : il n'est plus
// supprime au rendu ; il garde le seul h1 et l'en-tete de l'application passe
// en h2 sur ces pages (h1 sur match.html?id= sans resume statique).
test("le resume SEO n'est pas masque, n'est plus supprime et la page garde un seul h1",()=>{
  assert.doesNotMatch(css,/\.match-shell>div:not\(#matchRoot\)\{[^}]*display:none/);
  assert.match(js,/function resumeSeoStatique\(\)/);
  assert.doesNotMatch(js,/remplacerResumeSeo|\.remove\(\)/,"le resume statique ne doit plus etre retire du DOM");
  assert.match(js,/const enH2=demo\|\|!!resumeSeoStatique\(\)/);
  assert.equal((js.match(/<h1\b/g)||[]).length,1,"un seul h1 genere par la page");
  assert.match(js,/<h1 class="hero-teams">/);
});

// PERF (audit 15/09/2026) : logos de l'en-tete sans lazy, dimensionnes et
// prioritaires (element LCP) ; aucun repli sur /data.json (~25 Mo).
test("en-tete : logos dimensionnes, charges en priorite ; pas de repli data.json",()=>{
  const hero=js.slice(js.indexOf("function hero(vm,o)"),js.indexOf("const REL_NIVEAUX"));
  assert.match(hero,/img\(i\.home\.logo,'',60,60,\{eager:true,priority:true\}\)/);
  // Visiteur (19/09/2026) : ni classement ni forme dans l'en-tete.
  assert.match(hero,/\$\{o\.sansStats\?'':`<div class="hero-meta">/);
  assert.match(hero,/img\(i\.away\.logo,'',60,60,\{eager:true,priority:true\}\)/);
  assert.doesNotMatch(hero,/class="card hero reveal"/,"l'en-tete ne doit pas demarrer en opacite 0");
  assert.match(js,/fetchpriority="high"/);
  assert.doesNotMatch(js,/fetch\('\/data\.json'/);
  assert.match(js,/function renderIntrouvable\(list,id\)/);
});

// La carte buteur menait avec un tableau plat de quatre lignes, puis avec la
// probabilite de marquer en 42px cyan. Le chiffre etait juste mais criait
// plus fort que le nom du joueur. Elle est desormais lue dans l'ordre : qui,
// puis quelle probabilite, puis les chiffres de contexte.
test("la carte buteur affiche la probabilite de marquer sans ecraser le joueur",()=>{
  // 04/10/2026 : section « Les joueurs » (lib/match-sections.js), calcul buteur du
  // moteur v3 seulement ; jauge Magic UI lisible aussi par un lecteur d'ecran.
  const MS=require("../lib/match-sections.js");
  global.window=undefined;
  const vm={id:7,identity:{home:{name:"Lens"},away:{name:"Lille"}},model:{},players:{}};
  const raw={v3_buteurs:[{joueur_id:1,joueur:"A. Buteur",cote:"home",poste:"F",p_marque:0.36,chance:35},{joueur_id:2,joueur:"B. Autre",cote:"away",poste:"M",p_marque:0.2,chance:20},{joueur_id:3,joueur:"Trop Haut",cote:"home",chance:60}]};
  const h=MS.joueurs({raw,vm,vuePro:true,dit:MS.registre()});
  assert.match(h,/A\. Buteur/);assert.match(h,/titulaire probable/);
  assert.doesNotMatch(h,/Trop Haut/,"plus de 45 % : jamais affiche");
  assert.equal(MS.joueurs({raw:{},vm,vuePro:true,dit:MS.registre()}),"","sans v3_buteurs : section absente");
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
  const MS=require("../lib/match-sections.js");
  const vm={id:7,identity:{home:{name:"Lens"},away:{name:"Lille"}},model:{},players:{}};
  const raw={v3_buteurs:[{joueur_id:1,joueur:"A. Buteur",cote:"home",poste:"F",p_marque:0.36,chance:35}]};
  const h=MS.joueurs({raw,vm,vuePro:true,dit:MS.registre()});
  assert.equal((h.match(/35\s?%/g)||[]).length,1,"la chance d'un joueur n'est ecrite qu'une fois");
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
// V8 (16/09/2026, decision du proprietaire, fixture mise a jour deliberement) :
// « Quel est le pronostic IASHARK pour ce match ? » est posee, reponse fermee
// au visiteur.
test("la FAQ ne repose pas les questions deja traitees dans la page",()=>{
  // 04/10/2026 (demande de Clement : « aucune repetition ») : plus de FAQ sur la
  // page match ; chaque reponse est dans sa section (simulation, film, equipes,
  // arbitre). Aucun balisage FAQ.
  assert.doesNotMatch(js,/function faqCard|FAQPage|faq_section_title/);
});

// Questions frequentes : faits publics ouverts ; reponses du modele (pronostic,
// 15 premieres minutes, chances de chaque equipe, sur quoi repose l'analyse)
// FERMEES au visiteur, texte jamais construit.
test("FAQ : vue abonne seulement, jamais de question verrouillee",()=>{
  const ms=read("lib/match-sections.js");
  assert.doesNotMatch(js+ms,/faq-lock|faq-pro|match_faq_unlock/);
});

// Les logos d'equipe ne doivent jamais etre masques en rond : un ecusson a sa
// propre forme.
test("les logos d'equipe sont detoures, pas mis en pastille ronde",()=>{
  // 04/10/2026 : logoEquipe servait aux blocs forme / face-a-face, retires. La
  // regle CSS reste : un ecusson garde sa forme.
  assert.match(css,/\.logo-eq\{[^}]*border-radius:0/);
  assert.match(css,/\.logo-eq\{[^}]*object-fit:contain/);
  assert.match(css,/\.logo-eq\{[^}]*background:none/);
});

// ---------------------------------------------------------------------------
// MUR PRO UNIQUE (19/09/2026, donnees du proprietaire : 3 visiteurs sur 4
// n'atteignaient pas l'offre, les petits « Debloquer » disperses ne recevaient
// aucun clic). Match payant sans Pro : UN panneau la ou l'analyse commence,
// langage du verrou « Buteurs du jour » de l'accueil.
// ---------------------------------------------------------------------------
const LOCALES=["fr","en","es","es-mx","de","it","pt"];
// 04/10/2026 : le mur Pro est le composant de paiement (offre_pro.*) ; restent ici
// les textes de reprise.
const CLES_MUR=["recovery_title","recovery_text","recovery_free_cta","recovery_home_cta"];
test("mur Pro : un seul panneau, apercu factice sans aucune donnee, bouton ambre suivi, resiliation",()=>{
  // 04/10/2026 (demande de Clement) : LE composant de paiement (lib/offre-pro.js)
  // juste sous l'en-tete, un apercu flou court dessous ; bouton cyan (l'or est
  // reserve a la Selection en or) ; prix lus dans config/markets.json.
  const mur=blocDe("function renderProWall(raw,ctx)","function renderAuthWall");
  assert.match(mur,/IasharkOffrePro\.mount\(box,\{mode:'vitrine',contexte:'match',next:cheminMatch\(raw\)/);
  assert.doesNotMatch(js,/\d+[,.]\d\d\s?€|€\s?\d|£|MX\$|\bR\s?\d/,"aucun prix ecrit en dur");
  const auth=blocDe("function renderAuthWall(raw)","function renderApercu");
  assert.doesNotMatch(auth,/IasharkOffrePro|proOffer|IASHARK_MARKET|price/,"le match offert n'affiche jamais de prix");
  assert.doesNotMatch(js+read("assets/offre-pro.css"),/mgate-cta|#fbbf24|--amber\)/,"bouton ambre retire");
  const MS=require("../lib/match-sections.js");
  const ap=MS.apercuFlou();
  assert.match(ap,/aria-hidden="true" inert/);
  assert.match(ap,/Xxxx xxxxxxxxx/);
  assert.doesNotMatch(ap,/pari conseillé|Pari recommandé/);
});

// Plus d'impasse « Match introuvable » (19/09/2026).
test("sans identifiant : retour a l'accueil de la version ; match plus publie : bloc de reprise",()=>{
  const init=js.slice(js.indexOf("async function init()"));
  assert.match(init,/if\(!demoMode&&!id\)\{location\.replace\(lien\(''\)\);return;\}/);
  assert.ok(init.indexOf("location.replace(lien(''))")<init.indexOf("await window.I18N.init()"),"redirection avant tout chargement");
  assert.doesNotMatch(js,/throw new Error\(t\('match_page\.match_not_found'/);
  assert.match(init,/renderIntrouvable\(liste&&Array\.isArray\(liste\.matchs\)\?liste\.matchs:null,id\)/);
  const reprise=js.slice(js.indexOf("function renderIntrouvable(list,id)"),js.indexOf("function traduireShellSeo"));
  // Match gratuit du jour : meme module et meme marche que l'accueil, jamais ce match-ci.
  assert.match(reprise,/IasharkFreeMatch\.pickFreeMatchId\(list,null,\(window\.IASHARK_MARKET&&window\.IASHARK_MARKET\.code\)\|\|null\)/);
  assert.match(reprise,/String\(offert\)===String\(id\)\)\)offert=null/);
  assert.match(reprise,/lien\('match\.html\?id='\+offert\)/);
  assert.match(reprise,/lien\(''\)/);
  for(const k of ["recovery_title","recovery_text","recovery_free_cta","recovery_home_cta"])assert.ok(reprise.includes("match_page."+k),k);
  assert.doesNotMatch(reprise,/match_ended_or_missing/);
  // La page reste noindex.
  assert.match(html,/<meta name="robots" content="noindex,follow">/);
});

test("mur Pro et reprise : textes dans les 7 langues, dictionnaires et parts identiques, repli FR = dictionnaire FR",()=>{
  for(const loc of LOCALES){
    const dict=JSON.parse(read(`i18n/dict/${loc}.json`)).match_page;
    const part=JSON.parse(read(`i18n/parts/matchpage.${loc}.json`)).match_page;
    for(const k of CLES_MUR){
      assert.ok(typeof dict[k]==="string"&&dict[k].trim(),`${loc} : match_page.${k} absent du dictionnaire`);
      assert.equal(part[k],dict[k],`${loc} : match_page.${k} differe entre parts et dictionnaire`);
    }
  }
  // Textes du match offert (match_v4.free_*) et du composant de paiement : 7 langues.
  for(const loc of LOCALES){
    const d=JSON.parse(read(`i18n/dict/${loc}.json`));
    for(const k of ["free_title","free_sub","free_cta","free_login","preview_title","panel_cta"])assert.ok(String(d.match_v4[k]||"").trim(),`${loc} : match_v4.${k}`);
    for(const k of ["title_match","title_general","pay_card","pay_stripe","pay_no_commitment","pay_cancel"])assert.ok(String(d.offre_pro[k]||"").trim(),`${loc} : offre_pro.${k}`);
  }
  const fr=JSON.parse(read("i18n/dict/fr.json")).match_page;
  for(const k of CLES_MUR){
    const m=js.match(new RegExp(`(?:'match_page\\.${k}'|\\['${k}'),'([^']*)'`));
    assert.ok(m,`repli FR de ${k} introuvable dans match-page.js`);
    assert.equal(m[1],fr[k],`repli FR de ${k} different du dictionnaire`);
  }
});
