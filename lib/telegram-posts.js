(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.IasharkTelegramPosts=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
// Messages de la chaine Telegram privee d'IASHARK : les 4 rendez-vous du plan valide par
// Clement le 03/11/2026 (heure de Paris) :
//   9 h « Hier », 12 h « Le match offert », 1 h avant le gros match du soir « Les compos »,
//   23 h 15 « Le debat ». Plus de guide, de sondage, d'actu ni de liste de 18 h 30.
// Logique PURE (sauf les fonctions de flux, qui recoivent l'API en parametre) : lit les
// fichiers du pipeline et rend des messages prets a envoyer. Preparation :
// scripts/telegram/build-posts.mjs ; envoi : scripts/telegram/send-posts.mjs.
//
// Regles (non negociables, verifiees par tests/telegram-posts.test.js) :
// - avant match, jamais de pari payant : seulement le prono d'appel des compos. Combines,
//   buteurs, montantes et matchs en or ne sont cites qu'apres coup, dans « Hier » ;
// - gagnes ET perdus, jamais de cache ; une donnee absente : la ligne n'apparait pas ;
// - aucun chiffre invente : chaque chiffre vient d'un fichier du pipeline, de la base ou de l'API ;
// - un score n'est publie que si la liste des buts le redonne (film-du-match.js#controlerMatch) ;
// - aucune mise, unite, capital ni esperance ; aucune promesse de gain ; aucune emoticone ;
//   aucun bookmaker nomme ; pas de mention « jouer comporte des risques » (choix de Clement).

var SITE='https://iashark.com';
// Lien d'affiliation 1win propre a Telegram (09/11/2026, Clement) : passe par /go/1win/telegram
// (netlify/edge-functions/lib/go-links.mjs), le code partenaire de Telegram y est.
var LIGNE_1WIN='\n<a href="'+SITE+'/go/1win/telegram">Parier ce match chez 1win</a> (18+)';
var INVITATION='https://t.me/+qCEr2JFPDDBlZTFk';

// Equipes nationales : le site garde les noms anglais de l'API, le canal est
// en francais. Clubs : jamais traduits.
var PAYS={Austria:'Autriche',Belgium:'Belgique',Croatia:'Croatie',Czechia:'Tchéquie','Czech Republic':'Tchéquie',Denmark:'Danemark',
  England:'Angleterre',France:'France',Germany:'Allemagne',Greece:'Grèce',Hungary:'Hongrie',Iceland:'Islande',Ireland:'Irlande',
  'Rep. Of Ireland':'Irlande','Republic of Ireland':'Irlande','Northern Ireland':'Irlande du Nord',Italy:'Italie',Netherlands:'Pays-Bas',
  Norway:'Norvège',Poland:'Pologne',Portugal:'Portugal',Romania:'Roumanie',Scotland:'Écosse',Serbia:'Serbie',Slovakia:'Slovaquie',
  Slovenia:'Slovénie',Spain:'Espagne',Sweden:'Suède',Switzerland:'Suisse',Turkey:'Turquie','Türkiye':'Turquie',Ukraine:'Ukraine',
  Wales:'Pays de Galles',Albania:'Albanie',Andorra:'Andorre',Armenia:'Arménie',Azerbaijan:'Azerbaïdjan',Belarus:'Biélorussie',
  'Bosnia & Herzegovina':'Bosnie-Herzégovine','Bosnia and Herzegovina':'Bosnie-Herzégovine',Bulgaria:'Bulgarie',Cyprus:'Chypre',
  Estonia:'Estonie','Faroe Islands':'Îles Féroé',Finland:'Finlande',Georgia:'Géorgie',Gibraltar:'Gibraltar',Israel:'Israël',
  Kazakhstan:'Kazakhstan',Kosovo:'Kosovo',Latvia:'Lettonie',Liechtenstein:'Liechtenstein',Lithuania:'Lituanie',Luxembourg:'Luxembourg',
  Malta:'Malte',Moldova:'Moldavie',Montenegro:'Monténégro','North Macedonia':'Macédoine du Nord','San Marino':'Saint-Marin',
  Brazil:'Brésil',Argentina:'Argentine',Morocco:'Maroc',Algeria:'Algérie',Tunisia:'Tunisie',Senegal:'Sénégal',Egypt:'Égypte',
  Nigeria:'Nigeria',Cameroon:'Cameroun',"Ivory Coast":"Côte d'Ivoire",Mexico:'Mexique',USA:'États-Unis',Japan:'Japon',
  'South Korea':'Corée du Sud',Colombia:'Colombie',Uruguay:'Uruguay',Chile:'Chili',Peru:'Pérou',Ecuador:'Équateur',Canada:'Canada'};
var COMPET={'UEFA Nations League':'Ligue des nations','UEFA Champions League':'Ligue des champions','UEFA Europa League':'Ligue Europa','UEFA Europa Conference League':'Ligue Conférence'};
var JOURS=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
var MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function num(v){if(v===null||v===undefined||v==='')return null;var n=Number(v);return isFinite(n)?n:null;}
function equipe(t){var n=t&&(t.n||t.name)||'';if(PAYS[n])return PAYS[n];var NF=modulePage('./noms-equipes-fr.js');return NF&&NF.nom?NF.nom(n):n;}
// Le pari ecrit EXACTEMENT comme sur la page match (une seule source, 01/10/2026) : meme
// fonction de libelle (lib/market-labels.js#marketLabelFr) et memes noms courts d'equipes
// (lib/match-view-model.js#nomCourt). Modules absents : le libelle du moteur, tel quel.
function modulePage(nom){try{return typeof require==='function'?require(nom):null;}catch(e){return null;}}
function pariAffiche(m){
  var brut=String(m&&m.pari_rec||'').trim();
  var ML=modulePage('./market-labels.js'),VM=modulePage('./match-view-model.js');
  if(!brut||!ML||!ML.marketLabelFr)return brut;
  var court=function(t){var n=t&&(t.n||t.name)||'';return (VM&&VM.nomCourt?VM.nomCourt(n):null)||n;};
  var x=ML.marketLabelFr(brut,{home:court(m.home),away:court(m.away)});
  return x&&String(x).trim()?String(x).trim():brut;
}
function competition(m){return COMPET[m.league]||m.league||'';}
function heure(m){var d=String(m.date||'');return d.length>=16?d.slice(11,16).replace(':','h'):'';}
function jourDe(m){return String(m.date||'').slice(0,10);}
function logo(t){var id=t&&t.id;return /^\d+$/.test(String(id||''))?'https://media.api-sports.io/football/teams/'+id+'.png':null;}
// Lien vers le match, avec la campagne du rendez-vous.
function lienMatch(id,campagne){return SITE+'/fr/match.html?id='+encodeURIComponent(id)+'&utm_source=telegram&utm_campaign='+campagne;}
function dateLongue(iso){var p=iso.split('-').map(Number);var d=new Date(Date.UTC(p[0],p[1]-1,p[2]));return JOURS[d.getUTCDay()]+' '+(p[2]===1?'1er':p[2])+' '+MOIS[p[1]-1];}
function coteTxt(c){return c.toFixed(2).replace('.',',');}
function plur(n,mot){return n+' '+mot+(n>1?'s':'');}
function de(nom){return (/^[aeiouyhàâéèêîïôöûüAEIOUYHÉÈÎÔ]/.test(String(nom))?'d\'':'de ')+nom;}
function minutes(s){var m=/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(s||''));return m?Date.UTC(+m[1],+m[2]-1,+m[3],+m[4],+m[5])/60000:null;}

// ---------- Le gros match du soir : regle ecrite, simple et testee ----------
// Match du soir = coup d'envoi a partir de 18 h 00 (heure de Paris), le jour dit.
// Classement :
//   0. Ligue des champions ;
//   1. un club francais (Ligue 1, ou un club de Ligue 1 dans une autre competition), ou l'equipe de France ;
//   2 a 5. Premier League, LaLiga, Serie A, Bundesliga ;
//   6. autres grandes competitions (Ligue Europa, Conference, selections, coupes nationales) ;
//   7. Eredivisie, Primeira Liga, Championship.
//   Toute autre competition n'a pas de gros match : pas de message.
// A egalite : le club francais le plus suivi (ordre de CLUBS_FR), puis le plus de grandes equipes,
// puis les cotes publiques les plus serrees, puis le numero du match (toujours le meme resultat).
// Jamais le match offert (son pari reste derriere le compte gratuit), jamais un match sans pari
// annonce (champs publics no_signal / has_signal).
var HEURE_SOIR='18:00';
var CLUBS_FR=['Paris Saint Germain','Marseille','Lyon','Monaco','Lille','Lens','Nice','Rennes','Strasbourg','Toulouse','Paris FC',
  'Stade Brestois 29','Lorient','Auxerre','Angers','Le Havre','Le Mans','Estac Troyes'];
var RANG_LIGUE={ldc:0,premier:2,laliga:3,seriea:4,bundesliga:5,el:6,ecl:6,nations_league:6,wcq_europe:6,euro:6,euro_qualifiers:6,club_world_cup:6,
  coupe_de_france:6,fa_cup:6,copa_del_rey:6,coppa_italia:6,dfb_pokal:6,efl_cup:6,eredivisie:7,primeira:7,championship:7};
var GRANDES=['France','England','Spain','Germany','Italy','Portugal','Netherlands','Belgium','Brazil','Argentina','Croatia',
  'Paris Saint Germain','Marseille','Lyon','Monaco','Lille','Lens','Real Madrid','Barcelona','Atletico Madrid','Bayern Munich','Bayern München',
  'Borussia Dortmund','Liverpool','Manchester City','Manchester United','Arsenal','Chelsea','Tottenham','Juventus','Inter','AC Milan','Napoli','AS Roma'];
function nomEq(t){return t&&(t.n||t.name)||'';}
function indiceClubFr(m){
  var a=CLUBS_FR.indexOf(nomEq(m.home)),b=CLUBS_FR.indexOf(nomEq(m.away));
  if(a===-1&&b===-1)return nomEq(m.home)==='France'||nomEq(m.away)==='France'||m.league_key==='ligue1'?CLUBS_FR.length:-1;
  return a===-1?b:b===-1?a:Math.min(a,b);
}
function rangGros(m){
  if(!m)return null;
  if(m.league_key==='ldc')return 0;
  if(indiceClubFr(m)!==-1)return 1;
  return Object.prototype.hasOwnProperty.call(RANG_LIGUE,m.league_key)?RANG_LIGUE[m.league_key]:null;
}
function nbGrandes(m){return [m.home,m.away].filter(function(t){return GRANDES.indexOf(nomEq(t))!==-1;}).length;}
function ecartCotes(m){var a=num(m.c1),b=num(m.c2);return a===null||b===null?1e9:Math.abs(a-b);}
function comparerGros(a,b){
  var fa=indiceClubFr(a),fb=indiceClubFr(b);
  return rangGros(a)-rangGros(b)
    ||(fa===-1?1e3:fa)-(fb===-1?1e3:fb)
    ||nbGrandes(b)-nbGrandes(a)
    ||ecartCotes(a)-ecartCotes(b)
    ||Number(a.id)-Number(b.id);
}
var STATUTS_HORS_JEU=['PST','CANC','ABD','AWD','WO'];
function grosDuSoir(matchs,jour){
  return (Array.isArray(matchs)?matchs:[]).filter(function(m){
    return m&&jourDe(m)===jour&&String(m.date).slice(11,16)>=HEURE_SOIR&&rangGros(m)!==null&&STATUTS_HORS_JEU.indexOf(m.status)===-1;
  }).sort(comparerGros);
}
function grosMatch(matchs,jour){
  return grosDuSoir(matchs,jour).filter(function(m){return m.is_free!==true&&m.no_signal!==true&&m.has_signal!==false;})[0]||null;
}

// ---------- 1. « Hier » (9 h) ----------
var VERDICT_COMBINE={win:'gagné',loss:'perdu',void:'annulé',verif:'en vérification'};
var VERDICT_PARI={gagne:'gagné',perdu:'perdu',annule:'annulé',win:'gagné',loss:'perdu',void:'annulé'};
var VERDICT_BUTEUR={marque:'a marqué',pas_marque:'n\'a pas marqué',pas_joue:'n\'a pas joué',retire:'retiré avant le match',annule:'match non joué',verif:'résultat en vérification'};
var NON_JOUES=['PST','CANC','ABD','AWD','WO','SUSP'];
var TERMINES=['FT','AET','PEN'];
function statutFx(fx){return String(fx&&fx.fixture&&fx.fixture.status&&fx.fixture.status.short||'').toUpperCase();}
// Resultat d'un buteur du jour d'apres la feuille du match (API-Sports) : memes faits que les montantes
// (lib/montantes.js#faitsDuMatch : buts par joueur seulement si la liste des buts redonne le score).
function verdictButeur(b,fx,etat){
  if(etat==='retire')return 'retire';
  if(etat==='reporte'||etat==='annule')return 'annule';
  var MO=modulePage('./montantes.js');
  var f=fx&&MO&&MO.faitsDuMatch?MO.faitsDuMatch(fx):null;
  if(!f)return 'verif';
  if(NON_JOUES.indexOf(f.statut)!==-1)return 'annule';
  if(TERMINES.indexOf(f.statut)===-1||!f.buts)return 'verif';
  var id=String(b&&b.joueur_id);
  if(f.buts[id]>0)return 'marque';
  if(f.joue&&f.joue[id]!==true)return 'pas_joue';
  return 'pas_marque';
}
// Le contenu du ticket « buteur » + la feuille des matchs -> lignes de « Hier ». Sans feuille lue : null.
function buteursHier(ligne,fixtures){
  var c=ligne&&ligne.contenu;
  if(!c||typeof c!=='object')return null;
  var liste=Array.isArray(c.buteurs)&&c.buteurs.length?c.buteurs:[c];
  var etats=ligne.etats&&Array.isArray(ligne.etats.buteurs)?ligne.etats.buteurs:[];
  var parId={};(Array.isArray(fixtures)?fixtures:[]).forEach(function(fx){var id=fx&&fx.fixture&&fx.fixture.id;if(id!=null)parId[String(id)]=fx;});
  if(!Object.keys(parId).length&&!etats.length)return null;
  return liste.filter(function(b){return b&&b.joueur;}).map(function(b,i){
    return {joueur:b.joueur,domicile:b.domicile,exterieur:b.exterieur,verdict:verdictButeur(b,parId[String(b.fixture_id)],etats[i])};
  });
}
function ligneCombine(bandeau,type,nom,jour){
  var c=(bandeau&&Array.isArray(bandeau.combines)?bandeau.combines:[]).filter(function(x){return x&&x.t===type&&x.j===jour;})[0];
  var k=c?num(c.c):null,r=c&&VERDICT_COMBINE[c.r];
  if(!r||k===null||!num(c.n))return null;
  return nom+' ('+num(c.n)+' matchs'+', cote '+coteTxt(k)+') : <b>'+r+'</b>';
}
// Les paris de la Selection en or d'un jour sont les paliers des 3 montantes (lib/montantes.js).
function parisMontantes(montantes,jour){
  return (montantes&&Array.isArray(montantes.montantes)?montantes.montantes:[]).map(function(M){
    var h=(M&&Array.isArray(M.historique)?M.historique:[]).filter(function(x){return x&&x.j===jour;});
    return h.length?{rang:M.rang,pari:h[h.length-1],objectif:(M.objectifs||[]).filter(function(o){return o&&o.j===jour;})[0]||null}:null;
  }).filter(Boolean).sort(function(a,b){return a.rang-b.rang;});
}
function ligneMontante(x){
  var r=x.pari.r,cc=num(x.pari.cc),t;
  if(x.objectif&&num(x.objectif.c))t='cote 10 dépassée ('+coteTxt(num(x.objectif.c))+'), retour au premier pari';
  else if(r==='gagne')t=cc?'pari gagné, cote totale '+coteTxt(cc):'pari gagné';
  else if(r==='perdu')t='pari perdu, retour au premier pari';
  else if(r==='annule')t='pari annulé, il ne compte pas';
  else if(r==='non_regle')t='pari non réglé, retour au premier pari';
  else if(r==='en_attente')t='résultat en attente';
  else return null;
  return 'Montante '+x.rang+' : '+t;
}
function blocOr(bandeau,montantes,bilan,jour){
  var o=(bandeau&&Array.isArray(bandeau.or)?bandeau.or:[]).filter(function(x){return x&&x.j===jour;})[0];
  var so=bilan&&bilan.jour===jour?bilan.selection_or:null;
  var g,p,a,v,n;
  if(o){g=num(o.g)||0;p=num(o.p)||0;a=num(o.a)||0;v=num(o.v)||0;n=num(o.n);}
  else if(so){g=num(so.gagnes)||0;p=(num(so.regles)||0)-g;a=num(so.annules)||0;v=0;n=num(so.total);}
  else return null;
  var compte=[plur(g,'gagné'),plur(p,'perdu')];
  if(a)compte.push(plur(a,'annulé'));
  if(v)compte.push(v+' en vérification');
  var lignes=['<b>Sélection en or</b> : '+compte.join(', ')];
  // Detail : les paris des montantes, seulement s'ils redonnent exactement le compte.
  var det=parisMontantes(montantes,jour).map(function(x){return x.pari;});
  var nb=function(r){return det.filter(function(x){return x.r===r;}).length;};
  if(det.length===n&&nb('gagne')===g&&nb('perdu')===p&&det.every(function(x){return VERDICT_PARI[x.r]&&num(x.c);})){
    det.forEach(function(x){lignes.push('- '+esc(x.h)+' - '+esc(x.a)+' : '+esc(x.p)+', cote '+coteTxt(num(x.c))+' : '+VERDICT_PARI[x.r]);});
  }else if(so&&Array.isArray(so.paris)){
    so.paris.forEach(function(x){if(VERDICT_PARI[x.resultat]&&num(x.cote))lignes.push('- '+esc(x.match)+' : '+esc(x.pari)+', cote '+coteTxt(num(x.cote))+' : '+VERDICT_PARI[x.resultat]);});
  }
  return lignes.join('\n');
}
// Match offert de la veille : bilan-hier s'il l'a retrouve ; sinon le pari devoile du registre
// (preuves/matchs-offerts.json), regle par l'archive verrouillee, sur le MEME marche, publie avant le match.
function offertHier(src){
  var jour=src.jour,b=src.bilan&&src.bilan.jour===jour?src.bilan.offert:null;
  if(b&&b.match&&b.pari&&num(b.cote)&&VERDICT_PARI[b.resultat]){
    var eq=String(b.match).split(' - ');
    return {match:b.match,pari:pariAffiche({pari_rec:b.pari,home:{n:eq[0]},away:{n:eq[1]}}),cote:num(b.cote),verdict:VERDICT_PARI[b.resultat]};
  }
  var es=(src.registre&&Array.isArray(src.registre.matchs)?src.registre.matchs:[]).filter(function(x){return x&&x.jour===jour&&x.fixture_id!=null;});
  if(es.length!==1)return null;
  var e=es[0],a=src.archiveOffert,k=num(e.cote_affichee);
  if(e.masque===true||!e.pari||!e.market_id||k===null||!a||String(a.market)!==String(e.market_id)||!VERDICT_PARI[a.result])return null;
  var n=String(e.match||'').split(' - ');
  return {match:e.match,pari:pariAffiche({pari_rec:e.pari,home:{n:n[0]},away:{n:n[1]}}),cote:k,verdict:VERDICT_PARI[a.result]};
}
// Ligne de l'archive pour le match offert : un pari simple publie AVANT le coup d'envoi.
function ligneArchive(lignes){
  return (Array.isArray(lignes)?lignes:[]).filter(function(r){
    var p=Date.parse(r&&r.published_at),k=Date.parse(r&&r.kickoff_at);
    return r&&(r.type==null||r.type==='single')&&isFinite(p)&&isFinite(k)&&p<k;
  })[0]||null;
}
// src : { jour (la veille), bandeau, montantes, bilan, registre, archiveOffert, buteurs }.
function hier(src){
  var s=src||{},jour=s.jour;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(jour||'')))return null;
  var blocs=[];
  var comb=[ligneCombine(s.bandeau,'x5','Petit combiné',jour),ligneCombine(s.bandeau,'x10','Grand combiné',jour)].filter(Boolean);
  if(comb.length)blocs.push(comb.join('\n'));
  if(Array.isArray(s.buteurs)&&s.buteurs.length){
    var nb=s.buteurs.length;
    blocs.push('<b>'+(nb>1?'Les '+nb+' buteurs du jour':'Le buteur du jour')+'</b>\n'+s.buteurs.map(function(b){
      return '- '+esc(b.joueur)+' ('+esc(b.domicile)+' - '+esc(b.exterieur)+') : '+VERDICT_BUTEUR[b.verdict];
    }).join('\n'));
  }
  var mt=parisMontantes(s.montantes,jour).map(ligneMontante).filter(Boolean);
  if(mt.length)blocs.push('<b>Les montantes</b>\n'+mt.join('\n'));
  var or=blocOr(s.bandeau,s.montantes,s.bilan,jour);
  if(or)blocs.push(or);
  var of=offertHier(s);
  if(of)blocs.push('<b>Match offert</b> : '+esc(of.match)+', '+esc(of.pari)+', cote '+coteTxt(of.cote)+' : '+of.verdict);
  var ps=s.bilan&&s.bilan.jour===jour?s.bilan.paris_simples:null;
  if(ps&&ps.jour===jour&&num(ps.gagnes)!==null&&num(ps.perdus)!==null){
    var t=[plur(num(ps.gagnes),'gagné'),plur(num(ps.perdus),'perdu')];
    if(num(ps.annules))t.push(plur(num(ps.annules),'annulé'));
    if(num(ps.en_attente))t.push(num(ps.en_attente)+' en attente');
    blocs.push('<b>Tous les paris simples</b> publiés avant les matchs : '+t.join(', '));
  }
  if(!blocs.length)return null;
  return {type:'text',slot:'hier',apercu:false,html:'<b>Hier, '+esc(dateLongue(jour))+'</b>\nCe qu\'on a donné, et si c\'est passé.\n\n'+blocs.join('\n\n')};
}

// ---------- 2. « Le match offert » (12 h) ----------
function rang(n){return n===1?'1er':n+'e';}
// Faits de la fiche publique du match (classement, face-a-face, forme : champs publics de
// lib/premium-fields.js). Recomptes ici a partir des scores ; un champ absent : pas de fait.
function factClassement(m,dom,ext){
  var c=m.classement,h=c&&c.home,a=c&&c.away;
  if(!h||!a||!num(h.rank)||!num(a.rank)||num(h.pts)===null||num(a.pts)===null||!num(h.played)||!num(a.played))return null;
  return 'Classement : '+dom+' '+rang(num(h.rank))+' ('+plur(num(h.pts),'point')+'), '+ext+' '+rang(num(a.rank))+' ('+plur(num(a.pts),'point')+').';
}
function factFaceAFace(m,dom,ext){
  var n=nomEq(m.home),x=nomEq(m.away),v1=0,v2=0,nuls=0,total=0;
  var ok=(Array.isArray(m.h2h)?m.h2h:[]).slice(0,5).every(function(r){
    var s=/^(\d+)-(\d+)$/.exec(String(r&&r.s||''));
    if(!s||(r.home!==n&&r.home!==x)||(r.away!==n&&r.away!==x)||r.home===r.away)return false;
    var bd=+s[1],be=+s[2],d=r.home===n?bd:be,e=r.home===n?be:bd;
    total++;if(d>e)v1++;else if(e>d)v2++;else nuls++;
    return true;
  });
  if(!ok||total<3)return null;
  return 'Leurs '+total+' derniers face-à-face : '+plur(v1,'victoire')+' '+de(dom)+', '+plur(v2,'victoire')+' '+de(ext)+', '+plur(nuls,'nul')+'.';
}
function bilanForme(l){
  var f=(Array.isArray(l)?l:[]).slice(0,5);
  if(f.length<5||!f.every(function(x){return x&&['W','D','L'].indexOf(x.result)!==-1;}))return null;
  var c=function(r){return f.filter(function(x){return x.result===r;}).length;};
  return plur(c('W'),'victoire')+', '+plur(c('D'),'nul')+', '+plur(c('L'),'défaite');
}
function factForme(m,dom,ext){
  var a=bilanForme(m.form_home),b=bilanForme(m.form_away);
  return a&&b?'Sur leurs 5 derniers matchs : '+dom+' '+a+' ; '+ext+' '+b+'.':null;
}
function faitsPublics(m){
  var dom=esc(equipe(m.home)),ext=esc(equipe(m.away));
  return [factClassement(m,dom,ext),factFaceAFace(m,dom,ext),factForme(m,dom,ext)].filter(Boolean).slice(0,2);
}
// maintenant : 'AAAA-MM-JJ HH:MM' heure de Paris, obligatoire. Seul le match offert de CE jour, pas encore commence.
function offert(home,full,maintenant){
  var jour=String(maintenant||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(jour))return null;
  var duJour=function(l){return (Array.isArray(l)?l:[]).filter(function(m){return m&&m.is_free===true&&jourDe(m)===jour;})[0];};
  var libre=duJour(home&&home.matchs);
  if(!libre)return null;
  var m=(full&&Array.isArray(full.matchs)?full.matchs:[]).filter(function(x){return x&&String(x.id)===String(libre.id);})[0]||libre;
  if(jourDe(m)!==jour||(m.status||libre.status)!=='NS'||String(m.date||'').slice(0,16)<=String(maintenant))return null;
  var dom=equipe(m.home),ext=equipe(m.away);
  var quand=competition(m)+' · '+dateLongue(jour)+' · '+heure(m);
  var faits=faitsPublics(m);
  return {type:'photo',slot:'offert',matchId:m.id,jour:jour,
    carte:{equipes:dom+' – '+ext,quand:quand,logoDom:logo(m.home),logoExt:logo(m.away)},
    html:'<b>Le match offert : '+esc(dom)+' – '+esc(ext)+'</b>\n'+esc(quand)+(faits.length?'\n\n'+faits.join('\n'):'')
      +'\n\nLe pari de ce match est offert avec un compte gratuit :\n<a href="'+esc(lienMatch(m.id,'offert'))+'">Voir le match offert</a>'+LIGNE_1WIN};
}

// ---------- 3. « Les compos » (1 h avant le gros match du soir) ----------
// Chance calculee par IASHARK et cote du pari d'un match. UNE SEULE SOURCE (01/10/2026) : chance_iashark,
// posee une fois par le pipeline (lib/chance-iashark.js), la meme que la page match ; rien n'est recalcule.
// Jamais une competition « en test » ; seulement un match analyse ; jamais au-dessus de ce que dit la cote.
function chiffresDuJour(m){
  if(!m||m.league_reliability==='en_test'||m.no_signal===true)return null;
  if(['FULL_ANALYSIS','STANDARD_ANALYSIS'].indexOf(m.analysis_tier)===-1)return null;
  if(!String(m.pari_rec||'').trim()||m.market_id==null||m.market_id==='')return null;
  var chance=num(m.chance_iashark),cote=num(m.cote_rec);
  if(chance===null||chance<=0||chance>=100||cote===null||cote<=1)return null;
  return chance<=Math.round(100/cote)?{chance:chance,cote:cote,coteTxt:coteTxt(cote)}:null;
}
// Numeros de matchs des combines et de la Selection en or du jour (table tickets_du_jour).
function matchsDesTickets(lignes){
  if(!Array.isArray(lignes))return null;
  var ids={};
  lignes.forEach(function(l){
    var c=l&&l.contenu;
    [].concat(c&&Array.isArray(c.paris)?c.paris:[],c&&Array.isArray(c.jambes)?c.jambes:[]).forEach(function(x){if(x&&x.fixture_id!=null)ids[String(x.fixture_id)]=true;});
  });
  return ids;
}
// Le prono d'appel : le pari publie du gros match, seulement si ses chiffres sont publiables ET s'il n'entre dans
// aucun combine ni dans la Selection en or du jour (cites seulement apres coup). Tickets illisibles : pas de prono.
function pronoAppel(m,proteges,idsTickets){
  if(!m||!proteges||!idsTickets||idsTickets[String(m.id)])return null;
  var complet=Object.assign({},m,proteges);
  var c=chiffresDuJour(complet);
  if(!c)return null;
  return {pari:pariAffiche(complet),coteTxt:c.coteTxt,chance:c.chance};
}
function composPubliee(l){
  return !!l&&['home','away'].every(function(c){
    var x=l[c];
    return x&&Array.isArray(x.startXI)&&x.startXI.length>=11&&Array.isArray(x.substitutes)&&x.substitutes.length>0;
  });
}
// Joueurs les plus utilises d'une equipe : au moins 60 minutes dans au moins 3 de ses 5 derniers matchs de la saison
// (player_history, champ public), et toujours dans l'effectif actuel quand il est connu. Moins de 3 matchs : null.
function joueursCles(hist,effectif){
  var parMatch={};
  (Array.isArray(hist)?hist:[]).forEach(function(r){
    if(r&&r.fixture_id!=null&&r.player_id!=null&&r.is_current_season!==false)(parMatch[r.fixture_id]=parMatch[r.fixture_id]||{date:String(r.date||''),l:[]}).l.push(r);
  });
  var derniers=Object.keys(parMatch).map(function(k){return parMatch[k];}).sort(function(a,b){return b.date.localeCompare(a.date);}).slice(0,5);
  if(derniers.length<3)return null;
  var dansEffectif={};(Array.isArray(effectif)?effectif:[]).forEach(function(p){if(p&&p.player_id!=null)dansEffectif[String(p.player_id)]=true;});
  var aEffectif=Object.keys(dansEffectif).length>0,cpt={};
  derniers.forEach(function(g){g.l.forEach(function(r){
    if(Number(r.minutes)>=60){var k=String(r.player_id);(cpt[k]=cpt[k]||{id:k,name:r.name,n:0,min:0}).n++;cpt[k].min+=Number(r.minutes);}
  });});
  return Object.keys(cpt).map(function(k){return cpt[k];}).filter(function(p){return p.n>=3&&p.name&&(!aEffectif||dansEffectif[p.id]);})
    .sort(function(a,b){return b.n-a.n||b.min-a.min;});
}
// Une equipe -> sa ligne, faits de la composition seulement. Comparaison par numero de joueur (jamais par nom) : un
// joueur sans numero sur la feuille, ou trop d'absents d'un coup (feuille douteuse) : pas de ligne.
var MAX_ABSENTS_CREDIBLES=5;
function ligneEquipe(nom,cles,l){
  if(!cles||cles.length<5||!l)return null;
  var tous=l.startXI.concat(l.substitutes);
  if(tous.some(function(p){return !p||p.id==null;}))return null;
  var ids=function(t){var o={};t.forEach(function(p){o[String(p.id)]=true;});return o;};
  var xi=ids(l.startXI),banc=ids(l.substitutes);
  var absents=cles.filter(function(p){return !xi[p.id]&&!banc[p.id];}).map(function(p){return esc(p.name);});
  var remplacants=cles.filter(function(p){return banc[p.id];}).map(function(p){return esc(p.name);});
  if(absents.length>MAX_ABSENTS_CREDIBLES)return null;
  var t='<b>'+esc(nom)+'</b>';
  if(!absents.length&&!remplacants.length)return t+' : tous ses joueurs les plus utilisés sont titulaires.';
  if(absents.length)t+='\nPas sur la feuille de match : '+absents.join(', ');
  if(remplacants.length)t+='\nSur le banc au coup d\'envoi : '+remplacants.join(', ');
  return t;
}
function compos(m,lineups,prono){
  if(!m||!composPubliee(lineups))return null;
  var ph=m.player_history||{},cs=m.current_squads||{};
  var dom=equipe(m.home),ext=equipe(m.away);
  var lignes=[ligneEquipe(dom,joueursCles(ph.home,cs.home),lineups.home),ligneEquipe(ext,joueursCles(ph.away,cs.away),lineups.away)].filter(Boolean);
  if(!lignes.length)return null;
  var html='<b>Les compos : '+esc(dom)+' – '+esc(ext)+'</b>\n'+esc(competition(m))+' · '+heure(m)+'\n\n'+lignes.join('\n\n');
  if(prono)html+='\n\nNotre prono : <b>'+esc(prono.pari)+'</b>\nCote '+esc(prono.coteTxt)+', chance calculée '+prono.chance+' %';
  html+='\n\n<a href="'+esc(lienMatch(m.id,'compos'))+'">Voir le match</a>'+LIGNE_1WIN;
  return {type:'text',slot:'compos',matchId:m.id,apercu:false,html:html};
}
// Passage du workflow (toutes les 15 min aux heures utiles). Hors de la fenetre avant le coup d'envoi : aucun appel.
// o : { matchs, maintenant, fenetreMinutes, api(chemin) -> reponse ou null, lireProteges(id), lireTickets(jour), note }.
// Composition pas encore publiee : null ; le passage suivant reessaie ; au dernier passage avant le match, pas de message.
async function composDuSoir(o){
  var note=o.note||function(){};
  var jour=String(o.maintenant||'').slice(0,10),m=grosMatch(o.matchs,jour);
  if(!m){note('compos : pas de gros match ce soir');return null;}
  var reste=minutes(m.date)-minutes(o.maintenant);
  if(!(reste>0&&reste<=o.fenetreMinutes)){note('compos : hors de la fenetre avant le coup d\'envoi, aucun appel');return null;}
  var LEGER=modulePage('./buteurs-jour-de-match.js');
  var rep=await o.api('fixtures?ids='+m.id);
  var st=statutFx(rep&&rep.response&&rep.response[0]);
  if(['NS','TBD'].indexOf(st)===-1){note('compos : statut du match illisible ou match commence, pas de message');return null;}
  var repL=await o.api('fixtures/lineups?fixture='+m.id);
  var lineups=repL&&LEGER?LEGER.compositionDepuisApi(m,repL):null;
  if(!composPubliee(lineups)){note('compos : composition pas encore publiee, pas de message');return null;}
  var prono=pronoAppel(m,await o.lireProteges(m.id),matchsDesTickets(await o.lireTickets(jour)));
  if(!prono)note('compos : pas de prono publiable pour ce match');
  return compos(m,lineups,prono);
}

// Faut-il encore attendre ? « fini » : coup d'envoi passe, ou pas de gros match et il est 18 h passees (le passage
// suivant, le debat, peut alors etre programme). Sinon « attendre » : le workflow repassera dans 15 min.
function composEtat(matchs,maintenant){
  var jour=String(maintenant||'').slice(0,10),m=grosMatch(matchs,jour);
  if(!m)return String(maintenant).slice(11,16)>=HEURE_SOIR?'fini':'attendre';
  return minutes(m.date)<=minutes(maintenant)?'fini':'attendre';
}

// ---------- 4. « Le debat » (23 h 15) ----------
// Score verifie : match termine ET liste des buts = score (lib/film-du-match.js#controlerMatch, controle
// du 24/10/2026). Prolongation et tirs au but : les buts de la prolongation doivent aussi redonner le score.
function scoreVerifie(fx){
  var FM=modulePage('./film-du-match.js'),st=statutFx(fx);
  if(!FM||TERMINES.indexOf(st)===-1)return null;
  var c=FM.controlerMatch(fx,fx.events);
  if(!c.ok)return null;
  var ft=fx.score.fulltime,h=num(ft.home),a=num(ft.away),idH=fx.teams.home.id,idA=fx.teams.away.id;
  if(st==='FT')return {h:h,a:a,texte:h+'-'+a,suite:''};
  var g=fx.goals,gh=g?num(g.home):null,ga=g?num(g.away):null;
  if(gh===null||ga===null)return null;
  var buts=c.events.filter(function(e){return e&&e.type==='Goal'&&e.detail!=='Missed Penalty'&&!/shootout/i.test(String(e.comments||''))&&e.time&&Number(e.time.elapsed)<=120;});
  var nb=function(id){return buts.filter(function(e){return e.team&&e.team.id===id;}).length;};
  if(nb(idH)!==gh||nb(idA)!==ga)return null;
  var suite=' après prolongation';
  if(st==='PEN'){
    var t=fx.score.penalty,th=t?num(t.home):null,ta=t?num(t.away):null;
    if(th===null||ta===null)return null;
    suite+=', '+th+'-'+ta+' aux tirs au but';
    return {h:th,a:ta,texte:gh+'-'+ga,suite:suite};
  }
  return {h:gh,a:ga,texte:gh+'-'+ga,suite:suite};
}
// La question : une phrase ouverte, tiree du seul score du premier match de la liste.
function question(dom,ext,s){
  if(s.h===s.a)return dom+' - '+ext+', '+s.texte+' : qui a le plus à regretter ce soir ?';
  var ecart=Math.abs(s.h-s.a),gagnant=s.h>s.a?dom:ext;
  if(ecart>=3)return gagnant+' gagne de '+ecart+' buts : ce score dit-il tout du match, selon vous ?';
  if(s.a>s.h)return ext+' gagne chez '+dom+' : exploit ou simple logique, selon vous ?';
  return dom+' gagne à domicile contre '+ext+' : mérité ou non, selon vous ?';
}
// lignes : [{ m, fx }] dans l'ordre du gros match. Un match sans score verifie n'est pas cite.
function debat(lignes){
  var ok=(Array.isArray(lignes)?lignes:[]).map(function(l){
    var fx=l&&l.fx,m=l&&l.m;
    if(!fx||!m||!fx.teams||!fx.teams.home||!fx.teams.away||String(fx.teams.home.id)!==String(m.home&&m.home.id)||String(fx.teams.away.id)!==String(m.away&&m.away.id))return null;
    var s=scoreVerifie(fx);
    return s?{m:m,s:s,dom:equipe(m.home),ext:equipe(m.away)}:null;
  }).filter(Boolean);
  if(!ok.length)return null;
  return {type:'text',slot:'debat',apercu:false,
    html:'<b>Le débat</b>\nLes résultats du soir :\n'+ok.map(function(x){
      return esc(x.dom)+' '+x.s.texte+' '+esc(x.ext)+x.s.suite+' ('+esc(competition(x.m))+')';
    }).join('\n')+'\n\n'+esc(question(ok[0].dom,ok[0].ext,ok[0].s))
      +'\n\nUn ami a un avis ? Invite-le : '+INVITATION};
}
// Passage de 23 h 15. o : { matchs, jour, maxMatchs, maintenant, api, note }.
async function debatDuSoir(o){
  var note=o.note||function(){};
  var liste=grosDuSoir(o.matchs,o.jour).filter(function(m){return minutes(m.date)<minutes(o.maintenant);}).slice(0,o.maxMatchs);
  if(!liste.length){note('debat : pas de gros match ce soir');return null;}
  var rep=await o.api('fixtures?ids='+liste.map(function(m){return m.id;}).join('-'));
  var parId={};(rep&&Array.isArray(rep.response)?rep.response:[]).forEach(function(fx){var id=fx&&fx.fixture&&fx.fixture.id;if(id!=null)parId[String(id)]=fx;});
  var p=debat(liste.map(function(m){return {m:m,fx:parId[String(m.id)]};}));
  if(!p)note('debat : aucun score verifie, pas de message');
  return p;
}

// ---------- La chaine visee par l'envoi automatique ----------
// Verdict sans aucune valeur secrete : getChat + getChatMember du robot.
function verdictChaine(chat,membre){
  var c=chat||{},role=membre&&membre.status||null;
  return {chaine:c.type==='channel',privee:c.type==='channel'&&!c.username,robotAdmin:role==='administrator'||role==='creator',
    lienIdentique:c.invite_link?c.invite_link===INVITATION:null,titre:c.title||null};
}

return {hier:hier,buteursHier:buteursHier,verdictButeur:verdictButeur,ligneArchive:ligneArchive,offert:offert,faitsPublics:faitsPublics,
  grosMatch:grosMatch,grosDuSoir:grosDuSoir,rangGros:rangGros,chiffresDuJour:chiffresDuJour,matchsDesTickets:matchsDesTickets,pronoAppel:pronoAppel,
  joueursCles:joueursCles,composPubliee:composPubliee,compos:compos,composDuSoir:composDuSoir,composEtat:composEtat,scoreVerifie:scoreVerifie,debat:debat,debatDuSoir:debatDuSoir,
  verdictChaine:verdictChaine,equipe:equipe,esc:esc,dateLongue:dateLongue,INVITATION:INVITATION};
});
