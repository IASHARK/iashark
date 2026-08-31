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
test("le bandeau d’accueil expose exactement les 13 compétitions couvertes deux fois",()=>{
  const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
  assert.equal((html.match(/class="league-badge"/g)||[]).length,26);
  assert.equal((html.match(/class="ligue1-logo"/g)||[]).length,2);
});
