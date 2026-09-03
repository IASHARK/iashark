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
const excluded=new Set([
  'admin.html','maintenance.html',
  'connexion.html','inscription.html','mot-de-passe-oublie.html','reinitialiser-mot-de-passe.html'
]);

function htmlFiles(dir=root,prefix=''){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{
    const rel=path.join(prefix,entry.name);
    if(entry.isDirectory()&&!['node_modules','.git','.agents','.codex','docs','iashark-v2-concept','prototypes'].includes(entry.name))return htmlFiles(path.join(dir,entry.name),rel);
    return entry.isFile()&&entry.name.endsWith('.html')?[rel]:[];
  });
}

test('toutes les pages publiques chargent la navigation inférieure partagée',()=>{
  const files=htmlFiles().filter((file)=>!excluded.has(file));
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
