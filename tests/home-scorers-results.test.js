"use strict";
// « Buteurs du jour » de la veille (home-scorers.js, docs/SPEC_RESULTATS_HIER.md,
// 20/09/2026). Le match est termine : le nom du joueur est visible pour tout le
// monde, le verdict se lit sans la couleur seule, et rien n'est invente quand
// le resultat n'est pas connu. Aujourd'hui et demain ne changent pas.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const HS = require("../home-scorers.js");

const H = HS.defaultHelpers();
const scorer = (extra) => Object.assign({
  match_id: 1575507, match: "Nacional - Famalicão", player: "João Silva", goals: 1, result: "win",
}, extra || {});
const strip = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, " ").replace(/<[^>]+>/g, " ");

test("veille : nom visible, « A marqué » / « N’a pas marqué » avec libelle ET icone", () => {
  const html = HS.renderResultList([scorer(), scorer({ match_id: 2, player: "Max Weber", goals: 0, result: "loss" })], H);
  assert.match(html, /<h3 class="hs-name">João Silva<\/h3>/, "le nom reste flouté alors que le match est terminé");
  assert.match(html, /<h3 class="hs-name">Max Weber<\/h3>/);
  assert.doesNotMatch(html, /hs-blurred|hs-prob-fake|Xxxxxx/, "contenu flouté sur des matchs terminés");
  assert.match(html, /class="hs-card hs-rcard is-win"/);
  assert.match(html, /class="hs-card hs-rcard is-loss"/);
  const win = html.match(/<span class="hs-verdict is-win">[\s\S]*?<\/span><\/span>/)[0];
  assert.match(win, /<svg class="hs-v-ico"/, "icone du verdict absente");
  assert.match(win, /<span class="hs-verdict-t">A marqué<\/span>/);
  const loss = html.match(/<span class="hs-verdict is-loss">[\s\S]*?<\/span><\/span>/)[0];
  assert.match(loss, /<span class="hs-verdict-t">N’a pas marqué<\/span>/);
  // Buts reels seulement (jamais un chiffre pour un joueur qui n'a pas marque).
  assert.match(html, /<span class="hs-stats"><span>1 but<\/span><\/span>/);
  assert.equal((html.match(/hs-stats/g) || []).length, 1);
  // Aucune probabilite : le match est joue, on montre ce qui s'est passe.
  assert.doesNotMatch(strip(html), /%|Pro\b/);
  assert.match(html, /href="\/match\.html\?id=1575507"/);
  // Bordure + fond teinte, memes couleurs que la liste des matchs.
  const css = fs.readFileSync(path.join(root, "assets/home-scorers.css"), "utf8");
  assert.match(css, /--hs-win:#34d399;--hs-win-wash:rgba\(52,211,153,\.10\)/);
  assert.match(css, /--hs-loss:#fb8a8a;--hs-loss-wash:rgba\(251,138,138,\.10\)/);
  assert.match(css, /\.hs-rcard\.is-win \.hs-link\{box-shadow:inset 3px 0 0 var\(--hs-win\);background:var\(--hs-win-wash\)/);
});

test("veille : resultat inconnu = neutre, entree incomplete ignoree, 3 joueurs au maximum", () => {
  const neutre = HS.renderResultList([scorer({ result: "pending", goals: null })], H);
  assert.match(neutre, /hs-rcard is-pending/);
  assert.match(neutre, /<span class="hs-verdict-t">En attente<\/span>/);
  assert.doesNotMatch(neutre, /is-win|is-loss|hs-stats/, "un buteur sans resultat connu ne doit pas etre colore");
  assert.equal(HS.cleanScorer({ match_id: 1, result: "win" }), null, "sans nom : aucune ligne");
  assert.equal(HS.cleanScorer({ player: "X", result: "win" }), null, "sans match : aucune ligne");
  assert.equal(HS.cleanScorer({ match_id: "1x", player: "X" }), null);
  assert.equal(HS.cleanScorer(scorer({ result: "n'importe quoi" })).result, "pending");
  assert.equal(HS.cleanScorers([scorer(), scorer({ match_id: 2 }), scorer({ match_id: 3 }), scorer({ match_id: 4 })]).length, 3);
  assert.deepEqual(HS.cleanScorers(null), []);
});

test("aujourd'hui et demain : le verrou ne bouge pas (lignes floutees, panneau « Débloquer »)", () => {
  const entree = { match_id: "1575507", match_rank: 0, league: "Primeira Liga", kickoff: "2026-09-20 21:30" };
  const clock = { day: "2026-09-20", tomorrow: "2026-09-21" };
  const locked = HS.renderList([entree], { isPro: false, hasSession: true }, null, () => null, H, clock);
  assert.match(locked, /hs-card is-locked/);
  assert.match(locked, /hs-blurred/);
  assert.match(locked, /Joueur réservé aux abonnés Pro/);
  assert.doesNotMatch(locked, /hs-verdict|A marqué/, "le verdict de la veille a fui sur un match a venir");
  assert.match(HS.renderGate(), /Débloque les 3 buteurs du jour/);
});

test("i18n : libelles des buteurs de la veille dans les 7 langues", () => {
  const fr = JSON.parse(fs.readFileSync(path.join(root, "i18n/dict/fr.json"), "utf8")).home_scorers;
  const cles = ["res_scored", "res_missed", "res_void", "res_wait", "goals_one", "goals_many", "subtitle_yesterday", "note_results", "list_aria_results"];
  for (const loc of ["fr", "en", "es", "es-mx", "de", "it", "pt"]) {
    const d = JSON.parse(fs.readFileSync(path.join(root, "i18n/dict/" + loc + ".json"), "utf8")).home_scorers;
    for (const k of cles) {
      assert.equal(typeof d[k], "string", loc + " : home_scorers." + k + " absent");
      assert.ok(d[k].trim(), loc + " : home_scorers." + k + " vide");
      const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(",");
      assert.equal(ph(d[k]), ph(fr[k]), loc + " : placeholders de home_scorers." + k);
      if (loc !== "fr") assert.notEqual(d[k], fr[k], loc + " : home_scorers." + k + " est encore en français");
    }
    // La mention obligatoire suit les resultats partout.
    assert.ok(d.note_results.length > 30, loc + " : note_results trop courte");
  }
});
