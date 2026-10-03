/* IASHARK — INTERRUPTEURS D'OUVERTURE (un seul endroit pour tout le site).
 *
 * Lu par : account-page.js (page Compte), pro-onboarding.js (accueil Pro),
 * tools-page.js (espace Pro). Charge, AVANT ces scripts, par compte.html,
 * pro.html et accueil-pro.html (et donc par leurs copies fr/en/es/gb/mx/za
 * fabriquees par scripts/build-locales.js). Un test le verifie
 * (tests/ouverture.test.js).
 *
 *  - canalPro    : bouton « Ouvrir mon robot sur Telegram » sur la page Compte
 *                  (messages Pro en prive). Demande les migrations 0033, 0040,
 *                  0041, 0043, 0044 et la fonction telegram-bot en ligne.
 *  - reglagesPro : questionnaire « Mes reglages Pro » (accueil Pro, Compte,
 *                  espace Pro). Demande les migrations 0040 et 0044.
 *  - tableauPro  : tableau de bord Pro (programme du jour, messages Telegram,
 *                  reglages, journal, garde-fou). Ouvert le 3/10/2026 (0040/0041
 *                  appliquees en base).
 *
 * POUR ETEINDRE (retour a « Bientot » sur le site) : mettre la valeur a false,
 * enregistrer, puis publier le site (fusion sur main => Netlify). Rien d'autre
 * a toucher : aucune base, aucune fonction. Les visiteurs voient le changement
 * au prochain chargement de page (le nom du fichier publie change a chaque
 * contenu, scripts/build-public.js).
 */
window.IASHARK_OUVERTURE = Object.freeze({
  canalPro: true,
  reglagesPro: true,
  tableauPro: true
});
