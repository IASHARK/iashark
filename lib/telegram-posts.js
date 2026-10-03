(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.IasharkTelegramPosts=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
// Messages du canal Telegram t.me/iasharkdata (27/09/2026, valide par Clement).
// Logique PURE : lit les fichiers du pipeline (data-home.json, data.json,
// results/<jour>.json, actus.json, guides du blog) et rend des messages prets
// a envoyer. L'envoi est dans scripts/telegram/send-posts.mjs.
//
// Regles (non negociables, verifiees par tests/telegram-posts.test.js) :
// - DECISION DE CLEMENT (30/09/2026) : chaque message de pari donne le match, le
//   pari, la cote et la « chance calculee par IASHARK », rien d'autre : ni mise,
//   ni esperance, ni « ce que dit la cote sans la marge ». Le match gratuit
//   (celui qui est offert sur le site) montre donc son pari ; la chance n'est
//   publiee qu'avec un pari du moteur v3 fiable (sinon : ni pari ni chiffre) ;
// - les bilans : gagnes et perdus en nombre, rien d'autre (decision de Clement) ;
// - aucune donnee payante d'un autre match (lib/premium-fields.js) : le
//   sondage n'utilise que les noms d'equipes, la competition et l'heure ;
// - aucun chiffre invente : une donnee absente = pas de message (null) ;
// - jamais de promesse de gain (pas de mention « jouer comporte des risques » :
//   choix de Clement, IASHARK n'est pas un bookmaker).

var SITE='https://iashark.com';
var UTM='utm_source=telegram&utm_medium=social&utm_campaign=canal';

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
var COMPET={'UEFA Nations League':'Ligue des nations'};
var JOURS=['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
var MOIS=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function num(v){if(v===null||v===undefined||v==='')return null;var n=Number(v);return isFinite(n)?n:null;}
function equipe(t){var n=t&&(t.n||t.name)||'';return PAYS[n]||n;}
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
// Lien « Voir l'analyse » (audit SEO du 29/09/2026, action A1) : vraie page
// francaise /match/<id>.html quand le pipeline l'a ecrite (champ public page_dirs
// de data-home.json, scripts/match-lifecycle.js#annotateHomePages), sinon
// /fr/match.html?id= (repli, noindex). Le canal est en francais : version fr seulement.
function aUnePageFr(m){return !!(m&&Array.isArray(m.page_dirs)&&m.page_dirs.indexOf('fr')!==-1);}
function lienMatch(m,mHome){
  var id=String(m&&m.id!=null?m.id:'');
  if(/^\d{1,12}$/.test(id)&&(aUnePageFr(m)||aUnePageFr(mHome)))return SITE+'/match/'+id+'.html?'+UTM;
  return SITE+'/fr/match.html?id='+encodeURIComponent(id)+'&'+UTM;
}
function dateLongue(iso){var p=iso.split('-').map(Number);var d=new Date(Date.UTC(p[0],p[1]-1,p[2]));return JOURS[d.getUTCDay()]+' '+p[2]+' '+MOIS[p[1]-1];}

// ---------- 1. Resultats d'hier ----------
// Le bilan publie gagnes ET perdus. Pas de bouton : il n'existe pas encore de
// page publique d'historique (onglet « Hier » retire le 21/09/2026).
// Decision de Clement (29/09/2026, relecture avocat du diable T3) : l'historique
// reste sur Telegram, mais SEULEMENT avec les paris du moteur v3 (champ moteur de
// results/<jour>.json), jamais melanges avec l'ancien moteur, et sans taux de
// reussite global. Aucun pari v3 regle ce jour-la : pas de message.
function resultats(fichier){
  if(!fichier||!fichier.day||!Array.isArray(fichier.matches))return null;
  var v3=fichier.matches.filter(function(m){return m&&m.moteur==='v3';});
  var g=0,p=0,nul=0,attente=0;
  v3.forEach(function(m){if(m.result==='win')g++;else if(m.result==='loss')p++;else if(m.result==='void')nul++;else attente++;});
  var fin=g+p;
  if(!fin)return null;
  // Controle des chiffres publics (30/09/2026) : « gagnés » (pas « validées »),
  // la base dite (les paris IASHARK des matchs d'hier), plus de « On publie tout ».
  return {type:'text',slot:'resultats',
    html:'<b>Résultats d\'hier ('+esc(dateLongue(fichier.day))+')</b>\n'
      // Base exacte (avocat du diable, 01/10/2026) : les paris publies SUR LE SITE par le moteur
      // IASHARK v3 pour les matchs d'hier (un pari par match), jamais ceux du Canal Pro.
      +'Paris publiés sur le site pour les matchs d\'hier (moteur IASHARK v3, un pari par match) : <b>'+g+' gagné'+(g>1?'s':'')+', '+p+' perdu'+(p>1?'s':'')+'</b>'+(nul?' ('+nul+' remboursé'+(nul>1?'s':'')+')':'')+'.'
      +(attente?'\n'+attente+' encore en attente (matchs pas terminés).':'')};
}

// ---------- 2. Match gratuit : « nos chances face a la cote », marche cache ----------
var LISTE_SITE='• les scores exacts les plus probables\n'
  +'• les buteurs les plus probables (Pro)\n'
  +'• la chance d’un but par tranche de 15 minutes (Pro)\n\n'
  +'<a href="'+SITE+'/fr/?'+UTM+'">www.iashark.com</a>';
// Regle du mathematicien (28/09/2026) : un pourcentage du modele n'est publie
// que si le match est analyse (FULL ou STANDARD, jamais UNVERIFIED ni
// LIMITED_DATA) et si le favori 1N2 du modele est celui du marche, ou que
// l'ecart avec le marche reste sous 20 points.
function chiffresFiables(m){
  if(['FULL_ANALYSIS','STANDARD_ANALYSIS'].indexOf(m.analysis_tier)===-1)return false;
  var mod=[num(m.p1),num(m.pn),num(m.p2)],mar=[num(m.market_consensus_p1),num(m.market_consensus_pN),num(m.market_consensus_p2)];
  if(mod.some(function(x){return x===null;})||mar.some(function(x){return x===null;}))return false;
  var fav=function(t){return t.indexOf(Math.max.apply(null,t));};
  if(fav(mod)===fav(mar))return true;
  return Math.max(Math.abs(mod[0]-mar[0]),Math.abs(mod[2]-mar[2]))<20;
}
// Contre-controle ronde 4 (30/09/2026) : « Sur 100 matchs comme celui-ci… » et
// tout pourcentage du match gratuit seulement avec un pari du moteur v3 CALIBRE :
// il vient du moteur v3, porte sur le MEME marche que le pari affiche, et ce marche
// est « vérifié sur le passé » (etiquette ET fiabilite_marche). L'ancien moteur est
// trop sur de lui (CURRENT_ENGINE_CALIBRATION_REPORT.md : 6,1 a 9,5 points d'ecart
// au 1N2) : avec lui, aucun pourcentage. Meme regle que la page match
// (lib/match-view-model.js#frequenceCalibree).
//
// Condition 1 du mathematicien et de l'avocat du diable (30/09/2026) : hors d'Europe
// (et coupes, selections, ligues sans cote), le moteur v3 calcule seul, sans la cote
// (moteur_v3.origine_probabilite = « modèle seul », lib/moteur-v3.js). Quand son
// estimation depasse la cote sans marge, ces paris passent environ 70 % du temps pour
// 77 % annonces (549 paris jamais vus) : aucun pourcentage, jamais « Sur 100
// matchs ». Origine absente ou inconnue : « modèle seul » (prudence).
var VERIFIE_SUR_LE_PASSE='vérifié sur le passé';
var ORIGINE_AVEC_COTES='modèle + cotes';
var dixieme=function(x){return x===null?null:Math.round(x*10)/10;};
function coteSansMarge(m){
  // Une seule cote (lib/cote-anj.js) : cote ANJ -> cote sans marge de la meme source.
  var anj=m&&m.market_id&&m.cote_source==='anj'&&m.sans_marge_anj?num(m.sans_marge_anj[m.market_id]):null;
  if(anj!==null&&anj>0&&anj<100)return dixieme(anj);
  var row=(Array.isArray(m.markets_compared)?m.markets_compared:[]).filter(function(r){return r&&m.market_id&&r.id===m.market_id;})[0];
  var fair=row?num(row.consensus):null;
  return fair!==null&&fair>0&&fair<100?dixieme(fair):null;
}
// Competition « Fiabilité : en test » (non validee par le mathematicien,
// config/leagues.json#fiabilite, champ public league_reliability, 30/09/2026) :
// jamais de pourcentage ni de « Sur 100 matchs ». Meme regle que la page match.
function pariV3Calibre(m){
  if(m&&m.league_reliability==='en_test')return false;
  var v=m&&m.v3_pari;
  if(!v||typeof v!=='object'||m.market_id==null||v.market_id==null||!String(m.pari_rec||'').trim())return false;
  if(String(v.market_id)!==String(m.market_id))return false;
  if(!m.moteur_v3||m.moteur_v3.source!=='v3')return false;
  if(v.etiquette!==VERIFIE_SUR_LE_PASSE||v.fiabilite_marche!==VERIFIE_SUR_LE_PASSE)return false;
  if(m.moteur_v3.origine_probabilite===ORIGINE_AVEC_COTES)return true;
  // Modele seul : seulement s'il ne depasse pas la cote sans marge, qui doit etre connue.
  var fair=coteSansMarge(m),prob=dixieme(num(m.model_probability));
  return fair!==null&&prob!==null&&prob<=fair;
}
// Chance calculee par IASHARK du pari retenu et sa cote. UNE SEULE SOURCE (01/10/2026) : la
// chance est chance_iashark, posee une fois par le pipeline (lib/chance-iashark.js : le plus
// bas entre le modele et la cote sans marge), la meme que la page match et l'espace Pro.
// Rien n'est recalcule ni arrondi ici ; sans chance_iashark, pas de pourcentage.
function chancesMatchGratuit(m){
  if(!m)return null;
  var chance=num(m.chance_iashark),cote=num(m.cote_rec);
  if(chance===null||chance<=0||chance>=100||cote===null||cote<=1)return null;
  // Decision de Clement (30/09/2026) : seulement la chance calculee par IASHARK et la cote ;
  // plus de « ce que dit la cote sans la marge » (ce genre de calcul est arrete).
  // Une seule cote (lib/cote-anj.js, 01/10/2026) : la cote du pari est celle d'un bookmaker agree
  // ANJ (son nom est donne) ; sinon la moyenne du marche, dite « indicative », sans nom.
  var bk=m.cote_source==='anj'&&typeof m.cote_bookmaker==='string'&&m.cote_bookmaker?m.cote_bookmaker:null;
  return {estimation:chance,cote:cote,coteTxt:cote.toFixed(2).replace('.',','),bookmaker:bk,
    coteLibelle:bk?'Cote chez '+bk:'Cote indicative'};
}
// maintenant : 'AAAA-MM-JJ HH:MM' heure de Paris (comme m.date), OBLIGATOIRE. Un match
// deja commence ou joue n'est jamais presente comme « match du jour » a venir.
// Verification du jour (contre-controle de l'avocat du diable, 30/09/2026) : seul le
// match offert de CE jour est « le match gratuit du jour ». Un jour sans match offert
// (frequent avec le moteur v3), celui du lendemain n'est jamais annonce a sa place :
// pas de message. La date est ecrite en toutes lettres dans le message et l'image.
function matchGratuit(home,full,maintenant){
  var jour=String(maintenant||'').slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(jour))return null;
  var libre=(home&&home.matchs||[]).filter(function(m){return m&&m.is_free===true&&jourDe(m)===jour;})[0];
  if(!libre)return null;
  var m=(full&&(full.matchs||full)||[]).filter(function(x){return x&&String(x.id)===String(libre.id);})[0]||libre;
  if(jourDe(m)!==jour)return null;
  if((m.status||libre.status)!=='NS')return null;
  if(String(m.date||'').slice(0,16)<=String(maintenant))return null;
  var dom=equipe(m.home),ext=equipe(m.away);
  var quand=competition(m)+' · '+dateLongue(jour)+' · '+heure(m);
  // Garde-fous de la fusion (pari v3 calibre : meme marche, « vérifié sur le passé »,
  // jamais une competition « Fiabilité : en test », modele seul jamais au-dessus de la
  // cote sans marge) ; affichage decide par Clement le 30/09/2026 (canal-pro) : le
  // match, le pari, la chance calculee par IASHARK et la cote, rien d'autre.
  var c=chiffresFiables(m)&&pariV3Calibre(m)?chancesMatchGratuit(m):null;
  // Chiffres du modele non fiables : le match part SANS pari ni pourcentage.
  if(!c)return {type:'text',slot:'match',matchId:m.id,jour:jour,apercu:false,
    html:'<b>Match gratuit du jour : '+esc(dom)+' – '+esc(ext)+'</b>\n'+esc(quand)+'\n\n'
      +'L\'analyse est à découvrir sur le site, gratuite avec un compte :\n'+LISTE_SITE,
    boutons:[{text:'Voir l\'analyse du match',url:lienMatch(m,libre)}]};
  var pari=pariAffiche(m);
  return {type:'photo',slot:'match',matchId:m.id,jour:jour,
    carte:{equipes:dom+' – '+ext,quand:quand,pari:pari,estimation:c.estimation,coteTxt:c.coteTxt,coteLibelle:c.coteLibelle,
      phrase:'Chance calculée par IASHARK. Estimation, pas une garantie.'},
    html:'<b>Match gratuit du jour : '+esc(dom)+' – '+esc(ext)+'</b>\n'+esc(quand)+'\n\n'
      +'Sélection : <b>'+esc(pari)+'</b>\n'
      +'Chance calculée par IASHARK : <b>'+c.estimation+' %</b>\n'
      +esc(c.coteLibelle)+' : '+esc(c.coteTxt)+'\n\n'
      +'L\'analyse est sur le site, gratuite avec un compte :\n'+LISTE_SITE,
    boutons:[{text:'Voir l\'analyse du match',url:lienMatch(m,libre)}]};
}

// ---------- 3. Sondage : la grosse affiche du soir ----------
// Competitions mises en avant d'abord, puis le match le plus serre selon les
// cotes publiques (c1/c2, deja visibles sur l'accueil). Jamais le match
// gratuit (il a son propre message), jamais un match deja commence.
var AFFICHE=['ucl','champions','premier','laliga','seriea','bundesliga','ligue1','uel','europa','nations','world','euro'];
// Grandes equipes : une affiche avec l'une d'elles passe avant un match serre
// entre deux equipes moins suivies.
var GRANDES=['France','England','Spain','Germany','Italy','Portugal','Netherlands','Belgium','Brazil','Argentina','Croatia',
  'Paris Saint Germain','Marseille','Lyon','Monaco','Lille','Lens','Real Madrid','Barcelona','Atletico Madrid','Bayern Munich','Bayern München',
  'Borussia Dortmund','Liverpool','Manchester City','Manchester United','Arsenal','Chelsea','Tottenham','Juventus','Inter','AC Milan','Napoli','AS Roma'];
function grandes(m){return [m.home,m.away].filter(function(t){return t&&GRANDES.indexOf(t.n||t.name)!==-1;}).length;}
function rangCompet(m){var k=String(m.league_key||'')+' '+String(m.league||'').toLowerCase();for(var i=0;i<AFFICHE.length;i++)if(k.toLowerCase().indexOf(AFFICHE[i])!==-1)return i;return 99;}
function sondage(home,aujourdhui,heureMin){
  var liste=(home&&home.matchs||[]).filter(function(m){
    return m&&m.is_free!==true&&m.status==='NS'&&jourDe(m)===aujourdhui&&heure(m)>=heureMin&&num(m.c1)&&num(m.c2);
  });
  if(!liste.length)return null;
  liste.sort(function(a,b){return rangCompet(a)-rangCompet(b)||grandes(b)-grandes(a)||Math.abs(num(a.c1)-num(a.c2))-Math.abs(num(b.c1)-num(b.c2));});
  var m=liste[0],dom=equipe(m.home),ext=equipe(m.away);
  return {type:'poll',slot:'sondage',matchId:m.id,
    question:dom+' – '+ext+', ce soir '+heure(m)+' : qui gagne ?',
    options:[dom,'Match nul',ext],
    boutons:[{text:'L\'avis du modèle (Pro)',url:lienMatch(m)}]};
}

// ---------- 4. Actu foot ----------
// Titres fiables (fiabilite high) des dernieres 24 h, avec leur source et le
// lien vers l'article d'origine. Titre seul : jamais le texte de l'article.
function actu(fichier,maintenantMs){
  var items=(fichier&&fichier.items||[]).filter(function(i){
    if(!i||i.fiabilite!=='high'||!i.title||!/^https:\/\//.test(i.link||''))return false;
    var t=Date.parse(i.date);return isFinite(t)&&maintenantMs-t<24*3600*1000&&t<=maintenantMs+3600*1000;
  });
  var vus={},garde=[];
  items.forEach(function(i){var k=i.title.toLowerCase().slice(0,40);if(!vus[k]&&garde.length<3){vus[k]=1;garde.push(i);}});
  if(garde.length<2)return null;
  return {type:'text',slot:'actu',apercu:false,
    html:'<b>L\'actu foot du jour</b>\n\n'+garde.map(function(i){
      return '• '+esc(i.title.replace(/\s+/g,' ').trim())+' — <a href="'+esc(i.link)+'">'+esc(i.source||'source')+'</a>';
    }).join('\n')};
}

// ---------- 5. Guide du jour (blog) ----------
// Un guide different chaque jour, en tournant sur la liste.
function guide(guides,aujourdhui){
  var g=(guides||[]).filter(function(x){return x&&x.url&&x.title;});
  if(!g.length)return null;
  var p=aujourdhui.split('-').map(Number);
  var n=Math.floor(Date.UTC(p[0],p[1]-1,p[2])/86400000);
  var x=g[n%g.length];
  var url=x.url+(x.url.indexOf('?')===-1?'?':'&')+UTM;
  return {type:'text',slot:'guide',apercu:true,apercuUrl:url,
    html:'<b>Le guide du jour</b>\n'+esc(x.title)+(x.description?'\n\n'+esc(x.description):''),
    boutons:[{text:'Lire le guide',url:url}]};
}

return {resultats:resultats,matchGratuit:matchGratuit,lienMatch:lienMatch,chancesMatchGratuit:chancesMatchGratuit,chiffresFiables:chiffresFiables,pariV3Calibre:pariV3Calibre,sondage:sondage,actu:actu,guide:guide,
  equipe:equipe,esc:esc,dateLongue:dateLongue};
});
