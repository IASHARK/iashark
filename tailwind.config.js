/** IASHARK — Tailwind pour les sections marketing de la page d'accueil.
 *  preflight DESACTIVE : la page a deja son propre reset et 700 lignes de CSS
 *  maison qui pilotent la liste de matchs generee en JS. Activer preflight
 *  reinitialiserait ces styles et casserait tout l'existant. */
module.exports = {
  content: [
    "./index.html", "./match.html", "./exemple-analyse.html", "./match-page.js",
    "./pro.html", "./tools-page.js",
    // Parcours de compte et d'authentification.
    "./compte.html", "./account-page.js",
    "./connexion.html", "./inscription.html",
    "./mot-de-passe-oublie.html", "./reinitialiser-mot-de-passe.html", "./auth-pages.js"
  ],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        page:    "#060b12",
        surface: "#0a1420",
        panel:   "#0d1926",
        "surface-2": "#0d1926",
        cyan:     { DEFAULT: "#20d5ef", deep: "#06b6d4" },
        ink:      "#f4f7fb",
        soft:     "#91a0b3",
        hairline: "rgba(141,179,211,.14)"
      },
      fontFamily: { sans: ["Inter", "system-ui", "sans-serif"] },
      keyframes: {
        fadeSlideIn: { from: { opacity: "0", transform: "translateY(20px)" },
                       to:   { opacity: "1", transform: "translateY(0)" } },
        // Le bandeau defile sur DEUX pistes identiques : a -50% la seconde
        // occupe exactement la place de la premiere, la boucle est invisible.
        marquee: { from: { transform: "translateX(0)" },
                   to:   { transform: "translateX(-50%)" } }
      },
      animation: {
        "fade-in": "fadeSlideIn .8s cubic-bezier(.16,1,.3,1) forwards",
        marquee: "marquee 46s linear infinite"
      }
    }
  },
  plugins: []
};
