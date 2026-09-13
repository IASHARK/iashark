(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.IasharkMatchTime=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
// Heures de coup d'envoi dans le fuseau du VISITEUR (audit QA 14/09/2026).
//
// data.json ecrit les dates "YYYY-MM-DD HH:MM" en heure de Paris (pipeline
// .github/workflows/update-data.yml). Elles etaient affichees telles quelles :
// un visiteur de Londres, Johannesburg ou Mexico lisait l'heure de Paris sans
// aucune mention de fuseau, et les onglets Aujourd'hui / Demain suivaient le
// jour de Paris.
//
// Ce module convertit une date de Paris en instant reel (changements d'heure
// geres : le decalage de Paris est calcule pour la date elle-meme, jamais
// suppose), puis la reexprime dans le fuseau du navigateur (ou un fuseau
// explicite, pour les tests).
//
// tz : undefined, null ou 'local' = fuseau du navigateur ; sinon un
// identifiant IANA ('America/Mexico_City').

var SOURCE_TZ='Europe/Paris';
var DATE_RE=/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/;
var formatters={};

function zone(tz){ return (tz==null||tz==='local')?undefined:tz; }
function pad(n){ return (n<10?'0':'')+n; }

function partsFormatter(tz){
  var k=zone(tz)||'__local__';
  if(!formatters[k]){
    var o={year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false};
    if(zone(tz))o.timeZone=zone(tz);
    formatters[k]=new Intl.DateTimeFormat('en-US',o);
  }
  return formatters[k];
}
// Heure murale d'un instant dans un fuseau.
function wall(date,tz){
  var r={};
  partsFormatter(tz).formatToParts(date).forEach(function(x){ r[x.type]=x.value; });
  return {y:+r.year,mo:+r.month,d:+r.day,h:(+r.hour)%24,mi:+r.minute,s:+r.second};
}
// Decalage (minutes) d'un fuseau a un instant donne.
function offsetMinutes(date,tz){
  var p=wall(date,tz);
  var asUtc=Date.UTC(p.y,p.mo-1,p.d,p.h,p.mi,p.s);
  return Math.round((asUtc-Math.floor(date.getTime()/1000)*1000)/60000);
}

// "2026-09-14 21:00" (heure de Paris) -> Date (instant reel), ou null.
function parseParis(str){
  var m=DATE_RE.exec(String(str==null?'':str).trim());
  if(!m)return null;
  var y=+m[1],mo=+m[2],d=+m[3],h=m[4]!=null?+m[4]:0,mi=m[5]!=null?+m[5]:0;
  var guess=Date.UTC(y,mo-1,d,h,mi);
  var off=offsetMinutes(new Date(guess),SOURCE_TZ);
  var t=guess-off*60000;
  // Deuxieme passe : le decalage a l'instant corrige peut differer du
  // premier (nuit du changement d'heure).
  var off2=offsetMinutes(new Date(t),SOURCE_TZ);
  if(off2!==off)t=guess-off2*60000;
  return new Date(t);
}

function dayKey(date,tz){ var p=wall(date,tz); return p.y+'-'+pad(p.mo)+'-'+pad(p.d); }
function clockKey(date,tz){ var p=wall(date,tz); return p.y+'-'+pad(p.mo)+'-'+pad(p.d)+' '+pad(p.h)+':'+pad(p.mi); }
function addDays(day,n){
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day||''));
  if(!m)return '';
  var dt=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]+n));
  return dt.getUTCFullYear()+'-'+pad(dt.getUTCMonth()+1)+'-'+pad(dt.getUTCDate());
}

// Horloge du visiteur : {day, tomorrow, now:'YYYY-MM-DD HH:MM', tz}.
// La presence de la cle tz signale a lib/free-match.js que les dates des
// matchs doivent etre converties dans ce fuseau.
function localClock(now,tz){
  now=now||new Date();
  var day=dayKey(now,tz);
  return {day:day,tomorrow:addDays(day,1),now:clockKey(now,tz),tz:zone(tz)||null};
}

function matchDate(m){ return parseParis(m&&typeof m==='object'?m.date:m); }
function matchDay(m,tz){ var d=matchDate(m); return d?dayKey(d,tz):''; }
function matchClock(m,tz){ var d=matchDate(m); return d?clockKey(d,tz):''; }
function matchTimestamp(m){ var d=matchDate(m); return d?d.getTime():Number.POSITIVE_INFINITY; }

// "21:00" dans la langue et le fuseau du visiteur. opts.zone : ajoute le
// nom court du fuseau ("21:00 UTC+1", "20:00 BST").
function formatTime(m,locale,opts){
  var d=matchDate(m);
  if(!d)return '';
  var o={hour:'2-digit',minute:'2-digit'};
  if(opts&&zone(opts.timeZone))o.timeZone=zone(opts.timeZone);
  if(opts&&opts.zone)o.timeZoneName='short';
  try{ return new Intl.DateTimeFormat(locale||undefined,o).format(d); }
  catch(e){ return clockKey(d,opts&&opts.timeZone).slice(11); }
}
// "lun. 14 sept." dans la langue et le fuseau du visiteur.
function formatDate(m,locale,opts){
  var d=matchDate(m);
  if(!d)return '';
  var o={weekday:'short',day:'numeric',month:'short'};
  if(opts&&opts.year)o.year='numeric';
  if(opts&&zone(opts.timeZone))o.timeZone=zone(opts.timeZone);
  try{ return new Intl.DateTimeFormat(locale||undefined,o).format(d); }
  catch(e){ return dayKey(d,opts&&opts.timeZone); }
}

// Ordre stable et deterministe : coup d'envoi, puis competition, equipes, id.
// (Avant : comparateur a deux issues, jamais 0 -> l'ordre des matchs a la
// meme heure changeait d'un rendu a l'autre.)
function txt(v){ return String(v==null?'':v).toLowerCase(); }
function compareMatches(a,b){
  var ta=matchTimestamp(a),tb=matchTimestamp(b);
  if(ta!==tb)return ta<tb?-1:1;
  var keys=[
    [txt(a&&a.league),txt(b&&b.league)],
    [txt(a&&a.home&&a.home.n),txt(b&&b.home&&b.home.n)],
    [txt(a&&a.away&&a.away.n),txt(b&&b.away&&b.away.n)],
    [String(a&&a.id),String(b&&b.id)]
  ];
  for(var i=0;i<keys.length;i++){ if(keys[i][0]!==keys[i][1])return keys[i][0]<keys[i][1]?-1:1; }
  return 0;
}

return {
  SOURCE_TZ:SOURCE_TZ, parseParis:parseParis, dayKey:dayKey, clockKey:clockKey, addDays:addDays,
  localClock:localClock, matchDate:matchDate, matchDay:matchDay, matchClock:matchClock,
  matchTimestamp:matchTimestamp, formatTime:formatTime, formatDate:formatDate, compareMatches:compareMatches
};
});
