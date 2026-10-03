(function(){'use strict';const URL='https://ksvjraqitxouwiabecai.supabase.co';
// Keep the real public anon key in one existing source of truth when deployed.
const FALLBACK='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8';
const client=window.supabase.createClient(URL,FALLBACK);window.IasharkApp={supabase:client,url:URL,key:FALLBACK,async context(){const s=await client.auth.getSession(),session=s.data&&s.data.session;if(!session)return{session:null,user:null,profile:null,isPro:false,isAdmin:false};const q=await client.from('users').select('email,plan,role,capital,created_at').eq('id',session.user.id).maybeSingle();const p=q.data||{};return{session,user:session.user,profile:p,isAdmin:p.role==='admin',isPro:p.plan==='pro'||p.plan==='famille'||p.role==='admin'}}};
// Langue du compte (02/10/2026) : UNE source, public.user_preferences.language. Une fois par
// session du navigateur, un abonne connecte est ramene sur la meme page dans la langue de son
// compte (lib/langue-compte.js#cible). La cle de session est posee AVANT de partir : jamais de
// boucle, et le selecteur de langue reste libre ensuite. Pages sans prefixe : rien.
(function(){var CLE='iashark_langue_compte_appliquee';try{if(!/^\/(fr|en|es|gb|za|mx)\//.test(location.pathname)||sessionStorage.getItem(CLE))return;}catch(e){return;}
client.auth.getSession().then(function(s){var session=s&&s.data&&s.data.session;if(!session)return;try{sessionStorage.setItem(CLE,'1');}catch(e){return;}
return client.from('user_preferences').select('language').eq('user_id',session.user.id).maybeSingle().then(function(r){var lang=r&&r.data&&r.data.language;if(!lang)return;
var go=function(){var L=window.IasharkLangueCompte,c=L&&L.cible(lang,location);if(c)location.replace(c);};if(window.IasharkLangueCompte)return go();
var sc=document.createElement('script');sc.src='/lib/langue-compte.js';sc.onload=go;(document.head||document.documentElement).appendChild(sc);});}).catch(function(){});})();
})();
