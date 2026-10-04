(function(){
  'use strict';
  // PAGE ABONNEMENT (04/10/2026, demande de Clement : « deux blocs, mal forme ;
  // appel a l'action direct en haut »). UNE colonne : le composant de paiement
  // unique (lib/offre-pro.js, mode « paiement »), puis les mentions. L'offre promo du 25/09 (codes BLEUS / CAIRO5) est
  // retiree : elle etait expiree et rechargeait encore la page.
  //
  // Chemins :
  //  - compte gratuit : duree -> cases legales -> Payer -> Stripe (1 ecran) ;
  //  - sans compte : duree -> « Creer mon compte et continuer » (jamais grise,
  //    aucune case avant l'inscription) -> inscription -> retour ICI avec la
  //    duree deja cochee (?duree=) et « Compte cree, il reste a confirmer le
  //    paiement » (?etape=compte), focus sur les cases -> Payer -> Stripe ;
  //  - abonne Pro : aucun second paiement, retour au match ou aux matchs du jour.
  function t(key,fallback){return (window.I18N&&window.I18N.t)?window.I18N.t(key,fallback):fallback;}
  function localHref(p){
    var i=p.search(/[?#]/),tail='';
    if(i>=0){tail=p.slice(i);p=p.slice(0,i);}
    if(window.I18N&&typeof window.I18N.href==='function'){
      try{var out=window.I18N.href(p||'index.html');if(out)return String(out).replace(/\/index\.html$/,'/')+tail;}catch(e){}
    }
    return '/'+p+tail;
  }
  var params=new URLSearchParams(location.search);
  // --- Le match d'ou vient le visiteur ---------------------------------------
  // Chemin lu dans ?next= (interne seulement) ou dans le referrer same-origin,
  // garde en sessionStorage pour checkout-succes / checkout-annule. Jamais
  // envoye au serveur, jamais un chemin externe.
  var RETOUR_KEY='iashark.checkout.return';
  function cheminInterne(p){return typeof p==='string'&&p.charAt(0)==='/'&&p.charAt(1)!=='/'&&p.indexOf('\\')===-1;}
  function cheminRetour(){
    var next=params.get('next')||'';
    if(cheminInterne(next))return next;
    try{var ref=document.referrer?new URL(document.referrer):null;if(ref&&ref.origin===location.origin&&/\/match\.html$/.test(ref.pathname))return ref.pathname+ref.search;}catch(e){}
    return '';
  }
  var next=cheminRetour();
  function contexteMatch(){
    if(!next||!/\/match\.html(\?|$)/.test(next))return null;
    var id=null;
    try{id=new URL(next,location.origin).searchParams.get('id');}catch(e){}
    return {path:next,id:id&&/^\d+$/.test(id)?id:null,label:''};
  }
  var contexte=contexteMatch();
  function memoriserRetour(){
    try{if(contexte)sessionStorage.setItem(RETOUR_KEY,JSON.stringify(contexte));else sessionStorage.removeItem(RETOUR_KEY);}catch(e){}
  }
  // « Tu etais sur Lens – Lille : l'analyse s'ouvre des le paiement valide. » Les
  // noms viennent du JSON public du match (aucun champ premium).
  function texteContexte(label){
    var esc=function(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});};
    var parts=t('offre_pro.context_match','Tu étais sur {match} : l’analyse s’ouvre dès le paiement validé.').split('{match}');
    return esc(parts[0])+'<b>'+esc(label)+'</b>'+esc(parts.slice(1).join('{match}'));
  }
  function libelleContexte(){
    if(!contexte)return Promise.resolve(null);
    if(!contexte.id)return Promise.resolve(t('pricing_page.context_match_generic','ce match'));
    return fetch('/match/'+contexte.id+'.json',{cache:'force-cache'}).then(function(r){return r.ok?r.json():null;}).then(function(m){
      var h=m&&m.home&&m.home.n,a=m&&m.away&&m.away.n;
      if(h&&a){contexte.label=h+' – '+a;return contexte.label;}
      return t('pricing_page.context_match_generic','ce match');
    }).catch(function(){return t('pricing_page.context_match_generic','ce match');});
  }
  async function init(){
    var i18n=(window.I18N&&window.I18N.init)?Promise.resolve().then(function(){return window.I18N.init();}).catch(function(){}):null;
    // app-client.js est en defer : il est pret au DOMContentLoaded (ce script aussi).
    var ctx={user:null,isPro:false};
    try{ctx=(await Promise.all([i18n,window.IasharkApp?IasharkApp.context():null]))[1]||ctx;}catch(e){}
    var boite=document.getElementById('offrePro');
    if(ctx.isPro){
      if(boite)boite.hidden=true;
      var pro=document.getElementById('abPro'),lienPro=document.getElementById('abProLien');
      if(lienPro&&contexte){lienPro.setAttribute('href',contexte.path);lienPro.removeAttribute('data-href');lienPro.textContent=t('offre_pro.pro_cta_match','Retour au match');}
      if(pro)pro.hidden=false;
      return;
    }
    if(!boite||!window.IasharkOffrePro)return;
    var etapeCompte=params.get('etape')==='compte'&&!!ctx.user;
    if(etapeCompte){var n=document.getElementById('abNotice');if(n)n.hidden=false;}
    var label=await libelleContexte();
    window.IasharkOffrePro.mount(boite,{
      mode:'paiement',contexte:'general',next:next,
      duree:window.IasharkOffrePro.dureeValide(params.get('duree')),
      connecte:!!ctx.user,
      contexteMatch:label?texteContexte(label):'',
      focusConsent:etapeCompte,
      onRetour:memoriserRetour
    });
  }
  init();
})();
