"use strict";
// Page match : « Sélection Pro du jour » (03/10/2026, une seule source avec Telegram).
// Un abonne Pro voit la selection du Canal Pro envoyee pour CE match (public.pro_paris,
// colonnes accordees par 0040, jamais « select * »), avec les memes informations que le
// message Telegram (canal-pro.mjs#blocPari). Un compte gratuit ne voit rien de plus.
// Plus aucun « Pas de pari sur les matchs de sélections » dans les 7 langues.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vmLib = require("node:vm");
const VM = require("../lib/match-view-model.js");

const ROOT = path.join(__dirname, "..");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const DICTS = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(fs.readFileSync(path.join(ROOT, "i18n", "dict", l + ".json"), "utf8"))]));
const ANCIENS = [/Pas de pari sur les matchs de sélections/, /No bet on national-team matches/, /no hay apuesta en los partidos de selecciones/,
  /keine Wette auf Länderspiele/, /nessuna scommessa sulle partite delle nazionali/, /nenhuma aposta nos jogos de seleções/];
const GRANTED = "id,numero,jour,famille,regles,event_id,fixture_id,ligue,dom,ext,coup_envoi,fin_coup_envoi,marche,ligne,selection,selections,proba,source_proba,cote_min,meilleure_cote,meilleur_bookmaker,cotes,cote_vue_at,explication,publie_at,empreinte,empreinte_precedente,compo_voyant,meteo,score_dom,score_ext,resultat,cote_fin,regle_at".split(",");

// Ligne pro_paris fictive : Espagne – Croatie (Ligue des nations), voie « cotes du marche ».
const LIGNE = {
  id: "0c6c7a8e-0000-4000-8000-000000000001", numero: 42, famille: "simple", fixture_id: 1528900, ligue: "Ligue des nations",
  dom: "Espagne", ext: "Croatie", coup_envoi: "2026-10-03T18:45:00Z", marche: "1", ligne: null, selection: "Espagne gagne", selections: [],
  proba: 0.6123, source_proba: "chance calculée par IASHARK à partir des cotes du marché (Pinnacle, marge retirée)",
  meilleure_cote: 1.85, meilleur_bookmaker: "winamax", cote_vue_at: "2026-10-03T10:05:00Z", publie_at: "2026-10-03T10:06:00Z",
};
const MATCH = { id: 1528900, league: "UEFA Nations League", league_id: 5, home: { id: 9, n: "Spain" }, away: { id: 3, n: "Croatia" }, date: "2026-10-03 20:45", status: "NS", no_signal: true };

function chargerPage() {
  const src = fs.readFileSync(path.join(ROOT, "match-page.js"), "utf8");
  const i = src.lastIndexOf("init();");
  const code = src.slice(0, i) + "window.__MP={selectionProCard,selproRemplaceAvis,lireSelectionsPro,signalCard,viewModel,vuePro:v=>{VUE_PRO=v;}};\n" + src.slice(i + "init();".length);
  const el = { innerHTML: "", addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, style: {} };
  const win = { IasharkMatchViewModel: VM, location: { search: "", href: "" }, matchMedia: () => ({ matches: false }), addEventListener() {} };
  const ctx = { window: win, IasharkMatchViewModel: VM, document: { getElementById: () => el, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => el, documentElement: el, body: el }, console, setTimeout, clearTimeout, URLSearchParams, Intl, navigator: {}, Promise };
  vmLib.createContext(ctx);
  vmLib.runInContext(code, ctx);
  return win.__MP;
}
// Client Supabase fictif : note les colonnes demandees, rend `rows` pour fixture_id.
function clientFictif(rows, { erreur = false, casse = false } = {}) {
  const appels = [];
  return {
    appels,
    from(table) {
      if (casse) throw new Error("reseau");
      const q = { table, cols: null, filtres: [] };
      appels.push(q);
      const b = {
        select(c) { q.cols = c; return b; },
        eq(k, v) { q.filtres.push(["eq", k, v]); return b; },
        contains(k, v) { q.filtres.push(["cs", k, v]); return b; },
        then(ok, ko) {
          const data = q.filtres.some((f) => f[0] === "eq") ? rows : [];
          return Promise.resolve(erreur ? { data: null, error: { message: "permission denied" } } : { data, error: null }).then(ok, ko);
        },
      };
      return b;
    },
  };
}
const txt = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

test("abonne Pro : lecture de pro_paris (colonnes accordees, jamais *) et bloc « Sélection Pro du jour »", async () => {
  const MP = chargerPage();
  const sb = clientFictif([LIGNE]);
  const liste = await MP.lireSelectionsPro(sb, 1528900);
  assert.equal(liste.length, 1);
  assert.ok(sb.appels.length >= 2 && sb.appels.every((q) => q.table === "pro_paris"));
  for (const q of sb.appels) {
    assert.doesNotMatch(q.cols, /\*/);
    q.cols.split(",").forEach((c) => assert.ok(GRANTED.includes(c), "colonne non accordee : " + c));
  }
  assert.ok(sb.appels.some((q) => q.filtres.some((f) => f[0] === "eq" && f[1] === "fixture_id" && f[2] === 1528900)));
  assert.ok(sb.appels.some((q) => q.filtres.some((f) => f[0] === "cs" && f[1] === "selections" && f[2] === '[{"fixture_id":1528900}]')), "combine : une de ses selections");

  MP.vuePro(true);
  const bloc = txt(MP.selectionProCard(liste));
  assert.match(bloc, /Sélection Pro du jour/);
  assert.match(bloc, /Sélection : Espagne gagne/);
  // Meme chance, mot pour mot, que le message Telegram.
  const C = await import(path.join(ROOT, "supabase/functions/_shared/canal-pro.mjs"));
  assert.ok(bloc.includes(C.chanceTxt(LIGNE)), C.chanceTxt(LIGNE));
  assert.match(bloc, /Chance calculée par IASHARK à partir des cotes du marché : 61 %\./);
  assert.match(bloc, /Cote : 1,85 chez Winamax · relevée à 12 h 05/);
  assert.match(bloc, /N° PRO-42/);
  assert.match(bloc, /cotes des bookmakers, marge retirée/);
  assert.doesNotMatch(bloc, /pari conseillé|Pari recommandé|mise|unité|espérance/i);
  // Match de selections : l'avis (texte neutre) laisse la place au bloc Pro, sans doublon.
  assert.equal(MP.selproRemplaceAvis(MATCH, liste), true);
  // Ligue v3 : l'avis reste, sauf si la meme selection y est deja.
  const ligue1 = { id: 77, league: "Ligue 1", league_id: 61, market_id: "home-win" };
  assert.equal(MP.selproRemplaceAvis(ligue1, [{ ...LIGNE, fixture_id: 77 }]), true);
  assert.equal(MP.selproRemplaceAvis({ ...ligue1, market_id: "over-25" }, [{ ...LIGNE, fixture_id: 77 }]), false);
  assert.equal(MP.selproRemplaceAvis(ligue1, []), false);
});

test("combine et buteur : memes lignes que Telegram (selections, chance, cote)", async () => {
  const MP = chargerPage();
  const C = await import(path.join(ROOT, "supabase/functions/_shared/canal-pro.mjs"));
  MP.vuePro(true);
  const combi = { ...LIGNE, numero: 43, famille: "combine", marche: "combine", selection: "Espagne gagne + Lens ou nul", proba: 0.4,
    selections: [{ fixture_id: 1528900, ligue: "Ligue des nations", dom: "Espagne", ext: "Croatie", coup_envoi: LIGNE.coup_envoi, marche: "1", selection: "Espagne gagne", cote: 1.85, voie: "cotes_marche" },
      { fixture_id: 99, ligue: "Ligue 1", dom: "Lens", ext: "Nice", coup_envoi: LIGNE.coup_envoi, marche: "1X", selection: "Lens ou nul", cote: 1.4 }],
    meilleure_cote: 2.59 };
  const b = txt(MP.selectionProCard([combi]));
  assert.ok(b.includes(C.chanceTxt(combi)), C.chanceTxt(combi));
  assert.match(b, /Cote du combiné : 2,59 chez Winamax \(toutes les sélections chez lui\)/);
  const buteur = { ...LIGNE, numero: 44, famille: "buteur", marche: "buteur", selection: "Espagne gagne + Morata marque (à n'importe quel moment)", proba: 0.2,
    selections: [{ type: "buteur", equipe: "Espagne", joueur: "Morata" }], meilleure_cote: null, meilleur_bookmaker: null };
  const bb = txt(MP.selectionProCard([buteur]));
  assert.ok(bb.includes(C.chanceTxt(buteur)), C.chanceTxt(buteur));
  assert.ok(bb.includes(C.SANS_PREUVE_BUTEUR));
});

test("compte gratuit ou lecture impossible : rien (pas d'erreur), texte neutre dans l'avis", async () => {
  const MP = chargerPage();
  MP.vuePro(false);
  assert.equal(MP.selectionProCard([LIGNE]), "", "gratuit : jamais le bloc Pro");
  assert.equal(MP.selproRemplaceAvis(MATCH, [LIGNE]), false);
  MP.vuePro(true);
  assert.equal((await MP.lireSelectionsPro(clientFictif([], { erreur: true }), 1528900)).length, 0);
  assert.equal((await MP.lireSelectionsPro(clientFictif([], { casse: true }), 1528900)).length, 0);
  assert.equal((await MP.lireSelectionsPro(null, 1528900)).length, 0);
  assert.equal((await MP.lireSelectionsPro(clientFictif([LIGNE]), "null")).length, 0);
  assert.equal(MP.selectionProCard([]), "", "table vide : rien");
  MP.vuePro(false);
  const avis = txt(MP.signalCard(MP.viewModel(MATCH)));
  assert.match(avis, /Les sélections Pro du jour sont envoyées aux abonnés, en privé sur Telegram\./);
  assert.doesNotMatch(avis, /Pas de pari/);
});

test("7 langues : plus aucun « Pas de pari sur les matchs de sélections », textes du bloc = textes du robot", async () => {
  const src = fs.readFileSync(path.join(ROOT, "match-page.js"), "utf8");
  ANCIENS.forEach((re) => assert.doesNotMatch(src, re));
  const { textes } = await import(path.join(ROOT, "supabase/functions/_shared/canal-pro-langues.mjs"));
  for (const l of LOCALES) {
    const brut = JSON.stringify(DICTS[l]);
    ANCIENS.forEach((re) => assert.doesNotMatch(brut, re, l));
    const S = DICTS[l].match_page.selpro;
    assert.ok(DICTS[l].match_page.avis_no_signal_selections && /Telegram/.test(DICTS[l].match_page.avis_no_signal_selections), l);
    assert.ok(S && S.title && S.chance_marche && S.chance_simple, l);
    if (l === "fr") continue;
    const L = textes(l);
    assert.equal(S.chance_marche.replace("{p}", "61"), L.chanceMarche("61"), l);
    assert.equal(S.chance_simple.replace("{p}", "61"), L.chanceSimple("61"), l);
    assert.equal(S.m_1.replace("{home}", "Espagne"), L.marches[1]({ dom: "Espagne" }), l);
  }
});
