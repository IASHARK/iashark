"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,"..");
test("les pages principales partagent la navigation produit à quatre entrées",()=>{
  for(const file of ["index.html","match.html","pro.html","blog.html","compte.html"]){
    const html=fs.readFileSync(path.join(root,file),"utf8");
    const nav=(html.match(/<nav class="(?:nav-bottom|bottom-nav)"[\s\S]*?<\/nav>/)||[])[0]||"";
    assert.match(nav,/Accueil/i,file);
    assert.match(nav,/Outils/i,file);
    assert.match(nav,/Blog/i,file);
    assert.match(nav,/Compte/i,file);
    assert.doesNotMatch(nav,/Marchés/i,file);
  }
});
test("le bandeau d’accueil : 19 logos de compétitions couvertes, deux fois, aucune compétition retirée",()=>{
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  // Le bandeau est passe sur Tailwind (piste dupliquee pour une boucle sans
  // couture) : le balisage a change, l'INTENTION verifiee reste la meme.
  assert.equal((html.match(/league-badge-img/g)||[]).length,38);
  assert.equal((html.match(/leagues\/61\.png/g)||[]).length,2);
  // Liga MX (262) : lancement Mexique. Argentine (128), Chili (265) : ouverture LATAM.
  [262,128,265].forEach(function(id){ assert.equal((html.match(new RegExp("leagues/"+id+"\\.png","g"))||[]).length,2); });
  // Correction C6 du 27/10/2026 : sous « COMPÉTITIONS COUVERTES », jamais une competition retiree
  // (config/leagues.json#competitions_retirees, 03/10/2026 : Afrique du Sud 288, Colombie 239, Perou 281).
  // Chaque logo est celui d'une competition de config/leagues.json.
  const ids=new Set(JSON.parse(fs.readFileSync(path.join(root,"config","leagues.json"),"utf8")).leagues.map(function(l){ return l.apiFootballId; }));
  (html.match(/football\/leagues\/(\d+)\.png" alt="" width="48"/g)||[]).forEach(function(m){ assert.ok(ids.has(Number(/(\d+)\.png/.exec(m)[1])),m); });
  [288,239,281].forEach(function(id){ assert.doesNotMatch(html,new RegExp("leagues/"+id+"\\.png")); });
  // Les logos de ligue sont des PNG sombres : sans pastille claire derriere,
  // ils sont invisibles sur le fond noir de la page.
  assert.match(html,/league-badge-img[^"]*bg-\[#f4f7fa\]/);
  assert.doesNotMatch(html,/brightness\(0\) invert\(1\)/);
});
