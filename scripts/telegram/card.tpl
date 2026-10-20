<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<!-- Banniere du match gratuit pour le canal Telegram (1080x740).
     Remplie par build-posts.mjs ; valeurs deja echappees. Choix de Clement
     (20/10/2026) : seulement IASHARK, les deux logos des clubs, le match,
     la competition, la date et l'heure. Charte : fond #060b12, cyan #20d5ef, gris. -->
<link href="https://fonts.googleapis.com/css2?family=Anton&family=DM+Sans:wght@400;500;600;700&family=Inter:wght@800&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box}body{margin:0}
.c{width:1080px;height:740px;background:radial-gradient(ellipse at 72% 0%,rgba(32,213,239,.17),transparent 55%),#060b12;padding:64px 80px 0;display:flex;flex-direction:column;font-family:'DM Sans',sans-serif;color:#f4f7fb}
.logo{font-family:Anton,sans-serif;font-size:64px;letter-spacing:1px;line-height:1}.logo span{color:#20d5ef}
.logos{margin-top:44px;display:flex;align-items:center;justify-content:center;gap:56px}
.logos img{width:250px;height:250px;object-fit:contain;filter:drop-shadow(0 18px 28px rgba(0,0,0,.6))}
.logos .vs{font-family:Anton,sans-serif;font-size:72px;color:#20d5ef}
.lbl{margin-top:40px;color:#91a0b3;font-size:32px;font-weight:600;letter-spacing:1px}
.t{font-family:Inter,sans-serif;font-weight:800;font-size:76px;line-height:1.05;margin-top:12px;white-space:nowrap}
.t.long{font-size:58px}
.w{color:#91a0b3;font-size:36px;margin-top:16px}
</style></head><body><div class="c">
<div class="logo">IA<span>SHARK</span></div>
<div class="logos" style="{{LOGOS}}"><img src="{{LOGO_DOM}}" alt=""><span class="vs">VS</span><img src="{{LOGO_EXT}}" alt=""></div>
<div class="lbl">MATCH GRATUIT DU JOUR</div>
<div class="t{{LONG}}">{{EQUIPES}}</div><div class="w">{{QUAND}}</div>
</div></body></html>
