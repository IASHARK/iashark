// Canal Pro et robot personnel : regles, messages, et journees completes simulees.
// Chaque cas prouve par les controles du 30/09/2026 (trader, mathematicien,
// historique, avocat ; preuves verif1.mjs / verif2.mjs) a son test ici. Depuis le
// 30/09 au soir, les paris viennent du MENU (sortie du moteur v3) : voir aussi
// tests/canal-pro-menu.test.mjs. Donnees FICTIVES.
import test from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as C from "../supabase/functions/_shared/canal-pro.mjs";
import * as M from "../supabase/functions/_shared/canal-pro-menu.mjs";
import { BaseMemoire } from "../scripts/canal-pro/lib/base.mjs";
import * as T from "../scripts/canal-pro/taches.mjs";
import { resumeSemaine, carteHtml } from "../scripts/canal-pro/semaine-en-image.mjs";
import { verifierGrille } from "../scripts/canal-pro/loto-foot-ajouter.mjs";
import { BOOKMAKERS_RELEVES, creerSources } from "../scripts/canal-pro/lib/sources.mjs";
import { matchV3, sortieV3 } from "../scripts/canal-pro/lib/exemple-v3.mjs";
// Textes du robot (toutes langues, francais d'origine compris) : canal-pro-langues.mjs (02/10/2026).
const LANGUES_SRC = fs.readFileSync(new URL("../supabase/functions/_shared/canal-pro-langues.mjs", import.meta.url), "utf8");

// ---------- donnees de test (fictives) ----------
const KO = "2026-10-10T13:00:00Z"; // samedi 10/10, 15 h a Paris
const h2h = (a, b, c, dom = "Torino", ext = "Udinese") => [{ key: "h2h", outcomes: [{ name: dom, price: a }, { name: "Draw", price: b }, { name: ext, price: c }] }];
function evenement(domBetclic = 1.74, domWinamax = 1.7, { sansPinnacle = false } = {}) {
  const bks = [
    { key: "pinnacle", title: "Pinnacle", markets: h2h(1.8, 3.7, 4.6) },
    { key: "betclic_fr", title: "Betclic (FR)", markets: h2h(domBetclic, 3.5, 4.3) },
    { key: "winamax_fr", title: "Winamax (FR)", markets: h2h(domWinamax, 3.55, 4.35) },
    { key: "unibet_eu", title: "Unibet", markets: h2h(1.9, 3.6, 4.2) },
  ];
  return { id: "ev1", sport_key: "soccer_italy_serie_a", commence_time: KO, home_team: "Torino", away_team: "Udinese", bookmakers: sansPinnacle ? bks.slice(1) : bks };
}
// Le match du moteur v3 (fictif) : « Torino gagne », chance calculee environ 55 %, cote moyenne 1,72 (fourchette des simples).
const MATCH_T = matchV3({ id: "I1-2026-10-10-Torino-Udinese", ligue_code: "I1", dom: "Torino", ext: "Udinese", ko: KO, lh: 1.75, la: 0.95, fixture: 77 });
/** Le menu du jour avec ce seul match (un simple : journee calme). */
function menuTorino(jour, d, { fixture = 77, ev = evenement() } = {}) {
  const m = { ...MATCH_T, ids_api_football: fixture ? { fixture } : null };
  const { debut, fin } = C.fenetreProgramme(jour);
  return M.construireMenu({ jour, matchsJour: M.matchsMenu(sortieV3([m], "2026-10-10T04:00:00Z"), debut, fin),
    cotesParMatch: { [m.match_id]: { event_id: "ev1", sport_key: "soccer_italy_serie_a", books: C.booksDepuisOddsApi(ev), releve_at: new Date(new Date(d).getTime() - 5 * 60000).toISOString() } } });
}
const simpleTorino = (d = "2026-10-10T06:10:00Z") => menuTorino("2026-10-10", d).candidats.map((c) => ({ ...c, releve_at: d }));
// Plus de canal Pro (02/10/2026) : chaque pari part d'abord au REGISTRE (conversation de Clement, chat 42,
// marque ETIQUETTE_REGISTRE), puis en prive a chaque abonne. registre() rend les messages sans l'etiquette.
const estRegistre = (x) => x.chat === 42 && String(x.text).startsWith(T.ETIQUETTE_REGISTRE);
const registre = (tg) => lesMessages(tg).filter(estRegistre).map((x) => ({ ...x, text: x.text.slice(T.ETIQUETTE_REGISTRE.length + 1) }));
const lesMessages = (tg) => tg.appels.filter((a) => a.methode === "sendMessage").map((a) => ({ chat: a.corps.chat_id, text: a.corps.text, a }));
function fauxTelegram({ panneCanal = [], statutPanne = 429 } = {}) {
  let n = 100, canal = 0;
  const tg = async (methode, corps) => {
    const appel = { methode, corps };
    tg.appels.push(appel);
    if (methode === "sendMessage" && String(corps.text).startsWith(T.ETIQUETTE_REGISTRE) && [].concat(panneCanal).includes(++canal)) { const e = new Error(`sendMessage: ${statutPanne}`); e.status = statutPanne; throw e; }
    appel.message_id = ++n;
    return { message_id: appel.message_id };
  };
  tg.appels = [];
  return tg;
}
// Decision de Clement (30/09) et conditions du mathematicien : jamais dans un message.
const INTERDITS = /validée|validées|testée|recommandée|paie plus que sa chance|prends-le maintenant|vaut le coup|gain moyen|comporte des risques|garanti|sûr de gagner|cote minimum|il faut gagner|\bmise\b|unité|réussite|\bvaleur\b|avantage|rentable|\bVIP\b/i;

// ---------- 1. regles figees : memes calculs que le test cache (ecarts listes : sans Pinnacle pour le pari, source des cotes, double chance, heure du choix) ----------
test("cotes : une cote hors de ]1 ; 200[ est ignoree avec son marche (comme regles.py)", () => {
  const ev = { ...evenement(), bookmakers: [...evenement().bookmakers, { key: "bizarre", title: "X", markets: h2h(2.5, 250, 2.9) }] };
  assert.strictEqual(Object.values(C.booksDepuisOddsApi(ev)).filter((r) => r["1x2"]).length, 4);
  assert.ok(!("bizarre" in C.booksDepuisOddsApi(ev)));
});

test("bookmakers : liste ANJ du 29/09 (anj.fr), NetBet suivi, seuls les suivis dans /reglages", () => {
  const cles = C.BOOKMAKERS_AGREES.FR.map((b) => b.cle);
  for (const x of ["zebet", "barrierebet", "parionssport"]) assert.ok(!cles.includes(x), `${x} n'est plus agree`);
  for (const x of ["bet365", "betsson", "circus", "daznbet", "yesorno"]) assert.ok(cles.includes(x), `${x} est agree`);
  assert.deepStrictEqual(C.bookmakersSuivis(), ["betclic", "netbet", "pmu", "unibet", "winamax"]);
  // France : les 5 flux « _fr » ; Espagne (02/10/2026) : les flux des 4 operateurs DGOJ suivis.
  assert.strictEqual(BOOKMAKERS_RELEVES, "pinnacle,betclic_fr,netbet_fr,pmu_fr,unibet_fr,winamax_fr,williamhill,sport888,betsson,marathonbet");
  assert.ok(BOOKMAKERS_RELEVES.split(",").length <= 10, "releves : 10 bookmakers au plus = prix d'une seule zone");
  assert.strictEqual(C.bookmakerAgree("netbet_fr"), "netbet");
  assert.strictEqual(C.bookmakerAgree("unibet_eu"), null);
  assert.strictEqual(C.bookmakerAgree("williamhill"), null, "France : jamais un flux international");
  assert.strictEqual(C.bookmakerAgree("williamhill", "ES"), "williamhill", "Espagne : operateur DGOJ suivi");
  assert.strictEqual(C.bookmakerAgree("betclic_fr", "ES"), null, "Espagne : jamais un operateur francais");
  assert.strictEqual(C.bookmakerAgree("bet365", "ES"), null, "Espagne : agree DGOJ mais pas suivi : jamais montre");
  assert.strictEqual(C.bookmakerAgree("betclic"), null);
  const prefs = C.preferencesEffectives({}, {});
  const boutons = C.clavierReglages(prefs, "bk").inline_keyboard.flat().map((b) => b.callback_data).filter((d) => d.startsWith("rg:b:"));
  assert.deepStrictEqual(boutons.sort(), ["rg:b:betclic", "rg:b:netbet", "rg:b:pmu", "rg:b:unibet", "rg:b:winamax"]);
  const bet365 = C.preferencesEffectives({ bookmakers: ["bet365", "winamax"] }, {});
  assert.deepStrictEqual([bet365.bookmakers, bet365.bookmakers_non_suivis], [["winamax"], ["bet365"]]);
});

test("programme : meilleure cote chez les agrees suivis, controles du preparateur", () => {
  const c = simpleTorino();
  const r = C.preparerProgramme(c, { jour: "2026-10-10", maintenant: "2026-10-10T06:30:00Z" });
  const p = r.paris[0];
  assert.deepStrictEqual([p.famille, p.selection, p.meilleur_bookmaker, p.meilleure_cote, p.cote_min], ["simple", "Torino gagne", "betclic", 1.74, null]);
  assert.ok(!JSON.stringify(p.cotes).includes("unibet") && !JSON.stringify(p.cotes).includes("pinnacle"), "seulement les agrees suivis");
  assert.match(C.preparerProgramme(c, { jour: "2026-10-10", maintenant: "2026-10-10T07:30:00Z" }).ecartes[0].raison, /plus d'1 h/);
  const sansMatch = C.preparerProgramme(c.map((x) => ({ ...x, fixture_id: null })), { jour: "2026-10-10", maintenant: "2026-10-10T06:30:00Z" });
  assert.match(sansMatch.ecartes[0].raison, /ne pourrait pas être réglé/);
  assert.match(C.preparerProgramme(c, { jour: "2026-10-10", maintenant: "2026-10-10T06:30:00Z", suspendues: ["simple"] }).ecartes[0].raison, /suspendu \(règle d'arrêt\)/);
  const sansAgree = C.preparerProgramme(c.map((x) => ({ ...x, cotes: { unibet_eu: 1.9 } })), { jour: "2026-10-10", maintenant: "2026-10-10T06:30:00Z" });
  assert.deepStrictEqual([sansAgree.paris.length, /aucune cote chez les bookmakers agréés suivis/.test(sansAgree.ecartes[0].raison), sansAgree.ecartes[0].donnees], [0, true, true]);
});

test("dernier controle : meilleure cote relevee de nouveau ; la chance (moteur v3) ne change pas ; aucune cote minimum", () => {
  const [p] = C.preparerProgramme(simpleTorino(), { jour: "2026-10-10", maintenant: "2026-10-10T06:30:00Z" }).paris;
  const bouge = C.controlePublication(p, { cotes: { betclic_fr: 1.69, winamax_fr: 1.71 }, pinnacle_proba: 0.5, pinnacle_cote: 1.8 }, "2026-10-10T07:30:00Z");
  assert.deepStrictEqual([bouge.maj.meilleure_cote, bouge.maj.meilleur_bookmaker, bouge.maj.proba, bouge.maj.cote_min], [1.71, "winamax", undefined, undefined]);
  assert.match(bouge.maj.explication, /^Chance calculée par IASHARK : \d+ %\.$/);
  assert.match(C.controlePublication(p, { cotes: { betclic_fr: 1.74 }, pinnacle_proba: null }, "2026-10-10T07:30:00Z").raison, /Pinnacle/);
  assert.match(C.controlePublication(p, { cotes: {}, pinnacle_proba: 0.5, pinnacle_cote: 1.8 }, "2026-10-10T07:30:00Z").raison, /plus aucune cote chez les agréés/);
});

// ---------- 2. textes : aucune affirmation fausse, aucune promesse implicite ----------
test("textes : SIMPLE, match + pari + cote + « chance calculée par IASHARK », jamais mise, cote minimum, calcul ni mot interdit", () => {
  assert.deepStrictEqual(Object.values(C.FAMILLES).map((f) => f.titre), ["SIMPLE", "COMBINÉ DU JOUR", "MÊME MATCH AVEC BUTEUR", "TICKET AUTOUR DE 10", "TICKET AUTOUR DE 25", "TICKET 50-100 DU MOIS"]);
  const { paris } = C.preparerProgramme(simpleTorino(), { jour: "2026-10-10", maintenant: "2026-10-10T06:30:00Z" });
  const prefs = C.preferencesEffectives({}, {});
  const p = { ...paris[0], id: "x" };
  const textes = [C.messageValidation({ jour: "2026-10-10", paris, ecartes: [] }), C.messagesCanal("2026-10-10", paris).tete, C.messagesCanal("2026-10-10", paris).paris[0].html,
    C.messageProgrammePerso("2026-10-10", paris, prefs), C.messageReglages(prefs), C.AIDE_ROBOT, C.verdictTabac(p, 1.8), C.verdictTabac(p, 1.6),
    ...C.alertesCote(p, { winamax: 1.6, betclic: 1.65 }, C.preferencesEffectives({ bookmakers: ["winamax"] }, {}), new Set(), { maintenant: Date.parse("2026-10-10T09:40:00Z") }).map((a) => a.texte),
    ...C.alertesCote({ ...p, cotes: { winamax: 1.7 } }, { winamax: 1.8 }, C.preferencesEffectives({ bookmakers: ["winamax"] }, {}), new Set(), { maintenant: Date.parse("2026-10-10T09:40:00Z") }).map((a) => a.texte),
    C.messageBilanSemaine("2026-10-05", "2026-10-11", [], []), C.messageDuelOuverture({ dom: "A", ext: "B", coup_envoi: KO, empreinte: "a".repeat(64) })];
  for (const t of textes) assert.ok(!INTERDITS.test(t), `${t.match(INTERDITS)?.[0]} : ${t}`);
  const html = C.messagesCanal("2026-10-10", paris).paris[0].html;
  assert.match(html, /^<b>SIMPLE<\/b>\nSerie A · Torino – Udinese · 15 h\nSélection : <b>Torino gagne<\/b>\nChance calculée par IASHARK : \d+ %\.\nCote : <b>1,74<\/b> chez Betclic · relevée à 8 h 10$/);
  assert.match(C.messagesCanal("2026-10-10", paris).tete, /la chance calculée par IASHARK \(moteur v3\) et la meilleure cote relevée chez les bookmakers agréés/);
  for (const f of ["supabase/functions/_shared/canal-pro.mjs", "scripts/canal-pro/taches.mjs", "supabase/functions/telegram-bot/index.ts"]) {
    const src = fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
    assert.ok(!/paie plus que sa chance|Prends-le maintenant|vaut le coup|recommandée, parce que testée|validées sur le passé|gain moyen reste|MENTION_TEST|coteMinimum/.test(src), f);
  }
});

test("messages vides : cinq motifs, « On ne force pas », jamais « aucun pari ne passe nos criteres » par erreur (contre-controle : faux motif n° 2)", () => {
  assert.match(C.messagesCanal("2026-10-10", [], { motifVide: "regles" }).tete, /Aucun pari ne passe nos critères aujourd'hui\. On ne force pas\./);
  assert.match(C.messagesCanal("2026-10-10", [], { motifVide: "regles_partiel" }).tete, /parmi les matchs que nous avons pu vérifier jusqu'au bout, aucun ne passe nos critères/);
  assert.match(C.messagesCanal("2026-10-10", [], { motifVide: "aucun_match" }).tete, /Aucun match de nos championnats n'a été trouvé/);
  const controle = C.messagesCanal("2026-10-10", [], { motifVide: "controle" }).tete;
  assert.match(controle, /Au dernier contrôle, aucun pari ne remplissait plus nos conditions/);
  assert.ok(!/aucune cote n'était au-dessus/.test(controle), "texte neutre : les raisons du retrait sont variees");
  assert.match(C.messagesCanal("2026-10-10", [], { motifVide: "retires" }).tete, /Pas de pari aujourd'hui/);
  assert.match(C.MESSAGE_REPORTE("2026-10-10"), /reporté/);
});

test("« programme reporte » : a la preparation, aucune promesse (il faut encore preparer et valider avant 12 h)", () => {
  const prep = C.MESSAGE_REPORTE("2026-10-10", "preparation");
  assert.ok(!/le programme part/.test(prep), prep);
  assert.match(prep, /peut encore arriver ici ; sinon, il n'y a pas de programme aujourd'hui/);
  assert.match(C.MESSAGE_REPORTE("2026-10-10", "publication"), /Si elles reviennent à temps, le programme part, sans les matchs qui commencent dans moins de 75 min/);
});

// ---------- 3. garde-fou, alertes, tickets ----------
test("garde-fou : 0 = plus rien aujourd'hui, et la limite coupe toutes les alertes (verif1 n°1)", () => {
  const p = { id: "x", famille: "simple", dom: "Torino", ext: "Udinese", selection: "Torino gagne", coup_envoi: KO, meilleure_cote: 1.74, meilleur_bookmaker: "betclic", cotes: { betclic: 1.74, winamax: 1.7 } };
  const zero = C.preferencesEffectives({ bookmakers: ["winamax"], limite_paris_jour: 0 });
  assert.strictEqual(zero.limite_paris_jour, 0);
  assert.ok(C.gardeFouAtteint(zero, 0));
  assert.deepStrictEqual(C.alertesCote(p, { winamax: 1.6 }, zero, new Set(), { maintenant: Date.parse("2026-10-10T09:40:00Z"), notesAujourdhui: 0 }), []);
  assert.match(C.messageGardeFou(0, 0), /plus rien aujourd'hui/);
  assert.match(C.messageGardeFou(9, 5), /Je ne t'envoie plus rien aujourd'hui/);
  const prefs = C.preferencesEffectives({ bookmakers: ["winamax"] }, {});
  const jour = Date.parse("2026-10-10T09:40:00Z"), nuit = Date.parse("2026-10-09T22:30:00Z");
  const a = C.alertesCote(p, { winamax: 1.62, betclic: 1.7 }, prefs, new Set(), { maintenant: jour });
  assert.strictEqual(a[0].type, "seuil");
  assert.match(a[0].texte, /Cote en baisse<\/b> : Torino gagne \(Torino – Udinese\) est passé de 1,70 à 1,62 chez Winamax\. Ailleurs : 1,70 chez Betclic/);
  assert.strictEqual(C.alertesCote(p, { winamax: 1.62 }, prefs, new Set(), { maintenant: nuit }).length, 0, "la nuit : rien");
  assert.strictEqual(C.alertesCote(p, { winamax: 1.62 }, prefs, new Set(), { maintenant: jour, notesAujourdhui: 5 }).length, 0);
  assert.strictEqual(C.alertesCote(p, { winamax: 1.67 }, prefs, new Set(), { maintenant: jour }).length, 0, "moins de 0,05 : rien");
  assert.deepStrictEqual(C.alertesCote({ ...p, famille: "combine" }, { winamax: 1.2 }, prefs, new Set(), { maintenant: jour }), [], "alertes de cote : seulement les simples");
});

test("tickets : la selection de l'abonne est gardee ; pari relie seulement si c'est le meme (verif1 n°2) ; tabac sans calcul", () => {
  const p = { id: "x", famille: "simple", dom: "Torino", ext: "Udinese", selection: "match nul", marche: "N", ligne: null, proba: 0.27, meilleure_cote: 3.45, meilleur_bookmaker: "betclic", cote_vue_at: "2026-10-10T07:30:00Z" };
  const autre = C.lireTicketTexte("10 € sur Torino gagne à 2,50 chez Betclic", [p]);
  assert.strictEqual(autre.pari, null, "l'abonne a joue autre chose : pas relie");
  assert.strictEqual(autre.selection, "Torino gagne");
  assert.strictEqual(C.messageTicket(autre), "Ticket lu : 10 € sur Torino gagne (Torino – Udinese) à 2,50 chez Betclic.");
  const meme = C.lireTicketTexte("10 € sur le nul Torino Udinese à 3,30 chez Betclic", [p]);
  assert.deepStrictEqual([meme.cote, meme.mise, meme.bookmaker, meme.pari.id, meme.selection], [3.3, 10, "betclic", "x", "match nul"]);
  assert.strictEqual(C.lireTicketTexte("plus de 2,5 buts à 1,90 sur Lens", []).cote, 1.9);
  assert.strictEqual(C.lireTicketTexte("bonjour", []), null);
  assert.strictEqual(C.coteTabac("j'ai 3,20 au tabac"), 3.2);
  const v = C.verdictTabac(p, 3.2);
  assert.match(v, /tu vois 3,20 au tabac\. Meilleure cote relevée chez les bookmakers agréés : 3,45 chez Betclic \(à 9 h 30\)\. Chance calculée par IASHARK : 27 %\./);
  assert.ok(!/en dessous|au-dessus|retient|il faut gagner/.test(v), "aucun avis, aucun calcul");
});

test("compositions : jamais « CONFIRMÉ » sans comparaison (verif1 n°5)", () => {
  const xi = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  assert.strictEqual(C.voyantComposition({ statut_match: "NS", equipes: [{ nom: "A", titulaires: xi, precedent: null }, { nom: "B", titulaires: xi, precedent: null }] }).voyant, "PUBLIÉE");
  assert.strictEqual(C.voyantComposition({ statut_match: "NS", equipes: [{ nom: "A", titulaires: xi, precedent: { titulaires: xi } }] }).voyant, "CONFIRMÉ");
  assert.strictEqual(C.voyantComposition({ statut_match: "NS", equipes: [{ nom: "A", titulaires: [1, 2, 3, 4, 5, 6, 20, 21, 22, 23, 24], precedent: { titulaires: xi } }] }).voyant, "À SURVEILLER");
  assert.strictEqual(C.voyantComposition({ statut_match: "PST", equipes: [] }).voyant, "RETIRÉ");
  assert.strictEqual(C.resultatPari({ marche: "AHH", ligne: -0.25 }, 1, 1), "moitie_perdu");
  assert.strictEqual(C.resultatPari({ marche: "X2" }, 1, 1), "gagne");
});

// ---------- 4. preuve : empreinte, bilan ----------
test("empreinte : recalculable depuis la base (heures « +00:00 », nombres, selections) et chaine verifiable", async () => {
  const p = { numero: 1, jour: "2026-10-10", famille: "simple", event_id: "e", fixture_id: 7, ligue: "Serie A", dom: "A", ext: "B", coup_envoi: "2026-10-10T13:00:00Z", fin_coup_envoi: "2026-10-10T13:00:00Z",
    marche: "1", ligne: null, selection: "A gagne", selections: [], proba: 0.55, cote_min: null, meilleure_cote: 1.74, meilleur_bookmaker: "betclic", cotes: { winamax: 1.7, betclic: 1.74 },
    cote_vue_at: "2026-10-10T07:30:00.000Z", publie_at: "2026-10-10T07:30:00.123Z", regles: "menu-2026-09-30", explication: "x" };
  p.empreinte = await C.empreintePari(p, null);
  const lu = { ...p, coup_envoi: "2026-10-10T13:00:00+00:00", fin_coup_envoi: "2026-10-10T13:00:00+00:00", cote_vue_at: "2026-10-10T07:30:00+00:00", publie_at: "2026-10-10T07:30:00.123+00:00", fixture_id: "7", cotes: { betclic: 1.74, winamax: 1.7 } };
  assert.strictEqual(await C.empreintePari(lu, null), p.empreinte);
  assert.deepStrictEqual(await C.verifierChaine([{ ...lu, empreinte: p.empreinte, empreinte_precedente: null }]), []);
  assert.strictEqual((await C.verifierChaine([{ ...lu, meilleure_cote: 1.8, empreinte: p.empreinte }])).length, 1, "une retouche se voit");
  // Combine : les selections (et leur cote prise) sont dans l'empreinte.
  const c = { ...p, famille: "combine", selections: [{ dom: "A", ext: "B", selection: "A gagne", cote: 1.3, coup_envoi: "2026-10-10T13:00:00Z" }] };
  const e = await C.empreintePari(c, null);
  assert.notStrictEqual(await C.empreintePari({ ...c, selections: [{ ...c.selections[0], cote: 1.35 }] }, null), e);
  assert.strictEqual(await C.empreintePari({ ...c, selections: [{ ...c.selections[0], coup_envoi: "2026-10-10T13:00:00+00:00" }] }, null), e);
});

test("bilan : gagnes et perdus en nombre, par type, semaine ET cumul ; ni lien, ni archive citee, ni taux", () => {
  // Stats internes (regle d'arret) : un demi-resultat compte pour moitie, rembourses exclus.
  const s = C.statsFamille([{ resultat: "moitie_perdu", proba: 0.5 }, { resultat: "perdu", proba: 0.5 }, { resultat: "rembourse", proba: 0.5 }]);
  assert.deepStrictEqual([s.paris, s.n, s.g, s.perdus, s.moitie_perdus, s.rembourses, s.reel], [2, 1.5, 0, 1, 1, 1, 0]);
  const dix = Array.from({ length: 10 }, (_, i) => ({ famille: "simple", resultat: i < 8 ? "gagne" : "perdu", proba: 0.6, numero: i + 1 }));
  const t = C.messageBilanSemaine("2026-10-05", "2026-10-11", dix.slice(0, 3), dix, { nonRegles: 2 });
  assert.match(t, /Simples<\/b> · 3 paris : 3 gagnés, 0 perdu\./);
  assert.match(t, /Depuis le début<\/b> \(depuis le n° PRO-1\)/);
  assert.match(t, /10 paris : 8 gagnés, 2 perdus\./);
  assert.match(t, /2 paris pas encore réglés/);
  assert.ok(!/historique|archiv|empreinte|<a href/i.test(t), t);
  assert.ok(!/%|annoncée|réelle|marge d'erreur|unité/.test(t), t);
});

// ---------- 5. Loto Foot et duel ----------
test("Loto Foot : grille incomplete jamais envoyee ; seulement des phrases calculees", () => {
  const g = JSON.parse(fs.readFileSync(new URL("../scripts/canal-pro/exemple-grille-loto-foot.json", import.meta.url)));
  assert.deepStrictEqual(verifierGrille(g), []);
  const trou = { ...g, matchs: g.matchs.map((m, i) => (i === 2 ? { ...m, cotes: [2.1, 3.6] } : m)) };
  assert.ok(verifierGrille(trou).some((e) => /match 3 : 3 cotes/.test(e)));
  assert.strictEqual(C.messageGrille(trou), null);
  assert.strictEqual(C.messageGrille({ ...g, releve_at: null }), null, "sans heure de releve : pas de grille");
  assert.throws(() => C.grilleATenter(trou), /incomplète/);
  const t = C.messageGrille(g);
  assert.ok(!/gain moyen|cagnotte|c'est un jeu/i.test(t), t);
  assert.match(t, /passe environ \d+,\d fois moins souvent que la grille des favoris/);
  assert.match(t, /Avec 3 doubles \(8 combinaisons\), d'après les cotes, la grille passe environ \d+,\d fois plus souvent/);
  assert.ok(!/mise|gagnants/.test(t), "ni mise ni part de gains");
});

test("duel : sans lot, empreinte entiere, choix cache avant le coup d'envoi", async () => {
  const d = { jour: "2026-10-10", dom: "Lens", ext: "Nantes", coup_envoi: KO, choix_ia: "1", sel: "abc", competition: "Ligue 1" };
  d.empreinte = await C.sha256("1|abc");
  const o = C.messageDuelOuverture(d);
  assert.ok(o.includes(d.empreinte), "empreinte entiere (64 caracteres)");
  assert.ok(!/choisi : |mois Pro|règlement/.test(o));
  assert.match(C.messageDuelRevelation(d, [{ choix: "N" }, { choix: "1" }]), /50 % ont choisi autre chose que l'IA/);
});

test("planning : heures de Paris (ete et hiver)", () => {
  assert.strictEqual(C.paris("2026-10-10T06:45:00Z").hm, "08:45");
  assert.strictEqual(C.parisVersDate("2026-11-06", "09:30").toISOString(), "2026-11-06T08:30:00.000Z");
  assert.strictEqual(C.actionProgramme(null, new Date("2026-10-10T06:15:00Z")), "preparer");
  assert.strictEqual(C.actionProgramme({ statut: "attente" }, new Date("2026-10-10T08:30:00Z")), "rappeler");
  assert.strictEqual(C.actionProgramme({ statut: "attente" }, new Date("2026-10-10T10:00:00Z")), "expirer");
  assert.strictEqual(C.actionProgramme({ statut: "valide" }, new Date("2026-10-10T07:00:00Z")), null, "pas avant 9 h 30");
  assert.strictEqual(C.actionProgramme({ statut: "reporte" }, new Date("2026-10-10T08:00:00Z")), "publier", "reporte : on reessaie");
  assert.ok(C.tachesDues(new Date("2026-10-11T21:15:00Z")).includes("debrief_soir"), "dimanche 23 h 15");
  assert.ok(C.tachesDues(new Date("2026-10-10T08:45:00Z")).includes("debrief_matin"), "debrief du matin rattrape jusqu'a 11 h");
});

// ---------- 6. journees completes, fausse base et faux Telegram ----------
function journee({ ouvert = true, panneCanal = [], statutPanne = 429, prefsForm = { bookmakers: ["winamax"], limite_paris_jour: 5 }, reglages = [] } = {}) {
  let heure = "2026-10-10T06:15:00Z";
  const cotesDuMoment = { betclic_fr: 1.74, winamax_fr: 1.7 };
  const etat = { panne: false, probaPin: 0.53, appels: 0 };
  const db = new BaseMemoire({
    telegram_settings: [...(ouvert ? [{ key: "canal_pro_mode", value: "ouvert" }] : []), ...reglages],
    users: [{ id: "u1", plan: "pro", role: "customer" }, { id: "u2", plan: "free", role: "customer" }],
    telegram_abonnes: [{ user_id: "u1", chat_id: 555, prenom: "Karim", reglages: {}, bloque: false }, { user_id: "u2", chat_id: 666, prenom: "Ex", reglages: {}, bloque: false }],
    pro_preferences: [{ user_id: "u1", ...prefsForm }],
  });
  const tg = fauxTelegram({ panneCanal, statutPanne });
  const src = {
    candidats: async (jour, d) => menuTorino(jour, d),
    etatsParis: async (paris) => {
      etat.appels++;
      if (etat.panne) { const e = new Error("The Odds API odds : 401 quota"); e.status = 401; throw e; }
      return Object.fromEntries(paris.map((p) => [p.id, { cotes: { ...cotesDuMoment }, pinnacle_proba: etat.probaPin, pinnacle_cote: 1.8 }]));
    },
    composition: async () => ({ statut_match: "NS", equipes: [{ nom: "Torino", titulaires: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], precedent: { titulaires: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] } }] }),
    meteo: async () => ({ ville: "Turin", prevision: { rain: { "3h": 10 }, wind: { speed: 4 }, main: { temp: 15 } } }),
    resultat: async () => ({ statut: "FT", bd: 2, be: 1, faits: null }),
    matchDuel: async () => null,
  };
  const ancre = path.join(os.tmpdir(), `iashark-ancre-test-${Math.random().toString(16).slice(2)}.txt`);
  const deps = { db, tg, src, maintenant: () => new Date(heure), env: { ADMIN: 42, CANAL_GRATUIT: "@iasharkdata", ANCRE_FICHIER: ancre }, log: () => {} };
  db.horloge = () => new Date(heure); // comme la base : preuve d'envoi refusee apres le coup d'envoi
  const valider = () => db.update("pro_programmes", { jour: "2026-10-10" }, { statut: "valide", valide_at: "2026-10-10T07:00:00Z" });
  return { db, tg, deps, cotesDuMoment, etat, ancre, valider, a: (h) => { heure = h; } };
}

test("journee : rien ne part sans le clic de Clement ; sans clic a 12 h, rien du tout", async () => {
  const j = journee();
  j.a("2026-10-10T06:15:00Z"); await T.tourner(j.deps);
  assert.strictEqual(lesMessages(j.tg).length, 0);
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps);
  const m = lesMessages(j.tg);
  assert.strictEqual(m.length, 1);
  assert.match(m[0].text, /Programme du samedi 10 octobre à valider/);
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  assert.strictEqual(lesMessages(j.tg).length, 1, "9 h 30 sans clic : rien ne part");
  j.a("2026-10-10T08:30:00Z"); await T.tourner(j.deps);
  assert.match(lesMessages(j.tg)[1].text, /^<b>Rappel/);
  j.a("2026-10-10T10:00:00Z"); await T.tourner(j.deps);
  assert.match(lesMessages(j.tg).at(-1).text, /Pas de clic avant 12 h/);
  assert.ok(!lesMessages(j.tg).some((x) => estRegistre(x) || x.chat === 555));
});

test("journee ouverte : publication, envoi reel, alerte, meteo, composition proposee, reglement, debrief propose, ancre", async () => {
  const j = journee();
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps);
  await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  const canal = registre(j.tg);
  assert.strictEqual(canal.length, 2, "en-tete + 1 pari");
  assert.match(canal[1].text, /^<b>SIMPLE<\/b>\n/);
  assert.match(canal[0].text, /Journée calme : un seul pari passe nos critères aujourd'hui\. On ne force pas\./);
  assert.match(canal[1].text, /\nN° PRO-1$/);
  assert.ok(!lesMessages(j.tg).some((x) => x.chat !== 42 && /historique|archiv|empreinte/i.test(x.text)), "l'archive reste interne : jamais citee aux abonnes");
  const [pari] = await j.db.select("pro_paris", {});
  assert.deepStrictEqual([pari.mode, pari.destination, pari.numero, !!pari.canal_message_id], ["ouvert", "42", 1, true]);
  assert.match(pari.publie_at, /\+00:00$/, "heure posee par la base");
  assert.deepStrictEqual(await C.verifierChaine([pari]), [], "empreinte recalculee depuis la base");
  await assert.rejects(j.db.update("pro_paris", { id: pari.id }, { meilleure_cote: 9 }), /archive figee/);
  await assert.rejects(j.db.update("pro_paris", { id: pari.id }, { ligue: "X" }), /archive figee/);
  const perso = lesMessages(j.tg).filter((x) => x.chat === 555);
  // En prive (03/10/2026) : UN seul message, son programme : les memes paris que le registre, la cote chez SES bookmakers (Winamax).
  assert.strictEqual(perso.length, 1, "un seul message : plus de « programme commun + programme perso »");
  assert.match(perso[0].text, /^<b>Karim, ton programme du samedi<\/b> · 1 simple\nJournée calme/);
  assert.match(perso[0].text, /meilleure cote chez tes bookmakers \(Winamax\)/);
  assert.match(perso[0].text, /Sélection : <b>Torino gagne<\/b>\nChance calculée par IASHARK : 55 %\.\nCote : <b>1,70<\/b> chez Winamax · relevée à 9 h 30\nN° PRO-1/);
  assert.ok(registre(j.tg)[1].text.includes("Chance calculée par IASHARK : 55 %."), "meme chance que le registre");
  assert.ok(!lesMessages(j.tg).some((x) => x.chat === 666), "un compte qui n'est plus Pro ne recoit rien");
  const releves = await j.db.select("pro_cotes_releves", {});
  assert.ok(releves.some((r) => r.bookmaker === "pinnacle" && r.proba_sans_marge === 0.53), "cote Pinnacle sans marge enregistree");
  await assert.rejects(j.db.update("pro_cotes_releves", {}, { cote: 9 }), /ajout seulement/);
  j.cotesDuMoment.winamax_fr = 1.62;
  j.a("2026-10-10T09:30:00Z"); await T.tourner(j.deps);
  assert.match(lesMessages(j.tg).filter((x) => x.chat === 555).at(-1).text, /Cote en baisse<\/b> : Torino gagne \(Torino – Udinese\) est passé de 1,70 à 1,62 chez Winamax/);
  j.a("2026-10-10T10:00:00Z"); await T.tourner(j.deps);
  assert.strictEqual(lesMessages(j.tg).filter((x) => x.chat === 555 && /Cote en baisse/.test(x.text)).length, 1, "une seule alerte par pari");
  assert.match(lesMessages(j.tg).filter((x) => x.chat === 555).at(-1).text, /Météo prévue à Turin .* forte pluie\. C'est une information/);
  // 14 h : la composition part EN PRIVE a l'abonne (message personnel, sa meilleure cote), sans proposition a Clement.
  const avantRegistre = registre(j.tg).length, avantClement = lesMessages(j.tg).filter((x) => x.chat === 42).length;
  j.a("2026-10-10T12:00:00Z"); await T.tourner(j.deps);
  assert.strictEqual(registre(j.tg).length, avantRegistre, "rien de plus au registre");
  assert.strictEqual(lesMessages(j.tg).filter((x) => x.chat === 42).length, avantClement, "plus de composition proposee a Clement (doublon du message personnel)");
  assert.match(lesMessages(j.tg).filter((x) => x.chat === 555).at(-1).text, /^Torino – Udinese \(15 h\) : composition <b>CONFIRMÉ<\/b>\. Rien de notable[\s\S]*Chez toi : 1,62 chez Winamax\./);
  // 17 h : reglement ; cote de fin sans Pinnacle, Pinnacle de fin gardee pour la CLV.
  j.a("2026-10-10T15:00:00Z"); await T.tourner(j.deps);
  const [regle] = await j.db.select("pro_paris", {});
  assert.deepStrictEqual([regle.resultat, regle.cote_fin, regle.pinnacle_proba_fin], ["gagne", 1.74, 0.53]);
  await assert.rejects(j.db.update("pro_paris", { id: pari.id }, { resultat: "perdu" }), /deja renseigne/, "perdu ne devient jamais gagne");
  j.a("2026-10-10T21:30:00Z"); await T.tourner(j.deps);
  const deb = lesMessages(j.tg).filter((x) => x.chat === 42).at(-1);
  assert.match(deb.text, /Débrief du samedi<\/b> · 1 pari : 1 gagné, 0 perdu\./);
  assert.ok(!/historique|archiv|empreinte|<code>/i.test(deb.text), "ni historique, ni archive, ni empreinte dans le debrief");
  assert.deepStrictEqual(deb.a.corps.reply_markup.inline_keyboard[0].map((b) => b.callback_data), ["pubpro::debrief-soir-2026-10-10"], "obligatoire : pas de « Ne pas publier »");
  assert.match(fs.readFileSync(j.ancre, "utf8"), new RegExp(`^2026-10-10 PRO-1 ${pari.empreinte}`));
  fs.rmSync(j.ancre);
});

test("journee : automatique ecrit par Clement pour un type -> envoye directement en prive aux abonnes", async () => {
  const j = journee({ reglages: [{ key: "auto_debriefs", value: "oui" }] });
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  j.a("2026-10-10T15:00:00Z"); await T.tourner(j.deps);
  j.a("2026-10-10T21:30:00Z"); await T.tourner(j.deps);
  const c = lesMessages(j.tg).filter((x) => x.chat === 555 && /Débrief du samedi/.test(x.text));
  assert.strictEqual(c.length, 1, "debrief envoye en prive, sans clic");
  assert.strictEqual(c[0].a.corps.disable_notification, true, "la nuit : sans sonnerie");
  assert.ok(!lesMessages(j.tg).some((x) => x.chat === 42 && /À envoyer \? \(debriefs/.test(x.text)), "rien a cliquer");
  assert.ok(!Object.keys(C.TYPES_PUBLICS).includes("compositions"), "compositions : messages personnels, plus de type a publier");
});

test("journee RODAGE : mode enregistre, aucun numero PRO, tout chez Clement (verif2 C)", async () => {
  const j = journee({ ouvert: false });
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  const [p] = await j.db.select("pro_paris", {});
  assert.deepStrictEqual([p.mode, p.destination, p.numero ?? null, p.empreinte ?? null], ["rodage", "42", null, null]);
  const m = lesMessages(j.tg);
  assert.ok(m.every((x) => x.chat === 42));
  assert.ok(!m.some((x) => /N° PRO/.test(x.text)));
  assert.ok(m.some((x) => x.text.startsWith("<b>[RODAGE · messages Pro]</b>")));
  assert.ok(!m.some(estRegistre), "rodage : jamais l'etiquette REGISTRE (rien ne part aux abonnes)");
  j.a("2026-10-10T21:30:00Z"); await T.tourner(j.deps);
  assert.ok(lesMessages(j.tg).every((x) => x.chat === 42));
});

test("API des cotes en panne a la publication : rien n'est publie, Clement prevenu, « programme reporte » (verif2 B)", async () => {
  const j = journee();
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  j.etat.panne = true;
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  assert.strictEqual((await j.db.select("pro_programmes", {}))[0].statut, "reporte");
  assert.ok(!lesMessages(j.tg).some(estRegistre), "rien au canal");
  assert.ok(!lesMessages(j.tg).some((x) => /Aucun pari ne passe nos critères/.test(x.text)));
  assert.ok(lesMessages(j.tg).some((x) => x.chat === 42 && /Programme reporté<\/b> : l'API des cotes/.test(x.text)));
  assert.ok(lesMessages(j.tg).some((x) => x.chat === 42 && /Programme du samedi reporté/.test(x.text) && x.a.corps.reply_markup), "« programme reporte » propose a Clement (envoi prive aux abonnes)");
  assert.strictEqual((await j.db.select("pro_paris", {}))[0].numero ?? null, null);
  j.etat.panne = false;
  j.a("2026-10-10T07:45:00Z"); await T.tourner(j.deps);
  assert.strictEqual(registre(j.tg).length, 2, "l'API revient : le programme part");
});

test("API des cotes en panne a la preparation : jamais « aucun pari ne passe nos criteres »", async () => {
  const j = journee();
  j.deps.src.candidats = async () => { throw new Error("The Odds API odds : 429"); };
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps);
  assert.strictEqual((await j.db.select("pro_programmes", {})).length, 0);
  assert.match(lesMessages(j.tg)[0].text, /Programme reporté<\/b> : l'API des cotes ne répond pas/);
  assert.strictEqual(lesMessages(j.tg).length, 1, "avant 9 h 30 : seulement l'alerte a Clement");
  // 9 h 30, toujours en panne : « programme reporte » propose (bouton Publier), une seule fois.
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  j.a("2026-10-10T07:45:00Z"); await T.tourner(j.deps);
  const rep = lesMessages(j.tg).filter((x) => /Programme du samedi reporté/.test(x.text));
  assert.strictEqual(rep.length, 1);
  assert.strictEqual(rep[0].chat, 42);
  assert.deepStrictEqual(rep[0].a.corps.reply_markup.inline_keyboard[0].map((b) => b.callback_data), ["pubpro::reporte-2026-10-10", "non:reporte-2026-10-10"]);
  assert.match(rep[0].text, /sinon, il n'y a pas de programme aujourd'hui/);
  assert.ok(!lesMessages(j.tg).some((x) => estRegistre(x) || /Aucun pari ne passe nos critères/.test(x.text)));
});

test("Telegram refuse (429) : pari pas parti = compte nulle part, renvoye avant le match, Clement prevenu (verif2 D)", async () => {
  const j = journee({ panneCanal: [2, 3] }); // 429 : le pari est refuse, puis sa 1re relance dans le meme tour
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  let [p] = await j.db.select("pro_paris", {});
  assert.deepStrictEqual([p.numero, p.canal_message_id ?? null], [1, null]);
  assert.ok(lesMessages(j.tg).some((x) => x.chat === 42 && /1 pari pas parti/.test(x.text)));
  assert.ok(!lesMessages(j.tg).some((x) => x.chat === 555), "pas de message personnel pour un pari pas parti");
  j.a("2026-10-10T07:45:00Z"); await T.tourner(j.deps);
  [p] = await j.db.select("pro_paris", {});
  assert.ok(p.canal_message_id, "renvoye au tour suivant");
  assert.match(registre(j.tg).at(-1).text, /Envoi retardé/);
  assert.ok(lesMessages(j.tg).some((x) => x.chat === 555 && /Ajout à ton programme/.test(x.text)));
});

test("Telegram refuse jusqu'au coup d'envoi : jamais parti, jamais regle ; le debrief dit « sans preuve d'envoi, pas compte »", async () => {
  const j = journee();
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  j.deps.tg = async (m, c) => { if (m === "sendMessage" && String(c.text).startsWith(T.ETIQUETTE_REGISTRE)) { const e = new Error("sendMessage: 403"); e.status = 403; throw e; } return j.tg(m, c); };
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  j.a("2026-10-10T12:58:00Z"); await T.tourner(j.deps);
  assert.ok(lesMessages(j.tg).some((x) => x.chat === 42 && /n'est jamais parti avant le coup d'envoi : il ne compte nulle part/.test(x.text)));
  j.a("2026-10-10T21:30:00Z"); await T.tourner(j.deps);
  const [p] = await j.db.select("pro_paris", {});
  assert.strictEqual(p.resultat ?? null, null, "jamais regle");
  const deb = lesMessages(j.tg).filter((x) => /Débrief du samedi/.test(x.text));
  assert.strictEqual(deb.length, 1, "le debrief est propose (obligatoire)");
  assert.match(deb[0].text, /Sans preuve d'envoi avant le match, donc comptés nulle part \(ni résultat, ni bilan\) : N° PRO-1 \(Torino – Udinese\)/);
  assert.ok(!/gagné|perdu/.test(deb[0].text.split("Sans preuve")[0]), "aucun resultat annonce pour lui");
});

test("tours GitHub en retard : le releve des cotes ne saute plus (verif2 E)", async () => {
  const j = journee();
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  const res = [];
  // MODE ECONOMIE (03/10/2026) : suivi toutes les T.SUIVI_COTES_MIN (55) minutes au lieu de 25,
  // toujours d'apres l'heure du DERNIER releve : un tour en retard ne fait rien sauter.
  assert.strictEqual(T.SUIVI_COTES_MIN, 55, "config/quotas.json#odds_api.canal_pro_suivi_cotes_minutes");
  for (const h of ["2026-10-10T08:27:00Z", "2026-10-10T08:47:00Z", "2026-10-10T09:24:00Z", "2026-10-10T10:21:00Z"]) { j.a(h); res.push(!!(await T.tourner(j.deps)).cotes); }
  assert.deepStrictEqual(res, [true, false, true, true]);
});

test("garde-fou a 0 : ni programme personnel ni alerte ni composition", async () => {
  const j = journee({ prefsForm: { bookmakers: ["winamax"], limite_paris_jour: 0 } });
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  j.cotesDuMoment.winamax_fr = 1.62;
  for (const h of ["2026-10-10T09:30:00Z", "2026-10-10T10:00:00Z", "2026-10-10T12:00:00Z"]) { j.a(h); await T.tourner(j.deps); }
  assert.strictEqual(lesMessages(j.tg).filter((x) => x.chat === 555).length, 0);
});

test("bilan du lundi : obligatoire (pas de bouton « Ne pas publier »), note a part, repropose jusqu'a sa publication", async () => {
  const j = journee();
  await j.db.insert("pro_programmes", [{ jour: "2026-10-10", statut: "publie" }]);
  await j.db.insert("pro_paris", [{ id: "p1", jour: "2026-10-10", numero: 1, famille: "simple", publie_at: "x", mode: "ouvert", canal_message_id: 5, resultat: "gagne", proba: 0.55, coup_envoi: KO },
    { id: "p2", jour: "2026-10-10", numero: 2, famille: "simple", publie_at: "x", mode: "ouvert", canal_message_id: null, resultat: null, proba: 0.55, coup_envoi: KO }]);
  j.a("2026-10-12T10:30:00Z"); await T.tacheBilanSemaine(T.creerContexte(j.deps));
  const b = lesMessages(j.tg).find((x) => /Bilan de la semaine/.test(x.text));
  assert.match(b.text, /Simples<\/b> · 1 pari : 1 gagné, 0 perdu/, "le pari jamais envoye ne compte pas");
  assert.deepStrictEqual(b.a.corps.reply_markup.inline_keyboard[0].map((x) => x.callback_data), ["pubpro::bilan-2026-10-12"]);
  assert.ok(!/archive des paris envoyés/.test(b.text), "la note n'est pas dans le message a publier");
  // 3 h plus tard, toujours pas publie : le MEME texte est repropose, l'ancienne copie perd son bouton.
  j.a("2026-10-12T11:30:00Z"); assert.strictEqual(await T.tacheAPublier(T.creerContexte(j.deps)), null, "pas avant 3 h");
  j.a("2026-10-12T13:30:00Z"); await T.tacheAPublier(T.creerContexte(j.deps));
  const copies = lesMessages(j.tg).filter((x) => /Bilan de la semaine/.test(x.text));
  assert.deepStrictEqual([copies.length, copies[1].text === b.text, copies[1].a.corps.reply_markup.inline_keyboard[0][0].callback_data], [2, true, "pubpro::bilan-2026-10-12"]);
  assert.match(lesMessages(j.tg).at(-2).text, /Rappel n° 1 : ce message n'est toujours pas envoyé/);
  assert.ok(j.tg.appels.some((a) => a.methode === "editMessageReplyMarkup" && a.corps.message_id === b.a.message_id), "l'ancienne copie perd son bouton");
  // Publie (le robot Telegram pose publie:k:<cle>) : plus aucune relance.
  await j.db.insert("telegram_settings", [{ key: "publie:k:bilan-2026-10-12", value: "x" }]);
  j.a("2026-10-12T17:00:00Z"); await T.tacheAPublier(T.creerContexte(j.deps));
  assert.strictEqual(lesMessages(j.tg).filter((x) => /Bilan de la semaine/.test(x.text)).length, 2);
  assert.strictEqual((await j.db.select("telegram_settings", { key: ["like", "a_publier:*"] })).length, 0);
  // Le clic est fait : le robot planifie rattrape l'envoi prive (si le robot Telegram ne l'a pas fini), une seule fois.
  await T.tacheDiffusions(T.creerContexte(j.deps));
  await T.tacheDiffusions(T.creerContexte(j.deps));
  const recu = lesMessages(j.tg).filter((x) => x.chat === 555 && /Bilan de la semaine/.test(x.text));
  assert.strictEqual(recu.length, 1, "bilan recu en prive, une fois");
  assert.strictEqual(recu[0].text, b.text, "le meme texte que celui valide par Clement");
  assert.ok(!lesMessages(j.tg).some((x) => x.chat === 666), "un compte qui n'est plus Pro ne recoit rien");
});

test("Loto Foot : proposee a Clement la veille a 18 h, grille incomplete signalee et jamais envoyee", async () => {
  const j = journee();
  const g = JSON.parse(fs.readFileSync(new URL("../scripts/canal-pro/exemple-grille-loto-foot.json", import.meta.url)));
  delete g._note;
  await j.db.insert("loto_foot_grilles", [g, { ...g, id: "trou", nom: "Trou", matchs: g.matchs.slice(0, 5) }]);
  const ctx = () => T.creerContexte(j.deps);
  j.a("2026-11-06T16:00:00Z"); await T.tacheLotoFoot(ctx());
  assert.strictEqual(lesMessages(j.tg).length, 0);
  j.a("2026-11-06T17:00:00Z"); await T.tacheLotoFoot(ctx());
  j.a("2026-11-06T17:15:00Z"); await T.tacheLotoFoot(ctx());
  assert.ok(!lesMessages(j.tg).some(estRegistre), "rien sans clic");
  const prop = lesMessages(j.tg).filter((x) => /Notre grille à tenter/.test(x.text));
  assert.strictEqual(prop.length, 1);
  assert.strictEqual(prop[0].a.corps.reply_markup.inline_keyboard[0][0].callback_data, `pubpro::loto-${g.id}`);
  assert.ok(lesMessages(j.tg).some((x) => /La grille Trou est incomplète : elle n'est pas envoyée/.test(x.text)));
  assert.ok(!lesMessages(j.tg).some((x) => x.chat === 555), "pas d'envoi personnel de la grille");
});

test("duel : propose sans montrer le choix de l'IA, revelation et resultat proposes (bouton pubg)", async () => {
  const j = journee();
  j.deps.src.matchDuel = async () => ({ fixture_id: 9, dom: "Lens", ext: "Nantes", competition: "Ligue 1", coup_envoi: "2026-10-10T19:00:00Z", p1: 52, pn: 27, p2: 21 });
  const ctx = () => T.creerContexte(j.deps);
  j.a("2026-10-10T08:00:00Z"); await T.tacheDuel(ctx());
  const prop = lesMessages(j.tg);
  assert.ok(prop.every((x) => x.chat === 42));
  assert.ok(!prop.some((x) => /Lens\.<\/i>|choix de l'IA \(visible|: Lens/.test(x.text)), "Clement ne voit pas le choix");
  const [d] = await j.db.select("duel_manches", {});
  assert.strictEqual(d.empreinte, await C.sha256(`1|${d.sel}`));
  await assert.rejects(j.db.update("duel_manches", { jour: d.jour }, { choix_ia: "2" }), /scelle/);
  await j.db.update("duel_manches", { jour: d.jour }, { statut: "ouvert", message_id: 7, chat_id: "@iasharkdata" });
  await j.db.insert("duel_votes", [{ jour: d.jour, telegram_user_id: 1, choix: "N", vote_at: "x" }, { jour: d.jour, telegram_user_id: 2, choix: "1", vote_at: "y" }]);
  j.a("2026-10-10T19:00:00Z"); await T.tacheDuel(ctx());
  const rev = lesMessages(j.tg).at(-1);
  assert.match(rev.text, /L'IA a choisi : <b>Lens<\/b>/);
  assert.strictEqual(rev.chat, 42);
  assert.deepStrictEqual(rev.a.corps.reply_markup.inline_keyboard[0].map((b) => b.callback_data), ["pubg:7:duel-revele-2026-10-10"], "obligatoire, sous le message du duel");
  j.deps.src.resultat = async () => ({ statut: "FT", bd: 2, be: 0 });
  j.a("2026-10-11T07:00:00Z"); await T.tacheDuel(ctx());
  const res = lesMessages(j.tg).at(-1);
  assert.match(res.text, /Lens – Nantes 2-0\nL'IA avait choisi Lens : trouvé/);
  assert.deepStrictEqual(res.a.corps.reply_markup.inline_keyboard[0].map((b) => b.callback_data), ["pubg::duel-resultat-2026-10-10"], "un duel rate ne peut pas etre cache");
});

test("ma semaine en image : aucun montant en euros, seulement les chiffres de l'abonne", () => {
  const r = resumeSemaine([{ pari_id: "a", cote: 3.3, mise: 10 }, { pari_id: "b", cote: 2, mise: 10 }, { pari_id: null, cote: 5 }],
    { a: { resultat: "gagne" }, b: { resultat: "perdu" } });
  assert.deepStrictEqual([r.notes, r.regles, r.gagnes, r.perdus], [3, 2, 1, 1]);
  const h = carteHtml("Karim", "2026-10-05", "2026-10-11", r);
  assert.ok(!/€|euro|cote de fin|IASHARK a/i.test(h), h);
});

// ---------- 7. Edge Function (lecture du code : pas de Deno dans les tests) ----------
test("Edge Function : rodage etanche, faille tabacClic fermee, regressions corrigees, photo coupee", () => {
  const src = fs.readFileSync(new URL("../supabase/functions/telegram-bot/index.ts", import.meta.url), "utf8");
  for (const p of ["pp:", "dp:", "dv:", "tk:", "tb:", "rg:", "cp:", "ac:"]) assert.ok(src.includes(`d.startsWith("${p}")`), p);
  assert.match(src, /\.eq\("mode", "ouvert"\)\.not\("canal_message_id", "is", null\)/, "les abonnes ne lisent que les paris envoyes avec les envois Pro ouverts");
  const tabac = src.slice(src.indexOf("async function tabacClic"), src.indexOf("async function reglageClic"));
  assert.match(tabac, /clicPrive\(cq\)/);
  assert.match(tabac, /ab\?\.actif/);
  assert.match(tabac, /html\(cq\.from\.id/);
  assert.ok(!/cq\.message\.chat\.id, C\.verdictTabac/.test(src));
  // Deux robots (03/10/2026) : le robot Pro ne recoit plus de questions. Texte libre = reponse automatique,
  // rien n'est transfere a Clement (comportement verifie dans tests/telegram-deux-robots.test.mjs).
  assert.match(src, /Texte libre, photo, vocal…[^\n]*\n\s*if \(!texte\.startsWith\("\/"\) \|\| !m\.text\) \{ await reponseAuto\(chat, lang\); return; \}/);
  const perso = src.slice(src.indexOf("async function robotPerso"), src.indexOf("async function ticketClic"));
  assert.ok(!/transfererAClement|tgc\(/.test(perso), "le robot Pro ne transfere rien a Clement");
  assert.match(src, /\/\^\\\/canal\\b\/\.test\(texte\)\) \{ await html\(chat, R\.plusDeCanal\)/, "commande /canal : plus de canal, tout arrive en prive");
  for (const x of ["vip_chat_id", "createChatInviteLink", "banChatMember", "telegram_vip_members", "TELEGRAM_CANAL_PRO_ES", "u.chat_member"]) assert.ok(!src.includes(x), `plus de canal Pro : ${x}`);
  assert.ok(!/getFile|Anthropic|ANTHROPIC_API_KEY/.test(src), "aucune photo lue par le robot (plus de tickets ecrits au robot)");
  assert.match(src, /Date\.parse\(p\.coup_envoi\) <= Date\.now\(\)[\s\S]{0,300}R\.tropTard/);
  assert.match(LANGUES_SRC, /tropTard: "Trop tard : le match a commencé, ce ticket n'est pas noté\."/);
  assert.match(src, /if \(genre === "pubpro"\) return envoyerProClic/, "message Pro : envoi prive, jamais dans un canal");
  assert.match(src, /if \(genre === "pubg"\) \{[\s\S]{0,200}rodage/);
  const envoi = src.slice(src.indexOf("async function envoyerProClic"), src.indexOf("async function deplacerTextes"));
  assert.match(envoi, /if \(!\(await modeCanalPro\(\)\)\.ouvert\)[^\n]*rodage/, "rodage : rien n'est envoye aux abonnes");
  assert.ok(envoi.indexOf("publie:k:") < envoi.indexOf("diffuserCle("), "la cle « publie:k » est posee AVANT l'envoi (double clic = un envoi)");
  assert.match(src, /reglage\("dernier_tour_canal_pro"\)[\s\S]{0,120}35 \* 60000[\s\S]{0,200}n'a pas tourné/, "au clic Valider : alerte si le robot planifie ne tourne plus (verif2 E)");
  const wf = fs.readFileSync(new URL("../.github/workflows/telegram-bot.yml", import.meta.url), "utf8");
  assert.ok(!/ANTHROPIC_API_KEY=/.test(wf), "la cle de lecture des photos n'est pas installee");
});

test("Edge Function (contre-controle) : publication unique des messages obligatoires, /automatique, preuve transferee, support, accueil vrai", () => {
  const src = fs.readFileSync(new URL("../supabase/functions/telegram-bot/index.ts", import.meta.url), "utf8");
  // Une cle par message obligatoire, la meme pour toutes ses copies reproposees.
  assert.match(src, /const \[genre, cibleReponse, cleObligatoire\] = String\(cq\.data\)\.split\(":"\)/);
  assert.match(src, /const garde = cleObligatoire \? `publie:k:\$\{cleObligatoire\}` : `publie:\$\{msg\.message_id\}`/);
  assert.match(src, /\.delete\(\)\.eq\("key", garde\)/, "publication ratee : la cle est retiree");
  // Automatique : un bouton par type, eteint tant que Clement ne l'allume pas.
  assert.match(src, /texte\.startsWith\("\/automatique"\)/);
  assert.match(src, /d\.startsWith\("au:"\)\) return autoClic/);
  assert.match(src, /\(await reglage\(`auto_\$\{type\}`\)\) === "oui"/);
  // Envoi incertain : preuve par transfert du message du Canal Pro (date Telegram entre l'archivage et le coup d'envoi), ou « Renvoyer ».
  assert.match(src, /if \(m\.forward_origin && await preuveTransferee\(m\)\) return;/);
  assert.match(src, /envoye >= Date\.parse\(p\.publie_at\) - 60000 && envoye < Date\.parse\(p\.coup_envoi\)/);
  assert.match(src, /d\.startsWith\("ep:re:"\)\) return renvoiClic/);
  // Plus de tickets ecrits au robot Pro (03/10/2026) : texte libre = reponse automatique.
  assert.ok(!/return proposerTicket/.test(src));
  // Accueil du robot : pas de promesse de programme a 9 h 30 en rodage (canal-pro-accueil.mjs, teste dans canal-pro-prive.test.mjs).
  const accueil = src.slice(src.indexOf("async function lierCompte"), src.indexOf("async function robotPerso"));
  assert.match(accueil, /A\.bienvenue\(lang, \{ prenom, ouvert \}\)/);
  assert.match(accueil, /if \(await reglage\(`accueil:\$\{ab\.user_id\}`\)\) \{\n\s+await html\(m\.chat\.id, A\.retour\(lang, prenom\)\);\n\s+if \(o\.etape\) await reposerObligatoire\(m\.chat\.id, ab, lang, o\);\n\s+return;/,
    "deja accueilli : pas de nouveau questionnaire (seulement la question obligatoire en attente, s'il en reste une)");
  assert.ok(!/Chaque matin à 9 h 30, je t'envoie/.test(src));
});

test("migration : verrou etendu, heure posee par la base, releves en ajout seul, duel scelle, lecture des seuls paris envoyes", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/0040_canal_pro.sql", import.meta.url), "utf8");
  for (const x of ["date_trunc('milliseconds', now())", "check (publie_at is null or publie_at < coup_envoi)", "check (numero is null or mode = 'ouvert')",
    "'resultat','cote_fin'", "'ligue'", "'explication'", "pro_cotes_releves_ajout_seulement", "duel_manches_scelle", "mode = 'ouvert' and canal_message_id is not null", "proba_sans_marge"])
    assert.ok(sql.includes(x), x);
});

test("migration = contrat des tables : pro_preferences, colonnes lisibles par le site, notes internes jamais lisibles", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/0040_canal_pro.sql", import.meta.url), "utf8");
  const table = (nom) => sql.slice(sql.indexOf(`create table if not exists public.${nom} (`), sql.indexOf(");", sql.indexOf(`create table if not exists public.${nom} (`)));
  const pref = table("pro_preferences");
  for (const c of ["pays text not null default 'fr' check (pays in ('fr','gb','mx','za','autre'))", "bookmakers text[]", "strategie text", "familles text[] not null default '{simple,combine,buteur,fun}'",
    "cote_min_perso numeric", "limite_paris_jour int not null default 5 check (limite_paris_jour between 0 and 50)", "programme_prive boolean", "alertes text[] not null default '{seuil,hausse,compositions,meteo}'"])
    assert.ok(pref.includes(c), c);
  assert.ok(!/cagnotte|perte_max|preferences_pro/.test(pref), "rien que le robot ne lit pas");
  assert.match(table("pro_programmes"), /non_evalues jsonb/);
  assert.match(table("pro_programmes"), /motif_vide in \('regles','regles_partiel','aucun_match','controle','retires'\)/);
  for (const m of ["regles", "regles_partiel", "aucun_match", "controle", "retires"]) assert.ok(C.MOTIFS_VIDE[m] && table("pro_programmes").includes(`'${m}'`), `motif ${m} : texte ET autorise par la base`);
  assert.match(table("pro_paris"), /envoi_tente_at timestamptz/);
  assert.match(sql, /from anon, authenticated;/, "tout est retire au navigateur, puis rendu colonne par colonne");
  const lisPro = sql.match(/grant select \(([^)]*)\) on public\.pro_paris to authenticated/)[1];
  for (const c of C.CHAMPS_ARCHIVE) assert.ok(lisPro.includes(c), `${c} lisible : l'empreinte se recalcule`);
  for (const c of ["destination", "canal_message_id", "envoi_tente_at", "composantes", "faits", "debrief"]) assert.ok(!new RegExp(`\\b${c}\\b`).test(lisPro), `${c} n'est pas lisible`);
  assert.match(sql, /grant select \(jour, statut, mode, motif_vide, publie_at\) on public\.pro_programmes to authenticated/);
  assert.match(sql, /statut = 'publie' and mode = 'ouvert'/);
  assert.match(sql, /pro_preferences_ajout_soi[\s\S]{0,200}u\.plan in \('pro','famille'\)/, "un compte gratuit n'ecrit rien");
});

test("contrat pro_preferences : le robot lit exactement les colonnes du contrat (alertes en liste, garde-fou 0, pays)", () => {
  const p = C.preferencesEffectives({ pays: "fr", bookmakers: ["winamax", "zebet"], strategie: "perso", familles: ["simple", "fun"], cote_min_perso: 1.6,
    limite_paris_jour: 0, programme_prive: false, alertes: ["seuil", "nuit"] }, {});
  // 03/10/2026 (decision de Clement) : plus de strategie ni de types de paris : les memes paris pour tous.
  assert.deepStrictEqual([p.pays, p.bookmakers, p.strategie, p.familles, p.cote_min_perso, p.limite_paris_jour, p.programme_prive],
    ["FR", ["winamax"], "iashark", ["simple", "combine", "buteur", "fun"], null, 0, false]);
  assert.deepStrictEqual(C.preferencesEffectives({ familles: ["nuls", "sure"] }).familles, ["simple", "combine", "buteur", "fun"], "anciennes cles (Prudent, Valeur, Nuls) ignorees : tout le menu");
  const sql = fs.readFileSync(new URL("../supabase/migrations/0040_canal_pro.sql", import.meta.url), "utf8");
  assert.match(sql, /check \(familles <@ array\['simple','combine','buteur','fun','sure','valeur','nuls'\]::text\[\]\)/, "le formulaire actuel de l'espace Pro n'est pas bloque");
  assert.deepStrictEqual(p.alertes, { seuil: true, hausse: false, compositions: false, meteo: false, nuit: true });
  assert.deepStrictEqual(C.preferencesEffectives(null, {}).alertes, { seuil: true, hausse: true, compositions: true, meteo: true, nuit: false }, "pas de ligne : defauts");
  assert.strictEqual(C.preferencesEffectives({ alertes: ["seuil"] }).alertes.hausse, false, "une seule source : la ligne pro_preferences (ronde 4)");
  const horsFrance = C.messageProgrammeAbonne("2026-10-10", [{ famille: "simple", ligue: "Serie A", dom: "Torino", ext: "Udinese", coup_envoi: "2026-10-10T13:00:00Z", marche: "1", proba: 0.55, meilleure_cote: 1.74, meilleur_bookmaker: "betclic", cotes: { betclic: 1.74 }, cote_vue_at: "2026-10-10T07:30:00Z", selection: "Torino gagne", selections: [] }], C.preferencesEffectives({ pays: "autre" }, {}));
  assert.ok(!/Betclic|1,74/.test(horsFrance) && /pas encore relevée chez les opérateurs autorisés dans ton pays/.test(horsFrance), "hors des pays ouverts : le pari, mais aucun bookmaker montre");
});

// ---------- 7. corrections du 30/09 (suite) : sources, releves ----------
test("releves : le dernier controle est archive (Pinnacle compris) sans 2e appel, puis un dernier releve avant le coup d'envoi (CLV)", async () => {
  const j = journee();
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  j.etat.appels = 0;
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  assert.strictEqual(j.etat.appels, 1, "publication : un seul releve payant dans le tour");
  const pub = (await j.db.select("pro_cotes_releves", {})).filter((r) => r.releve_at === "2026-10-10T07:30:00.000Z");
  assert.deepStrictEqual(pub.map((r) => r.bookmaker).sort(), ["betclic", "pinnacle", "winamax"]);
  assert.strictEqual(pub.find((r) => r.bookmaker === "pinnacle").proba_sans_marge, 0.53);
  // Coup d'envoi 15 h (Paris) : releve normal a 14 h 30, dernier releve a 14 h 45, puis plus rien.
  j.a("2026-10-10T12:30:00Z"); await T.tourner(j.deps);
  j.etat.appels = 0; j.etat.probaPin = 0.55;
  j.a("2026-10-10T12:45:00Z"); await T.tourner(j.deps);
  assert.strictEqual(j.etat.appels, 1, "dernier releve a 15 min du match");
  j.a("2026-10-10T12:52:00Z"); await T.tourner(j.deps);
  assert.strictEqual(j.etat.appels, 1, "une seule fois par pari");
  j.a("2026-10-10T15:00:00Z"); await T.tourner(j.deps);
  const [p] = await j.db.select("pro_paris", {});
  assert.deepStrictEqual([p.pinnacle_cote_fin, p.pinnacle_proba_fin], [1.8, 0.55], "Pinnacle de cloture = dernier releve avant le match");
  assert.strictEqual(p.pinnacle_fin_at, "2026-10-10T12:45:00.000Z", "heure du releve retenu (ronde 4)");
  fs.rmSync(j.ancre, { force: true });
});

// ---------- 8. contre-controle de l'avocat du diable (30/09, ronde 1) : chaque cas prouve ----------

test("ancre Git : l'etape du workflow marche sur un depot extrait en partie (sparse-checkout), une ligne par jour", () => {
  const wf = fs.readFileSync(new URL("../.github/workflows/canal-pro.yml", import.meta.url), "utf8").split("\n");
  const i = wf.findIndex((l) => l.includes("- name: Ancre publique"));
  const r = wf.findIndex((l, k) => k > i && l.trim() === "run: |");
  const retrait = wf[r].indexOf("run");
  const corps = [];
  for (let k = r + 1; k < wf.length && (wf[k].trim() === "" || wf[k].search(/\S/) > retrait); k++) corps.push(wf[k].slice(retrait + 2));
  const script = corps.join("\n");
  assert.ok(!/worktree/.test(script), "plus de dossier de travail qui herite de l'extraction partielle");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-ancre-"));
  const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } }).trim();
  try {
    // « origin » avec une branche main, puis une extraction comme actions/checkout (sparse, mode non-cone).
    const seed = path.join(tmp, "seed"); fs.mkdirSync(path.join(seed, "scripts", "canal-pro"), { recursive: true });
    fs.writeFileSync(path.join(seed, "scripts", "canal-pro", "a.mjs"), "x\n"); fs.writeFileSync(path.join(seed, "gros.txt"), "y\n");
    git(seed, "init", "-q", "-b", "main"); git(seed, "add", "."); git(seed, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "init");
    git(tmp, "clone", "-q", "--bare", seed, "origin.git");
    const runner = path.join(tmp, "runner");
    git(tmp, "clone", "-q", "--no-checkout", path.join(tmp, "origin.git"), "runner");
    git(runner, "config", "core.sparseCheckout", "true");
    fs.writeFileSync(path.join(runner, ".git", "info", "sparse-checkout"), "\nscripts/canal-pro\npackage.json\n");
    git(runner, "checkout", "-q", "main");
    assert.ok(!fs.existsSync(path.join(runner, "gros.txt")), "extraction partielle en place");
    const temp = path.join(tmp, "rt"); fs.mkdirSync(temp);
    const lancer = (ligne) => {
      fs.writeFileSync(path.join(temp, "ancre.txt"), ligne);
      execFileSync("bash", ["-c", script], { cwd: runner, env: { ...process.env, RUNNER_TEMP: temp, GITHUB_STEP_SUMMARY: path.join(temp, "resume.txt"), GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } });
    };
    const lu = () => git(tmp, "--git-dir", "origin.git", "show", "canal-pro-ancre:ancre/empreintes.txt");
    lancer(`2026-10-10 PRO-1 ${"a".repeat(64)}\n`);
    assert.strictEqual(lu(), `2026-10-10 PRO-1 ${"a".repeat(64)}`, "1re ancre : branche creee et poussee");
    lancer(`2026-10-10 PRO-1 ${"a".repeat(64)}\n`);
    assert.strictEqual(lu().split("\n").length, 1, "meme jour relance (tour suivant) : pas de doublon");
    lancer(`2026-10-11 PRO-3 ${"b".repeat(64)}\n`);
    assert.deepStrictEqual(lu().split("\n").map((l) => l.slice(0, 16)), ["2026-10-10 PRO-1", "2026-10-11 PRO-3"], "jour suivant : ajoutee a la suite");
    assert.strictEqual(git(tmp, "--git-dir", "origin.git", "rev-list", "--count", "canal-pro-ancre"), "2", "historique enchaine");
    assert.ok(!fs.existsSync(path.join(runner, "gros.txt")), "l'extraction du robot n'est pas touchee");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("ancre : la tache reecrit le fichier a chaque tour du soir (un echec Git se rattrape au tour suivant)", async () => {
  const j = journee();
  await j.db.insert("pro_paris", [{ id: "p1", jour: "2026-10-10", numero: 1, empreinte: "e".repeat(64), publie_at: "x", canal_message_id: 5 }]);
  const ctx = () => T.creerContexte(j.deps);
  j.a("2026-10-10T21:30:00Z"); assert.match(await T.tacheAncre(ctx()), /ancre 2026-10-10 PRO-1/);
  fs.rmSync(j.ancre);
  j.a("2026-10-10T21:45:00Z"); assert.match(await T.tacheAncre(ctx()), /ancre 2026-10-10 PRO-1/, "pas de cle « deja fait » : nouvel essai");
  assert.ok(fs.existsSync(j.ancre));
  fs.rmSync(j.ancre);
});

test("faux motif n° 1 : sans Pinnacle, aucun match evalue -> programme reporte, jamais « aucun pari ne passe nos criteres »", async () => {
  const j = journee();
  let essais = 0;
  j.deps.src.candidats = async () => { essais++; return { candidats: [], evenements: 12, nonEvalues: Array.from({ length: 12 }, (_, k) => ({ match: `A${k} – B${k}`, raison: "pas de cote Pinnacle au 1N2" })) }; };
  j.a("2026-10-10T06:15:00Z"); await T.tourner(j.deps);
  assert.strictEqual((await j.db.select("pro_programmes", {})).length, 0, "rien n'est prepare");
  assert.match(lesMessages(j.tg)[0].text, /Programme reporté<\/b> : aucun des 12 matchs n'a pu être évalué \(pas de cote Pinnacle au 1N2 : 12\)/);
  for (const h of ["2026-10-10T06:30:00Z", "2026-10-10T06:45:00Z", "2026-10-10T07:00:00Z"]) { j.a(h); await T.tourner(j.deps); }
  assert.strictEqual(essais, 1, "un seul essai par heure (108 credits chacun)");
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  assert.strictEqual(essais, 2);
  const rep = lesMessages(j.tg).filter((x) => /Programme du samedi reporté/.test(x.text));
  assert.deepStrictEqual([rep.length, rep[0].chat], [1, 42]);
  assert.ok(!/le programme part/.test(rep[0].text), "preparation : aucune promesse");
  assert.ok(!lesMessages(j.tg).some((x) => /Aucun pari ne passe nos critères/.test(x.text) || estRegistre(x)));
});

test("faux motif n° 1 : une partie des matchs non evalues -> comptee et montree a Clement, texte public « parmi les matchs que nous avons pu verifier jusqu'au bout »", async () => {
  const j = journee();
  j.deps.src.candidats = async () => ({ candidats: [], evenements: 30, nonEvalues: [{ match: "A – B", raison: "pas de cote Pinnacle au 1N2" }, { match: "C – D", raison: "moins de 3 bookmakers au 1N2" }] });
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps);
  const val = lesMessages(j.tg)[0].text;
  assert.match(val, /Matchs examinés : 30\. <b>Non évalués \(données incomplètes\) : 2<\/b>/);
  assert.match(val, /Si tu valides, les abonnés Pro recevront en privé : « Aucun pari aujourd'hui : parmi les matchs que nous avons pu vérifier jusqu'au bout/, "Clement voit le texte public exact");
  await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  const tete = registre(j.tg)[0].text;
  assert.match(tete, /parmi les matchs que nous avons pu vérifier jusqu'au bout, aucun ne passe nos critères/);
  assert.strictEqual((await j.db.select("pro_programmes", {}))[0].motif_vide, "regles_partiel");
});

test("faux motif n° 2 : tout retire au dernier controle faute de Pinnacle -> texte neutre, jamais « aucune cote au-dessus du minimum »", async () => {
  const j = journee();
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  j.etat.probaPin = null; // plus de cote Pinnacle au dernier controle
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  const tete = registre(j.tg)[0].text;
  assert.match(tete, /Au dernier contrôle, aucun pari ne remplissait plus nos conditions/);
  assert.ok(!/aucune cote n'était au-dessus/.test(tete));
  assert.ok(lesMessages(j.tg).some((x) => x.chat === 42 && /Retirés au dernier contrôle : Torino – Udinese \(plus de cote Pinnacle au dernier contrôle\)/.test(x.text)), "le vrai motif est dit a Clement");
});

test("pertes jamais cachees : debrief perdant obligatoire, repropose jusqu'a publication ; l'automatique (eteint par defaut) le publie une seule fois", async () => {
  const j = journee();
  j.deps.src.resultat = async () => ({ statut: "FT", bd: 0, be: 2, faits: null });
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  j.a("2026-10-10T15:00:00Z"); await T.tourner(j.deps);
  j.a("2026-10-10T21:30:00Z"); await T.tourner(j.deps);
  const deb = lesMessages(j.tg).filter((x) => /Débrief du samedi/.test(x.text));
  assert.strictEqual(deb.length, 1);
  assert.match(deb[0].text, /1 perdu/);
  assert.ok(!JSON.stringify(deb[0].a.corps.reply_markup).includes('"non"'), "pas de « Ne pas publier »");
  assert.ok(!lesMessages(j.tg).some((x) => x.chat === 555 && /Débrief/.test(x.text)), "l'automatique est eteint par defaut : rien chez l'abonne");
  // La nuit : pas de relance. Le lendemain 8 h : repropose.
  j.a("2026-10-11T00:30:00Z"); await T.tourner(j.deps);
  assert.strictEqual(lesMessages(j.tg).filter((x) => /Débrief du samedi/.test(x.text)).length, 1);
  j.a("2026-10-11T06:15:00Z"); await T.tourner(j.deps);
  assert.strictEqual(lesMessages(j.tg).filter((x) => /Débrief du samedi/.test(x.text)).length, 2, "repropose au matin");
  // Clement allume l'automatique des debriefs : il part tout seul, une seule fois.
  await j.db.insert("telegram_settings", [{ key: "auto_debriefs", value: "oui" }]);
  j.a("2026-10-11T06:30:00Z"); await T.tourner(j.deps);
  j.a("2026-10-11T06:45:00Z"); await T.tourner(j.deps);
  // Envoye EN PRIVE a l'abonne (plus de canal Pro), une seule fois.
  const chezAbonne = lesMessages(j.tg).filter((x) => x.chat === 555 && /Débrief du samedi/.test(x.text));
  assert.strictEqual(chezAbonne.length, 1);
  assert.strictEqual((await j.db.select("telegram_settings", { key: "publie:k:debrief-soir-2026-10-10" })).length, 1, "meme cle que le bouton « Publier »");
});

test("envoi en double : Telegram a envoye mais la base n'a pas pris la preuve -> reecrite, jamais renvoye", async () => {
  const j = journee();
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  const vrai = j.db.update.bind(j.db);
  let pannes = 1;
  j.db.update = async (t, f, patch) => { if (t === "pro_paris" && "canal_message_id" in patch && pannes-- > 0) throw new Error("503 base"); return vrai(t, f, patch); };
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  assert.strictEqual(registre(j.tg).length, 2, "en-tete + 1 pari, pas de doublon");
  const [p] = await j.db.select("pro_paris", {});
  assert.ok(p.canal_message_id, "preuve ecrite au 2e essai");
  assert.ok(!lesMessages(j.tg).some((x) => /Envoi retardé/.test(x.text)));
});

test("envoi en double : base en panne tout le tour -> pas de doublon, puis « envoi incertain » (jamais renvoye tout seul)", async () => {
  const j = journee();
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  const vrai = j.db.update.bind(j.db);
  j.db.update = async (t, f, patch) => { if (t === "pro_paris" && "canal_message_id" in patch) throw new Error("503 base"); return vrai(t, f, patch); };
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  assert.strictEqual(registre(j.tg).filter((x) => /<b>SIMPLE<\/b>/.test(x.text)).length, 1);
  assert.ok(lesMessages(j.tg).some((x) => x.chat === 42 && /est parti \(message \d+\), mais la base n'a pas enregistré la preuve d'envoi/.test(x.text)));
  j.db.update = vrai; // la base revient, mais le tour suivant ne connait plus l'identifiant du message
  j.a("2026-10-10T07:45:00Z"); await T.tourner(j.deps);
  j.a("2026-10-10T08:00:00Z"); await T.tourner(j.deps);
  assert.strictEqual(registre(j.tg).filter((x) => /<b>SIMPLE<\/b>/.test(x.text)).length, 1, "jamais renvoye tout seul");
  const inc = lesMessages(j.tg).filter((x) => /Envoi incertain/.test(x.text));
  assert.strictEqual(inc.length, 1, "Clement prevenu une fois");
  const [p] = await j.db.select("pro_paris", {});
  assert.strictEqual(inc[0].a.corps.reply_markup.inline_keyboard[0][0].callback_data, `ep:re:${p.id}`);
  // Clement a verifie : pas dans le canal -> « Renvoyer » (le robot Telegram remet envoi_tente_at a vide).
  await vrai("pro_paris", { id: p.id }, { envoi_tente_at: null });
  j.a("2026-10-10T08:15:00Z"); await T.tourner(j.deps);
  assert.match(registre(j.tg).at(-1).text, /Envoi retardé/);
});

test("support : un nombre a virgule ne fait pas un ticket ; la question part a l'equipe", () => {
  for (const q of ["pourquoi le pari d'hier à 1,85 a perdu ?", "rien depuis 2,5 jours"]) {
    const t = C.lireTicketTexte(q, []);
    assert.ok(t, "lu comme un ticket avant la correction");
    assert.strictEqual(C.estUnTicket(t, q), false, q);
  }
  const p = { id: "x", dom: "Torino", ext: "Udinese", selection: "match nul", marche: "N", ligne: null };
  for (const ok of ["10 € sur le nul Torino Udinese à 3,30 chez Betclic", "plus de 2,5 buts à 1,90 sur Lens", "Lens + PSG à 3,20"]) assert.ok(C.estUnTicket(C.lireTicketTexte(ok, [p]), ok), ok);
});

// ---------- 8. contre-controle ronde 2 (avocat du diable, 30/09 ; preuves sim1-faux-motif, sim2-support, sim3-dc) ----------
import { robotTelegram } from "../scripts/canal-pro/lib/telegram.mjs";

/** fetch simule : The Odds API (evenements par ligue) et API-Football (reponse fournie). */
async function avecFetch(repondre, f) {
  const vrai = globalThis.fetch;
  globalThis.fetch = async (url) => repondre(String(url));
  try { return await f(); } finally { globalThis.fetch = vrai; }
}
const json200 = (x, h = {}) => new Response(JSON.stringify(x), { status: 200, headers: { "x-requests-remaining": "9000", ...h } });
const QUOTA_EPUISE = { errors: { requests: "You have reached the request limit for the day" }, results: 0, response: [] };
// Un match sans candidat (memes cotes partout : aucune valeur, nul sous 30 %).
const sansCandidat = () => ({ id: "ev2", sport_key: "soccer_italy_serie_a", commence_time: KO, home_team: "Inter", away_team: "Lecce",
  bookmakers: ["pinnacle", "betclic_fr", "winamax_fr"].map((k) => ({ key: k, title: k, markets: h2h(1.3, 5.5, 9.0, "Inter", "Lecce") })) });

test("ronde 2 : API-Football repond 200 + « errors » (quota epuise) -> ERREUR, jamais « aucun match »", async () => {
  const s = creerSources({ APISPORTS_KEY: "factice" }, { log: () => {} });
  await avecFetch(() => json200(QUOTA_EPUISE), async () => {
    await assert.rejects(() => s.resultat(5), /API-Football fixtures : .*request limit/);
    await assert.rejects(() => s.composition(5), /API-Football/);
  });
  await avecFetch(() => json200({ errors: [], response: [] }), async () => assert.strictEqual(await s.resultat(5), null, "reponse vide sans erreur : pas de match"));
  await avecFetch(() => new Response("<html>502</html>", { status: 200 }), async () => assert.rejects(() => s.resultat(5), /réponse illisible/));
});

// Match API-Football qui correspond a evenement() (Serie A, Torino - Udinese, samedi 15 h).
const FIXTURE_TORINO = { fixture: { id: 77, date: KO }, league: { id: 135 }, teams: { home: { name: "Torino" }, away: { name: "Udinese" } } };
test("menu : sortie du moteur v3 absente a la preparation -> lue AVANT les cotes (aucun credit), programme reporte, nouvel essai a chaque tour", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-v3-"));
  const s = creerSources({ ODDS_API_KEY: "factice", MOTEUR_V3_SORTIE: dir }, { log: () => {} });
  const vus = [];
  const repondre = (u) => { vus.push(u); return json200(u.includes("soccer_italy_serie_a/") ? [evenement()] : []); };
  await assert.rejects(avecFetch(repondre, () => s.candidats("2026-10-10", new Date("2026-10-10T06:15:00Z"))), /^Error: Moteur v3 : aucun fichier de sortie/);
  assert.strictEqual(vus.length, 0, "aucun credit de cotes depense");
  const j = journee();
  j.deps.src.candidats = (jour, d) => avecFetch(repondre, () => s.candidats(jour, d));
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps);
  assert.strictEqual((await j.db.select("pro_programmes", {})).length, 0, "rien n'est prepare");
  assert.match(lesMessages(j.tg)[0].text, /Programme reporté<\/b> : le moteur v3 n'a pas de sortie utilisable \(aucune cote demandée : aucun crédit de cotes dépensé\)/);
  j.a("2026-10-10T07:00:00Z"); await T.tourner(j.deps);
  assert.strictEqual(vus.length, 0, "nouvel essai au tour suivant, toujours sans credit");
  assert.strictEqual(lesMessages(j.tg).length, 1, "Clement n'est prevenu qu'une fois");
  // La sortie arrive : le programme est prepare au tour suivant, le match est relie aux resultats (numero API-Football du v3).
  fs.writeFileSync(path.join(dir, "2026-10-10.json"), JSON.stringify(sortieV3([MATCH_T], "2026-10-10T06:50:00Z")));
  j.a("2026-10-10T07:15:00Z"); await T.tourner(j.deps);
  assert.ok((await j.db.select("pro_programmes", {}))[0], "programme prepare");
  const paris = await j.db.select("pro_paris", {});
  assert.deepStrictEqual(paris.map((p) => [p.famille, p.selection, Number(p.fixture_id)]), [["simple", "Torino gagne", 77]]);
  // MODE ECONOMIE : /events (gratuit) d'abord, puis les cotes payantes, seulement apres la sortie.
  const payants = vus.filter((u) => !/\/events\?/.test(u));
  assert.ok(payants.length >= 1 && payants.every((u) => u.includes("bookmakers=pinnacle")), "cotes demandees seulement apres la sortie");
  assert.ok(vus.findIndex((u) => /soccer_italy_serie_a\/events\?/.test(u)) < vus.findIndex((u) => /soccer_italy_serie_a\/odds\?/.test(u)), "/events (gratuit) avant /odds");
  assert.ok(!lesMessages(j.tg).some((x) => /Aucun pari ne passe nos critères/.test(x.text) || estRegistre(x)));
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ronde 2 (sim1 S1) : pari du menu mais match non relie aux resultats -> jamais « Aucun pari ne passe nos criteres »", async () => {
  const j = journee();
  j.deps.src.candidats = async (jour, d) => menuTorino(jour, d, { fixture: null });
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps);
  const prog = (await j.db.select("pro_programmes", {}))[0];
  assert.ok(prog.ecartes.some((e) => e.donnees && /non relié aux résultats/.test(e.raison)), "ecart pour donnee manquante, marque");
  assert.match(lesMessages(j.tg)[0].text, /\n• Torino – Udinese \(Simple\) : match non relié aux résultats : il ne pourrait pas être réglé \[donnée manquante, pas un refus de nos règles\]/);
  assert.strictEqual(C.motifVide(prog, []), "regles_partiel");
  await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  const tete = registre(j.tg)[0].text;
  assert.ok(!/Aucun pari ne passe nos critères/.test(tete), tete);
  assert.match(tete, /On ne force pas/);
  // Un vrai refus des regles garde « Aucun pari ne passe nos criteres ».
  assert.strictEqual(C.motifVide({ matchs_vus: 12, non_evalues: [], ecartes: [{ raison: "le match commence trop tôt" }] }, []), "regles");
});

test("ronde 2 (sim1 S2) : l'API des cotes ne renvoie aucun match -> texte a part, jamais « Tous ont ete evalues »", async () => {
  const j = journee();
  j.deps.src.candidats = async () => ({ candidats: [], nonEvalues: [], evenements: 0 });
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps);
  const val = lesMessages(j.tg)[0].text;
  assert.match(val, /<b>Aucun match trouvé<\/b> dans nos championnats/);
  assert.match(val, /Si tu valides, les abonnés Pro recevront en privé : « Aucun match de nos championnats n'a été trouvé/);
  assert.ok(!/Tous ont été évalués|Matchs examinés : 0|Aucun match ne passe nos règles/.test(val), val);
  await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  const tete = registre(j.tg)[0].text;
  assert.match(tete, /Aucun match de nos championnats n'a été trouvé pour ce programme/);
  assert.strictEqual((await j.db.select("pro_programmes", {}))[0].motif_vide, "aucun_match");
});

test("ronde 2 : preuve d'envoi refusee apres le coup d'envoi (bot, base, textes)", async () => {
  const src = fs.readFileSync(new URL("../supabase/functions/telegram-bot/index.ts", import.meta.url), "utf8");
  const preuve = src.slice(src.indexOf("async function preuveTransferee"), src.indexOf("async function renvoiClic"));
  // Ronde 3 : l'heure limite est 70 min avant le match (avant les compositions), plus le coup d'envoi.
  assert.ok(preuve.indexOf("Date.now() >= C.limitePreuve(p)") > 0 && preuve.indexOf("Date.now() >= C.limitePreuve(p)") < preuve.indexOf(".update({ canal_message_id"), "heure ACTUELLE verifiee avant l'ecriture");
  assert.match(preuve, /\.is\("canal_message_id", null\)\.gt\("coup_envoi", new Date\(Date\.now\(\) \+ C\.PREUVE_LIMITE_MIN \* 60000\)\.toISOString\(\)\)/, "et dans la requete elle-meme");
  assert.match(preuve, /Trop tard : l'heure limite pour N° PRO-/);
  const sql = fs.readFileSync(new URL("../supabase/migrations/0040_canal_pro.sql", import.meta.url), "utf8");
  // Ronde 4 : la base refuse des l'heure limite (70 min avant le match), comme le bot, sans exception.
  assert.match(sql, /old\.canal_message_id is null and new\.canal_message_id is not null and now\(\) >= old\.coup_envoi - interval '70 minutes'/, "la base refuse aussi");
  // Base simulee (meme regle que le trigger).
  const db = new BaseMemoire({ pro_paris: [{ id: "p", numero: 3, publie_at: "2026-10-10T07:30:00+00:00", coup_envoi: KO, canal_message_id: null }] });
  db.horloge = () => new Date("2026-10-10T13:05:00Z");
  await assert.rejects(() => db.update("pro_paris", { id: "p" }, { canal_message_id: 9 }), /preuve d'envoi refusee apres l'heure limite/);
  db.horloge = () => new Date("2026-10-10T12:50:00Z");
  await assert.rejects(() => db.update("pro_paris", { id: "p" }, { canal_message_id: 9 }), /preuve d'envoi refusee apres l'heure limite/, "12 h 50 UTC : apres 11 h 50, refuse");
  db.horloge = () => new Date("2026-10-10T11:45:00Z");
  assert.strictEqual((await db.update("pro_paris", { id: "p" }, { canal_message_id: 9 }))[0].canal_message_id, 9);
  // Textes a Clement : « avant le coup d'envoi », jamais une invitation a transferer apres.
  const taches = fs.readFileSync(new URL("../scripts/canal-pro/taches.mjs", import.meta.url), "utf8");
  assert.ok(!/sauf si tu me transfères son message du Canal Pro \(je vérifie qu'il est parti avant le match\)/.test(taches));
  assert.match(taches, /L'un ou l'autre AVANT \$\{C\.heureTxt\(limite\)\} \(\$\{C\.PREUVE_LIMITE_MIN\} min avant le match, avant les compositions\)/);
});

test("ronde 2 : Telegram 502/504 ou 200 illisible = envoi INCERTAIN (jamais renvoye dans le meme tour) ; 400, 403, 429 = pas parti", async () => {
  assert.deepStrictEqual([400, 403, 429, 502, 504, 200, undefined].map((status) => C.envoiRefuse({ status })), [true, true, true, false, false, false, false]);
  const tg = robotTelegram("factice", { pause: 0 });
  const statut = async (rep) => avecFetch(() => rep, () => tg("sendMessage", {}).then(() => "ok", (e) => e.status));
  assert.strictEqual(await statut(new Response("<html>Bad Gateway</html>", { status: 502 })), 502);
  assert.strictEqual(await statut(new Response("pas du json", { status: 200 })), 200, "200 illisible : pas un refus");
  assert.strictEqual(await statut(new Response(JSON.stringify({ ok: false, description: "Too Many Requests" }), { status: 429 })), 429);
  // Journee : le pari recoit un 502 -> pas renvoye, Clement prevenu tout de suite (« Renvoyer »).
  const j = journee({ panneCanal: [2], statutPanne: 502 });
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  const essais = () => j.tg.appels.filter((a) => a.methode === "sendMessage" && String(a.corps.text).startsWith(T.ETIQUETTE_REGISTRE) && /<b>SIMPLE<\/b>/.test(a.corps.text)).length;
  assert.strictEqual(essais(), 1, "un seul essai : pas de renvoi dans le meme tour");
  assert.ok(lesMessages(j.tg).some((x) => x.chat === 42 && /<b>Envoi incertain<\/b> pour Torino – Udinese/.test(x.text)));
  const inc = lesMessages(j.tg).filter((x) => x.chat === 42 && /^<b>Envoi incertain<\/b> : /.test(x.text));
  assert.strictEqual(inc.length, 1);
  assert.match(inc[0].a.corps.reply_markup.inline_keyboard[0][0].callback_data, /^ep:re:/);
  j.a("2026-10-10T07:45:00Z"); await T.tourner(j.deps);
  assert.strictEqual(essais(), 1, "ni au tour suivant");
  const [p] = await j.db.select("pro_paris", {});
  assert.ok(p.envoi_tente_at && !p.canal_message_id);
});

test("ronde 2 (sim2) : detecteur de ticket (fonction gardee) ; « Annuler » (ancien ticket) renvoie vers le robot Contact, rien n'est transfere", () => {
  const p = { id: "x", dom: "Torino", ext: "Udinese", selection: "match nul", marche: "N", ligne: null };
  for (const q of ["le nul à 3,20 d'hier n'est toujours pas réglé", "j'ai perdu 20 € sur le nul à 3,10, je veux résilier",
    "je veux me désabonner, votre pari à 1,85 chez Betclic a perdu", "Bonjour, le handicap à 1,95 d'hier compte comment dans le bilan",
    "remboursez-moi mes 29,99 € svp", "pourquoi le pari d'hier à 1,85 a perdu ?", "rien depuis 2,5 jours"])
    assert.strictEqual(C.estUnTicket(C.lireTicketTexte(q, [p]), q), false, q);
  for (const ok of ["10 € sur le nul Torino Udinese à 3,30 chez Betclic", "plus de 2,5 buts à 1,90 sur Lens", "Lens + PSG à 3,20", "5 € Torino gagne à 2,50 chez Winamax"])
    assert.ok(C.estUnTicket(C.lireTicketTexte(ok, [p]), ok), ok);
  const src = fs.readFileSync(new URL("../supabase/functions/telegram-bot/index.ts", import.meta.url), "utf8");
  const annuler = src.slice(src.indexOf("async function ticketClic"), src.indexOf("let decision = null"));
  assert.match(annuler, /action === "no"[\s\S]{0,600}reponseAuto\(cq\.from\.id, lang/, "« Annuler » : reponse automatique (robot Contact), rien n'est transfere");
  assert.ok(!/transmettreTexteAClement/.test(src));
  assert.match(src, /telegram_contact_threads"\)\.upsert\(\[/, "robot Contact : Clement peut repondre");
  assert.match(LANGUES_SRC, /Ce n'est pas un ticket \? Touche « Annuler » : ton message part à l'équipe/);
});

test("ronde 2 : /canal ne promet plus de prevenir a l'ouverture", () => {
  const src = fs.readFileSync(new URL("../supabase/functions/telegram-bot/index.ts", import.meta.url), "utf8");
  assert.ok(!/Je te préviens dès qu'il l'est/.test(src));
  assert.ok(!/Je te préviens dès qu'il l'est/.test(LANGUES_SRC));
  // Plus de canal (02/10/2026) : /canal dit que tout arrive en prive.
  assert.match(LANGUES_SRC, /plusDeCanal: "Il n'y a plus de canal à rejoindre : tout ce qui est réservé aux abonnés Pro t'arrive ici, en privé/);
  assert.ok(!/canalPasPret|lienCanal|canalLien/.test(LANGUES_SRC + src));
});

test("ronde 2 : decision « pays sans formulaire » preparee, eteinte (francais par defaut) ; 'aucun' = aucun bookmaker montre", async () => {
  assert.strictEqual(C.paysParDefaut(null), "FR");
  assert.strictEqual(C.paysParDefaut("fr"), "FR");
  const inconnu = C.preferencesEffectives(undefined, { paysDefaut: C.paysParDefaut("aucun") });
  assert.strictEqual(inconnu.pays, C.PAYS_INCONNU);
  assert.strictEqual(C.preferencesEffectives({ pays: "fr" }, { paysDefaut: null }).pays, "FR", "formulaire rempli : son pays");
  const p = { id: "x", famille: "simple", dom: "Torino", ext: "Udinese", selection: "Torino gagne", coup_envoi: KO, meilleure_cote: 1.74, meilleur_bookmaker: "betclic", cotes: { betclic: 1.74, winamax: 1.7 } };
  assert.match(C.messageProgrammePerso("2026-10-10", [p], inconnu), /Indique ton pays/);
  assert.ok(!/Betclic|Winamax/.test(C.messageProgrammePerso("2026-10-10", [p], inconnu)));
  assert.deepStrictEqual(C.alertesCote(p, { winamax: 1.6, betclic: 1.8 }, inconnu, new Set(), { maintenant: Date.parse(KO) - 3 * 3600e3 }), []);
  assert.match(C.messageReglages(inconnu), /Pays : pas encore indiqué/);
  // Journee : sans reglage, l'abonne sans formulaire recoit SON programme (un message, bookmakers francais) ;
  // avec 'aucun' : le meme programme, sans aucun bookmaker, et « indique ton pays ».
  for (const aucun of [false, true]) {
    const j = journee({ reglages: aucun ? [{ key: "pays_sans_formulaire", value: "aucun" }] : [] });
    await j.db.delete("pro_preferences", { user_id: "u1" });
    j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
    j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
    const recus = lesMessages(j.tg).filter((x) => x.chat === 555);
    assert.strictEqual(recus.length, 1, "un seul message");
    if (aucun) { assert.match(recus[0].text, /Indique ton pays/); assert.ok(!/Betclic|Winamax/.test(recus[0].text)); }
    else assert.match(recus[0].text, /^<b>Karim, ton programme du samedi<\/b>[\s\S]*Cote : <b>1,74<\/b> chez Betclic/);
  }
});

// ---------- 9. contre-controle ronde 3 (avocat du diable, 30/09 ; preuves sim4-reporte-faux, sim5-tickets, sim6-sans-preuve) ----------
test("ronde 3 (sim4 A) : sortie du moteur v3 absente mais cotes presentes -> « reporte » neutre, jamais « les cotes ne sont pas disponibles »", async () => {
  const s = creerSources({ ODDS_API_KEY: "factice", APISPORTS_KEY: "factice" }, { log: () => {} });
  const repondre = (u) => json200(u.includes("soccer_italy_serie_a/") ? [evenement()] : []);
  const j = journee();
  j.deps.src.candidats = (jour, d) => avecFetch(repondre, () => s.candidats(jour, d));
  for (const h of ["2026-10-10T06:45:00Z", "2026-10-10T07:45:00Z"]) { j.a(h); await T.tourner(j.deps); }
  const rep = lesMessages(j.tg).filter((x) => /Programme du samedi reporté/.test(x.text));
  assert.strictEqual(rep.length, 1, "« programme reporte » propose une fois");
  assert.ok(!/Les cotes des bookmakers ne sont pas disponibles/.test(rep[0].text), rep[0].text);
  assert.match(rep[0].text, /Une partie de nos données n'est pas disponible pour l'instant : rien n'est préparé sans données vérifiées/);
  // Cause sure (l'API des cotes a echoue) : on peut le dire ; toute autre erreur : texte neutre.
  assert.strictEqual(C.causeReport(new Error("The Odds API odds : 429")), "cotes");
  assert.strictEqual(C.causeReport(new Error("API-Football fixtures : quota")), "donnees");
  assert.strictEqual(C.causeReport(new Error("fichier illisible")), "donnees");
  assert.match(C.MESSAGE_REPORTE("2026-10-10", "preparation", "cotes"), /Les cotes des bookmakers ne sont pas disponibles/);
  const k = journee();
  k.deps.src.candidats = async () => { throw new Error("The Odds API odds : 429"); };
  for (const h of ["2026-10-10T06:45:00Z", "2026-10-10T07:30:00Z"]) { k.a(h); await T.tourner(k.deps); }
  assert.match(lesMessages(k.tg).find((x) => /Programme du samedi reporté/.test(x.text)).text, /Les cotes des bookmakers ne sont pas disponibles/);
});

test("ronde 3 (sim4 B) : un match du v3 introuvable chez The Odds API -> « non evalue », jamais « Tous ont ete evalues »", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-v3-"));
  const inter = matchV3({ id: "I1-2026-10-10-Inter-Lecce", ligue_code: "I1", dom: "Inter", ext: "Lecce", ko: "2026-10-10T18:45:00Z", lh: 2, la: 0.7, fixture: 78 });
  fs.writeFileSync(path.join(dir, "2026-10-10.json"), JSON.stringify(sortieV3([MATCH_T, inter], "2026-10-10T04:00:00Z")));
  const s = creerSources({ ODDS_API_KEY: "factice", MOTEUR_V3_SORTIE: dir }, { log: () => {} });
  const repondre = (u) => json200(u.includes("soccer_italy_serie_a/") ? [evenement()] : []); // seul Torino - Udinese est cote
  const j = journee();
  j.deps.src.candidats = (jour, d) => avecFetch(repondre, () => s.candidats(jour, d));
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps);
  const val = lesMessages(j.tg)[0].text;
  assert.ok(!/Tous ont été évalués/.test(val), val);
  assert.match(val, /Matchs examinés : 2\. <b>Non évalués \(données incomplètes\) : 1<\/b> \(pas de cotes des bookmakers agréés pour ce match : 1\)/);
  // Sans ecart faute de donnee : « Tous ont ete evalues » reste vrai.
  assert.match(C.messageValidation({ jour: "2026-10-10", paris: [], ecartes: [{ match: "A – B", famille: "simple", raison: "le match commence trop tôt" }], non_evalues: [], matchs_vus: 3 }), /Matchs examinés : 3\. Tous ont été évalués\./);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("ronde 3 (sim4 C) : base en panne juste apres l'archivage -> au tour suivant, jamais « aucun pari » apres le vrai pari", async () => {
  const j = journee();
  const vrai = j.db.update.bind(j.db);
  let lache = false;
  j.db.update = async (t, f, patch) => {
    if (t === "pro_programmes" && patch.statut === "publie" && !lache) { lache = true; const e = new Error("503 base indisponible"); e.status = 503; throw e; }
    return vrai(t, f, patch);
  };
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  j.a("2026-10-10T07:45:00Z"); await T.tourner(j.deps);
  assert.ok(lache, "la base a bien lache une fois");
  const canal = registre(j.tg);
  assert.ok(!canal.some((x) => /aucun pari|Pas de pari aujourd'hui/.test(x.text)), canal.map((x) => x.text).join("\n---\n"));
  assert.strictEqual(canal.filter((x) => /^<b>Programme du samedi<\/b>/.test(x.text)).length, 1, "une seule en-tete");
  assert.strictEqual(canal.filter((x) => /<b>SIMPLE<\/b>/.test(x.text)).length, 1, "le pari part une seule fois");
  const prog = (await j.db.select("pro_programmes", {}))[0];
  assert.deepStrictEqual([prog.statut, prog.motif_vide ?? null], ["publie", null], "jamais de motif « jour sans pari » pour le site");
  const perso = lesMessages(j.tg).filter((x) => x.chat === 555);
  assert.strictEqual(perso.length, 1, "son programme une seule fois (1er tour), jamais renvoye a la reprise");
  assert.match(perso[0].text, /^<b>Karim, ton programme du samedi<\/b>[\s\S]*<b>SIMPLE<\/b>/);
  assert.ok(lesMessages(j.tg).some((x) => x.chat === 42 && /Reprise d'une publication interrompue : 1 pari déjà archivé/.test(x.text)));
});

test("ronde 3 (sim6) : bilan du lundi -> ligne « Hors bilan, sans preuve d'envoi » (le numero vu dans le canal est explique)", async () => {
  const j = journee({ panneCanal: [2], statutPanne: 502, reglages: [{ key: "auto_debriefs", value: "oui" }, { key: "auto_bilan", value: "oui" }] });
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  j.a("2026-10-10T21:40:00Z"); await T.tourner(j.deps);
  j.a("2026-10-12T10:40:00Z"); await T.tourner(j.deps);
  // Bilan envoye (automatique) en prive a l'abonne.
  const bilan = lesMessages(j.tg).filter((x) => x.chat === 555 && /Bilan de la semaine/.test(x.text));
  assert.strictEqual(bilan.length, 1);
  assert.match(bilan[0].text, /Aucun pari réglé cette semaine\.\nHors bilan, sans preuve d'envoi : N° PRO-1 \(Torino – Udinese\)\./);
  // Ronde 4 : le cumul dit aussi combien de paris sont hors bilan depuis le n° 1.
  assert.match(bilan[0].text, /Depuis le début<\/b> \(depuis le n° PRO-1\)\nAucun pari réglé\.\nHors bilan depuis le début, sans preuve d'envoi : 1 pari \(N° PRO-1\)\./);
  assert.ok(!/Hors bilan/.test(C.messageBilanSemaine("2026-10-05", "2026-10-11", [], [])), "pas de ligne quand tout est prouve");
});

test("ronde 3 (sim5) : politesse et textes de bookmaker ne font plus partir un vrai ticket au support (journal et garde-fou)", () => {
  const p = { id: "x", dom: "Torino", ext: "Udinese", selection: "match nul", marche: "N", ligne: null };
  for (const q of ["Bonjour, 10 € sur le nul Torino Udinese à 3,30 chez Betclic", "10 € sur le nul Torino Udinese à 3,30 chez Betclic merci",
    "Votre pari : Match nul, Torino - Udinese, cote 3,30, mise 10 €", "Pari placé ! Vous avez misé 10 € sur Match nul (Torino - Udinese) à 3,30",
    "salut, j'ai pris le nul à 3,30 chez Winamax, 5 €", "nul Torino Udinese 3,30 Betclic 10 € stp note le", "j'ai joué le nul à 3,30 chez Betclic, 10 €"])
    assert.ok(C.estUnTicket(C.lireTicketTexte(q, [p]), q), q);
  for (const q of ["je ne vois pas le pari à 1,85 dans le canal", "je veux résilier, le nul à 3,30 chez Betclic 10 €", "arnaque : le nul à 3,30 chez Betclic, 10 €",
    "remboursez le nul à 3,30 chez Betclic, 10 €", "hier j'ai joué le nul à 3,30 chez Betclic, 10 €", "le nul à 3,30 chez Betclic 10 € ?"])
    assert.strictEqual(C.estUnTicket(C.lireTicketTexte(q, [p]), q), false, q);
  for (const mot of ["bonjour", "salut", "merci", "svp", "stp", "vous", "votre", "vos", "compte", "question", "aide"]) assert.ok(!C.MOTS_SUPPORT.test(mot), mot);
  for (const mot of ["resilier", "desabonner", "rembourser", "arnaque", "plainte", "pourquoi", "hier", "perdu", "bilan"]) assert.ok(C.MOTS_SUPPORT.test(mot), mot);
});

test("ronde 3 : heure limite de la preuve d'envoi = 70 min avant le match (avant les compositions), pour le transfert ET « Renvoyer »", async () => {
  assert.strictEqual(C.PREUVE_LIMITE_MIN, 70);
  assert.strictEqual(new Date(C.limitePreuve({ coup_envoi: KO })).toISOString(), "2026-10-10T11:50:00.000Z");
  const src = fs.readFileSync(new URL("../supabase/functions/telegram-bot/index.ts", import.meta.url), "utf8");
  const renvoi = src.slice(src.indexOf("async function renvoiClic"), src.indexOf("async function adminCommande"));
  assert.ok(renvoi.indexOf("Date.now() >= C.limitePreuve(p)") > 0 && renvoi.indexOf("Date.now() >= C.limitePreuve(p)") < renvoi.indexOf(".update({ envoi_tente_at: null })"), "« Renvoyer » refuse apres la limite");
  // 502 a la publication (9 h 30) : avant la limite, bouton « Renvoyer » et heure limite 13 h 50.
  const j = journee({ panneCanal: [2, 3], statutPanne: 502 });
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  const inc = () => lesMessages(j.tg).filter((x) => x.chat === 42 && /^<b>Envoi incertain<\/b> : /.test(x.text));
  assert.strictEqual(inc().length, 1);
  assert.match(inc()[0].text, /L'un ou l'autre AVANT 13 h 50 \(70 min avant le match, avant les compositions\)/);
  assert.ok(inc()[0].a.corps.reply_markup, "bouton « Renvoyer »");
  // « Renvoyer » clique avant la limite ; le renvoi de 13 h 40 recoit encore un 502 -> au tour de 13 h 55, apres la limite : plus de bouton.
  const [p] = await j.db.select("pro_paris", {});
  await j.db.update("pro_paris", { id: p.id }, { envoi_tente_at: null });
  j.a("2026-10-10T11:40:00Z"); await T.tourner(j.deps);
  j.a("2026-10-10T11:55:00Z"); await T.tourner(j.deps);
  assert.strictEqual(inc().length, 2);
  assert.match(inc()[1].text, /L'heure limite pour transférer la preuve ou le renvoyer \(13 h 50, avant les compositions\) est passée : il ne compte nulle part/);
  assert.ok(!inc()[1].a.corps.reply_markup, "plus de bouton « Renvoyer » apres la limite");
  j.a("2026-10-10T12:58:00Z"); await T.tourner(j.deps);
  assert.ok(lesMessages(j.tg).some((x) => x.chat === 42 && /l'heure limite pour la donner \(13 h 50, avant les compositions\) est passée/.test(x.text)));
  assert.ok(!lesMessages(j.tg).some((x) => /Si tu me transfères son message du Canal Pro AVANT 15 h/.test(x.text)), "plus d'invitation a transferer jusqu'au coup d'envoi");
});

// ---------- 10. contre-controle ronde 4 (avocat du diable et specialistes, 30/09 ; preuves dc_gardefou.mjs, sim7-coquille.mjs) ----------
const ev6 = (winamax, pin = [2.12, 3.45, 3.7], autres = [[2.05, 3.3, 3.55], [2.02, 3.35, 3.5], [2.0, 3.25, 3.6], [2.03, 3.3, 3.45]]) => ({ id: "e", home_team: "Torino", away_team: "Udinese", bookmakers: [
  { key: "pinnacle", markets: h2h(...pin) }, { key: "betclic_fr", markets: h2h(...autres[0]) }, { key: "winamax_fr", markets: h2h(...winamax) },
  { key: "unibet_fr", markets: h2h(...autres[1]) }, { key: "pmu_fr", markets: h2h(...autres[2]) }, { key: "netbet_fr", markets: h2h(...autres[3]) }] });
const DESEQUILIBRE = [[1.38, 4.93, 7.65], [[1.37, 4.5, 6.75], [1.35, 4.3, 6.4], [1.32, 4.7, 7.5], [1.31, 4.4, 6.75]]];
const pariTest = (marche, proba) => ({ famille: "simple", marche, ligne: null, dom: "Torino", ext: "Udinese", coup_envoi: KO, proba, cotes: {}, selections: [] });

test("ronde 4 (garde-fou) : une cote a plus de 2 fois la moyenne est ignoree ; la coquille 13,70 de Winamax n'est jamais la cote publiee", () => {
  const e = C.etatMarche(C.booksDepuisOddsApi(ev6([13.7, 4.7, 6.75], ...DESEQUILIBRE)), "1", null);
  assert.ok(!("winamax_fr" in e.cotes), "la coquille est retiree");
  assert.deepStrictEqual(Object.keys(e.cotes).sort(), ["betclic_fr", "netbet_fr", "pinnacle", "pmu_fr", "unibet_fr"]);
  const r = C.controlePublication(pariTest("1", 0.68), e, "2026-10-10T07:30:00Z");
  assert.ok(r.maj && r.maj.meilleur_bookmaker !== "winamax" && r.maj.meilleure_cote < 1.5, JSON.stringify(r));
  assert.ok(!/13,70|13\.7/.test(JSON.stringify(r)));
});

test("ronde 4 (sim7-coquille) : une cote agreee a plus de 25 % au-dessus de Pinnacle est ecartee au dernier controle (inversion domicile/exterieur, 1,37 tape 3,17)", () => {
  // Cas 1 : domicile et exterieur inverses chez Winamax sur un match equilibre (Pinnacle 2,12).
  const e1 = C.etatMarche(C.booksDepuisOddsApi(ev6([3.6, 3.3, 2.06])), "1", null);
  assert.strictEqual(e1.cotes.winamax_fr, 3.6, "le garde-fou « 2 x la moyenne » la laisse passer (la preuve)");
  const v = C.controlePublication(pariTest("1", 0.46), e1, "2026-10-10T07:30:00Z");
  assert.deepStrictEqual([v.maj.meilleure_cote, v.maj.meilleur_bookmaker], [2.05, "betclic"], "jamais publie a 3,60");
  // Cas 2 : 1,37 tape 3,17 chez Winamax (Pinnacle 1,38).
  const e2 = C.etatMarche(C.booksDepuisOddsApi(ev6([3.17, 4.7, 6.75], ...DESEQUILIBRE)), "1", null);
  assert.strictEqual(e2.cotes.winamax_fr, 3.17);
  const s = C.controlePublication(pariTest("1", 0.68), e2, "2026-10-10T07:30:00Z");
  assert.deepStrictEqual([s.maj.meilleure_cote, s.maj.meilleur_bookmaker], [1.37, "betclic"], "jamais publie a 3,17");
  // Le filtre lui-meme : seuil provisoire 25 % (a confirmer par le trader), il ne fait que retirer.
  assert.strictEqual(C.ECART_MAX_PINNACLE, 0.25);
  assert.deepStrictEqual(C.filtrePinnacle({ winamax: 3.6, betclic: 2.05 }, 2.12), { cotes: { betclic: 2.05 }, ecartees: ["winamax"] });
  assert.deepStrictEqual(C.filtrePinnacle({ betclic: 2.65 }, 2.12).cotes, { betclic: 2.65 }, "+25 % pile : gardee");
  assert.deepStrictEqual(C.filtrePinnacle({ betclic: 2.05 }, null), { cotes: {}, ecartees: ["betclic"] }, "sans Pinnacle : rien de verifiable, rien de garde");
  // Tout ecarte : raison dite a Clement (texte interne), jamais une cote faussee.
  assert.match(C.controlePublication(pariTest("N", 0.31), { cotes: { winamax_fr: 4.5 }, pinnacle_proba: 0.31, pinnacle_cote: 3.15 }, "2026-10-10T07:30:00Z").raison, /trop éloignées de celle de Pinnacle/);
  // Un combine : chaque selection est verifiee ; une selection sans cote verifiable = pas publie.
  const combo = { ...pariTest("combine", 0.45), famille: "combine", selections: [{ marche: "1" }, { marche: "1" }] };
  assert.match(C.controlePublication(combo, { jambes: [e2, { cotes: { winamax_fr: 1.5 }, pinnacle_proba: 0.6, pinnacle_cote: 1.55 }] }, "2026-10-10T07:30:00Z").raison, /aucun bookmaker agréé ne propose toutes les sélections/);
  const ok2 = C.controlePublication(combo, { jambes: [e2, { cotes: { betclic_fr: 1.5, winamax_fr: 1.52 }, pinnacle_proba: 0.6, pinnacle_cote: 1.55 }] }, "2026-10-10T07:30:00Z");
  assert.deepStrictEqual([ok2.maj.meilleure_cote, ok2.maj.meilleur_bookmaker, ok2.maj.selections.map((j) => j.cote)], [2.06, "betclic", [1.37, 1.5]], "produit chez UN bookmaker, cote prise de chaque selection archivee");
});

test("ronde 4 (sim7) : releves et alertes ne voient jamais une cote ecartee (jamais « montee a 4,20 » sur une coquille)", async () => {
  const j = journee();
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  j.cotesDuMoment.winamax_fr = 2.4; // Pinnacle 1,80 : +33 %, coquille probable
  j.a("2026-10-10T08:30:00Z"); await T.tourner(j.deps); // suivi toutes les 55 min (mode economie)
  const rel = (await j.db.select("pro_cotes_releves", {})).filter((r) => r.releve_at === "2026-10-10T08:30:00.000Z");
  assert.deepStrictEqual(rel.map((r) => r.bookmaker).sort(), ["betclic", "pinnacle"], "la coquille n'est pas archivee (ni cote de fin, ni CLV)");
  assert.ok(!lesMessages(j.tg).some((x) => x.chat === 555 && /montée|2,40/.test(x.text)), "aucune alerte sur la coquille");
  // Une vraie hausse (sous +25 %) donne bien l'alerte.
  j.cotesDuMoment.winamax_fr = 1.8;
  j.a("2026-10-10T09:30:00Z"); await T.tourner(j.deps);
  assert.ok(lesMessages(j.tg).some((x) => x.chat === 555 && /est montée de 1,70 à 1,80 chez Winamax/.test(x.text)));
  // Test unitaire : une cote ecartee chez SES bookmakers = aucune alerte pour lui.
  const p = { id: "x", famille: "simple", dom: "Torino", ext: "Udinese", selection: "Torino gagne", coup_envoi: KO, meilleure_cote: 1.74, meilleur_bookmaker: "betclic", cotes: { betclic: 1.74, winamax: 1.7 } };
  const w = C.preferencesEffectives({ bookmakers: ["winamax"] });
  assert.deepStrictEqual(C.alertesCote(p, { betclic: 1.74 }, w, new Set(), { maintenant: Date.parse("2026-10-10T09:40:00Z"), douteuses: ["winamax"] }), []);
  fs.rmSync(j.ancre, { force: true });
});

test("ronde 4 : une seule source de reglages (pro_preferences) ; un ancien clic « Garde-fou +1 » du robot ne passe plus par-dessus le site", () => {
  // Preuve de l'avocat : un clic « Garde-fou +1 » (reglages du robot a 6) passait pour toujours par-dessus la limite du site (2).
  const site = { bookmakers: ["winamax", "bet365"], limite_paris_jour: 2, alertes: ["seuil", "hausse"] };
  const p = C.preferencesEffectives(site, { paysDefaut: "FR" });
  assert.strictEqual(p.limite_paris_jour, 2, "la limite du site");
  // Un clic du robot renvoie les colonnes de pro_preferences, au format du site.
  assert.deepStrictEqual(C.appliquerReglage(p, "rg:l:+"), { limite_paris_jour: 3 });
  assert.deepStrictEqual(C.appliquerReglage({ ...p, limite_paris_jour: 0 }, "rg:l:-"), { limite_paris_jour: 0 });
  assert.deepStrictEqual(C.appliquerReglage(p, "rg:a:hausse"), { alertes: ["seuil"] });
  assert.deepStrictEqual(C.appliquerReglage(p, "rg:a:meteo"), { alertes: ["seuil", "hausse", "meteo"] });
  assert.deepStrictEqual(C.appliquerReglage(p, "rg:b:betclic"), { bookmakers: ["winamax", "betclic", "bet365"] }, "bet365 (agree non suivi, choisi sur le site) est garde");
  assert.deepStrictEqual(C.appliquerReglage(p, "rg:s"), {}, "ancien bouton « Suivre mes choix » : plus de strategie (03/10/2026)");
  assert.deepStrictEqual(C.appliquerReglage(p, "rg:p:bk"), {}, "changer de page n'ecrit rien");
  // Le clic et le site ecrivent la MEME valeur : la derniere ecrite compte (ici, le site repasse a 1).
  const apresClic = { ...site, ...C.appliquerReglage(p, "rg:l:+") };
  assert.strictEqual(C.preferencesEffectives(apresClic).limite_paris_jour, 3);
  assert.strictEqual(C.preferencesEffectives({ ...apresClic, limite_paris_jour: 1 }).limite_paris_jour, 1);
  // Le bot ecrit dans pro_preferences, plus jamais dans telegram_abonnes.reglages, et ne les lit plus.
  const src = fs.readFileSync(new URL("../supabase/functions/telegram-bot/index.ts", import.meta.url), "utf8");
  const clic = src.slice(src.indexOf("async function reglageClic"), src.indexOf("// Photo du ticket"));
  assert.match(clic, /db\.from\("pro_preferences"\)\.upsert\(/);
  assert.ok(!/from\("telegram_abonnes"\)\.update\(\{ reglages/.test(src) && !/ab\.reglages/.test(src), "plus jamais telegram_abonnes.reglages");
  assert.match(clic, /!ligne\.form && prefs\.pays === C\.PAYS_INCONNU/, "pays inconnu : jamais une ligne « fr » creee en silence");
  assert.ok(!/l\.reglages/.test(fs.readFileSync(new URL("../scripts/canal-pro/taches.mjs", import.meta.url), "utf8")));
});

test("ronde 4 : dernier releve Pinnacle -> heure enregistree, CLV seulement a 30 min au plus du match, verrou rendu si le releve echoue", async () => {
  const j = journee();
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  j.a("2026-10-10T12:30:00Z"); await T.tourner(j.deps); // releve normal, 30 min avant
  j.etat.panne = true;
  j.a("2026-10-10T12:45:00Z"); await T.tourner(j.deps); // dernier releve : l'API echoue
  j.etat.panne = false; j.etat.probaPin = 0.55; j.etat.appels = 0;
  j.a("2026-10-10T12:52:00Z"); await T.tourner(j.deps);
  assert.strictEqual(j.etat.appels, 1, "verrou rendu : le dernier releve est refait au tour suivant");
  j.a("2026-10-10T15:00:00Z"); await T.tourner(j.deps);
  const [p] = await j.db.select("pro_paris", {});
  assert.deepStrictEqual([p.pinnacle_proba_fin, p.pinnacle_fin_at], [0.55, "2026-10-10T12:52:00.000Z"]);
  assert.strictEqual(C.clvPari(p), Number(p.meilleure_cote) * 0.55 - 1, "CLV au prix publie face au dernier releve Pinnacle");
  assert.strictEqual(C.clvPari({ ...p, pinnacle_fin_at: "2026-10-10T12:30:00Z" }), Number(p.meilleure_cote) * 0.55 - 1, "30 min pile : compte");
  assert.strictEqual(C.clvPari({ ...p, pinnacle_fin_at: "2026-10-10T12:29:00Z" }), null, "plus de 30 min : compte a part");
  assert.strictEqual(C.clvPari({ ...p, pinnacle_proba_fin: null }), null, "sans Pinnacle de fin : compte a part");
  const sql = fs.readFileSync(new URL("../supabase/migrations/0040_canal_pro.sql", import.meta.url), "utf8");
  assert.match(sql, /pinnacle_fin_at timestamptz/);
  assert.match(sql, /'pinnacle_proba_fin','pinnacle_fin_at'/, "ecrite une seule fois (trigger)");
  fs.rmSync(j.ancre, { force: true });
});

test("ronde 4 : preuve d'envoi limitee aussi par la base (70 min avant) ; le robot n'envoie plus rien apres 75 min avant le match", async () => {
  assert.strictEqual(C.ENVOI_MARGE_MIN, 5);
  assert.deepStrictEqual([C.envoiPossible({ coup_envoi: KO }, "2026-10-10T11:44:59Z"), C.envoiPossible({ coup_envoi: KO }, "2026-10-10T11:45:00Z")], [true, false]);
  // Publication tardive (programme reporte) : plus de publication a moins de 75 min du match.
  const [q] = C.preparerProgramme(simpleTorino(), { jour: "2026-10-10", maintenant: "2026-10-10T06:30:00Z" }).paris;
  const etat = { cotes: { betclic_fr: 1.74 }, pinnacle_proba: 0.53, pinnacle_cote: 1.8 };
  assert.match(C.controlePublication(q, etat, "2026-10-10T11:46:00Z").raison, /match trop proche/);
  assert.ok(C.controlePublication(q, etat, "2026-10-10T11:44:00Z").maj);
  // Telegram refuse (403) toute la journee : renvois jusqu'a 13 h 45, plus rien ensuite, Clement prevenu.
  const j = journee();
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps); await j.valider();
  let tentatives = 0;
  j.deps.tg = async (m, corps) => { if (m === "sendMessage" && String(corps.text).startsWith(T.ETIQUETTE_REGISTRE)) { tentatives++; const e = new Error("sendMessage: 403"); e.status = 403; throw e; } return j.tg(m, corps); };
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  j.a("2026-10-10T11:30:00Z"); await T.tourner(j.deps);
  const avant = tentatives;
  assert.ok(avant >= 3, "en-tete, pari, renvois avant l'heure limite");
  j.a("2026-10-10T11:46:00Z"); await T.tourner(j.deps);
  j.a("2026-10-10T12:30:00Z"); await T.tourner(j.deps);
  assert.strictEqual(tentatives, avant, "aucun envoi apres 13 h 45 : la base refuserait la preuve");
  assert.ok(lesMessages(j.tg).some((x) => x.chat === 42 && /n'est pas parti avant l'heure limite \(13 h 50, 70 min avant le match\) : il ne part plus et ne compte nulle part/.test(x.text)));
  // Le bot annonce l'heure reelle du dernier renvoi possible.
  assert.match(fs.readFileSync(new URL("../supabase/functions/telegram-bot/index.ts", import.meta.url), "utf8"), /s'il passe avant \$\{C\.heureTxt\(C\.limitePreuve\(p\) - C\.ENVOI_MARGE_MIN \* 60000\)\}/);
});

test("ronde 4 : bilan « Depuis le debut » -> nombre de paris hors bilan depuis le n° 1, et premier numero compte meme sans preuve", () => {
  const t = C.messageBilanSemaine("2026-10-05", "2026-10-11", [], [{ famille: "simple", numero: 2, resultat: "gagne", proba: 0.5 }],
    { sansPreuveTotal: [{ numero: 1, dom: "A", ext: "B" }] });
  assert.match(t, /Depuis le début<\/b> \(depuis le n° PRO-1\)/, "jamais « depuis le n° PRO-2 » quand le n° 1 est hors bilan");
  assert.match(t, /Hors bilan depuis le début, sans preuve d'envoi : 1 pari \(N° PRO-1\)\./);
  assert.ok(!/Hors bilan depuis le début/.test(C.messageBilanSemaine("2026-10-05", "2026-10-11", [], [])), "pas de ligne quand tout est prouve");
});

test("ronde 4 : handicap -> les 2 cotes ne vont ensemble que sur la meme ligne (exterieur = -domicile)", () => {
  const ev = (pa) => ({ id: "e", home_team: "Torino", away_team: "Udinese", bookmakers: [{ key: "pinnacle", markets: [{ key: "spreads", outcomes: [{ name: "Torino", price: 1.95, point: -0.5 }, { name: "Udinese", price: 1.9, point: pa }] }] }] });
  assert.deepStrictEqual([...C.booksDepuisOddsApi(ev(0.5)).pinnacle.ah.entries()], [[-0.5, [1.95, 1.9]]]);
  assert.strictEqual(C.booksDepuisOddsApi(ev(0.25)).pinnacle, undefined, "lignes differentes : marche ignore");
  assert.strictEqual(C.booksDepuisOddsApi(ev(undefined)).pinnacle, undefined, "ligne exterieure absente : marche ignore");
});

test("ronde 4 : texte interne de panne -> dit quelle source ne repond pas", () => {
  assert.strictEqual(C.sourceEnPanne(new Error("The Odds API odds : 429")), "l'API des cotes ne répond pas");
  assert.match(C.sourceEnPanne(new Error("API-Football fixtures : quota")), /^API-Football ne répond pas \(aucune cote demandée/);
  assert.match(C.sourceEnPanne(new Error("APISPORTS_KEY manquante")), /^API-Football/);
  assert.strictEqual(C.sourceEnPanne(new Error("autre")), "une de nos sources de données ne répond pas");
  assert.match(C.sourceEnPanne(new Error("Moteur v3 : sortie périmée")), /^le moteur v3 n'a pas de sortie utilisable \(aucune cote demandée/);
  assert.strictEqual(C.causeReport(new Error("Moteur v3 : aucune sortie")), "donnees");
});

// ---------- 11. contre-controle ronde 4.1 (avocat du diable, 30/09 ; preuves sim8-preuve-tardive.mjs, sim9-coquille-pinnacle.mjs) ----------
test("ronde 4.1 (sim8) : a moins de 70 min du match, la base refuse l'archivage ET la preuve par tous les chemins (meme commande, insertion)", async () => {
  const ko = "2026-10-10T19:00:00.000Z";
  const base = (h) => {
    const b = new BaseMemoire({ pro_paris: [
      { id: "A", numero: 7, jour: "2026-10-10", coup_envoi: ko, publie_at: "2026-10-10T07:30:00.000+00:00", canal_message_id: null, retire: false, mode: "ouvert" },
      { id: "B", numero: null, jour: "2026-10-10", coup_envoi: ko, publie_at: null, canal_message_id: null, retire: true, mode: null }] });
    b.horloge = () => new Date(h);
    return b;
  };
  const H10 = "2026-10-10T18:50:00Z"; // 10 min avant le match, compositions connues
  // Cas 1 (deja corrige en ronde 4) : pari archive le matin, preuve a H-10.
  await assert.rejects(() => base(H10).update("pro_paris", { id: "A" }, { canal_message_id: 555, envoye_at: H10 }), /preuve d'envoi refusee apres l'heure limite/);
  // Cas 2 (sim8) : pari retire au dernier controle, archive ET prouve dans la meme commande a H-10.
  await assert.rejects(() => base(H10).update("pro_paris", { id: "B" }, { retire: false, mode: "ouvert", numero: 8, publie_at: H10, canal_message_id: 556, envoye_at: H10 }), /archivage refuse apres l'heure limite/);
  // Cas 3 (sim8) : insertion directe d'un pari deja prouve a H-10.
  await assert.rejects(() => base(H10).insert("pro_paris", [{ id: "C", numero: 9, jour: "2026-10-10", coup_envoi: ko, publie_at: H10, canal_message_id: 557, retire: false, mode: "ouvert" }]), /archivage refuse apres l'heure limite/);
  // Variantes : archivage seul, preuve sur un pari pas archive, insertion avec la preuve seule, heure du match deplacee dans la meme commande.
  await assert.rejects(() => base(H10).update("pro_paris", { id: "B" }, { retire: false, publie_at: H10 }), /archivage refuse/);
  await assert.rejects(() => base(H10).update("pro_paris", { id: "B" }, { canal_message_id: 556 }), /preuve d'envoi refusee/);
  await assert.rejects(() => base(H10).insert("pro_paris", [{ id: "D", jour: "2026-10-10", coup_envoi: ko, publie_at: null, canal_message_id: 558 }]), /preuve d'envoi refusee/);
  await assert.rejects(() => base(H10).update("pro_paris", { id: "B" }, { coup_envoi: "2026-10-11T19:00:00.000Z", publie_at: H10 }), /archivage refuse/, "la plus tot des deux heures compte");
  // Avant l'heure limite (H-80) : tout passe, comme avant.
  const H80 = "2026-10-10T17:40:00Z";
  assert.ok((await base(H80).update("pro_paris", { id: "B" }, { retire: false, mode: "ouvert", numero: 8, publie_at: H80, canal_message_id: 556 }))[0].publie_at);
  assert.strictEqual((await base(H80).insert("pro_paris", [{ id: "C", numero: 9, jour: "2026-10-10", coup_envoi: ko, publie_at: H80, canal_message_id: 557 }]))[0].numero, 9);
  // Le trigger de 0040 : insertion ET mise a jour, refus AVANT de poser l'heure, preuve refusee pour tout pari (archive ou non).
  const sql = fs.readFileSync(new URL("../supabase/migrations/0040_canal_pro.sql", import.meta.url), "utf8");
  const f = sql.slice(sql.indexOf("create or replace function public.pro_paris_heure_publication"), sql.indexOf("drop trigger if exists pro_paris_heure_publication"));
  assert.match(f, /if tg_op = 'UPDATE' then ko := least\(old\.coup_envoi, new\.coup_envoi\); end if;/);
  const refus = f.indexOf("archivage refuse apres l''heure limite");
  assert.ok(refus > 0 && refus < f.indexOf("new.publie_at := date_trunc"), "refus avant de poser l'heure");
  assert.match(f, /new\.canal_message_id is not null and \(tg_op = 'INSERT' or old\.canal_message_id is null\)\s+and now\(\) >= ko - interval '70 minutes'/);
  assert.ok(!/return new; end if;/.test(f.slice(0, refus)), "aucune sortie anticipee avant le controle");
  assert.match(sql, /create trigger pro_paris_heure_publication before insert or update on public\.pro_paris/);
});

test("ronde 4.1 (sim9) : coquille chez Pinnacle (1,38 tape 13,8) -> pari retire au dernier controle, aucune cote gardee", () => {
  const coquille = { ...ev6([1.36, 4.7, 6.75], [13.8, 4.93, 7.65], DESEQUILIBRE[1]), sport_key: "soccer_italy_serie_a", commence_time: KO };
  assert.strictEqual(C.fr(C.margePinnacle([13.8, 4.93, 7.65]), 3), "0,406");
  assert.match(C.pinnacleDouteux(C.booksDepuisOddsApi(coquille)), /^cote Pinnacle douteuse au 1N2 \(somme des 1\/cote 0,406, hors 1,00 à 1,10 : erreur de cote probable\)$/);
  assert.strictEqual(C.pinnacleDouteux(C.booksDepuisOddsApi(ev6([1.36, 4.7, 6.75], ...DESEQUILIBRE))), null, "la vraie cote (1,38) : normale");
  const e = C.etatMarche(C.booksDepuisOddsApi(coquille), "1", null);
  assert.strictEqual(e.pinnacle_proba, null);
  assert.strictEqual(e.pinnacle_douteuse, true);
  const x = C.controlePublication(pariTest("1", 0.68), e, "2026-10-10T07:30:00Z");
  assert.strictEqual(x.maj, undefined, "jamais publie");
  assert.match(x.raison, /cote Pinnacle douteuse au dernier contrôle/);
  assert.deepStrictEqual(C.cotesVerifiees(e).cotes, {}, "ni releve ni alerte sur une reference faussee");
  assert.deepStrictEqual(C.referencePinnacle({ pinnacle: { ou: [1.95, 19.0] } }, "U25", null), { proba: null, cote: null, douteuse: true });
  assert.deepStrictEqual(C.referencePinnacle({ pinnacle: { ah: new Map([[-0.5, [1.95, 1.9]]]) } }, "AHH", -0.5).cote, 1.95, "paire normale : gardee");
  // Fourchette PROVISOIRE (a fixer par le trader) ; les vraies marges passent.
  assert.deepStrictEqual({ ...C.MARGE_PINNACLE }, { min: 1.0, max: 1.1 });
  assert.deepStrictEqual([[2.6, 3.15, 3.0], [1 / 0.5, 1 / 0.3, 1 / 0.29], [1 / 0.5, 1 / 0.3, 1 / 0.31], [1 / 0.5, 1 / 0.3, 1 / 0.19]].map((v) => C.margePinnacleNormale(v)), [true, true, false, false]);
});

test("ronde 4.1 (plus tard) : ex-abonne sans effet sur /reglages ; textes « reporte » et « pas parti » a 75 min (heure reelle d'arret du robot)", () => {
  const bot = fs.readFileSync(new URL("../supabase/functions/telegram-bot/index.ts", import.meta.url), "utf8");
  const debut = bot.indexOf("async function reglageClic"), clic = bot.slice(debut, bot.indexOf("\nasync function", debut + 10));
  assert.ok(clic.indexOf("if (!ab || !ab.actif)") > 0 && clic.indexOf("if (!ab || !ab.actif)") < clic.indexOf("appliquerReglage"), "abonnement verifie avant tout changement");
  assert.match(C.MESSAGE_REPORTE("2026-10-10", "publication"), /sans les matchs qui commencent dans moins de 75 min/);
  assert.ok(!/reviennent avant les matchs/.test(C.MESSAGE_REPORTE("2026-10-10", "publication")));
  const taches = fs.readFileSync(new URL("../scripts/canal-pro/taches.mjs", import.meta.url), "utf8");
  assert.ok(!/jusqu'à l'heure limite \(\$\{C\.PREUVE_LIMITE_MIN\} min avant le match\)/.test(taches));
  assert.match(taches, /Je réessaie à chaque tour jusqu'à \$\{C\.PREUVE_LIMITE_MIN \+ C\.ENVOI_MARGE_MIN\} min avant le match \(heure limite de la preuve/);
  assert.match(taches, /si elle revient à temps, le programme part \(sans nouveau clic de ta part\), sans les matchs qui commencent dans moins de/);
});

// ---------- 02/10/2026 : heure d'envoi du programme du matin (pro_preferences.heure_envoi, 0044) ----------
test("heure d'envoi : rien avant l'heure choisie (ni programme, ni alerte), puis SON programme une seule fois ; sans heure, a la publication", async () => {
  const j = journee({ prefsForm: { bookmakers: ["winamax"], limite_paris_jour: 5, heure_envoi: 12 } });
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps);
  await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps); // 9 h 30 a Paris : publication
  assert.strictEqual(registre(j.tg).length, 2, "le registre (preuve d'envoi) part a l'heure habituelle : en-tete + 1 pari");
  assert.strictEqual(lesMessages(j.tg).filter((x) => x.chat === 555).length, 0, "9 h 30 : pas avant midi pour cet abonne (ni programme commun, ni perso)");
  j.cotesDuMoment.winamax_fr = 1.62; // cote en baisse : l'alerte attend aussi son heure
  j.a("2026-10-10T09:45:00Z"); await T.tourner(j.deps); // 11 h 45
  assert.strictEqual(lesMessages(j.tg).filter((x) => x.chat === 555).length, 0, "11 h 45 : toujours rien (ni programme, ni alerte sur ses paris)");
  j.a("2026-10-10T10:05:00Z"); await T.tourner(j.deps); // 12 h 05
  const perso = lesMessages(j.tg).filter((x) => x.chat === 555);
  assert.ok(perso.length >= 1, "12 h 05 : son programme part");
  assert.match(perso[0].text, /^<b>Karim, ton programme du samedi<\/b>[\s\S]*Cote : <b>1,\d0<\/b> chez Winamax/);
  assert.ok(registre(j.tg)[1].text.includes("Sélection : <b>Torino gagne</b>") && perso[0].text.includes("Sélection : <b>Torino gagne</b>"), "le meme pari que le registre");
  const n = perso.length;
  j.a("2026-10-10T10:20:00Z"); await T.tourner(j.deps);
  j.a("2026-10-10T10:35:00Z"); await T.tourner(j.deps);
  assert.strictEqual(lesMessages(j.tg).filter((x) => x.chat === 555 && /ton programme du/.test(x.text)).length, 1, "son programme : jamais deux fois");
  assert.strictEqual(lesMessages(j.tg).filter((x) => x.chat === 555).length - n <= 1, true, "au plus l'alerte de cote ensuite, jamais un 2e programme");
// Sans heure choisie : a la publication, comme avant.
  const k = journee();
  k.a("2026-10-10T06:45:00Z"); await T.tourner(k.deps);
  await k.valider();
  k.a("2026-10-10T07:30:00Z"); await T.tourner(k.deps);
  assert.strictEqual(lesMessages(k.tg).filter((x) => x.chat === 555).length, 1, "un seul message (son programme), a la publication");
  // Heure invalide (hors 8..22) : ignoree.
  assert.strictEqual(C.preferencesEffectives({ heure_envoi: 3 }).heure_envoi, null);
  assert.strictEqual(C.preferencesEffectives({ heure_envoi: 12 }).heure_envoi, 12);
});

test("programme a 12 h : retenu avant, envoye a 12 h ; un autre abonne sans heure le recoit a la publication ; tout commence = aucun message", async () => {
  const j = journee({ prefsForm: { bookmakers: ["winamax"], limite_paris_jour: 5, heure_envoi: 12 } });
  // 2e abonne Pro, sans heure choisie.
  await j.db.insert("users", [{ id: "u3", plan: "pro", role: "customer" }]);
  await j.db.insert("telegram_abonnes", [{ user_id: "u3", chat_id: 888, prenom: "Lea", reglages: {}, bloque: false }]);
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps);
  await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  assert.match(lesMessages(j.tg).filter((x) => x.chat === 888)[0]?.text || "", /^<b>Lea, ton programme du samedi<\/b>[\s\S]*Torino gagne/, "sans heure choisie : a la publication");
  assert.strictEqual(lesMessages(j.tg).filter((x) => x.chat === 555).length, 0);
  assert.ok((await j.db.select("pro_envois", { cle: `pro:programme-2026-10-10:u1` })).length, "cle posee « differe » : jamais envoye tel quel");
  j.a("2026-10-10T10:00:00Z"); await T.tourner(j.deps); // 12 h 00 pile
  assert.match(lesMessages(j.tg).filter((x) => x.chat === 555)[0]?.text || "", /^<b>Karim, ton programme du samedi<\/b>[\s\S]*Torino gagne/, "12 h : son programme");
  assert.strictEqual(lesMessages(j.tg).filter((x) => x.chat === 888 && /ton programme du/.test(x.text)).length, 1, "l'autre abonne ne le recoit pas deux fois");
  // Heure choisie APRES le coup d'envoi (16 h ; match a 15 h) : tout est commence, aucun message.
  const k = journee({ prefsForm: { bookmakers: ["winamax"], limite_paris_jour: 5, heure_envoi: 16 } });
  k.a("2026-10-10T06:45:00Z"); await T.tourner(k.deps);
  await k.valider();
  k.a("2026-10-10T07:30:00Z"); await T.tourner(k.deps);
  for (const h of ["2026-10-10T14:05:00Z", "2026-10-10T14:20:00Z"]) { k.a(h); await T.tourner(k.deps); }
  assert.strictEqual(lesMessages(k.tg).filter((x) => x.chat === 555 && /Programme du|Ton programme|Torino/.test(x.text)).length, 0, "match commence : jamais envoye");
});


// ---------- 02/10/2026 : Espagne ouverte (operateurs DGOJ) ----------
test("abonne en Espagne : SON programme avec les cotes de SES operateurs autorises en Espagne, jamais un operateur francais", async () => {
  const j = journee({ prefsForm: { pays: "es", bookmakers: ["williamhill"], limite_paris_jour: 5 } });
  j.cotesDuMoment.williamhill = 1.72; j.cotesDuMoment.sport888 = 1.69;
  j.a("2026-10-10T06:45:00Z"); await T.tourner(j.deps);
  await j.valider();
  j.a("2026-10-10T07:30:00Z"); await T.tourner(j.deps);
  const prive = lesMessages(j.tg).filter((x) => x.chat === 555);
  assert.strictEqual(prive.length, 1, "un seul message");
  const [perso] = prive.map((x) => x.text);
  assert.match(perso, /Cote : <b>1,72<\/b> chez William Hill/);
  assert.match(perso, /meilleure cote chez tes bookmakers \(William Hill\)/, "en-tete : SES operateurs");
  assert.ok(!/Betclic|Winamax|NetBet|PMU|Unibet/.test(perso), "jamais un operateur francais : " + perso);
  // Le registre (France) reste celui des operateurs ANJ.
  assert.match(registre(j.tg)[1].text, /chez Betclic/);
  // Les cotes espagnoles sont archivees a part (« es: »), jamais melangees a la cote de fin francaise.
  const rel = await j.db.select("pro_cotes_releves", {});
  assert.ok(rel.some((r) => r.bookmaker === "es:williamhill" && r.cote === 1.72));
  assert.ok(!rel.some((r) => r.bookmaker === "williamhill"));
  // Pays : Espagne ouverte, Belgique et Suisse toujours fermees.
  assert.ok(C.BOOKMAKERS_AGREES.ES && !C.BOOKMAKERS_AGREES.BE && !C.BOOKMAKERS_AGREES.CH);
});

test("Espagne : la liste du robot = la config (operateurs DGOJ suivis, meme flux The Odds API) ; source publique citee", async () => {
  const fs = await import("node:fs");
  const conf = JSON.parse(fs.readFileSync(new URL("../config/bookmakers-agrees.json", import.meta.url), "utf8"));
  const es = conf.pays.es;
  assert.strictEqual(es.regulateur, "DGOJ");
  assert.deepStrictEqual(es.bookmakers.filter((b) => b.suivi).map((b) => [b.id, b.oddsApiKey]), C.BOOKMAKERS_AGREES.ES.filter((b) => b.suivi).map((b) => [b.cle, b.odds]));
  assert.deepStrictEqual(es.bookmakers.map((b) => b.id).sort(), C.BOOKMAKERS_AGREES.ES.map((b) => b.cle).sort());
  assert.ok(conf._readme.some((l) => l.includes("https://www.ordenacionjuego.es/operadores-juego/operadores-licencia/operadores")));
  assert.deepStrictEqual(conf.pays.be.bookmakers, [], "Belgique : pas encore");
  assert.deepStrictEqual(conf.pays.ch.bookmakers, [], "Suisse : pas encore");
  const A = await import("../supabase/functions/_shared/canal-pro-accueil.mjs");
  assert.deepStrictEqual(["fr", "es", "be", "ch", "autre"].map(A.paysEnBase), ["fr", "es", "autre", "autre", "autre"]);
  assert.strictEqual(A.appliquer("py", "es", C.preferencesEffectives(null)).note, "");
  assert.strictEqual(A.appliquer("py", "be", C.preferencesEffectives(null)).note, "pasOuvert");
});
