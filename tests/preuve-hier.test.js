"use strict";
// PREUVE « HIER » (lib/preuve-hier.js) : la ligne de l'accueil et de la page Pro, tiree du seul preuves/bilan-hier.json.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
function charger() {
  const G = { Intl, Date, Number, String };
  G.window = G;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "lib/preuve-hier.js"), "utf8"), G);
  return G.IasharkPreuveHier;
}
const NOW = new Date(2026, 9, 23, 8, 30).getTime(); // 8 h 30 chez le visiteur : sa veille est le 22/10
const bilan = (o) => Object.assign({ version: 1, jour: "2026-10-22", offert: null, selection_or: null }, o);

test("veille du visiteur, jour calendaire : juste apres minuit et le jour du changement d'heure", () => {
  const P = charger();
  assert.equal(P.hierLocal(new Date(2026, 9, 23, 8, 30).getTime()), "2026-10-22");
  assert.equal(P.hierLocal(new Date(2026, 9, 23, 0, 30).getTime()), "2026-10-22");
  assert.equal(P.hierLocal(new Date(2027, 2, 29, 0, 30).getTime()), "2027-03-28", "lundi 29/03/2027 0 h 30 : la veille est le 28, pas le 27");
  assert.equal(P.hierLocal(new Date(2026, 0, 1, 10, 0).getTime()), "2025-12-31");
});

test("gagne et perdu dits pareil ; Selection en or en « gagnes sur regles » ; rien a regler : pas de ligne", () => {
  const P = charger();
  const o = { match: "Bayern Munich - Arsenal", pari: "Over 2.5", cote: 1.62, resultat: "gagne" };
  assert.equal(P.texte(bilan({ offert: o })), "Hier, le pari offert sur Bayern Munich - Arsenal (cote 1,62) est passé.");
  assert.equal(P.texte(bilan({ offert: Object.assign({}, o, { resultat: "perdu" }), selection_or: { gagnes: 1, regles: 3, total: 3 } })),
    "Hier, le pari offert sur Bayern Munich - Arsenal (cote 1,62) n’est pas passé. Sélection en or : 1 sur 3.");
  assert.equal(P.texte(bilan({ selection_or: { gagnes: 2, regles: 3, total: 3 } })), "Hier, Sélection en or : 2 sur 3.");
  assert.equal(P.texte(bilan({ offert: Object.assign({}, o, { resultat: "en_attente" }), selection_or: { gagnes: 0, regles: 0, total: 3 } })), "");
  assert.equal(P.texte(bilan({ selection_or: { gagnes: 2, regles: 2, annules: 1, total: 3 } })), "Hier, Sélection en or : 2 sur 2, 1 match annulé.");
  assert.equal(P.texte(bilan({ offert: Object.assign({}, o, { match: "<b>x</b>" }) })), "Hier, le pari offert sur &lt;b&gt;x&lt;/b&gt; (cote 1,62) est passé.");
});

test("traductions chargees avant d'ecrire la ligne (jamais une ligne en francais sur les autres versions)", () => {
  const js = fs.readFileSync(path.join(ROOT, "lib/preuve-hier.js"), "utf8");
  assert.match(js, /G\.I18N\.init\(\)/);
  assert.match(js, /Promise\.all\(\[bilan, dico\]\)/);
});

test("jamais un vieux bilan : seulement le fichier de la veille", () => {
  const P = charger();
  const el = { hidden: true, innerHTML: "" };
  const b = bilan({ offert: { match: "A - B", cote: 1.5, resultat: "gagne" } });
  assert.equal(P.monter([el], Object.assign({}, b, { jour: "2026-10-21" }), NOW), 0);
  assert.equal(el.hidden, true);
  assert.equal(P.monter([el], b, NOW), 1);
  assert.equal(el.hidden, false);
  assert.match(el.innerHTML, /A - B/);
});

test("accueil et page Pro, toutes les versions : un emplacement cache et le script ; textes dans les 7 langues", () => {
  ["", "fr/", "en/", "es/", "gb/", "mx/", "za/"].forEach((d) => {
    ["index.html", "pro.html"].forEach((f) => {
      const s = fs.readFileSync(path.join(ROOT, d + f), "utf8");
      assert.equal((s.match(/data-preuve-hier hidden/g) || []).length, 1, d + f);
      assert.match(s, /<script src="\/lib\/preuve-hier\.js" defer><\/script>/, d + f);
    });
  });
  ["fr", "en", "es", "es-mx", "de", "it", "pt"].forEach((l) => {
    const d = require("../i18n/dict/" + l + ".json").preuve_hier;
    ["offert_gagne", "offert_perdu", "or", "or_seule", "or_annules", "or_seule_annules", "annule_n"].forEach((k) => assert.ok(d && typeof d[k] === "string" && d[k].includes("{"), l + " " + k));
    assert.ok(typeof d.annule_1 === "string" && d.annule_1.length > 3, l + " annule_1");
    assert.doesNotMatch(JSON.stringify(d), /\bX\b|twitter|garanti|mise|apuesta gratis|scommessa gratuita|aposta gr[aá]tis|free bet/i, l);
  });
});
