"use strict";
// Termes de LA RECETTE (fournisseurs de donnees, bookmakers sources, modeles,
// methodes, identifiants et parametres du moteur) qui ne doivent jamais etre
// publies. Liste deplacee le 23/10/2026 depuis tests/methodology-page.test.js
// (decisions du proprietaire du 16/09 et du 19/09/2026, expliquees en tete de
// ce fichier de test) pour etre partagee avec tests/llms-txt.test.js : le
// fichier /llms.txt, lu par les assistants IA, obeit a la meme regle.
//
// Chaque entree : [expression, raison, VITRINE?, PARTOUT?]. VITRINE : interdit
// aussi sur les pages les plus vues ; PARTOUT : aussi dans leurs <script>.

const VITRINE = true;
// Quatrieme element PARTOUT : regle appliquee aussi a l'interieur des <script>
// de ces pages (exemple-analyse.html embarque la charge utile d'un match, dont
// le texte redige nommait la methode de simulation). Reservee aux noms de
// modeles et de methodes : les noms de fournisseurs apparaissent legitimement
// dans un commentaire de code et dans l'URL du CDN qui sert les logos de
// championnat (media.api-sports.io), qui relevent de l'infrastructure.
const PARTOUT = true;
const INTERDITS = [
  // Fournisseurs de donnees / API / prestataires techniques.
  [/API-?Football/i, "fournisseur de donnees", VITRINE],
  [/API-?SPORTS/i, "fournisseur de donnees", VITRINE],
  [/The Odds API/i, "fournisseur de cotes", VITRINE],
  [/ClubElo/i, "fournisseur de donnees", VITRINE],
  [/OpenWeatherMap/i, "fournisseur de donnees", VITRINE],
  [/NewsAPI/i, "fournisseur de donnees", VITRINE],
  [/Anthropic/i, "prestataire IA nomme", VITRINE],
  [/\bClaude\b/, "modele IA nomme", VITRINE],
  [/\bGPT\b|OpenAI/i, "modele IA nomme", VITRINE],
  [/Supabase|Netlify|GitHub Actions/i, "brique d'infrastructure", VITRINE],
  // Bookmakers cites comme source.
  // « Betway Premiership » est le nom commercial du championnat sud-africain
  // (i18n/seo/za.json), pas un bookmaker cite comme source : seule exception.
  [/Pinnacle|Bet ?365|Betclic|Winamax|Unibet|Betway(?! Premiership)|Bwin|William Hill/i, "bookmaker source", VITRINE],
  // Modeles et methodes statistiques.
  [/Dixon-?Coles/i, "modele statistique nomme", VITRINE, PARTOUT],
  [/\bPoisson\b/i, "modele statistique nomme", VITRINE, PARTOUT],
  [/Monte[- ]?Carlo/i, "methode nommee", VITRINE, PARTOUT],
  [/\bShin\b/, "methode nommee", VITRINE, PARTOUT],
  [/\bKelly\b/, "methode nommee", VITRINE, PARTOUT],
  [/\bElo\b/, "composant du moteur", VITRINE, PARTOUT],
  // Pas VITRINE : le xG est un chiffre affiche sur toutes les pages match
  // (match_page.unit_xg_*) ; l'interdiction vise la page qui decrit le moteur.
  [/\bxG\b/, "feature nommee"],
  [/isoton|isotonic|isotónic|isotonisch/i, "methode de calibration nommee", VITRINE, PARTOUT],
  [/r[ée]gression logistique|logistic regression/i, "methode nommee", VITRINE, PARTOUT],
  // Version du modele / identifiants techniques.
  // Pas VITRINE : exemple-analyse.html embarque la charge utile publique reelle
  // d'un match, dont les noms de champs (model_probability...) sont ceux de
  // data.json. Ce sont des donnees publiees, pas la recette.
  [/score-matrix|early-season-v\d|model_probability|pickMarketDeterministic/i, "identifiant technique"],
  // Parametres operationnels exacts.
  [/06:00 UTC|0 6 \* \* \*/i, "heure exacte du calcul", VITRINE],
  [/5[  .,]?000 (simulations|fois|veces|times|volte|mal|vezes)/i, "nombre de simulations", VITRINE],
  // Decision du 19/09/2026 (page courte et vague). Pas VITRINE : ces termes ne
  // sont interdits que sur la page Methodologie (Stripe, par exemple, est
  // legitimement nomme sur les pages de paiement).
  [/Stripe/i, "prestataire de paiement nomme"],
  [/\b(Sonnet|Haiku)\b/, "modele IA nomme"],
  [/Dixon/i, "modele statistique nomme"],
  [/sans marge|marge (du bookmaker )?(retir|inclus)|without (the )?(bookmaker'?s? )?margin|margin (removed|included)|sin (el )?margen|margen (retirad|incluid)|ohne (die )?Marge|margenfrei|Marge (entfernt|abgezogen|herausgerechnet)|Abzug der (Buchmacher)?[Mm]arge|senza (il )?margine|margine (rimoss|inclus)|tolto il margine|sem (a )?margem|margem (retirad|inclu[íi]d)|retirada a margem/i, "detail : marge du bookmaker retiree"],
  [/[ck]alibr/i, "detail : calibration"],
  [/fourchette de cotes|cote (minimale|maximale)|odds range|(minimum|maximum) (odds|price)|horquilla de cuotas|rango de momios|cuota (m[íi]nima|m[áa]xima)|momio (m[íi]nimo|m[áa]ximo)|Mindestquote|H[öo]chstquote|Quotenspanne|quota (minima|massima)|forchetta di quote|intervallo di quote|odd (m[íi]nima|m[áa]xima)|intervalo de odds/i, "detail : fourchette de cotes"],
  [/plafond de probabilit|probability cap|tope de probabilidad|Wahrscheinlichkeitsobergrenze|Obergrenze f[üu]r die Wahrscheinlichkeit|tetto (massimo )?(di|della) probabilit|teto de probabilidade|limite m[áa]ximo de probabilidade/i, "detail : plafond de probabilite"],
  [/s[ée]lection renforc[ée]e|stricter selection|selecci[óo]n reforzada|verst[äa]rkte Auswahl|strengere Auswahl|selezione ra?inforzata|selezione pi[ùu] esigente|sele[çc][ãa]o refor[çc]ada/i, "detail : selection renforcee"],
  [/valeur estim[ée]e|estimated value|valor estimado|gesch[äa]tzte[nr]? Wert|valore stimato/i, "detail : regle du match offert"],
  [/part minoritaire|minority share|parte minoritaria|parte minorit[áa]ria|quota minoritaria|Minderheitsanteil|kleineren Anteil/i, "detail : poids du modele"],
  [/Accord des calculs|agreement between (the )?calculations|acuerdo (de|entre) (los )?c[áa]lculos|[ÜU]bereinstimmung der Berechnungen|Accordo tra i calcoli|Concord[âa]ncia dos c[áa]lculos/i, "detail : signaux de fiabilite"],
];

module.exports = { VITRINE: VITRINE, PARTOUT: PARTOUT, INTERDITS: INTERDITS };
