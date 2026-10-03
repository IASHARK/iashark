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
test("le bandeau d’accueil expose exactement les 19 compétitions couvertes deux fois",()=>{
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  // Le bandeau est passe sur Tailwind (piste dupliquee pour une boucle sans
  // couture) : le balisage a change, l'INTENTION verifiee reste la meme.
  assert.equal((html.match(/league-badge-img/g)||[]).length,38);
  assert.equal((html.match(/leagues\/61\.png/g)||[]).length,2);
  // Liga MX (262) et Premier Soccer League (288) : lancement Mexique / Afrique du Sud.
  assert.equal((html.match(/leagues\/262\.png/g)||[]).length,2);
  assert.equal((html.match(/leagues\/288\.png/g)||[]).length,2);
  // Argentine (128), Colombie (239), Perou (281), Chili (265) : ouverture LATAM.
  [128,239,281,265].forEach(function(id){ assert.equal((html.match(new RegExp("leagues/"+id+"\\.png","g"))||[]).length,2); });
  // Les logos de ligue sont des PNG sombres : sans pastille claire derriere,
  // ils sont invisibles sur le fond noir de la page.
  assert.match(html,/league-badge-img[^"]*bg-\[#f4f7fa\]/);
  assert.doesNotMatch(html,/brightness\(0\) invert\(1\)/);
});
