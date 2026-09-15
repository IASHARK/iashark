(function(root,factory){
  var api=factory(root);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.IasharkFavLeagues=api;
})(typeof window!=='undefined'?window:null,function(root){
'use strict';
// Favoris de l'accueil : UNE source pour l'accueil (home-list.js) et la page
// Compte (account-page.js). Deux listes, meme mecanique :
//   - « Mes compétitions » (kind 'leagues', defaut) : cles de competition
//     (league_key de config/leagues.json) ;
//     visiteur : localStorage KEY ; compte : user_metadata.fav_leagues ;
//   - « Mes matchs » (kind 'matches') : {id, ko} (identifiant du match et coup
//     d'envoi en ms), nettoyes automatiquement une fois le match passe ;
//     visiteur : localStorage KEY_MATCHES ; compte : user_metadata.fav_matches.
// Compte connecte : supabase.auth.updateUser({data:{<champ>}}), fusion avec la
// liste locale a la connexion, puis recopie locale.
// Aucune donnee personnelle : des identifiants de competitions ou de matchs, 50 au plus.
var KEY='iashark.favLeagues.v1';
var KEY_MATCHES='iashark.favMatches.v1';
var MAX=50;
// Un match favori est « passe » 3 h apres son coup d'envoi (fin du match, prolongations comprises).
var PAST_MS=3*3600*1000;

function cleanLeagues(a){
  var out=[];
  (Array.isArray(a)?a:[]).forEach(function(k){
    if(typeof k==='string'&&/^[a-z0-9_-]{1,60}$/.test(k)&&out.indexOf(k)===-1&&out.length<MAX)out.push(k);
  });
  return out;
}
// Entrees de match valides (sans le nettoyage des matchs passes).
function sanitizeMatches(a){
  var out=[],seen={};
  (Array.isArray(a)?a:[]).forEach(function(e){
    if(!e||typeof e!=='object')return;
    var id=e.id==null?'':String(e.id);
    if(!/^[A-Za-z0-9_-]{1,40}$/.test(id)||seen[id]||out.length>=MAX)return;
    var ko=Number(e.ko);
    seen[id]=1;
    out.push({id:id,ko:isFinite(ko)&&ko>0?ko:null});
  });
  return out;
}
function isPast(e,now){return e.ko!=null&&e.ko+PAST_MS<(now==null?Date.now():now);}
function cleanMatches(a,now){return sanitizeMatches(a).filter(function(e){return !isPast(e,now);});}

var SPECS={
  leagues:{key:KEY,field:'fav_leagues',sanitize:cleanLeagues,clean:cleanLeagues,idOf:function(k){return k;}},
  matches:{key:KEY_MATCHES,field:'fav_matches',sanitize:sanitizeMatches,clean:function(a){return cleanMatches(a);},idOf:function(e){return e.id;}}
};
function specOf(kind){return SPECS[kind]||SPECS.leagues;}

function storage(){try{return root&&root.localStorage||null;}catch(e){return null;}}
function readLocal(key,kind){
  var st=storage(),sp=specOf(kind);
  try{return sp.clean(JSON.parse((st&&st.getItem(key||sp.key))||'[]'));}catch(e){return [];}
}
function writeLocal(arr,key,kind){
  var st=storage(),sp=specOf(kind);
  try{if(st)st.setItem(key||sp.key,JSON.stringify(sp.clean(arr)));}catch(e){}
}

// Store observable. opts.kind : 'leagues' (defaut) ou 'matches' ;
// opts.storageKey : cle localStorage (tests).
function createStore(opts){
  opts=opts||{};
  var kind=opts.kind==='matches'?'matches':'leagues',sp=specOf(kind);
  var key=opts.storageKey||sp.key,subs=[],remote=null;
  var set=readLocal(key,kind);
  // Matchs passes retires a la lecture : la liste locale est reecrite tout de suite.
  try{var st0=storage(),raw0=sp.sanitize(JSON.parse((st0&&st0.getItem(key))||'[]'));if(raw0.length!==set.length)writeLocal(set,key,kind);}catch(e){}
  function ids(){return set.map(sp.idOf);}
  function emit(){var copy=ids();subs.forEach(function(fn){try{fn(copy);}catch(e){}});}
  function persist(push){
    writeLocal(set,key,kind);
    var p=Promise.resolve();
    if(push!==false&&remote&&remote.save){
      var snapshot=set.slice();
      p=Promise.resolve().then(function(){return remote.save(snapshot);});
    }
    emit();
    return p;
  }
  var store={
    kind:kind,
    // Identifiants (cles de competition ou ids de match, en chaines).
    list:function(){return ids();},
    // Entrees brutes ({id, ko} pour les matchs).
    entries:function(){return set.map(function(e){return typeof e==='object'?{id:e.id,ko:e.ko}:e;});},
    has:function(k){return k!=null&&ids().indexOf(String(k))!==-1;},
    // Renvoie true si l'element vient d'etre ajoute. ko : coup d'envoi (ms), matchs seulement.
    toggle:function(k,ko){
      if(k==null||k==='')return false;
      k=String(k);
      var i=ids().indexOf(k);
      if(i===-1){
        if(set.length>=MAX)return false;
        var item=kind==='matches'?sp.sanitize([{id:k,ko:ko}])[0]:sp.sanitize([k])[0];
        if(!item)return false;
        set.push(item);
      }else set.splice(i,1);
      store.lastSave=persist();
      store.lastSave.catch(function(){});
      return i===-1;
    },
    replace:function(arr){set=sp.clean(arr);store.lastSave=persist();store.lastSave.catch(function(){});},
    // Retire les entrees pour lesquelles fn(entree) est vrai (matchs termines) ;
    // les matchs passes d'apres leur coup d'envoi partent aussi. Sauvegarde si besoin.
    prune:function(fn){
      var next=sp.clean(set).filter(function(e){try{return !(fn&&fn(e));}catch(x){return true;}});
      if(next.length===set.length)return false;
      set=next;store.lastSave=persist();store.lastSave.catch(function(){});
      return true;
    },
    subscribe:function(fn){subs.push(fn);return function(){subs=subs.filter(function(f){return f!==fn;});};},
    // Fusion locale + compte, puis sauvegarde sur le compte si la fusion change
    // quelque chose (ajout local, ou match passe retire de la liste du compte).
    connectRemote:function(adapter){
      remote=adapter||null;
      if(!remote||!remote.load)return Promise.resolve(ids());
      return Promise.resolve().then(function(){return remote.load();}).then(function(arr){
        var distant=sp.sanitize(arr),merged=sp.clean(distant.concat(set));
        var a=distant.map(sp.idOf).sort().join('\n'),b=merged.map(sp.idOf).sort().join('\n');
        var changed=a!==b;
        set=merged;
        return persist(changed).catch(function(){}).then(function(){return ids();});
      }).catch(function(){return ids();});
    },
    lastSave:Promise.resolve()
  };
  return store;
}

// Adaptateur Supabase Auth (client supabase-js v2). field : 'fav_leagues' (defaut) ou 'fav_matches'.
function supabaseAdapter(supabase,field){
  field=field==='fav_matches'?'fav_matches':'fav_leagues';
  var sp=field==='fav_matches'?SPECS.matches:SPECS.leagues;
  return {
    load:function(){
      return supabase.auth.getUser().then(function(r){
        var u=r&&r.data&&r.data.user;
        return (u&&u.user_metadata&&u.user_metadata[field])||[];
      });
    },
    save:function(arr){
      var data={};data[field]=sp.clean(arr);
      return supabase.auth.updateUser({data:data}).then(function(r){
        if(r&&r.error)throw r.error;
        return r;
      });
    }
  };
}

return {KEY:KEY,KEY_MATCHES:KEY_MATCHES,MAX:MAX,PAST_MS:PAST_MS,clean:cleanLeagues,cleanMatches:cleanMatches,
  readLocal:readLocal,writeLocal:writeLocal,createStore:createStore,supabaseAdapter:supabaseAdapter};
});
