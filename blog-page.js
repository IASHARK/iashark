(async function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const posts=await fetch('/blog-posts.json').then(r=>r.json());
  const featured=posts.find(p=>p.featured)||posts[0];
  const categories=['Tous',...new Set(posts.map(p=>p.category))];
  const card=p=>`<a class="article-link" href="${esc(p.url)}"><article class="card article"><span class="eyebrow">${esc(p.category)}</span><h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p><footer>${p.minutes} min de lecture · ${new Date(p.date).toLocaleDateString('fr-FR')} · Lire →</footer></article></a>`;
  document.getElementById('featured').innerHTML=`<a class="article-link" href="${esc(featured.url)}"><span class="eyebrow">${esc(featured.category)}</span><h2>${esc(featured.title)}</h2><p class="muted">${esc(featured.excerpt)}</p><footer>${featured.minutes} min de lecture · Lire l’article →</footer></a>`;
  const filters=document.getElementById('filters'),articles=document.getElementById('articles');
  filters.innerHTML=categories.map((c,i)=>`<button class="${i?'':'active'}" data-category="${esc(c)}">${esc(c)}</button>`).join('');
  function render(category='Tous'){articles.innerHTML=posts.filter(p=>!p.featured&&(category==='Tous'||p.category===category)).map(card).join('')}
  filters.onclick=e=>{if(!e.target.dataset.category)return;filters.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===e.target));render(e.target.dataset.category)};
  document.getElementById('popular').innerHTML=posts.map((p,i)=>`<a class="article-link" href="${esc(p.url)}"><div class="rank"><b>0${i+1}</b><span>${esc(p.title)}</span><small>${p.minutes} min</small></div></a>`).join('');
  render();
})();
