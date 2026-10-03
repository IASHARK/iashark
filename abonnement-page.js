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
  // Duree choisie dans la grille de prix (assets/pricing-grid.js : meme API
  // que lib/pro-plan-picker.js ; "month" par defaut, ?interval= venu d'une
  // autre grille du site). Sans grille : "month", valeur par defaut acceptee
  // par create-checkout-session.
  var picker=null;
  function intervalDemande(){var v=new URLSearchParams(location.search).get('interval')||'';return /^(week|month|year)$/.test(v)?v:undefined;}
  // Essai de 7 jours (V3 du 3/10/2026) : annonce SEULEMENT si le serveur le
  // confirme (trial_days > 0 : TRIAL_DAYS a 0 coupe aussi le texte) ET si le
  // compte connecte n'a jamais eu d'abonnement (meme regle que
  // create-checkout-session/trial.ts). Inconnu = pas d'annonce, bouton
  // « Devenir Pro » : jamais une promesse d'essai que le serveur refuserait.
  // 30/09/2026 : annonce retiree tant que les CGV n'avaient pas d'article sur
  // l'essai. 02/10/2026 : essai remis (TRIAL_DAYS absent = 7, CGV du 02/10/2026,
  // article 6 bis) : encart #proTrialInfo revenu, avec une ligne de prix tiree
  // de config/markets.json (durees payables de la grille) : « 7 jours gratuits,
  // puis 19,95 €/mois ou 6,99 €/semaine, annulable en 1 clic ».
  // 02/10/2026 (soir, decision de Clement) : essai sur l'ABONNEMENT MENSUEL
  // seulement (create-checkout-session/trial.ts#TRIAL_INTERVALS). Encart et
  // bouton « Commencer l'essai gratuit » seulement quand le MOIS est choisi
  // (mois par defaut) ; Semaine ou Annee : encart masque, « Devenir Pro ».
  // Titre : « 7 jours gratuits sur l'abonnement mensuel, puis 19,95 € / mois,
  // annulable en 1 clic ».
  var ANNONCE_ESSAI=true;
  var DUREES_ESSAI=['month'];
  var essai={serveur:null,compte:null,offreOuverte:false,pro:false,durees:[]};
  function dureeChoisie(){return picker&&typeof picker.interval==='function'?picker.interval():'month';}
  // Prix apres l'essai : celui du MOIS (seule duree avec essai), s'il est payable.
  function prixApresEssai(){
    var M=window.IASHARK_MARKET,offre=M&&typeof M.proOffer==='function'?M.proOffer():null;
    if(!offre||essai.durees.indexOf('month')===-1)return '';
    var it=offre.intervals.filter(function(x){return x.interval==='month';})[0];
    return it&&it.text?it.text+' '+t('pricing_grid.per_month','/ mois'):'';
  }
  function majEssai(){
    var ok=ANNONCE_ESSAI&&!essai.pro&&essai.offreOuverte&&essai.serveur>0&&essai.compte===true&&DUREES_ESSAI.indexOf(dureeChoisie())!==-1;
    var prix=ok?prixApresEssai():'';
    if(!prix)ok=false;
    montrer(document.getElementById('proTrialInfo'),ok);
    var titre=document.getElementById('proTrialHeadline');
    if(titre&&prix){
      titre.removeAttribute('data-i18n');
      titre.textContent=t('essai_mensuel.headline','{days} jours gratuits sur l’abonnement mensuel, puis {price}, annulable en 1 clic').split('{days}').join(String(essai.serveur)).split('{price}').join(prix);
    }
    if(essai.pro)return;
    var cle=ok?'pro_trial.cta':'pricing_page.cta_subscribe';
    button.setAttribute('data-i18n',cle);
    button.textContent=ok?t('pro_trial.cta','Commencer l’essai gratuit'):t('pricing_page.cta_subscribe','Devenir Pro');
  }
  function verifierCompteEssai(ctx){
    function fin(v){essai.compte=v;majEssai();}
    if(!ctx||!ctx.user)return fin(true);
    try{
      IasharkApp.supabase.from('subscriptions').select('stripe_subscription_id',{count:'exact',head:true}).eq('user_id',ctx.user.id)
        .then(function(r){fin(!r.error&&r.count===0);},function(){fin(false);});
    }catch(e){fin(false);}
  }
  // Code partenaire saisi au paiement (programme de partenaires, 03/10/2026) :
  // envoye tel quel (majuscules) a create-checkout-session, qui ne le prend
  // que si le compte n'a pas deja de parrain et refuse la meme personne. Vide =
  // rien n'est envoye ; le code memorise par un clic sur un lien (?ref=) est
  // deja sur le compte depuis l'inscription, ou propose ici en pre-remplissage.
  var REF_RE=/^[A-Z0-9][A-Z0-9_-]{2,18}[A-Z0-9]$/;
  function codePartenaire(){
    var el=document.getElementById('refCode');
    var v=el?String(el.value||'').trim().toUpperCase():'';
    return REF_RE.test(v)?v:'';
  }
  function majCodePartenaire(){
    var el=document.getElementById('refCode'),msg=document.getElementById('refCodeMsg');
    if(!el||!msg)return;
    var v=String(el.value||'').trim().toUpperCase();
    msg.className='ref-code-msg';
    if(!v){msg.textContent='';return;}
    if(!REF_RE.test(v)){msg.textContent=t('affiliation.checkout_code_invalid','Code invalide : 4 à 20 lettres ou chiffres.');msg.className='ref-code-msg error';return;}
    msg.textContent='';
    try{
      IasharkApp.supabase.rpc('affiliate_code_exists',{p_code:v}).then(function(r){
        if(String(el.value||'').trim().toUpperCase()!==v)return;
        if(r&&!r.error&&r.data===true){msg.textContent=t('affiliation.checkout_code_ok','Code reconnu.');msg.className='ref-code-msg ok';}
        else if(r&&!r.error){msg.textContent=t('affiliation.checkout_code_unknown','Ce code n’existe pas ou n’est pas encore actif.');msg.className='ref-code-msg error';}
      },function(){});
    }catch(e){}
  }
  function initCodePartenaire(){
    var el=document.getElementById('refCode'),box=document.getElementById('refCodeBox');
    if(!el)return;
    try{
      var aff=typeof window.iasharkAffiliate==='function'?window.iasharkAffiliate():null;
      if(aff&&aff.first&&!el.value){el.value=aff.first;if(box)box.open=true;}
    }catch(e){}
    el.addEventListener('input',majCodePartenaire);
    el.addEventListener('blur',majCodePartenaire);
    if(el.value)majCodePartenaire();
  }
  function payload(){
    var body={interval:picker?picker.interval():'month'},M=window.IASHARK_MARKET;
    var ref=codePartenaire();if(ref)body.ref=ref;
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
  // --- Le match d'ou vient le visiteur ---------------------------------------
  // Tunnel reel (analytics 09/2026) : match -> « Debloquer » -> abonnement.
  // Sans ce contexte la page vendait un abonnement generique, et le retour
  // Stripe (succes ou annulation) laissait l'acheteur loin de son match. Le
  // chemin est lu dans ?next= (interne seulement) ou dans le referrer
  // same-origin, puis garde en sessionStorage pour checkout-succes /
  // checkout-annule. Jamais envoye au serveur, jamais un chemin externe.
  var RETOUR_KEY='iashark.checkout.return';
  function cheminInterne(p){return typeof p==='string'&&p.charAt(0)==='/'&&p.charAt(1)!=='/'&&p.indexOf('\\')===-1;}
  function contexteMatch(){
    var next=new URLSearchParams(location.search).get('next')||'';
    var chemin=cheminInterne(next)?next:'';
    if(!chemin){
      try{var ref=document.referrer?new URL(document.referrer):null;if(ref&&ref.origin===location.origin&&/\/match\.html$/.test(ref.pathname))chemin=ref.pathname+ref.search;}catch(e){}
    }
    if(!chemin||!/\/match\.html(\?|$)/.test(chemin))return null;
    var id=null;
    try{id=new URL(chemin,location.origin).searchParams.get('id');}catch(e){}
    return {path:chemin,id:id&&/^\d+$/.test(id)?id:null,label:''};
  }
  var contexte=contexteMatch();
  function memoriserRetour(){
    try{if(contexte)sessionStorage.setItem(RETOUR_KEY,JSON.stringify(contexte));else sessionStorage.removeItem(RETOUR_KEY);}catch(e){}
  }
  // Ligne de contexte au-dessus du choix de duree : « Tu etais sur Banfield –
  // Barracas Central ». Les noms viennent du JSON public du match (aucun
  // champ premium) ; sans id ou sans reponse, la ligne reste generique.
  function afficherContexte(){
    var slot=document.getElementById('proContext');
    if(!slot||!contexte)return;
    var texte=t('pricing_page.context_match','Tu étais sur {match} — l’analyse complète s’ouvre dès le paiement validé.');
    var rendre=function(label){
      var parts=texte.split('{match}');
      slot.textContent='';
      slot.appendChild(document.createTextNode(parts[0]));
      var b=document.createElement('b');b.textContent=label;slot.appendChild(b);
      slot.appendChild(document.createTextNode(parts.slice(1).join('{match}')));
      slot.hidden=false;
    };
    if(!contexte.id){rendre(t('pricing_page.context_match_generic','ce match'));return;}
    fetch('/match/'+contexte.id+'.json',{cache:'force-cache'}).then(function(r){return r.ok?r.json():null;}).then(function(m){
      var h=m&&m.home&&m.home.n,a=m&&m.away&&m.away.n;
      if(h&&a){contexte.label=h+' – '+a;memoriserRetour();}
      rendre(contexte.label||t('pricing_page.context_match_generic','ce match'));
    }).catch(function(){rendre(t('pricing_page.context_match_generic','ce match'));});
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
  // abonnement.html rend le bouton verrouille (aria-disabled="true", classe
  // iash-consent-locked, title "Chargement…") : aucun clic sans effet pendant
  // le chargement. Il ne s'active qu'une fois le consentement monte et coche
  // (lib/checkout-consent.js#syncButtons), ou tout de suite pour un Pro.
  function loaded(){button.removeAttribute('data-loading');button.removeAttribute('data-i18n-attr');button.removeAttribute('title');}
  // Durees affichees par le selecteur (lib/pro-plan-picker.js#onUpdate : seules
  // les durees PAYABLES, decision du 19/09/2026). « Meme acces Pro, quelle que
  // soit la duree » n'a de sens qu'avec plusieurs durees a choisir. Aucune
  // duree payable (pays pas encore ouvert) : ni consentement ni bouton de
  // paiement, le selecteur affiche a leur place « paiement pas encore ouvert,
  // aucun montant preleve » ; la comparaison et la liste Pro restent.
  // Le HTML genere porte deja l'etat de la configuration (data-market-open-if,
  // scripts/build-locales.js) ; a partir d'ici c'est le selecteur qui decide
  // (serveur compris) : l'attribut est retire pour que lib/market-config.js ne
  // le reapplique jamais par-dessus.
  function montrer(el,visible){if(!el)return;el.removeAttribute('data-market-open-if');el.hidden=!visible;}
  function majOffre(visibles){
    var n=visibles&&visibles.length||0,ferme=n===0;
    var engagement=document.getElementById('proCommitment');
    if(engagement)engagement.hidden=n<2||essai.pro;
    // Abonne : ni consentement ni reassurance de paiement, seulement son bouton.
    ['checkoutConsent','billingMessage','proTrust'].forEach(function(id){montrer(document.getElementById(id),!ferme&&!essai.pro);});
    montrer(button,!ferme||essai.pro);
    essai.offreOuverte=!ferme;essai.durees=(visibles||[]).slice();majEssai();
  }
  // Grille de prix (30/09/2026) : carte Pro (prix, choix de la duree parmi les
  // durees payables) puis le Gratuit sur une ligne. « Meme acces », essai,
  // consentement, bouton et reassurance sont DEPLACES dans la carte Pro (option
  // slot) : le parcours de paiement ci-dessous ne change pas.
  function monterGrille(){
    var el=document.getElementById('pricingGrid');
    if(!el||!window.IasharkPricingGrid)return null;
    var slot=['proCommitment','proTrialInfo','checkoutConsent','subscribeButton','billingMessage','proTrust'].map(function(id){return document.getElementById(id);}).filter(Boolean);
    // Champ « code partenaire » (programme de partenaires) : dans la carte Pro, juste avant le consentement.
    var refBox=document.getElementById('refCodeBox'),consentEl=document.getElementById('checkoutConsent');
    if(refBox){var at=slot.indexOf(consentEl);slot.splice(at===-1?slot.length:at,0,refBox);}
    return window.IasharkPricingGrid.mount(el,{variant:'complet',heading:false,annual:true,checkout:true,slot:slot,interval:intervalDemande(),
      onChange:function(){if(output.classList.contains('error'))message('',false);majEssai();},
      onUpdate:function(v){majOffre(v);}});
  }
  function unlock(){button.classList.remove('iash-consent-locked');button.setAttribute('aria-disabled','false');}
  async function init(){
    // Grille montee tout de suite (elle attend elle-meme le dictionnaire).
    picker=monterGrille();
    // Dictionnaire et session sont independants : charges en parallele.
    var i18n=(window.I18N&&window.I18N.init)?Promise.resolve().then(function(){return window.I18N.init();}).catch(function(){}):null;
    var ctx=(await Promise.all([i18n,IasharkApp.context()]))[1];
    var box=document.getElementById('checkoutConsent');
    // Abonne : aucun second paiement (changer de duree = portail, depuis le compte).
    // Un Pro venu d'un match y retourne : c'est l'analyse qu'il voulait lire.
    // Rien n'est annonce tant que le serveur et le compte n'ont pas repondu.
    essai.pro=!!ctx.isPro;majEssai();
    if(ctx.isPro)montrer(document.getElementById('refCodeBox'),false);
    if(ctx.isPro){if(box)montrer(box,false);montrer(document.getElementById('proTrust'),false);montrer(button,true);loaded();unlock();button.textContent=t('pricing_page.cta_pro_member','Accéder aux analyses');button.onclick=function(){location.href=contexte?contexte.path:localHref('');};return;}
    afficherContexte();
    initCodePartenaire();
    if(!box){box=document.createElement('div');box.id='checkoutConsent';button.parentNode.insertBefore(box,button);}
    // Duree fermee par le serveur (Price Stripe absent) : masquee, jamais un autre prix.
    if(picker)picker.loadAvailability().then(function(){essai.serveur=picker.trialDays?picker.trialDays():null;majEssai();},function(){});
    verifierCompteEssai(ctx);
    var lib=await consentLib();
    var consent=lib?lib.mount(box,{buttons:[button]}):null;
    loaded();
    // Module de consentement indisponible : bouton actif, le clic affiche
    // l'erreur de chargement et aucun paiement n'est lance.
    if(!consent)unlock();
    // Le message d'erreur sous le bouton disparait des que les cases requises sont cochees.
    if(consent)box.addEventListener('change',function(){if(consent.isValid()&&output.classList.contains('error'))message('',false);});
    button.onclick=async function(){
      if(!consent){message(t('checkout_consent.error_load','Les conditions de paiement n’ont pas pu être chargées. Rechargez la page.'),true);return;}
      // Le bloc de consentement affiche deja son message d'erreur : un seul message a l'ecran.
      if(!consent.check()){message('',false);return;}
      // Disponibilites du serveur connues avant de payer (lib/pro-plan-picker.js#whenReady).
      if(picker&&picker.whenReady)await picker.whenReady();
      if(picker&&!picker.isAvailable()){message(t('pricing_page.checkout_interval_not_configured','Cette durée n’est pas encore ouverte au paiement. Choisis une autre durée ou reviens bientôt. Aucun montant n’a été prélevé.'),true);return;}
      var current=await IasharkApp.context();
      // Sans compte : inscription directe (le visiteur qui clique « Devenir
      // Pro » n'en a presque jamais), avec retour ICI - duree et match
      // conserves - au lieu du detour compte -> connexion -> « Mon compte »
      // qui perdait les inscrits avant le paiement. « Deja un compte ? » sur
      // la page d'inscription garde le meme retour (auth-pages.js#propagerNext).
      if(!current.user){
        var retour=location.pathname+(contexte?'?next='+encodeURIComponent(contexte.path):'');
        location.href=localHref('inscription.html?next='+encodeURIComponent(retour));return;
      }
      button.disabled=true;message(t('pricing_page.checkout_opening','Ouverture du paiement sécurisé…'));
      try{
        var session=await IasharkApp.supabase.auth.getSession();
        var token=session.data.session&&session.data.session.access_token;
        var body=payload();body.consent=consent.payload();
        var response=await fetch(IasharkApp.url+'/functions/v1/create-checkout-session',{method:'POST',headers:{apikey:IasharkApp.key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
        var data=await response.json();
        // Duree choisie gardee pour le rappel des pages de retour (checkout-succes / -annule).
        if(data.url){memoriserRetour();try{sessionStorage.setItem('iashark.checkout.interval',body.interval);}catch(e){}location.href=data.url;return;}
        if(data&&data.code==='consent_required'){
          if(consent.check())message(data.message||consent.text('error_required'),true);else message('',false);
        }else if(data&&data.processed===false&&data.reason==='market_not_configured'){
          message(t('pricing_page.checkout_market_not_configured','Le paiement n’est pas encore ouvert pour ce pays. Aucun montant n’a été prélevé.'),true);
        }else if(data&&data.processed===false&&data.reason==='interval_not_configured'){
          message(t('pricing_page.checkout_interval_not_configured','Cette durée n’est pas encore ouverte au paiement. Choisis une autre durée ou reviens bientôt. Aucun montant n’a été prélevé.'),true);
        }else if(data&&data.processed===false&&data.reason==='already_subscribed'){
          message(t('pricing_page.checkout_already_subscribed','Tu as déjà un abonnement Pro. Pour changer de durée, passe par ton compte.'),true);
        }else if(data&&data.processed===false&&data.reason==='price_mismatch'){
          message(t('pricing_page.checkout_price_mismatch','Le paiement de cette durée est momentanément indisponible. Aucun montant n’a été prélevé.'),true);
        }else{
          message(t('pricing_page.checkout_unavailable','Le paiement en ligne sera bientôt disponible.'),true);
        }
      }catch(error){message(t('pricing_page.checkout_error','Impossible d’ouvrir le paiement pour le moment.'),true);}
      button.disabled=false;
    };
  }
  init();
})();
