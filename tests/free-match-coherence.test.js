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
const m = (id, date, extra) => Object.assign({ id, date, conf: 5 }, extra || {});

test("prefere un match reellement analyse plutot qu'un match sans signal", () => {
  const list = [
    m(1, "2026-09-02 20:00", { conf: 9 }),                        // aucun signal
    m(2, "2026-09-02 21:00", { pari_rec: "Over 2.5", conf: 6 })   // analyse
  ];
  assert.equal(pickFreeMatchId(list, horloge), 2);
});

test("no_signal exclut le match, meme s'il porte un pari_rec", () => {
  const list = [
    m(1, "2026-09-02 20:00", { pari_rec: "Over 2.5", no_signal: true, conf: 9 }),
    m(2, "2026-09-02 21:00", { pari_rec: "BTTS Oui", conf: 5 })
  ];
  assert.equal(pickFreeMatchId(list, horloge), 2);
});

test("a defaut de match analyse aujourd'hui, va chercher un autre jour plutot que de ne rien montrer", () => {
  const list = [
    m(1, "2026-09-02 20:00"),                                     // aujourd'hui, sans signal
    m(2, "2026-09-03 18:00", { pari_rec: "Under 2.5", conf: 7 })  // demain, analyse
  ];
  assert.equal(pickFreeMatchId(list, horloge), 2);
});

test("si vraiment aucun match n'a de signal, montre quand meme un match plutot que rien", () => {
  const list = [m(1, "2026-09-02 20:00", { conf: 4 }), m(2, "2026-09-02 22:00", { conf: 8 })];
  assert.equal(pickFreeMatchId(list, horloge), 2);
});

test("liste vide ou absente -> null, jamais une exception", () => {
  assert.equal(pickFreeMatchId([], horloge), null);
  assert.equal(pickFreeMatchId(null, horloge), null);
  assert.equal(pickFreeMatch(undefined, horloge), null);
});

// L'ecart prime sur la confiance brute. Attention : normEdge() traite une
// valeur <= 10 comme une echelle sur 10 (donc x10) et au-dessus comme un
// pourcentage. Ce test compare donc deux ecarts sur la MEME echelle, sinon
// il testerait l'heuristique de normalisation et non le classement.
test("classe par ecart modele/marche quand il existe, pas par la confiance brute", () => {
  const list = [
    m(1, "2026-09-02 20:00", { pari_rec: "A", conf: 9, edge: 12 }),
    m(2, "2026-09-02 21:00", { pari_rec: "B", conf: 3, edge: 25 })
  ];
  assert.equal(pickFreeMatchId(list, horloge), 2);
});
