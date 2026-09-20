"use strict";
// ONGLET « HIER » (20/09/2026, demande du proprietaire).
//
// Regles verifiees ici :
//   - meme rendu que les autres jours (memes competitions, memes lignes) ;
//   - la SEULE chose qui s'ajoute est un liseré vert (recommandation passee)
//     ou rouge (non passee) ; ni score, ni pari, ni cote ;
//   - un match non regle ne prend aucune couleur ;
//   - les matchs sans recommandation ne sont pas listes du tout ;
//   - aucune donnee payante n'est lue sur une ligne passee, meme pour un abonne ;
//   - l'onglet ne s'ouvre jamais tout seul : on arrive sur aujourd'hui.
const test = require("node:test");
const assert = require("node:assert/strict");
const HL = require("../home-list.js");

const fichier = (lignes) => ({ day: "2026-09-19", matches: lignes });
const ligne = (extra) => Object.assign({
  id: 1575507, home: "Nacional", away: "Famalicão", home_id: 228, away_id: 242,
  league: "Primeira Liga", league_key: "primeira", kickoff: "2026-09-19 21:30",
  pick: "Plus de 1.5 buts", cote: 1.32, score: "2-1", result: "win",
}, extra || {});

const helpers = () => Object.assign(HL.defaultHelpers(), {
  leagueName: (m) => m.league || m.league_key,
  leagueCountry: () => "", leagueFlag: () => "", leagueLogoUrl: () => null,
  teamLogoUrl: (tm) => (tm && tm.id ? "https://media.api-sports.io/football/teams/" + tm.id + ".png" : null),
  heure: () => "21:30", matchTimestamp: () => Date.parse("2026-09-19T19:30:00Z"),
  matchDay: (m) => String(m.date || "").slice(0, 10), lien: (p) => "/" + p,
});
const ctx = () => ({
  isPro: true, hasAccount: true, freeMatchId: null, simulations: 5000,
  favorites: { has: () => false }, favMatches: { has: () => false, list: () => [] },
  collapsed: {}, nowTs: Date.parse("2026-09-20T08:00:00Z"),
});

test("liseré : vert si la recommandation est passée, rouge sinon, rien si non réglée", () => {
  const H = helpers();
  const gagne = HL.renderMatchRow(HL.veilleListe(fichier([ligne()]))[0], ctx(), H, 0);
  assert.match(gagne, /class="hl-row hl-grid is-past[^"]*hl-win"/);
  const perdu = HL.renderMatchRow(HL.veilleListe(fichier([ligne({ result: "loss" })]))[0], ctx(), H, 0);
  assert.match(perdu, /hl-loss"/);
  for (const r of ["pending", "void", "", undefined]) {
    const neutre = HL.renderMatchRow(HL.veilleListe(fichier([ligne({ result: r })]))[0], ctx(), H, 0);
    assert.doesNotMatch(neutre, /hl-win|hl-loss/, "couleur posée sans verdict (" + r + ")");
  }
});

test("la ligne d'hier ne porte ni pari, ni cote, ni score, meme pour un abonne", () => {
  const H = helpers();
  const html = HL.renderMatchRow(HL.veilleListe(fichier([ligne()]))[0], ctx(), H, 0);
  assert.doesNotMatch(html, /Plus de 1\.5|1,32|1\.32|2-1|Pari retenu|Marché/);
  assert.match(html, /Nacional/);
  assert.match(html, /media\.api-sports\.io\/football\/teams\/228\.png/, "écusson absent");
  // Le verdict est aussi dit en toutes lettres pour un lecteur d'écran.
  assert.match(html, /Recommandation passée\./);
});

test("aucune donnée payante lue sur une ligne passée", () => {
  const H = helpers();
  const entree = HL.veilleListe(fichier([ligne()]))[0];
  const piege = new Proxy(Object.assign({}, entree, { conf: 7.7, pari_rec: "SECRET", market_id: "over15" }), {
    get(cible, cle) {
      if (["conf", "pari_rec", "market_id", "cote_rec", "p1", "po25"].includes(cle)) {
        throw new Error("champ payant lu sur une ligne passée : " + String(cle));
      }
      return cible[cle];
    },
  });
  assert.doesNotThrow(() => HL.renderMatchRow(piege, ctx(), H, 0));
});

test("les matchs sans recommandation ne sont pas listés", () => {
  const liste = HL.veilleListe(fichier([ligne(), { id: 2, no_signal: true }, { id: 3 }, ligne({ id: 4, home: "", away: "" })]));
  assert.deepEqual(liste.map((m) => m.id), ["1575507"]);
});

test("l'appel « voir hier » compte les réglées seulement, et disparaît sur l'onglet Hier", () => {
  const liste = HL.veilleListe(fichier([ligne(), ligne({ id: 2, result: "loss" }), ligne({ id: 3, result: "pending" })]));
  const appel = HL.veilleAppel(liste, "2026-09-20", "2026-09-19");
  assert.match(appel, /Hier : 1 recommandations passées sur 2/);
  assert.equal(HL.veilleAppel(liste, "2026-09-19", "2026-09-19"), "", "l'appel reste affiché sur l'onglet Hier");
  assert.equal(HL.veilleAppel([], "2026-09-20", "2026-09-19"), "");
});
