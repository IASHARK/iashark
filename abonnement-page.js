(function(){
  'use strict';
  var button=document.getElementById('subscribeButton');
  var output=document.getElementById('billingMessage');
  // i18n : repli francais si I18N n'est pas charge. Aucun texte serveur brut
  // (souvent en francais) n'est affiche : chaque cas connu a sa cle.
  function t(key,fallback){return (window.I18N&&window.I18N.t)?window.I18N.t(key,fallback):fallback;}
  // Lien interne qui reste dans le repertoire courant (/gb/, /mx/, /en/...).
  function localHref(p){
    var i=p.search(/[?#]/),tail='';
    if(i>=0){tail=p.slice(i);p=p.slice(0,i);}
    if(window.I18N&&typeof window.I18N.href==='function'){
      try{var out=window.I18N.href(p||'index.html');if(out)return String(out).replace(/\/index\.html$/,'/')+tail;}catch(e){}
    }
    return '/'+p+tail;
  }
  // Premier segment du chemin = repertoire de langue ou de marche. Envoye a
  // create-checkout-session : `dir` pour que Stripe renvoie l'acheteur sur
  // /<dir>/checkout-succes.html (ou -annule), `market` pour gb/mx/za afin
  // que le prix du marche soit utilise (jamais le tarif FR par defaut).
  var DIRS=['fr','en','es','de','it','pt','gb','za','mx'];
  var MARKETS=['gb','mx','za'];
  var seg=(location.pathname.match(/^\/([a-z]{2})(?:\/|$)/)||[])[1]||'';
  function message(text,isError){output.textContent=text;output.className='billing-message'+(isError?' error':'');}
  function payload(){
    var body={},M=window.IASHARK_MARKET;
    if(M&&typeof M.dir==='string'){
      // lib/market-config.js : checkoutMarket vaut null pour le marche EUR par
      // defaut, auquel cas aucun champ market n'est envoye.
      if(M.dir)body.dir=M.dir;
      if(M.checkoutMarket)body.market=M.checkoutMarket;
      return body;
    }
    if(DIRS.indexOf(seg)!==-1)body.dir=seg;
    if(MARKETS.indexOf(seg)!==-1)body.market=seg;
    return body;
  }
  async function init(){
    if(window.I18N&&window.I18N.init){try{await window.I18N.init();}catch(e){}}
    var ctx=await IasharkApp.context();
    if(ctx.isPro){button.textContent=t('pricing_page.cta_pro_member','Accéder aux analyses');button.onclick=function(){location.href=localHref('');};return;}
    button.onclick=async function(){
      var current=await IasharkApp.context();
      if(!current.user){location.href=localHref('compte.html#plan');return;}
      button.disabled=true;message(t('pricing_page.checkout_opening','Ouverture du paiement sécurisé…'));
      try{
        var session=await IasharkApp.supabase.auth.getSession();
        var token=session.data.session&&session.data.session.access_token;
        var response=await fetch(IasharkApp.url+'/functions/v1/create-checkout-session',{method:'POST',headers:{apikey:IasharkApp.key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload())});
        var data=await response.json();
        if(data.url){location.href=data.url;return;}
        if(data&&data.processed===false&&data.reason==='market_not_configured'){
          message(t('pricing_page.checkout_market_not_configured','Le paiement n’est pas encore ouvert pour ce pays. Aucun montant n’a été prélevé.'),true);
        }else{
          message(t('pricing_page.checkout_unavailable','Le paiement en ligne sera bientôt disponible.'),true);
        }
      }catch(error){message(t('pricing_page.checkout_error','Impossible d’ouvrir le paiement pour le moment.'),true);}
      button.disabled=false;
    };
  }
  init();
})();
