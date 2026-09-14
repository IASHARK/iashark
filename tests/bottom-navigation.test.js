const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
// Pages volontairement sans navigation produit. admin.html et
// maintenance.html ne s'adressent pas au public. Les quatre pages
// d'authentification non plus : la barre du bas y proposerait "Compte" a
// quelqu'un qui n'a justement pas encore de session, et l'ecran de connexion
// doit rester sans distraction. Le retour au site s'y fait par le lien du
// bandeau haut, present sur chacune.
// L'exclusion porte sur le nom de fichier : les copies generees de ces pages
// dans chaque repertoire (/gb/connexion.html, /mx/admin.html n'existe pas...)
// suivent la meme regle que la page racine.
const excluded=new Set([
  'admin.html','maintenance.html',
  'connexion.html','inscription.html','mot-de-passe-oublie.html','reinitialiser-mot-de-passe.html'
]);

// content/ : fragments de corps d'article (content/local-articles/**, assembles
// dans /<dir>/articles|articulos/ par scripts/build-local-articles.js, qui y
// injecte la navigation). emails/ : gabarits d'e-mails transactionnels, jamais
// servis comme pages. dist/ : copie de build des pages deja controlees ici.
// tests/ : rapports Playwright generes (tests/e2e/output).
// legal/ : sources des pages legales par repertoire, jamais servies telles
// quelles (recopiees dans /<dir>/ par scripts/build-locales.js, qui y injecte
// la navigation ; /legal/* est redirige en 301 par _redirects).
function htmlFiles(dir=root,prefix=''){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{
    const rel=path.join(prefix,entry.name);
    if(entry.isDirectory()&&!['node_modules','.git','.agents','.codex','docs','iashark-v2-concept','prototypes','legal','content','emails','dist','tests'].includes(entry.name))return htmlFiles(path.join(dir,entry.name),rel);
    return entry.isFile()&&entry.name.endsWith('.html')?[rel]:[];
  });
}

test('toutes les pages publiques chargent la navigation inférieure partagée',()=>{
  const files=htmlFiles().filter((file)=>!excluded.has(path.basename(file)));
  assert.ok(files.length>70);
  for(const file of files){
    const html=fs.readFileSync(path.join(root,file),'utf8');
    assert.match(html,/\/assets\/bottom-navigation\.css/,file);
    assert.match(html,/\/bottom-navigation\.js/,file);
  }
});

test('la navigation partagée contient exactement les quatre destinations validées',()=>{
  const js=fs.readFileSync(path.join(root,'bottom-navigation.js'),'utf8');
  for(const label of ['Accueil','Outils','Blog','Compte'])assert.match(js,new RegExp("label:'"+label+"'"));
  assert.doesNotMatch(js,/label:'Marchés'/);
  assert.match(js,/aria-current/);
});

// Audit QA 14/09/2026 : sur /en/blog/guides/*, /abonnement et /404 la barre
// s'affichait en francais quand i18n.js arrivait apres ce script. Les libelles
// portent data-i18n, le script attend I18N, et le repli par langue est une
// copie exacte du dictionnaire.
test('la navigation partagée ne dépend pas de l\'ordre de chargement d\'i18n.js',()=>{
  const js=fs.readFileSync(path.join(root,'bottom-navigation.js'),'utf8');
  assert.match(js,/data-i18n="'\+item\.key\+'"/);
  assert.match(js,/data-i18n-attr','aria-label:geo\.nav\.aria_label'/);
  assert.match(js,/function waitI18n\(\)/);
  const m=js.match(/var FALLBACK=(\{[\s\S]*?\n  \});/);
  assert.ok(m,'table FALLBACK introuvable');
  const FALLBACK=Function('return '+m[1])();
  for(const locale of ['en','es','es-mx','de','it','pt']){
    const dict=JSON.parse(fs.readFileSync(path.join(root,'i18n/dict',locale+'.json'),'utf8'));
    const fb=FALLBACK[locale];
    assert.ok(fb,locale+' : repli absent');
    for(const k of ['home','tools','guides','account'])assert.equal(fb[k],dict.nav[k],locale+' nav.'+k);
    assert.equal(fb.aria,dict.geo.nav.aria_label,locale+' geo.nav.aria_label');
  }
});

test('les barres statiques de repli portent les clés nav.* (traduites par le build)',()=>{
  for(const file of ['abonnement.html','a-propos.html','compte.html','blog.html']){
    const html=fs.readFileSync(path.join(root,file),'utf8');
    for(const key of ['nav.home','nav.tools','nav.guides','nav.account'])assert.match(html,new RegExp('data-i18n="'+key.replace('.','\\.')+'"'),file+' '+key);
    assert.doesNotMatch(html,/<b>(Accueil|Outils|Compte)<\/b>|nav-lbl">(ACCUEIL|OUTILS|COMPTE)</,file+' : libellé FR sans data-i18n');
  }
});
