/* IASHARK i18n runtime (MASTER V2.1 §19). Site statique sans bundler : ce
   script est charge sur chaque page generee, detecte la locale depuis le
   chemin de l'URL (/en/..., /es/..., etc. - /fr/ et la racine = defaut),
   charge le dictionnaire correspondant, et applique les traductions aux
   elements marques data-i18n. Ne traduit JAMAIS les identifiants sportifs
   (noms d'equipes/joueurs/competitions) ni les donnees SOURCE_API/CALCULATED
   (cotes, probabilites, scores) - uniquement le texte d'interface. */
(function(global){
  "use strict";
  var SUPPORTED = ["fr","en","es","de","it","pt"];
  var DEFAULT_LOCALE = "fr";

  function detectLocale(){
    var m = location.pathname.match(/^\/([a-z]{2})(\/|$)/);
    if (m && SUPPORTED.indexOf(m[1]) !== -1) return m[1];
    return DEFAULT_LOCALE;
  }

  function localizePath(path, locale){
    // Remplace un eventuel prefixe de locale existant, sinon en ajoute un.
    var stripped = path.replace(/^\/([a-z]{2})(\/|$)/, "/");
    if (stripped === "/") return "/" + locale + "/";
    return "/" + locale + stripped;
  }

  function get(obj, path){
    var parts = path.split(".");
    var cur = obj;
    for (var i=0; i<parts.length; i++){
      if (cur == null) return null;
      cur = cur[parts[i]];
    }
    return cur;
  }

  var dictCache = {};
  function loadDict(locale){
    if (dictCache[locale]) return Promise.resolve(dictCache[locale]);
    return fetch("/i18n/dict/" + locale + ".json").then(function(r){
      if (!r.ok) throw new Error("dict fetch failed: " + r.status);
      return r.json();
    }).then(function(d){ dictCache[locale] = d; return d; });
  }

  var I18N = {
    locale: detectLocale(),
    supported: SUPPORTED,
    defaultLocale: DEFAULT_LOCALE,
    dict: null,

    localizePath: localizePath,

    t: function(key, fallback){
      var v = this.dict ? get(this.dict, key) : null;
      return v != null ? v : (fallback != null ? fallback : key);
    },

    formatDate: function(dateStr, opts){
      try{
        var d = (dateStr instanceof Date) ? dateStr : new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return new Intl.DateTimeFormat(this.localeTag(), opts || {day:"2-digit",month:"2-digit",year:"numeric"}).format(d);
      }catch(e){ return dateStr; }
    },
    formatNumber: function(n, opts){
      try{ return new Intl.NumberFormat(this.localeTag(), opts).format(n); }
      catch(e){ return String(n); }
    },
    formatCurrency: function(n, currency){
      try{ return new Intl.NumberFormat(this.localeTag(), {style:"currency", currency: currency || "EUR"}).format(n); }
      catch(e){ return n + " " + (currency||"EUR"); }
    },
    localeTag: function(){
      var map = {fr:"fr-FR", en:"en-GB", es:"es-ES", de:"de-DE", it:"it-IT", pt:"pt-PT"};
      return map[this.locale] || "fr-FR";
    },

    applyToDom: function(root){
      root = root || document;
      var self = this;
      root.querySelectorAll("[data-i18n]").forEach(function(el){
        var key = el.getAttribute("data-i18n");
        var val = self.t(key, null);
        if (val != null) el.textContent = val;
      });
      root.querySelectorAll("[data-i18n-attr]").forEach(function(el){
        var spec = el.getAttribute("data-i18n-attr"); // "placeholder:key1,title:key2"
        spec.split(",").forEach(function(pair){
          var parts = pair.split(":");
          if (parts.length !== 2) return;
          var val = self.t(parts[1].trim(), null);
          if (val != null) el.setAttribute(parts[0].trim(), val);
        });
      });
      root.querySelectorAll("[data-i18n-href-locale]").forEach(function(el){
        var href = el.getAttribute("href");
        if (href && href.charAt(0) === "/") el.setAttribute("href", localizePath(href, self.locale));
      });
    },

    switcherHtml: function(){
      var self = this;
      return SUPPORTED.map(function(loc){
        var active = loc === self.locale ? ' aria-current="true" style="color:var(--cyan)"' : "";
        return '<a href="' + localizePath(location.pathname, loc) + location.search + '"' + active + ' data-lang-link="' + loc + '">' + loc.toUpperCase() + "</a>";
      }).join(" · ");
    },

    mountSwitcher: function(selector){
      var el = typeof selector === "string" ? document.querySelector(selector) : selector;
      if (!el) return;
      el.innerHTML = this.switcherHtml();
      var self = this;
      el.querySelectorAll("[data-lang-link]").forEach(function(a){
        a.addEventListener("click", function(){
          try{ localStorage.setItem("iashark_lang", a.getAttribute("data-lang-link")); }catch(e){}
        });
      });
    },

    init: function(){
      var self = this;
      // Memorise le choix explicite (pas la simple visite) - la detection
      // navigateur ne sert que de suggestion initiale sur la racine "/",
      // geree par la redirection statique (_redirects), jamais ici.
      try{ localStorage.setItem("iashark_lang", this.locale); }catch(e){}
      return loadDict(this.locale).then(function(d){
        self.dict = d;
        self.applyToDom(document);
        document.documentElement.setAttribute("lang", self.locale);
        return self;
      }).catch(function(e){
        console.error("i18n load error", e);
        return self;
      });
    }
  };

  global.I18N = I18N;
})(window);
