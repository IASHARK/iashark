"use strict";
// Suivi interne anonyme (visites + tunnel de conversion). AUCUN vendor tiers,
// AUCUN cookie, AUCUN pixel externe. Ecrit dans la table Supabase
// funnel_events (supabase/migrations/0008_funnel_events.sql + 0010 + 0011),
// lue uniquement par les fonctions admin (admin.html).
//
// Visiteur NON connecte : mesure d'audience (lignes directrices CNIL) :
// - identifiant de visite aleatoire en sessionStorage (efface a la fermeture
//   de l'onglet, jamais persistant, jamais un identifiant publicitaire) ;
// - page_view / page_leave / click ne portent aucun user_id ;
// Inscrit CONNECTE (session Supabase deja presente dans ce navigateur, lue
// dans le stockage du client supabase-js de la page, sans dependance
// ajoutee) : page_view / page_leave / click portent son user_id et partent
// avec SON jeton (politique RLS funnel_events_insert_own), pour que le
// proprietaire suive l'usage de ses inscrits (admin.html, « Mes inscrits »,
// migration 0025_admin_members.sql). Aucune donnee du compte (email...)
// n'est jamais ajoutee a metadata. Jeton expire : attente breve du
// renouvellement par window.IasharkApp.supabase (app-client.js), sinon
// l'evenement part anonyme. Refus respecte (« Ne pas lier mes visites a mon
// compte », compte.html) : localStorage iashark_tracking_opt_out="1" sur cet
// appareil OU user_metadata.tracking_opt_out=true sur le compte => aucun
// user_id. Base legale proposee : interet legitime avec opposition (a
// faire relire).
// - aucune adresse IP, aucun email, aucune empreinte : seulement des champs
//   grossiers (type d'appareil, navigateur, OS, largeur d'ecran, langue,
//   fuseau horaire et un pays ESTIME depuis ce fuseau, `country_guess`) ;
// - localisation APPROXIMATIVE deduite du reseau par Netlify (/api/geo,
//   netlify/edge-functions/geo.ts) : `geo_country`, `geo_region`,
//   `geo_city` sur la page_view. L'adresse IP n'est ni recue par ce script,
//   ni envoyee, ni stockee ;
// - uniquement sur le domaine de production (les tests locaux ne polluent
//   pas les statistiques), jamais sur admin.html, jamais pour les robots
//   d'indexation (Googlebot...).
// Trafic interne et tests : JAMAIS bloques, seulement MARQUES dans metadata
// pour etre exclus par defaut du tableau de bord (migration 0019) :
// - internal:true : navigateur du proprietaire (localStorage
//   iashark_internal="1", pose par admin.html apres controle admin, ou par
//   ?internal=1 sur n'importe quelle page ; ?internal=0 l'efface) ;
// - qa:true : visite arrivee avec un utm_source commencant par "qa"
//   (memorise pour tout l'onglet en sessionStorage) ;
// - bot:true : navigateur pilote (navigator.webdriver, HeadlessChrome,
//   Playwright/Puppeteer/PhantomJS) ou ordinateur annoncant un ecran de
//   telephone (emulation de viewport des tests mobiles) ; depuis le
//   19/09/2026 aussi : telephone sans ecran tactile (user-agent de telephone
//   emprunte par un ordinateur), et navigateur regle sur le temps universel
//   (fuseau UTC / Etc/...) qui annonce un telephone ou un ecran d'ordinateur
//   de 800 px (fenetre par defaut de Chrome sans interface). Ces visites sans
//   pays faisaient les « pays inconnu » du tableau de bord (meme regle en SQL :
//   raison 'headless', migration 0031_admin_conversion_funnel.sql).
// Tunnel « Ou les visiteurs decrochent » (admin.html, 0031) :
// - gate_view : un panneau « Debloquer » (mur Pro ou compte gratuit de la
//   page match, panneau des buteurs du jour) reellement affiche a l'ecran
//   (moitie visible pendant 1 s), une fois par panneau et par page vue.
//   Impression seulement, jamais liee a un compte : { gate, pv, match_id } ;
// - click kind checkout_consent : case des conditions (CGV) cochee
//   (lib/checkout-consent.js), une fois par page ;
// - click kind checkout : + ready (bouton de paiement actif, case cochee) et
//   signed_in (une session est ouverte dans ce navigateur, jamais laquelle).
// Exception documentee : signup_completed peut porter le user_id du compte
// qui vient d'etre cree, UNIQUEMENT avec le jeton de ce compte (la politique
// RLS funnel_events_insert_own refuse tout autre user_id). Sans jeton,
// l'evenement part sans user_id plutot que d'etre rejete par la base.
// Google Analytics, lui, reste charge uniquement apres acceptation
// explicite (site-prefs.js).
(function () {
  if (window.__iasharkTrackLoaded) return;
  window.__iasharkTrackLoaded = true;

  var SUPA_URL = "https://ksvjraqitxouwiabecai.supabase.co";
  var SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8";
  var PROD_HOSTS = { "iashark.com": true, "www.iashark.com": true };
  var loc = window.location;
  var nav = window.navigator || {};
  var UA = String(nav.userAgent || "");

  var params;
  try { params = new URLSearchParams(loc.search); } catch (e) { params = { get: function () { return null; } }; }
  function param(name) {
    try { return params.get(name); } catch (e) { return null; }
  }

  // Robots d'indexation et apercus de liens : aucun envoi.
  var isCrawler = /bot|crawl|spider|slurp|lighthouse|pagespeed|preview|facebookexternalhit|inspectiontool|googleother|google-read-aloud|mediapartners|apis-google|feedfetcher|ia_archiver|qwantify/i.test(UA);
  var enabled = !!PROD_HOSTS[loc.hostname] && !isCrawler;

  // ---------- Marquage du trafic interne / de test (jamais bloquant) ----------
  var internalParam = param("internal");
  try {
    if (internalParam === "1") localStorage.setItem("iashark_internal", "1");
    else if (internalParam === "0") localStorage.removeItem("iashark_internal");
  } catch (e) {}

  function readInternal() {
    try { return localStorage.getItem("iashark_internal") === "1"; } catch (e) { return internalParam === "1"; }
  }

  function readQa() {
    var fromUrl = /^qa/i.test(String(param("utm_source") || ""));
    try {
      if (fromUrl) sessionStorage.setItem("iashark_visit_qa", "1");
      return sessionStorage.getItem("iashark_visit_qa") === "1";
    } catch (e) {
      return fromUrl;
    }
  }

  // Fuseaux du temps universel (UTC, Etc/GMT...) : jamais celui d'un pays.
  var SERVER_TZ = /^(Etc\/[A-Za-z0-9+-]{1,16}|UTC|UCT|GMT0?|Universal|Zulu|Greenwich)$/;

  function looksAutomated() {
    try {
      if (nav.webdriver === true) return true;
      if (/HeadlessChrome|PhantomJS|Puppeteer|Playwright/i.test(UA)) return true;
      if (window.__playwright__binding__ || window.__pwInitScripts || window._phantom || window.callPhantom ||
          window.__nightmare || window.domAutomation || window.domAutomationController) return true;
      // Un ordinateur (Windows/Mac sans ecran tactile) n'a jamais un ecran de
      // moins de 600 px : signature d'un test mobile emule.
      var w = window.screen && window.screen.width;
      if (w && w < 600 && /Windows NT|Macintosh/.test(UA) && !(nav.maxTouchPoints > 1)) return true;
      // Telephone annonce, mais aucun ecran tactile : user-agent emprunte.
      if (/iPhone|iPod|Android.+Mobile/i.test(UA) && nav.maxTouchPoints === 0) return true;
      // Fuseau du temps universel (serveurs, robots) : un vrai telephone ou
      // une vraie tablette a toujours le fuseau de son pays, un vrai
      // ordinateur n'a pas un ecran de 800 px (fenetre par defaut de Chrome
      // sans interface). Meme regle que la raison 'headless' (SQL, 0031).
      if (SERVER_TZ.test(String(timeZone()))) {
        if (/iPhone|iPod|iPad|Android/i.test(UA)) return true;
        if (w === 800 && /Windows NT|Macintosh|Linux|CrOS/.test(UA)) return true;
      }
    } catch (e) {}
    return false;
  }

  var FLAGS = { internal: readInternal(), qa: readQa(), bot: looksAutomated() };

  function withFlags(metadata) {
    var md = {};
    if (metadata && typeof metadata === "object") {
      for (var key in metadata) {
        if (Object.prototype.hasOwnProperty.call(metadata, key)) md[key] = metadata[key];
      }
    }
    if (FLAGS.internal) md.internal = true;
    if (FLAGS.qa) md.qa = true;
    if (FLAGS.bot) md.bot = true;
    return md;
  }
  // Pages internes jamais mesurees (on ne compte pas le proprietaire).
  var autoTrack = enabled && !/^\/admin(\.html)?$/.test(loc.pathname);

  // Nettoyage de l'ancien identifiant persistant (localStorage), remplace par
  // un identifiant de visite non persistant.
  try { localStorage.removeItem("iashark_funnel_sid"); } catch (e) {}

  function randomId(prefix) {
    return prefix + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
  }

  function getSessionId() {
    try {
      var id = sessionStorage.getItem("iashark_visit_id");
      if (!id) {
        id = randomId("v_");
        sessionStorage.setItem("iashark_visit_id", id);
      }
      return id;
    } catch (e) {
      return null;
    }
  }

  function currentSite() {
    var m = loc.pathname.match(/^\/(fr|en|es|de|it|pt|gb|za|mx)(\/|$)/);
    return m ? m[1] : "fr";
  }

  function send(body, authToken) {
    if (!enabled) return;
    try {
      var headers = { "Content-Type": "application/json", apikey: SUPA_KEY, Prefer: "return=minimal" };
      if (authToken) headers.Authorization = "Bearer " + authToken;
      fetch(SUPA_URL + "/rest/v1/funnel_events", {
        method: "POST",
        headers: headers,
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {
      // Le suivi ne doit jamais casser une page : echec toujours silencieux.
    }
  }

  // ---------- Inscrit connecte ----------
  // Cle de stockage par defaut de supabase-js v2 pour ce projet
  // (sb-<ref>-auth-token), partagee par app-client.js et auth-header.js.
  var AUTH_STORAGE_KEY = "sb-ksvjraqitxouwiabecai-auth-token";
  var OPT_OUT_KEY = "iashark_tracking_opt_out";
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  var TOKEN_MARGIN_MS = 60000;
  var liveSession = null;

  function readStoredSession() {
    try {
      var raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (s && s.currentSession) s = s.currentSession;
      return s && typeof s === "object" ? s : null;
    } catch (e) {
      return null;
    }
  }
  function sessionUser(s) {
    var u = s && s.user;
    return u && typeof u.id === "string" && UUID_RE.test(u.id) ? u : null;
  }
  function freshToken(s) {
    var exp = Number(s && s.expires_at);
    return s && typeof s.access_token === "string" && s.access_token.length > 20 && exp * 1000 > Date.now() + TOKEN_MARGIN_MS
      ? s.access_token : null;
  }
  function optedOut(user) {
    try { if (localStorage.getItem(OPT_OUT_KEY) === "1") return true; } catch (e) {}
    var meta = user && user.user_metadata;
    return !!meta && (meta.tracking_opt_out === true || meta.tracking_opt_out === "true");
  }
  // { id, token } ou null (evenement anonyme). La session stockee fait foi :
  // deconnecte => anonyme, meme si une session a ete lue plus tot.
  function memberIdentity() {
    var stored = readStoredSession();
    var user = sessionUser(stored);
    if (!user) return null;
    var token = freshToken(stored);
    var live = sessionUser(liveSession);
    if (!token && live && live.id === user.id) {
      token = freshToken(liveSession);
      user = live;
    }
    if (!token || optedOut(user)) return null;
    return { id: user.id, token: token };
  }
  function sessionState() {
    var stored = readStoredSession();
    if (!sessionUser(stored)) return "none";
    return freshToken(stored) ? "fresh" : "stale";
  }
  // Jeton expire : le client deja charge par la page le renouvelle
  // (getSession). 6 essais x 200 ms au plus pour le trouver, jamais bloquant.
  function refreshIdentity(done) {
    var tries = 0, finished = false;
    var finish = function () { if (!finished) { finished = true; done(); } };
    var attempt = function () {
      try {
        var app = window.IasharkApp;
        var auth = app && app.supabase && app.supabase.auth;
        if (auth && typeof auth.getSession === "function") {
          Promise.resolve(auth.getSession()).then(function (r) {
            var s = r && r.data && r.data.session;
            if (s) liveSession = s;
            finish();
          }, finish);
          return;
        }
      } catch (e) {
        finish();
        return;
      }
      if (++tries >= 6) { finish(); return; }
      setTimeout(attempt, 200);
    };
    attempt();
  }

  // Evenements de navigation : user_id uniquement celui de la session
  // connectee de ce navigateur (jamais celui passe par l'appelant).
  var NAVIGATION_EVENTS = { page_view: true, page_leave: true, click: true };

  // eventType : liste fermee (check constraint funnel_events_event_type_check).
  // userId n'est transmis qu'accompagne du jeton de CE compte (authToken).
  window.iasharkTrack = function (eventType, metadata, userId, authToken) {
    var uid = null, token = null;
    if (NAVIGATION_EVENTS[eventType]) {
      var member = enabled ? memberIdentity() : null;
      if (member) { uid = member.id; token = member.token; }
    } else if (authToken && userId) {
      uid = userId;
      token = authToken;
    }
    send({
      event_type: eventType,
      page: loc.pathname.slice(0, 300),
      locale: currentSite(),
      session_id: getSessionId(),
      user_id: uid,
      metadata: withFlags(metadata),
    }, token);
  };

  if (!autoTrack) return;

  function clip(value, max) {
    if (value === null || value === undefined) return null;
    var s = String(value).trim();
    return s ? s.slice(0, max) : null;
  }

  // ---------- Contexte grossier du visiteur ----------
  function deviceType() {
    var touchMac = /Macintosh/.test(UA) && nav.maxTouchPoints > 1; // iPadOS se presente comme un Mac
    if (/iPad|Tablet|PlayBook|Silk|Kindle/i.test(UA) || touchMac || (/Android/i.test(UA) && !/Mobile/i.test(UA))) return "tablet";
    if (/Mobi|iPhone|iPod|Android|IEMobile|Opera Mini/i.test(UA)) return "mobile";
    return "desktop";
  }

  function browserName() {
    if (/FBAN|FBAV/.test(UA)) return "Facebook (app)";
    if (/Instagram/.test(UA)) return "Instagram (app)";
    if (/musical_ly|BytedanceWebview|TikTok/i.test(UA)) return "TikTok (app)";
    if (/Snapchat/i.test(UA)) return "Snapchat (app)";
    if (/EdgA?\/|EdgiOS\/|Edg\//.test(UA)) return "Edge";
    if (/OPR\/|Opera/.test(UA)) return "Opera";
    if (/SamsungBrowser/.test(UA)) return "Samsung Internet";
    if (/FxiOS|Firefox\//.test(UA)) return "Firefox";
    if (/CriOS|Chrome\//.test(UA)) return "Chrome";
    if (/Safari\//.test(UA)) return "Safari";
    return "Other";
  }

  function osName() {
    if (/iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && nav.maxTouchPoints > 1)) return "iOS";
    if (/Android/.test(UA)) return "Android";
    if (/CrOS/.test(UA)) return "ChromeOS";
    if (/Windows/.test(UA)) return "Windows";
    if (/Mac OS X|Macintosh/.test(UA)) return "macOS";
    if (/Linux/.test(UA)) return "Linux";
    return "Other";
  }

  // Pays ESTIME depuis le fuseau horaire du navigateur (jamais l'IP). Une
  // estimation : un fuseau couvre parfois plusieurs pays, un VPN ou un
  // voyageur fausse la valeur. Table complete (19/09/2026) : tous les fuseaux
  // de la base IANA (zone.tab, tzdata 2026c) et leurs anciens noms encore
  // renvoyes par les navigateurs (Asia/Calcutta, Europe/Kiev...), 489 fuseaux.
  // Avant, une centaine seulement : Africa/Harare, Africa/Accra, Asia/Tehran...
  // donnaient « pays inconnu ». Fuseau absent (UTC, Etc/...) => null.
  // Format compact « Region:Ville PAYS,Ville PAYS,... », lu une seule fois.
  var TZ_TABLE = [
    "Africa:Abidjan CI,Accra GH,Addis_Ababa ET,Algiers DZ,Asmara ER,Asmera ER,Bamako ML,Bangui CF,Banjul GM," +
    "Bissau GW,Blantyre MW,Brazzaville CG,Bujumbura BI,Cairo EG,Casablanca MA,Ceuta ES,Conakry GN,Dakar SN," +
    "Dar_es_Salaam TZ,Djibouti DJ,Douala CM,El_Aaiun EH,Freetown SL,Gaborone BW,Harare ZW,Johannesburg ZA," +
    "Juba SS,Kampala UG,Khartoum SD,Kigali RW,Kinshasa CD,Lagos NG,Libreville GA,Lome TG,Luanda AO," +
    "Lubumbashi CD,Lusaka ZM,Malabo GQ,Maputo MZ,Maseru LS,Mbabane SZ,Mogadishu SO,Monrovia LR,Nairobi KE," +
    "Ndjamena TD,Niamey NE,Nouakchott MR,Ouagadougou BF,Porto-Novo BJ,Sao_Tome ST,Timbuktu ML,Tripoli LY," +
    "Tunis TN,Windhoek NA",
    "America:Adak US,Anchorage US,Anguilla AI,Antigua AG,Araguaina BR,Argentina/Buenos_Aires AR," +
    "Argentina/Catamarca AR,Argentina/ComodRivadavia AR,Argentina/Cordoba AR,Argentina/Jujuy AR," +
    "Argentina/La_Rioja AR,Argentina/Mendoza AR,Argentina/Rio_Gallegos AR,Argentina/Salta AR," +
    "Argentina/San_Juan AR,Argentina/San_Luis AR,Argentina/Tucuman AR,Argentina/Ushuaia AR,Aruba AW," +
    "Asuncion PY,Atikokan CA,Atka US,Bahia BR,Bahia_Banderas MX,Barbados BB,Belem BR,Belize BZ," +
    "Blanc-Sablon CA,Boa_Vista BR,Bogota CO,Boise US,Buenos_Aires AR,Cambridge_Bay CA,Campo_Grande BR," +
    "Cancun MX,Caracas VE,Catamarca AR,Cayenne GF,Cayman KY,Chicago US,Chihuahua MX,Ciudad_Juarez MX," +
    "Coral_Harbour CA,Cordoba AR,Costa_Rica CR,Coyhaique CL,Creston CA,Cuiaba BR,Curacao CW,Danmarkshavn GL," +
    "Dawson CA,Dawson_Creek CA,Denver US,Detroit US,Dominica DM,Edmonton CA,Eirunepe BR,El_Salvador SV," +
    "Ensenada MX,Fort_Nelson CA,Fort_Wayne US,Fortaleza BR,Glace_Bay CA,Godthab GL,Goose_Bay CA,Grand_Turk TC," +
    "Grenada GD,Guadeloupe GP,Guatemala GT,Guayaquil EC,Guyana GY,Halifax CA,Havana CU,Hermosillo MX," +
    "Indiana/Indianapolis US,Indiana/Knox US,Indiana/Marengo US,Indiana/Petersburg US,Indiana/Tell_City US," +
    "Indiana/Vevay US,Indiana/Vincennes US,Indiana/Winamac US,Indianapolis US,Inuvik CA,Iqaluit CA,Jamaica JM," +
    "Jujuy AR,Juneau US,Kentucky/Louisville US,Kentucky/Monticello US,Knox_IN US,Kralendijk BQ,La_Paz BO," +
    "Lima PE,Los_Angeles US,Louisville US,Lower_Princes SX,Maceio BR,Managua NI,Manaus BR,Marigot MF," +
    "Martinique MQ,Matamoros MX,Mazatlan MX,Mendoza AR,Menominee US,Merida MX,Metlakatla US,Mexico_City MX," +
    "Miquelon PM,Moncton CA,Monterrey MX,Montevideo UY,Montreal CA,Montserrat MS,Nassau BS,New_York US," +
    "Nipigon CA,Nome US,Noronha BR,North_Dakota/Beulah US,North_Dakota/Center US,North_Dakota/New_Salem US," +
    "Nuuk GL,Ojinaga MX,Panama PA,Pangnirtung CA,Paramaribo SR,Phoenix US,Port-au-Prince HT,Port_of_Spain TT," +
    "Porto_Acre BR,Porto_Velho BR,Puerto_Rico PR,Punta_Arenas CL,Rainy_River CA,Rankin_Inlet CA,Recife BR," +
    "Regina CA,Resolute CA,Rio_Branco BR,Rosario AR,Santa_Isabel MX,Santarem BR,Santiago CL,Santo_Domingo DO," +
    "Sao_Paulo BR,Scoresbysund GL,Shiprock US,Sitka US,St_Barthelemy BL,St_Johns CA,St_Kitts KN,St_Lucia LC," +
    "St_Thomas VI,St_Vincent VC,Swift_Current CA,Tegucigalpa HN,Thule GL,Thunder_Bay CA,Tijuana MX,Toronto CA," +
    "Tortola VG,Vancouver CA,Virgin VI,Whitehorse CA,Winnipeg CA,Yakutat US,Yellowknife CA",
    "Antarctica:Casey AQ,Davis AQ,DumontDUrville AQ,Macquarie AU,Mawson AQ,McMurdo AQ,Palmer AQ,Rothera AQ," +
    "South_Pole AQ,Syowa AQ,Troll AQ,Vostok AQ",
    "Arctic:Longyearbyen SJ",
    "Asia:Aden YE,Almaty KZ,Amman JO,Anadyr RU,Aqtau KZ,Aqtobe KZ,Ashgabat TM,Ashkhabad TM,Atyrau KZ," +
    "Baghdad IQ,Bahrain BH,Baku AZ,Bangkok TH,Barnaul RU,Beirut LB,Bishkek KG,Brunei BN,Calcutta IN,Chita RU," +
    "Choibalsan MN,Chongqing CN,Chungking CN,Colombo LK,Dacca BD,Damascus SY,Dhaka BD,Dili TL,Dubai AE," +
    "Dushanbe TJ,Famagusta CY,Gaza PS,Harbin CN,Hebron PS,Ho_Chi_Minh VN,Hong_Kong HK,Hovd MN,Irkutsk RU," +
    "Istanbul TR,Jakarta ID,Jayapura ID,Jerusalem IL,Kabul AF,Kamchatka RU,Karachi PK,Kashgar CN,Kathmandu NP," +
    "Katmandu NP,Khandyga RU,Kolkata IN,Krasnoyarsk RU,Kuala_Lumpur MY,Kuching MY,Kuwait KW,Macao MO,Macau MO," +
    "Magadan RU,Makassar ID,Manila PH,Muscat OM,Nicosia CY,Novokuznetsk RU,Novosibirsk RU,Omsk RU,Oral KZ," +
    "Phnom_Penh KH,Pontianak ID,Pyongyang KP,Qatar QA,Qostanay KZ,Qyzylorda KZ,Rangoon MM,Riyadh SA,Saigon VN," +
    "Sakhalin RU,Samarkand UZ,Seoul KR,Shanghai CN,Singapore SG,Srednekolymsk RU,Taipei TW,Tashkent UZ," +
    "Tbilisi GE,Tehran IR,Tel_Aviv IL,Thimbu BT,Thimphu BT,Tokyo JP,Tomsk RU,Ujung_Pandang ID,Ulaanbaatar MN," +
    "Ulan_Bator MN,Urumqi CN,Ust-Nera RU,Vientiane LA,Vladivostok RU,Yakutsk RU,Yangon MM,Yekaterinburg RU," +
    "Yerevan AM",
    "Atlantic:Azores PT,Bermuda BM,Canary ES,Cape_Verde CV,Faeroe FO,Faroe FO,Jan_Mayen SJ,Madeira PT," +
    "Reykjavik IS,South_Georgia GS,St_Helena SH,Stanley FK",
    "Australia:ACT AU,Adelaide AU,Brisbane AU,Broken_Hill AU,Canberra AU,Currie AU,Darwin AU,Eucla AU," +
    "Hobart AU,LHI AU,Lindeman AU,Lord_Howe AU,Melbourne AU,NSW AU,North AU,Perth AU,Queensland AU,South AU," +
    "Sydney AU,Tasmania AU,Victoria AU,West AU,Yancowinna AU",
    "Europe:Amsterdam NL,Andorra AD,Astrakhan RU,Athens GR,Belfast GB,Belgrade RS,Berlin DE,Bratislava SK," +
    "Brussels BE,Bucharest RO,Budapest HU,Busingen DE,Chisinau MD,Copenhagen DK,Dublin IE,Gibraltar GI," +
    "Guernsey GG,Helsinki FI,Isle_of_Man IM,Istanbul TR,Jersey JE,Kaliningrad RU,Kiev UA,Kirov RU,Kyiv UA," +
    "Lisbon PT,Ljubljana SI,London GB,Luxembourg LU,Madrid ES,Malta MT,Mariehamn AX,Minsk BY,Monaco MC," +
    "Moscow RU,Nicosia CY,Oslo NO,Paris FR,Podgorica ME,Prague CZ,Riga LV,Rome IT,Samara RU,San_Marino SM," +
    "Sarajevo BA,Saratov RU,Simferopol UA,Skopje MK,Sofia BG,Stockholm SE,Tallinn EE,Tirane AL,Tiraspol MD," +
    "Ulyanovsk RU,Uzhgorod UA,Vaduz LI,Vatican VA,Vienna AT,Vilnius LT,Volgograd RU,Warsaw PL,Zagreb HR," +
    "Zaporozhye UA,Zurich CH",
    "Indian:Antananarivo MG,Chagos IO,Christmas CX,Cocos CC,Comoro KM,Kerguelen TF,Mahe SC,Maldives MV," +
    "Mauritius MU,Mayotte YT,Reunion RE",
    "Pacific:Apia WS,Auckland NZ,Bougainville PG,Chatham NZ,Chuuk FM,Easter CL,Efate VU,Enderbury KI," +
    "Fakaofo TK,Fiji FJ,Funafuti TV,Galapagos EC,Gambier PF,Guadalcanal SB,Guam GU,Honolulu US,Johnston UM," +
    "Kanton KI,Kiritimati KI,Kosrae FM,Kwajalein MH,Majuro MH,Marquesas PF,Midway UM,Nauru NR,Niue NU," +
    "Norfolk NF,Noumea NC,Pago_Pago AS,Palau PW,Pitcairn PN,Pohnpei FM,Ponape FM,Port_Moresby PG,Rarotonga CK," +
    "Saipan MP,Samoa AS,Tahiti PF,Tarawa KI,Tongatapu TO,Truk FM,Wake UM,Wallis WF,Yap FM"
  ];
  var tzCountryMap = null;
  function tzCountry(tz) {
    if (typeof tz !== "string" || !tz) return null;
    if (!tzCountryMap) {
      tzCountryMap = {};
      for (var i = 0; i < TZ_TABLE.length; i++) {
        var block = TZ_TABLE[i], colon = block.indexOf(":"), region = block.slice(0, colon);
        var pairs = block.slice(colon + 1).split(",");
        for (var j = 0; j < pairs.length; j++) {
          var sp = pairs[j].lastIndexOf(" ");
          tzCountryMap[region + "/" + pairs[j].slice(0, sp)] = pairs[j].slice(sp + 1);
        }
      }
    }
    return Object.prototype.hasOwnProperty.call(tzCountryMap, tz) ? tzCountryMap[tz] : null;
  }

  function timeZone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { return null; }
  }

  function matchIdFromPath(pathname, search) {
    var m = pathname.match(/\/match\/(\d{1,12})(\.html)?$/);
    if (m) return m[1];
    if (/\/match(\.html)?$/.test(pathname)) {
      var id = search && search.get("id");
      if (id && /^\d{1,12}$/.test(id)) return id;
    }
    return null;
  }

  var PAGE_VIEW_ID = randomId("p_");

  // ---------- Localisation approximative (pays / region / ville) ----------
  // /api/geo (Netlify Edge Function, netlify/edge-functions/geo.ts) renvoie
  // la localisation APPROXIMATIVE deduite du reseau, jamais l'adresse IP.
  // Appel UNE fois par onglet (resultat en sessionStorage, echec compris),
  // en tache de fond. La page_view attend au plus GEO_WAIT_MS, puis part
  // sans ville ; un depart de la page l'envoie immediatement. Tout echec est
  // silencieux : la page et le suivi continuent normalement.
  // 19/09/2026 : attente portee de 1,2 s a 4 s. Mesure en base : sur 87
  // visites, 18 premieres pages (surtout sur mobile, visiteurs restes 10 s a
  // plus d'une minute) partaient avant la reponse ; le pays n'arrivait
  // qu'avec la page suivante, et le tableau de bord (qui lit la PREMIERE page
  // vue) affichait « pays inconnu ». Reponse encore plus tardive : le pays
  // part avec le page_leave de cette page (une seule fois).
  var GEO_KEY = "iashark_geo_v1";
  var GEO_WAIT_MS = 4000;

  function cleanGeo(o) {
    if (!o || typeof o !== "object") return null;
    var text = function (v) {
      if (typeof v !== "string") return null;
      var s = v.replace(/[\u0000-\u001f\u007f<>"`]/g, "").replace(/\s+/g, " ").trim();
      return s ? s.slice(0, 60) : null;
    };
    var country = typeof o.country === "string" && /^[A-Z]{2}$/.test(o.country) ? o.country : null;
    var g = { country: country, region: text(o.region), city: text(o.city) };
    return g.country || g.region || g.city ? g : null;
  }

  // undefined = jamais demande dans cet onglet ; null = inconnu ou echec.
  function readGeoCache() {
    try {
      var raw = sessionStorage.getItem(GEO_KEY);
      if (raw === null) return undefined;
      return raw === "none" ? null : cleanGeo(JSON.parse(raw));
    } catch (e) {
      return undefined;
    }
  }

  function fetchGeo(done) {
    var finished = false;
    var finish = function (g) {
      if (finished) return;
      finished = true;
      try { sessionStorage.setItem(GEO_KEY, g ? JSON.stringify(g) : "none"); } catch (e) {}
      done(g);
    };
    try {
      if (typeof fetch !== "function") { finish(null); return; }
      fetch("/api/geo", { method: "GET", credentials: "omit", cache: "no-store" })
        .then(function (r) { return r && r.ok ? r.json() : null; })
        .then(function (d) {
          finish(d ? cleanGeo({ country: d.country, region: d.subdivision, city: d.city }) : null);
        }, function () { finish(null); });
    } catch (e) {
      finish(null);
    }
  }

  var pageViewMeta = null;
  var pageViewSent = false;
  var geoValue = null;
  var pageViewHadCountry = false;
  var lateGeo = null;

  function sendPageView(geo) {
    if (pageViewSent || !pageViewMeta) return;
    pageViewSent = true;
    try {
      if (geo) {
        if (geo.country) { pageViewMeta.geo_country = geo.country; pageViewHadCountry = true; }
        if (geo.region) pageViewMeta.geo_region = geo.region;
        if (geo.city) pageViewMeta.geo_city = geo.city;
      }
      window.iasharkTrack("page_view", pageViewMeta);
      // La page d'inscription vue = inscription commencee (toutes versions).
      if (/\/inscription(\.html)?$/.test(loc.pathname)) window.iasharkTrack("signup_started", {});
    } catch (e) {}
  }

  // ---------- page_view ----------
  try {
    var refHost = "";
    try { refHost = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) {}
    var externalRef = refHost && !PROD_HOSTS[refHost] ? refHost : null;

    var seq = null;
    try {
      seq = (parseInt(sessionStorage.getItem("iashark_visit_pages"), 10) || 0) + 1;
      sessionStorage.setItem("iashark_visit_pages", String(seq));
    } catch (e) { seq = null; }
    var landing = seq !== null ? seq === 1 : !refHost || !!externalRef;

    var tz = timeZone();
    var screenW = window.screen && window.screen.width ? Math.round(window.screen.width) : null;

    pageViewMeta = {
      pv: PAGE_VIEW_ID,
      seq: seq,
      landing: landing,
      ref: clip(externalRef, 80),
      utm_source: clip(params.get("utm_source"), 80),
      utm_medium: clip(params.get("utm_medium"), 80),
      utm_campaign: clip(params.get("utm_campaign"), 80),
      device: deviceType(),
      browser: browserName(),
      os: osName(),
      screen_w: screenW,
      lang: clip(nav.language, 16),
      tz: clip(tz, 48),
      country_guess: tzCountry(tz),
      match_id: matchIdFromPath(loc.pathname, params),
    };

    // La page_view attend (au plus GEO_WAIT_MS) la localisation et, pour un
    // inscrit dont le jeton a expire, son renouvellement par le client.
    var cachedGeo = readGeoCache();
    var geoReady = cachedGeo !== undefined;
    geoValue = geoReady ? cachedGeo : null;
    var idReady = sessionState() !== "stale";
    var sendWhenReady = function () { if (geoReady && idReady) sendPageView(geoValue); };
    if (!geoReady || !idReady) setTimeout(function () { sendPageView(geoValue); }, GEO_WAIT_MS);
    if (!geoReady) fetchGeo(function (g) {
      geoReady = true;
      geoValue = g;
      // page_view deja partie sans pays : il suivra avec le page_leave.
      if (pageViewSent && !pageViewHadCountry && g && g.country) lateGeo = g;
      sendWhenReady();
    });
    if (!idReady) refreshIdentity(function () { idReady = true; sendWhenReady(); });
    sendWhenReady();
  } catch (e) {
    sendPageView(null);
  }

  // ---------- page_leave : temps actif sur la page + profondeur de scroll ----------
  try {
    var visibleSince = document.visibilityState === "hidden" ? null : Date.now();
    var engagedMs = 0;
    var lastSentMs = -1;
    var leaveCount = 0;
    var maxScroll = 0;

    var measureScroll = function () {
      try {
        var de = document.documentElement;
        var height = Math.max(de.scrollHeight || 0, document.body ? document.body.scrollHeight || 0 : 0);
        var viewport = window.innerHeight || de.clientHeight || 0;
        var y = window.pageYOffset || de.scrollTop || 0;
        var pct = !height || height <= viewport ? 100 : Math.round(Math.min(1, (y + viewport) / height) * 100);
        if (pct > maxScroll) maxScroll = pct;
      } catch (e) {}
    };

    var scrollQueued = false;
    window.addEventListener("scroll", function () {
      if (scrollQueued) return;
      scrollQueued = true;
      setTimeout(function () { scrollQueued = false; measureScroll(); }, 250);
    }, { passive: true });
    window.addEventListener("load", function () { setTimeout(measureScroll, 1500); });

    var flushLeave = function () {
      // Depart avant la reponse de /api/geo : la page_view part d'abord (avec
      // la localisation si elle est deja connue).
      sendPageView(geoValue);
      if (visibleSince !== null) { engagedMs += Date.now() - visibleSince; visibleSince = null; }
      // pagehide suit souvent visibilitychange : pas de doublon si rien n'a change.
      if (engagedMs === lastSentMs || leaveCount >= 20) return;
      leaveCount++;
      lastSentMs = engagedMs;
      measureScroll();
      var leave = {
        pv: PAGE_VIEW_ID,
        sec: Math.min(14400, Math.round(engagedMs / 1000)),
        scroll: maxScroll,
      };
      if (lateGeo) {
        leave.geo_country = lateGeo.country;
        if (lateGeo.region) leave.geo_region = lateGeo.region;
        if (lateGeo.city) leave.geo_city = lateGeo.city;
        lateGeo = null;
      }
      window.iasharkTrack("page_leave", leave);
    };

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flushLeave();
      else if (visibleSince === null) visibleSince = Date.now();
    });
    window.addEventListener("pagehide", flushLeave);
  } catch (e) {}

  // ---------- click : actions significatives uniquement ----------
  try {
    var TARGET_PAGES = /\/(inscription|connexion|abonnement|pro|compte|landing)(\.html)?$/;
    var clickCount = 0;
    var lastClickKey = "";
    var lastClickAt = 0;

    // Libelle court : data-track d'abord, sinon texte visible nettoye. Jamais
    // d'adresse email (l'en-tete affiche une partie de l'email du compte).
    var labelOf = function (el, fallback) {
      var raw = el.getAttribute("data-track") || el.getAttribute("aria-label") || el.textContent || "";
      var text = String(raw).replace(/\S+@\S*/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
      return text || fallback || null;
    };

    var TRACK_KINDS = { home_banner_ready: true, home_row_lock: true, home_list_upsell: true, home_fav_add: true,
      // Page match (match-page.js, visiteur) : boutons « Debloquer » du panneau
      // d'analyse (mur Pro, 19/09/2026), de l'avis, du rappel apres les stats,
      // de l'analyse fermee, des reponses FAQ fermees et de la barre mobile
      // (tableau de bord : admin_unlock_clicks, 0025 puis 0029).
      match_gate_unlock: true, match_avis_unlock: true, match_recall_unlock: true, match_analysis_unlock: true, match_faq_unlock: true, match_bar_unlock: true,
      // Buteurs du jour de l'accueil (home-scorers.js) : bouton « Debloquer »
      // du panneau, ligne floutee, carte d'un buteur (avant le 19/09/2026 :
      // kind cta, label = meme valeur).
      home_scorers_unlock: true, home_scorers_locked_row: true, home_scorers_card: true };
    var classify = function (target) {
      if (!target || typeof target.closest !== "function") return null;
      var tracked = target.closest("[data-track]");
      if (tracked) {
        // kind dedie (liste fermee) : accueil (home-list.js) - banniere "analyses
        // pretes", cadenas d'une ligne verrouillee, rappel de la liste, favori
        // ajoute. Jamais de donnee personnelle : libelle fixe ou cle de competition.
        var kindAttr = tracked.getAttribute("data-track-kind");
        var info = { kind: TRACK_KINDS[kindAttr] ? kindAttr : "cta", label: labelOf(tracked) };
        var trackedHref = tracked.getAttribute("href");
        if (trackedHref && trackedHref.charAt(0) !== "#") {
          try {
            var tu = new URL(tracked.href, loc.href);
            if (tu.origin === loc.origin) {
              info.target = tu.pathname.slice(0, 120);
              var tid = matchIdFromPath(tu.pathname, tu.searchParams);
              if (tid) info.match_id = tid;
            }
          } catch (e) {}
        }
        return info;
      }

      var lang = target.closest(".lang-switch-item");
      if (lang) return { kind: "lang_switch", label: clip(lang.getAttribute("data-dir"), 8) };

      var button = target.closest("button");
      if (button) {
        var id = button.id || "";
        var cls = typeof button.className === "string" ? button.className : "";
        if (/^subscribe|checkout|^souscrire$/i.test(id) || /\b(pricing-cta|plan-btn)\b/.test(cls)) {
          // ready : bouton actif (case des conditions cochee, page chargee) ;
          // signed_in : une session est ouverte dans ce navigateur (sinon le
          // clic mene a l'inscription, pas au paiement). Jamais laquelle.
          return {
            kind: "checkout", label: labelOf(button), target: clip(id, 40),
            ready: !(button.disabled === true || button.getAttribute("aria-disabled") === "true"),
            signed_in: !!sessionUser(readStoredSession()),
          };
        }
        return null;
      }

      var link = target.closest("a[href]");
      if (!link) return null;
      var href = link.getAttribute("href") || "";
      if (!href || href.charAt(0) === "#" || /^(mailto|tel|javascript):/i.test(href)) return null;
      var url;
      try { url = new URL(link.href, loc.href); } catch (e) { return null; }
      if (url.origin !== loc.origin) return null;
      var matchId = matchIdFromPath(url.pathname, url.searchParams);
      if (matchId || /\/match(\.html)?$/.test(url.pathname)) {
        return { kind: "match", label: labelOf(link), target: url.pathname.slice(0, 120), match_id: matchId };
      }
      var page = url.pathname.match(TARGET_PAGES);
      if (!page) return null;
      // Le lien "compte" de l'en-tete porte l'identite : libelle fixe.
      var label = page[1] === "compte" ? "compte" : labelOf(link, page[1]);
      return { kind: page[1], label: label, target: url.pathname.slice(0, 120) };
    };

    document.addEventListener("click", function (event) {
      try {
        var info = classify(event.target);
        if (!info) return;
        var now = Date.now();
        var key = info.kind + "|" + info.label;
        if (clickCount >= 40 || (key === lastClickKey && now - lastClickAt < 1000)) return;
        clickCount++;
        lastClickKey = key;
        lastClickAt = now;
        info.pv = PAGE_VIEW_ID;
        window.iasharkTrack("click", info);
      } catch (e) {}
    }, true);

    // Case des conditions (CGV) cochee (lib/checkout-consent.js :
    // .iash-consent input[data-consent]) : une fois par page, jamais decochee.
    var consentSent = false;
    document.addEventListener("change", function (event) {
      try {
        var el = event.target;
        if (consentSent || !el || el.checked !== true || typeof el.closest !== "function") return;
        if (!el.getAttribute("data-consent") || !el.closest(".iash-consent")) return;
        consentSent = true;
        window.iasharkTrack("click", { kind: "checkout_consent", label: clip(el.getAttribute("data-consent"), 20), pv: PAGE_VIEW_ID });
      } catch (e) {}
    }, true);
  } catch (e) {}

  // ---------- gate_view : panneau « Debloquer » reellement vu ----------
  // Impression seulement (aucun clic, aucune donnee personnelle, jamais liee
  // a un compte) : le panneau (.gate de match-page.js, .hs-gate-card de
  // home-scorers.js) qui porte un bouton « Debloquer » suivi est visible au
  // moins a moitie (ou couvre la moitie de l'ecran) pendant 1 s. Une fois
  // par panneau et par page vue. Sans IntersectionObserver : rien.
  try {
    var GATE_OF_KIND = { match_gate_unlock: "match_pro", match_avis_unlock: "match_account", home_scorers_unlock: "home_scorers" };
    var GATE_DWELL_MS = 1000;
    var gatesSent = {};
    var gatesWatched = [];
    var sendGate = function (gate) {
      if (gatesSent[gate]) return;
      gatesSent[gate] = true;
      var md = { gate: gate, pv: PAGE_VIEW_ID };
      if (pageViewMeta && pageViewMeta.match_id && gate !== "home_scorers") md.match_id = pageViewMeta.match_id;
      window.iasharkTrack("gate_view", md);
    };
    var watchedOf = function (el) {
      for (var i = 0; i < gatesWatched.length; i++) if (gatesWatched[i].el === el) return gatesWatched[i];
      return null;
    };
    var gateObserver = typeof window.IntersectionObserver === "function" ? new window.IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var en = entries[i], w = watchedOf(en.target);
        if (!w || gatesSent[w.gate]) continue;
        var vh = window.innerHeight || 0;
        var rectH = en.intersectionRect ? en.intersectionRect.height : 0;
        w.shown = !!en.isIntersecting && (en.intersectionRatio >= 0.5 || (vh > 0 && rectH >= vh * 0.5));
        if (w.shown && !w.timer) {
          w.timer = setTimeout((function (x) { return function () { x.timer = null; if (x.shown) sendGate(x.gate); }; })(w), GATE_DWELL_MS);
        } else if (!w.shown && w.timer) {
          clearTimeout(w.timer);
          w.timer = null;
        }
      }
    }, { threshold: [0, 0.25, 0.5, 0.75, 1] }) : null;
    var scanGates = function () {
      if (!gateObserver || typeof document.querySelectorAll !== "function") return;
      var nodes = document.querySelectorAll("[data-track-kind]");
      for (var i = 0; i < nodes.length && gatesWatched.length < 20; i++) {
        var gate = GATE_OF_KIND[nodes[i].getAttribute("data-track-kind")];
        if (!gate || gatesSent[gate]) continue;
        var box = (typeof nodes[i].closest === "function" && nodes[i].closest(".gate, .hs-gate-card")) || nodes[i];
        if (watchedOf(box)) continue;
        gatesWatched.push({ el: box, gate: gate, timer: null, shown: false });
        gateObserver.observe(box);
      }
    };
    if (gateObserver) {
      // Panneaux dessines apres le chargement des donnees (match-page.js,
      // home-scorers.js) : nouvelle recherche au plus toutes les 400 ms,
      // pendant la premiere minute de la page.
      var scanQueued = false;
      var queueScan = function () {
        if (scanQueued) return;
        scanQueued = true;
        setTimeout(function () { scanQueued = false; scanGates(); }, 400);
      };
      if (typeof window.MutationObserver === "function" && document.documentElement) {
        var gateMutations = new window.MutationObserver(queueScan);
        gateMutations.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(function () { try { gateMutations.disconnect(); } catch (e) {} }, 60000);
      }
      queueScan();
      window.addEventListener("load", queueScan);
    }
  } catch (e) {}
})();
