"use strict";
// Hub editorial /blog.html.
// Ces tests verrouillent surtout deux choses : que rien n'est invente, et que
// ce qui est affiche correspond au contenu reel des articles.
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const lecture = require("../scripts/blog-reading-time.js");

const RACINE = path.resolve(__dirname, "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8");
const blog = lire("blog.html");
const sitemap = lire("sitemap-fr.xml");
const workflow = lire(".github/workflows/update-data.yml");

const ARTICLES = fs.readdirSync(path.join(RACINE, "blog", "guides"))
  .filter((f) => f.endsWith(".html") && f !== "index.html");

test("les sept articles publies sont dans le HTML servi, pas construits en JavaScript", () => {
  assert.ok(ARTICLES.length >= 7, "moins d'articles que prevu sur le disque");
  for (const f of ARTICLES) {
    assert.ok(blog.includes("/blog/guides/" + f), `${f} n'est pas lie depuis le blog`);
  }
});

// Les durees affichees etaient saisies a la main et avaient derive tres loin
// du contenu : "Coupe du monde 2026" annoncait 11 minutes pour 945 mots.
// Ce test empeche la derive de recommencer.
test("chaque temps de lecture affiche correspond au contenu reel de l'article", () => {
  const reels = lecture.tousLesArticles();
  // Le JSON-LD de l'en-tete cite les memes URL, avec la duree au format ISO
  // (PT5M). On ne regarde donc que le corps de la page, la ou la duree est
  // reellement lue par un humain.
  const corps = blog.slice(blog.indexOf("<body"));
  for (const [fichier, minutes] of Object.entries(reels)) {
    const i = corps.indexOf("/blog/guides/" + fichier);
    assert.ok(i > -1, `${fichier} absent du corps de la page`);
    // La duree est affichee dans le bloc qui suit le lien de l'article.
    const bloc = corps.slice(i, i + 1400);
    const trouve = bloc.match(/(\d+) min de lecture/);
    assert.ok(trouve, `aucune duree affichee pour ${fichier}`);
    assert.equal(Number(trouve[1]), minutes,
      `${fichier} affiche ${trouve[1]} min alors que son contenu en fait ${minutes}`);
  }
});

test("les articles qui affichent leur duree annoncent la meme que le blog", () => {
  const reels = lecture.tousLesArticles();
  for (const f of ARTICLES) {
    const html = lire(path.join("blog", "guides", f));
    const trouve = html.match(/(\d+) min de lecture/);
    if (!trouve) continue; // tous les articles n'affichent pas leur duree
    assert.equal(Number(trouve[1]), reels[f],
      `${f} annonce ${trouve[1]} min dans l'article, son contenu en fait ${reels[f]}`);
  }
});

// Deux guides publies etaient absents du sitemap depuis leur mise en ligne,
// et le hub /blog.html n'y a jamais figure.
test("tous les articles publies et le hub sont dans le sitemap", () => {
  for (const f of ARTICLES) {
    assert.ok(sitemap.includes("/blog/guides/" + f), `${f} manque au sitemap servi`);
    assert.ok(workflow.includes("/blog/guides/" + f), `${f} manque a la liste du pipeline`);
  }
  assert.ok(sitemap.includes("https://iashark.com/blog.html"), "le hub manque au sitemap servi");
  assert.ok(workflow.includes("https://iashark.com/blog.html"), "le hub manque a la liste du pipeline");
});

test("le blog reste indexable", () => {
  assert.match(blog, /<meta name="robots" content="index, follow/);
  assert.match(blog, /<link rel="canonical" href="https:\/\/iashark\.com\/blog\.html">/);
  for (const balise of ["og:title", "og:description", "og:image", "og:type", "og:url", "twitter:card"]) {
    assert.ok(blog.includes('"' + balise + '"'), `${balise} manquant`);
  }
});

test("les donnees structurees sont valides et ne decrivent que des articles reels", () => {
  const blocs = [...blog.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]));
  const blogLd = blocs.find((b) => b["@type"] === "Blog");
  assert.ok(blogLd, "aucun bloc Blog");
  assert.equal(blogLd.blogPost.length, ARTICLES.length, "le nombre d'articles declares ne correspond pas");
  const reels = lecture.tousLesArticles();
  for (const p of blogLd.blogPost) {
    const fichier = p.url.split("/").pop();
    assert.ok(ARTICLES.includes(fichier), `${p.url} n'existe pas sur le disque`);
    assert.match(p.datePublished, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(p.timeRequired, "PT" + reels[fichier] + "M", `duree declaree fausse pour ${fichier}`);
    // Auteur institutionnel : jamais un faux expert avec nom et photo.
    assert.equal(p.author["@type"], "Organization");
    assert.equal(p.author.name, "IASHARK");
  }
  assert.ok(blocs.some((b) => b["@type"] === "BreadcrumbList"));
});

// Le blog n'est pas une page de vente : il envoie vers les analyses, pas vers
// l'offre payante.
test("le pont vers le produit mene aux analyses, pas au paiement", () => {
  assert.match(blog, /Voir les analyses du jour/);
  for (const interdit of ["Passer Pro", "Passer à Pro", "Débloquer Pro", "S'abonner", "19,95"]) {
    assert.ok(!blog.includes(interdit), `le blog pousse "${interdit}"`);
  }
  assert.ok(!blog.includes("/abonnement.html"), "le blog renvoie vers la page d'abonnement");
});

// Rien de fabrique : ni popularite, ni vues, ni newsletter sans infrastructure.
test("aucune donnee inventee sur la page", () => {
  // On cible ce qui ne pourrait exister QU'EN etant fabrique : un compteur,
  // un classement de popularite, un champ email sans service derriere.
  for (const motif of [/\d[\d\s,.]* (vues|lectures|partages|commentaires)/i,
                       /les plus lus/i, /articles populaires/i, /\bnewsletter\b/i,
                       /type="email"/i, /note moyenne/i, /\d+[,.]\d+ ?\/ ?5/]) {
    assert.ok(!motif.test(blog), `la page affiche ${motif} sans donnee reelle derriere`);
  }
});

test("les sujets proposes sont exactement ceux des articles", () => {
  const filtres = [...blog.matchAll(/class="sujet[^"]*"[^>]*data-sujet="([a-z]+)"/g)].map((m) => m[1]);
  const utilises = [...blog.matchAll(/data-sujet="([a-z]+)"(?![^>]*class="sujet)/g)].map((m) => m[1])
    .filter((s) => s !== "all");
  assert.ok(filtres.includes("all"), "le filtre Tous manque");
  for (const s of new Set(utilises)) {
    assert.ok(filtres.includes(s), `le sujet "${s}" est porte par un article mais absent des filtres`);
  }
  for (const s of filtres.filter((x) => x !== "all")) {
    assert.ok(utilises.includes(s), `le filtre "${s}" ne correspond a aucun article : categorie vide`);
  }
});

test("la hierarchie des titres est correcte", () => {
  assert.equal((blog.match(/<h1[\s>]/g) || []).length, 1, "il faut exactement un H1");
  assert.ok((blog.match(/<h2[\s>]/g) || []).length >= 4, "les sections doivent etre des H2");
  // Les titres d'articles sont des H3, sous le H2 de leur section.
  assert.ok((blog.match(/<h3[\s>]/g) || []).length >= 6);
});

test("les images ne provoquent pas de saut de mise en page", () => {
  const images = [...blog.matchAll(/<img [^>]*>/g)].map((m) => m[0]);
  assert.ok(images.length >= 7);
  for (const img of images) {
    assert.match(img, /width="\d+"/, "image sans largeur : " + img.slice(0, 80));
    assert.match(img, /height="\d+"/, "image sans hauteur : " + img.slice(0, 80));
    assert.match(img, /alt="[^"]+"/, "image sans texte alternatif : " + img.slice(0, 80));
  }
  // L'image a la une est au-dessus de la ligne de flottaison : priorite haute
  // et pas de chargement differe. Toutes les autres sont differees.
  const [premiere, ...suivantes] = images;
  assert.match(premiere, /fetchpriority="high"/);
  assert.ok(!premiere.includes('loading="lazy"'));
  for (const img of suivantes) assert.match(img, /loading="lazy"/);
});

test("la page ne charge aucune bibliotheque pour afficher une liste d'articles", () => {
  const scriptsExternes = [...blog.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
  for (const src of scriptsExternes) {
    assert.ok(src.startsWith("/"), `script distant charge sur le blog : ${src}`);
  }
  assert.ok(!/framer|gsap|chart\.js|three\.js|jquery/i.test(blog));
});
