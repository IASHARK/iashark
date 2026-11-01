// Carte de paiement (lib/offre-pro.js) : classes Tailwind prefixees tw-, compilees dans assets/offre-pro.css.
// Apres un changement de classes :
//   npx -y tailwindcss@3.4.17 -c scripts/tailwind-offre.config.js -i scripts/tailwind-offre.css --minify -o /tmp/tw.css
// puis remplacer dans assets/offre-pro.css ce qui est entre les deux reperes TAILWIND.
module.exports = {
  content: ["./lib/offre-pro.js"],
  prefix: "tw-",
  important: ".op",
  corePlugins: { preflight: false },
  theme: { extend: { colors: { "ia-cyan": "#20d5ef", "ia-doux": "#a3b1c2" } } }
};
