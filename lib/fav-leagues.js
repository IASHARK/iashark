(function(root,factory){
  var api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.IasharkFavLeagues=api;
})(typeof window!=='undefined'?window:null,function(root){
'use strict';
// « Mes compétitions » : compétitions favorites (league_key de config/leagues.json).
// UNE source pour l'accueil (home-list.js) et la page Compte (account-page.js).
//   - visiteur : localStorage (cle KEY) ;
//   - compte connecte : auth.users.user_metadata.fav_leagues (Supabase Auth,
//     supabase.auth.updateUser({data:{fav_leagues}})), fusionne avec la liste
//     locale a la connexion, puis recopie localement.
// Aucune donnee personnelle : une liste de cles de competitions, 50 au plus.
var KEY='iashark.favLeagues.v1';
var MAX=50;

function clean(a){
  var out=[];
  (Array.isArray(a)?a:[]).forEach(function(k){
    if(typeof k==='string'&&/^[a-z0-9_-]{1,60}$/.test(k)&&out.indexOf(k)===-1&&out.length<MAX)out.push(k);
  });
  return out;
}
function storage(){try{return root&&root.localStorage||null;}catch(e){return null;}}
function readLocal(key){
  var st=storage();
  try{return clean(JSON.parse((st&&st.getItem(key||KEY))||'[]'));}catch(e){return [];}
}
function writeLocal(arr,key){
  var st=storage();
  try{if(st)st.setItem(key||KEY,JSON.stringify(clean(arr)));}catch(e){}
}

// Store observable. opts.storageKey : cle localStorage (tests).
function createStore(opts){
  opts=opts||{};
  var key=opts.storageKey||KEY,subs=[],remote=null;
  var set=readLocal(key);
  function emit(){var copy=set.slice();subs.forEach(function(fn){try{fn(copy);}catch(e){}});}
  function persist(push){
    writeLocal(set,key);
    var p=Promise.resolve();
    if(push!==false&&remote&&remote.save){
      var snapshot=set.slice();
      p=Promise.resolve().then(function(){return remote.save(snapshot);});
    }
    emit();
    return p;
  }
  return {
    list:function(){return set.slice();},
    has:function(k){return set.indexOf(k)!==-1;},
    // Renvoie true si la competition vient d'etre ajoutee.
    toggle:function(k){
      if(typeof k!=='string'||!k)return false;
      var i=set.indexOf(k);
      if(i===-1){if(set.length>=MAX)return false;set.push(k);}else set.splice(i,1);
      this.lastSave=persist();
      this.lastSave.catch(function(){});
      return i===-1;
    },
    replace:function(arr){set=clean(arr);this.lastSave=persist();this.lastSave.catch(function(){});},
    subscribe:function(fn){subs.push(fn);return function(){subs=subs.filter(function(f){return f!==fn;});};},
    // Fusion locale + compte, puis sauvegarde sur le compte si la fusion ajoute quelque chose.
    connectRemote:function(adapter){
      remote=adapter||null;
      if(!remote||!remote.load)return Promise.resolve(set.slice());
      return Promise.resolve().then(function(){return remote.load();}).then(function(arr){
        var distant=clean(arr),merged=clean(distant.concat(set));
        var changed=merged.length!==distant.length;
        set=merged;
        return persist(changed).catch(function(){}).then(function(){return set.slice();});
      }).catch(function(){return set.slice();});
    },
    lastSave:Promise.resolve()
  };
}

// Adaptateur Supabase Auth (client supabase-js v2).
function supabaseAdapter(supabase){
  return {
    load:function(){
      return supabase.auth.getUser().then(function(r){
        var u=r&&r.data&&r.data.user;
        return (u&&u.user_metadata&&u.user_metadata.fav_leagues)||[];
      });
    },
    save:function(arr){
      return supabase.auth.updateUser({data:{fav_leagues:clean(arr)}}).then(function(r){
        if(r&&r.error)throw r.error;
        return r;
      });
    }
  };
}

return {KEY:KEY,MAX:MAX,clean:clean,readLocal:readLocal,writeLocal:writeLocal,createStore:createStore,supabaseAdapter:supabaseAdapter};
});
