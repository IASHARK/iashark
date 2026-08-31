const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const excluded=new Set(['admin.html','maintenance.html']);

function walk(dir=root,prefix=''){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(['node_modules','.git'].includes(entry.name))continue;
    const absolute=path.join(dir,entry.name);
    const relative=path.join(prefix,entry.name);
    if(entry.isDirectory())walk(absolute,relative);
    else if(entry.name.endsWith('.html')&&!excluded.has(relative))inject(absolute);
  }
}

function inject(file){
  let html=fs.readFileSync(file,'utf8');
  if(!html.includes('/assets/bottom-navigation.css')){
    html=html.replace(/<\/head>/i,'<link rel="stylesheet" href="/assets/bottom-navigation.css"></head>');
  }
  if(!html.includes('/bottom-navigation.js')){
    html=html.replace(/<\/body>/i,'<script src="/bottom-navigation.js"></script></body>');
  }
  fs.writeFileSync(file,html);
}

walk();
