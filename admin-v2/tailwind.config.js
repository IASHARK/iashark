/** Direction visuelle du site : cyan + gris sur fond sombre, Inter, pas de
 * monospace majuscule generalise ; vert/rouge reserves aux ecarts chiffres. */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        page: "#080c12",
        card: "#0d131c",
        edge: "rgba(141,179,211,0.14)",
        soft: "#8da3b8",
        ink: "#dbe4ee",
        cyan: "#20d5ef",
        up: "#34d399",
        down: "#f87171",
        amber: "#f59e0b",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
