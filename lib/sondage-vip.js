/* Sondage « VIP Telegram ou directement sur le site ? » en bas de l'accueil.
   Le bloc se place juste avant footer.responsible-footer. Un vote par
   navigateur (identifiant aléatoire en localStorage, un nouveau clic remplace
   l'ancien). Les résultats ne s'affichent qu'à partir de 20 votes, pour ne
   pas montrer « 100 % » après un seul vote. Le prix vient de market-config
   (même prix que la page abonnement, dans la monnaie du site). */
(function () {
  "use strict";
  if (typeof document === "undefined") return;

  var POLL = "vip-telegram-1";
  var MIN_RESULTS = 20;
  var SUPA_URL = "https://ksvjraqitxouwiabecai.supabase.co";
  var SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8";

  var TEXTS = {
    fr: {
      kicker: "Votre avis compte",
      title: "Vous préférez recevoir vos pronos comment ?",
      tg: "VIP Telegram",
      tgSub: "Plus de tickets sélectionnés, envoyés directement sur votre téléphone",
      site: "Directement sur le site",
      siteSub: "Comme aujourd’hui, sur iashark.com",
      price: "Le prix ne change pas : {p} par mois.",
      thanks: "Merci, votre vote est enregistré.",
      wait: "Les résultats s’affichent à partir de 20 votes.",
      change: "Changer mon vote",
      error: "Le vote n’est pas passé. Réessayez dans un instant."
    },
    en: {
      kicker: "Have your say",
      title: "How would you rather get your picks?",
      tg: "VIP Telegram",
      tgSub: "More selected tickets, sent straight to your phone",
      site: "Right here on the site",
      siteSub: "Same as today, on iashark.com",
      price: "The price stays the same: {p} per month.",
      thanks: "Thanks, your vote is in.",
      wait: "Results show from 20 votes.",
      change: "Change my vote",
      error: "Your vote didn’t go through. Please try again in a moment."
    },
    es: {
      kicker: "Tu opinión cuenta",
      title: "¿Cómo prefieres recibir tus pronósticos?",
      tg: "VIP Telegram",
      tgSub: "Más tickets seleccionados, enviados directamente a tu móvil",
      site: "Directamente en la web",
      siteSub: "Como hoy, en iashark.com",
      price: "El precio no cambia: {p} al mes.",
      thanks: "Gracias, tu voto está registrado.",
      wait: "Los resultados se muestran a partir de 20 votos.",
      change: "Cambiar mi voto",
      error: "El voto no se ha registrado. Inténtalo de nuevo en un momento."
    }
  };

  var TG_LOGO =
    '<svg viewBox="0 0 240 240" width="38" height="38" aria-hidden="true"><circle cx="120" cy="120" r="120" fill="#229ED9"/>' +
    '<path fill="#fff" d="M54 118.6c35-15.2 58.3-25.3 70-30.2 33.3-13.9 40.2-16.3 44.7-16.4 1 0 3.2.2 4.7 1.4 1.2 1 1.5 2.3 1.7 3.3.2 1 .4 3.1.2 4.8-1.8 19-9.6 65.1-13.6 86.3-1.7 9-5 12-8.2 12.3-7 .6-12.3-4.6-19-9-10.6-6.9-16.5-11.2-26.8-18-11.9-7.8-4.2-12.1 2.6-19.2 1.8-1.8 32.6-29.9 33.2-32.5.1-.3.1-1.5-.6-2.1-.7-.6-1.7-.4-2.5-.2-1 .2-17.9 11.4-50.6 33.5-4.8 3.3-9.1 4.9-13 4.8-4.3-.1-12.5-2.4-18.6-4.4-7.5-2.4-13.4-3.7-12.9-7.9.3-2.2 3.2-4.4 8.9-6.7z"/></svg>';

  function lang() {
    var l = (document.documentElement.getAttribute("lang") || "fr").slice(0, 2).toLowerCase();
    return TEXTS[l] ? l : "en";
  }
  function site() {
    var m = location.pathname.match(/^\/(en|es|fr|gb|mx|za)\//);
    return m ? m[1] : "fr";
  }
  function store(key, val) {
    try {
      if (val === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, val);
    } catch (e) { return null; }
    return val;
  }
  function voterId() {
    var id = store("iashark_poll_voter");
    if (!id) {
      id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2, 12);
      store("iashark_poll_voter", id);
    }
    return id;
  }
  function price() {
    var m = window.IASHARK_MARKET;
    var txt = m && typeof m.formatPrice === "function" ? m.formatPrice("pro.month") : null;
    return txt || null;
  }
  function rpc(name, body) {
    return fetch(SUPA_URL + "/rest/v1/rpc/" + name, {
      method: "POST",
      headers: {"Content-Type": "application/json", apikey: SUPA_KEY, Authorization: "Bearer " + SUPA_KEY},
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.status === 204 ? null : r.json();
    });
  }

  var CSS =
    ".poll-vip{max-width:760px;margin:40px auto 8px;padding:24px 22px;border-radius:18px;background:var(--surface,#0a1420);border:1px solid var(--line,rgba(141,179,211,.14));color:var(--text,#f4f7fb);font-family:inherit}" +
    ".poll-vip-head{display:flex;align-items:center;gap:14px}" +
    ".poll-vip-kicker{margin:0;color:var(--cyan,#20d5ef);font-size:13px;font-weight:800}" +
    ".poll-vip-title{margin:4px 0 0;font-size:21px;line-height:1.25;font-weight:800}" +
    ".poll-vip-opts{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}" +
    ".poll-vip-opt{display:flex;flex-direction:column;gap:6px;text-align:left;padding:16px;border-radius:14px;border:1px solid var(--line,rgba(141,179,211,.14));background:var(--surface-2,#0d1926);color:inherit;font:inherit;cursor:pointer;min-height:44px;transition:border-color .15s,transform .15s}" +
    ".poll-vip-opt:hover{border-color:var(--cyan,#20d5ef)}.poll-vip-opt:active{transform:translateY(1px)}" +
    ".poll-vip-opt[aria-pressed=true]{border-color:var(--cyan,#20d5ef);box-shadow:0 0 0 1px var(--cyan,#20d5ef) inset}" +
    ".poll-vip-opt b{font-size:16px}.poll-vip-opt span{color:var(--soft,#a6b4c6);font-size:13px;line-height:1.4}" +
    ".poll-vip-bar{height:6px;border-radius:6px;background:rgba(141,179,211,.18);overflow:hidden;margin-top:4px}.poll-vip-bar i{display:block;height:100%;background:var(--cyan,#20d5ef)}" +
    ".poll-vip-price{margin:14px 0 0;color:var(--soft,#a6b4c6);font-size:13px}" +
    ".poll-vip-msg{margin:10px 0 0;font-size:14px}.poll-vip-msg button{background:none;border:0;color:var(--cyan,#20d5ef);font:inherit;text-decoration:underline;cursor:pointer;padding:0;margin-left:6px;min-height:32px}" +
    "@media(max-width:560px){.poll-vip{margin:28px 16px 6px;padding:20px 16px}.poll-vip-opts{grid-template-columns:1fr}.poll-vip-title{font-size:19px}}";

  function render() {
    var footer = document.querySelector("footer.responsible-footer");
    if (!footer || document.getElementById("poll-vip")) return;
    var T = TEXTS[lang()];
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    var box = document.createElement("section");
    box.id = "poll-vip";
    box.className = "poll-vip";
    box.setAttribute("aria-labelledby", "poll-vip-title");
    box.innerHTML =
      '<div class="poll-vip-head">' + TG_LOGO +
      '<div><p class="poll-vip-kicker"></p><h2 class="poll-vip-title" id="poll-vip-title"></h2></div></div>' +
      '<div class="poll-vip-opts">' +
      '<button type="button" class="poll-vip-opt" data-choice="telegram" aria-pressed="false"><b></b><span></span></button>' +
      '<button type="button" class="poll-vip-opt" data-choice="site" aria-pressed="false"><b></b><span></span></button>' +
      "</div>" +
      '<p class="poll-vip-price"></p><p class="poll-vip-msg" role="status" aria-live="polite"></p>';
    box.querySelector(".poll-vip-kicker").textContent = T.kicker;
    box.querySelector(".poll-vip-title").textContent = T.title;
    var opts = box.querySelectorAll(".poll-vip-opt");
    opts[0].querySelector("b").textContent = T.tg;
    opts[0].querySelector("span").textContent = T.tgSub;
    opts[1].querySelector("b").textContent = T.site;
    opts[1].querySelector("span").textContent = T.siteSub;
    var pr = price();
    if (pr) box.querySelector(".poll-vip-price").textContent = T.price.replace("{p}", pr);
    else box.querySelector(".poll-vip-price").hidden = true;
    footer.parentNode.insertBefore(box, footer);

    var msg = box.querySelector(".poll-vip-msg");
    var mine = store("iashark_poll_" + POLL);

    function mark(choice) {
      for (var i = 0; i < opts.length; i++) opts[i].setAttribute("aria-pressed", opts[i].getAttribute("data-choice") === choice ? "true" : "false");
    }
    function showResults() {
      rpc("poll_results", {p_poll: POLL}).then(function (rows) {
        var counts = {telegram: 0, site: 0}, total = 0;
        (rows || []).forEach(function (r) { counts[r.choice] = Number(r.votes) || 0; total += Number(r.votes) || 0; });
        msg.textContent = T.thanks + " ";
        if (total >= MIN_RESULTS) {
          for (var i = 0; i < opts.length; i++) {
            var c = opts[i].getAttribute("data-choice");
            var pct = Math.round((counts[c] / total) * 100);
            var bar = opts[i].querySelector(".poll-vip-bar") || opts[i].appendChild(document.createElement("div"));
            bar.className = "poll-vip-bar";
            bar.innerHTML = '<i style="width:' + pct + '%"></i>';
            opts[i].querySelector("b").textContent = (c === "telegram" ? T.tg : T.site) + " · " + pct + " %";
          }
        } else {
          msg.textContent += T.wait;
        }
        var again = document.createElement("button");
        again.type = "button";
        again.textContent = T.change;
        again.addEventListener("click", function () { msg.textContent = ""; mark(null); });
        msg.appendChild(again);
      }).catch(function () { msg.textContent = T.thanks; });
    }
    function vote(choice) {
      mark(choice);
      rpc("poll_vote", {p_poll: POLL, p_choice: choice, p_voter: voterId(), p_lang: lang(), p_site: site()})
        .then(function () {
          store("iashark_poll_" + POLL, choice);
          if (typeof window.iasharkTrack === "function") {
            try { window.iasharkTrack("click", {target: "poll_vip", choice: choice}); } catch (e) {}
          }
          showResults();
        })
        .catch(function () { mark(mine); msg.textContent = T.error; });
    }
    for (var j = 0; j < opts.length; j++) {
      opts[j].addEventListener("click", function () { vote(this.getAttribute("data-choice")); });
    }
    if (mine) { mark(mine); showResults(); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(render, 0); });
  else setTimeout(render, 0);
})();
