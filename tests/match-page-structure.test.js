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
  // "Pourquoi le pari ressort" -> "Comparatif des deux equipes" ;
  // "Questions sur ce match" ajoutee.
  // Refonte du 14/09/2026 (demande du proprietaire) : le signal au centre.
  // Page match V8 (16/09/2026, maquette validee par le proprietaire, fixture
  // mise a jour deliberement) : "L'avis IASHARK", "Les stats du match" (forme,
  // classement, confrontations, comparatif, compositions), "L'analyse IASHARK"
  // (scenario, ce que dit le modele, probabilites et cotes, marches joueurs),
  // "Questions frequentes". "Absences" et "Forme et face-a-face" retirees.
  for(const value of ['L’avis IASHARK','Pari recommandé','Les stats du match','Forme récente','Classement','Confrontations directes','Comparatif des deux équipes','Compositions','L’analyse IASHARK','Scénario probable du match','Ce que dit le modèle','Buts attendus','Scores les plus probables','Probabilités et cotes','Marchés joueurs','Questions fréquentes'])assert.match(js,new RegExp(value));
  assert.doesNotMatch(js,/function absencesCard|absences_title|abs-grid|formh2h_title/);
  assert.doesNotMatch(css,/\.abs-|\.mk-table|\.mk-scroll/);
  // Marque ecrite comme sur le reste du site.
  assert.doesNotMatch(js,/IAShark/);
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
  dansLOrdre(blocDe("const sections=[","];"),["['resultat',","['avis',signalCard","'Les stats du match'","['analyse',","['questions',faqCard","['abonnement',"],"abonne");
  // 20/09/2026 (lot R4) : render(raw,ouverture) - ouverture ne porte QUE
  // l'ouverture decidee par le serveur sur un match termine (bandeau de
  // resultat en tete, appel a l'abonnement en bas). Vue abonne inchangee.
  assert.match(blocDe("function render(raw,ouverture)","const sections=["),/analyse=analyseAbonne\(vm\)/);
  dansLOrdre(blocDe("function analyseAbonne(vm)","function render(raw)"),["scenarioCard(vm)","outputsCard(vm,","marketsCard(vm)","threatsCard(vm,"],"analyse abonne");
  dansLOrdre(blocDe("function statsBlocs(vm)","}"),["formeFold","classementFold","h2hFold","comparatifFold","compoFold"],"stats");
  const visiteur=blocDe("function renderVisitor(raw,opts)","function renderAuthWall");
  // Vue visiteur (decision du proprietaire, 19/09/2026) : l'en-tete sans
  // stats et UN panneau, rien d'autre (ni stats, ni FAQ, ni rappel, ni
  // analyse fermee, ni barre mobile).
  assert.match(visiteur,/paint\(vm,\[\['avis',o\.free\?gateCard\(vm,o\):proGate\(vm,o\),true\]\],'','',\{sansStats:true\}\);/);
  assert.doesNotMatch(visiteur,/\['stats',|\['questions',|\['rappel',|\['analyse',|faqCard\(/);
  assert.match(js,/hero\(viewModel\(raw\),\{sansStats:true\}\)/,"apercu de chargement sans stats non plus");
  for(const parti of ["rappelCta","analyseVisiteur","ctaBar","bindCtaBar"])assert.doesNotMatch(js,new RegExp("function\\s+"+parti+"\\s*\\("),parti+" reintroduit");
  // Sommaire collant.
  assert.match(js,/nav_avis','Avis IASHARK'[\s\S]*nav_stats','Stats'[\s\S]*nav_analysis','Analyse'[\s\S]*nav_questions','Questions'/);
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
  for(const k of ["match_gate_unlock","match_avis_unlock"]){
    assert.equal((js.match(new RegExp("suivi\\('"+k+"'\\)","g"))||[]).length,1,k);
  }
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
// demande est rendu, et la mention 18+ / estimation statistique figure DANS le
// bloc. V8 : « Nos chances face a la cote » en deux barres, detail replie.
test("l'avis IASHARK montre pari, cote, deux barres, ecart, fiabilite, raisons, risques et 18+",()=>{
  const bloc=js.slice(js.indexOf("function signalCard(vm)"),js.indexOf("function marketsCard"));
  for(const attendu of ["sig-market","Cote utilisée","duoBars(","sig2-cmp","Nos chances face à la cote","Détail des chiffres","relBadge(info)","Pourquoi ce pari","À surveiller",
    "18+ · Estimation statistique, pas une garantie."]){
    assert.ok(bloc.includes(attendu),`element de l'avis manquant : ${attendu}`);
  }
  // Une probabilite nulle ou absente n'est jamais affichee "0 %".
  assert.match(bloc,/r\.probability>0/);
  for(const attendu of ["sig-slip","sig-odds-box","confMeter(r.confidence)","riskStat(vm.editorial.riskCode)","raisons.slice(0,3)"]){
    assert.ok(bloc.includes(attendu),`element de l'avis manquant : ${attendu}`);
  }
  assert.match(js,/function confMeter\(conf\)[\s\S]*role="meter"[\s\S]*aria-valuemax="10"/);
  assert.match(js,/t\('match_page\.sig_conf_label','Probabilité estimée'\)/);
  assert.ok(bloc.includes("methodLink()"),"lien Methodologie absent de l'avis");
  // Analyse annoncee mais champs premium absents : jamais "aucun marche".
  assert.match(bloc,/raw\.has_signal===true&&raw\.no_signal!==true/);
  // Deux barres par pari dans « Probabilites et cotes », marche absent = non disponible.
  const marches=js.slice(js.indexOf("function marketsCard"),js.indexOf("function formeFold"));
  assert.match(marches,/duoBars\(\{model:r\.model,market:r\.market/);
  assert.match(marches,/aide\(texteAideCote\(\),labelAideCote\(\)\)/);
});

// REGLE DU PROPRIETAIRE (16/09/2026) : tout ce que l'IA donne est FERME pour le
// visiteur, toutes les stats brutes sont OUVERTES. Les blocs fermes (avis,
// analyse, rappel, barre mobile) et la vue visiteur ne lisent aucune sortie du
// modele ; l'en-tete commun (hero) ne montre aucune probabilite.
test("vue visiteur : blocs fermes sans aucune donnee du modele, copie publique avant tout calcul",()=>{
  const gate=js.slice(js.indexOf("function gateCard(vm,opts)"),js.indexOf("function renderAuthWall"));
  assert.ok(gate.length>2000,"vue visiteur introuvable");
  for(const fn of ["function gateCard","function proGate","function renderVisitor"])assert.ok(gate.includes(fn),fn+" hors de la tranche controlee");
  for(const interdit of ["recommendation","probabilities","marketTable","recommendedOdds","recommendedEdge","recommendedImplied","scoringProbability","signalReasons","expectedGoals","goalTiming","simulationCount","pari_rec","cote_rec","model_probability","market_id","riskCode","odds(","pct(","pts(","confMeter","signalCard(","marketsCard(","outputsCard(","threatsCard(","scenarioCard(","analyseAbonne(","signalSticky("]){
    assert.ok(!gate.includes(interdit),`la vue visiteur lit ${interdit}`);
  }
  assert.doesNotMatch(gate,/\.conf\b/);
  assert.match(gate,/sig-ghost/);
  assert.match(gate,/methodLink\(\)/);
  assert.match(gate,/const vm=viewModel\(publicCopy\(raw\)\);/);
  assert.doesNotMatch(gate,/faqCard\(/,"aucune FAQ pour le visiteur");
  // Champs publics seulement : etat de l'analyse et niveau prob_band.
  assert.match(gate,/etatAnalyse\(raw\)/);
  assert.match(gate,/bandeDe\(raw\)/);
  assert.match(js,/const bandeDe=m=>m&&Object\.prototype\.hasOwnProperty\.call\(BANDES,m\.prob_band\)\?m\.prob_band:null;/);
  // Copie locale de la liste premium = lib/premium-fields.js, a l'identique.
  const copie=JSON.parse(js.match(/const CHAMPS_PREMIUM=(\[[^\]]*\]);/)[1]);
  assert.deepEqual(copie,require("../lib/premium-fields.js").PREMIUM_FIELDS);
  // Match payant : mur Pro (offre Pro avec retour a ce match) ; match offert
  // sans compte : meme page, CTA compte gratuit.
  assert.match(js,/function renderProWall\(raw\)\{\s*renderVisitor\(raw,\{href:offrePro\(raw\)\}\);/);
  assert.ok(gate.includes("function proGate(vm,o)"),"mur Pro hors de la tranche controlee");
  const auth=js.slice(js.indexOf("function renderAuthWall"),js.indexOf("function renderProWall"));
  assert.match(auth,/renderVisitor\(raw,\{\s*free:true,/);
  assert.match(auth,/lien\('compte\.html'\)/);
  assert.match(auth,/Créer un compte gratuit \/ Se connecter/);
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
// V8 (16/09/2026, decision du proprietaire, fixture mise a jour deliberement) :
// « Quel est le pronostic IASHARK pour ce match ? » est posee, reponse fermee
// au visiteur.
test("la FAQ ne repose pas les questions deja traitees dans la page",()=>{
  const bloc=js.slice(js.indexOf("function faqCard(vm,o)"));
  for(const deja of ["Qui est favori","Combien de buts sont attendus","Quel pari IASHARK retient",
                     "d’accord avec le marché","niveau de risque de ce pari"]){
    assert.ok(!bloc.includes(deja),`la FAQ repose une question deja traitee : "${deja}"`);
  }
  assert.match(bloc,/exclusiveFacts/);
  for(const attendu of ["marque le plus tôt","craque-t-elle en fin de match","cartons","occasions"]){
    assert.ok(bloc.includes(attendu),`question exclusive manquante : "${attendu}"`);
  }
});

// Questions frequentes : faits publics ouverts ; reponses du modele (pronostic,
// 15 premieres minutes, chances de chaque equipe, sur quoi repose l'analyse)
// FERMEES au visiteur, texte jamais construit.
test("FAQ : vue abonne seulement, jamais de question verrouillee",()=>{
  const faq=js.slice(js.indexOf("function faqCard(vm,o)"),js.indexOf("\n}\n",js.indexOf("function faqCard(vm,o)")));
  assert.ok(faq.length>1000,"faqCard introuvable");
  // 19/09/2026 : le visiteur ne voit plus la FAQ (panneau seul) ; plus de
  // branche fermee, de question « Pro » verrouillee ni de lien « Debloquer ».
  assert.doesNotMatch(faq,/if\(ferme\)|verrou|faq-lock|faq-pro|match_faq_unlock|,null\]/);
  const visiteur=js.slice(js.indexOf("function renderVisitor(raw,opts)"),js.indexOf("function renderAuthWall"));
  assert.doesNotMatch(visiteur,/faqCard\(/);
  assert.match(faq,/faq_section_title','Questions fréquentes'/);
});

// Les logos d'equipe ne doivent jamais etre masques en rond : un ecusson a sa
// propre forme.
test("les logos d'equipe sont detoures, pas mis en pastille ronde",()=>{
  assert.match(js,/function logoEquipe/);
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
const CLES_MUR=["pro_gate_title","pro_gate_sr","pro_gate_item_bet","pro_gate_item_scorer","pro_gate_item_scenario","pro_gate_item_scores","pro_gate_item_odds","pro_gate_item_stats","pro_gate_item_faq","pro_gate_cta","pro_gate_small","recovery_title","recovery_text","recovery_free_cta","recovery_home_cta"];
test("mur Pro : un seul panneau, apercu factice sans aucune donnee, bouton ambre suivi, resiliation",()=>{
  const mur=js.slice(js.indexOf("const FAUX_TICKET="),js.indexOf("function renderVisitor(raw,opts)"));
  assert.ok(mur.length>1500,"mur Pro introuvable");
  // Apercu : texte factice (« Xxxx », « ??,? % »), aucun chiffre, masque aux lecteurs d'ecran.
  const faux=js.slice(js.indexOf("const FAUX_TICKET="),js.indexOf("function apercuFactice"));
  assert.doesNotMatch(faux,/\d/,"l'apercu factice ne doit contenir aucun chiffre");
  assert.doesNotMatch(faux,/\$\{/,"l'apercu factice ne lit aucune donnee");
  assert.match(faux,/\?\?,\? %/);
  assert.match(mur,/<div class="mgate-preview" aria-hidden="true">/);
  // Panneau : titre (h2), explication pour lecteur d'ecran, contenu, bouton, resiliation.
  assert.match(mur,/<h2 id="gateTitle" class="mgate-title">\$\{esc\(t\('match_page\.pro_gate_title','Débloque l’analyse complète de ce match'\)\)\}<\/h2>/);
  assert.match(mur,/<p class="sr-only">\$\{esc\(t\('match_page\.pro_gate_sr',/);
  assert.match(mur,/<a class="mgate-cta" href="\$\{esc\(o\.href\)\}"\$\{suivi\('match_gate_unlock'\)\}>\$\{esc\(t\('match_page\.pro_gate_cta','Débloquer avec Pro'\)\)\}/);
  assert.match(mur,/pro_gate_small','Résiliable à tout moment depuis ton compte\.'/);
  // 19/09/2026 : ce que Pro donne en plus (une ligne sous la liste) et prix
  // mensuel pres du bouton, lu dans la MEME source que la page d'abonnement
  // (lib/market-config.js#proOffer) ; sans prix, la ligne de resiliation seule.
  assert.match(mur,/<p class="mgate-more">\$\{esc\(t\('pro_offer\.match_more','\+ tous les matchs du jour, les 3 buteurs du jour et les outils Pro'\)\)\}<\/p>/);
  assert.ok(mur.indexOf('class="mgate-list"')<mur.indexOf('class="mgate-more"')&&mur.indexOf('class="mgate-more"')<mur.indexOf('class="mgate-cta"'),"ligne « en plus » entre la liste et le bouton");
  assert.match(mur,/<p class="mgate-small">\$\{esc\(prix\?tf\('pro_offer\.price_month','\{price\}\/mois · résiliable à tout moment',\{price:prix\}\):t\('match_page\.pro_gate_small',/);
  const prixFn=js.slice(js.indexOf("function prixMensuelPro()"),js.indexOf("function proGate(vm,o)"));
  assert.match(prixFn,/const M=window\.IASHARK_MARKET;/);
  assert.match(prixFn,/M\.proOffer\(\)\.intervals\.filter\(i=>i\.interval==='month'\)\[0\]/);
  assert.match(prixFn,/return it&&it\.amount!=null&&it\.open!==false&&it\.text\?it\.text:null;/,"prix absent ou mensuel pas encore payable = pas de prix, jamais devine");
  assert.doesNotMatch(prixFn+mur,/\d+[,.]\d\d\s?€|€\s?\d|£|MX\$|\bR\s?\d/,"aucun prix ecrit en dur");
  // Match offert (compte gratuit) : aucun prix.
  const avis=js.slice(js.indexOf("function gateCard(vm,opts)"),js.indexOf("// MUR PRO (visiteur"));
  assert.ok(avis.length>500,"gateCard introuvable");
  assert.doesNotMatch(avis,/prixMensuelPro|price_month|proOffer|IASHARK_MARKET/,"le panneau du match offert n'affiche jamais de prix");
  for(const k of ["pro_gate_item_bet","pro_gate_item_scorer","pro_gate_item_scenario","pro_gate_item_scores","pro_gate_item_odds","pro_gate_item_stats","pro_gate_item_faq"])assert.ok(mur.includes(`['${k}',`),k);
  // « Pas de pari retenu » (public) : ni ticket factice ni promesse de pari ;
  // stats et FAQ listees seulement si le match en a.
  assert.match(mur,/\.filter\(\(\[k\],i\)=>\(etat!=='none'\|\|i>0\)&&\(o\.stats\|\|/);
  assert.match(mur,/apercuFactice\(etat!=='none'\)/);
  // Libelles honnetes (18/09/2026) : jamais « pari conseille » dans le mur.
  assert.doesNotMatch(mur,/pari conseillé|Pari recommandé/);
  // Match payant seulement : le match offert garde son avis « compte gratuit ».
  assert.match(js,/\['avis',o\.free\?gateCard\(vm,o\):proGate\(vm,o\),true\]/);
  // Offre Pro avec retour a ce match (abonnement-page.js#contexteMatch).
  assert.match(js,/function offrePro\(raw\)\{[\s\S]{0,200}lien\('abonnement\.html\?next='\+encodeURIComponent\(lien\('match\.html\?id='\+id\)\)\)/);
  // Style : meme langage que .hs-gate* de l'accueil (flou, bouton ambre).
  const bloc=css.slice(css.indexOf("MUR PRO (visiteur"));
  assert.match(bloc,/\.mgate-preview\{[^}]*filter:blur\([3-8]px\)/);
  assert.match(bloc,/\.mgate-card\{[^}]*background:linear-gradient\(180deg,rgba\(15,26,40,\.96\),rgba\(9,16,25,\.98\)\)/,"carte opaque : texte lisible sur le flou");
  assert.match(bloc,/\.mgate-cta\{[^}]*background:linear-gradient\(135deg,#fbbf24,var\(--amber\)\)/);
  assert.match(bloc,/\.mgate-stage>\*\{grid-area:1\/1/);
  assert.match(css,/--amber:#f59e0b/);
  assert.match(bloc,/\.mgate-more\{[^}]*color:var\(--accent\)/,"ligne « en plus » : une ligne de texte, pas une carte");
  assert.doesNotMatch((bloc.match(/\.mgate-more\{[^}]*\}/)||[""])[0],/border|background|padding/,"pas de boite autour de la ligne « en plus »");
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
  const fr=JSON.parse(read("i18n/dict/fr.json")).match_page;
  for(const k of CLES_MUR){
    const m=js.match(new RegExp(`(?:'match_page\\.${k}'|\\['${k}'),'([^']*)'`));
    assert.ok(m,`repli FR de ${k} introuvable dans match-page.js`);
    assert.equal(m[1],fr[k],`repli FR de ${k} different du dictionnaire`);
  }
});
