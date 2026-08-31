const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const excluded=new Set(['admin.html','maintenance.html']);

function htmlFiles(dir=root,prefix=''){
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap((entry)=>{
    const rel=path.join(prefix,entry.name);
    if(entry.isDirectory()&&!['node_modules','.git'].includes(entry.name))return htmlFiles(path.join(dir,entry.name),rel);
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
