"use strict";
// Onglets « Combiné », « Cote juste » et « Mise » de l'espace Pro (30/09/2026).
// Preuve du mathematicien et de l'avocat du diable (verif-combine.js), rejouee ici en
// executant le VRAI tools-page.js dans un faux navigateur : deux paris « modèle seul »
// hors d'Europe (MLS 70 % face a une cote sans marge de 60 %, cote 1,62 ; Liga MX
// 72,6 % face a 72,0 %, cote 1,45) affichaient « Espérance du combiné +19,4 % » en
// cyan et « meilleur pari joué seul : +13,4 % ».
// Decision de Clement : plus AUCUNE esperance ni AUCUNE mise sur le site. Le combine
// garde les selections, la cote totale et la chance calculee par IASHARK (pour chaque
// pari, le plus petit des deux chiffres : modele ou cote sans marge ; sans cote sans
// marge, le pari sort de la liste). L'onglet « Mise » (calcul de mise) disparait.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ROOT = path.join(__dirname, "..");
const lire = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// Une seule source (01/10/2026) : chaque pari porte sa chance_iashark, posee par le pipeline.
const CHANCE = require(path.join(ROOT, "lib/chance-iashark.js"));
const pari = (...a) => { const m = pariBrut(...a); CHANCE.poserChance(m); return m; };
const pariBrut = (id, home, away, league, prob, fair, cote, origine) => ({
  id, home: { n: home }, away: { n: away }, league, date: "2026-10-03 23:30", pari_rec: "Victoire Domicile", market_id: "home-win",
  model_probability: prob, cote_rec: String(cote), no_signal: false, moteur_v3: { source: "v3", origine_probabilite: origine },
  markets_compared: fair === null ? [] : [{ id: "home-win", market: "Victoire Domicile", probability: prob, consensus: fair, edge: Math.round((prob - fair) * 10) / 10 }],
});
const MATCHS = [
  pari(900001, "Austin", "Dallas", "Major League Soccer", 70, 60, 1.62, "modèle seul"),
  pari(900002, "Tigres", "Toluca", "Liga MX", 72.6, 72.0, 1.45, "modèle seul"),
  // Aucune cote sans marge : ce pari ne doit jamais etre propose.
  pari(900003, "Malmö", "AIK", "Allsvenskan", 78, null, 1.35, "modèle seul"),
];

// Execute tools-page.js (abonne Pro) avec l'onglet `hash` ouvert ; renvoie le texte des elements.
async function page(hash, valeurs) {
  const els = {};
  const el = (id) => {
    if (!els[id]) els[id] = { id, innerHTML: "", hidden: false, dataset: {}, value: "", attrs: {}, addEventListener() {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] || null; },
      removeAttribute(k) { delete this.attrs[k]; }, classList: { toggle() {}, add() {}, remove() {} }, querySelector: () => null, querySelectorAll: () => [], closest: () => null, focus() {} };
    return els[id];
  };
  Object.entries(valeurs || {}).forEach(([k, v]) => { el(k).value = v; });
  const panneaux = ["tableau", "combo", "scanner"].map((p) => { const x = el("panel-" + p); x.attrs["data-panel"] = p; return x; });
  const coches = [0, 1, 2].map((i) => ({ getAttribute: (k) => (k === "data-cb" ? String(i) : null), addEventListener() {}, checked: true }));
  const document = {
    readyState: "complete", getElementById: (id) => el(id), querySelector: () => null, addEventListener() {},
    querySelectorAll: (sel) => (sel === "[data-panel]" ? panneaux : /input\[data-cb\]/.test(sel) ? coches : []),
  };
  const ok = (v) => Promise.resolve(v);
  const chaine = () => { const c = { select: () => c, eq: () => c, order: () => c, limit: () => ok({ data: [], error: null }), maybeSingle: () => ok({ data: null }) }; return c; };
  const window = {
    IasharkToolsDomain: require(path.join(ROOT, "lib/tools-domain.js")),
    IasharkMarketLabels: require(path.join(ROOT, "lib/market-labels.js")),
    IasharkApp: { context: () => ok({ user: { id: "u1" }, isPro: true, profile: {} }),
      supabase: { functions: { invoke: () => ok({ data: { isPro: true, matchs: MATCHS } }) }, from: () => chaine() } },
  };
  const ctx = { window, document, location: { hash: "#" + hash }, history: { replaceState() {} }, console, Intl, Promise, setTimeout };
  vm.createContext(ctx);
  vm.runInContext(lire("tools-page.js"), ctx);
  await new Promise((r) => setTimeout(r, 250));
  const txt = (h) => String(h).replace(/<[^>]+>/g, " ").replace(/&[#a-z0-9]+;/gi, " ").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
  const out = {};
  Object.keys(els).forEach((k) => { out[k] = txt(els[k].innerHTML); out[k + ":html"] = els[k].innerHTML; });
  return out;
}

test("combine : preuve rejouee, plus de « +19,4 % » ni d'esperance ; chance = 60 % x 72 % = 43,2 %", async () => {
  const r = await page("combo");
  // Chance IASHARK en % entier, comme la page match et Telegram (une seule source, 01/10/2026).
  assert.match(r.cbList, /Austin – Dallas Victoire Domicile · 60 % de chance 1,62/, "MLS : la cote sans marge (60 %), pas le modele seul (70 %)");
  assert.match(r.cbList, /Tigres – Toluca Victoire Domicile · 72 % de chance 1,45/);
  assert.doesNotMatch(r.cbList, /Malmö|AIK/, "sans cote sans marge, le pari sort de la liste");
  assert.doesNotMatch(r.cbList, /70,0|72,6/);
  assert.match(r.cbOut, /Chance calculée par IASHARK 43,2%/);
  assert.match(r.cbOut, /2,35 Cote du combiné 2 Sélections/);
  assert.doesNotMatch(r.cbOut + r["panel-combo"], /Espérance|espérance|\+19,4|\+13,4|meilleur pari|Cote juste estimée|rapporte/);
  assert.doesNotMatch(r["cbOut:html"], /text-cyan tabular-nums">/, "le chiffre n'est plus colore comme un gain");
  // Plus de saisie manuelle : une probabilite tapee a la main n'est pas celle d'IASHARK.
  assert.doesNotMatch(r["panel-combo"], /Ajouter une sélection manuelle|Ajouter au combiné/);
});

test("cote juste et simulateur de capital : retires de l'espace Pro (fusion V3, 30/09/2026)", async () => {
  const js = lire("tools-page.js");
  assert.doesNotMatch(js, /function rendreFair|function rendreBankroll|fair_kpi_ev|Espérance théorique/);
  const r = await page("fair", { foProb: "58", foOdds: "1.90" });
  assert.equal(r.foOut, undefined, "aucun calcul de cote juste");
  assert.equal(r["panel-fair"], undefined, "aucun panneau cote juste");
});

test("onglet « Mise » : retire de l'espace Pro, des menus et du code ; #stake ouvre le premier onglet ouvert (combine au lancement du 3/10)", async () => {
  const js = lire("tools-page.js"), html = lire("pro.html");
  const reste = js.match(/rendreStake|calculateStake|tools_page\.stake_|spBank|Calculateur de mise|Mise recommandée|Mise calculée/);
  assert.equal(reste, null, "reste du calcul de mise : " + (reste && reste[0]));
  // Lancement du 3/10 (avocat du diable, 01/10/2026) : tableau de bord cache tant que 0040/0041
  // ne sont pas appliquees ; les anciennes ancres menent au premier onglet ouvert.
  assert.match(js, /var RENDU = TABLEAU_OUVERT \? \{ tableau: rendreTableau, combo: rendreCombo, scanner: rendreScanner \} : \{ combo: rendreCombo, scanner: rendreScanner \};/);
  assert.match(js, /ANCIENNES_ANCRES = \{ fair: DEFAUT, bankroll: DEFAUT, journal: DEFAUT, stake: DEFAUT, tableau: DEFAUT \}/);
  assert.doesNotMatch(html, /data-tool="stake"|panel-stake|Calculateur de mise|DIMENSIONNER|dimensionner/);
  for (const dir of ["fr", "en", "gb", "za", "es", "mx"]) {
    const page = lire(dir + "/pro.html");
    assert.doesNotMatch(page, /data-tool="stake"|panel-stake|Calculateur de mise|Stake calculator|Calculadora de apuesta|DIMENSIONNER|\bSIZE\b|DIMENSIONAR/, dir + "/pro.html");
    assert.match(page, /data-tool="combo"/, dir + "/pro.html");
    // Aucune page d'« historique public » n'existe : jamais citee (Clement, 30/09/2026).
    assert.doesNotMatch(page, /historique public|public record|historial público/i, dir + "/pro.html");
  }
  const r = await page("stake");
  assert.equal(r["panel-stake"], undefined, "aucun panneau de mise");
  assert.equal(r["panel-scanner"], "", "un ancien lien #stake n'ouvre plus le detecteur : il mene au tableau de bord");
});

// Avocat du diable (30/09/2026, point 4) : mots interdits sur les onglets « Cote juste »
// et « Mise », 7 langues. Plus aucune esperance ni mise conseillee (decision de Clement).
const LANGUES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const INTERDITS = /\bedges?\b|Theoretical expected value|expected value|ventaja|Vorteil|vantaggio|vantagem|avantage math|espérance|esperanza de ganancia|valor esperado|Erwartungswert|valore atteso|esperança de ganho|Kelly/i;
test("onglets Cote juste et Combine, 7 langues : aucun mot interdit, plus aucune cle de mise", () => {
  for (const l of LANGUES) {
    const tp = JSON.parse(lire("i18n/dict/" + l + ".json")).tools_page;
    for (const k of Object.keys(tp).filter((x) => /^(fair_|combo_|static_)/.test(x))) assert.doesNotMatch(tp[k], INTERDITS, `${l} tools_page.${k} : « ${tp[k]} »`);
    assert.deepEqual(Object.keys(tp).filter((x) => /^(stake_|kelly_|edge_)|_ev$|_ev_|mise_sugg|modal_stake/.test(x)), [], l + " : vieilles cles de mise ou d'esperance");
    for (const k of ["fair_kpi_ev", "combo_result_label", "combo_better_prefix", "combo_worse_suffix", "bankroll_note_prefix"]) assert.equal(tp[k], undefined, l + " " + k);
    // Cles inutilisees qui contenaient « avantage », « edge », « mise conseillée ».
    const mp = JSON.parse(lire("i18n/dict/" + l + ".json")).match_page;
    for (const k of ["label_edge", "paywall_sub", "paywall_feat1_name", "paywall_feat1_desc", "why5_a", "why6_a", "why6_title", "reading_has_advantage", "detected_edge_label", "sig_edge", "markets_col_gap", "markets_note"]) assert.equal(mp[k], undefined, l + " match_page." + k);
  }
});
