"use strict";
// Page Lolly Bet et « Pro offert 1 mois » (11/11/2026, decision de Clement) :
// page /<version>/lolly.html, option sur le cadenas Pro de la page match, table
// pro_offert_demandes (migration 0074, RLS stricte, jamais d'auto-validation),
// liste a valider dans admin.html, clics mesures (data-track -> funnel_events).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const LP = require("../lib/lolly-page.js");
const H = require("../admin-dashboard.js");
const LOCALES = ["fr", "en", "es", "es-mx", "pt", "de", "it"];
const DIRS = ["fr", "en", "es", "gb", "za", "mx", "pt"];
const dict = (l) => JSON.parse(read("i18n/dict/" + l + ".json"));

test("identifiant Lolly : e-mail ou login, 3 a 120 caracteres, sans espace ni balise", () => {
  assert.equal(LP.identifiantValide("joueur@exemple.fr"), true);
  assert.equal(LP.identifiantValide("  Joueur_75  "), true);
  for (const v of ["", "ab", "a b c", "x".repeat(121), "<script>", null, undefined]) assert.equal(LP.identifiantValide(v), false, String(v));
});

test("etat du bloc Pro offert : compte d'abord, puis attente, valide, deja Pro, refus", () => {
  const futur = new Date(Date.now() + 864e5).toISOString(), passe = new Date(Date.now() - 864e5).toISOString();
  const co = { session: { user: { id: "u" } }, isPro: false };
  assert.equal(LP.etatPro(null, null), "sans_compte");
  assert.equal(LP.etatPro({ session: null }, { statut: "en_attente" }), "sans_compte");
  assert.equal(LP.etatPro(co, null), "a_declarer");
  assert.equal(LP.etatPro(co, { statut: "en_attente" }), "en_attente");
  assert.equal(LP.etatPro({ ...co, isPro: true }, { statut: "valide", pro_jusqu_au: futur }), "valide");
  assert.equal(LP.etatPro({ ...co, isPro: true }, null), "deja_pro");
  assert.equal(LP.etatPro(co, { statut: "valide", pro_jusqu_au: passe }), "a_declarer");
  assert.equal(LP.etatPro(co, { statut: "refuse" }), "refuse");
  assert.equal(LP.erreurCle({ message: "pro_offert_deja_demande" }), "deja");
  assert.equal(LP.erreurCle({ message: "pro_offert_trop_de_demandes" }), "trop");
  assert.equal(LP.erreurCle({ message: "autre" }), "envoi");
});

test("page : bouton vers /go/lolly/site, 18+, aucun texte utilisateur en innerHTML", () => {
  const src = read("lolly.html"), js = read("lib/lolly-page.js");
  assert.ok((src.match(/href="\/go\/lolly\/site"/g) || []).length >= 2);
  assert.match(src, /rel="sponsored noopener"/);
  assert.match(src, /18\+/);
  assert.match(src, /id="pro-offert"/);
  assert.doesNotMatch(js, /\.innerHTML\s*=|insertAdjacentHTML/);
  assert.match(js, /lien\("inscription\.html\?next="/);
  assert.match(js, /from\(TABLE\)\.insert\(\{ identifiant: v, partenaire: "lolly" \}\)/);
});

test("offre Lolly : formulation exacte, jamais « 100 € offerts », pas de code promo, aucune emoticone", () => {
  const sp = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v).replace(/\u00a0/g, " ")]));
  const fr = sp(dict("fr").lolly_page);
  assert.equal(fr.offer_main, "1er pari remboursé en cash jusqu’à 100 €");
  // 17/11/2026 : l'attente annonce une reponse sous 24 h, sur cette page (personne n'est prevenu autrement).
  assert.equal(fr.pro_pending, "Demande reçue. On vérifie ton inscription chez Lolly Bet et on te répond sous 24 h, ici, sur cette page.");
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  for (const l of LOCALES) {
    const txt = JSON.stringify(dict(l).lolly_page) + JSON.stringify(dict(l).match_page.pro_offert_text);
    assert.doesNotMatch(txt, /100\s?€\s?offerts|€100 free|100 € gratis|100 € grátis/i, l);
    assert.doesNotMatch(txt, /d[ée]p[oô]s(e|er|ez) 20/i, l + " : jamais pousser a deposer 20 €");
    assert.doesNotMatch(txt, emoji, l);
  }
});

test("7 dictionnaires : memes cles, titre et description de page, option du cadenas avec {book}", () => {
  const ref = Object.keys(dict("fr").lolly_page).sort();
  for (const l of LOCALES) {
    const d = dict(l);
    assert.deepEqual(Object.keys(d.lolly_page).sort(), ref, l);
    for (const k of ref) assert.ok(String(d.lolly_page[k]).trim(), l + " " + k);
    assert.ok(d.geo.meta.lolly.title && d.geo.meta.lolly.description, l);
    assert.match(d.match_page.pro_offert_text, /\{book\}/, l);
    assert.ok(d.match_page.pro_offert_title && d.match_page.pro_offert_or, l);
    assert.match(d.lolly_page.pro_ok, /\{date\}/, l);
    assert.match(d.lolly_page.pro_declared, /\{id\}/, l);
    const part = JSON.parse(read("i18n/parts/lolly." + l + ".json"));
    assert.deepEqual(part.lolly_page, d.lolly_page, l + " : partie et dictionnaire identiques");
  }
});

test("pages generees dans chaque version, hors sitemap, liens courts /lolly", () => {
  for (const d of DIRS) {
    const p = read(d + "/lolly.html");
    assert.match(p, new RegExp('rel="canonical" href="https://iashark\\.com/' + d + '/lolly\\.html"'), d);
    assert.match(p, /noindex/, d);
  }
  assert.match(read("scripts/i18n-manifest.js"), /\{file: "lolly\.html", noSitemap: true\}/);
  assert.match(read("i18n/i18n.js"), /"lolly\.html"/);
  const r = read("_redirects");
  assert.match(r, /^\/lolly\.html\s+\/fr\/lolly\.html\s+301!$/m);
  assert.match(r, /^\/lolly\s+\/fr\/lolly\.html\s+301!$/m);
  assert.match(read("en/lolly.html"), />Sign up at Lolly Bet</);
});

test("cadenas Pro de la page match : 2e option « Pro offert 1 mois » vers la page Lolly, mesuree", () => {
  const src = read("match-page.js");
  assert.match(src, /secs\.push\(\['prooffert',carteProOffert\(\),null,true\]\);/);
  assert.match(src, /lien\('lolly\.html'\)\)\}#pro-offert"\$\{suivi\('lolly_pro_offert_match'\)\}/);
  const ft = read("funnel-track.js");
  for (const k of ["lolly_page_inscription", "lolly_page_inscription_bas", "lolly_page_banniere", "lolly_page_offre", "lolly_pro_offert_match", "lolly_pro_compte", "lolly_pro_lien", "lolly_pro_declarer", "lolly_pro_outils"]) {
    assert.match(ft, new RegExp(k + ": true"), k);
  }
  for (const k of ["lolly_page_inscription", "lolly_page_offre"]) assert.match(read("lolly.html"), new RegExp('data-track-kind="' + k + '"'), k);
  for (const k of ["lolly_pro_compte", "lolly_pro_declarer", "lolly_pro_outils"]) assert.match(read("lib/lolly-page.js"), new RegExp('"' + k + '"'), k);
  assert.match(read("assets/match-page.css"), /\.po-carte\{/);
});

test("migration 0074 : RLS stricte, jamais d'auto-validation, Pro par le plan famille, fin automatique", () => {
  const sql = read("supabase/migrations/0074_pro_offert_lolly.sql");
  assert.match(sql, /alter table public\.pro_offert_demandes enable row level security;/);
  assert.match(sql, /for select to authenticated\s+using \(user_id = auth\.uid\(\)\)/);
  assert.match(sql, /for insert to authenticated\s+with check \(user_id = auth\.uid\(\) and statut = 'en_attente'/);
  assert.doesNotMatch(sql, /create policy[^;]*for (update|delete|all)/i, "aucune modification ni suppression par la personne");
  assert.match(sql, /revoke all on public\.pro_offert_demandes from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /grant [^;]*pro_offert_demandes to [^;]*anon/);
  assert.match(sql, /grant insert \(identifiant, partenaire\) on public\.pro_offert_demandes to authenticated;/);
  // Le declencheur remet la demande en attente, quoi que le navigateur envoie.
  assert.match(sql, /new\.statut := 'en_attente';/);
  assert.match(sql, /new\.pro_jusqu_au := null;/);
  // Seul un admin decide ; le Pro s'ouvre par le plan famille (0032), pour un compte gratuit seulement.
  const decider = sql.slice(sql.indexOf("function public.admin_pro_offert_decider"));
  assert.match(decider, /if not public\.admin_is_admin\(\) then/);
  assert.match(decider, /update public\.users set plan = 'famille' where id = d\.user_id and plan = 'free';/);
  assert.match(decider, /interval '1 month'/);
  assert.match(sql, /function public\.admin_pro_offert_demandes\(\)[\s\S]*?if not public\.admin_is_admin\(\) then/);
  // Fin du mois : seulement les comptes qui etaient gratuits et toujours en famille.
  assert.match(sql, /if r\.plan_avant = 'free' then\s+update public\.users set plan = 'free' where id = r\.user_id and plan = 'famille';/);
  assert.match(sql, /set_config\('iashark\.allow_plan_change', 'on', true\)/);
  assert.match(sql, /cron\.schedule\('pro-offert-fin'/);
  assert.match(sql, /revoke all on function public\.pro_offert_fin\(\) from public, anon, authenticated;/);
});

test("admin : liste a verifier, Valider / Refuser seulement en attente, texte de la personne echappe", () => {
  assert.deepEqual(H.proOffertActions("en_attente").map((a) => a.to), ["valide", "refuse"]);
  assert.deepEqual(H.proOffertActions("valide"), []);
  assert.deepEqual(H.proOffertActions("refuse"), []);
  const l = H.proOffertTri([
    { id: "a", statut: "valide", created_at: "2026-11-11T10:00:00Z" },
    { id: "b", statut: "en_attente", created_at: "2026-11-10T10:00:00Z" },
    { id: "c", statut: "en_attente", created_at: "2026-11-11T09:00:00Z" },
    null
  ]);
  assert.deepEqual(l.map((x) => x.id), ["c", "b", "a"]);
  assert.deepEqual(H.proOffertCompte(l), { en_attente: 2, valide: 1, refuse: 0 });
  const html = read("admin.html"), js = read("admin-dashboard.js");
  assert.match(html, /id="proOffertBloc"[^>]*|data-screen="partenaires" id="proOffertBloc"/);
  assert.match(html, /<div id="proOffert">/);
  assert.match(html, /id="proOffertTodo"/);
  assert.match(js, /rpc\("admin_pro_offert_decider", \{ p_id: id, p_statut: to, p_note: null \}\)/);
  assert.match(js, /esc\(d\.identifiant \|\| "Identifiant vide"\)/);
  assert.match(js, /loadPartners\(\);\n\s+loadProOffert\(\);/);
});

test("meme e-mail sur les deux comptes (12/11/2026) : e-mail du compte affiche, champ deja rempli, repere dans l'admin", () => {
  // E-mail du compte connecte : minuscules, sans espaces ; rien si inconnu ou mal forme.
  assert.equal(LP.emailCompte({ session: { user: { email: "  Joueur@Exemple.FR " } } }), "joueur@exemple.fr");
  assert.equal(LP.emailCompte({ user: { email: "a@b.co" } }), "a@b.co");
  for (const c of [null, {}, { session: null }, { session: { user: {} } }, { session: { user: { email: "pas un mail" } } }, { session: { user: { email: "<x>@y.fr" } } }]) assert.equal(LP.emailCompte(c), "", JSON.stringify(c));
  // La meme regle des deux cotes : page publique et admin.
  for (const f of [LP.memeEmail, H.proOffertMemeEmail]) {
    assert.equal(f("Joueur@Exemple.fr ", "joueur@exemple.fr"), true);
    assert.equal(f("joueur_75", "joueur@exemple.fr"), false);
    assert.equal(f("", ""), false);
    assert.equal(f(null, undefined), false);
  }
  const js = read("lib/lolly-page.js");
  // Etape 2 : l'e-mail du compte et un bouton Copier, par textContent (jamais innerHTML).
  assert.match(js, /p\.appendChild\(el\("b", "lb-meme-email", email\)\);/);
  assert.match(js, /navigator\.clipboard\.writeText\(email\)/);
  assert.doesNotMatch(js, /\.innerHTML\s*=/);
  // Etape 3 : champ deja rempli avec l'e-mail du compte, bouton qui dit l'action.
  assert.match(js, /inp\.value = emailCompte\(ctx\);/);
  assert.match(js, /t\("lolly_page\.pro_send", "Demander mon mois Pro"\)/);
  // Sans compte : l'etape 1 cree le compte IASHARK (retour sur cette page).
  assert.match(js, /el\("a", "lb-btn", t\("lolly_page\.pro_signup"/);
  const html = read("lolly.html");
  assert.match(html, /<p class="lb-meme" id="lbMeme" hidden><\/p>\s*<a class="lb-cta" id="lbCta" href="\/go\/lolly\/site"/);
  assert.equal((html.match(/class="lb-cta"/g) || []).length, 1, "un seul bouton Lolly dans le parcours");
  // Banniere officielle : cliquable avec notre lien, cachee par defaut.
  assert.match(html, /<a class="lb-banniere" id="lbBanniere" hidden href="\/go\/lolly\/site" target="_blank" rel="sponsored noopener" data-track="lolly_page_banniere"/);
  // Montree dans la langue de la page quand le partenaire a fourni la banniere (6 langues, 12/11/2026).
  assert.match(js, /if \(ban && fichier\) \{/);
  assert.match(js, /ban\.hidden = false; if \(ligne\) ligne\.hidden = true;/);
  assert.match(js, /\{ fr: "fr\.webp", en: "en\.jpg", es: "es\.jpg", de: "de\.jpg", it: "it\.jpg", pt: "pt\.jpg" \}/);
  // Inscription venue de la page Lolly : la meme consigne.
  for (const l of LOCALES) {
    const d = dict(l);
    for (const k of ["same_email", "copy", "copied", "pro_send", "step_declare", "step_account"]) assert.ok(String(d.lolly_page[k] || "").trim(), l + " lolly_page." + k);
    assert.ok(String(d.auth.signup_intro_lolly || "").trim(), l + " auth.signup_intro_lolly");
  }
  assert.equal(dict("fr").lolly_page.same_email, "Avec le même e-mail :");
  assert.match(dict("fr").auth.signup_intro_lolly, /même e-mail que chez Lolly Bet/);
  // Admin : chaque demande dit si l'identifiant declare est l'e-mail du compte.
  const adm = read("admin-dashboard.js");
  assert.match(adm, /H\.proOffertMemeEmail\(d\.identifiant, d\.email\) \? "même e-mail chez Lolly Bet et sur IASHARK" : "identifiant différent de l'e-mail du compte"/);
  assert.match(read("funnel-track.js"), /lolly_pro_copier: true/);
});

test("relecture « visiteur » du 12/11 : memes mesures de bouton, textes qui ne promettent pas plus vite que la verification", () => {
  const css = read("assets/lolly.css");
  // Memes mesures de bouton sur tout le parcours : 52 px, 16 px.
  assert.match(css, /\.lb-cta,\.lb-btn\{[^}]*min-height:52px;[^}]*font-size:16px;font-weight:800/);
  assert.match(read("assets/account.css"), /\.ins #submit\{height:52px;font-size:16px;font-weight:800\}/);
  // Verification a la main : aucun texte ne dit « tout de suite » ; l'attente dit de revenir sur la page.
  for (const l of LOCALES) {
    const d = dict(l);
    assert.doesNotMatch(d.auth.signup_intro_lolly + " " + d.lolly_page.pro_pending, /tout de suite|right away|enseguida|sofort|subito|logo o teu/i, l);
    assert.ok(String(d.match_page.bk_pro_link || "").trim(), l + " match_page.bk_pro_link");
  }
  assert.match(dict("fr").lolly_page.pro_pending, /^Demande reçue\. .*sous 24 h, ici, sur cette page\.$/);
  assert.equal(dict("fr").match_page.bk_pro_link, "1 mois de Pro offert : voir comment");
});

test("l'autre chemin vers le Pro (12/11/2026) : une ligne sous le deblocage des combines et sur Mon compte, bloc partenaire sur la page d'exemple", () => {
  const A = require("../lib/aujourdhui.js");
  const pub = { statut: "publie", verrou: "pro" };
  const rep = (niveau) => ({ niveau, jour: "2026-11-12", blocs: { x5: pub, x10: pub, or: pub, buteur: { statut: "publie", verrou: niveau === "anonyme" ? "compte" : null } } });
  const src = read("lib/aujourdhui.js");
  // Compte gratuit : sous le bouton « Passe Pro », UNE ligne vers la page Lolly (jamais un deuxieme bouton).
  assert.match(src, /bouton\(hrefPro, t\("aujourdhui\.cta_pro", "Passe Pro"\)\), "", offert\);/);
  assert.match(src, /<a class="aj-offert" href="' \+ esc\(lien\("lolly\.html"\)\) \+ '#pro-offert" data-track="lolly_pro_offert_tickets"/);
  assert.match(src, /a\.parentNode\.insertBefore\(p, a\.parentNode\.querySelector\("\.aj-offert"\)\);/, "la mention de l'essai reste collee a son bouton");
  if (typeof A.deverrouillage === "function") {
    const gratuit = A.deverrouillage(rep("gratuit"), {});
    if (gratuit) {
      assert.equal((gratuit.match(/class="aj-offert"/g) || []).length, 1);
      assert.match(gratuit, /Lolly Bet, notre partenaire/);
      assert.ok(gratuit.indexOf("aj-cta") < gratuit.indexOf("aj-offert"), "apres le bouton");
    }
    const pro = A.deverrouillage(rep("pro"), {});
    assert.doesNotMatch(String(pro || ""), /aj-offert/, "un abonne Pro ne voit pas la ligne");
  }
  // Mon compte (compte gratuit) : la meme ligne sous le composant de paiement.
  assert.match(read("account-page.js"), /<div id="offreCompte"><\/div>'[\s\S]{0,400}class="aj-offert" href="' \+ esc\(lien\('lolly\.html'\)\) \+ '#pro-offert" data-track="lolly_pro_offert_compte"/);
  // Page d'exemple : le match fige est termine, le bloc partenaire s'affiche quand meme.
  assert.match(read("match-page.js"), /const demo=typeof IASHARK_DEMO!=='undefined'&&IASHARK_DEMO;\n\s*const moment=demo\?'avant':momentParieur\(raw\);/);
  const ft = read("funnel-track.js");
  for (const k of ["lolly_pro_offert_tickets", "lolly_pro_offert_compte"]) assert.match(ft, new RegExp(k + ": true"));
  const PART = { fr: /notre partenaire/, en: /our partner/, es: /nuestro socio/, "es-mx": /nuestro socio/, de: /unserem Partner/, it: /nostro partner/, pt: /nossa parceira/ };
  for (const l of LOCALES) {
    const v = dict(l).aujourdhui.pro_offert_link;
    assert.ok(String(v || "").trim(), l);
    assert.match(v, /Lolly Bet/, l);
    assert.match(v, PART[l], l + " : Lolly Bet, notre partenaire");
    assert.equal(JSON.parse(read("i18n/parts/vente." + l + ".json")).aujourdhui.pro_offert_link, v, l);
  }
  assert.doesNotMatch(read("assets/aujourdhui.css").split("\n").filter((x) => /^\.aj-offert/.test(x)).join("\n"), /uppercase|monospace/);
});

test("clic obligatoire (17/11/2026) : 3 etapes, jeton dans le lien, formulaire ferme sans clic note dans la base", async () => {
  // Etats des etapes : compte, clic, declaration.
  assert.deepEqual(LP.etapes("sans_compte", null), ["current", "upcoming", "upcoming"]);
  assert.deepEqual(LP.etapes("a_declarer", null), ["complete", "current", "upcoming"]);
  assert.deepEqual(LP.etapes("a_declarer", "vu"), ["complete", "complete", "current"]);
  assert.deepEqual(LP.etapes("refuse", "declare"), ["complete", "complete", "current"]);
  assert.deepEqual(LP.etapes("refuse", null), ["complete", "current", "upcoming"]);
  assert.deepEqual(LP.etapes("en_attente", null), ["complete", "complete", "complete"]);
  assert.deepEqual(LP.etapes("valide", "vu"), ["complete", "complete", "complete"]);
  assert.equal(LP.etapes("deja_pro", "vu"), null);
  for (const c of [null, undefined, "", "oui", true]) assert.equal(LP.clicFait(c), false, String(c));
  assert.equal(LP.clicFait("vu"), true);
  assert.equal(LP.clicFait("declare"), true);
  // Le lien du compte porte son jeton ; tout ce qui n'est pas un uuid est ignore.
  const J = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
  assert.equal(LP.lienLolly(J.toUpperCase()), "/go/lolly/site?c=" + J);
  for (const v of [null, "", "abc", J + "&x=1", "<script>"]) assert.equal(LP.lienLolly(v), "/go/lolly/site", String(v));
  assert.equal(LP.erreurCle({ message: "pro_offert_sans_clic" }), "clic");
  // La redirection ne lit le jeton que pour Lolly Bet, et redirige toujours.
  const G = await import("../netlify/edge-functions/lib/go-links.mjs");
  assert.equal(G.jetonClic("/go/lolly/site", J), J);
  assert.equal(G.jetonClic("/go/LOLLY/x", J.toUpperCase()), J);
  for (const [p, c] of [["/go/vavada/site", J], ["/go/lolly/site", null], ["/go/lolly/site", "1"], ["/go/lolly/site", J + "'"], ["/", J]]) assert.equal(G.jetonClic(p, c), null, p + " " + c);
  assert.match(G.MARQUER_URL, /^https:\/\/ksvjraqitxouwiabecai\.supabase\.co\/rest\/v1\/rpc\/pro_offert_clic_marquer$/);
  assert.match(G.CLE_PUBLIQUE, /^eyJ/);
  assert.ok(read("app-client.js").includes(G.CLE_PUBLIQUE), "la meme cle publique que app-client.js, jamais une cle de service");
  const go = read("netlify/edge-functions/go.ts");
  assert.match(go, /if \(jeton\) await noterClic\(jeton\);\s+r = goResponse\(u\.pathname\);/);
  assert.match(go, /AbortSignal\.timeout\(1500\)/);
  // Page : le formulaire n'est rendu que si l'etape 3 est en cours ; l'etat du clic vient de la base.
  const js = read("lib/lolly-page.js"), html = read("lolly.html");
  assert.match(js, /if \(statuts\[2\] === "current"\) box\.appendChild\(formulaire\(ctx, etat === "refuse"\)\);/);
  assert.match(js, /app\.supabase\.rpc\("pro_offert_clic_preparer"\)/);
  assert.match(js, /app\.supabase\.rpc\("pro_offert_clic_declarer"\)/);
  assert.doesNotMatch(js, /localStorage/, "rien n'est ouvert sur la foi du navigateur");
  assert.doesNotMatch(js, /pro_offert_clic_marquer/, "seule la redirection note le clic");
  assert.match(js, /if \(cle === "clic"\) \{ clic = null; return charger\(\); \}/);
  assert.equal((html.match(/class="may-steps__step"/g) || []).length, 3);
  assert.match(html, /id="lbDeja" type="button" hidden data-track="lolly_pro_deja_clique"/);
  for (const k of ["lolly_page_commencer", "lolly_pro_deja_clique"]) assert.match(read("funnel-track.js"), new RegExp(k + ": true"), k);
  for (const l of LOCALES) for (const k of ["hero_text", "hero_cta", "step_account", "already_clicked", "click_seen", "pro_err_click", "st_done", "st_current", "st_todo", "steps_label"]) {
    assert.ok(String(dict(l).lolly_page[k] || "").trim(), l + " lolly_page." + k);
  }
  // Rien ne coupe le parcours : pas de fenetre Telegram sur cette page.
  assert.match(read("lib/telegram-demande.js"), /PAGES_EXCLUES = \/\([^)]*\|lolly\)\/i/);
});

test("migration 0077 : clic note cote serveur, demande refusee sans clic, jamais d'auto-validation", () => {
  const sql = read("supabase/migrations/0077_pro_offert_clic.sql");
  assert.match(sql, /alter table public\.pro_offert_clics enable row level security;/);
  assert.match(sql, /revoke all on public\.pro_offert_clics from public, anon, authenticated;/);
  assert.doesNotMatch(sql, /create policy/i, "aucun acces direct a la table des clics");
  // Seule la fonction de marquage est ouverte a la cle publique ; les deux autres demandent un compte.
  assert.match(sql, /grant execute on function public\.pro_offert_clic_marquer\(uuid\) to anon, authenticated;/);
  assert.match(sql, /revoke all on function public\.pro_offert_clic_preparer\(\) from public, anon;/);
  assert.match(sql, /revoke all on function public\.pro_offert_clic_declarer\(\) from public, anon;/);
  assert.match(sql, /set clique_le = coalesce\(clique_le, now\(\)\) where id = p_jeton;/);
  // Le declencheur refuse sans clic, et recopie « vu » ou « declare » sur la demande.
  const ctl = sql.slice(sql.indexOf("function public.pro_offert_demandes_controle"), sql.indexOf("-- Admin :"));
  assert.match(ctl, /if not found or \(c\.clique_le is null and c\.declare_le is null\) then\s+raise exception 'pro_offert_sans_clic'/);
  assert.match(ctl, /new\.clic := public\.pro_offert_clic_etat_de\(c\);/);
  assert.match(ctl, /new\.statut := 'en_attente';/);
  assert.match(ctl, /pro_offert_deja_demande/);
  assert.doesNotMatch(sql, /set plan = /, "aucune ouverture de Pro ici : la validation reste dans admin_pro_offert_decider");
  assert.match(sql, /d\.fin_appliquee_le, d\.clic, d\.clic_le, u\.email/);
  // Admin : la mention suit le clic.
  assert.equal(H.proOffertClic("vu"), "clic sur notre lien vu");
  assert.match(H.proOffertClic("declare"), /^CLIC NON VU/);
  assert.match(H.proOffertClic(null), /avant le contrôle/);
  assert.match(read("admin-dashboard.js"), /facts\.push\(H\.proOffertClic\(d\.clic\)\);/);
});
