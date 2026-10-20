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

  // Lien de la chaine publique IASHARK : vide tant que la chaine n'existe pas
  // (le petit logo du pied de page reste alors cache).
  var TELEGRAM_URL = "";

  var TEXTS = {
    fr: {q: "VIP Telegram, ça t’intéresse ?", yes: "Oui", no: "Non, le site me suffit", price: "Même prix : {p} par mois", thanks: "Merci, c’est noté !", wait: "Résultats dès 20 votes.", change: "Changer", error: "Le vote n’est pas passé, réessayez.", tg: "Telegram"},
    en: {q: "VIP Telegram, interested?", yes: "Yes", no: "No, the site is enough", price: "Same price: {p} per month", thanks: "Thanks, noted!", wait: "Results from 20 votes.", change: "Change", error: "Vote failed, please try again.", tg: "Telegram"},
    es: {q: "VIP Telegram, ¿te interesa?", yes: "Sí", no: "No, me basta la web", price: "Mismo precio: {p} al mes", thanks: "¡Gracias, apuntado!", wait: "Resultados desde 20 votos.", change: "Cambiar", error: "El voto no se registró, inténtalo de nuevo.", tg: "Telegram"}
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
    ".poll-vip{max-width:1100px;margin:28px auto 0;padding:12px 20px;border-top:1px solid var(--line,rgba(141,179,211,.14));border-bottom:1px solid var(--line,rgba(141,179,211,.14));display:flex;align-items:center;justify-content:center;flex-wrap:wrap;gap:10px 14px;color:var(--text,#f4f7fb);font-size:14px}" +
    ".poll-vip svg{flex:none}.poll-vip-q{font-weight:800}.poll-vip-price{color:var(--soft,#a6b4c6);font-size:12px}" +
    ".poll-vip-btns{display:flex;gap:8px;flex-wrap:wrap}" +
    ".poll-vip-opt{min-height:36px;padding:0 14px;border-radius:999px;border:1px solid var(--line,rgba(141,179,211,.3));background:transparent;color:inherit;font:inherit;font-size:13px;font-weight:700;cursor:pointer}" +
    ".poll-vip-opt:hover,.poll-vip-opt[aria-pressed=true]{border-color:var(--cyan,#20d5ef);color:var(--cyan,#20d5ef)}" +
    ".poll-vip-msg{font-size:13px;color:var(--soft,#a6b4c6)}.poll-vip-msg button{background:none;border:0;color:var(--cyan,#20d5ef);font:inherit;text-decoration:underline;cursor:pointer;padding:0;margin-left:6px;min-height:32px}" +
    ".tg-foot{display:inline-flex;align-items:center;gap:5px;vertical-align:middle}" +
    "@media(max-width:560px){.poll-vip{margin:22px 12px 0;padding:12px 4px;text-align:center}.poll-vip-q{width:calc(100% - 40px)}}";

  function addFooterLink(footer, T) {
    if (!TELEGRAM_URL) return;
    var legal = footer.querySelector('a[href*="mentions-legales"]');
    var row = legal ? legal.parentNode : footer;
    if (row.querySelector(".tg-foot")) return;
    var a = document.createElement("a");
    a.className = "tg-foot";
    a.href = TELEGRAM_URL;
    a.target = "_blank";
    a.rel = "noopener";
    a.style.cssText = "color:#22d3ee;text-decoration:underline;margin:0 8px;";
    a.innerHTML = TG_LOGO.replace(/width="38" height="38"/, 'width="14" height="14"');
    a.appendChild(document.createTextNode(T.tg));
    row.appendChild(a);
  }

  function render() {
    var footer = document.querySelector("footer.responsible-footer");
    if (!footer || document.getElementById("poll-vip")) return;
    var T = TEXTS[lang()];
    var style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    addFooterLink(footer, T);

    var box = document.createElement("section");
    box.id = "poll-vip";
    box.className = "poll-vip";
    box.setAttribute("aria-label", T.q);
    box.innerHTML = TG_LOGO.replace(/width="38" height="38"/, 'width="26" height="26"') +
      '<span class="poll-vip-q"></span>' +
      '<span class="poll-vip-btns"><button type="button" class="poll-vip-opt" data-choice="telegram" aria-pressed="false"></button>' +
      '<button type="button" class="poll-vip-opt" data-choice="site" aria-pressed="false"></button></span>' +
      '<span class="poll-vip-price"></span><span class="poll-vip-msg" role="status" aria-live="polite"></span>';
    box.querySelector(".poll-vip-q").textContent = T.q;
    var opts = box.querySelectorAll(".poll-vip-opt");
    opts[0].textContent = T.yes;
    opts[1].textContent = T.no;
    var pr = price();
    var priceEl = box.querySelector(".poll-vip-price");
    if (pr) priceEl.textContent = T.price.replace("{p}", pr); else priceEl.hidden = true;
    footer.parentNode.insertBefore(box, footer);

    var msg = box.querySelector(".poll-vip-msg");
    var btns = box.querySelector(".poll-vip-btns");
    var mine = store("iashark_poll_" + POLL);

    function mark(choice) {
      for (var i = 0; i < opts.length; i++) opts[i].setAttribute("aria-pressed", opts[i].getAttribute("data-choice") === choice ? "true" : "false");
    }
    function done() {
      btns.hidden = true;
      priceEl.hidden = true;
      rpc("poll_results", {p_poll: POLL}).then(function (rows) {
        var counts = {telegram: 0, site: 0}, total = 0;
        (rows || []).forEach(function (r) { counts[r.choice] = Number(r.votes) || 0; total += Number(r.votes) || 0; });
        msg.textContent = T.thanks + " ";
        if (total >= MIN_RESULTS) {
          msg.textContent += T.yes + " " + Math.round((counts.telegram / total) * 100) + " % · " + T.no + " " + Math.round((counts.site / total) * 100) + " %";
        } else {
          msg.textContent += T.wait;
        }
        var again = document.createElement("button");
        again.type = "button";
        again.textContent = T.change;
        again.addEventListener("click", function () { msg.textContent = ""; btns.hidden = false; if (pr) priceEl.hidden = false; mark(null); });
        msg.appendChild(again);
      }).catch(function () { msg.textContent = T.thanks; });
    }
    function vote(choice) {
      mark(choice);
      rpc("poll_vote", {p_poll: POLL, p_choice: choice, p_voter: voterId(), p_lang: lang(), p_site: site()})
        .then(function () {
          store("iashark_poll_" + POLL, choice);
          mine = choice;
          if (typeof window.iasharkTrack === "function") {
            try { window.iasharkTrack("click", {target: "poll_vip", choice: choice}); } catch (e) {}
          }
          done();
        })
        .catch(function () { mark(mine); msg.textContent = T.error; });
    }
    for (var j = 0; j < opts.length; j++) {
      opts[j].addEventListener("click", function () { vote(this.getAttribute("data-choice")); });
    }
    if (mine) { mark(mine); done(); }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(render, 0); });
  else setTimeout(render, 0);
})();
