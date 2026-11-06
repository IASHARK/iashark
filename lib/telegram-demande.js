/* IASHARK — fenetre « Tes pronos sur Telegram » (06/11/2026, demande de Clement :
   « demander le Telegram aux gens, relie a l'adresse mail pour savoir s'il est Pro ou gratuit »).

   Composant 21st.dev « Newsletter Dialog » (ravikatiyar162, id 8420) recopie en HTML/CSS :
   meme structure (bandeau image h-48, titre text-2xl bold, description, formulaire avec icone
   dans le champ, bouton pleine largeur, croix en haut a droite), memes animations (fond qui
   apparait, fenetre 0.95 -> 1 en 300 ms, textes qui montent de 10 px l'un apres l'autre).
   Couleurs et polices IASHARK.

   Pour qui : tout compte connecte (gratuit ou Pro) qui n'a pas encore laisse son Telegram.
   Charge par auth-header.js (une seule copie pour tout le site). Jamais sur les pages de
   compte, d'inscription, de connexion, de paiement ni d'administration.
   Frequence : une fois laisse, plus jamais ; fermee, elle revient 3 jours plus tard.
   Enregistrement : table telegram_contacts (une ligne par compte, migration 0067).
   Apres l'envoi : bouton pour rejoindre la chaine Telegram gratuite (gratuit et Pro).
   L'envoi des messages se fera plus tard, d'une autre facon, valide par Clement. Aucun emoji, aucune promesse de gain. */
(function () {
  "use strict";
  if (window.__iasharkTgDemande) return;
  window.__iasharkTgDemande = true;

  var CLE = "iashark_tg_demande";
  var RETOUR_MS = 3 * 86400000;
  var DELAI_MS = 6000;
  var CHAINE = "https://t.me/+qCEr2JFPDDBlZTFk";
  var IMAGE = "/assets/hero/stade-nuit.webp";
  var PAGES_EXCLUES = /(compte|inscription|connexion|login|signup|abonnement|checkout|paiement|merci|success|cancel|admin|reset|mot-de-passe|password|desinscription)/i;

  var TEXTES = {
    fr: { titre: "Tes pronos sur Telegram", gratuit: "Laisse ton Telegram : chaque jour, le match offert et les résultats arrivent directement chez toi.",
      pro: "Laisse ton Telegram : tes tickets, ton buteur et ta montante arriveront directement chez toi.", champ: "@ton_pseudo ou ton numéro",
      bouton: "Recevoir sur Telegram", envoi: "Envoi…", erreur: "Écris ton @pseudo Telegram ou ton numéro.", panne: "Ça n'est pas passé, réessaie.",
      ok: "C'est noté", okGratuit: "En attendant, la chaîne gratuite est ouverte.",
      chaine: "Rejoindre la chaîne Telegram", fermer: "Fermer", libelle: "Ton Telegram" },
    en: { titre: "Your picks on Telegram", gratuit: "Leave your Telegram: every day, the free match and the results land straight in your chat.",
      pro: "Leave your Telegram: your tickets, your scorer and your step-up bet will land straight in your chat.", champ: "@your_username or your number",
      bouton: "Get it on Telegram", envoi: "Sending…", erreur: "Type your Telegram @username or your number.", panne: "That didn't go through, try again.",
      ok: "Got it", okGratuit: "Meanwhile, the free channel is open.",
      chaine: "Join the Telegram channel", fermer: "Close", libelle: "Your Telegram" },
    es: { titre: "Tus pronósticos en Telegram", gratuit: "Deja tu Telegram: cada día, el partido gratis y los resultados te llegan directamente.",
      pro: "Deja tu Telegram: tus tickets, tu goleador y tu escalera te llegarán directamente.", champ: "@tu_usuario o tu número",
      bouton: "Recibir en Telegram", envoi: "Enviando…", erreur: "Escribe tu @usuario de Telegram o tu número.", panne: "No se ha enviado, inténtalo de nuevo.",
      ok: "Hecho", okGratuit: "Mientras tanto, el canal gratis está abierto.",
      chaine: "Unirme al canal de Telegram", fermer: "Cerrar", libelle: "Tu Telegram" },
    de: { titre: "Deine Tipps auf Telegram", gratuit: "Gib dein Telegram an: jeden Tag kommen das Gratis-Spiel und die Ergebnisse direkt zu dir.",
      pro: "Gib dein Telegram an: deine Tickets, dein Torschütze und deine Leiter kommen direkt zu dir.", champ: "@dein_name oder deine Nummer",
      bouton: "Auf Telegram erhalten", envoi: "Wird gesendet…", erreur: "Gib deinen Telegram-@Namen oder deine Nummer ein.", panne: "Hat nicht geklappt, versuch es nochmal.",
      ok: "Erledigt", okGratuit: "Bis dahin ist der Gratis-Kanal offen.",
      chaine: "Dem Telegram-Kanal beitreten", fermer: "Schließen", libelle: "Dein Telegram" },
    it: { titre: "I tuoi pronostici su Telegram", gratuit: "Lascia il tuo Telegram: ogni giorno la partita gratis e i risultati ti arrivano direttamente.",
      pro: "Lascia il tuo Telegram: i tuoi ticket, il tuo marcatore e la tua scalata ti arriveranno direttamente.", champ: "@tuo_nome o il tuo numero",
      bouton: "Ricevi su Telegram", envoi: "Invio…", erreur: "Scrivi il tuo @nome Telegram o il tuo numero.", panne: "Non è andato, riprova.",
      ok: "Fatto", okGratuit: "Intanto il canale gratuito è aperto.",
      chaine: "Entra nel canale Telegram", fermer: "Chiudi", libelle: "Il tuo Telegram" },
    pt: { titre: "Os teus palpites no Telegram", gratuit: "Deixa o teu Telegram: todos os dias, o jogo grátis e os resultados chegam diretamente a ti.",
      pro: "Deixa o teu Telegram: os teus bilhetes, o teu marcador e a tua escada vão chegar diretamente a ti.", champ: "@o_teu_nome ou o teu número",
      bouton: "Receber no Telegram", envoi: "A enviar…", erreur: "Escreve o teu @nome do Telegram ou o teu número.", panne: "Não passou, tenta outra vez.",
      ok: "Feito", okGratuit: "Entretanto, o canal grátis está aberto.",
      chaine: "Entrar no canal do Telegram", fermer: "Fechar", libelle: "O teu Telegram" }
  };

  function lire() { try { return JSON.parse(localStorage.getItem(CLE) || "null"); } catch (e) { return null; } }
  function ecrire(v) { try { localStorage.setItem(CLE, JSON.stringify(v)); } catch (e) {} }
  function langue(locale) { var l = String(locale || "fr").slice(0, 2); return TEXTES[l] ? l : "fr"; }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  // « @pseudo », « pseudo », « t.me/pseudo », « https://t.me/pseudo » ou un numero de telephone.
  function normaliser(brut) {
    var s = String(brut || "").trim().replace(/^https?:\/\//i, "").replace(/^(www\.)?t(elegram)?\.me\//i, "").replace(/^@/, "").trim();
    if (/^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(s)) return "@" + s;
    var chiffres = s.replace(/[\s().-]/g, "");
    if (/^\+?[0-9]{8,15}$/.test(chiffres)) return chiffres;
    return null;
  }

  var ICONE_TG = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M21.94 4.3 18.9 19.1c-.23 1.02-.83 1.27-1.69.79l-4.66-3.43-2.25 2.16c-.25.25-.46.46-.94.46l.33-4.74 8.63-7.8c.38-.33-.08-.52-.58-.19L7.07 13.06 2.47 11.6c-1-.31-1.02-1 .21-1.48l18-6.94c.83-.31 1.56.19 1.26 1.12Z"/></svg>';
  var ICONE_X = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';

  // Classes du composant 21st.dev traduites une a une (shadcn) :
  //  fond « fixed inset-0 bg-black/80 » ; fenetre « max-w-md p-0 border bg-background shadow-lg sm:rounded-lg » ;
  //  image « h-48 object-cover » ; corps « p-6 md:p-8 » ; titre « text-2xl font-bold leading-none tracking-tight » ;
  //  description « text-sm text-muted-foreground mt-2 » ; formulaire « mt-6 space-y-4 » ; champ « h-9 rounded-lg border
  //  px-3 py-2 pl-9 text-sm shadow-sm shadow-black/5 » ; bouton « h-11 rounded-md px-8 text-sm font-semibold
  //  bg-primary hover:bg-primary/90 » ; croix « absolute right-4 top-4 rounded-sm opacity-70 h-4 w-4 ».
  //  Police : Inter (comme l'apercu 21st.dev), lissee (antialiased).
  function style() {
    if (document.getElementById("tgd-style")) return;
    if (!document.querySelector('link[href*="family=Inter"]')) {
      var f = document.createElement("link");
      f.rel = "stylesheet";
      f.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
      document.head.appendChild(f);
    }
    var css = [
      ".tgd-fond{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.8);animation:tgd-in .2s ease-out}",
      ".tgd-boite{position:fixed;left:50%;top:50%;z-index:9999;box-sizing:border-box;width:calc(100% - 32px);max-width:28rem;transform:translate(-50%,-50%);",
      "background:#0a1420;color:#f4f7fb;border:1px solid rgba(141,179,211,.14);border-radius:.5rem;overflow:hidden;",
      "box-shadow:0 10px 15px -3px rgba(0,0,0,.1),0 4px 6px -4px rgba(0,0,0,.1);",
      "font-family:Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;font-feature-settings:normal;",
      "-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;text-transform:none;letter-spacing:normal;",
      "max-height:calc(100dvh - 32px);overflow-y:auto;overscroll-behavior:contain}",
      ".tgd-boite *{box-sizing:border-box}",
      ".tgd-anim{animation:tgd-zoom .3s ease-in-out both}",
      ".tgd-image{position:relative;height:12rem;width:100%}",
      ".tgd-image img{display:block;height:100%;width:100%;object-fit:cover}",
      "@media (max-height:640px){.tgd-image{height:7rem}}",
      ".tgd-corps{padding:1.5rem}",
      "@media (min-width:768px){.tgd-corps{padding:2rem}}",
      ".tgd-titre{margin:0;font-family:inherit;font-size:1.5rem;line-height:1;font-weight:700;letter-spacing:-.025em;text-align:left;color:#f4f7fb}",
      ".tgd-desc{margin:.5rem 0 0;font-family:inherit;color:#91a0b3;font-size:.875rem;line-height:1.25rem;font-weight:400;text-align:left}",
      ".tgd-form{margin:1.5rem 0 0;display:flex;flex-direction:column;gap:1rem}",
      ".tgd-champ{position:relative}",
      ".tgd-champ svg{position:absolute;left:.75rem;top:50%;width:1rem;height:1rem;transform:translateY(-50%);color:#91a0b3;pointer-events:none}",
      ".tgd-champ input{display:flex;width:100%;height:2.25rem;margin:0;padding:.5rem .75rem .5rem 2.25rem;border-radius:.5rem;",
      "border:1px solid rgba(141,179,211,.22);background:#060b12;color:#f4f7fb;font-size:16px;line-height:1.25rem;font-family:inherit;font-weight:400;",
      "box-shadow:0 1px 2px 0 rgba(0,0,0,.05);transition:box-shadow .15s;outline:none;-webkit-appearance:none;appearance:none}",
      "@media (min-width:640px){.tgd-champ input{font-size:.875rem}}",
      ".tgd-champ input::placeholder{color:rgba(145,160,179,.7)}",
      ".tgd-champ input:focus-visible{border-color:#20d5ef;box-shadow:0 0 0 3px rgba(32,213,239,.2)}",
      ".tgd-bouton{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;width:100%;height:2.75rem;margin:0;padding:0 2rem;white-space:nowrap;",
      "border:0;border-radius:calc(.5rem - 2px);background:#20d5ef;color:#060b12;font-size:.875rem;line-height:1.25rem;font-weight:600;font-family:inherit;",
      "letter-spacing:normal;text-transform:none;cursor:pointer;text-decoration:none;transition:background-color .15s;-webkit-tap-highlight-color:transparent}",
      ".tgd-bouton svg{width:1rem;height:1rem}",
      "@media (hover:hover){.tgd-bouton:hover{background:rgba(32,213,239,.9)}}",
      ".tgd-bouton:focus-visible{outline:none;box-shadow:0 0 0 2px #0a1420,0 0 0 4px #20d5ef}",
      ".tgd-bouton[disabled]{opacity:.5;pointer-events:none}",
      ".tgd-erreur{margin:0;color:#ff8a8a;font-size:.875rem;line-height:1.25rem;font-family:inherit}",
      ".tgd-erreur:empty{display:none}",
      ".tgd-fermer{position:absolute;right:1rem;top:1rem;z-index:2;display:flex;align-items:center;justify-content:center;padding:0;",
      "border:0;border-radius:.125rem;background:transparent;color:#f4f7fb;opacity:.7;cursor:pointer;transition:opacity .15s;filter:drop-shadow(0 1px 2px rgba(0,0,0,.6))}",
      ".tgd-fermer::before{content:'';position:absolute;inset:-12px}",
      ".tgd-fermer svg{width:1rem;height:1rem}",
      "@media (hover:hover){.tgd-fermer:hover{opacity:1}}",
      ".tgd-fermer:focus-visible{opacity:1;outline:none;box-shadow:0 0 0 2px #0a1420,0 0 0 4px #20d5ef}",
      ".tgd-monte{opacity:0;animation:tgd-monte .5s cubic-bezier(.2,.9,.3,1.2) both}",
      ".tgd-d1{animation-delay:.1s}.tgd-d2{animation-delay:.2s}.tgd-d4{animation-delay:.4s}",
      "@keyframes tgd-in{from{opacity:0}to{opacity:1}}",
      "@keyframes tgd-zoom{from{opacity:0;transform:translate(-50%,-50%) scale(.95)}to{opacity:1;transform:translate(-50%,-50%) scale(1)}}",
      "@keyframes tgd-monte{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}",
      "@media (prefers-reduced-motion:reduce){.tgd-fond,.tgd-anim,.tgd-monte{animation:none;opacity:1}}"
    ].join("");
    var s = document.createElement("style");
    s.id = "tgd-style";
    s.textContent = css;
    document.head.appendChild(s);
  }

  function suivre(type, meta) { try { if (typeof window.iasharkTrack === "function") window.iasharkTrack(type, meta || {}); } catch (e) {} }

  function ouvrir(ctx) {
    var T = TEXTES[langue(ctx.locale)];
    var estPro = !!ctx.pro;
    style();
    var fond = document.createElement("div");
    fond.className = "tgd-fond";
    var boite = document.createElement("div");
    boite.className = "tgd-boite tgd-anim";
    boite.setAttribute("role", "dialog");
    boite.setAttribute("aria-modal", "true");
    boite.setAttribute("aria-labelledby", "tgd-titre");
    boite.innerHTML =
      '<button type="button" class="tgd-fermer" aria-label="' + esc(T.fermer) + '">' + ICONE_X + "</button>" +
      '<div class="tgd-image"><img src="' + IMAGE + '" alt="" width="896" height="384" decoding="async"></div>' +
      '<div class="tgd-corps">' +
        '<h2 id="tgd-titre" class="tgd-titre tgd-monte tgd-d1">' + esc(T.titre) + "</h2>" +
        '<p class="tgd-desc tgd-monte tgd-d2">' + esc(estPro ? T.pro : T.gratuit) + "</p>" +
        '<form class="tgd-form tgd-monte tgd-d4" novalidate>' +
          '<div class="tgd-champ">' + ICONE_TG +
            '<input type="text" name="telegram" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="send" placeholder="' + esc(T.champ) + '" aria-label="' + esc(T.libelle) + '">' +
          "</div>" +
          '<p class="tgd-erreur" role="alert"></p>' +
          '<button type="submit" class="tgd-bouton">' + esc(T.bouton) + "</button>" +
        "</form>" +
      "</div>";
    document.body.appendChild(fond);
    document.body.appendChild(boite);
    var ancienOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    suivre("gate_view", { gate: "telegram_demande", plan: estPro ? "pro" : "free" });

    var envoye = false;
    function fermer() {
      if (!envoye) ecrire({ ferme: Date.now() });
      document.removeEventListener("keydown", touche);
      fond.remove();
      boite.remove();
      document.body.style.overflow = ancienOverflow;
    }
    function touche(e) { if (e.key === "Escape") fermer(); }
    document.addEventListener("keydown", touche);
    fond.addEventListener("click", fermer);
    boite.querySelector(".tgd-fermer").addEventListener("click", fermer);

    var form = boite.querySelector("form");
    var champ = form.querySelector("input");
    var erreur = form.querySelector(".tgd-erreur");
    var bouton = form.querySelector("button");
    if (!window.matchMedia || !window.matchMedia("(pointer:coarse)").matches) setTimeout(function () { champ.focus(); }, 350);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var pseudo = normaliser(champ.value);
      if (!pseudo) { erreur.textContent = T.erreur; champ.focus(); return; }
      erreur.textContent = "";
      bouton.disabled = true;
      bouton.textContent = T.envoi;
      ctx.sb.from("telegram_contacts").upsert({
        user_id: ctx.userId,
        pseudo: pseudo,
        langue: langue(ctx.locale),
        langue_navigateur: String(navigator.language || "").slice(0, 12) || null,
        page: location.pathname.slice(0, 200),
        plan_au_moment: estPro ? "pro" : "free",
        updated_at: new Date().toISOString()
      }, { onConflict: "user_id" }).then(function (r) {
        if (r && r.error) throw r.error;
        envoye = true;
        ecrire("fait");
        suivre("click", { cible: "telegram_demande_envoyee", plan: estPro ? "pro" : "free" });
        merci();
      }).catch(function () {
        bouton.disabled = false;
        bouton.textContent = T.bouton;
        erreur.textContent = T.panne;
      });
    });

    function merci() {
      var corps = boite.querySelector(".tgd-corps");
      corps.innerHTML =
        '<h2 id="tgd-titre" class="tgd-titre tgd-monte tgd-d1">' + esc(T.ok) + "</h2>" +
        '<p class="tgd-desc tgd-monte tgd-d2">' + esc(T.okGratuit) + "</p>" +
        '<div class="tgd-form tgd-monte tgd-d4"><a class="tgd-bouton" target="_blank" rel="noopener" href="' + CHAINE + '">' + ICONE_TG + esc(T.chaine) + "</a></div>";
      corps.querySelector("a").addEventListener("click", function () { setTimeout(fermer, 300); });
    }
  }

  function autreFenetreOuverte() {
    var d = document.querySelectorAll('[role="dialog"][aria-modal="true"], dialog[open]');
    for (var i = 0; i < d.length; i++) { if (d[i].offsetParent !== null || getComputedStyle(d[i]).position === "fixed") return true; }
    return false;
  }

  // ctx : { sb, userId, pro, locale }
  function lancer(ctx) {
    if (!ctx || !ctx.sb || !ctx.userId) return;
    if (PAGES_EXCLUES.test(location.pathname)) return;
    var etat = lire();
    if (etat === "fait") return;
    if (etat && etat.ferme && Date.now() - etat.ferme < RETOUR_MS) return;
    ctx.sb.from("telegram_contacts").select("user_id").eq("user_id", ctx.userId).maybeSingle().then(function (r) {
      if (r && r.error) return;
      if (r && r.data) { ecrire("fait"); return; }
      var essais = 0;
      (function attendre() {
        setTimeout(function () {
          if (document.hidden || autreFenetreOuverte()) { if (++essais < 5) attendre(); return; }
          ouvrir(ctx);
        }, essais ? 10000 : DELAI_MS);
      })();
    }, function () {});
  }

  window.IasharkTelegramDemande = { lancer: lancer, normaliser: normaliser };
})();
