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
// Score de classement du REPLI heuristique (aucun match designe is_free) :
// critere PUBLIC uniquement, identique pour un visiteur et un abonne. Ni conf
// (note sur 10 = probabilite du modele, premium depuis le 15/09/2026) ni edge
// (premium) : un classement fonde sur eux changerait selon l'abonnement et
// trahirait la probabilite par l'ordre. data_quality_score est publie.
function score(m){
  var q=num(m&&m.data_quality_score);
  return q==null?0:q;
}
function parisNow(){
  var f=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',year:'numeric',
    month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})
    .formatToParts(new Date());
  var r={}; f.forEach(function(x){ r[x.type]=x.value; });
  var day=r.year+'-'+r.month+'-'+r.day;
  return { day:day, now:day+' '+r.hour+':'+r.minute };
}
// Heure locale du visiteur (lib/match-time.js). Node : require ; navigateur :
// window.IasharkMatchTime (charge avant ce script). Absent : null, et le
// module retombe sur l'horloge de Paris (comportement historique).
function matchTime(){
  if(typeof window!=='undefined'&&window.IasharkMatchTime)return window.IasharkMatchTime;
  if(typeof require==='function'){ try{ return require('./match-time.js'); }catch(e){} }
  return null;
}
function horlogeParDefaut(){
  var mt=matchTime();
  return mt?mt.localClock():parisNow();
}
// Deux modes, pour rester compatible :
//  - horloge LOCALE (cle tz presente : IasharkMatchTime.localClock(), valeur
//    par defaut) : "aujourd'hui" = jour du visiteur, et le jour/l'heure de
//    chaque match sont convertis de Paris vers son fuseau ;
//  - horloge HISTORIQUE {day, now} sans tz (tests, appelants anciens) :
//    comparaison directe des chaines de Paris, comme avant.
function lecteurs(t){
  var mt=matchTime();
  if(t&&Object.prototype.hasOwnProperty.call(t,'tz')&&mt){
    return {
      jour:function(m){ return mt.matchDay(m,t.tz); },
      cle:function(m){ return mt.matchClock(m,t.tz); },
      local:true, mt:mt
    };
  }
  return {
    jour:function(m){ return String(m&&m.date||'').slice(0,10); },
    cle:function(m){ return String(m&&m.date||''); },
    local:false, mt:mt
  };
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
// Marches pays (13/09/2026) : le pipeline peut designer, en plus de l'offre
// generale (free_markets ["default"]), une offre Liga MX pour le Mexique
// (free_markets ["mx"]) et une offre PSL pour l'Afrique du Sud (["za"]).
// market (3e argument, optionnel) = window.IASHARK_MARKET.code. Sans market,
// ou sans designation pour ce marche, on applique la logique generale
// (designation du jour, puis a venir, puis heuristique).
function pourMarche(m,market){
  return !!(m&&Array.isArray(m.free_markets)&&m.free_markets.indexOf(market)!==-1);
}
function pickFreeMatch(list,horloge,market){
  if(!Array.isArray(list)||!list.length)return null;
  // Le pipeline DESIGNE l'analyse offerte du jour (is_free) et ne publie que
  // celle-la en clair. Quand ce drapeau est present il fait autorite : c'est
  // la seule facon que le site, la page match et la fonction Edge parlent du
  // meme match. L'heuristique en dessous ne sert que de repli, pour les
  // donnees anciennes ou un fichier genere avant cette designation.
  var t=horloge||horlogeParDefaut();
  var L=lecteurs(t);
  var designe=list.filter(function(m){return m&&m.is_free===true;});
  if(designe.length){
    // Le pipeline designe une analyse offerte PAR JOUR (aujourd'hui et
    // demain). A minuit (heure du visiteur) le site bascule donc tout seul
    // sur celle du nouveau jour, sans attendre le prochain passage du pipeline.
    var jourDe=L.jour;
    // Heure locale : les designations de deux jours de Paris peuvent tomber
    // le meme jour local (visiteur de Mexico). On prefere alors celle qui
    // n'a pas encore commence, la plus proche ; ordre stable sinon.
    var premierDuJour=function(src){
      if(!L.local||src.length<2)return src[0];
      var aVenirLoc=src.filter(function(m){ return L.cle(m)>=t.now; }).sort(L.mt.compareMatches);
      return aVenirLoc.length?aVenirLoc[0]:src.slice().sort(L.mt.compareMatches)[src.length-1];
    };
    if(market){
      var duMarche=designe.filter(function(m){ return pourMarche(m,market); });
      var duMarcheDuJour=duMarche.filter(function(m){ return jourDe(m)===t.day; });
      if(duMarcheDuJour.length)return premierDuJour(duMarcheDuJour);
      var duMarcheAVenir=duMarche.filter(function(m){ return jourDe(m)>t.day; })
        .sort(function(a,b){ return String(a.date)<String(b.date)?-1:1; });
      if(duMarcheAVenir.length)return duMarcheAVenir[0];
    }
    // Offre generale : un match designe UNIQUEMENT pour un marche pays
    // (free_markets sans "default") n'est pas l'offre generale. Un match
    // sans free_markets (fichier anterieur a ce champ) reste general.
    var generale=designe.filter(function(m){
      return !Array.isArray(m.free_markets)||m.free_markets.indexOf('default')!==-1;
    });
    if(generale.length)designe=generale;
    var designeDuJour=designe.filter(function(m){ return jourDe(m)===t.day; });
    if(designeDuJour.length)return premierDuJour(designeDuJour);
    var designeAVenir=designe.filter(function(m){ return jourDe(m)>t.day; })
      .sort(function(a,b){ return String(a.date)<String(b.date)?-1:1; });
    if(designeAVenir.length)return designeAVenir[0];
    return designe[0];
  }
  var duJour=list.filter(function(m){ return L.jour(m)===t.day; });
  var aVenir=function(src){ return src.filter(function(m){ return L.cle(m)>=t.now; }); };
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
function pickFreeMatchId(list,horloge,market){
  var m=pickFreeMatch(list,horloge,market);
  return m?m.id:null;
}
return { pickFreeMatch:pickFreeMatch, pickFreeMatchId:pickFreeMatchId, score:score, parisNow:parisNow, horlogeParDefaut:horlogeParDefaut };
});
