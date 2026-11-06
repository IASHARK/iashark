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
   Apres l'envoi : un compte Pro relie son robot prive (telegram-bot, action vip-link) ;
   un compte gratuit rejoint la chaine gratuite. Aucun emoji, aucune promesse de gain. */
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
      pro: "Laisse ton Telegram : tes tickets, ton buteur et ta montante arrivent en privé.", champ: "@ton_pseudo ou ton numéro",
      bouton: "Recevoir sur Telegram", envoi: "Envoi…", erreur: "Écris ton @pseudo Telegram ou ton numéro.", panne: "Ça n'est pas passé, réessaie.",
      ok: "C'est noté", okGratuit: "En attendant, la chaîne gratuite est ouverte.", okPro: "Dernière étape : appuie sur Démarrer dans Telegram.",
      chaine: "Rejoindre la chaîne Telegram", robot: "Relier mon robot Pro", fermer: "Fermer", libelle: "Ton Telegram" },
    en: { titre: "Your picks on Telegram", gratuit: "Leave your Telegram: every day, the free match and the results land straight in your chat.",
      pro: "Leave your Telegram: your tickets, your scorer and your step-up bet arrive in private.", champ: "@your_username or your number",
      bouton: "Get it on Telegram", envoi: "Sending…", erreur: "Type your Telegram @username or your number.", panne: "That didn't go through, try again.",
      ok: "Got it", okGratuit: "Meanwhile, the free channel is open.", okPro: "Last step: tap Start in Telegram.",
      chaine: "Join the Telegram channel", robot: "Link my Pro bot", fermer: "Close", libelle: "Your Telegram" },
    es: { titre: "Tus pronósticos en Telegram", gratuit: "Deja tu Telegram: cada día, el partido gratis y los resultados te llegan directamente.",
      pro: "Deja tu Telegram: tus tickets, tu goleador y tu escalera te llegan en privado.", champ: "@tu_usuario o tu número",
      bouton: "Recibir en Telegram", envoi: "Enviando…", erreur: "Escribe tu @usuario de Telegram o tu número.", panne: "No se ha enviado, inténtalo de nuevo.",
      ok: "Hecho", okGratuit: "Mientras tanto, el canal gratis está abierto.", okPro: "Último paso: pulsa Iniciar en Telegram.",
      chaine: "Unirme al canal de Telegram", robot: "Vincular mi robot Pro", fermer: "Cerrar", libelle: "Tu Telegram" },
    de: { titre: "Deine Tipps auf Telegram", gratuit: "Gib dein Telegram an: jeden Tag kommen das Gratis-Spiel und die Ergebnisse direkt zu dir.",
      pro: "Gib dein Telegram an: deine Tickets, dein Torschütze und deine Leiter kommen privat.", champ: "@dein_name oder deine Nummer",
      bouton: "Auf Telegram erhalten", envoi: "Wird gesendet…", erreur: "Gib deinen Telegram-@Namen oder deine Nummer ein.", panne: "Hat nicht geklappt, versuch es nochmal.",
      ok: "Erledigt", okGratuit: "Bis dahin ist der Gratis-Kanal offen.", okPro: "Letzter Schritt: tippe in Telegram auf Starten.",
      chaine: "Dem Telegram-Kanal beitreten", robot: "Meinen Pro-Bot verbinden", fermer: "Schließen", libelle: "Dein Telegram" },
    it: { titre: "I tuoi pronostici su Telegram", gratuit: "Lascia il tuo Telegram: ogni giorno la partita gratis e i risultati ti arrivano direttamente.",
      pro: "Lascia il tuo Telegram: i tuoi ticket, il tuo marcatore e la tua scalata arrivano in privato.", champ: "@tuo_nome o il tuo numero",
      bouton: "Ricevi su Telegram", envoi: "Invio…", erreur: "Scrivi il tuo @nome Telegram o il tuo numero.", panne: "Non è andato, riprova.",
      ok: "Fatto", okGratuit: "Intanto il canale gratuito è aperto.", okPro: "Ultimo passo: tocca Avvia in Telegram.",
      chaine: "Entra nel canale Telegram", robot: "Collega il mio robot Pro", fermer: "Chiudi", libelle: "Il tuo Telegram" },
    pt: { titre: "Os teus palpites no Telegram", gratuit: "Deixa o teu Telegram: todos os dias, o jogo grátis e os resultados chegam diretamente a ti.",
      pro: "Deixa o teu Telegram: os teus bilhetes, o teu marcador e a tua escada chegam em privado.", champ: "@o_teu_nome ou o teu número",
      bouton: "Receber no Telegram", envoi: "A enviar…", erreur: "Escreve o teu @nome do Telegram ou o teu número.", panne: "Não passou, tenta outra vez.",
      ok: "Feito", okGratuit: "Entretanto, o canal grátis está aberto.", okPro: "Último passo: carrega em Iniciar no Telegram.",
      chaine: "Entrar no canal do Telegram", robot: "Ligar o meu robot Pro", fermer: "Fechar", libelle: "O teu Telegram" }
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

  function style() {
    if (document.getElementById("tgd-style")) return;
    var css = [
      ".tgd-fond{position:fixed;inset:0;z-index:9998;background:rgba(0,0,0,.8);animation:tgd-in .2s ease-out}",
      ".tgd-boite{position:fixed;left:50%;top:50%;z-index:9999;width:calc(100% - 32px);max-width:28rem;transform:translate(-50%,-50%);",
      "background:#0a1420;color:#f4f7fb;border:1px solid rgba(141,179,211,.14);border-radius:16px;overflow:hidden;",
      "box-shadow:0 24px 60px rgba(0,0,0,.55);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}",
      ".tgd-anim{animation:tgd-zoom .3s ease-in-out both}",
      ".tgd-image{position:relative;height:12rem;width:100%;background:#0d1926}",
      ".tgd-image img{display:block;height:100%;width:100%;object-fit:cover}",
      ".tgd-corps{padding:1.5rem}",
      "@media (min-width:768px){.tgd-corps{padding:2rem}}",
      ".tgd-titre{margin:0;font-size:1.5rem;line-height:2rem;font-weight:700;letter-spacing:-.025em;text-align:left}",
      ".tgd-desc{margin:.5rem 0 0;color:#91a0b3;font-size:.9375rem;line-height:1.45;text-align:left}",
      ".tgd-form{margin-top:1.5rem;display:flex;flex-direction:column;gap:1rem}",
      ".tgd-champ{position:relative}",
      ".tgd-champ svg{position:absolute;left:.75rem;top:50%;width:1rem;height:1rem;transform:translateY(-50%);color:#91a0b3;pointer-events:none}",
      ".tgd-champ input{display:flex;box-sizing:border-box;width:100%;height:2.75rem;padding:.5rem .75rem .5rem 2.25rem;border-radius:.5rem;",
      "border:1px solid rgba(141,179,211,.22);background:#060b12;color:#f4f7fb;font-size:16px;font-family:inherit;",
      "box-shadow:0 1px 2px rgba(0,0,0,.05);transition:box-shadow .15s,border-color .15s;outline:none}",
      ".tgd-champ input::placeholder{color:rgba(145,160,179,.7)}",
      ".tgd-champ input:focus-visible{border-color:#20d5ef;box-shadow:0 0 0 3px rgba(32,213,239,.2)}",
      ".tgd-bouton{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;box-sizing:border-box;width:100%;height:2.75rem;padding:0 1rem;white-space:nowrap;",
      "border:0;border-radius:12px;background:#20d5ef;color:#060b12;font-size:.9375rem;font-weight:800;font-family:inherit;cursor:pointer;",
      "text-decoration:none;box-shadow:0 8px 24px rgba(32,213,239,.25);transition:background-color .15s,transform .1s;-webkit-tap-highlight-color:transparent}",
      ".tgd-bouton svg{width:1.1rem;height:1.1rem}",
      "@media (hover:hover){.tgd-bouton:hover{background:#06b6d4}}",
      ".tgd-bouton:active{transform:scale(.98)}",
      ".tgd-bouton[disabled]{opacity:.5;pointer-events:none}",
      ".tgd-erreur{margin:-.25rem 0 0;color:#ff8a8a;font-size:.875rem}",
      ".tgd-erreur:empty{display:none}",
      ".tgd-fermer{position:absolute;right:1rem;top:1rem;z-index:2;display:flex;align-items:center;justify-content:center;width:2.25rem;height:2.25rem;",
      "border:0;border-radius:999px;background:rgba(6,11,18,.6);color:#f4f7fb;opacity:.85;cursor:pointer;transition:opacity .15s}",
      ".tgd-fermer svg{width:1rem;height:1rem}",
      "@media (hover:hover){.tgd-fermer:hover{opacity:1}}",
      ".tgd-fermer:focus-visible{outline:2px solid #20d5ef;outline-offset:2px}",
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
        '<p class="tgd-desc tgd-monte tgd-d2">' + esc(estPro ? T.okPro : T.okGratuit) + "</p>" +
        '<div class="tgd-form tgd-monte tgd-d4"><a class="tgd-bouton" target="_blank" rel="noopener" href="' + CHAINE + '">' + ICONE_TG + esc(estPro ? T.robot : T.chaine) + "</a></div>";
      var lien = corps.querySelector("a");
      lien.addEventListener("click", function () { setTimeout(fermer, 300); });
      if (!estPro) return;
      // Compte Pro : lien personnel du robot (code a usage unique) ; repli sur la chaine si le robot ne repond pas.
      ctx.sb.auth.getSession().then(function (s) {
        var jeton = s && s.data && s.data.session && s.data.session.access_token;
        if (!jeton) return null;
        return fetch(ctx.url + "/functions/v1/telegram-bot", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + jeton, apikey: ctx.key },
          body: JSON.stringify({ action: "vip-link" })
        }).then(function (r) { return r.ok ? r.json() : null; });
      }).then(function (d) {
        if (d && d.robot_url) lien.href = d.robot_url;
        else lien.innerHTML = ICONE_TG + esc(T.chaine);
      }).catch(function () { lien.innerHTML = ICONE_TG + esc(T.chaine); });
    }
  }

  function autreFenetreOuverte() {
    var d = document.querySelectorAll('[role="dialog"][aria-modal="true"], dialog[open]');
    for (var i = 0; i < d.length; i++) { if (d[i].offsetParent !== null || getComputedStyle(d[i]).position === "fixed") return true; }
    return false;
  }

  // ctx : { sb, userId, pro, locale, url, key }
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
