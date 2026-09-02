(function(){
  'use strict';
  var button=document.getElementById('subscribeButton');
  var output=document.getElementById('billingMessage');
  function message(text,isError){output.textContent=text;output.className='billing-message'+(isError?' error':'');}
  async function init(){
    var ctx=await IasharkApp.context();
    if(ctx.isPro){button.textContent='Accéder aux analyses';button.onclick=function(){location.href='/';};return;}
    button.onclick=async function(){
      var current=await IasharkApp.context();
      if(!current.user){location.href='/compte.html#plan';return;}
      button.disabled=true;message('Ouverture du paiement sécurisé…');
      try{
        var session=await IasharkApp.supabase.auth.getSession();
        var token=session.data.session&&session.data.session.access_token;
        var response=await fetch(IasharkApp.url+'/functions/v1/create-checkout-session',{method:'POST',headers:{apikey:IasharkApp.key,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});
        var data=await response.json();
        if(data.url){location.href=data.url;return;}
        message(data.message||'Le paiement en ligne sera bientôt disponible.',true);
      }catch(error){message('Impossible d’ouvrir le paiement pour le moment.',true);}
      button.disabled=false;
    };
  }
  init();
})();
