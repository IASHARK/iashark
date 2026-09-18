"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pickFreeMatchId, pickFreeMatch } = require("../lib/free-match.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// BUG REEL corrige le 03/09/2026. L'accueil choisissait sa vitrine avec
// getChoc() et la page match decidait du match gratuit avec son propre
// pickFreeMatchId(). Les deux ne tombaient pas d'accord : le bouton
// "Voir le match gratuit du jour" envoyait vers un match que la page match
// considerait comme payant, et le visiteur se prenait le mur d'abonnement
// juste apres qu'on lui ait promis du gratuit.
test("le match gratuit vient d'une seule source, partagee par les deux pages", () => {
  const accueil = read("index.html");
  const pageMatch = read("match-page.js");
  assert.match(accueil, /IasharkFreeMatch\.pickFreeMatch\(/, "l'accueil doit appeler le module partage");
  assert.match(pageMatch, /IasharkFreeMatch\.pickFreeMatchId\(/, "la page match doit appeler le module partage");
  assert.doesNotMatch(accueil, /function getChoc\(/, "l'ancien selecteur concurrent ne doit pas revenir");
  assert.doesNotMatch(pageMatch, /function pickFreeMatchId\(/, "la copie locale ne doit pas revenir");
  assert.match(accueil, /lib\/free-match\.js/, "l'accueil doit charger le module");
});

const horloge = { day: "2026-09-02", now: "2026-09-02 10:00" };
const m = (id, date, extra) => Object.assign({ id, date }, extra || {});

test("prefere un match reellement analyse plutot qu'un match sans signal", () => {
  const list = [
    m(1, "2026-09-02 20:00", { data_quality_score: 90 }),                        // aucun signal
    m(2, "2026-09-02 21:00", { pari_rec: "Over 2.5", data_quality_score: 60 })   // analyse
  ];
  assert.equal(pickFreeMatchId(list, horloge), 2);
});

test("no_signal exclut le match, meme s'il porte un pari_rec", () => {
  const list = [
    m(1, "2026-09-02 20:00", { pari_rec: "Over 2.5", no_signal: true, data_quality_score: 90 }),
    m(2, "2026-09-02 21:00", { pari_rec: "BTTS Oui", data_quality_score: 50 })
  ];
  assert.equal(pickFreeMatchId(list, horloge), 2);
});

test("a defaut de match analyse aujourd'hui, va chercher un autre jour plutot que de ne rien montrer", () => {
  const list = [
    m(1, "2026-09-02 20:00"),                                     // aujourd'hui, sans signal
    m(2, "2026-09-03 18:00", { pari_rec: "Under 2.5" })  // demain, analyse
  ];
  assert.equal(pickFreeMatchId(list, horloge), 2);
});

test("si vraiment aucun match n'a de signal, montre quand meme un match plutot que rien", () => {
  const list = [m(1, "2026-09-02 20:00", { data_quality_score: 40 }), m(2, "2026-09-02 22:00", { data_quality_score: 80 })];
  assert.equal(pickFreeMatchId(list, horloge), 2);
});

test("liste vide ou absente -> null, jamais une exception", () => {
  assert.equal(pickFreeMatchId([], horloge), null);
  assert.equal(pickFreeMatchId(null, horloge), null);
  assert.equal(pickFreeMatch(undefined, horloge), null);
});

// 15/09/2026 : conf (note sur 10 = probabilite du modele / 10) et edge sont
// premium. Le repli heuristique ne classe que sur un critere PUBLIC
// (data_quality_score) : meme choix pour un visiteur et un abonne Pro, et
// l'ordre ne trahit jamais la probabilite.
test("repli heuristique : classe par qualite des donnees publique, jamais par conf ni edge", () => {
  const list = [
    m(1, "2026-09-02 20:00", { pari_rec: "A", conf: 9.5, edge: 40, data_quality_score: 55 }),
    m(2, "2026-09-02 21:00", { pari_rec: "B", conf: 3, edge: 2, data_quality_score: 80 })
  ];
  assert.equal(pickFreeMatchId(list, horloge), 2);
  const FM = require("../lib/free-match.js");
  assert.equal(FM.score({ conf: 9, edge: 30 }), 0, "sans donnee publique : score neutre");
  assert.equal(FM.score({ conf: 9, data_quality_score: 70 }), FM.score({ conf: 1, data_quality_score: 70 }));
});

// 13/09/2026 : le match offert restait celui de la veille jusqu'au passage
// suivant du pipeline (08:00). Le pipeline designe desormais une analyse
// offerte par jour ; a minuit le site prend celle du nouveau jour.
test("plusieurs matchs designes : prend celui du jour, puis le prochain a venir", () => {
  const list = [
    m(1, "2026-09-02 21:00", { is_free: true, pari_rec: "A" }),
    m(2, "2026-09-03 21:00", { is_free: true, pari_rec: "B" })
  ];
  assert.equal(pickFreeMatchId(list, { day: "2026-09-02", now: "2026-09-02 20:59" }), 1);
  // 18/09/2026 (decision du proprietaire) : le match offert du jour le reste
  // jusqu'a minuit, meme commence ou termine ; a minuit, celui du lendemain.
  assert.equal(pickFreeMatchId(list, { day: "2026-09-02", now: "2026-09-02 21:30" }), 1, "commence : toujours offert");
  assert.equal(pickFreeMatchId(list, { day: "2026-09-02", now: "2026-09-02 23:59" }), 1, "termine, avant minuit : toujours offert");
  assert.equal(pickFreeMatchId(list, { day: "2026-09-03", now: "2026-09-03 00:01" }), 2);
  assert.equal(pickFreeMatchId(list, { day: "2026-09-01", now: "2026-09-01 12:00" }), 1);
});

// 16/09/2026 (maquette v2 validee) : le match offert reste dans sa competition,
// avec la puce « Offert », et la liste recoit le MEME identifiant que la vitrine.
test("l'accueil laisse le match offert dans sa competition (puce Offert) et se re-rend a minuit", () => {
  const accueil = read("index.html");
  assert.doesNotMatch(accueil, /list=list\.filter\(function\(m\)\{return String\(m\.id\)!==String\(freeMatchId\);\}\)/);
  assert.match(accueil, /homeList\.setData\(getSportMatchs\(\),\{freeMatchId:freeMatchId,isPro:proConfirme,hasAccount:!!\(authCtx&&authCtx\.session\)\}\)/);
  assert.doesNotMatch(accueil, /ordonnee\.unshift\(/);
  assert.match(accueil, /setInterval\(function\(\)\{var j=getTodayStr\(\)/);
  assert.match(read("home-list.js"), /if\(a\.free\)tags\.push\('<span class="hl-tag hl-tag-free">'/);
});

// 13/09/2026 : offre gratuite PAR PAYS. Le Mexique voyait un match de Premier
// League ; il doit voir un match Liga MX (free_markets ["mx"]), l'Afrique du
// Sud un match PSL (["za"]). Repli sur l'offre generale sinon.
const general = m(10, "2026-09-02 21:00", { is_free: true, pari_rec: "A", free_markets: ["default"] });
// 22:30 (et non 03:00) : a 10:00, un match de 03:00 est deja joue et ne peut plus etre offert (16/09/2026).
const mxDuJour = m(11, "2026-09-02 22:30", { is_free: true, pari_rec: "B", free_markets: ["mx"] });
const mxDemain = m(12, "2026-09-03 03:00", { is_free: true, pari_rec: "C", free_markets: ["mx"] });
const zaDuJour = m(13, "2026-09-02 15:00", { is_free: true, pari_rec: "D", free_markets: ["za"] });

test("marche pays : prefere la designation du marche pour le jour courant", () => {
  const list = [general, mxDuJour, mxDemain, zaDuJour];
  assert.equal(pickFreeMatchId(list, horloge, "mx"), 11);
  assert.equal(pickFreeMatchId(list, horloge, "za"), 13);
});

test("marche pays : sans designation du jour, prend la prochaine du marche", () => {
  const list = [general, mxDemain];
  assert.equal(pickFreeMatchId(list, horloge, "mx"), 12);
});

test("marche pays : aucune designation pour ce marche -> offre generale (repli)", () => {
  const list = [general, mxDuJour];
  assert.equal(pickFreeMatchId(list, horloge, "za"), 10);
  assert.equal(pickFreeMatchId(list, horloge, "gb"), 10);
  assert.equal(pickFreeMatchId(list, horloge, "fr"), 10);
});

test("sans marche : comportement inchange, une offre reservee a un pays n'est jamais l'offre generale", () => {
  const list = [mxDuJour, zaDuJour, general];
  assert.equal(pickFreeMatchId(list, horloge), 10);
  assert.equal(pickFreeMatchId(list, horloge, null), 10);
  // un match peut porter plusieurs marches
  const partage = m(20, "2026-09-02 22:00", { is_free: true, pari_rec: "E", free_markets: ["default", "mx"] });
  assert.equal(pickFreeMatchId([partage], horloge, "mx"), 20);
  assert.equal(pickFreeMatchId([partage], horloge), 20);
  // fichier anterieur sans free_markets : toujours general
  assert.equal(pickFreeMatchId([m(30, "2026-09-02 20:00", { is_free: true, pari_rec: "F" })], horloge, "mx"), 30);
  // seules des offres pays existent : on ne montre pas rien pour autant
  assert.equal(pickFreeMatchId([mxDuJour], horloge), 11);
});

test("l'accueil et la page match passent le meme marche au module partage", () => {
  const marche = "(window.IASHARK_MARKET&&window.IASHARK_MARKET.code)||null";
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  assert.match(read("index.html"), new RegExp(esc("IasharkFreeMatch.pickFreeMatch(getSportMatchs(),null," + marche + ")")));
  assert.match(read("match-page.js"), new RegExp(esc("IasharkFreeMatch.pickFreeMatchId(list,null," + marche + ")")));
  for (const dir of ["gb", "za", "mx"]) {
    assert.match(read(dir + "/index.html"), new RegExp(esc("pickFreeMatch(getSportMatchs(),null," + marche + ")")), dir + "/index.html");
  }
});

// 18/09/2026 (decision du proprietaire, remplace la regle du 16/09) : la
// designation du jour reste offerte jusqu'a minuit, meme deja jouee ; une
// designation d'un jour passe ne l'est jamais, un match non designe non plus.
test("match offert : celui du jour jusqu'a minuit, jamais un jour passe ni un match non designe", () => {
  const h = { day: "2026-09-02", now: "2026-09-02 21:30" };
  assert.equal(pickFreeMatchId([m(1, "2026-09-02 00:00", { is_free: true, pari_rec: "A" })], h), 1, "designation du jour deja jouee : offerte jusqu'a minuit");
  assert.equal(pickFreeMatchId([m(1, "2026-09-01 21:00", { is_free: true, pari_rec: "A" })], h), null, "designation de la veille : plus offerte");
  assert.equal(pickFreeMatchId([m(1, "2026-09-02 00:00", { is_free: true, pari_rec: "A" }), m(3, "2026-09-02 22:00", { pari_rec: "C", data_quality_score: 99 })], h), 1, "jamais un match non designe a la place");
  assert.equal(pickFreeMatchId([m(1, "2026-09-02 21:00", { pari_rec: "A", data_quality_score: 90 }), m(2, "2026-09-02 22:00", { pari_rec: "B", data_quality_score: 10 })], h), 2, "repli : match a venir seulement");
  assert.equal(pickFreeMatchId([m(1, "2026-09-02 21:00", { pari_rec: "A" })], h), null);
});

test("match offert sans compte : l'accueil suit la regle de la page match (compte gratuit exige)", () => {
  const accueil = read("index.html");
  assert.match(read("match-page.js"), /if\(isFree&&!ctx\.session\)\{renderAuthWall\(raw\);return;\}/);
  assert.match(accueil, /var ouvert=!!\(authCtx&&authCtx\.session\);/);
  assert.match(accueil, /home_app\.free_gate_text/);
  assert.match(read("home-list.js"), /if\(free&&!ctx\.isPro&&!ctx\.hasAccount\)return \{state:'gated',free:true\};/);
});
