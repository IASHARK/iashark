(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.IasharkFreeMatch=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
// SOURCE UNIQUE du "match gratuit du jour".
//
// Avant, deux algorithmes differents repondaient a la meme question :
// pickFreeMatchId() dans match-page.js decidait quel match est gratuit, et
// getChoc() dans index.html decidait quel match mettre en vitrine. Ils ne
// tombaient pas d'accord. Resultat : le bouton "Voir le match gratuit du
// jour" de l'accueil envoyait vers un match que la page match considerait
// comme payant, et le visiteur se prenait le mur d'abonnement apres qu'on
// lui ait promis du gratuit. Les deux pages appellent desormais ce module.

function num(v){ var x=parseFloat(v); return isNaN(x)?null:x; }
function normConf(c){ c=parseFloat(c)||0; return c<=1?c*10:c; }
function parseEdge(m){
  if(m==null||m.edge==null||m.edge==='')return null;
  var v=parseFloat(String(m.edge).replace(',','.'));
  return isNaN(v)?null:v;
}
function normEdge(e){
  if(e==null||isNaN(e))return null;
  if(e<=1)return e*100;
  if(e<=10)return e*10;
  return Math.min(e,100);
}
// Score de classement : l'ecart modele/marche s'il existe, sinon la confiance.
function score(m){
  var e=normEdge(parseEdge(m));
  return e!=null?e:Math.min(normConf(m&&m.conf)*10,100);
}
function parisNow(){
  var f=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',year:'numeric',
    month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})
    .formatToParts(new Date());
  var r={}; f.forEach(function(x){ r[x.type]=x.value; });
  var day=r.year+'-'+r.month+'-'+r.day;
  return { day:day, now:day+' '+r.hour+':'+r.minute };
}
function meilleur(list){
  if(!list.length)return null;
  return list.reduce(function(b,m){ return score(m)>score(b)?m:b; },list[0]);
}

// Echelle de preference. On cherche d'abord parmi les matchs REELLEMENT
// analyses : la vitrine gratuite ne doit jamais tomber sur un match sans
// marche recommande, qui afficherait "aucun signal, confiance 0 %" au
// premier visiteur. Ce n'est qu'en dernier recours, si aucun match n'a de
// signal, qu'on retombe sur la liste brute plutot que de ne rien montrer.
function pickFreeMatch(list,horloge){
  if(!Array.isArray(list)||!list.length)return null;
  // Le pipeline DESIGNE l'analyse offerte du jour (is_free) et ne publie que
  // celle-la en clair. Quand ce drapeau est present il fait autorite : c'est
  // la seule facon que le site, la page match et la fonction Edge parlent du
  // meme match. L'heuristique en dessous ne sert que de repli, pour les
  // donnees anciennes ou un fichier genere avant cette designation.
  var designe=list.filter(function(m){return m&&m.is_free===true;});
  if(designe.length)return designe[0];
  var t=horloge||parisNow();
  var duJour=list.filter(function(m){ return String(m&&m.date||'').slice(0,10)===t.day; });
  var aVenir=function(src){ return src.filter(function(m){ return String(m&&m.date||'')>=t.now; }); };
  // has_signal est le drapeau public : le pari lui-meme n'est plus dans le
  // fichier public pour les matchs payants, mais on sait qu'il existe.
  var avecSignal=function(src){ return src.filter(function(m){ return !!(m&&(m.pari_rec||m.has_signal))&&!m.no_signal; }); };

  var echelle=[
    avecSignal(aVenir(duJour)),
    avecSignal(duJour),
    avecSignal(aVenir(list)),
    avecSignal(list),
    aVenir(duJour), duJour, aVenir(list), list
  ];
  for(var i=0;i<echelle.length;i++){
    var gagnant=meilleur(echelle[i]);
    if(gagnant)return gagnant;
  }
  return null;
}
function pickFreeMatchId(list,horloge){
  var m=pickFreeMatch(list,horloge);
  return m?m.id:null;
}
return { pickFreeMatch:pickFreeMatch, pickFreeMatchId:pickFreeMatchId, score:score, parisNow:parisNow };
});
