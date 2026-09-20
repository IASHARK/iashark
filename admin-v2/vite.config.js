// Bundle de l'admin v2 : sortie dans assets/admin-v2/ (publie par
// build-public.js avec le reste de assets/), noms de fichiers FIXES pour que
// admin-v2.html (ecrit a la main, a la racine) n'ait jamais a changer.
// Le cache-busting passe par ?v= dans admin-v2.html, comme le reste du site.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/assets/admin-v2/",
  build: {
    outDir: "../assets/admin-v2",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "admin-v2.js",
        chunkFileNames: "admin-v2-[name].js",
        assetFileNames: "admin-v2.[ext]",
      },
    },
  },
});
