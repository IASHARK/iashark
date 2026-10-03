"use strict";
// Pastille Telegram (02/10/2026, decision de Clement) : la MEME sur toutes les
// pages, toutes les langues, connecte ou non ; visiteur / compte gratuit =
// canal gratuit t.me/iasharkdata ; Pro (essai, admin) = « Mes messages Pro »,
// sa conversation privee avec le robot (meme appel que la page Compte) ;
// jamais de texte cache (hauteur reservee en bas des pages).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const DICTS = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read("i18n/dict/" + l + ".json"))]));

// Pages HTML publiques (memes sources que scripts/build-public.js).
function pagesPubliques() {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    for (const n of fs.readdirSync(abs)) {
      if (n.startsWith(".")) continue;
      const r = path.posix.join(rel, n);
      if (fs.statSync(path.join(ROOT, r)).isDirectory()) walk(r);
      else if (n.endsWith(".html")) out.push(r);
    }
  };
  ["fr", "en", "es", "de", "it", "pt", "gb", "za", "mx", "match", "blog"].forEach(walk);
  ["index.html", "404.html", "blog.html"].forEach((f) => { if (fs.existsSync(path.join(ROOT, f))) out.push(f); });
  return out;
}

test("pastille presente sur TOUTES les pages HTML publiques (barre du bas ou script direct)", () => {
  const pages = pagesPubliques();
  assert.ok(pages.length > 300, "pages trouvees : " + pages.length);
  const sans = pages.filter((p) => {
    const html = read(p);
    // Redirections et pages techniques sans corps visible.
    if (!/<body/i.test(html) || /http-equiv="refresh"/i.test(html)) return false;
    return !/src="\/bottom-navigation\.js"/.test(html) && !/src="\/assets\/telegram-pill\.js"/.test(html);
  });
  assert.deepEqual(sans, [], "pages sans pastille");
  // Pages sans barre du bas : connexion, inscription, mots de passe (toutes les langues).
  for (const d of ["fr", "en", "es", "gb", "za", "mx"]) {
    for (const f of ["connexion", "inscription", "mot-de-passe-oublie", "reinitialiser-mot-de-passe"]) {
      assert.match(read(d + "/" + f + ".html"), /<script src="\/assets\/telegram-pill\.js" defer><\/script>/, d + "/" + f);
    }
  }
  // La barre du bas charge la pastille partout, sans exception (plus de pages exclues,
  // plus de version francaise seulement, plus de masquage apres un clic).
  const nav = read("bottom-navigation.js");
  assert.match(nav, /s\.src='\/assets\/telegram-pill\.js';/);
  assert.match(nav, /html\.classList\.add\('ias-nav-on','ias-tg-on'\);/);
  assert.doesNotMatch(nav, /ias-tg-bulle|SEPT_JOURS|AUTRES=\['en'/, "ancienne bulle retiree");
  const pill = read("assets/telegram-pill.js");
  assert.doesNotMatch(pill, /localStorage\.setItem|abonnement\|checkout/, "jamais cachee apres un clic ni sur les pages de paiement");
});

test("jamais de texte cache : hauteur reservee en bas des pages, au-dessus de la barre", () => {
  const css = read("assets/bottom-navigation.css");
  assert.match(css, /html\.ias-tg-on\{--ias-tg-h:52px\}/);
  assert.match(css, /body\{padding-bottom:calc\(84px \+ var\(--ias-tg-h,0px\) \+ env\(safe-area-inset-bottom\)\)!important\}/);
  assert.match(css, /html\.ias-tg-on\{--ias-tg-h:48px\}/);
  assert.match(css, /body\{padding-bottom:calc\(72px \+ var\(--ias-tg-h,0px\) \+ env\(safe-area-inset-bottom\)\)!important\}/);
  const pill = read("assets/telegram-pill.js");
  // Memes hauteurs que la feuille de la barre.
  assert.match(pill, /html\.ias-tg-on\{--ias-tg-h:52px\}/);
  assert.match(pill, /@media\(max-width:700px\)\{html\.ias-tg-on\{--ias-tg-h:48px\}\}/);
  // Pages sans barre : la page reserve aussi la place.
  assert.match(pill, /html\.ias-tg-on:not\(\.ias-nav-on\) body\{padding-bottom:calc\(var\(--ias-tg-h\) \+ env\(safe-area-inset-bottom\)\)!important\}/);
  // Juste au-dessus de la barre (84 px, 72 px sur telephone), bande opaque.
  assert.match(pill, /html\.ias-nav-on #ias-tg-band\{bottom:calc\(84px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(pill, /html\.ias-nav-on #ias-tg-band\{bottom:calc\(72px \+ env\(safe-area-inset-bottom\)\)\}/);
  assert.match(pill, /#ias-tg-band\{[^}]*background:rgba\(6,11,17,\.97\)/);
  // Autres elements fixes du bas : decales de la meme hauteur.
  assert.match(read("assets/match-page.css"), /\.cta-bar\{display:block;position:fixed;left:0;right:0;bottom:calc\(72px \+ var\(--ias-tg-h,0px\) \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(read("lib/lang-suggest.js"), /\.ias-lang-hint--nav\{bottom:calc\(96px \+ var\(--ias-tg-h,0px\)/);
});

test("textes de la pastille : 7 langues, repli = dictionnaire, aucune promesse", () => {
  const win = { document: null };
  new Function("window", read("assets/telegram-pill.js"))(win);
  // Sans document, le script ne pose rien ; on lit ses textes dans la source.
  const src = read("assets/telegram-pill.js");
  const T = new Function("return " + src.slice(src.indexOf("var TEXTES = ") + 13, src.indexOf("};", src.indexOf("var TEXTES = ")) + 1))();
  for (const l of LOCALES) {
    assert.deepEqual(T[l], DICTS[l].telegram_pill, l + " : repli = dictionnaire (i18n/parts/essai_bouton." + l + ".json)");
    for (const k of ["free_title", "free_sub", "pro_title", "pro_sub", "opening"]) assert.ok(T[l][k], l + "." + k);
    assert.doesNotMatch(JSON.stringify(T[l]), /gagn|win|ganar|gewinn|vinc|ganhar|garanti|mise|stake|risque/i, l);
  }
  assert.equal(T.fr.free_title, "Rejoins-nous sur Telegram");
  assert.equal(T.fr.pro_title, "Mes messages Pro");
});

// ---- Comportement reel du script, dans un faux navigateur minimal ----
function fakeDom(pathname) {
  class El {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.listeners = {}; this.className = ""; this._text = ""; this.style = {}; this.classList = { set: new Set(), add: (...c) => c.forEach((x) => this.classList.set.add(x)), contains: (c) => this.classList.set.has(c) }; }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === "id") this.id = String(v); }
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
    removeAttribute(k) { delete this.attrs[k]; }
    appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
    removeChild(c) { this.children = this.children.filter((x) => x !== c); }
    get firstChild() { return this.children[0] || null; }
    set textContent(v) { this._text = String(v); this.children = []; }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(""); }
    set innerHTML(v) { this._html = v; }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
    all() { return [this].concat(...this.children.map((c) => c.all())); }
    querySelector(sel) { const cls = sel.replace(/^\./, ""); return this.all().slice(1).find((e) => e.className === cls) || null; }
    set href(v) { this.attrs.href = v; } get href() { return this.attrs.href; }
    set target(v) { this.attrs.target = v; } set rel(v) { this.attrs.rel = v; }
  }
  const head = new El("head"), body = new El("body"), html = new El("html");
  const document = {
    readyState: "complete", head, body, documentElement: html,
    createElement: (t) => new El(t),
    getElementById: (id) => body.all().concat(head.all()).find((e) => e.id === id) || null,
    addEventListener() {}
  };
  return { document, head, body, html, location: { pathname, href: "https://iashark.com" + pathname } };
}
async function runPill(pathname, ctx, botReply) {
  const dom = fakeDom(pathname);
  const calls = [];
  const win = {
    document: dom.document, location: dom.location,
    IASHARK_OUVERTURE: { canalPro: true },
    IasharkCompteLeger: {
      url: "https://projet.supabase.co", key: "cle-publique",
      context: () => Promise.resolve(ctx),
      jeton: () => Promise.resolve(ctx && ctx.user ? "jeton-de-test" : null)
    },
    fetch: (url, init) => { calls.push({ url, init }); return Promise.resolve({ json: () => Promise.resolve(botReply) }); }
  };
  new Function("window", read("assets/telegram-pill.js"))(win);
  await new Promise((r) => setTimeout(r, 10));
  const a = dom.document.getElementById("ias-tg");
  return { win, dom, a, calls };
}

test("visiteur et compte gratuit : canal gratuit t.me/iasharkdata, nouvel onglet, sans aucun appel", async () => {
  for (const [p, ctx] of [["/fr/", { user: null, isPro: false }], ["/gb/compte.html", { user: { id: "u1" }, isPro: false }], ["/mx/match.html", { user: null, isPro: false }]]) {
    const r = await runPill(p, ctx, null);
    assert.ok(r.a, p + " : pastille posee");
    assert.equal(r.a.href, "https://t.me/iasharkdata", p);
    assert.equal(r.a.attrs.target, "_blank");
    assert.equal(r.a.getAttribute("data-tg-mode"), "gratuit");
    assert.equal(r.calls.length, 0, p + " : aucun appel au chargement");
    assert.ok(r.dom.html.classList.contains("ias-tg-on"));
  }
  const en = await runPill("/gb/", { user: null, isPro: false }, null);
  assert.match(en.a.textContent, /Join us on Telegram/);
  const mx = await runPill("/mx/", { user: null, isPro: false }, null);
  assert.match(mx.a.textContent, /Únete en Telegram/);
  const fr = await runPill("/fr/abonnement.html", { user: null, isPro: false }, null);
  assert.match(fr.a.textContent, /Rejoins-nous sur Telegram/, "aussi sur la page d'abonnement");
});

test("Pro : « Mes messages Pro », lien different du gratuit, clic = sa conversation privee avec le robot", async () => {
  const pro = { user: { id: "p1" }, isPro: true };
  // Pas encore relie : le serveur renvoie t.me/<robot>?start=<code>.
  const r = await runPill("/fr/match.html", pro, { ok: true, robot_url: "https://t.me/IasharkRobot?start=abc123" });
  assert.equal(r.a.getAttribute("data-tg-mode"), "pro");
  assert.match(r.a.textContent, /Mes messages Pro/);
  assert.notEqual(r.a.href, "https://t.me/iasharkdata", "lien Pro different du lien gratuit");
  assert.equal(r.a.href, "/fr/compte.html", "sans JavaScript : la page Compte (meme bouton)");
  assert.equal(r.calls.length, 0, "aucun code cree au chargement de la page");
  let prevented = false;
  r.a.listeners.click[0]({ preventDefault: () => { prevented = true; } });
  await new Promise((res) => setTimeout(res, 10));
  assert.ok(prevented);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].url, "https://projet.supabase.co/functions/v1/telegram-bot", "meme appel que account-page.js#rejoindreVip");
  assert.deepEqual(JSON.parse(r.calls[0].init.body), { action: "vip-link" });
  assert.equal(r.calls[0].init.headers.Authorization, "Bearer jeton-de-test");
  assert.equal(r.win.location.href, "https://t.me/IasharkRobot?start=abc123", "pas encore relie : le robot relie le compte");
  // Deja relie : lien direct vers le robot.
  const lie = await runPill("/en/", pro, { ok: true, robot_url: "https://t.me/IasharkRobot" });
  assert.match(lie.a.textContent, /My Pro messages/);
  lie.a.listeners.click[0]({ preventDefault() {} });
  await new Promise((res) => setTimeout(res, 10));
  assert.equal(lie.win.location.href, "https://t.me/IasharkRobot");
  // Reponse inattendue (jamais une adresse libre suivie) : page Compte.
  const bad = await runPill("/fr/", pro, { ok: true, robot_url: "https://evil.example/x" });
  bad.a.listeners.click[0]({ preventDefault() {} });
  await new Promise((res) => setTimeout(res, 10));
  assert.equal(bad.win.location.href, "/fr/compte.html");
  // Le serveur dit « pas Pro » : canal gratuit.
  const np = await runPill("/fr/", pro, { ok: false, code: "not_pro" });
  np.a.listeners.click[0]({ preventDefault() {} });
  await new Promise((res) => setTimeout(res, 10));
  assert.equal(np.win.location.href, "https://t.me/iasharkdata");
  // Messages Pro fermes (assets/ouverture.js) : pastille gratuite, meme pour un Pro.
  const dom = fakeDom("/fr/");
  const win = { document: dom.document, location: dom.location, IASHARK_OUVERTURE: { canalPro: false }, IasharkCompteLeger: { url: "u", key: "k", context: () => Promise.resolve(pro), jeton: () => Promise.resolve("j") }, fetch: () => Promise.reject(new Error("x")) };
  new Function("window", read("assets/telegram-pill.js"))(win);
  await new Promise((res) => setTimeout(res, 10));
  assert.equal(dom.document.getElementById("ias-tg").href, "https://t.me/iasharkdata");
  // Le serveur reste celui du robot : aucune modification de telegram-bot (meme action vip-link).
  assert.match(read("supabase/functions/telegram-bot/index.ts"), /if \(body\.action === "vip-link"\) return await liensPersonnels\(req\);/);
});

test("compte leger : visiteur sans aucune requete ; Pro lu avec le jeton de la personne (lecture seule)", async () => {
  const src = read("assets/compte-leger.js");
  assert.doesNotMatch(src, /method:\s*'(POST|PATCH|DELETE|PUT)'/, "lecture seule");
  assert.match(src, /supabase-js@2\.116\.0\//, "supabase-js epingle");
  const mk = (stored, rows) => {
    const calls = [];
    const win = {
      document: { readyState: "complete" },
      localStorage: { getItem: (k) => (k === "sb-ksvjraqitxouwiabecai-auth-token" ? stored : null) },
      fetch: (url, init) => { calls.push(url); return Promise.resolve({ ok: true, json: () => Promise.resolve(rows) }); }
    };
    new Function("window", src)(win);
    return { C: win.IasharkCompteLeger, calls };
  };
  const v = mk(null, []);
  assert.deepEqual(await v.C.context(), { session: null, user: null, profile: null, isPro: false, isAdmin: false });
  assert.equal(v.calls.length, 0);
  const sess = JSON.stringify({ access_token: "t", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "u9" } });
  const p = mk(sess, [{ plan: "pro", role: "customer" }]);
  const c = await p.C.context();
  assert.equal(c.isPro, true);
  assert.match(p.calls[0], /\/rest\/v1\/users\?select=plan,role&id=eq\.u9$/);
  const a = mk(sess, [{ plan: "free", role: "admin" }]);
  assert.equal((await a.C.context()).isPro, true, "admin = Pro (comme app-client.js)");
  const f = mk(sess, [{ plan: "free", role: "customer" }]);
  assert.equal((await f.C.context()).isPro, false);
  const jamais = mk(sess, []);
  assert.equal(await jamais.C.jamaisAbonne({ id: "u9" }), true);
  const deja = mk(sess, [{ user_id: "u9" }]);
  assert.equal(await deja.C.jamaisAbonne({ id: "u9" }), false);
});
