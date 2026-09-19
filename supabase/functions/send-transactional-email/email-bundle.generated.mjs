// FICHIER GENERE par `node lib/email-build.js` - NE PAS MODIFIER A LA MAIN.
// Sources : lib/email-render.js + emails/templates/*.html|*.txt
// Verifie par tests/email-templates.test.js (doit rester identique a la regeneration).
/* eslint-disable */
// deno-lint-ignore-file
const module = { exports: {} };
/* IASHARK — rendu des emails transactionnels (module PUR : aucun acces reseau,
   fichier, horloge ou variable d'environnement implicite).

   Consommateurs :
   - tests/email-*.test.js (node --test, require) ;
   - supabase/functions/send-transactional-email/ via le module genere
     email-bundle.generated.mjs (node lib/email-build.js recopie ce fichier et
     les gabarits de emails/templates/ : une fonction Edge deployee ne peut pas
     lire lib/ ni emails/ a l'execution).

   Gabarits (emails/templates/<type>.<marche>.html|.txt) : syntaxe minimale
     {{variable}}               valeur (echappee en HTML)
     {{#drapeau}}...{{/drapeau}} bloc affiche si la valeur est "vraie"
     {{^drapeau}}...{{/drapeau}} bloc affiche si la valeur est "fausse"
     {{! commentaire }}          retire au rendu
   La premiere ligne du .txt est "Subject: ..." (objet de l'email).
   Toute variable absente fait ECHOUER le rendu (jamais d'email avec un {{trou}}).

   Identite du vendeur : non publiee a ce jour (legal/README.md §4 point 1 et 2).
   Rien n'est invente : chaque champ absent devient le marqueur visible
   "[BLOCKED_DECISION: COMPANY_...]" (nom du secret Supabase a renseigner) et
   est liste dans result.blockedDecisions. Memes noms de secrets que le premier
   jet supabase/functions/_shared/email/config.ts.

   STATUT DES TEXTES : REVIEW (a faire valider par un juriste), repris des CGV
   legal/fr|gb|mx/cgv.html du 13/09/2026 et des cases de consentement
   (i18n/parts/checkout.*.json). */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  else root.IasharkEmail = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var SITE_URL = "https://iashark.com";
  var SUPPORT_EMAIL = "contact@iashark.com";

  // Miroir de config/markets.json (_dirs, <marche>.currency/intlLocale/helpline).
  // tests/email-templates.test.js fait echouer toute derive.
  var MARKETS = {
    fr: {
      market: "fr", dir: "fr", htmlLang: "fr", intlLocale: "fr-FR", currency: "EUR", timeZone: "Europe/Paris",
      helpline: { name: "Joueurs Info Service", phone: "09 74 75 13 13", url: "https://www.joueurs-info-service.fr", display: "joueurs-info-service.fr" }
    },
    gb: {
      market: "gb", dir: "gb", htmlLang: "en-GB", intlLocale: "en-GB", currency: "GBP", timeZone: "Europe/London",
      // Ligne nationale geree par GamCare (sources : legal/README.md ; begambleaware.org ne fait que
      // rediriger vers gambleaware.org). Meme ligne que config/markets.json#gb.helpline (19/09/2026).
      helpline: { name: "National Gambling Helpline (GamCare)", phone: "0808 8020 133", url: "https://www.gamcare.org.uk", display: "gamcare.org.uk" }
    },
    mx: {
      market: "mx", dir: "mx", htmlLang: "es-MX", intlLocale: "es-MX", currency: "MXN", timeZone: "America/Mexico_City",
      helpline: { name: "Línea de la Vida", phone: "800 911 2000", url: "https://www.gob.mx/conasama/articulos/linea-de-la-vida-800-911-2000", display: "gob.mx/conasama" }
    }
  };

  // Types d'email -> marches couverts par un gabarit. annual_renewal_reminder :
  // un gabarit commun ("all") rendu pour chaque repertoire de REMINDER_DIRS.
  var TEMPLATE_KINDS = {
    purchase_confirmation: ["fr", "gb"],
    renewal_reminder: ["mx"],
    annual_renewal_reminder: ["all"]
  };

  // Champs d'identite du vendeur -> secret Supabase correspondant.
  var COMPANY_FIELDS = {
    operatorName: "COMPANY_OPERATOR_NAME",   // raison sociale / nom de l'exploitant
    address: "COMPANY_ADDRESS",              // adresse geographique complete
    registration: "COMPANY_REGISTRATION",    // SIREN / SIRET
    vat: "COMPANY_VAT",                      // n° TVA ou mention de franchise
    phone: "COMPANY_PHONE",
    mediator: "COMPANY_MEDIATOR"             // mediateur de la consommation (FR)
  };

  var DEFAULT_REMINDER_DAYS = 7;
  var MIN_REMINDER_DAYS = 1;
  // 90 jours : fenetre de l'information avant reconduction annuelle (FR :
  // entre 3 mois et 1 mois avant l'echeance).
  var MAX_REMINDER_DAYS = 90;
  // En dessous, log d'avertissement (delai minimal legal MX a confirmer par
  // un juriste : le premier jet _shared/email cite 5 jours naturels, art. 76 Bis
  // LFPC reforme DOF 12/12/2025 - non verifie ici).
  var MIN_RECOMMENDED_REMINDER_DAYS = 5;

  var ACTIVE_STATUSES = ["active", "trialing"];
  var hasOwn = Object.prototype.hasOwnProperty;

  // ------------------------------------------- rappel annuel avant reconduction
  // Offre Pro unique vendue en 3 durees (decision du proprietaire du 16/09/2026).
  // Abonnement ANNUEL : information avant reconduction (FR : L215-1, entre 3 mois
  // et 1 mois avant l'echeance ; GB : bonne pratique J-30, regime DMCC a venir ;
  // MX : aviso J-30 et J-7). ZA : aucun annuel vendu au lancement, aucun gabarit.
  // Un gabarit commun (emails/templates/annual-renewal-reminder.*) et les textes
  // ci-dessous (7 langues, STATUT : REVIEW, relecture juriste + native).
  // Repertoires : miroir de config/markets.json#_dirs et _helplines, limite aux
  // versions dont le marche vend l'annuel (tests/email-templates.test.js fait
  // echouer toute derive). /en/ retire le 19/09/2026 : marche "us" (USD,
  // mensuel seul, config/markets.json#_usdSwitch applique). Un abonnement
  // annuel du marche fr dont consent_dir vaut "en" (aucun attendu : l'annuel
  // n'etait pas payable avant la bascule) recoit le rappel du repertoire
  // principal du marche (fr, reminderDirFor).
  var ANNUAL_KIND = "annual_renewal_reminder";
  var INTERNATIONAL_HELPLINE = { name: "Gambling Therapy", phone: null, url: "https://www.gamblingtherapy.org", display: "gamblingtherapy.org" };
  var REMINDER_DIRS = {
    fr: { market: "fr", locale: "fr", htmlLang: "fr", intlLocale: "fr-FR" },
    es: { market: "fr", locale: "es", htmlLang: "es", intlLocale: "es-ES", helpline: INTERNATIONAL_HELPLINE },
    de: { market: "fr", locale: "de", htmlLang: "de", intlLocale: "de-DE", helpline: INTERNATIONAL_HELPLINE },
    it: { market: "fr", locale: "it", htmlLang: "it", intlLocale: "it-IT", helpline: INTERNATIONAL_HELPLINE },
    pt: { market: "fr", locale: "pt", htmlLang: "pt", intlLocale: "pt-PT", helpline: INTERNATIONAL_HELPLINE },
    gb: { market: "gb", locale: "en", htmlLang: "en-GB", intlLocale: "en-GB" },
    mx: { market: "mx", locale: "es-mx", htmlLang: "es-MX", intlLocale: "es-MX" }
  };
  // Delai d'envoi par marche (jours avant l'echeance) : defaut et fenetre
  // recommandee (hors fenetre : avertissement dans les journaux, a confirmer
  // par un juriste). Planification : une tache pg_cron par regle.
  var ANNUAL_REMINDER_DAYS = {
    fr: { def: 45, min: 30, max: 90 },
    gb: { def: 30, min: 30, max: 90 },
    mx: { def: 30, min: 5, max: 90 }
  };
  var ANNUAL_REMINDER_COPY = {
    fr: {
      sep: " : ", subject: "Votre abonnement annuel {plan} sera reconduit le {date}", preheader: "Le {date}, {amount} seront prélevés. Vous pouvez ne pas reconduire en résiliant avant cette date.",
      title: "Votre abonnement annuel arrive à échéance", greeting: "Bonjour,",
      intro: "Votre abonnement annuel {plan} arrive à échéance le {date}. Sans action de votre part, il sera reconduit automatiquement pour un an et {amount} seront prélevés à cette date.",
      summaryTitle: "Récapitulatif", labelPlan: "Offre", labelAmount: "Montant qui sera prélevé", labelDate: "Date d’échéance et de prélèvement", labelPeriod: "Durée", labelAccount: "Compte", labelReference: "Référence",
      periodValue: "Annuelle (reconduction pour un an)", amountNote: "TTC",
      keep: "Si vous souhaitez conserver votre abonnement annuel, vous n’avez rien à faire.",
      notRenewTitle: "Vous pouvez ne pas reconduire", notRenew: "Pour ne pas reconduire votre abonnement, résiliez avant le {date} depuis Mon compte, bouton « Gérer mon abonnement ». Vous gardez l’accès Pro jusqu’à l’échéance et aucun nouveau prélèvement n’est effectué.",
      switchNote: "Vous pouvez aussi passer à la formule mensuelle ou hebdomadaire depuis le même espace, bouton « Changer de durée » : le changement prend effet à la fin de la période annuelle déjà payée.",
      ctaLabel: "Aller dans Mon compte", portalLabel: "Accès direct à l’espace de facturation :",
      legalBasis: "Cette information vous est adressée conformément à l’article L215-1 du Code de la consommation.", termsLabel: "Conditions générales de vente :",
      sellerTitle: "Vendeur", labelTradingName: "Nom commercial", labelOperator: "Raison sociale / exploitant", labelAddress: "Adresse", labelRegistration: "SIREN / SIRET", labelPhone: "Téléphone", labelEmail: "Email",
      rgTitle: "Jeu responsable · 18+", rgBody: "IASHARK publie des analyses statistiques de football. Ce n’est pas un site de paris : aucune mise n’est prise, et une probabilité n’est jamais une certitude. Les paris comportent des risques (perte d’argent, dépendance). Service réservé aux personnes de 18 ans et plus.",
      rgHelpPhone: "Besoin d’aide ? {name} : {phone}.", rgHelpNoPhone: "Besoin d’aide ? {name} :", rgMore: "Nos ressources jeu responsable",
      footer: "Email d’information envoyé à {email} avant la reconduction de votre abonnement annuel. Question : {support}.", linkCgv: "CGV", linkPrivacy: "Confidentialité", linkLegal: "Mentions légales"
    },
    en: {
      sep: ": ", subject: "Your annual {plan} subscription renews on {date}", preheader: "On {date}, {amount} will be charged. You can choose not to renew by cancelling before that date.",
      title: "Your annual subscription is coming to an end", greeting: "Hello,",
      intro: "Your annual {plan} subscription ends on {date}. If you do nothing, it will renew automatically for one year and {amount} will be charged on that date.",
      summaryTitle: "Summary", labelPlan: "Plan", labelAmount: "Amount to be charged", labelDate: "Renewal and payment date", labelPeriod: "Billing period", labelAccount: "Account", labelReference: "Reference",
      periodValue: "Annual (renews for one year)", amountNote: "(VAT included)",
      keep: "If you want to keep your annual subscription, you don’t need to do anything.",
      notRenewTitle: "You can choose not to renew", notRenew: "To stop it renewing, cancel before {date} from My account, using the “Manage my subscription” button. You keep Pro access until the end date and you will not be charged again.",
      switchNote: "You can also switch to monthly or weekly billing from the same place, using the “Change billing period” button: the change takes effect at the end of the annual period you have already paid for.",
      ctaLabel: "Go to My account", portalLabel: "Direct link to the billing area:",
      legalBasis: "This information is sent to you under Article L215-1 of the French Consumer Code.", termsLabel: "Terms and conditions:",
      sellerTitle: "Seller", labelTradingName: "Trading name", labelOperator: "Operator", labelAddress: "Address", labelRegistration: "SIREN / SIRET (France)", labelPhone: "Phone", labelEmail: "Email",
      rgTitle: "Responsible gambling · 18+", rgBody: "IASHARK publishes statistical football analysis. It is not a betting site: no bets are taken, and a probability is never a certainty. Gambling involves risks (losing money, addiction). For adults aged 18 and over only.",
      rgHelpPhone: "Need help? {name}: {phone}.", rgHelpNoPhone: "Need help? {name}:", rgMore: "Our responsible gambling resources",
      footer: "Information email sent to {email} before your annual subscription renews. Questions: {support}.", linkCgv: "Terms", linkPrivacy: "Privacy", linkLegal: "Legal notice"
    },
    es: {
      sep: ": ", subject: "Tu suscripción anual {plan} se renovará el {date}", preheader: "El {date} se cobrarán {amount}. Puedes no renovarla si la cancelas antes de esa fecha.",
      title: "Tu suscripción anual llega a su vencimiento", greeting: "Hola:",
      intro: "Tu suscripción anual {plan} vence el {date}. Si no haces nada, se renovará automáticamente por un año y se cobrarán {amount} en esa fecha.",
      summaryTitle: "Resumen", labelPlan: "Plan", labelAmount: "Importe que se cobrará", labelDate: "Fecha de vencimiento y de cobro", labelPeriod: "Duración", labelAccount: "Cuenta", labelReference: "Referencia",
      periodValue: "Anual (renovación por un año)", amountNote: "(IVA incluido)",
      keep: "Si quieres conservar tu suscripción anual, no tienes que hacer nada.",
      notRenewTitle: "Puedes no renovarla", notRenew: "Para que no se renueve, cancela antes del {date} desde Mi cuenta, con el botón «Gestionar mi suscripción». Conservas el acceso Pro hasta el vencimiento y no se realiza ningún cobro nuevo.",
      switchNote: "También puedes pasar a la modalidad mensual o semanal desde el mismo espacio, con el botón «Cambiar la duración»: el cambio se aplica al final del periodo anual ya pagado.",
      ctaLabel: "Ir a Mi cuenta", portalLabel: "Acceso directo al área de facturación:",
      legalBasis: "Esta información se te envía conforme al artículo L215-1 del Código de Consumo francés.", termsLabel: "Condiciones generales de venta:",
      sellerTitle: "Vendedor", labelTradingName: "Nombre comercial", labelOperator: "Titular", labelAddress: "Dirección", labelRegistration: "SIREN / SIRET (Francia)", labelPhone: "Teléfono", labelEmail: "Correo electrónico",
      rgTitle: "Juego responsable · 18+", rgBody: "IASHARK publica análisis estadísticos de fútbol. No es un sitio de apuestas: no se acepta ninguna apuesta y una probabilidad nunca es una certeza. Las apuestas conllevan riesgos (pérdida de dinero, adicción). Servicio reservado a mayores de 18 años.",
      rgHelpPhone: "¿Necesitas ayuda? {name}: {phone}.", rgHelpNoPhone: "¿Necesitas ayuda? {name}:", rgMore: "Nuestros recursos de juego responsable",
      footer: "Correo informativo enviado a {email} antes de la renovación de tu suscripción anual. Dudas: {support}.", linkCgv: "Condiciones", linkPrivacy: "Privacidad", linkLegal: "Aviso legal"
    },
    "es-mx": {
      sep: ": ", subject: "Tu suscripción anual {plan} se renueva el {date}", preheader: "El {date} se cobrarán {amount}. Si no quieres renovar, puedes cancelar en línea antes de esa fecha.",
      title: "Tu plan anual se renueva por un año más", greeting: "Hola:",
      intro: "Te avisamos con anticipación que tu suscripción anual {plan} se renovará automáticamente por un año más el {date} y que ese día se hará el cargo de {amount} a tu método de pago.",
      summaryTitle: "Detalle del próximo cobro", labelPlan: "Plan", labelAmount: "Monto que se cobrará", labelDate: "Fecha del cobro", labelPeriod: "Plazo", labelAccount: "Cuenta", labelReference: "Referencia",
      periodValue: "Anual (se renueva por un año)", amountNote: "(pesos mexicanos, impuestos aplicables incluidos)",
      keep: "Si quieres seguir con tu plan anual, no tienes que hacer nada.",
      notRenewTitle: "Cómo cancelar en línea", notRenew: "Si no quieres renovar, cancela antes del {date} desde Mi cuenta, con el botón «Gestionar mi suscripción». La cancelación es inmediata, sin costo y sin penalización; conservas el acceso de pago hasta el final del periodo que ya pagaste.",
      switchNote: "También puedes cambiar a un plazo mensual o semanal desde el mismo lugar, con el botón «Cambiar de plazo»: el cambio aplica al final del periodo anual que ya pagaste.",
      ctaLabel: "Ir a Mi cuenta", portalLabel: "Acceso directo al área de facturación:",
      legalBasis: "Nada de este aviso limita los derechos que te otorga la Ley Federal de Protección al Consumidor, que son irrenunciables. También puedes acudir a la PROFECO: Teléfono del Consumidor 800 468 8722.", termsLabel: "Términos y condiciones:",
      sellerTitle: "Datos del proveedor", labelTradingName: "Nombre comercial", labelOperator: "Titular", labelAddress: "Domicilio", labelRegistration: "Número de registro (SIREN / SIRET, Francia)", labelPhone: "Teléfono", labelEmail: "Correo electrónico",
      rgTitle: "Juego responsable · 18+", rgBody: "IASHARK ofrece análisis estadísticos de fútbol: no es una casa de apuestas, no recibe apuestas y una probabilidad nunca es una certeza. Las apuestas pueden generar adicción. Prohibido para menores de 18 años.",
      rgHelpPhone: "Orientación gratuita: {name}, {phone}.", rgHelpNoPhone: "Orientación gratuita: {name}.", rgMore: "Juego responsable",
      footer: "Aviso de renovación enviado automáticamente a {email} porque tienes una suscripción anual activa con cobro recurrente. Aclaraciones: {support}.", linkCgv: "Términos", linkPrivacy: "Aviso de privacidad", linkLegal: "Aviso legal"
    },
    de: {
      sep: ": ", subject: "Ihr Jahresabonnement {plan} verlängert sich am {date}", preheader: "Am {date} werden {amount} abgebucht. Wenn Sie vorher kündigen, wird nicht verlängert.",
      title: "Ihr Jahresabonnement läuft ab", greeting: "Guten Tag,",
      intro: "Ihr Jahresabonnement {plan} läuft am {date} ab. Wenn Sie nichts tun, verlängert es sich automatisch um ein Jahr und an diesem Tag werden {amount} abgebucht.",
      summaryTitle: "Übersicht", labelPlan: "Angebot", labelAmount: "Abzubuchender Betrag", labelDate: "Ablauf- und Abbuchungsdatum", labelPeriod: "Laufzeit", labelAccount: "Konto", labelReference: "Referenz",
      periodValue: "Jährlich (Verlängerung um ein Jahr)", amountNote: "(inkl. MwSt.)",
      keep: "Wenn Sie Ihr Jahresabonnement behalten möchten, müssen Sie nichts tun.",
      notRenewTitle: "Sie müssen nicht verlängern", notRenew: "Damit sich Ihr Abonnement nicht verlängert, kündigen Sie vor dem {date} in Mein Konto über die Schaltfläche „Mein Abonnement verwalten“. Sie behalten den Pro-Zugang bis zum Ablaufdatum, und es erfolgt keine weitere Abbuchung.",
      switchNote: "An derselben Stelle können Sie über „Laufzeit ändern“ auch zur monatlichen oder wöchentlichen Zahlung wechseln: Der Wechsel gilt ab dem Ende des bereits bezahlten Jahreszeitraums.",
      ctaLabel: "Zu Mein Konto", portalLabel: "Direkter Zugang zum Abrechnungsbereich:",
      legalBasis: "Diese Information erhalten Sie gemäß Artikel L215-1 des französischen Verbrauchergesetzbuchs.", termsLabel: "Allgemeine Verkaufsbedingungen:",
      sellerTitle: "Verkäufer", labelTradingName: "Handelsname", labelOperator: "Betreiber", labelAddress: "Adresse", labelRegistration: "SIREN / SIRET (Frankreich)", labelPhone: "Telefon", labelEmail: "E-Mail",
      rgTitle: "Verantwortungsvolles Spielen · 18+", rgBody: "IASHARK veröffentlicht statistische Fußballanalysen. Es ist keine Wettseite: Es werden keine Wetten angenommen, und eine Wahrscheinlichkeit ist nie eine Gewissheit. Wetten sind mit Risiken verbunden (Geldverlust, Abhängigkeit). Nur für Personen ab 18 Jahren.",
      rgHelpPhone: "Brauchen Sie Hilfe? {name}: {phone}.", rgHelpNoPhone: "Brauchen Sie Hilfe? {name}:", rgMore: "Unsere Informationen zum verantwortungsvollen Spielen",
      footer: "Informations-E-Mail an {email} vor der Verlängerung Ihres Jahresabonnements. Fragen: {support}.", linkCgv: "AGB", linkPrivacy: "Datenschutz", linkLegal: "Impressum"
    },
    it: {
      sep: ": ", subject: "Il tuo abbonamento annuale {plan} si rinnova il {date}", preheader: "Il {date} verranno addebitati {amount}. Puoi non rinnovare disdicendo prima di quella data.",
      title: "Il tuo abbonamento annuale è in scadenza", greeting: "Ciao,",
      intro: "Il tuo abbonamento annuale {plan} scade il {date}. Se non fai nulla, si rinnoverà automaticamente per un anno e in quella data verranno addebitati {amount}.",
      summaryTitle: "Riepilogo", labelPlan: "Offerta", labelAmount: "Importo che verrà addebitato", labelDate: "Data di scadenza e di addebito", labelPeriod: "Durata", labelAccount: "Account", labelReference: "Riferimento",
      periodValue: "Annuale (rinnovo per un anno)", amountNote: "(IVA inclusa)",
      keep: "Se vuoi mantenere l’abbonamento annuale, non devi fare nulla.",
      notRenewTitle: "Puoi non rinnovare", notRenew: "Per non rinnovare, disdici prima del {date} da Il mio account, con il pulsante «Gestisci il mio abbonamento». Mantieni l’accesso Pro fino alla scadenza e non verrà effettuato alcun nuovo addebito.",
      switchNote: "Dallo stesso spazio puoi anche passare alla formula mensile o settimanale, con il pulsante «Cambia durata»: il cambio ha effetto alla fine del periodo annuale già pagato.",
      ctaLabel: "Vai a Il mio account", portalLabel: "Accesso diretto all’area di fatturazione:",
      legalBasis: "Questa informazione ti viene inviata ai sensi dell’articolo L215-1 del Codice del consumo francese.", termsLabel: "Condizioni generali di vendita:",
      sellerTitle: "Venditore", labelTradingName: "Nome commerciale", labelOperator: "Titolare", labelAddress: "Indirizzo", labelRegistration: "SIREN / SIRET (Francia)", labelPhone: "Telefono", labelEmail: "Email",
      rgTitle: "Gioco responsabile · 18+", rgBody: "IASHARK pubblica analisi statistiche sul calcio. Non è un sito di scommesse: non si accettano puntate e una probabilità non è mai una certezza. Le scommesse comportano rischi (perdita di denaro, dipendenza). Servizio riservato ai maggiori di 18 anni.",
      rgHelpPhone: "Hai bisogno di aiuto? {name}: {phone}.", rgHelpNoPhone: "Hai bisogno di aiuto? {name}:", rgMore: "Le nostre risorse sul gioco responsabile",
      footer: "Email informativa inviata a {email} prima del rinnovo del tuo abbonamento annuale. Domande: {support}.", linkCgv: "Condizioni", linkPrivacy: "Privacy", linkLegal: "Note legali"
    },
    pt: {
      sep: ": ", subject: "A tua subscrição anual {plan} renova-se a {date}", preheader: "A {date} serão cobrados {amount}. Podes não renovar se cancelares antes dessa data.",
      title: "A tua subscrição anual está a chegar ao fim", greeting: "Olá,",
      intro: "A tua subscrição anual {plan} termina a {date}. Se não fizeres nada, renova-se automaticamente por um ano e nessa data serão cobrados {amount}.",
      summaryTitle: "Resumo", labelPlan: "Oferta", labelAmount: "Montante a cobrar", labelDate: "Data de vencimento e de cobrança", labelPeriod: "Duração", labelAccount: "Conta", labelReference: "Referência",
      periodValue: "Anual (renovação por um ano)", amountNote: "(IVA incluído)",
      keep: "Se quiseres manter a tua subscrição anual, não precisas de fazer nada.",
      notRenewTitle: "Podes não renovar", notRenew: "Para não renovar, cancela antes de {date} em A minha conta, no botão «Gerir a minha subscrição». Manténs o acesso Pro até ao vencimento e não é efetuada nenhuma nova cobrança.",
      switchNote: "No mesmo espaço podes também mudar para a modalidade mensal ou semanal, no botão «Mudar a duração»: a mudança produz efeito no fim do período anual já pago.",
      ctaLabel: "Ir para A minha conta", portalLabel: "Acesso direto à área de faturação:",
      legalBasis: "Esta informação é-te enviada nos termos do artigo L215-1 do Código do Consumo francês.", termsLabel: "Condições gerais de venda:",
      sellerTitle: "Vendedor", labelTradingName: "Nome comercial", labelOperator: "Titular", labelAddress: "Morada", labelRegistration: "SIREN / SIRET (França)", labelPhone: "Telefone", labelEmail: "Email",
      rgTitle: "Jogo responsável · 18+", rgBody: "A IASHARK publica análises estatísticas de futebol. Não é um site de apostas: não são aceites apostas e uma probabilidade nunca é uma certeza. As apostas comportam riscos (perda de dinheiro, dependência). Serviço reservado a maiores de 18 anos.",
      rgHelpPhone: "Precisas de ajuda? {name}: {phone}.", rgHelpNoPhone: "Precisas de ajuda? {name}:", rgMore: "Os nossos recursos de jogo responsável",
      footer: "Email informativo enviado para {email} antes da renovação da tua subscrição anual. Dúvidas: {support}.", linkCgv: "Condições", linkPrivacy: "Privacidade", linkLegal: "Aviso legal"
    }
  };
  // Variantes par repertoire (meme langue, autre marche) : GB = anglais, prix
  // en GBP avec taxes applicables, pas de reference au droit francais.
  var ANNUAL_REMINDER_DIR_OVERRIDES = {
    gb: { amountNote: "(including any applicable taxes)", legalBasis: "" }
  };


  function EmailRenderError(code, message) {
    this.name = "EmailRenderError";
    this.code = code;
    this.message = message || code;
  }
  EmailRenderError.prototype = Object.create(Error.prototype);
  EmailRenderError.prototype.constructor = EmailRenderError;

  function fail(code, message) { throw new EmailRenderError(code, message); }

  // ---------------------------------------------------------------- utilitaires

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function isValidEmail(value) {
    return typeof value === "string" && value.length <= 254 && /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]+$/.test(value);
  }

  function maskEmail(value) {
    if (!isValidEmail(value)) return "(aucune)";
    var at = value.indexOf("@");
    return value.slice(0, 1) + "***" + value.slice(at);
  }

  function normalizeMarket(value) {
    var key = typeof value === "string" ? value.trim().toLowerCase() : "";
    return hasOwn.call(MARKETS, key) ? key : null;
  }

  function toDate(value) {
    if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
    if (typeof value !== "string" && typeof value !== "number") return null;
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }

  function unixToIso(ts) {
    return typeof ts === "number" && isFinite(ts) && ts > 0 ? new Date(ts * 1000).toISOString() : null;
  }

  function formatMoney(amountMinor, currency, intlLocale) {
    var cur = String(currency || "").toUpperCase();
    var out = new Intl.NumberFormat(intlLocale, { style: "currency", currency: cur }).format(amountMinor / 100);
    // "$199.00" seul est ambigu (pesos ou dollars) : on precise la devise.
    if (out.indexOf("$") !== -1 && cur !== "USD") out += " " + cur;
    return out;
  }

  function formatDate(date, intlLocale, timeZone) {
    return new Intl.DateTimeFormat(intlLocale, { dateStyle: "long", timeZone: timeZone }).format(date);
  }

  function formatDateTime(date, intlLocale, timeZone) {
    // dateStyle/timeStyle ne se combinent pas avec timeZoneName : champs explicites.
    return new Intl.DateTimeFormat(intlLocale, {
      year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: timeZone, timeZoneName: "short"
    }).format(date);
  }

  // Date calendaire locale {y, m, d} d'un instant dans un fuseau.
  function localParts(date, timeZone) {
    var parts = new Intl.DateTimeFormat("en-CA", { timeZone: timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    var o = {};
    parts.forEach(function (p) { o[p.type] = p.value; });
    return { y: Number(o.year), m: Number(o.month), d: Number(o.day) };
  }

  function localDateKey(date, timeZone) {
    var p = localParts(date, timeZone);
    return p.y + "-" + (p.m < 10 ? "0" : "") + p.m + "-" + (p.d < 10 ? "0" : "") + p.d;
  }

  // Decalage (ms) du fuseau a un instant donne.
  function zoneOffsetMs(date, timeZone) {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).formatToParts(date);
    var o = {};
    parts.forEach(function (p) { o[p.type] = p.value; });
    var asUtc = Date.UTC(Number(o.year), Number(o.month) - 1, Number(o.day), Number(o.hour), Number(o.minute), Number(o.second));
    return asUtc - Math.floor(date.getTime() / 1000) * 1000;
  }

  // Instant UTC de minuit local (y, m, d) dans un fuseau.
  function zonedMidnight(y, m, d, timeZone) {
    var guess = Date.UTC(y, m - 1, d);
    var t = guess - zoneOffsetMs(new Date(guess), timeZone);
    return new Date(guess - zoneOffsetMs(new Date(t), timeZone));
  }

  // Date calendaire locale + n jours, formatee (sans derive de fuseau).
  function formatLocalDatePlusDays(date, days, intlLocale, timeZone) {
    var p = localParts(date, timeZone);
    return formatDate(new Date(Date.UTC(p.y, p.m - 1, p.d + days, 12)), intlLocale, "UTC");
  }

  function stringMap(value) {
    var out = {};
    if (value && typeof value === "object") {
      Object.keys(value).forEach(function (k) { if (typeof value[k] === "string") out[k] = value[k]; });
    }
    return out;
  }

  function cleanToken(value, re) {
    return typeof value === "string" && re.test(value) ? value : null;
  }

  // Comparaison en temps constant (secret interne).
  function safeEqual(a, b) {
    var x = String(a == null ? "" : a), y = String(b == null ? "" : b);
    var len = Math.max(x.length, y.length);
    var diff = x.length ^ y.length;
    for (var i = 0; i < len; i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
    return diff === 0 && x.length > 0;
  }

  // ------------------------------------------------------------------ gabarits

  function lookup(view, name) {
    return hasOwn.call(view, name) ? view[name] : undefined;
  }

  function isTruthy(v) {
    return !(v === undefined || v === null || v === false || v === "" || v === 0);
  }

  function renderTemplate(source, view, html) {
    var out = String(source).replace(/\{\{![\s\S]*?\}\}/g, "");
    var sectionRe = /\{\{([#^])([A-Za-z][A-Za-z0-9_]*)\}\}([\s\S]*?)\{\{\/\2\}\}/g;
    var prev;
    do {
      prev = out;
      out = out.replace(sectionRe, function (_m, type, name, inner) {
        return (type === "#") === isTruthy(lookup(view, name)) ? inner : "";
      });
    } while (out !== prev);
    out = out.replace(/\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g, function (_m, name) {
      var v = lookup(view, name);
      if (v === undefined || v === null || v === false) fail("unresolved_placeholder", "Variable de gabarit manquante : " + name);
      return html ? escapeHtml(v) : String(v);
    });
    if (/\{\{|\}\}/.test(out)) fail("unresolved_placeholder", "Balise de gabarit non resolue");
    return out;
  }

  function splitSubject(text) {
    var m = /^Subject: ([^\r\n]+)\r?\n/.exec(String(text));
    if (!m) fail("template_invalid", "Le gabarit texte doit commencer par \"Subject: ...\"");
    return { subject: m[1], body: String(text).slice(m[0].length) };
  }

  function listBlocked(str) {
    var seen = {}, out = [];
    String(str).replace(/\[BLOCKED_DECISION: ([A-Z_]+)\]/g, function (_m, key) {
      if (!seen[key]) { seen[key] = true; out.push(key); }
      return _m;
    });
    return out;
  }

  // ------------------------------------------------------------------- donnees

  function companyFromEnv(getEnv) {
    var out = {};
    Object.keys(COMPANY_FIELDS).forEach(function (field) {
      var v = typeof getEnv === "function" ? getEnv(COMPANY_FIELDS[field]) : null;
      out[field] = typeof v === "string" && v.trim() ? v.trim() : null;
    });
    return out;
  }

  function blockedMarker(field) {
    return "[BLOCKED_DECISION: " + COMPANY_FIELDS[field] + "]";
  }

  var PERIOD_LABELS = {
    fr: { week: "Hebdomadaire (chaque semaine)", month: "Mensuelle (chaque mois)", year: "Annuelle (chaque année)", weeks: "Toutes les {n} semaines", months: "Tous les {n} mois", years: "Tous les {n} ans" },
    gb: { week: "Weekly (every week)", month: "Monthly", year: "Annual (every year)", weeks: "Every {n} weeks", months: "Every {n} months", years: "Every {n} years" },
    mx: { week: "Semanal (cada semana)", month: "Mensual (cada mes)", year: "Anual (cada año)", weeks: "Cada {n} semanas", months: "Cada {n} meses", years: "Cada {n} años" }
  };

  function periodLabel(market, interval, count) {
    var L = PERIOD_LABELS[market];
    var n = typeof count === "number" && count > 1 ? Math.floor(count) : 1;
    if (interval === "week") return n > 1 ? L.weeks.replace("{n}", n) : L.week;
    if (interval === "month") return n > 1 ? L.months.replace("{n}", n) : L.month;
    if (interval === "year") return n > 1 ? L.years.replace("{n}", n) : L.year;
    fail("invalid_interval", "Periodicite inconnue : " + interval);
  }

  function requireObject(d) {
    if (!d || typeof d !== "object" || Array.isArray(d)) fail("invalid_data", "data doit etre un objet");
    return d;
  }

  function requireAmount(v, name, allowZero) {
    if (typeof v !== "number" || !isFinite(v) || Math.floor(v) !== v || v < 0 || (!allowZero && v === 0)) {
      fail("invalid_amount", name + " doit etre un entier en unite mineure (centimes)");
    }
    return v;
  }

  function requireDate(v, name) {
    var d = toDate(v);
    if (!d) fail("invalid_date", name + " doit etre une date ISO valide");
    return d;
  }

  function requireCurrency(v, cfg) {
    var cur = typeof v === "string" ? v.toUpperCase() : "";
    if (cur !== cfg.currency) fail("currency_mismatch", "Devise " + (cur || "absente") + " incompatible avec le marche " + cfg.market + " (" + cfg.currency + ")");
    return cur;
  }

  function requirePlanName(v) {
    if (typeof v !== "string" || !v.trim() || v.length > 120) fail("invalid_plan", "planName obligatoire");
    return v.trim();
  }

  function optionalPortalUrl(v) {
    if (v == null || v === "") return null;
    if (typeof v !== "string" || !/^https:\/\/billing\.stripe\.com\/[A-Za-z0-9/_\-]+$/.test(v)) {
      fail("invalid_portal_url", "portalUrl doit etre un lien https://billing.stripe.com/... (lien de connexion du portail client Stripe)");
    }
    return v;
  }

  function pageUrl(cfg, page) {
    return SITE_URL + "/" + cfg.dir + "/" + page;
  }

  function commonView(cfg, options) {
    var company = options.company || {};
    var view = {
      siteUrl: SITE_URL,
      homeUrl: SITE_URL + "/" + cfg.dir + "/",
      accountUrl: pageUrl(cfg, "compte.html"),
      cgvUrl: pageUrl(cfg, "cgv.html"),
      privacyUrl: pageUrl(cfg, "confidentialite.html"),
      legalUrl: pageUrl(cfg, "mentions-legales.html"),
      responsibleUrl: pageUrl(cfg, "jeu-responsable.html"),
      supportEmail: SUPPORT_EMAIL,
      helplineName: cfg.helpline.name,
      helplinePhone: cfg.helpline.phone,
      helplineUrl: cfg.helpline.url,
      helplineDisplay: cfg.helpline.display,
      portalUrl: optionalPortalUrl(options.portalUrl)
    };
    Object.keys(COMPANY_FIELDS).forEach(function (field) {
      var key = "company" + field.charAt(0).toUpperCase() + field.slice(1);
      var v = company[field];
      view[key] = typeof v === "string" && v.trim() ? v.trim() : blockedMarker(field);
    });
    return view;
  }

  function purchaseView(cfg, d, options) {
    requireObject(d);
    var start = requireDate(d.startDate, "startDate");
    var next = d.nextBillingDate == null ? null : requireDate(d.nextBillingDate, "nextBillingDate");
    var amountMinor = requireAmount(d.amountMinor, "amountMinor", true);
    var paidMinor = d.amountPaidMinor == null ? null : requireAmount(d.amountPaidMinor, "amountPaidMinor", true);
    requireCurrency(d.currency, cfg);
    if (!isValidEmail(d.customerEmail)) fail("invalid_email", "customerEmail invalide");
    var termsVersion = cleanToken(d.termsVersion, /^\d{4}-\d{2}-\d{2}$/);
    var consentAt = d.consentRecordedAt == null ? null : toDate(d.consentRecordedAt);
    var view = commonView(cfg, options);
    view.planName = requirePlanName(d.planName);
    view.amount = formatMoney(amountMinor, cfg.currency, cfg.intlLocale);
    view.amountPaid = paidMinor != null && paidMinor !== amountMinor ? formatMoney(paidMinor, cfg.currency, cfg.intlLocale) : null;
    view.currencyCode = cfg.currency;
    view.periodicity = periodLabel(cfg.market, d.interval, d.intervalCount);
    view.startDate = formatDate(start, cfg.intlLocale, cfg.timeZone);
    view.nextBillingDate = next ? formatDate(next, cfg.intlLocale, cfg.timeZone) : null;
    // Delai de 14 jours : fin du 14e jour calendaire qui suit la souscription.
    view.withdrawalDeadline = formatLocalDatePlusDays(start, 14, cfg.intlLocale, cfg.timeZone);
    view.customerEmail = d.customerEmail;
    view.immediateStart = d.immediateStartRequested === true;
    view.termsVersion = termsVersion ? formatDate(new Date(termsVersion + "T12:00:00Z"), cfg.intlLocale, "UTC") : null;
    view.consentRecordedAt = consentAt ? formatDateTime(consentAt, cfg.intlLocale, cfg.timeZone) : null;
    view.reference = cleanToken(d.reference, /^[A-Za-z0-9_\-]{1,100}$/);
    return view;
  }

  function reminderView(cfg, d, options) {
    requireObject(d);
    var now = toDate(options.now) || fail("invalid_now", "options.now obligatoire pour le rappel (fonction pure)");
    var renewal = requireDate(d.renewalDate, "renewalDate");
    if (renewal.getTime() <= now.getTime()) fail("renewal_in_past", "renewalDate doit etre dans le futur");
    var amountMinor = requireAmount(d.amountMinor, "amountMinor", false);
    requireCurrency(d.currency, cfg);
    if (!isValidEmail(d.customerEmail)) fail("invalid_email", "customerEmail invalide");
    var days = Math.max(1, Math.round((renewal.getTime() - now.getTime()) / 86400000));
    var view = commonView(cfg, options);
    view.planName = requirePlanName(d.planName);
    view.amount = formatMoney(amountMinor, cfg.currency, cfg.intlLocale);
    view.currencyCode = cfg.currency;
    view.periodicity = periodLabel(cfg.market, d.interval, d.intervalCount);
    view.renewalDate = formatDate(renewal, cfg.intlLocale, cfg.timeZone);
    view.daysUntil = days;
    view.daysUntilLabel = days === 1 ? "1 día" : days + " días";
    view.customerEmail = d.customerEmail;
    view.reference = cleanToken(d.reference, /^[A-Za-z0-9_\-]{1,100}$/);
    return view;
  }

  // Configuration d'un repertoire du rappel annuel (devise et fuseau du marche,
  // aide jeu responsable du repertoire).
  function reminderDirConfig(dir) {
    var key = typeof dir === "string" ? dir.trim().toLowerCase() : "";
    if (!hasOwn.call(REMINDER_DIRS, key)) return null;
    var d = REMINDER_DIRS[key], m = MARKETS[d.market];
    return { market: d.market, dir: key, locale: d.locale, htmlLang: d.htmlLang, intlLocale: d.intlLocale, currency: m.currency, timeZone: m.timeZone, helpline: d.helpline || m.helpline };
  }

  function annualReminderView(cfg, d, options) {
    requireObject(d);
    var now = toDate(options.now) || fail("invalid_now", "options.now obligatoire pour le rappel (fonction pure)");
    var renewal = requireDate(d.renewalDate, "renewalDate");
    if (renewal.getTime() <= now.getTime()) fail("renewal_in_past", "renewalDate doit etre dans le futur");
    var amountMinor = requireAmount(d.amountMinor, "amountMinor", false);
    requireCurrency(d.currency, cfg);
    if (!isValidEmail(d.customerEmail)) fail("invalid_email", "customerEmail invalide");
    var C = {};
    [ANNUAL_REMINDER_COPY[cfg.locale], ANNUAL_REMINDER_DIR_OVERRIDES[cfg.dir] || {}].forEach(function (src) {
      Object.keys(src).forEach(function (k) { C[k] = src[k]; });
    });
    var view = commonView(cfg, options);
    view.htmlLang = cfg.htmlLang;
    view.planName = requirePlanName(d.planName);
    view.amount = formatMoney(amountMinor, cfg.currency, cfg.intlLocale);
    view.currencyCode = cfg.currency;
    view.renewalDate = formatDate(renewal, cfg.intlLocale, cfg.timeZone);
    view.customerEmail = d.customerEmail;
    view.reference = cleanToken(d.reference, /^[A-Za-z0-9_\-]{1,100}$/);
    view.sep = C.sep;
    var vars = { plan: view.planName, amount: view.amount, date: view.renewalDate, email: d.customerEmail, support: SUPPORT_EMAIL, name: cfg.helpline.name, phone: cfg.helpline.phone || "" };
    var fillText = function (s) { return String(s).replace(/\{(\w+)\}/g, function (m, k) { return hasOwn.call(vars, k) ? vars[k] : m; }); };
    Object.keys(C).forEach(function (k) {
      if (k === "sep" || k === "rgHelpPhone" || k === "rgHelpNoPhone") return;
      view["t" + k.charAt(0).toUpperCase() + k.slice(1)] = fillText(C[k]);
    });
    view.tRgHelp = fillText(cfg.helpline.phone ? C.rgHelpPhone : C.rgHelpNoPhone);
    return view;
  }

  // Rendu complet. templates = { <type>: { <marche>: { html, text } } } ;
  // annual_renewal_reminder : { all: { html, text } }, market = repertoire du site.
  function renderEmail(templates, kind, market, data, options) {
    options = options || {};
    if (!hasOwn.call(TEMPLATE_KINDS, kind)) fail("unknown_kind", "Type d'email inconnu : " + kind);
    var cfg, tpl, view, mk;
    if (kind === ANNUAL_KIND) {
      cfg = reminderDirConfig(market);
      if (!cfg) fail("unsupported_market", "Aucun gabarit " + kind + " pour le repertoire " + market);
      mk = cfg.dir;
      tpl = templates && templates[kind] && templates[kind].all;
      if (!tpl || typeof tpl.html !== "string" || typeof tpl.text !== "string") fail("template_missing", "Gabarit absent : " + kind);
      view = annualReminderView(cfg, data, options);
    } else {
      mk = normalizeMarket(market);
      if (!mk || TEMPLATE_KINDS[kind].indexOf(mk) === -1) fail("unsupported_market", "Aucun gabarit " + kind + " pour le marche " + market);
      tpl = templates && templates[kind] && templates[kind][mk];
      if (!tpl || typeof tpl.html !== "string" || typeof tpl.text !== "string") fail("template_missing", "Gabarit absent : " + kind + "." + mk);
      cfg = MARKETS[mk];
      view = kind === "purchase_confirmation" ? purchaseView(cfg, data, options) : reminderView(cfg, data, options);
    }
    var parts = splitSubject(tpl.text);
    var subject = renderTemplate(parts.subject, view, false).replace(/\s+/g, " ").trim();
    view.subject = subject;
    var html = renderTemplate(tpl.html, view, true);
    var text = renderTemplate(parts.body, view, false)
      .replace(/[ \t]+\r?\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim() + "\n";
    return {
      kind: kind,
      market: mk,
      locale: cfg.htmlLang,
      currency: cfg.currency,
      subject: subject,
      html: html,
      text: text,
      blockedDecisions: listBlocked(subject + html + text)
    };
  }

  // ------------------------------------------------------- Stripe -> donnees

  function firstItem(sub) {
    return (sub && sub.items && Array.isArray(sub.items.data) && sub.items.data[0]) || {};
  }

  function periodEndIso(sub) {
    // current_period_end : sur l'abonnement (anciennes API) ou sur l'item
    // (versions dahlia) - meme regle que stripe-webhook periodEndIso().
    return unixToIso(sub && sub.current_period_end) || unixToIso(firstItem(sub).current_period_end);
  }

  function planNameFromPrice(price) {
    if (price && price.product && typeof price.product === "object" && typeof price.product.name === "string" && price.product.name.trim()) return price.product.name.trim();
    if (price && typeof price.nickname === "string" && price.nickname.trim()) return price.nickname.trim();
    // Offre unique : IASHARK Pro (3 durees, meme produit Stripe).
    return "IASHARK Pro";
  }

  function customerEmailOf(sub, invoice, explicit) {
    if (isValidEmail(explicit)) return explicit;
    if (sub && sub.customer && typeof sub.customer === "object" && isValidEmail(sub.customer.email)) return sub.customer.email;
    if (invoice && isValidEmail(invoice.customer_email)) return invoice.customer_email;
    return null;
  }

  function skip(reason, extra) {
    var out = { ok: false, reason: reason };
    if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
    return out;
  }

  // Abonnement Stripe (expand items.data.price.product, customer, latest_invoice)
  // -> charge utile de confirmation d'achat. Les metadata "market" et
  // "consent_*" sont posees par create-checkout-session (consent.ts).
  function purchaseConfirmationFromStripe(input) {
    input = input || {};
    var sub = input.subscription;
    if (!sub || typeof sub !== "object" || typeof sub.id !== "string") return skip("subscription_missing");
    var meta = stringMap(sub.metadata);
    // Flux historique sans marche = marche FR (meme regle que resolvePriceId).
    var market = normalizeMarket(meta.market || "fr");
    if (!market || TEMPLATE_KINDS.purchase_confirmation.indexOf(market) === -1) return skip("no_template_for_market", { market: meta.market || null });
    if (ACTIVE_STATUSES.indexOf(sub.status) === -1) return skip("subscription_not_active", { status: sub.status || null });
    var item = firstItem(sub);
    var price = item.price || {};
    if (typeof price.unit_amount !== "number" || typeof price.currency !== "string") return skip("price_missing");
    var qty = typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : 1;
    var invoice = input.invoice && typeof input.invoice === "object" ? input.invoice
      : (sub.latest_invoice && typeof sub.latest_invoice === "object" ? sub.latest_invoice : null);
    var to = customerEmailOf(sub, invoice, input.customerEmail);
    if (!to) return skip("customer_email_missing");
    var recurring = price.recurring || {};
    return {
      ok: true,
      kind: "purchase_confirmation",
      market: market,
      to: to,
      idempotencyKey: "purchase_confirmation:" + market + ":" + sub.id,
      data: {
        planName: planNameFromPrice(price),
        amountMinor: price.unit_amount * qty,
        amountPaidMinor: invoice && typeof invoice.amount_paid === "number" ? invoice.amount_paid : null,
        currency: price.currency.toUpperCase(),
        interval: recurring.interval || null,
        intervalCount: recurring.interval_count || 1,
        startDate: unixToIso(sub.start_date) || unixToIso(sub.created),
        nextBillingDate: sub.cancel_at_period_end ? null : periodEndIso(sub),
        customerEmail: to,
        immediateStartRequested: meta.consent_waiver === "true",
        termsVersion: meta.consent_terms_version || null,
        consentRecordedAt: meta.consent_server_ts || null,
        reference: sub.id
      }
    };
  }

  // market : marche du gabarit a envoyer (defaut "mx", seul gabarit de rappel
  // existant ; fr/gb/za = MISSING, voir pricing-plan/legal/EMAILS_RAPPEL_RENOUVELLEMENT.md).
  function renewalReminderSkipReason(sub, now, market) {
    var expected = market || "mx";
    if (!sub || typeof sub !== "object" || typeof sub.id !== "string") return "subscription_missing";
    if (normalizeMarket(stringMap(sub.metadata).market || "fr") !== expected) return expected === "mx" ? "not_mx_market" : "market_mismatch";
    if (ACTIVE_STATUSES.indexOf(sub.status) === -1) return "subscription_not_active";
    if (sub.cancel_at_period_end) return "cancel_at_period_end";
    var end = periodEndIso(sub);
    if (!end) return "renewal_date_missing";
    if (new Date(end).getTime() <= requireDate(now, "now").getTime()) return "renewal_in_past";
    return null;
  }

  // Abonnement Stripe MX + apercu de la prochaine facture
  // (POST /v1/invoices/create_preview) -> charge utile du rappel.
  function renewalReminderFromStripe(input) {
    input = input || {};
    var sub = input.subscription;
    var market = input.market || "mx";
    var reason = renewalReminderSkipReason(sub, input.now, market);
    if (reason) return skip(reason);
    var tz = (MARKETS[market] && MARKETS[market].timeZone) || MARKETS.mx.timeZone;
    var preview = input.preview;
    // Montant EXACT de la prochaine facture (remises, taxes) : jamais estime.
    if (!preview || typeof preview.amount_due !== "number" || typeof preview.currency !== "string") return skip("amount_unavailable");
    if (preview.amount_due <= 0) return skip("nothing_to_charge");
    var to = customerEmailOf(sub, preview, input.customerEmail);
    if (!to) return skip("customer_email_missing");
    var price = firstItem(sub).price || {};
    var recurring = price.recurring || {};
    // La duree a pu changer dans le portail depuis la derniere synchronisation.
    if (input.interval && recurring.interval && recurring.interval !== input.interval) return skip("interval_mismatch");
    var renewal = periodEndIso(sub);
    return {
      ok: true,
      kind: "renewal_reminder",
      market: market,
      to: to,
      renewalLocalDate: localDateKey(new Date(renewal), tz),
      // daysBefore dans la cle : deux rappels (J-30 et J-7) d'une meme echeance
      // ne se dedoublonnent pas entre eux.
      idempotencyKey: "renewal_reminder:" + market + ":" + sub.id + ":" + localDateKey(new Date(renewal), tz) + (input.daysBefore ? ":J-" + input.daysBefore : ""),
      data: {
        planName: planNameFromPrice(price),
        amountMinor: preview.amount_due,
        currency: preview.currency.toUpperCase(),
        interval: recurring.interval || null,
        intervalCount: recurring.interval_count || 1,
        renewalDate: renewal,
        customerEmail: to,
        reference: sub.id
      }
    };
  }

  // Gabarit de rappel pour un marche et une duree (null = aucun gabarit : ZA,
  // hebdomadaire / mensuel hors MX, marche inconnu).
  function reminderKindFor(market, interval) {
    if (interval === "year") return hasOwn.call(ANNUAL_REMINDER_DAYS, market) ? ANNUAL_KIND : null;
    if (interval === "month" || interval === "week") return TEMPLATE_KINDS.renewal_reminder.indexOf(market) !== -1 ? "renewal_reminder" : null;
    return null;
  }

  // Langue du rappel : repertoire du site lors du paiement (metadata Stripe
  // consent_dir, posee par create-checkout-session) s'il appartient au marche,
  // sinon le repertoire principal du marche (fr, gb, mx).
  function reminderDirFor(market, sub) {
    var dir = String(stringMap(sub && sub.metadata).consent_dir || "").toLowerCase();
    return hasOwn.call(REMINDER_DIRS, dir) && REMINDER_DIRS[dir].market === market ? dir : market;
  }

  // Abonnement ANNUEL (fr, gb, mx) + apercu de la prochaine facture -> rappel
  // avant reconduction. Montant EXACT de l'apercu Stripe, jamais estime.
  function annualRenewalReminderFromStripe(input) {
    input = input || {};
    var sub = input.subscription;
    var market = input.market;
    if (!hasOwn.call(ANNUAL_REMINDER_DAYS, market)) return skip("no_template_for_market");
    var reason = renewalReminderSkipReason(sub, input.now, market);
    if (reason) return skip(reason);
    var price = firstItem(sub).price || {};
    if ((price.recurring || {}).interval !== "year") return skip("interval_mismatch");
    var preview = input.preview;
    if (!preview || typeof preview.amount_due !== "number" || typeof preview.currency !== "string") return skip("amount_unavailable");
    if (preview.amount_due <= 0) return skip("nothing_to_charge");
    var to = customerEmailOf(sub, preview, input.customerEmail);
    if (!to) return skip("customer_email_missing");
    var renewal = periodEndIso(sub);
    var local = localDateKey(new Date(renewal), MARKETS[market].timeZone);
    return {
      ok: true,
      kind: ANNUAL_KIND,
      market: reminderDirFor(market, sub),
      marketCode: market,
      to: to,
      renewalLocalDate: local,
      idempotencyKey: ANNUAL_KIND + ":" + market + ":" + sub.id + ":" + local + (input.daysBefore ? ":J-" + input.daysBefore : ""),
      data: {
        planName: planNameFromPrice(price),
        amountMinor: preview.amount_due,
        currency: preview.currency.toUpperCase(),
        renewalDate: renewal,
        customerEmail: to,
        reference: sub.id
      }
    };
  }

  // ------------------------------------------------------------ planification

  function parseReminderDays(value) {
    if (value === undefined || value === null || value === "") return DEFAULT_REMINDER_DAYS;
    var n = typeof value === "number" ? value : (/^\s*\d+\s*$/.test(String(value)) ? Number(value) : NaN);
    if (!isFinite(n) || Math.floor(n) !== n || n < MIN_REMINDER_DAYS || n > MAX_REMINDER_DAYS) {
      fail("invalid_reminder_days", "daysBefore doit etre un entier entre " + MIN_REMINDER_DAYS + " et " + MAX_REMINDER_DAYS);
    }
    return n;
  }

  // Fenetre de selection d'une execution quotidienne : renouvellements dont la
  // date LOCALE (fuseau du marche) est aujourd'hui + daysBefore. Par jour
  // calendaire et non par "24 h glissantes" : un leger decalage de l'heure
  // d'execution du cron ne fait ni doublon ni trou.
  function renewalWindow(now, daysBefore, timeZone) {
    var d = requireDate(now, "now");
    var days = parseReminderDays(daysBefore);
    var tz = timeZone || MARKETS.mx.timeZone;
    var p = localParts(d, tz);
    var target = new Date(Date.UTC(p.y, p.m - 1, p.d + days, 12));
    var y = target.getUTCFullYear(), m = target.getUTCMonth() + 1, day = target.getUTCDate();
    var next = new Date(Date.UTC(y, m - 1, day + 1, 12));
    var start = zonedMidnight(y, m, day, tz);
    var end = zonedMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), tz);
    return {
      daysBefore: days,
      timeZone: tz,
      localDate: y + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day,
      start: start.toISOString(),
      end: end.toISOString()
    };
  }

  function cleanIdempotencyKey(value) {
    return cleanToken(value, /^[A-Za-z0-9_:.\-]{1,256}$/);
  }

  return {
    SITE_URL: SITE_URL,
    SUPPORT_EMAIL: SUPPORT_EMAIL,
    MARKETS: MARKETS,
    TEMPLATE_KINDS: TEMPLATE_KINDS,
    ANNUAL_KIND: ANNUAL_KIND,
    REMINDER_DIRS: REMINDER_DIRS,
    ANNUAL_REMINDER_DAYS: ANNUAL_REMINDER_DAYS,
    ANNUAL_REMINDER_COPY: ANNUAL_REMINDER_COPY,
    COMPANY_FIELDS: COMPANY_FIELDS,
    DEFAULT_REMINDER_DAYS: DEFAULT_REMINDER_DAYS,
    MIN_RECOMMENDED_REMINDER_DAYS: MIN_RECOMMENDED_REMINDER_DAYS,
    EmailRenderError: EmailRenderError,
    escapeHtml: escapeHtml,
    isValidEmail: isValidEmail,
    maskEmail: maskEmail,
    formatMoney: formatMoney,
    renderTemplate: renderTemplate,
    renderEmail: renderEmail,
    companyFromEnv: companyFromEnv,
    purchaseConfirmationFromStripe: purchaseConfirmationFromStripe,
    renewalReminderSkipReason: renewalReminderSkipReason,
    renewalReminderFromStripe: renewalReminderFromStripe,
    reminderKindFor: reminderKindFor,
    reminderDirFor: reminderDirFor,
    annualRenewalReminderFromStripe: annualRenewalReminderFromStripe,
    parseReminderDays: parseReminderDays,
    renewalWindow: renewalWindow,
    localDateKey: localDateKey,
    cleanIdempotencyKey: cleanIdempotencyKey,
    safeEqual: safeEqual
  };
});

const api = module.exports;
export const TEMPLATES = {
  "purchase_confirmation": {
    "fr": {
      "html": "{{! Confirmation d'abonnement - France (fr). Support durable : C. consom. L221-13 (informations de L221-5, formulaire de retractation, confirmation de la demande d'execution immediate). Textes repris de legal/fr/cgv.html (art. 6 a 9, 13/09/2026). STATUT : REVIEW. CSS inline ; le bloc <style> ne sert qu'au mode sombre et au mobile. }}<!DOCTYPE html>\n<html lang=\"fr\" xmlns=\"http://www.w3.org/1999/xhtml\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"x-apple-disable-message-reformatting\">\n<meta name=\"format-detection\" content=\"telephone=no, date=no, address=no, email=no\">\n<meta name=\"color-scheme\" content=\"light dark\">\n<meta name=\"supported-color-schemes\" content=\"light dark\">\n<title>{{subject}}</title>\n<style>\n:root { color-scheme: light dark; supported-color-schemes: light dark; }\n@media (prefers-color-scheme: dark) {\n  .bg-page { background-color: #0b1118 !important; }\n  .bg-card { background-color: #131c27 !important; border-color: #263444 !important; }\n  .bg-soft { background-color: #18232f !important; border-color: #2f6f86 !important; }\n  .bg-warn { background-color: #2a2213 !important; border-color: #6b5320 !important; }\n  .tx { color: #e9eef4 !important; }\n  .tx-soft { color: #a9b6c4 !important; }\n  .bd { border-color: #263444 !important; }\n  .lnk { color: #62d6ec !important; }\n}\n[data-ogsc] .bg-page { background-color: #0b1118 !important; }\n[data-ogsc] .bg-card { background-color: #131c27 !important; }\n[data-ogsc] .bg-soft { background-color: #18232f !important; }\n[data-ogsc] .bg-warn { background-color: #2a2213 !important; }\n[data-ogsc] .tx { color: #e9eef4 !important; }\n[data-ogsc] .tx-soft { color: #a9b6c4 !important; }\n[data-ogsc] .lnk { color: #62d6ec !important; }\n@media only screen and (max-width: 620px) {\n  .container { width: 100% !important; }\n  .pad { padding: 20px !important; }\n}\n</style>\n</head>\n<body class=\"bg-page\" style=\"margin:0;padding:0;background-color:#f2f4f7;-webkit-text-size-adjust:100%;\">\n<div style=\"display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f2f4f7;\">Votre abonnement {{planName}} est actif : récapitulatif, résiliation en ligne et droit de rétractation.</div>\n<table role=\"presentation\" class=\"bg-page\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;background-color:#f2f4f7;border-collapse:collapse;\">\n<tr>\n<td align=\"center\" style=\"padding:24px 12px;\">\n<table role=\"presentation\" class=\"container\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:600px;max-width:600px;border-collapse:collapse;\">\n<tr>\n<td class=\"tx\" style=\"padding:4px 4px 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;font-weight:bold;letter-spacing:3px;color:#0b1a2a;\">IASHARK</td>\n</tr>\n<tr>\n<td class=\"bg-card pad\" style=\"padding:32px;background-color:#ffffff;border:1px solid #dfe4ea;border-radius:12px;font-family:Arial,Helvetica,sans-serif;\">\n\n<h1 class=\"tx\" style=\"margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:31px;font-weight:bold;color:#0b1a2a;\">Votre abonnement est confirmé</h1>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Bonjour,</p>\n<p class=\"tx\" style=\"margin:0 0 20px;font-size:15px;line-height:24px;color:#1f2d3a;\">Merci pour votre souscription. Cet email confirme votre contrat sur un support durable : nous vous conseillons de le conserver.</p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Récapitulatif</h2>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 18px;\">\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Offre</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{planName}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Prix</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{amount}} TTC ({{currencyCode}})</td></tr>\n{{#amountPaid}}<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Montant payé aujourd’hui</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{amountPaid}} TTC</td></tr>{{/amountPaid}}\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Périodicité</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{periodicity}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Date de début</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{startDate}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Prochain prélèvement</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{#nextBillingDate}}{{nextBillingDate}} ({{amount}} TTC){{/nextBillingDate}}{{^nextBillingDate}}Aucun : résiliation déjà programmée{{/nextBillingDate}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Compte</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{customerEmail}}</td></tr>\n{{#reference}}<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Référence</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:13px;line-height:20px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{reference}}</td></tr>{{/reference}}\n</table>\n<p class=\"tx\" style=\"margin:0 0 20px;font-size:15px;line-height:24px;color:#1f2d3a;\">L’abonnement est sans engagement de durée. Il se renouvelle automatiquement à chaque échéance, au prix alors en vigueur, jusqu’à sa résiliation. Toute modification de prix vous sera notifiée avant de s’appliquer, et vous pourrez résilier avant cette date.</p>\n\n<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"border-collapse:separate;margin:0 0 26px;\">\n<tr><td align=\"center\" bgcolor=\"#0a6d8f\" style=\"background-color:#0a6d8f;border-radius:8px;\"><a href=\"{{accountUrl}}\" target=\"_blank\" style=\"display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;\">Accéder à mon compte</a></td></tr>\n</table>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Résilier en ligne</h2>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Vous pouvez résilier à tout moment, gratuitement et en ligne : dans <a class=\"lnk\" href=\"{{accountUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Mon compte</a>, cliquez sur « Gérer mon abonnement ». Cela ouvre l’espace de facturation sécurisé de notre prestataire de paiement (Stripe), où vous choisissez l’annulation. Vous pouvez aussi écrire à <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a>.</p>\n{{#portalUrl}}<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Accès direct à l’espace de facturation : <a class=\"lnk\" href=\"{{portalUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{portalUrl}}</a></p>{{/portalUrl}}\n<p class=\"tx\" style=\"margin:0 0 26px;font-size:15px;line-height:24px;color:#1f2d3a;\">La résiliation prend effet à la fin de la période en cours : vous gardez l’accès jusqu’à cette date et aucun nouveau prélèvement n’est effectué.</p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Droit de rétractation : 14 jours</h2>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Vous disposez de 14 jours à compter de la souscription pour vous rétracter sans avoir à donner de motif (Code de la consommation, art. L221-18), soit jusqu’au {{withdrawalDeadline}} inclus.</p>\n{{#immediateStart}}<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Lors du paiement, vous avez demandé expressément que l’abonnement commence immédiatement, avant la fin de ce délai (art. L221-25). Cette demande ne vous fait pas perdre votre droit de rétractation : si vous vous rétractez pendant le délai, nous vous remboursons au plus tard 14 jours après votre demande, déduction faite d’un montant proportionnel au service fourni jusqu’à la communication de votre décision, calculé au prorata de la durée d’accès sur la période payée.</p>{{/immediateStart}}\n{{^immediateStart}}<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Aucune demande d’exécution immédiate n’est enregistrée pour cet abonnement : si vous vous rétractez pendant le délai, aucune somme n’est due et nous vous remboursons intégralement au plus tard 14 jours après votre demande.</p>{{/immediateStart}}\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Pour vous rétracter, envoyez avant la fin du délai une déclaration sans ambiguïté à <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a>, par exemple avec le modèle ci-dessous. Le remboursement est effectué avec le moyen de paiement utilisé lors de la souscription.</p>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 26px;\">\n<tr><td class=\"bg-soft\" style=\"padding:14px 16px;background-color:#f4f7fa;border-left:4px solid #0a6d8f;font-family:Arial,Helvetica,sans-serif;\">\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;font-weight:bold;color:#0b1a2a;\">Modèle de formulaire de rétractation</p>\n<p class=\"tx\" style=\"margin:0 0 6px;font-size:14px;line-height:21px;color:#1f2d3a;\">À l’attention d’IASHARK, {{supportEmail}} :</p>\n<p class=\"tx\" style=\"margin:0 0 6px;font-size:14px;line-height:21px;color:#1f2d3a;\">Je vous notifie par la présente ma rétractation du contrat portant sur l’abonnement {{planName}} souscrit le {{startDate}}.</p>\n<p class=\"tx\" style=\"margin:0 0 6px;font-size:14px;line-height:21px;color:#1f2d3a;\">Nom : ………… · Adresse email du compte : ………… · Date : …………</p>\n<p class=\"tx\" style=\"margin:0;font-size:14px;line-height:21px;color:#1f2d3a;\">Signature (uniquement en cas d’envoi sur papier) : …………</p>\n</td></tr>\n</table>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Conditions générales de vente</h2>\n<p class=\"tx\" style=\"margin:0 0 26px;font-size:15px;line-height:24px;color:#1f2d3a;\">{{#termsVersion}}Vous avez accepté les conditions générales de vente dans leur version du {{termsVersion}}{{#consentRecordedAt}} (consentement enregistré le {{consentRecordedAt}}){{/consentRecordedAt}}. {{/termsVersion}}Elles sont consultables ici : <a class=\"lnk\" href=\"{{cgvUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{cgvUrl}}</a></p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Vendeur</h2>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 26px;\">\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Nom commercial</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">IASHARK (auto-entrepreneur)</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Raison sociale / exploitant</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyOperatorName}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Adresse</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyAddress}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">SIREN / SIRET</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyRegistration}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">TVA</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyVat}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Téléphone</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyPhone}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Email</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\"><a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a></td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Médiateur de la consommation</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyMediator}}</td></tr>\n</table>\n\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0;\">\n<tr><td class=\"bg-warn\" style=\"padding:16px 18px;background-color:#fff8eb;border:1px solid #f0d49c;border-radius:8px;font-family:Arial,Helvetica,sans-serif;\">\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;font-weight:bold;color:#3a2a0c;\">Jeu responsable · 18+</p>\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;color:#3a2a0c;\">IASHARK publie des analyses statistiques : ce n’est pas un site de paris, aucune mise n’est prise et aucun gain n’est garanti. IASHARK n’est pas un opérateur agréé par l’Autorité nationale des jeux (ANJ). Les jeux d’argent sont interdits aux mineurs.</p>\n<p class=\"tx\" style=\"margin:0;font-size:14px;line-height:21px;color:#3a2a0c;\">Jouer comporte des risques : endettement, dépendance. Appelez le {{helplinePhone}} ({{helplineName}}, appel non surtaxé) ou consultez <a class=\"lnk\" href=\"{{helplineUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{helplineDisplay}}</a>. Nos ressources : <a class=\"lnk\" href=\"{{responsibleUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Jeu responsable</a>.</p>\n</td></tr>\n</table>\n\n</td>\n</tr>\n<tr>\n<td class=\"tx-soft\" style=\"padding:18px 8px 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#5d6b79;\">\nEmail envoyé automatiquement à {{customerEmail}} à la suite de votre souscription. Question ou réclamation : <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a>.<br>\n<a class=\"lnk\" href=\"{{cgvUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">CGV</a> · <a class=\"lnk\" href=\"{{privacyUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Confidentialité</a> · <a class=\"lnk\" href=\"{{legalUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Mentions légales</a> · <a class=\"lnk\" href=\"{{homeUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">iashark.com</a>\n</td>\n</tr>\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>\n",
      "text": "Subject: Confirmation de votre abonnement {{planName}}\n{{! Version texte de purchase-confirmation.fr.html : meme contenu, aucune information en moins. }}IASHARK\n\nVOTRE ABONNEMENT EST CONFIRMÉ\n\nBonjour,\n\nMerci pour votre souscription. Cet email confirme votre contrat sur un support durable : nous vous conseillons de le conserver.\n\nRÉCAPITULATIF\n- Offre : {{planName}}\n- Prix : {{amount}} TTC ({{currencyCode}})\n{{#amountPaid}}- Montant payé aujourd’hui : {{amountPaid}} TTC\n{{/amountPaid}}- Périodicité : {{periodicity}}\n- Date de début : {{startDate}}\n- Prochain prélèvement : {{#nextBillingDate}}{{nextBillingDate}} ({{amount}} TTC){{/nextBillingDate}}{{^nextBillingDate}}Aucun : résiliation déjà programmée{{/nextBillingDate}}\n- Compte : {{customerEmail}}\n{{#reference}}- Référence : {{reference}}\n{{/reference}}\nL’abonnement est sans engagement de durée. Il se renouvelle automatiquement à chaque échéance, au prix alors en vigueur, jusqu’à sa résiliation. Toute modification de prix vous sera notifiée avant de s’appliquer, et vous pourrez résilier avant cette date.\n\nMon compte : {{accountUrl}}\n\nRÉSILIER EN LIGNE\nVous pouvez résilier à tout moment, gratuitement et en ligne : dans Mon compte ({{accountUrl}}), cliquez sur « Gérer mon abonnement ». Cela ouvre l’espace de facturation sécurisé de notre prestataire de paiement (Stripe), où vous choisissez l’annulation. Vous pouvez aussi écrire à {{supportEmail}}.\n{{#portalUrl}}Accès direct à l’espace de facturation : {{portalUrl}}\n{{/portalUrl}}\nLa résiliation prend effet à la fin de la période en cours : vous gardez l’accès jusqu’à cette date et aucun nouveau prélèvement n’est effectué.\n\nDROIT DE RÉTRACTATION : 14 JOURS\nVous disposez de 14 jours à compter de la souscription pour vous rétracter sans avoir à donner de motif (Code de la consommation, art. L221-18), soit jusqu’au {{withdrawalDeadline}} inclus.\n\n{{#immediateStart}}Lors du paiement, vous avez demandé expressément que l’abonnement commence immédiatement, avant la fin de ce délai (art. L221-25). Cette demande ne vous fait pas perdre votre droit de rétractation : si vous vous rétractez pendant le délai, nous vous remboursons au plus tard 14 jours après votre demande, déduction faite d’un montant proportionnel au service fourni jusqu’à la communication de votre décision, calculé au prorata de la durée d’accès sur la période payée.{{/immediateStart}}{{^immediateStart}}Aucune demande d’exécution immédiate n’est enregistrée pour cet abonnement : si vous vous rétractez pendant le délai, aucune somme n’est due et nous vous remboursons intégralement au plus tard 14 jours après votre demande.{{/immediateStart}}\n\nPour vous rétracter, envoyez avant la fin du délai une déclaration sans ambiguïté à {{supportEmail}}, par exemple avec le modèle ci-dessous. Le remboursement est effectué avec le moyen de paiement utilisé lors de la souscription.\n\n  Modèle de formulaire de rétractation\n  | À l’attention d’IASHARK, {{supportEmail}} :\n  | Je vous notifie par la présente ma rétractation du contrat portant sur l’abonnement {{planName}} souscrit le {{startDate}}.\n  | Nom : ………… · Adresse email du compte : ………… · Date : …………\n  | Signature (uniquement en cas d’envoi sur papier) : …………\n\nCONDITIONS GÉNÉRALES DE VENTE\n{{#termsVersion}}Vous avez accepté les conditions générales de vente dans leur version du {{termsVersion}}{{#consentRecordedAt}} (consentement enregistré le {{consentRecordedAt}}){{/consentRecordedAt}}. {{/termsVersion}}Elles sont consultables ici : {{cgvUrl}}\n\nVENDEUR\n- Nom commercial : IASHARK (auto-entrepreneur)\n- Raison sociale / exploitant : {{companyOperatorName}}\n- Adresse : {{companyAddress}}\n- SIREN / SIRET : {{companyRegistration}}\n- TVA : {{companyVat}}\n- Téléphone : {{companyPhone}}\n- Email : {{supportEmail}}\n- Médiateur de la consommation : {{companyMediator}}\n\nJEU RESPONSABLE · 18+\nIASHARK publie des analyses statistiques : ce n’est pas un site de paris, aucune mise n’est prise et aucun gain n’est garanti. IASHARK n’est pas un opérateur agréé par l’Autorité nationale des jeux (ANJ). Les jeux d’argent sont interdits aux mineurs.\nJouer comporte des risques : endettement, dépendance. Appelez le {{helplinePhone}} ({{helplineName}}, appel non surtaxé) ou consultez {{helplineUrl}}. Nos ressources : {{responsibleUrl}}\n\n--\nEmail envoyé automatiquement à {{customerEmail}} à la suite de votre souscription. Question ou réclamation : {{supportEmail}}.\nCGV : {{cgvUrl}}\nConfidentialité : {{privacyUrl}}\nMentions légales : {{legalUrl}}\n"
    },
    "gb": {
      "html": "{{! Subscription confirmation - United Kingdom (gb, en-GB). Durable-medium confirmation: Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013 reg. 16 and Schedule 2, reg. 36/37 (express request + acknowledgement), model cancellation form (Schedule 3 part B). Wording from legal/gb/cgv.html (s5 to s8, 13/09/2026). STATUS: REVIEW. Inline CSS; the <style> block is only for dark mode and mobile. }}<!DOCTYPE html>\n<html lang=\"en-GB\" xmlns=\"http://www.w3.org/1999/xhtml\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"x-apple-disable-message-reformatting\">\n<meta name=\"format-detection\" content=\"telephone=no, date=no, address=no, email=no\">\n<meta name=\"color-scheme\" content=\"light dark\">\n<meta name=\"supported-color-schemes\" content=\"light dark\">\n<title>{{subject}}</title>\n<style>\n:root { color-scheme: light dark; supported-color-schemes: light dark; }\n@media (prefers-color-scheme: dark) {\n  .bg-page { background-color: #0b1118 !important; }\n  .bg-card { background-color: #131c27 !important; border-color: #263444 !important; }\n  .bg-soft { background-color: #18232f !important; border-color: #2f6f86 !important; }\n  .bg-warn { background-color: #2a2213 !important; border-color: #6b5320 !important; }\n  .tx { color: #e9eef4 !important; }\n  .tx-soft { color: #a9b6c4 !important; }\n  .bd { border-color: #263444 !important; }\n  .lnk { color: #62d6ec !important; }\n}\n[data-ogsc] .bg-page { background-color: #0b1118 !important; }\n[data-ogsc] .bg-card { background-color: #131c27 !important; }\n[data-ogsc] .bg-soft { background-color: #18232f !important; }\n[data-ogsc] .bg-warn { background-color: #2a2213 !important; }\n[data-ogsc] .tx { color: #e9eef4 !important; }\n[data-ogsc] .tx-soft { color: #a9b6c4 !important; }\n[data-ogsc] .lnk { color: #62d6ec !important; }\n@media only screen and (max-width: 620px) {\n  .container { width: 100% !important; }\n  .pad { padding: 20px !important; }\n}\n</style>\n</head>\n<body class=\"bg-page\" style=\"margin:0;padding:0;background-color:#f2f4f7;-webkit-text-size-adjust:100%;\">\n<div style=\"display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f2f4f7;\">Your {{planName}} subscription is active: summary, how to cancel online and your 14-day right to cancel.</div>\n<table role=\"presentation\" class=\"bg-page\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;background-color:#f2f4f7;border-collapse:collapse;\">\n<tr>\n<td align=\"center\" style=\"padding:24px 12px;\">\n<table role=\"presentation\" class=\"container\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:600px;max-width:600px;border-collapse:collapse;\">\n<tr>\n<td class=\"tx\" style=\"padding:4px 4px 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;font-weight:bold;letter-spacing:3px;color:#0b1a2a;\">IASHARK</td>\n</tr>\n<tr>\n<td class=\"bg-card pad\" style=\"padding:32px;background-color:#ffffff;border:1px solid #dfe4ea;border-radius:12px;font-family:Arial,Helvetica,sans-serif;\">\n\n<h1 class=\"tx\" style=\"margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:31px;font-weight:bold;color:#0b1a2a;\">Your subscription is confirmed</h1>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Hello,</p>\n<p class=\"tx\" style=\"margin:0 0 20px;font-size:15px;line-height:24px;color:#1f2d3a;\">Thank you for subscribing. This email confirms your contract on a durable medium, so please keep it for your records.</p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Summary</h2>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 18px;\">\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Plan</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{planName}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Price</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{amount}} ({{currencyCode}}, total price including any applicable taxes)</td></tr>\n{{#amountPaid}}<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Amount paid today</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{amountPaid}}</td></tr>{{/amountPaid}}\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Billing frequency</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{periodicity}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Start date</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{startDate}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Next payment</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{#nextBillingDate}}{{nextBillingDate}} ({{amount}}){{/nextBillingDate}}{{^nextBillingDate}}None: cancellation already scheduled{{/nextBillingDate}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Account</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{customerEmail}}</td></tr>\n{{#reference}}<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Reference</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:13px;line-height:20px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{reference}}</td></tr>{{/reference}}\n</table>\n<p class=\"tx\" style=\"margin:0 0 20px;font-size:15px;line-height:24px;color:#1f2d3a;\">Your subscription has no minimum term. It renews automatically at the end of each billing period, at the price then in force, until you cancel it. If we change the price, we will tell you in advance and you can cancel before the new price applies.</p>\n\n<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"border-collapse:separate;margin:0 0 26px;\">\n<tr><td align=\"center\" bgcolor=\"#0a6d8f\" style=\"background-color:#0a6d8f;border-radius:8px;\"><a href=\"{{accountUrl}}\" target=\"_blank\" style=\"display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;\">Go to my account</a></td></tr>\n</table>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Cancel online at any time</h2>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">You can stop your subscription at any time, free of charge: in <a class=\"lnk\" href=\"{{accountUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">My account</a>, click “Manage my subscription”. This opens our payment provider’s (Stripe) secure billing area, where you can cancel. You can also email <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a>.</p>\n{{#portalUrl}}<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Direct link to the billing area: <a class=\"lnk\" href=\"{{portalUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{portalUrl}}</a></p>{{/portalUrl}}\n<p class=\"tx\" style=\"margin:0 0 26px;font-size:15px;line-height:24px;color:#1f2d3a;\">Cancellation takes effect at the end of your current billing period. You keep paid access until then and you will not be charged again.</p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Your right to cancel within 14 days</h2>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Under the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013, you may cancel within 14 days of subscribing without giving a reason. The cancellation period ends on {{withdrawalDeadline}}.</p>\n{{#immediateStart}}<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">At checkout you gave your express consent for your subscription to start immediately, and you acknowledged that you lose the right to cancel once you get access to the digital content (regulation 37). If any part of the subscription is treated as a service and you cancel within 14 days, you pay a proportionate amount for what was supplied until you told us (regulation 36), and we refund the rest within 14 days. Your rights under the Consumer Rights Act 2015 are not affected.</p>{{/immediateStart}}\n{{^immediateStart}}<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">No express consent to an immediate start is recorded for this subscription: if you cancel within the 14 days, you bear no cost and we refund you in full within 14 days.</p>{{/immediateStart}}\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">How to cancel: before the 14 days end, email <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a> with a clear statement that you are cancelling. You can use the model form below, but you do not have to. Any refund is made without undue delay, and no later than 14 days after we are told of your decision, using the payment method you used.</p>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 26px;\">\n<tr><td class=\"bg-soft\" style=\"padding:14px 16px;background-color:#f4f7fa;border-left:4px solid #0a6d8f;font-family:Arial,Helvetica,sans-serif;\">\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;font-weight:bold;color:#0b1a2a;\">Model cancellation form</p>\n<p class=\"tx\" style=\"margin:0 0 6px;font-size:14px;line-height:21px;color:#1f2d3a;\">To: IASHARK, {{supportEmail}}</p>\n<p class=\"tx\" style=\"margin:0 0 6px;font-size:14px;line-height:21px;color:#1f2d3a;\">I hereby give notice that I cancel my contract for the supply of the following service: IASHARK subscription {{planName}}, ordered on {{startDate}}.</p>\n<p class=\"tx\" style=\"margin:0 0 6px;font-size:14px;line-height:21px;color:#1f2d3a;\">Name: ………… · Account email address: ………… · Date: …………</p>\n<p class=\"tx\" style=\"margin:0;font-size:14px;line-height:21px;color:#1f2d3a;\">Signature (only if this form is sent on paper): …………</p>\n</td></tr>\n</table>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Terms and conditions</h2>\n<p class=\"tx\" style=\"margin:0 0 26px;font-size:15px;line-height:24px;color:#1f2d3a;\">{{#termsVersion}}You accepted our terms dated {{termsVersion}}{{#consentRecordedAt}} (consent recorded on {{consentRecordedAt}}){{/consentRecordedAt}}. {{/termsVersion}}You can read them here: <a class=\"lnk\" href=\"{{cgvUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{cgvUrl}}</a></p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Who we are</h2>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 26px;\">\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Trading name</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">IASHARK (sole trader established in France)</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Legal name</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyOperatorName}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Geographic address</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyAddress}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Registration number (SIREN / SIRET, France)</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyRegistration}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">VAT number</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyVat}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Telephone</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyPhone}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Email</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\"><a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a></td></tr>\n</table>\n\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0;\">\n<tr><td class=\"bg-warn\" style=\"padding:16px 18px;background-color:#fff8eb;border:1px solid #f0d49c;border-radius:8px;font-family:Arial,Helvetica,sans-serif;\">\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;font-weight:bold;color:#3a2a0c;\">Safer gambling · 18+</p>\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;color:#3a2a0c;\">IASHARK publishes statistical analysis only. We are not a bookmaker, we do not take bets and no winnings are guaranteed. You must be 18 or over to use IASHARK.</p>\n<p class=\"tx\" style=\"margin:0;font-size:14px;line-height:21px;color:#3a2a0c;\">Gambling can cause harm. For free, confidential support, visit <a class=\"lnk\" href=\"{{helplineUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{helplineDisplay}}</a> or call the {{helplineName}} on {{helplinePhone}} (24/7). More: <a class=\"lnk\" href=\"{{responsibleUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Safer gambling</a>.</p>\n</td></tr>\n</table>\n\n</td>\n</tr>\n<tr>\n<td class=\"tx-soft\" style=\"padding:18px 8px 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#5d6b79;\">\nThis email was sent automatically to {{customerEmail}} following your subscription. Questions or complaints: <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a>.<br>\n<a class=\"lnk\" href=\"{{cgvUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Terms</a> · <a class=\"lnk\" href=\"{{privacyUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Privacy</a> · <a class=\"lnk\" href=\"{{legalUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Legal notice</a> · <a class=\"lnk\" href=\"{{homeUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">iashark.com</a>\n</td>\n</tr>\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>\n",
      "text": "Subject: Your {{planName}} subscription is confirmed\n{{! Plain-text version of purchase-confirmation.gb.html: same content, nothing left out. }}IASHARK\n\nYOUR SUBSCRIPTION IS CONFIRMED\n\nHello,\n\nThank you for subscribing. This email confirms your contract on a durable medium, so please keep it for your records.\n\nSUMMARY\n- Plan: {{planName}}\n- Price: {{amount}} ({{currencyCode}}, total price including any applicable taxes)\n{{#amountPaid}}- Amount paid today: {{amountPaid}}\n{{/amountPaid}}- Billing frequency: {{periodicity}}\n- Start date: {{startDate}}\n- Next payment: {{#nextBillingDate}}{{nextBillingDate}} ({{amount}}){{/nextBillingDate}}{{^nextBillingDate}}None: cancellation already scheduled{{/nextBillingDate}}\n- Account: {{customerEmail}}\n{{#reference}}- Reference: {{reference}}\n{{/reference}}\nYour subscription has no minimum term. It renews automatically at the end of each billing period, at the price then in force, until you cancel it. If we change the price, we will tell you in advance and you can cancel before the new price applies.\n\nMy account: {{accountUrl}}\n\nCANCEL ONLINE AT ANY TIME\nYou can stop your subscription at any time, free of charge: in My account ({{accountUrl}}), click “Manage my subscription”. This opens our payment provider’s (Stripe) secure billing area, where you can cancel. You can also email {{supportEmail}}.\n{{#portalUrl}}Direct link to the billing area: {{portalUrl}}\n{{/portalUrl}}\nCancellation takes effect at the end of your current billing period. You keep paid access until then and you will not be charged again.\n\nYOUR RIGHT TO CANCEL WITHIN 14 DAYS\nUnder the Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013, you may cancel within 14 days of subscribing without giving a reason. The cancellation period ends on {{withdrawalDeadline}}.\n\n{{#immediateStart}}At checkout you gave your express consent for your subscription to start immediately, and you acknowledged that you lose the right to cancel once you get access to the digital content (regulation 37). If any part of the subscription is treated as a service and you cancel within 14 days, you pay a proportionate amount for what was supplied until you told us (regulation 36), and we refund the rest within 14 days. Your rights under the Consumer Rights Act 2015 are not affected.{{/immediateStart}}{{^immediateStart}}No express consent to an immediate start is recorded for this subscription: if you cancel within the 14 days, you bear no cost and we refund you in full within 14 days.{{/immediateStart}}\n\nHow to cancel: before the 14 days end, email {{supportEmail}} with a clear statement that you are cancelling. You can use the model form below, but you do not have to. Any refund is made without undue delay, and no later than 14 days after we are told of your decision, using the payment method you used.\n\n  Model cancellation form\n  | To: IASHARK, {{supportEmail}}\n  | I hereby give notice that I cancel my contract for the supply of the following service: IASHARK subscription {{planName}}, ordered on {{startDate}}.\n  | Name: ………… · Account email address: ………… · Date: …………\n  | Signature (only if this form is sent on paper): …………\n\nTERMS AND CONDITIONS\n{{#termsVersion}}You accepted our terms dated {{termsVersion}}{{#consentRecordedAt}} (consent recorded on {{consentRecordedAt}}){{/consentRecordedAt}}. {{/termsVersion}}You can read them here: {{cgvUrl}}\n\nWHO WE ARE\n- Trading name: IASHARK (sole trader established in France)\n- Legal name: {{companyOperatorName}}\n- Geographic address: {{companyAddress}}\n- Registration number (SIREN / SIRET, France): {{companyRegistration}}\n- VAT number: {{companyVat}}\n- Telephone: {{companyPhone}}\n- Email: {{supportEmail}}\n\nSAFER GAMBLING · 18+\nIASHARK publishes statistical analysis only. We are not a bookmaker, we do not take bets and no winnings are guaranteed. You must be 18 or over to use IASHARK.\nGambling can cause harm. For free, confidential support, visit {{helplineDisplay}} ({{helplineUrl}}) or call the {{helplineName}} on {{helplinePhone}} (24/7). More: {{responsibleUrl}}\n\n--\nThis email was sent automatically to {{customerEmail}} following your subscription. Questions or complaints: {{supportEmail}}.\nTerms: {{cgvUrl}}\nPrivacy: {{privacyUrl}}\nLegal notice: {{legalUrl}}\n"
    }
  },
  "renewal_reminder": {
    "mx": {
      "html": "{{! Aviso previo de renovacion automatica - Mexico (mx, es-MX). LFPC art. 76 Bis (informacion clara del cobro recurrente y cancelacion inmediata en linea) ; datos de PROFECO tomados de legal/mx/cgv.html (apartados 6 a 8 y 12, 13/09/2026). Enviado N dias antes de la renovacion (por defecto 7). ESTADO: REVIEW. CSS en linea ; el bloque <style> solo sirve para el modo oscuro y movil. }}<!DOCTYPE html>\n<html lang=\"es-MX\" xmlns=\"http://www.w3.org/1999/xhtml\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"x-apple-disable-message-reformatting\">\n<meta name=\"format-detection\" content=\"telephone=no, date=no, address=no, email=no\">\n<meta name=\"color-scheme\" content=\"light dark\">\n<meta name=\"supported-color-schemes\" content=\"light dark\">\n<title>{{subject}}</title>\n<style>\n:root { color-scheme: light dark; supported-color-schemes: light dark; }\n@media (prefers-color-scheme: dark) {\n  .bg-page { background-color: #0b1118 !important; }\n  .bg-card { background-color: #131c27 !important; border-color: #263444 !important; }\n  .bg-soft { background-color: #18232f !important; border-color: #2f6f86 !important; }\n  .bg-warn { background-color: #2a2213 !important; border-color: #6b5320 !important; }\n  .tx { color: #e9eef4 !important; }\n  .tx-soft { color: #a9b6c4 !important; }\n  .bd { border-color: #263444 !important; }\n  .lnk { color: #62d6ec !important; }\n}\n[data-ogsc] .bg-page { background-color: #0b1118 !important; }\n[data-ogsc] .bg-card { background-color: #131c27 !important; }\n[data-ogsc] .bg-soft { background-color: #18232f !important; }\n[data-ogsc] .bg-warn { background-color: #2a2213 !important; }\n[data-ogsc] .tx { color: #e9eef4 !important; }\n[data-ogsc] .tx-soft { color: #a9b6c4 !important; }\n[data-ogsc] .lnk { color: #62d6ec !important; }\n@media only screen and (max-width: 620px) {\n  .container { width: 100% !important; }\n  .pad { padding: 20px !important; }\n}\n</style>\n</head>\n<body class=\"bg-page\" style=\"margin:0;padding:0;background-color:#f2f4f7;-webkit-text-size-adjust:100%;\">\n<div style=\"display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f2f4f7;\">El {{renewalDate}} se cobrarán {{amount}}. Si no quieres renovar, puedes cancelar en línea antes de esa fecha.</div>\n<table role=\"presentation\" class=\"bg-page\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;background-color:#f2f4f7;border-collapse:collapse;\">\n<tr>\n<td align=\"center\" style=\"padding:24px 12px;\">\n<table role=\"presentation\" class=\"container\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:600px;max-width:600px;border-collapse:collapse;\">\n<tr>\n<td class=\"tx\" style=\"padding:4px 4px 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;font-weight:bold;letter-spacing:3px;color:#0b1a2a;\">IASHARK</td>\n</tr>\n<tr>\n<td class=\"bg-card pad\" style=\"padding:32px;background-color:#ffffff;border:1px solid #dfe4ea;border-radius:12px;font-family:Arial,Helvetica,sans-serif;\">\n\n<h1 class=\"tx\" style=\"margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:31px;font-weight:bold;color:#0b1a2a;\">Tu suscripción se renueva en {{daysUntilLabel}}</h1>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Hola:</p>\n<p class=\"tx\" style=\"margin:0 0 20px;font-size:15px;line-height:24px;color:#1f2d3a;\">Te avisamos con anticipación que tu suscripción {{planName}} se renovará automáticamente el <strong style=\"font-weight:bold;\">{{renewalDate}}</strong> y que ese día se hará el cargo a tu método de pago.</p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Detalle del próximo cobro</h2>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 18px;\">\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Plan</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{planName}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Monto que se cobrará</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{amount}} (pesos mexicanos, impuestos aplicables incluidos)</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Fecha del cobro</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{renewalDate}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Periodicidad</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{periodicity}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Cuenta</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{customerEmail}}</td></tr>\n{{#reference}}<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Referencia</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:13px;line-height:20px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{reference}}</td></tr>{{/reference}}\n</table>\n<p class=\"tx\" style=\"margin:0 0 26px;font-size:15px;line-height:24px;color:#1f2d3a;\">Si quieres seguir usando {{planName}}, no tienes que hacer nada.</p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Cómo cancelar en línea</h2>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 14px;\">\n<tr><td class=\"bg-soft\" style=\"padding:14px 16px;background-color:#f4f7fa;border-left:4px solid #0a6d8f;font-family:Arial,Helvetica,sans-serif;\">\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:15px;line-height:23px;color:#1f2d3a;\">1. Entra a <a class=\"lnk\" href=\"{{accountUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Mi cuenta</a> con tu correo {{customerEmail}}.</p>\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:15px;line-height:23px;color:#1f2d3a;\">2. Haz clic en «Gestionar mi suscripción». Se abre el área de facturación segura de nuestro proveedor de pagos (Stripe).</p>\n<p class=\"tx\" style=\"margin:0;font-size:15px;line-height:23px;color:#1f2d3a;\">3. Elige cancelar la suscripción. La cancelación es inmediata, sin costo y sin penalización.</p>\n</td></tr>\n</table>\n{{#portalUrl}}<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Acceso directo al área de facturación: <a class=\"lnk\" href=\"{{portalUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{portalUrl}}</a></p>{{/portalUrl}}\n<p class=\"tx\" style=\"margin:0 0 20px;font-size:15px;line-height:24px;color:#1f2d3a;\">Si cancelas antes del {{renewalDate}}, no se hará este cobro. Conservas el acceso de pago hasta el final del periodo que ya pagaste. También puedes pedir la cancelación escribiendo a <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a>.</p>\n\n<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"border-collapse:separate;margin:0 0 26px;\">\n<tr><td align=\"center\" bgcolor=\"#0a6d8f\" style=\"background-color:#0a6d8f;border-radius:8px;\"><a href=\"{{accountUrl}}\" target=\"_blank\" style=\"display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;\">Ir a Mi cuenta</a></td></tr>\n</table>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Tus derechos</h2>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">Nada de este aviso limita los derechos que te otorga la Ley Federal de Protección al Consumidor, que son irrenunciables. Para cualquier aclaración o reclamación, escríbenos a <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a>.</p>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">También puedes acudir a la Procuraduría Federal del Consumidor (PROFECO): Teléfono del Consumidor 800 468 8722 (lada sin costo) o 55 5568 8722 (Ciudad de México y área metropolitana), <a class=\"lnk\" href=\"https://www.gob.mx/profeco\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">gob.mx/profeco</a>.</p>\n<p class=\"tx\" style=\"margin:0 0 26px;font-size:15px;line-height:24px;color:#1f2d3a;\">Términos y condiciones: <a class=\"lnk\" href=\"{{cgvUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{cgvUrl}}</a></p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">Datos del proveedor</h2>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 26px;\">\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Nombre comercial</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">IASHARK (empresario individual establecido en Francia)</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Titular</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyOperatorName}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Domicilio</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyAddress}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Número de registro (SIREN / SIRET, Francia)</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyRegistration}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Teléfono</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyPhone}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">Correo electrónico</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\"><a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a></td></tr>\n</table>\n\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0;\">\n<tr><td class=\"bg-warn\" style=\"padding:16px 18px;background-color:#fff8eb;border:1px solid #f0d49c;border-radius:8px;font-family:Arial,Helvetica,sans-serif;\">\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;font-weight:bold;color:#3a2a0c;\">Juego responsable · 18+</p>\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;color:#3a2a0c;\">IASHARK ofrece análisis estadísticos: no es una casa de apuestas, no recibe apuestas y no garantiza ganancias. Prohibido para menores de 18 años.</p>\n<p class=\"tx\" style=\"margin:0;font-size:14px;line-height:21px;color:#3a2a0c;\">Las apuestas pueden generar adicción. Orientación gratuita las 24 horas: {{helplineName}}, {{helplinePhone}} (<a class=\"lnk\" href=\"{{helplineUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{helplineDisplay}}</a>). Más información: <a class=\"lnk\" href=\"{{responsibleUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Juego responsable</a>.</p>\n</td></tr>\n</table>\n\n</td>\n</tr>\n<tr>\n<td class=\"tx-soft\" style=\"padding:18px 8px 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#5d6b79;\">\nAviso de renovación enviado automáticamente a {{customerEmail}} porque tienes una suscripción activa con cobro recurrente. Aclaraciones: <a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a>.<br>\n<a class=\"lnk\" href=\"{{cgvUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Términos</a> · <a class=\"lnk\" href=\"{{privacyUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Aviso de privacidad</a> · <a class=\"lnk\" href=\"{{legalUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">Aviso legal</a> · <a class=\"lnk\" href=\"{{homeUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">iashark.com</a>\n</td>\n</tr>\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>\n",
      "text": "Subject: Tu suscripción {{planName}} se renueva el {{renewalDate}}\n{{! Version de texto de renewal-reminder.mx.html: mismo contenido, sin omitir nada. }}IASHARK\n\nTu suscripción se renueva en {{daysUntilLabel}}\n===============================================\n\nHola:\n\nTe avisamos con anticipación que tu suscripción {{planName}} se renovará automáticamente el {{renewalDate}} y que ese día se hará el cargo a tu método de pago.\n\nDETALLE DEL PRÓXIMO COBRO\n- Plan: {{planName}}\n- Monto que se cobrará: {{amount}} (pesos mexicanos, impuestos aplicables incluidos)\n- Fecha del cobro: {{renewalDate}}\n- Periodicidad: {{periodicity}}\n- Cuenta: {{customerEmail}}\n{{#reference}}- Referencia: {{reference}}\n{{/reference}}\nSi quieres seguir usando {{planName}}, no tienes que hacer nada.\n\nCÓMO CANCELAR EN LÍNEA\n1. Entra a Mi cuenta con tu correo {{customerEmail}}: {{accountUrl}}\n2. Haz clic en «Gestionar mi suscripción». Se abre el área de facturación segura de nuestro proveedor de pagos (Stripe).\n3. Elige cancelar la suscripción. La cancelación es inmediata, sin costo y sin penalización.\n{{#portalUrl}}Acceso directo al área de facturación: {{portalUrl}}\n{{/portalUrl}}\nSi cancelas antes del {{renewalDate}}, no se hará este cobro. Conservas el acceso de pago hasta el final del periodo que ya pagaste. También puedes pedir la cancelación escribiendo a {{supportEmail}}.\n\nTUS DERECHOS\nNada de este aviso limita los derechos que te otorga la Ley Federal de Protección al Consumidor, que son irrenunciables. Para cualquier aclaración o reclamación, escríbenos a {{supportEmail}}.\nTambién puedes acudir a la Procuraduría Federal del Consumidor (PROFECO): Teléfono del Consumidor 800 468 8722 (lada sin costo) o 55 5568 8722 (Ciudad de México y área metropolitana), https://www.gob.mx/profeco\nTérminos y condiciones: {{cgvUrl}}\n\nDATOS DEL PROVEEDOR\n- Nombre comercial: IASHARK (empresario individual establecido en Francia)\n- Titular: {{companyOperatorName}}\n- Domicilio: {{companyAddress}}\n- Número de registro (SIREN / SIRET, Francia): {{companyRegistration}}\n- Teléfono: {{companyPhone}}\n- Correo electrónico: {{supportEmail}}\n\nJUEGO RESPONSABLE · 18+\nIASHARK ofrece análisis estadísticos: no es una casa de apuestas, no recibe apuestas y no garantiza ganancias. Prohibido para menores de 18 años.\nLas apuestas pueden generar adicción. Orientación gratuita las 24 horas: {{helplineName}}, {{helplinePhone}} ({{helplineUrl}}). Más información: {{responsibleUrl}}\n\n--\nAviso de renovación enviado automáticamente a {{customerEmail}} porque tienes una suscripción activa con cobro recurrente. Aclaraciones: {{supportEmail}}.\nTérminos: {{cgvUrl}}\nAviso de privacidad: {{privacyUrl}}\nAviso legal: {{legalUrl}}\n"
    }
  },
  "annual_renewal_reminder": {
    "all": {
      "html": "{{! Rappel avant reconduction d'un abonnement Pro ANNUEL - gabarit commun (repertoires fr, en, es, de, it, pt, gb, mx) ; textes par langue dans lib/email-render.js (ANNUAL_REMINDER_COPY, 7 langues). FR : information L215-1 du Code de la consommation. STATUT : REVIEW. CSS en ligne ; le bloc <style> ne sert qu'au mode sombre et au mobile. }}<!DOCTYPE html>\n<html lang=\"{{htmlLang}}\" xmlns=\"http://www.w3.org/1999/xhtml\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"x-apple-disable-message-reformatting\">\n<meta name=\"format-detection\" content=\"telephone=no, date=no, address=no, email=no\">\n<meta name=\"color-scheme\" content=\"light dark\">\n<meta name=\"supported-color-schemes\" content=\"light dark\">\n<title>{{subject}}</title>\n<style>\n:root { color-scheme: light dark; supported-color-schemes: light dark; }\n@media (prefers-color-scheme: dark) {\n  .bg-page { background-color: #0b1118 !important; }\n  .bg-card { background-color: #131c27 !important; border-color: #263444 !important; }\n  .bg-soft { background-color: #18232f !important; border-color: #2f6f86 !important; }\n  .bg-warn { background-color: #2a2213 !important; border-color: #6b5320 !important; }\n  .tx { color: #e9eef4 !important; }\n  .tx-soft { color: #a9b6c4 !important; }\n  .bd { border-color: #263444 !important; }\n  .lnk { color: #62d6ec !important; }\n}\n[data-ogsc] .bg-page { background-color: #0b1118 !important; }\n[data-ogsc] .bg-card { background-color: #131c27 !important; }\n[data-ogsc] .bg-soft { background-color: #18232f !important; }\n[data-ogsc] .bg-warn { background-color: #2a2213 !important; }\n[data-ogsc] .tx { color: #e9eef4 !important; }\n[data-ogsc] .tx-soft { color: #a9b6c4 !important; }\n[data-ogsc] .lnk { color: #62d6ec !important; }\n@media only screen and (max-width: 620px) {\n  .container { width: 100% !important; }\n  .pad { padding: 20px !important; }\n}\n</style>\n</head>\n<body class=\"bg-page\" style=\"margin:0;padding:0;background-color:#f2f4f7;-webkit-text-size-adjust:100%;\">\n<div style=\"display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f2f4f7;\">{{tPreheader}}</div>\n<table role=\"presentation\" class=\"bg-page\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;background-color:#f2f4f7;border-collapse:collapse;\">\n<tr>\n<td align=\"center\" style=\"padding:24px 12px;\">\n<table role=\"presentation\" class=\"container\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:600px;max-width:600px;border-collapse:collapse;\">\n<tr>\n<td class=\"tx\" style=\"padding:4px 4px 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;font-weight:bold;letter-spacing:3px;color:#0b1a2a;\">IASHARK</td>\n</tr>\n<tr>\n<td class=\"bg-card pad\" style=\"padding:32px;background-color:#ffffff;border:1px solid #dfe4ea;border-radius:12px;font-family:Arial,Helvetica,sans-serif;\">\n\n<h1 class=\"tx\" style=\"margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:31px;font-weight:bold;color:#0b1a2a;\">{{tTitle}}</h1>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">{{tGreeting}}</p>\n<p class=\"tx\" style=\"margin:0 0 20px;font-size:15px;line-height:24px;color:#1f2d3a;\">{{tIntro}}</p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">{{tSummaryTitle}}</h2>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 18px;\">\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">{{tLabelPlan}}</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{planName}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">{{tLabelAmount}}</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{amount}} {{tAmountNote}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">{{tLabelDate}}</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{renewalDate}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">{{tLabelPeriod}}</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{tPeriodValue}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">{{tLabelAccount}}</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:15px;line-height:20px;font-weight:bold;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{customerEmail}}</td></tr>\n{{#reference}}<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:10px 12px 10px 0;font-size:14px;line-height:20px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">{{tLabelReference}}</th><td class=\"tx bd\" style=\"padding:10px 0;font-size:13px;line-height:20px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{reference}}</td></tr>{{/reference}}\n</table>\n<p class=\"tx\" style=\"margin:0 0 26px;font-size:15px;line-height:24px;color:#1f2d3a;\">{{tKeep}}</p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">{{tNotRenewTitle}}</h2>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 14px;\">\n<tr><td class=\"bg-soft\" style=\"padding:14px 16px;background-color:#f4f7fa;border-left:4px solid #0a6d8f;font-family:Arial,Helvetica,sans-serif;\">\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:15px;line-height:23px;color:#1f2d3a;\">{{tNotRenew}}</p>\n<p class=\"tx\" style=\"margin:0;font-size:15px;line-height:23px;color:#1f2d3a;\">{{tSwitchNote}}</p>\n</td></tr>\n</table>\n{{#portalUrl}}<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">{{tPortalLabel}} <a class=\"lnk\" href=\"{{portalUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{portalUrl}}</a></p>{{/portalUrl}}\n<table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"border-collapse:separate;margin:6px 0 26px;\">\n<tr><td align=\"center\" bgcolor=\"#0a6d8f\" style=\"background-color:#0a6d8f;border-radius:8px;\"><a href=\"{{accountUrl}}\" target=\"_blank\" style=\"display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;\">{{tCtaLabel}}</a></td></tr>\n</table>\n\n{{#tLegalBasis}}<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">{{tLegalBasis}}</p>{{/tLegalBasis}}\n<p class=\"tx\" style=\"margin:0 0 26px;font-size:15px;line-height:24px;color:#1f2d3a;\">{{tTermsLabel}} <a class=\"lnk\" href=\"{{cgvUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{cgvUrl}}</a></p>\n\n<h2 class=\"tx\" style=\"margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;color:#0b1a2a;\">{{tSellerTitle}}</h2>\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0 0 26px;\">\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">{{tLabelTradingName}}</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">IASHARK</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">{{tLabelOperator}}</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyOperatorName}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">{{tLabelAddress}}</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyAddress}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">{{tLabelRegistration}}</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyRegistration}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">{{tLabelPhone}}</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\">{{companyPhone}}</td></tr>\n<tr><th scope=\"row\" class=\"tx-soft bd\" style=\"text-align:left;vertical-align:top;width:44%;padding:8px 12px 8px 0;font-size:13px;line-height:19px;font-weight:normal;color:#4b5a69;border-bottom:1px solid #e6eaef;\">{{tLabelEmail}}</th><td class=\"tx bd\" style=\"padding:8px 0;font-size:14px;line-height:19px;color:#0b1a2a;border-bottom:1px solid #e6eaef;\"><a class=\"lnk\" href=\"mailto:{{supportEmail}}\" style=\"color:#0a6d8f;text-decoration:underline;\">{{supportEmail}}</a></td></tr>\n</table>\n\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0;\">\n<tr><td class=\"bg-warn\" style=\"padding:16px 18px;background-color:#fff8eb;border:1px solid #f0d49c;border-radius:8px;font-family:Arial,Helvetica,sans-serif;\">\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;font-weight:bold;color:#3a2a0c;\">{{tRgTitle}}</p>\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;color:#3a2a0c;\">{{tRgBody}}</p>\n<p class=\"tx\" style=\"margin:0;font-size:14px;line-height:21px;color:#3a2a0c;\">{{tRgHelp}} <a class=\"lnk\" href=\"{{helplineUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{helplineDisplay}}</a> · <a class=\"lnk\" href=\"{{responsibleUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{tRgMore}}</a></p>\n</td></tr>\n</table>\n\n</td>\n</tr>\n<tr>\n<td class=\"tx-soft\" style=\"padding:18px 8px 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#5d6b79;\">\n{{tFooter}}<br>\n<a class=\"lnk\" href=\"{{cgvUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{tLinkCgv}}</a> · <a class=\"lnk\" href=\"{{privacyUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{tLinkPrivacy}}</a> · <a class=\"lnk\" href=\"{{legalUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{tLinkLegal}}</a> · <a class=\"lnk\" href=\"{{homeUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">iashark.com</a>\n</td>\n</tr>\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>\n",
      "text": "Subject: {{tSubject}}\n{{! Rappel avant reconduction d'un abonnement Pro ANNUEL - gabarit commun aux repertoires fr, en, es, de, it, pt (marche EUR), gb et mx ; textes par langue dans lib/email-render.js (ANNUAL_REMINDER_COPY, 7 langues). FR : information L215-1 (entre 3 mois et 1 mois avant l'echeance). STATUT : REVIEW (juriste + relecture native). Montant lu dans l'apercu de facture Stripe, jamais estime. Version texte de annual-renewal-reminder.html : meme contenu. }}IASHARK\n\n{{tTitle}}\n\n{{tGreeting}}\n\n{{tIntro}}\n\n{{tSummaryTitle}}\n- {{tLabelPlan}}{{sep}}{{planName}}\n- {{tLabelAmount}}{{sep}}{{amount}} {{tAmountNote}}\n- {{tLabelDate}}{{sep}}{{renewalDate}}\n- {{tLabelPeriod}}{{sep}}{{tPeriodValue}}\n- {{tLabelAccount}}{{sep}}{{customerEmail}}\n{{#reference}}- {{tLabelReference}}{{sep}}{{reference}}\n{{/reference}}\n{{tKeep}}\n\n{{tNotRenewTitle}}\n{{tNotRenew}}\n{{tCtaLabel}}{{sep}}{{accountUrl}}\n{{#portalUrl}}{{tPortalLabel}} {{portalUrl}}\n{{/portalUrl}}\n{{tSwitchNote}}\n{{#tLegalBasis}}\n{{tLegalBasis}}\n{{/tLegalBasis}}\n{{tTermsLabel}} {{cgvUrl}}\n\n{{tSellerTitle}}\n- {{tLabelTradingName}}{{sep}}IASHARK\n- {{tLabelOperator}}{{sep}}{{companyOperatorName}}\n- {{tLabelAddress}}{{sep}}{{companyAddress}}\n- {{tLabelRegistration}}{{sep}}{{companyRegistration}}\n- {{tLabelPhone}}{{sep}}{{companyPhone}}\n- {{tLabelEmail}}{{sep}}{{supportEmail}}\n\n{{tRgTitle}}\n{{tRgBody}}\n{{tRgHelp}} {{helplineUrl}}\n{{tRgMore}}{{sep}}{{responsibleUrl}}\n\n--\n{{tFooter}}\n{{tLinkCgv}}{{sep}}{{cgvUrl}}\n{{tLinkPrivacy}}{{sep}}{{privacyUrl}}\n{{tLinkLegal}}{{sep}}{{legalUrl}}\n"
    }
  }
};
export function renderEmail(kind, market, data, options) {
  return api.renderEmail(TEMPLATES, kind, market, data, options);
}
export const {
  SITE_URL,
  SUPPORT_EMAIL,
  MARKETS,
  TEMPLATE_KINDS,
  ANNUAL_KIND,
  REMINDER_DIRS,
  ANNUAL_REMINDER_DAYS,
  COMPANY_FIELDS,
  DEFAULT_REMINDER_DAYS,
  MIN_RECOMMENDED_REMINDER_DAYS,
  EmailRenderError,
  escapeHtml,
  isValidEmail,
  maskEmail,
  formatMoney,
  companyFromEnv,
  purchaseConfirmationFromStripe,
  renewalReminderSkipReason,
  renewalReminderFromStripe,
  reminderKindFor,
  reminderDirFor,
  annualRenewalReminderFromStripe,
  parseReminderDays,
  renewalWindow,
  localDateKey,
  cleanIdempotencyKey,
  safeEqual
} = api;
export default api;
