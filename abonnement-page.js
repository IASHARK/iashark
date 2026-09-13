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
  // Consentement obligatoire avant paiement (lib/checkout-consent.js : CGV +
  // demande d'execution immediate selon le marche), reverifie par
  // create-checkout-session. Charge a la demande si la page generee ne
  // l'inclut pas encore ; s'il ne se charge pas, aucun paiement n'est lance.
  function consentLib(){
    return new Promise(function(resolve){
      if(window.IasharkCheckoutConsent)return resolve(window.IasharkCheckoutConsent);
      var s=document.createElement('script');s.src='/lib/checkout-consent.js';
      s.onload=function(){resolve(window.IasharkCheckoutConsent||null);};
      s.onerror=function(){resolve(null);};
      document.head.appendChild(s);
    });
  }
  async function init(){
    if(window.I18N&&window.I18N.init){try{await window.I18N.init();}catch(e){}}
    var ctx=await IasharkApp.context();
    var box=document.getElementById('checkoutConsent');
    if(ctx.isPro){if(box)box.hidden=true;button.textContent=t('pricing_page.cta_pro_member','Accéder aux analyses');button.onclick=function(){location.href=localHref('');};return;}
    if(!box){box=document.createElement('div');box.id='checkoutConsent';button.parentNode.insertBefore(box,button);}
    var lib=await consentLib();
    var consent=lib?lib.mount(box,{buttons:[button]}):null;
    // Le message d'erreur sous le bouton disparait des que les cases requises sont cochees.
    if(consent)box.addEventListener('change',function(){if(consent.isValid()&&output.classList.contains('error'))message('',false);});
    button.onclick=async function(){
      if(!consent){message(t('checkout_consent.error_load','Les conditions de paiement n’ont pas pu être chargées. Rechargez la page.'),true);return;}
      if(!consent.check()){message(consent.text('error_required'),true);return;}
      var current=await IasharkApp.context();
      if(!current.user){location.href=localHref('compte.html#plan');return;}
      button.disabled=true;message(t('pricing_page.checkout_opening','Ouverture du paiement sécurisé…'));
      try{
        var session=await IasharkApp.supabase.auth.getSession();
        var token=session.data.session&&session.data.session.access_token;
        var body=payload();body.consent=consent.payload();
        var response=await fetch(IasharkApp.url+'/functions/v1/create-checkout-session',{method:'POST',headers:{apikey:IasharkApp.key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
        var data=await response.json();
        if(data.url){location.href=data.url;return;}
        if(data&&data.code==='consent_required'){
          consent.check();
          message(data.message||consent.text('error_required'),true);
        }else if(data&&data.processed===false&&data.reason==='market_not_configured'){
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
