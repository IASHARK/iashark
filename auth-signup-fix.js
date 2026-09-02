(function(){'use strict';
const email=document.getElementById('authEmail'),password=document.getElementById('authPassword'),button=document.getElementById('signUp'),output=document.getElementById('authMsg');
if(!email||!password||!button||!output||!window.IasharkApp)return;
const message=(text,type='')=>{output.textContent=text;output.className='message '+type};
button.onclick=async()=>{const address=email.value.trim();if(!address||!/^\S+@\S+\.\S+$/.test(address))return message('Saisissez une adresse email valide.','error');if(password.value.length<8)return message('Le mot de passe doit contenir au moins 8 caractères.','error');button.disabled=true;message('Création du compte…');const {data,error}=await IasharkApp.supabase.auth.signUp({email:address,password:password.value,options:{emailRedirectTo:new URL('/compte.html',location.origin).href}});button.disabled=false;if(error)return message(error.message==='Anonymous sign-ins are disabled'?'Saisissez une adresse email valide.':error.message,'error');message(data.session?'Compte créé. Vous êtes connecté.':'Compte créé. Vérifiez votre email pour l’activer.','success');if(data.session)location.reload()};
})();
