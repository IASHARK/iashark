"use strict";
// Finitions de l'interface (04/10/2026) : controles de l'avocat du diable et du mathematicien sur
// la PR 114, decisions de Clement (match offert, essai de 7 jours, conseil financier).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const MS = require("../lib/match-sections.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("« Et si... ? » : jamais 0 % ni 100 % (moins de 5 %, plus de 95 %)", () => {
  const nb = (s) => s.replace(/[  ]/g, " ");
  assert.equal(nb(MS.pcSi(0)), "moins de 5 %");
  assert.equal(nb(MS.pcSi(100)), "plus de 95 %");
  assert.equal(nb(MS.pcSi(5)), "5 %");
  assert.equal(nb(MS.pcSi(95)), "95 %");
  assert.equal(nb(MS.pcSi(40)), "40 %");
  const src = read("lib/match-sections.js");
  assert.doesNotMatch(src, /data-e-v="' \+ i \+ '">' \+ esc\(pc\(/, "valeur initiale par pcSi");
  assert.match(src, /el\.textContent = pcSi\(v\[i\]\)/, "valeur au changement d'onglet par pcSi");
  assert.match(src, /!siExact\(v\[i\]\)/, "aucun ecart affiche pour « moins de 5 % » / « plus de 95 % »");
});

test("« Qui ouvre le score » : la barre seulement si domicile ET exterieur sont entre 20 et 80 %", () => {
  const pb = (dom, ext, aucun) => MS.premierBut({ premier_but: { dom, ext, aucun } });
  assert.deepEqual(pb(45, 30, 25), [45, 25, 30]);
  assert.deepEqual(pb(20, 72, 8), [20, 8, 72]);
  assert.equal(pb(15, 60, 25), null, "domicile sous 20 %");
  assert.equal(pb(81, 12, 7), null, "domicile au-dessus de 80 %");
  assert.equal(pb(62, 19, 19), null, "exterieur sous 20 %");
});

test("garde vuePro : « 10 000 fois » et les jumeaux, comme le film et le premier but", () => {
  const vm = { identity: { home: { name: "A" }, away: { name: "B" } }, model: {} };
  const raw = { sim_resume: { base: 10000, issues: { dom: 4500, nul: 2800, ext: 2700 }, scores: [], total_buts: [] } };
  assert.equal(MS.simulation({ raw, vm, vuePro: false, verrouPro: false, dit: MS.registre() }), "");
  assert.match(MS.simulation({ raw, vm, vuePro: true, verrouPro: false, dit: MS.registre() }), /Si ce match se jouait 10 000 fois/);
  assert.equal(MS.jumeaux({ raw: { jumeaux: { resultat: { n: 300, depuis: "2019", niveau: "meme", dom: 150, nul: 80, ext: 70 } } }, vm, vuePro: false, verrouPro: false, dit: MS.registre() }), "");
});

test("panneau Marches : le nombre annonce = les lignes affichees (une ligne par paire de contraires)", () => {
  const l = (id, libelle, chance, pari) => ({ id, libelle, chance, pari_avis: !!pari });
  const familles = [{ cle: "buts", marches: [l("over-25", "Plus de 2,5 buts", 55), l("under-25", "Moins de 2,5 buts", 45), l("TOTAL:plus3.5", "Plus de 3,5 buts", 30)] },
    { cle: "btts", marches: [l("btts-yes", "Les deux marquent : oui", 52, true), l("btts-no", "Les deux marquent : non", 48)] }];
  assert.equal(MS.nbLignesAffichees(familles), 3);
  const vm = { identity: { home: { name: "A" }, away: { name: "B" } }, model: {} };
  const p = MS.panneau({ raw: { marches_panneau: { familles } }, vm, vuePro: true, verrouPro: false, dit: MS.registre() });
  assert.equal(p.nb, 3);
  assert.equal((p.html.match(/<li data-mk-txt/g) || []).length, 3, "autant de lignes que le nombre annonce");
  assert.match(p.html, /<span class="mk-nb">3<\/span>/);
  // Le calcul quotidien (nb_marches public) suit la meme regle.
  assert.match(read("lib/marches-panneau.js"), /const nb = MS\.nbLignesAffichees\(familles\);/);
});

test("match offert : compte gratuit = toutes les sections sauf le panneau Marches (flou, cadenas Pro) ; sans compte = apercu flou", () => {
  const mp = read("match-page.js");
  assert.match(mp, /const c=\{raw,vm,vuePro:!!\(o\.vuePro\|\|o\.verrouPro\),verrouPro:false,dit,/, "sections ouvertes, aucune ligne cadenas");
  assert.match(mp, /if\(o\.vuePro\)\{const p=MS\.panneau\(c\);/, "vrai panneau : Pro seulement");
  assert.match(mp, /else if\(o\.verrouPro&&estFr\(\)&&n\(raw\.nb_marches\)>0\)\{[\s\S]{0,300}MS\.panneauFlou\(raw\.nb_marches,cta\)/, "panneau flou (cadenas Pro) pour le compte gratuit");
  assert.match(mp, /render\(raw,\{vuePro,verrouPro:!vuePro&&isFree&&!termine,/);
  assert.match(mp, /if\(isFree&&!ctx\.session\)\{renderAuthWall\(raw\);return;\}/, "sans compte : apercu flou");
});

test("« Ce site ne fournit aucun conseil financier. » : sous le bloc Aujourd'hui et dans les pieds de page, dans les 7 langues", () => {
  const AJ = require("../lib/aujourdhui.js");
  const h = AJ.html({ version: 1, jour: "2026-10-04", niveau: "pro", tickets: [], selection_or: { statut: "aucun", verrou: null }, buteur_du_jour: null }, {});
  assert.equal((h.match(/Ce site ne fournit aucun conseil financier\./g) || []).length, 1);
  assert.match(read("index.html"), /data-i18n="aujourdhui\.no_financial_advice"[^>]*>Ce site ne fournit aucun conseil financier\.</);
  assert.match(read("match.html"), /data-i18n="aujourdhui\.no_financial_advice">Ce site ne fournit aucun conseil financier\.</);
  for (const l of ["fr", "en", "es", "es-mx", "de", "it", "pt"]) {
    const d = JSON.parse(read("i18n/dict/" + l + ".json"));
    assert.ok(d.aujourdhui && typeof d.aujourdhui.no_financial_advice === "string" && d.aujourdhui.no_financial_advice.length > 10, l);
  }
  for (const dir of ["en", "gb", "za"]) assert.match(read(dir + "/index.html"), /This site does not provide any financial advice\./, dir);
  assert.match(read("es/index.html"), /Este sitio no ofrece ningún asesoramiento financiero\./);
  assert.match(read("mx/index.html"), /Este sitio no ofrece ninguna asesoría financiera\./);
});

test("aucun nom technique de traduction ni « undefined » : chaque cle des modules de l'interface existe dans les 7 dictionnaires", () => {
  const src = ["lib/aujourdhui.js", "lib/offre-pro.js", "lib/match-sections.js", "account-page.js", "match-page.js"].map(read).join("\n")
    + ["index.html", "match.html"].map(read).join("\n");
  const cles = new Set();
  for (const m of src.matchAll(/\b(?:t|tf|tr)\(\s*["']([a-z_0-9]+\.[a-z_0-9]+(?:\.[a-z_0-9]+)*)["']/g)) cles.add(m[1]);
  for (const m of src.matchAll(/data-i18n="([a-z_0-9]+\.[a-z_0-9.]+)"/g)) cles.add(m[1]);
  const get = (o, k) => k.split(".").reduce((a, p) => (a == null ? a : a[p]), o);
  for (const l of ["fr", "en", "es", "es-mx", "de", "it", "pt"]) {
    const d = JSON.parse(read("i18n/dict/" + l + ".json"));
    const manque = [...cles].filter((k) => !/_$/.test(k) && typeof get(d, k) !== "string");
    assert.deepEqual(manque, [], l + " : cles absentes");
  }
});

test("Aujourd'hui sans compte : le ticket x10 et la Selection en or portent le cadenas « Pro », jamais « Gratuit »", () => {
  const AJ = require("../lib/aujourdhui.js");
  const v = (x) => ({ statut: "publie", verrou: x, nb_matchs: 4, cote_totale: 4.8 });
  const h = AJ.html({ version: 1, jour: "2026-10-04", niveau: "anonyme", tickets: [Object.assign({ type: "x5" }, v("compte")), Object.assign({ type: "x10" }, v("compte"))],
    selection_or: { statut: "publie", verrou: "compte", nb_paris: 3 }, buteur_du_jour: { statut: "publie", verrou: "compte" } }, {});
  const badge = (re) => { const m = re.exec(h); assert.ok(m, String(re)); return /sc-lock[^>]*>(?:<svg[\s\S]*?<\/svg>)?<span>([^<]+)</.exec(h.slice(m.index))[1]; };
  assert.equal(badge(/data-aj-card="x5"/), "Gratuit");
  assert.equal(badge(/data-aj-card="x10"/), "Pro");
  assert.equal(badge(/data-aj-card="buteur"/), "Gratuit");
  assert.equal(badge(/<article class="or is-locked"/), "Pro");
});
