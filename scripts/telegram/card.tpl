<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<!-- Image du match gratuit pour le canal Telegram (1080x1350).
     Remplie par build-posts.mjs ; valeurs deja echappees. Charte : fond
     #060b12, cyan #20d5ef, gris. -->
<link href="https://fonts.googleapis.com/css2?family=Anton&family=DM+Sans:wght@400;500;600;700&family=Inter:wght@800&display=block" rel="stylesheet">
<style>
*{box-sizing:border-box}body{margin:0}
.c{width:1080px;height:1350px;background:radial-gradient(ellipse at 72% 0%,rgba(32,213,239,.17),transparent 55%),#060b12;padding:78px 80px 64px;display:flex;flex-direction:column;font-family:'DM Sans',sans-serif;color:#f4f7fb}
.logo{font-family:Anton,sans-serif;font-size:64px;letter-spacing:1px}.logo span{color:#20d5ef}
.lbl{margin-top:48px;color:#91a0b3;font-size:32px;font-weight:600;letter-spacing:1px}
.t{font-family:Inter,sans-serif;font-weight:800;font-size:84px;line-height:1.05;margin-top:14px}
.t.long{font-size:64px}
.w{color:#91a0b3;font-size:36px;margin-top:18px}
.box{margin-top:44px;background:#0a1420;border:2px solid rgba(141,179,211,.14);border-radius:28px;padding:44px 44px 40px}
.h{font-size:38px;font-weight:700}
.row{margin-top:40px}.l{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px}
.k{font-size:34px;font-weight:500;color:#c9d3de}.k em{font-style:normal;color:#91a0b3}
.v1{font-size:80px;font-weight:700;color:#20d5ef;line-height:.9}.v2{font-size:56px;font-weight:700;color:#c9d3de;line-height:.9}
.tr{height:22px;border-radius:12px;background:#1a2634;overflow:hidden}.f{height:100%;border-radius:12px}
.p{margin-top:34px;padding-top:30px;border-top:2px solid rgba(141,179,211,.14);font-size:31px;line-height:1.45;color:#c9d3de}.p span{color:#91a0b3}
.ft{margin-top:auto;padding-top:28px;display:flex;justify-content:space-between;align-items:center;font-size:30px;color:#91a0b3}.ft b{color:#20d5ef;font-size:36px}
</style></head><body><div class="c">
<div class="logo">IA<span>SHARK</span></div>
<div class="lbl">MATCH GRATUIT DU JOUR</div>
<div class="t{{LONG}}">{{EQUIPES}}</div><div class="w">{{QUAND}}</div>
<div class="box">
 <div class="h">Pari : {{PARI}}</div>
 <div class="row"><div class="l"><span class="k">Chance calculée par IASHARK</span><span class="v1">{{ESTIMATION}} %</span></div><div class="tr"><div class="f" style="width:{{ESTIMATION}}%;background:linear-gradient(90deg,#06b6d4,#20d5ef)"></div></div></div>
 <div class="row"><div class="l"><span class="k">{{COTE_LIBELLE}}</span><span class="v2">{{COTE}}</span></div></div>
 <div class="p">{{PHRASE}}</div>
</div>
<div class="ft"><span>L'analyse complète, gratuite avec un compte</span><b>iashark.com</b></div>
</div></body></html>
