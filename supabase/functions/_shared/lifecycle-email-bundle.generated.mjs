// FICHIER GENERE par `node lib/lifecycle-email-build.js` - NE PAS MODIFIER A LA MAIN.
// Sources : lib/email-render.js, lib/lifecycle-email.js, emails/lifecycle/*, config/markets.json
// Verifie par tests/email-lifecycle.test.js (doit rester identique a la regeneration).
/* eslint-disable */
// deno-lint-ignore-file
const Render = (function () {
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
      helpline: { name: "National Gambling Helpline", phone: "0808 8020 133", url: "https://www.begambleaware.org", display: "BeGambleAware.org" }
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
  // Repertoires : miroir de config/markets.json#_dirs et _helplines
  // (tests/email-templates.test.js fait echouer toute derive).
  var ANNUAL_KIND = "annual_renewal_reminder";
  var INTERNATIONAL_HELPLINE = { name: "Gambling Therapy", phone: null, url: "https://www.gamblingtherapy.org", display: "gamblingtherapy.org" };
  var REMINDER_DIRS = {
    fr: { market: "fr", locale: "fr", htmlLang: "fr", intlLocale: "fr-FR" },
    en: { market: "fr", locale: "en", htmlLang: "en", intlLocale: "en-GB", helpline: INTERNATIONAL_HELPLINE },
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

return module.exports;
})();
const Lifecycle = (function () {
const module = { exports: {} };
const require = function () { return Render; };
/* IASHARK — emails de relance / cycle de vie (module PUR : aucun acces reseau,
   fichier, variable d'environnement ; l'horloge est toujours passee en
   argument). Seule dependance : lib/email-render.js (moteur de gabarit,
   echappement, identite vendeur BLOCKED_DECISION).

   Consommateurs :
   - tests/email-lifecycle*.test.js (node --test, require) ;
   - supabase/functions/send-lifecycle-emails et email-unsubscribe via le
     module genere supabase/functions/_shared/lifecycle-email-bundle.generated.mjs
     (node lib/lifecycle-email-build.js).

   Sources :
   - gabarit commun emails/lifecycle/layout.html|.txt (meme charte que
     emails/templates/*) ;
   - textes par langue emails/lifecycle/copy.<locale>.json (STATUT : REVIEW) ;
   - pays/devise/prix/aide jeu responsable : config/markets.json (passe en
     argument, jamais recopie ici).

   Regles de selection : miroir EXACT de public.lifecycle_email_candidates
   (supabase/migrations/0024_email_preferences.sql). La fonction Edge n'envoie
   que si les deux sont d'accord. */
(function (root, factory) {
  "use strict";
  var render = (typeof module === "object" && module && module.exports && typeof require === "function")
    ? require("./email-render.js")
    : root.IasharkEmail;
  var api = factory(render);
  if (typeof module === "object" && module && module.exports) module.exports = api;
  else root.IasharkLifecycleEmail = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (R) {
  "use strict";

  var SITE_URL = R.SITE_URL;
  var DAY = 86400000;
  var hasOwn = Object.prototype.hasOwnProperty;

  var LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
  var DIRS = ["fr", "en", "es", "de", "it", "pt", "gb", "za", "mx"];

  // Fuseau de reference de chaque marche (heure locale du marche : jamais
  // d'email marketing la nuit). Les repertoires de langue en/es/de/it/pt
  // relevent du marche fr (config/markets.json#_dirs), /en/ du marche "us"
  // (offre USD) une fois config/markets.json#_usdSwitch applique : /en/ reste
  // la version internationale, meme fuseau qu'avant la bascule et que la
  // fenetre d'envoi SQL (migration 0024 : repertoire en -> Europe/Paris).
  var MARKET_TIMEZONES = { fr: "Europe/Paris", gb: "Europe/London", za: "Africa/Johannesburg", mx: "America/Mexico_City", us: "Europe/Paris" };

  var CAMPAIGNS = {
    welcome: { marketing: false, needs: null },
    free_match: { marketing: true, needs: "free_match" },
    pro_features: { marketing: true, needs: "pro_price" },
    inactive_7d: { marketing: true, needs: "weekend_matches" },
    inactive_30d: { marketing: true, needs: null },
    pro_weekly_summary: { marketing: true, needs: "weekend_matches" }
  };

  var RULES = {
    welcomeWindowDays: 3,
    quietStartHour: 21,          // marketing autorise de 09:00 a 20:59 locales
    quietEndHour: 9,
    minDaysBetweenMarketing: 3,  // 1 email marketing / 3 jours par personne
    stopAfterInactiveDays: 60,   // plus rien sans visite, ouverture ni clic
    freeMatchFromDays: 2, freeMatchUntilDays: 14,
    proFeaturesFromDays: 5, proFeaturesUntilDays: 21,
    inactive7Days: 7, inactive30Days: 30,
    weekendDows: [4, 5, 6]       // jeudi, vendredi, samedi (ISO)
  };

  var TOKEN_VERSION = "v1";
  var TOKEN_TTL_DAYS = 400;
  var MIN_SECRET_LENGTH = 32;

  // Pages absentes du depot pour certains repertoires (lien de repli vers la
  // version anglaise). tests/email-lifecycle.test.js verifie cette liste
  // contre les fichiers reels : ajouter la page oblige a mettre a jour ici.
  // 19/09/2026 : /de/ /it/ /pt/methodologie.html existent, plus aucun repli.
  var METHODOLOGY_MISSING_DIRS = [];

  // Vocabulaire interdit (aucune promesse de gain) par langue : sur, gagnant,
  // garanti, bonus et leurs equivalents.
  var FORBIDDEN_TERMS = {
    fr: ["sûr", "sûre", "sûrs", "sûres", "gagnant", "gagnante", "gagnants", "gagnantes", "garanti", "garantie", "garantis", "garanties", "garantir", "bonus"],
    en: ["sure", "surely", "winner", "winners", "winning", "guaranteed", "guarantee", "guarantees", "bonus"],
    es: ["seguro", "segura", "seguros", "seguras", "ganador", "ganadora", "ganadores", "garantizado", "garantizada", "garantizados", "garantía", "garantiza", "bono", "bonus"],
    de: ["sicher", "sichere", "sicheren", "sicherer", "gewinner", "garantiert", "garantie", "bonus"],
    it: ["sicuro", "sicura", "sicuri", "sicure", "vincente", "vincenti", "garantito", "garantita", "garantiti", "garanzia", "bonus"],
    pt: ["seguro", "segura", "seguros", "seguras", "vencedor", "vencedora", "garantido", "garantida", "garantia", "bónus", "bônus", "bonus"]
  };
  FORBIDDEN_TERMS["es-mx"] = FORBIDDEN_TERMS.es;

  var fail = function (code, message) { throw new R.EmailRenderError(code, message); };
  var pad = function (n) { return (n < 10 ? "0" : "") + n; };
  var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  function toDate(v) {
    if (v == null || v === "") return null;
    var d = v instanceof Date ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  // ------------------------------------------------------------- marches

  function siteContext(marketsConfig, dir) {
    var dirs = marketsConfig && marketsConfig._dirs;
    if (!dirs || !hasOwn.call(dirs, dir) || DIRS.indexOf(dir) === -1) fail("unknown_dir", "Repertoire de site inconnu : " + dir);
    var d = dirs[dir];
    var m = marketsConfig[d.market];
    if (!m) fail("unknown_market", "Marche inconnu : " + d.market);
    var helpline = d.helpline ? (marketsConfig._helplines || {})[d.helpline] : m.helpline;
    if (!helpline || !helpline.name || !helpline.url) fail("helpline_missing", "Aide jeu responsable absente pour " + dir);
    // Offre Pro unique vendue par duree : prices.pro.<week|month|year>.amount
    // (forme historique {amount, interval:"month"} acceptee). Duree absente ou
    // null = non vendue dans ce marche (ZA : pas d'annuel au lancement) : jamais
    // inventee, jamais affichee.
    var proMinor = function (iv) {
      var pro = m.prices && m.prices.pro;
      if (!pro) return null;
      var e = typeof pro.amount === "number" ? (iv === (pro.interval || "month") ? pro : null) : pro[iv];
      return e && typeof e.amount === "number" && isFinite(e.amount) && e.amount > 0 ? Math.round(e.amount * 100) : null;
    };
    return {
      dir: dir,
      locale: d.locale,
      htmlLang: d.htmlLang,
      intlLocale: d.intlLocale,
      // Prix : locale propre au marche (USD de /en/ : en-US, "$19.99"), sinon celle du repertoire.
      priceIntlLocale: m.priceIntlLocale || d.intlLocale,
      label: d.label,
      market: d.market,
      currency: m.currency,
      timeZone: MARKET_TIMEZONES[d.market] || fail("timezone_missing", "Fuseau absent pour " + d.market),
      helpline: { name: helpline.name, phone: helpline.phone || null, url: helpline.url, display: helpline.display || helpline.url },
      proPriceMinor: proMinor("month"),
      proPricesMinor: { week: proMinor("week"), month: proMinor("month"), year: proMinor("year") }
    };
  }

  // ------------------------------------------------------------- horloge

  var DOW = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

  function localClock(date, timeZone) {
    var d = toDate(date) || fail("invalid_date", "date invalide");
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone, hourCycle: "h23", weekday: "short", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit"
    }).formatToParts(d);
    var o = {};
    parts.forEach(function (p) { o[p.type] = p.value; });
    var y = Number(o.year), mo = Number(o.month), da = Number(o.day), dow = DOW[o.weekday];
    // Semaine ISO (meme format que to_char(..., 'IYYY-"W"IW') de Postgres).
    var dayUtc = Date.UTC(y, mo - 1, da);
    var thursday = dayUtc + (4 - dow) * DAY;
    var isoYear = new Date(thursday).getUTCFullYear();
    var week = 1 + Math.floor((thursday - Date.UTC(isoYear, 0, 1)) / DAY / 7);
    return { date: y + "-" + pad(mo) + "-" + pad(da), hour: Number(o.hour) % 24, minute: Number(o.minute), isoDow: dow, isoWeek: isoYear + "-W" + pad(week) };
  }

  function addDays(ymd, n) {
    var p = ymd.split("-").map(Number);
    var t = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1) + "-" + pad(t.getUTCDate());
  }

  function offsetAt(ms, timeZone) {
    var o = {};
    new Intl.DateTimeFormat("en-US", { timeZone: timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return Date.UTC(Number(o.year), Number(o.month) - 1, Number(o.day), Number(o.hour) % 24, Number(o.minute), Number(o.second)) - Math.floor(ms / 1000) * 1000;
  }

  // "2026-09-16 21:30" (heure de Paris, format du pipeline) -> Date.
  function parisDate(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(String(str || ""));
    if (!m) return null;
    var guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    var first = guess - offsetAt(guess, "Europe/Paris");
    return new Date(guess - offsetAt(first, "Europe/Paris"));
  }

  // ------------------------------------------------- selection des envois

  function daysBetween(a, b) { return (a.getTime() - b.getTime()) / DAY; }

  function maxDate() {
    var best = null;
    for (var i = 0; i < arguments.length; i++) {
      var d = toDate(arguments[i]);
      if (d && (!best || d.getTime() > best.getTime())) best = d;
    }
    return best;
  }

  // Ligne SQL (lifecycle_email_candidates) -> faits.
  function factsFromRow(row) {
    row = row || {};
    return {
      userId: row.user_id,
      market: row.market || "fr",
      plan: row.plan || "free",
      role: row.role || "customer",
      marketingOptIn: row.marketing_opt_in === true,
      notifyWeeklyRecap: row.notify_weekly_recap !== false,
      hasSubscription: row.has_subscription === true,
      suppressed: row.suppressed === true,
      createdAt: row.created_at,
      lastSignInAt: row.last_sign_in_at || null,
      lastFunnelAt: row.last_funnel_at || null,
      lastEngagementAt: row.last_engagement_at || null,
      lastMarketingSentAt: row.last_marketing_sent_at || null,
      sentKeys: Array.isArray(row.sent_keys) ? row.sent_keys.slice() : []
    };
  }

  function decideCampaign(facts, now) {
    var n = toDate(now) || fail("invalid_now", "now obligatoire");
    var created = toDate(facts && facts.createdAt);
    if (!created) return { campaign: null, key: "", reason: "invalid_facts" };
    var sent = facts.sentKeys || [];
    var has = function (k) { return sent.indexOf(k) !== -1; };
    var out = function (campaign, key, reason) { return { campaign: campaign, key: key || "", reason: reason || null }; };

    if (facts.suppressed) return out(null, "", "suppressed");
    var age = daysBetween(n, created);
    if (age <= RULES.welcomeWindowDays && !has("welcome:")) return out("welcome", "");
    if (!facts.marketingOptIn) return out(null, "", "not_opted_in");

    var tz = MARKET_TIMEZONES[facts.market] || MARKET_TIMEZONES.fr;
    var clock = localClock(n, tz);
    if (clock.hour < RULES.quietEndHour || clock.hour >= RULES.quietStartHour) return out(null, "", "quiet_hours");
    var lastSent = toDate(facts.lastMarketingSentAt);
    if (lastSent && daysBetween(n, lastSent) < RULES.minDaysBetweenMarketing) return out(null, "", "frequency_cap");

    var activity = maxDate(created, facts.lastSignInAt, facts.lastFunnelAt);
    var engagement = maxDate(activity, facts.lastEngagementAt);
    if (daysBetween(n, engagement) > RULES.stopAfterInactiveDays) return out(null, "", "stopped_inactive_60d");

    var noSales = facts.plan === "pro" || facts.hasSubscription === true || facts.role === "admin";
    if (noSales) {
      if (facts.notifyWeeklyRecap && RULES.weekendDows.indexOf(clock.isoDow) !== -1 && !has("pro_weekly_summary:" + clock.isoWeek)) {
        return out("pro_weekly_summary", clock.isoWeek);
      }
      return out(null, "", "nothing_due");
    }
    if (age >= RULES.freeMatchFromDays && age < RULES.freeMatchUntilDays && !has("free_match:")) return out("free_match", "");
    if (age >= RULES.proFeaturesFromDays && age < RULES.proFeaturesUntilDays && !has("pro_features:")) return out("pro_features", "");
    var inactive = daysBetween(n, activity);
    var episode = activity.toISOString().slice(0, 10);
    if (inactive >= RULES.inactive30Days && inactive < RULES.stopAfterInactiveDays && !has("inactive_30d:" + episode)) return out("inactive_30d", episode);
    if (inactive >= RULES.inactive7Days && inactive < RULES.inactive30Days && RULES.weekendDows.indexOf(clock.isoDow) !== -1 && !has("inactive_7d:" + episode)) {
      return out("inactive_7d", episode);
    }
    return out(null, "", "nothing_due");
  }

  // --------------------------------------------- matchs publics (data-home)

  // Liste blanche : seuls noms, competition, horaire et lien sortent du
  // fichier public. Jamais une cote, une probabilite ni un marche.
  function publicMatch(m, ctx) {
    if (!m || typeof m !== "object") return null;
    var id = Number(m.id);
    var home = m.home && typeof m.home.n === "string" ? m.home.n.trim() : "";
    var away = m.away && typeof m.away.n === "string" ? m.away.n.trim() : "";
    var kickoff = parisDate(m.date);
    if (!isFinite(id) || id <= 0 || Math.floor(id) !== id || !home || !away || home.length > 80 || away.length > 80 || !kickoff) return null;
    var league = typeof m.league === "string" && m.league.trim() && m.league.length <= 80 ? m.league.trim() : "";
    return {
      id: id,
      home: home,
      away: away,
      league: league,
      kickoffAt: kickoff.toISOString(),
      kickoff: new Intl.DateTimeFormat(ctx.intlLocale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: ctx.timeZone, timeZoneName: "short" }).format(kickoff),
      url: SITE_URL + "/" + ctx.dir + "/match.html?id=" + id
    };
  }

  function isFootball(m) { return !m.sport || m.sport === "football"; }

  // Analyse offerte designee par le pipeline (is_free), pas encore commencee.
  // Marches pays (mx, za) : designation du marche prioritaire, comme
  // lib/free-match.js. Aucun match designe = null (jamais invente).
  function pickFreeMatch(list, now, ctx) {
    var n = toDate(now);
    if (!Array.isArray(list) || !n) return null;
    var upcoming = list.filter(function (m) {
      var k = m && m.is_free === true && isFootball(m) ? parisDate(m.date) : null;
      return k && k.getTime() > n.getTime();
    }).sort(function (a, b) { return parisDate(a.date) - parisDate(b.date); });
    var country = upcoming.filter(function (m) { return Array.isArray(m.free_markets) && m.free_markets.indexOf(ctx.market) !== -1; });
    var general = upcoming.filter(function (m) { return !Array.isArray(m.free_markets) || m.free_markets.indexOf("default") !== -1; });
    var pick = (ctx.market !== "fr" && country[0]) || general[0] || null;
    return pick ? publicMatch(pick, ctx) : null;
  }

  // Matchs du prochain week-end (samedi et dimanche, heure locale du marche).
  function weekendMatches(list, now, ctx, max) {
    var n = toDate(now);
    if (!Array.isArray(list) || !n) return [];
    var clock = localClock(n, ctx.timeZone);
    var sat = clock.isoDow === 7 ? addDays(clock.date, -1) : addDays(clock.date, 6 - clock.isoDow);
    var days = [sat, addDays(sat, 1)];
    return list.filter(function (m) {
      var k = m && isFootball(m) ? parisDate(m.date) : null;
      return k && k.getTime() > n.getTime() && days.indexOf(localClock(k, ctx.timeZone).date) !== -1;
    }).sort(function (a, b) { return parisDate(a.date) - parisDate(b.date); })
      .map(function (m) { return publicMatch(m, ctx); })
      .filter(Boolean)
      .slice(0, max || 8);
  }

  // ------------------------------------------------------------ desinscription

  function bytesToB64url(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlToString(str) {
    if (!/^[A-Za-z0-9_-]+$/.test(str)) return null;
    try {
      var bin = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4));
      var bytes = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder().decode(bytes);
    } catch (_e) { return null; }
  }

  function subtle() {
    var c = typeof globalThis !== "undefined" ? globalThis.crypto : null;
    if (!c || !c.subtle) fail("crypto_unavailable", "WebCrypto indisponible");
    return c.subtle;
  }

  function hmac(secret, data) {
    var enc = new TextEncoder();
    return subtle().importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
      .then(function (key) { return subtle().sign("HMAC", key, enc.encode(data)); })
      .then(function (sig) { return bytesToB64url(new Uint8Array(sig)); });
  }

  function validSecret(secret) { return typeof secret === "string" && secret.length >= MIN_SECRET_LENGTH; }

  // Jeton = v1.<charge utile base64url>.<HMAC-SHA256 base64url>.
  // Charge utile : { u: user_id, d: repertoire, e: expiration (s) }. Aucun email.
  function createUnsubscribeToken(input, secret, now, ttlDays) {
    return Promise.resolve().then(function () {
      if (!validSecret(secret)) fail("secret_missing", "EMAIL_UNSUBSCRIBE_SECRET absent ou trop court (" + MIN_SECRET_LENGTH + " caracteres minimum)");
      var n = toDate(now) || fail("invalid_now", "now obligatoire");
      if (!input || !UUID_RE.test(String(input.userId))) fail("invalid_user", "userId invalide");
      if (DIRS.indexOf(input.dir) === -1) fail("unknown_dir", "Repertoire inconnu");
      var ttl = ttlDays == null ? TOKEN_TTL_DAYS : ttlDays;
      var payload = JSON.stringify({ u: String(input.userId).toLowerCase(), d: input.dir, e: Math.floor(n.getTime() / 1000) + Math.round(ttl * 86400) });
      var body = TOKEN_VERSION + "." + bytesToB64url(new TextEncoder().encode(payload));
      return hmac(secret, body).then(function (sig) { return body + "." + sig; });
    });
  }

  function verifyUnsubscribeToken(token, secret, now) {
    return Promise.resolve().then(function () {
      if (!validSecret(secret)) return { ok: false, reason: "secret_missing" };
      var n = toDate(now);
      if (!n) return { ok: false, reason: "invalid_now" };
      var parts = typeof token === "string" && token.length <= 512 ? token.split(".") : [];
      if (parts.length !== 3 || parts[0] !== TOKEN_VERSION || !parts[1] || !parts[2]) return { ok: false, reason: "malformed" };
      return hmac(secret, parts[0] + "." + parts[1]).then(function (expected) {
        if (!R.safeEqual(expected, parts[2])) return { ok: false, reason: "bad_signature" };
        var json = b64urlToString(parts[1]);
        var p = null;
        try { p = JSON.parse(json); } catch (_e) { p = null; }
        if (!p || !UUID_RE.test(String(p.u)) || DIRS.indexOf(p.d) === -1 || typeof p.e !== "number") return { ok: false, reason: "invalid_payload" };
        if (p.e * 1000 <= n.getTime()) return { ok: false, reason: "expired", dir: p.d };
        return { ok: true, userId: p.u, dir: p.d, expiresAt: new Date(p.e * 1000).toISOString() };
      });
    });
  }

  function unsubscribeLinks(token, dir, functionsBaseUrl) {
    if (DIRS.indexOf(dir) === -1) fail("unknown_dir", "Repertoire inconnu");
    if (typeof functionsBaseUrl !== "string" || !/^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(functionsBaseUrl)) fail("invalid_base_url", "URL Supabase invalide");
    var t = encodeURIComponent(token);
    return {
      // Fragment (#t=) : le jeton ne part ni dans les journaux Netlify ni dans
      // un en-tete Referer ; la page le lit en JS et le POSTe.
      page: SITE_URL + "/" + dir + "/desinscription-email.html#t=" + t,
      oneClick: functionsBaseUrl.replace(/\/$/, "") + "/functions/v1/email-unsubscribe?t=" + t
    };
  }

  // RFC 2369 + RFC 8058 (desinscription en un clic, exigee par Gmail/Yahoo).
  function listUnsubscribeHeaders(oneClickUrl) {
    return { "List-Unsubscribe": "<" + oneClickUrl + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
  }

  // ---------------------------------------------------------------- rendu

  function strip(str) { return String(str).normalize("NFC").toLowerCase(); }

  function findForbiddenWords(text, locale) {
    var lists = [FORBIDDEN_TERMS[locale] || [], FORBIDDEN_TERMS.fr, FORBIDDEN_TERMS.en].reduce(function (a, b) { return a.concat(b); }, []);
    var words = strip(text).split(/[^\p{L}\p{N}]+/u);
    var found = [];
    words.forEach(function (w) { if (w && lists.indexOf(w) !== -1 && found.indexOf(w) === -1) found.push(w); });
    return found;
  }

  function listBlocked(str) {
    var out = [];
    String(str).replace(/\[BLOCKED_DECISION: ([A-Z_]+)\]/g, function (m, k) { if (out.indexOf(k) === -1) out.push(k); return m; });
    return out;
  }

  function linkMap(ctx, data) {
    var page = function (p) { return SITE_URL + "/" + ctx.dir + "/" + p; };
    return {
      home: SITE_URL + "/" + ctx.dir + "/",
      account: page("compte.html"),
      notifications: page("compte.html#notifications"),
      methodology: METHODOLOGY_MISSING_DIRS.indexOf(ctx.dir) !== -1 ? SITE_URL + "/en/methodologie.html" : page("methodologie.html"),
      pricing: page("abonnement.html"),
      tools: page("pro.html"),
      responsible: page("jeu-responsable.html"),
      privacy: page("confidentialite.html"),
      legal: page("mentions-legales.html"),
      freeMatch: data.freeMatch ? data.freeMatch.url : null
    };
  }

  function text(str, view) { return R.renderTemplate(str, view, false).replace(/\s+/g, " ").trim(); }

  var S = {
    p: "margin:0 0 16px;font-size:15px;line-height:24px;color:#1f2d3a;",
    lnk: "color:#0a6d8f;text-decoration:underline;"
  };

  function renderBlocks(blocks, view, links, data, common) {
    var html = [], txt = [];
    (blocks || []).forEach(function (b) {
      if (b.if && !view[b.if]) return;
      if (b.type === "p") {
        var t = text(b.text, view);
        html.push('<p class="tx" style="' + S.p + '">' + R.escapeHtml(t) + "</p>");
        txt.push(t);
      } else if (b.type === "list") {
        var items = b.items.map(function (it) { return text(it, view); });
        html.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 18px;">'
          + items.map(function (it, i) {
            return '<tr><td class="tx" style="width:26px;vertical-align:top;padding:4px 0;font-size:15px;line-height:23px;font-weight:bold;color:#0a6d8f;">' + (b.ordered ? (i + 1) + "." : "✓") + '</td><td class="tx" style="padding:4px 0;font-size:15px;line-height:23px;color:#1f2d3a;">' + R.escapeHtml(it) + "</td></tr>";
          }).join("") + "</table>");
        txt.push(items.map(function (it, i) { return (b.ordered ? (i + 1) + ". " : "- ") + it; }).join("\n"));
      } else if (b.type === "match" || b.type === "matches") {
        var list = b.type === "match" ? (data.freeMatch ? [data.freeMatch] : []) : (data.weekendMatches || []);
        if (!list.length) fail("missing_match_data", "Bloc " + b.type + " sans donnees");
        html.push('<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;margin:0 0 20px;">'
          + list.map(function (m) {
            return '<tr><td class="bg-soft" style="padding:12px 16px;background-color:#f4f7fa;border-left:4px solid #0a6d8f;border-bottom:6px solid transparent;font-family:Arial,Helvetica,sans-serif;">'
              + '<p class="tx" style="margin:0 0 4px;font-size:16px;line-height:22px;font-weight:bold;color:#0b1a2a;">' + R.escapeHtml(m.home) + " – " + R.escapeHtml(m.away) + "</p>"
              + '<p class="tx-soft" style="margin:0 0 6px;font-size:13px;line-height:19px;color:#4b5a69;">' + (m.league ? R.escapeHtml(m.league) + " · " : "") + R.escapeHtml(common.kickoff_label + common.colon + m.kickoff) + "</p>"
              + '<a class="lnk" href="' + R.escapeHtml(m.url) + '" target="_blank" style="font-size:14px;line-height:20px;' + S.lnk + '">' + R.escapeHtml(common.match_link) + "</a>"
              + "</td></tr>";
          }).join("") + "</table>");
        txt.push(list.map(function (m) {
          return "* " + m.home + " – " + m.away + "\n  " + (m.league ? m.league + " · " : "") + common.kickoff_label + common.colon + m.kickoff + "\n  " + m.url;
        }).join("\n"));
      } else if (b.type === "cta" || b.type === "link") {
        var url = links[b.link];
        if (!url) fail("unknown_link", "Lien inconnu : " + b.link);
        var label = text(b.label, view);
        if (b.type === "cta") {
          html.push('<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:4px 0 22px;"><tr><td align="center" bgcolor="#0a6d8f" style="background-color:#0a6d8f;border-radius:8px;"><a href="' + R.escapeHtml(url) + '" target="_blank" style="display:inline-block;padding:13px 24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">' + R.escapeHtml(label) + "</a></td></tr></table>");
        } else {
          html.push('<p class="tx" style="' + S.p + '"><a class="lnk" href="' + R.escapeHtml(url) + '" target="_blank" style="' + S.lnk + '">' + R.escapeHtml(label) + "</a></p>");
        }
        txt.push(label + common.colon + url);
      } else {
        fail("unknown_block", "Bloc inconnu : " + b.type);
      }
    });
    return { html: html.join("\n"), text: txt.join("\n\n") };
  }

  var BLOCKS_MARKER = "<!--LIFECYCLE_BLOCKS-->";

  // bundle = { layout: {html, text}, copy: {<locale>: {...}}, markets: config/markets.json }
  // data   = { freeMatch, weekendMatches, marketingOptIn }
  // options = { company, unsubscribeUrl, now }
  function renderLifecycleEmail(bundle, campaign, dir, data, options) {
    options = options || {};
    data = data || {};
    if (!hasOwn.call(CAMPAIGNS, campaign)) fail("unknown_campaign", "Campagne inconnue : " + campaign);
    var ctx = siteContext(bundle && bundle.markets, dir);
    var copy = bundle.copy && bundle.copy[ctx.locale];
    if (!copy || !copy.campaigns || !copy.campaigns[campaign]) fail("copy_missing", "Textes absents : " + ctx.locale + "/" + campaign);
    var c = copy.campaigns[campaign], common = copy.common;
    var expectedUnsub = SITE_URL + "/" + dir + "/desinscription-email.html#t=";
    if (typeof options.unsubscribeUrl !== "string" || options.unsubscribeUrl.indexOf(expectedUnsub) !== 0 || options.unsubscribeUrl.length <= expectedUnsub.length) {
      fail("invalid_unsubscribe_url", "Lien de desinscription obligatoire (" + expectedUnsub + "...)");
    }
    var need = CAMPAIGNS[campaign].needs;
    if (need === "free_match" && !data.freeMatch) fail("missing_free_match", "Aucun match offert publie");
    if (need === "weekend_matches" && !(data.weekendMatches && data.weekendMatches.length)) fail("missing_weekend_matches", "Aucun match du week-end publie");
    // Prix Pro : le mensuel toujours ; textes prevus pour semaine + mois (+ an)
    // ou pour le mois seul (us : offre USD de /en/, config/markets.json
    // #_usdSwitch). Mois + an sans semaine : aucun texte, jamais un prix invente.
    var hasWeek = ctx.proPricesMinor.week != null, hasYear = ctx.proPricesMinor.year != null;
    if (need === "pro_price" && (ctx.proPriceMinor == null || (!hasWeek && hasYear))) fail("price_unavailable", "Prix Pro (mois, et semaine si l'annee est vendue) absent de config/markets.json pour " + ctx.market);

    var company = options.company || {};
    var view = {
      siteVersion: ctx.label,
      helplineName: ctx.helpline.name,
      helplinePhone: ctx.helpline.phone,
      helplineDisplay: ctx.helpline.display,
      hasHelplinePhone: !!ctx.helpline.phone,
      notOptedIn: data.marketingOptIn !== true,
      hasFreeMatch: !!data.freeMatch,
      // Email J5 « Ce que debloque Pro » : les durees vendues dans le marche.
      proPrice: ctx.proPriceMinor != null ? R.formatMoney(ctx.proPriceMinor, ctx.currency, ctx.priceIntlLocale) : null,
      proWeekPrice: ctx.proPricesMinor && ctx.proPricesMinor.week != null ? R.formatMoney(ctx.proPricesMinor.week, ctx.currency, ctx.priceIntlLocale) : null,
      proYearPrice: ctx.proPricesMinor && ctx.proPricesMinor.year != null ? R.formatMoney(ctx.proPricesMinor.year, ctx.currency, ctx.priceIntlLocale) : null,
      hasProYear: hasWeek && hasYear,
      hasNoProYear: hasWeek && !hasYear,
      hasOnlyProMonth: !hasWeek && !hasYear,
      freeMatchHome: data.freeMatch ? data.freeMatch.home : null,
      freeMatchAway: data.freeMatch ? data.freeMatch.away : null,
      companyOperatorName: typeof company.operatorName === "string" && company.operatorName.trim() ? company.operatorName.trim() : "[BLOCKED_DECISION: COMPANY_OPERATOR_NAME]",
      companyAddress: typeof company.address === "string" && company.address.trim() ? company.address.trim() : "[BLOCKED_DECISION: COMPANY_ADDRESS]"
    };
    var links = linkMap(ctx, data);
    var blocks = renderBlocks(c.blocks, view, links, data, common);
    var layoutView = {
      htmlLang: ctx.htmlLang,
      subject: text(c.subject, view),
      preheader: text(c.preheader, view),
      title: text(c.title, view),
      greeting: common.greeting,
      sep: common.colon,
      rgTitle: common.rg_title,
      rgBody: text(common.rg_body, view),
      rgHelp: text(view.hasHelplinePhone ? common.rg_help_phone : common.rg_help_nophone, view),
      rgMore: common.rg_more,
      helplineUrl: ctx.helpline.url,
      responsibleUrl: links.responsible,
      footerReason: text(CAMPAIGNS[campaign].marketing ? common.footer_reason_marketing : common.footer_reason_welcome, view),
      unsubscribeLabel: common.unsubscribe,
      unsubscribeUrl: options.unsubscribeUrl,
      manageLabel: common.manage,
      manageUrl: links.notifications,
      privacyLabel: common.privacy,
      privacyUrl: links.privacy,
      legalLabel: common.legal,
      legalUrl: links.legal,
      homeUrl: links.home,
      senderLabel: common.sender,
      companyOperatorName: view.companyOperatorName,
      companyAddress: view.companyAddress
    };
    var parts = /^Subject: ([^\r\n]+)\r?\n/.exec(bundle.layout.text);
    if (!parts) fail("template_invalid", "layout.txt doit commencer par Subject:");
    var html = R.renderTemplate(bundle.layout.html, layoutView, true);
    var txt = R.renderTemplate(bundle.layout.text.slice(parts[0].length), layoutView, false);
    if (html.split(BLOCKS_MARKER).length !== 2 || txt.split(BLOCKS_MARKER).length !== 2) fail("template_invalid", "Marqueur de blocs absent ou multiple");
    html = html.replace(BLOCKS_MARKER, function () { return blocks.html; });
    txt = txt.replace(BLOCKS_MARKER, function () { return blocks.text; })
      .replace(/[ \t]+\r?\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
    var subject = R.renderTemplate(parts[1], layoutView, false).replace(/\s+/g, " ").trim();
    return {
      campaign: campaign,
      marketing: CAMPAIGNS[campaign].marketing,
      dir: dir,
      locale: ctx.locale,
      htmlLang: ctx.htmlLang,
      subject: subject,
      html: html,
      text: txt,
      blockedDecisions: listBlocked(subject + html + txt)
    };
  }

  return {
    SITE_URL: SITE_URL,
    LOCALES: LOCALES,
    DIRS: DIRS,
    CAMPAIGNS: CAMPAIGNS,
    RULES: RULES,
    MARKET_TIMEZONES: MARKET_TIMEZONES,
    METHODOLOGY_MISSING_DIRS: METHODOLOGY_MISSING_DIRS,
    FORBIDDEN_TERMS: FORBIDDEN_TERMS,
    TOKEN_TTL_DAYS: TOKEN_TTL_DAYS,
    MIN_SECRET_LENGTH: MIN_SECRET_LENGTH,
    BLOCKS_MARKER: BLOCKS_MARKER,
    siteContext: siteContext,
    localClock: localClock,
    parisDate: parisDate,
    factsFromRow: factsFromRow,
    decideCampaign: decideCampaign,
    publicMatch: publicMatch,
    pickFreeMatch: pickFreeMatch,
    weekendMatches: weekendMatches,
    createUnsubscribeToken: createUnsubscribeToken,
    verifyUnsubscribeToken: verifyUnsubscribeToken,
    unsubscribeLinks: unsubscribeLinks,
    listUnsubscribeHeaders: listUnsubscribeHeaders,
    findForbiddenWords: findForbiddenWords,
    renderLifecycleEmail: renderLifecycleEmail
  };
});

return module.exports;
})();
export const BUNDLE = {
  "layout": {
    "html": "{{! Gabarit commun des emails de relance (lib/lifecycle-email.js). Meme charte que emails/templates/* : CSS inline, bloc <style> reserve au mode sombre et au mobile. Le marqueur LIFECYCLE_BLOCKS recoit le corps (textes emails/lifecycle/copy.<locale>.json). Lien de desinscription en 1 clic, mention 18+ et aide du pays dans CHAQUE email. STATUT : REVIEW. }}<!DOCTYPE html>\n<html lang=\"{{htmlLang}}\" xmlns=\"http://www.w3.org/1999/xhtml\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"x-apple-disable-message-reformatting\">\n<meta name=\"format-detection\" content=\"telephone=no, date=no, address=no, email=no\">\n<meta name=\"color-scheme\" content=\"light dark\">\n<meta name=\"supported-color-schemes\" content=\"light dark\">\n<title>{{subject}}</title>\n<style>\n:root { color-scheme: light dark; supported-color-schemes: light dark; }\n@media (prefers-color-scheme: dark) {\n  .bg-page { background-color: #0b1118 !important; }\n  .bg-card { background-color: #131c27 !important; border-color: #263444 !important; }\n  .bg-soft { background-color: #18232f !important; border-color: #2f6f86 !important; }\n  .bg-warn { background-color: #2a2213 !important; border-color: #6b5320 !important; }\n  .tx { color: #e9eef4 !important; }\n  .tx-soft { color: #a9b6c4 !important; }\n  .bd { border-color: #263444 !important; }\n  .lnk { color: #62d6ec !important; }\n}\n[data-ogsc] .bg-page { background-color: #0b1118 !important; }\n[data-ogsc] .bg-card { background-color: #131c27 !important; }\n[data-ogsc] .bg-soft { background-color: #18232f !important; }\n[data-ogsc] .bg-warn { background-color: #2a2213 !important; }\n[data-ogsc] .tx { color: #e9eef4 !important; }\n[data-ogsc] .tx-soft { color: #a9b6c4 !important; }\n[data-ogsc] .lnk { color: #62d6ec !important; }\n@media only screen and (max-width: 620px) {\n  .container { width: 100% !important; }\n  .pad { padding: 20px !important; }\n}\n</style>\n</head>\n<body class=\"bg-page\" style=\"margin:0;padding:0;background-color:#f2f4f7;-webkit-text-size-adjust:100%;\">\n<div style=\"display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f2f4f7;\">{{preheader}}</div>\n<table role=\"presentation\" class=\"bg-page\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;background-color:#f2f4f7;border-collapse:collapse;\">\n<tr>\n<td align=\"center\" style=\"padding:24px 12px;\">\n<table role=\"presentation\" class=\"container\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:600px;max-width:600px;border-collapse:collapse;\">\n<tr>\n<td class=\"tx\" style=\"padding:4px 4px 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;font-weight:bold;letter-spacing:3px;color:#0b1a2a;\">IASHARK</td>\n</tr>\n<tr>\n<td class=\"bg-card pad\" style=\"padding:32px;background-color:#ffffff;border:1px solid #dfe4ea;border-radius:12px;font-family:Arial,Helvetica,sans-serif;\">\n\n<h1 class=\"tx\" style=\"margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:31px;font-weight:bold;color:#0b1a2a;\">{{title}}</h1>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">{{greeting}}</p>\n<!--LIFECYCLE_BLOCKS-->\n\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:10px 0 0;\">\n<tr><td class=\"bg-warn\" style=\"padding:16px 18px;background-color:#fff8eb;border:1px solid #f0d49c;border-radius:8px;font-family:Arial,Helvetica,sans-serif;\">\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;font-weight:bold;color:#3a2a0c;\">{{rgTitle}}</p>\n<p class=\"tx\" style=\"margin:0 0 8px;font-size:14px;line-height:21px;color:#3a2a0c;\">{{rgBody}}</p>\n<p class=\"tx\" style=\"margin:0;font-size:14px;line-height:21px;color:#3a2a0c;\">{{rgHelp}} <a class=\"lnk\" href=\"{{helplineUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{helplineUrl}}</a> · <a class=\"lnk\" href=\"{{responsibleUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{rgMore}}</a></p>\n</td></tr>\n</table>\n\n</td>\n</tr>\n<tr>\n<td class=\"tx-soft\" style=\"padding:18px 8px 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#5d6b79;\">\n{{footerReason}}<br>\n<a class=\"lnk\" href=\"{{unsubscribeUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;font-weight:bold;\">{{unsubscribeLabel}}</a> · <a class=\"lnk\" href=\"{{manageUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{manageLabel}}</a><br>\n{{senderLabel}}{{sep}}IASHARK · {{companyOperatorName}} · {{companyAddress}}<br>\n<a class=\"lnk\" href=\"{{privacyUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{privacyLabel}}</a> · <a class=\"lnk\" href=\"{{legalUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{legalLabel}}</a> · <a class=\"lnk\" href=\"{{homeUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">iashark.com</a>\n</td>\n</tr>\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>\n",
    "text": "Subject: {{subject}}\n{{! Version texte du gabarit commun (emails/lifecycle/layout.html) : meme contenu, rien en moins. sep = separateur \"libelle : valeur\" de la langue. }}IASHARK\n\n{{title}}\n\n{{greeting}}\n\n<!--LIFECYCLE_BLOCKS-->\n\n{{rgTitle}}\n{{rgBody}}\n{{rgHelp}} {{helplineUrl}}\n{{rgMore}}{{sep}}{{responsibleUrl}}\n\n--\n{{footerReason}}\n{{unsubscribeLabel}}{{sep}}{{unsubscribeUrl}}\n{{manageLabel}}{{sep}}{{manageUrl}}\n{{senderLabel}}{{sep}}IASHARK · {{companyOperatorName}} · {{companyAddress}}\n{{privacyLabel}}{{sep}}{{privacyUrl}}\n{{legalLabel}}{{sep}}{{legalUrl}}\n"
  },
  "copy": {
    "fr": {
      "_status": "REVIEW - textes a faire relire (juriste + relecture native) avant activation. Aucune promesse de gain.",
      "locale": "fr",
      "common": {
        "greeting": "Bonjour,",
        "colon": " : ",
        "kickoff_label": "Coup d'envoi",
        "match_link": "Voir le match",
        "rg_title": "Jeu responsable · 18+",
        "rg_body": "IASHARK publie des analyses statistiques de football. Ce n'est pas un site de paris : aucune mise n'est prise, et une probabilité n'est jamais une certitude. Les paris comportent des risques (perte d'argent, dépendance). Service réservé aux personnes de 18 ans et plus.",
        "rg_help_phone": "Besoin d'aide ? {{helplineName}} : {{helplinePhone}}.",
        "rg_help_nophone": "Besoin d'aide ? {{helplineName}} :",
        "rg_more": "Nos ressources jeu responsable",
        "footer_reason_marketing": "Vous recevez cet email car vous avez accepté de recevoir les analyses offertes et conseils d'utilisation d'IASHARK.",
        "footer_reason_welcome": "Email envoyé à la suite de la création de votre compte IASHARK.",
        "unsubscribe": "Se désinscrire en 1 clic",
        "manage": "Gérer mes emails dans Mon compte",
        "privacy": "Confidentialité",
        "legal": "Mentions légales",
        "sender": "Expéditeur"
      },
      "campaigns": {
        "welcome": {
          "subject": "Bienvenue sur IASHARK : par où commencer",
          "preheader": "Comment utiliser le site, le match offert et la méthodologie.",
          "title": "Bienvenue sur IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "Votre compte gratuit IASHARK est créé. Voici comment utiliser le site en quelques minutes."
            },
            {
              "type": "list",
              "ordered": true,
              "items": [
                "Chaque jour, l'analyse complète d'un match est offerte : elle est signalée sur la page d'accueil.",
                "Sur la page d'un match, lisez les probabilités estimées par le modèle, les facteurs pris en compte et leurs limites.",
                "La page Méthodologie explique d'où viennent ces chiffres et comment les lire."
              ]
            },
            {
              "type": "p",
              "if": "hasFreeMatch",
              "text": "Le match offert en ce moment :"
            },
            {
              "type": "match",
              "if": "hasFreeMatch"
            },
            {
              "type": "cta",
              "label": "Lire la méthodologie",
              "link": "methodology"
            },
            {
              "type": "link",
              "label": "Accéder à mon compte",
              "link": "account"
            },
            {
              "type": "p",
              "if": "notOptedIn",
              "text": "Vous n'avez pas demandé à recevoir nos analyses offertes et conseils d'utilisation par email : vous ne recevrez de notre part que les emails liés à votre compte. Vous pouvez changer d'avis à tout moment dans Mon compte, rubrique Notifications."
            }
          ]
        },
        "free_match": {
          "subject": "Le match offert du jour : {{freeMatchHome}} – {{freeMatchAway}}",
          "preheader": "L'analyse complète de ce match est ouverte gratuitement avec votre compte.",
          "title": "Votre analyse offerte du jour",
          "blocks": [
            {
              "type": "p",
              "text": "Chaque jour, IASHARK ouvre gratuitement l'analyse complète d'un match à tous les comptes. Voici celle du jour :"
            },
            {
              "type": "match"
            },
            {
              "type": "p",
              "text": "Vous y trouverez les probabilités estimées, les facteurs retenus par le modèle et les points de vigilance. Ce sont des estimations statistiques : l'issue d'un match reste incertaine."
            },
            {
              "type": "cta",
              "label": "Voir l'analyse offerte",
              "link": "freeMatch"
            }
          ]
        },
        "pro_features": {
          "subject": "Ce que débloque IASHARK Pro",
          "preheader": "La liste des contenus Pro et leur prix, sans détour.",
          "title": "Ce que Pro ajoute à votre compte gratuit",
          "blocks": [
            {
              "type": "p",
              "text": "Votre compte gratuit donne accès à l'analyse complète d'un match par jour, au blog et aux outils en découverte. Voici ce que Pro ajoute :"
            },
            {
              "type": "list",
              "items": [
                "L'analyse complète sur tous les matchs",
                "Les six outils branchés sur les probabilités du modèle",
                "Le journal des décisions synchronisé",
                "Le suivi de bankroll lié au compte"
              ]
            },
            {
              "type": "p",
              "if": "hasProYear",
              "text": "Prix sur la version {{siteVersion}} du site : {{proWeekPrice}} par semaine, {{proPrice}} par mois ou {{proYearPrice}} par an. Même accès Pro quelle que soit la durée, résiliable à tout moment depuis Mon compte."
            },
            {
              "type": "p",
              "if": "hasNoProYear",
              "text": "Prix sur la version {{siteVersion}} du site : {{proWeekPrice}} par semaine ou {{proPrice}} par mois. Même accès Pro quelle que soit la durée, résiliable à tout moment depuis Mon compte."
            },
            {
              "type": "p",
              "if": "hasOnlyProMonth",
              "text": "Prix sur la version {{siteVersion}} du site : {{proPrice}} par mois, résiliable à tout moment depuis Mon compte."
            },
            {
              "type": "p",
              "text": "Pro donne accès à davantage d'analyses et d'outils ; il ne rend aucun match plus prévisible."
            },
            {
              "type": "cta",
              "label": "Voir le détail de l'offre",
              "link": "pricing"
            },
            {
              "type": "p",
              "text": "Si le compte gratuit vous suffit, vous n'avez rien à faire."
            }
          ]
        },
        "inactive_7d": {
          "subject": "Les matchs de ce week-end sur IASHARK",
          "preheader": "Des affiches du week-end couvertes par IASHARK.",
          "title": "Voici les matchs de ce week-end",
          "blocks": [
            {
              "type": "p",
              "text": "Voici des affiches de ce week-end couvertes par IASHARK :"
            },
            {
              "type": "matches"
            },
            {
              "type": "p",
              "text": "L'analyse complète d'un match reste offerte chaque jour avec votre compte gratuit."
            },
            {
              "type": "cta",
              "label": "Voir tous les matchs",
              "link": "home"
            }
          ]
        },
        "inactive_30d": {
          "subject": "Votre compte IASHARK est toujours actif",
          "preheader": "L'analyse offerte du jour reste accessible avec votre compte gratuit.",
          "title": "Votre compte est toujours là",
          "blocks": [
            {
              "type": "p",
              "text": "Vous n'êtes pas revenu sur IASHARK depuis un moment. Votre compte gratuit est toujours actif, et l'analyse complète d'un match reste offerte chaque jour."
            },
            {
              "type": "cta",
              "label": "Revenir sur IASHARK",
              "link": "home"
            },
            {
              "type": "p",
              "text": "Si ces emails ne vous sont plus utiles, désinscrivez-vous en un clic avec le lien en bas de ce message. Sans visite ni ouverture de votre part, nous arrêterons de toute façon de vous écrire dans 30 jours."
            }
          ]
        },
        "pro_weekly_summary": {
          "subject": "Votre résumé IASHARK : les matchs du week-end",
          "preheader": "Les affiches du week-end couvertes par IASHARK.",
          "title": "Résumé de la semaine",
          "blocks": [
            {
              "type": "p",
              "text": "Voici des affiches du week-end couvertes par IASHARK. Vos outils Pro sont accessibles depuis la page Outils."
            },
            {
              "type": "matches"
            },
            {
              "type": "cta",
              "label": "Ouvrir les outils",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Vous pouvez désactiver ce résumé dans Mon compte, rubrique Notifications."
            }
          ]
        }
      }
    },
    "en": {
      "_status": "REVIEW - to be reviewed (lawyer + native speaker) before activation. Used by /en/, /gb/ and /za/. No promise of winnings.",
      "locale": "en",
      "common": {
        "greeting": "Hello,",
        "colon": ": ",
        "kickoff_label": "Kick-off",
        "match_link": "View the match",
        "rg_title": "Safer gambling · 18+",
        "rg_body": "IASHARK publishes statistical football analysis. We are not a bookmaker and we do not take bets, and a probability is never a certainty. Betting involves risks (losing money, addiction). You must be 18 or over.",
        "rg_help_phone": "Need help? {{helplineName}}: {{helplinePhone}}.",
        "rg_help_nophone": "Need help? {{helplineName}}:",
        "rg_more": "Our safer gambling resources",
        "footer_reason_marketing": "You are receiving this email because you agreed to receive IASHARK's free analyses and tips on using the site.",
        "footer_reason_welcome": "Sent after you created your IASHARK account.",
        "unsubscribe": "Unsubscribe in one click",
        "manage": "Manage my emails in My account",
        "privacy": "Privacy",
        "legal": "Legal notice",
        "sender": "Sender"
      },
      "campaigns": {
        "welcome": {
          "subject": "Welcome to IASHARK: where to start",
          "preheader": "How to use the site, the free match and our methodology.",
          "title": "Welcome to IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "Your free IASHARK account is ready. Here is how to use the site in a few minutes."
            },
            {
              "type": "list",
              "ordered": true,
              "items": [
                "Every day, the full analysis of one match is free: it is highlighted on the home page.",
                "On a match page, read the probabilities estimated by the model, the factors it takes into account and their limits.",
                "The Methodology page explains where these figures come from and how to read them."
              ]
            },
            {
              "type": "p",
              "if": "hasFreeMatch",
              "text": "The current free match:"
            },
            {
              "type": "match",
              "if": "hasFreeMatch"
            },
            {
              "type": "cta",
              "label": "Read the methodology",
              "link": "methodology"
            },
            {
              "type": "link",
              "label": "Go to my account",
              "link": "account"
            },
            {
              "type": "p",
              "if": "notOptedIn",
              "text": "You did not ask to receive our free analyses and tips by email, so we will only send you emails about your account. You can change your mind at any time in My account, under Notifications."
            }
          ]
        },
        "free_match": {
          "subject": "Today's free match: {{freeMatchHome}} – {{freeMatchAway}}",
          "preheader": "The full analysis of this match is open for free with your account.",
          "title": "Your free analysis of the day",
          "blocks": [
            {
              "type": "p",
              "text": "Every day, IASHARK opens the full analysis of one match to every account, free of charge. Here is today's:"
            },
            {
              "type": "match"
            },
            {
              "type": "p",
              "text": "You will find the estimated probabilities, the factors used by the model and the points to watch. These are statistical estimates: the outcome of a match remains uncertain."
            },
            {
              "type": "cta",
              "label": "View the free analysis",
              "link": "freeMatch"
            }
          ]
        },
        "pro_features": {
          "subject": "What IASHARK Pro unlocks",
          "preheader": "The list of Pro content and its price, plainly.",
          "title": "What Pro adds to your free account",
          "blocks": [
            {
              "type": "p",
              "text": "Your free account gives you the full analysis of one match a day, the blog and a preview of the tools. Here is what Pro adds:"
            },
            {
              "type": "list",
              "items": [
                "The full analysis on every match",
                "The six tools connected to the model's probabilities",
                "The synced decisions journal",
                "Bankroll tracking linked to your account"
              ]
            },
            {
              "type": "p",
              "if": "hasProYear",
              "text": "Prices on the {{siteVersion}} version of the site: {{proWeekPrice}} per week, {{proPrice}} per month or {{proYearPrice}} per year. The same Pro access whichever period you choose, cancel at any time from My account."
            },
            {
              "type": "p",
              "if": "hasNoProYear",
              "text": "Prices on the {{siteVersion}} version of the site: {{proWeekPrice}} per week or {{proPrice}} per month. The same Pro access whichever period you choose, cancel at any time from My account."
            },
            {
              "type": "p",
              "if": "hasOnlyProMonth",
              "text": "Price on the {{siteVersion}} version of the site: {{proPrice}} per month, cancel at any time from My account."
            },
            {
              "type": "p",
              "text": "Pro gives you more analyses and tools; it does not make any match more predictable."
            },
            {
              "type": "cta",
              "label": "See the plan details",
              "link": "pricing"
            },
            {
              "type": "p",
              "text": "If the free account is enough for you, there is nothing to do."
            }
          ]
        },
        "inactive_7d": {
          "subject": "This weekend's matches on IASHARK",
          "preheader": "Some of the weekend fixtures covered by IASHARK.",
          "title": "Here are this weekend's matches",
          "blocks": [
            {
              "type": "p",
              "text": "Here are some of this weekend's fixtures covered by IASHARK:"
            },
            {
              "type": "matches"
            },
            {
              "type": "p",
              "text": "The full analysis of one match is still free every day with your account."
            },
            {
              "type": "cta",
              "label": "See all matches",
              "link": "home"
            }
          ]
        },
        "inactive_30d": {
          "subject": "Your IASHARK account is still active",
          "preheader": "The free analysis of the day is still available with your account.",
          "title": "Your account is still here",
          "blocks": [
            {
              "type": "p",
              "text": "You have not been back to IASHARK for a while. Your free account is still active, and the full analysis of one match is still free every day."
            },
            {
              "type": "cta",
              "label": "Back to IASHARK",
              "link": "home"
            },
            {
              "type": "p",
              "text": "If these emails are no longer useful, unsubscribe in one click with the link at the bottom of this message. If you neither visit nor open our emails, we will stop writing to you in 30 days anyway."
            }
          ]
        },
        "pro_weekly_summary": {
          "subject": "Your IASHARK summary: this weekend's matches",
          "preheader": "The weekend fixtures covered by IASHARK.",
          "title": "Weekly summary",
          "blocks": [
            {
              "type": "p",
              "text": "Here are some of the weekend fixtures covered by IASHARK. Your Pro tools are available from the Tools page."
            },
            {
              "type": "matches"
            },
            {
              "type": "cta",
              "label": "Open the tools",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "You can turn off this summary in My account, under Notifications."
            }
          ]
        }
      }
    },
    "es": {
      "_status": "REVIEW - textos pendientes de revisión (jurista + nativo) antes de activar. Sin promesa de ganancias.",
      "locale": "es",
      "common": {
        "greeting": "Hola:",
        "colon": ": ",
        "kickoff_label": "Inicio",
        "match_link": "Ver el partido",
        "rg_title": "Juego responsable · 18+",
        "rg_body": "IASHARK publica análisis estadísticos de fútbol. No es una casa de apuestas: no acepta apuestas, y una probabilidad nunca es una certeza. Apostar conlleva riesgos (pérdida de dinero, adicción). Servicio reservado a mayores de 18 años.",
        "rg_help_phone": "¿Necesitas ayuda? {{helplineName}}: {{helplinePhone}}.",
        "rg_help_nophone": "¿Necesitas ayuda? {{helplineName}}:",
        "rg_more": "Nuestros recursos de juego responsable",
        "footer_reason_marketing": "Recibes este correo porque aceptaste recibir los análisis gratuitos y los consejos de uso de IASHARK.",
        "footer_reason_welcome": "Correo enviado tras la creación de tu cuenta IASHARK.",
        "unsubscribe": "Darse de baja con un clic",
        "manage": "Gestionar mis correos en Mi cuenta",
        "privacy": "Privacidad",
        "legal": "Aviso legal",
        "sender": "Remitente"
      },
      "campaigns": {
        "welcome": {
          "subject": "Bienvenido a IASHARK: por dónde empezar",
          "preheader": "Cómo usar el sitio, el partido gratuito y la metodología.",
          "title": "Bienvenido a IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "Tu cuenta gratuita de IASHARK ya está creada. Así puedes usar el sitio en pocos minutos."
            },
            {
              "type": "list",
              "ordered": true,
              "items": [
                "Cada día, el análisis completo de un partido es gratuito: aparece destacado en la página de inicio.",
                "En la página de un partido, consulta las probabilidades estimadas por el modelo, los factores que tiene en cuenta y sus límites.",
                "La página Metodología explica de dónde salen estas cifras y cómo leerlas."
              ]
            },
            {
              "type": "p",
              "if": "hasFreeMatch",
              "text": "El partido gratuito del momento:"
            },
            {
              "type": "match",
              "if": "hasFreeMatch"
            },
            {
              "type": "cta",
              "label": "Leer la metodología",
              "link": "methodology"
            },
            {
              "type": "link",
              "label": "Ir a mi cuenta",
              "link": "account"
            },
            {
              "type": "p",
              "if": "notOptedIn",
              "text": "No pediste recibir nuestros análisis gratuitos y consejos por correo: solo te enviaremos los correos relacionados con tu cuenta. Puedes cambiar de opinión en cualquier momento en Mi cuenta, apartado Notificaciones."
            }
          ]
        },
        "free_match": {
          "subject": "El partido gratuito del día: {{freeMatchHome}} – {{freeMatchAway}}",
          "preheader": "El análisis completo de este partido está abierto gratis con tu cuenta.",
          "title": "Tu análisis gratuito del día",
          "blocks": [
            {
              "type": "p",
              "text": "Cada día, IASHARK abre gratis a todas las cuentas el análisis completo de un partido. Este es el de hoy:"
            },
            {
              "type": "match"
            },
            {
              "type": "p",
              "text": "Encontrarás las probabilidades estimadas, los factores que usa el modelo y los puntos de atención. Son estimaciones estadísticas: el resultado de un partido sigue siendo incierto."
            },
            {
              "type": "cta",
              "label": "Ver el análisis gratuito",
              "link": "freeMatch"
            }
          ]
        },
        "pro_features": {
          "subject": "Lo que desbloquea IASHARK Pro",
          "preheader": "La lista de contenidos Pro y su precio, sin rodeos.",
          "title": "Lo que Pro añade a tu cuenta gratuita",
          "blocks": [
            {
              "type": "p",
              "text": "Tu cuenta gratuita da acceso al análisis completo de un partido al día, al blog y a las herramientas en modo descubrimiento. Esto es lo que añade Pro:"
            },
            {
              "type": "list",
              "items": [
                "El análisis completo en todos los partidos",
                "Las seis herramientas conectadas a las probabilidades del modelo",
                "El diario de decisiones sincronizado",
                "El seguimiento de bankroll vinculado a la cuenta"
              ]
            },
            {
              "type": "p",
              "if": "hasProYear",
              "text": "Precios en la versión {{siteVersion}} del sitio: {{proWeekPrice}} a la semana, {{proPrice}} al mes o {{proYearPrice}} al año. El mismo acceso Pro sea cual sea la duración, cancelable en cualquier momento desde Mi cuenta."
            },
            {
              "type": "p",
              "if": "hasNoProYear",
              "text": "Precios en la versión {{siteVersion}} del sitio: {{proWeekPrice}} a la semana o {{proPrice}} al mes. El mismo acceso Pro sea cual sea la duración, cancelable en cualquier momento desde Mi cuenta."
            },
            {
              "type": "p",
              "if": "hasOnlyProMonth",
              "text": "Precio en la versión {{siteVersion}} del sitio: {{proPrice}} al mes, cancelable en cualquier momento desde Mi cuenta."
            },
            {
              "type": "p",
              "text": "Pro da acceso a más análisis y herramientas; no hace que ningún partido sea más previsible."
            },
            {
              "type": "cta",
              "label": "Ver el detalle de la oferta",
              "link": "pricing"
            },
            {
              "type": "p",
              "text": "Si la cuenta gratuita te basta, no tienes que hacer nada."
            }
          ]
        },
        "inactive_7d": {
          "subject": "Los partidos de este fin de semana en IASHARK",
          "preheader": "Algunos partidos del fin de semana que cubre IASHARK.",
          "title": "Estos son los partidos de este fin de semana",
          "blocks": [
            {
              "type": "p",
              "text": "Estos son algunos partidos de este fin de semana que cubre IASHARK:"
            },
            {
              "type": "matches"
            },
            {
              "type": "p",
              "text": "El análisis completo de un partido sigue siendo gratuito cada día con tu cuenta."
            },
            {
              "type": "cta",
              "label": "Ver todos los partidos",
              "link": "home"
            }
          ]
        },
        "inactive_30d": {
          "subject": "Tu cuenta IASHARK sigue activa",
          "preheader": "El análisis gratuito del día sigue disponible con tu cuenta.",
          "title": "Tu cuenta sigue aquí",
          "blocks": [
            {
              "type": "p",
              "text": "Hace tiempo que no vuelves a IASHARK. Tu cuenta gratuita sigue activa y el análisis completo de un partido sigue siendo gratuito cada día."
            },
            {
              "type": "cta",
              "label": "Volver a IASHARK",
              "link": "home"
            },
            {
              "type": "p",
              "text": "Si estos correos ya no te son útiles, date de baja con un clic en el enlace al final de este mensaje. Si no visitas el sitio ni abres nuestros correos, dejaremos de escribirte en 30 días de todos modos."
            }
          ]
        },
        "pro_weekly_summary": {
          "subject": "Tu resumen IASHARK: los partidos del fin de semana",
          "preheader": "Los partidos del fin de semana que cubre IASHARK.",
          "title": "Resumen de la semana",
          "blocks": [
            {
              "type": "p",
              "text": "Estos son algunos partidos del fin de semana que cubre IASHARK. Tus herramientas Pro están disponibles en la página Herramientas."
            },
            {
              "type": "matches"
            },
            {
              "type": "cta",
              "label": "Abrir las herramientas",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Puedes desactivar este resumen en Mi cuenta, apartado Notificaciones."
            }
          ]
        }
      }
    },
    "es-mx": {
      "_status": "REVIEW - textos pendientes de revisión (abogado en México + nativo) antes de activar. Sin promesa de ganancias.",
      "locale": "es-mx",
      "common": {
        "greeting": "Hola:",
        "colon": ": ",
        "kickoff_label": "Inicio",
        "match_link": "Ver el partido",
        "rg_title": "Juego responsable · 18+",
        "rg_body": "IASHARK ofrece análisis estadísticos de futbol. No es una casa de apuestas: no recibe apuestas, y una probabilidad nunca es una certeza. Apostar implica riesgos (pérdida de dinero, adicción). Prohibido para menores de 18 años.",
        "rg_help_phone": "¿Necesitas orientación? {{helplineName}}: {{helplinePhone}}.",
        "rg_help_nophone": "¿Necesitas orientación? {{helplineName}}:",
        "rg_more": "Nuestros recursos de juego responsable",
        "footer_reason_marketing": "Recibes este correo porque aceptaste recibir los análisis gratuitos y los consejos de uso de IASHARK.",
        "footer_reason_welcome": "Correo enviado después de crear tu cuenta IASHARK.",
        "unsubscribe": "Darte de baja con un clic",
        "manage": "Administrar mis correos en Mi cuenta",
        "privacy": "Aviso de privacidad",
        "legal": "Aviso legal",
        "sender": "Remitente"
      },
      "campaigns": {
        "welcome": {
          "subject": "Bienvenido a IASHARK: por dónde empezar",
          "preheader": "Cómo usar el sitio, el partido gratuito y la metodología.",
          "title": "Bienvenido a IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "Tu cuenta gratuita de IASHARK ya está lista. Así puedes usar el sitio en unos minutos."
            },
            {
              "type": "list",
              "ordered": true,
              "items": [
                "Cada día, el análisis completo de un partido es gratuito: aparece destacado en la página de inicio.",
                "En la página de un partido, revisa las probabilidades estimadas por el modelo, los factores que considera y sus límites.",
                "La página Metodología explica de dónde salen estas cifras y cómo leerlas."
              ]
            },
            {
              "type": "p",
              "if": "hasFreeMatch",
              "text": "El partido gratuito del momento:"
            },
            {
              "type": "match",
              "if": "hasFreeMatch"
            },
            {
              "type": "cta",
              "label": "Leer la metodología",
              "link": "methodology"
            },
            {
              "type": "link",
              "label": "Ir a Mi cuenta",
              "link": "account"
            },
            {
              "type": "p",
              "if": "notOptedIn",
              "text": "No pediste recibir nuestros análisis gratuitos y consejos por correo: solo te enviaremos los correos relacionados con tu cuenta. Puedes cambiar de opinión cuando quieras en Mi cuenta, sección Notificaciones."
            }
          ]
        },
        "free_match": {
          "subject": "El partido gratuito del día: {{freeMatchHome}} – {{freeMatchAway}}",
          "preheader": "El análisis completo de este partido está abierto gratis con tu cuenta.",
          "title": "Tu análisis gratuito del día",
          "blocks": [
            {
              "type": "p",
              "text": "Cada día, IASHARK abre gratis a todas las cuentas el análisis completo de un partido. Este es el de hoy:"
            },
            {
              "type": "match"
            },
            {
              "type": "p",
              "text": "Ahí encontrarás las probabilidades estimadas, los factores que usa el modelo y los puntos a vigilar. Son estimaciones estadísticas: el resultado de un partido sigue siendo incierto."
            },
            {
              "type": "cta",
              "label": "Ver el análisis gratuito",
              "link": "freeMatch"
            }
          ]
        },
        "pro_features": {
          "subject": "Lo que desbloquea IASHARK Pro",
          "preheader": "La lista de contenidos Pro y su precio, sin rodeos.",
          "title": "Lo que Pro agrega a tu cuenta gratuita",
          "blocks": [
            {
              "type": "p",
              "text": "Tu cuenta gratuita da acceso al análisis completo de un partido al día, al blog y a las herramientas en modo de prueba. Esto es lo que agrega Pro:"
            },
            {
              "type": "list",
              "items": [
                "El análisis completo en todos los partidos",
                "Las seis herramientas conectadas a las probabilidades del modelo",
                "El diario de decisiones sincronizado",
                "El seguimiento de bankroll vinculado a la cuenta"
              ]
            },
            {
              "type": "p",
              "if": "hasProYear",
              "text": "Precios en la versión {{siteVersion}} del sitio: {{proWeekPrice}} a la semana, {{proPrice}} al mes o {{proYearPrice}} al año. El mismo acceso Pro con cualquier plazo, puedes cancelar cuando quieras desde Mi cuenta."
            },
            {
              "type": "p",
              "if": "hasNoProYear",
              "text": "Precios en la versión {{siteVersion}} del sitio: {{proWeekPrice}} a la semana o {{proPrice}} al mes. El mismo acceso Pro con cualquier plazo, puedes cancelar cuando quieras desde Mi cuenta."
            },
            {
              "type": "p",
              "if": "hasOnlyProMonth",
              "text": "Precio en la versión {{siteVersion}} del sitio: {{proPrice}} al mes; puedes cancelar cuando quieras desde Mi cuenta."
            },
            {
              "type": "p",
              "text": "Pro da acceso a más análisis y herramientas; no hace que ningún partido sea más predecible."
            },
            {
              "type": "cta",
              "label": "Ver el detalle del plan",
              "link": "pricing"
            },
            {
              "type": "p",
              "text": "Si la cuenta gratuita te basta, no tienes que hacer nada."
            }
          ]
        },
        "inactive_7d": {
          "subject": "Los partidos de este fin de semana en IASHARK",
          "preheader": "Algunos partidos del fin de semana que cubre IASHARK.",
          "title": "Estos son los partidos de este fin de semana",
          "blocks": [
            {
              "type": "p",
              "text": "Estos son algunos partidos de este fin de semana que cubre IASHARK:"
            },
            {
              "type": "matches"
            },
            {
              "type": "p",
              "text": "El análisis completo de un partido sigue siendo gratuito cada día con tu cuenta."
            },
            {
              "type": "cta",
              "label": "Ver todos los partidos",
              "link": "home"
            }
          ]
        },
        "inactive_30d": {
          "subject": "Tu cuenta IASHARK sigue activa",
          "preheader": "El análisis gratuito del día sigue disponible con tu cuenta.",
          "title": "Tu cuenta sigue aquí",
          "blocks": [
            {
              "type": "p",
              "text": "Hace tiempo que no regresas a IASHARK. Tu cuenta gratuita sigue activa y el análisis completo de un partido sigue siendo gratuito cada día."
            },
            {
              "type": "cta",
              "label": "Regresar a IASHARK",
              "link": "home"
            },
            {
              "type": "p",
              "text": "Si estos correos ya no te sirven, date de baja con un clic en el enlace al final de este mensaje. Si no visitas el sitio ni abres nuestros correos, de todos modos dejaremos de escribirte en 30 días."
            }
          ]
        },
        "pro_weekly_summary": {
          "subject": "Tu resumen IASHARK: los partidos del fin de semana",
          "preheader": "Los partidos del fin de semana que cubre IASHARK.",
          "title": "Resumen de la semana",
          "blocks": [
            {
              "type": "p",
              "text": "Estos son algunos partidos del fin de semana que cubre IASHARK. Tus herramientas Pro están disponibles en la página Herramientas."
            },
            {
              "type": "matches"
            },
            {
              "type": "cta",
              "label": "Abrir las herramientas",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Puedes desactivar este resumen en Mi cuenta, sección Notificaciones."
            }
          ]
        }
      }
    },
    "de": {
      "_status": "REVIEW - vor der Aktivierung prüfen lassen (Jurist + Muttersprachler). Kein Gewinnversprechen. Methodik-Seite existiert noch nicht auf Deutsch (Link auf die englische Seite).",
      "locale": "de",
      "common": {
        "greeting": "Hallo,",
        "colon": ": ",
        "kickoff_label": "Anstoß",
        "match_link": "Zum Spiel",
        "rg_title": "Verantwortungsvolles Spielen · 18+",
        "rg_body": "IASHARK veröffentlicht statistische Fußballanalysen. Wir sind kein Wettanbieter und nehmen keine Wetten an, und eine Wahrscheinlichkeit ist nie eine Gewissheit. Wetten ist mit Risiken verbunden (Geldverlust, Sucht). Nur für Personen ab 18 Jahren.",
        "rg_help_phone": "Brauchen Sie Hilfe? {{helplineName}}: {{helplinePhone}}.",
        "rg_help_nophone": "Brauchen Sie Hilfe? {{helplineName}}:",
        "rg_more": "Unsere Hinweise zum verantwortungsvollen Spielen",
        "footer_reason_marketing": "Sie erhalten diese E-Mail, weil Sie zugestimmt haben, die kostenlosen Analysen und Nutzungstipps von IASHARK zu erhalten.",
        "footer_reason_welcome": "Gesendet nach der Erstellung Ihres IASHARK-Kontos.",
        "unsubscribe": "Mit einem Klick abmelden",
        "manage": "E-Mails in Mein Konto verwalten",
        "privacy": "Datenschutz",
        "legal": "Impressum",
        "sender": "Absender"
      },
      "campaigns": {
        "welcome": {
          "subject": "Willkommen bei IASHARK: so fangen Sie an",
          "preheader": "So nutzen Sie die Website, das kostenlose Spiel und die Methodik.",
          "title": "Willkommen bei IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "Ihr kostenloses IASHARK-Konto ist eingerichtet. So nutzen Sie die Website in wenigen Minuten."
            },
            {
              "type": "list",
              "ordered": true,
              "items": [
                "Jeden Tag ist die vollständige Analyse eines Spiels kostenlos: Sie ist auf der Startseite hervorgehoben.",
                "Auf der Seite eines Spiels lesen Sie die vom Modell geschätzten Wahrscheinlichkeiten, die berücksichtigten Faktoren und ihre Grenzen.",
                "Die Methodik-Seite erklärt, woher diese Zahlen kommen und wie man sie liest."
              ]
            },
            {
              "type": "p",
              "if": "hasFreeMatch",
              "text": "Das aktuelle kostenlose Spiel:"
            },
            {
              "type": "match",
              "if": "hasFreeMatch"
            },
            {
              "type": "cta",
              "label": "Zur Methodik (Seite auf Englisch)",
              "link": "methodology"
            },
            {
              "type": "link",
              "label": "Zu meinem Konto",
              "link": "account"
            },
            {
              "type": "p",
              "if": "notOptedIn",
              "text": "Sie haben keine kostenlosen Analysen und Tipps per E-Mail angefordert: Wir senden Ihnen nur E-Mails zu Ihrem Konto. Sie können Ihre Wahl jederzeit in Mein Konto unter Benachrichtigungen ändern."
            }
          ]
        },
        "free_match": {
          "subject": "Das kostenlose Spiel des Tages: {{freeMatchHome}} – {{freeMatchAway}}",
          "preheader": "Die vollständige Analyse dieses Spiels ist mit Ihrem Konto kostenlos freigeschaltet.",
          "title": "Ihre kostenlose Analyse des Tages",
          "blocks": [
            {
              "type": "p",
              "text": "Jeden Tag schaltet IASHARK die vollständige Analyse eines Spiels für alle Konten kostenlos frei. Das ist die heutige:"
            },
            {
              "type": "match"
            },
            {
              "type": "p",
              "text": "Sie finden dort die geschätzten Wahrscheinlichkeiten, die Faktoren des Modells und die Punkte, auf die zu achten ist. Es sind statistische Schätzungen: Der Ausgang eines Spiels bleibt ungewiss."
            },
            {
              "type": "cta",
              "label": "Kostenlose Analyse ansehen",
              "link": "freeMatch"
            }
          ]
        },
        "pro_features": {
          "subject": "Was IASHARK Pro freischaltet",
          "preheader": "Die Pro-Inhalte und ihr Preis, ohne Umschweife.",
          "title": "Was Pro Ihrem kostenlosen Konto hinzufügt",
          "blocks": [
            {
              "type": "p",
              "text": "Ihr kostenloses Konto bietet die vollständige Analyse eines Spiels pro Tag, den Blog und die Tools zum Kennenlernen. Das fügt Pro hinzu:"
            },
            {
              "type": "list",
              "items": [
                "Die vollständige Analyse zu allen Spielen",
                "Die sechs Tools, verbunden mit den Wahrscheinlichkeiten des Modells",
                "Das synchronisierte Entscheidungsjournal",
                "Die Bankroll-Verfolgung, verknüpft mit dem Konto"
              ]
            },
            {
              "type": "p",
              "if": "hasProYear",
              "text": "Preise auf der Version {{siteVersion}} der Website: {{proWeekPrice}} pro Woche, {{proPrice}} pro Monat oder {{proYearPrice}} pro Jahr. Derselbe Pro-Zugang bei jeder Laufzeit, jederzeit in Mein Konto kündbar."
            },
            {
              "type": "p",
              "if": "hasNoProYear",
              "text": "Preise auf der Version {{siteVersion}} der Website: {{proWeekPrice}} pro Woche oder {{proPrice}} pro Monat. Derselbe Pro-Zugang bei jeder Laufzeit, jederzeit in Mein Konto kündbar."
            },
            {
              "type": "p",
              "if": "hasOnlyProMonth",
              "text": "Preis auf der Version {{siteVersion}} der Website: {{proPrice}} pro Monat, jederzeit in Mein Konto kündbar."
            },
            {
              "type": "p",
              "text": "Pro bietet mehr Analysen und Tools; es macht kein Spiel vorhersehbarer."
            },
            {
              "type": "cta",
              "label": "Details zum Angebot",
              "link": "pricing"
            },
            {
              "type": "p",
              "text": "Wenn Ihnen das kostenlose Konto genügt, müssen Sie nichts tun."
            }
          ]
        },
        "inactive_7d": {
          "subject": "Die Spiele dieses Wochenendes bei IASHARK",
          "preheader": "Einige Begegnungen des Wochenendes, die IASHARK abdeckt.",
          "title": "Das sind die Spiele dieses Wochenendes",
          "blocks": [
            {
              "type": "p",
              "text": "Hier einige Begegnungen dieses Wochenendes, die IASHARK abdeckt:"
            },
            {
              "type": "matches"
            },
            {
              "type": "p",
              "text": "Die vollständige Analyse eines Spiels bleibt mit Ihrem Konto jeden Tag kostenlos."
            },
            {
              "type": "cta",
              "label": "Alle Spiele ansehen",
              "link": "home"
            }
          ]
        },
        "inactive_30d": {
          "subject": "Ihr IASHARK-Konto ist weiterhin aktiv",
          "preheader": "Die kostenlose Analyse des Tages ist mit Ihrem Konto weiterhin verfügbar.",
          "title": "Ihr Konto ist noch da",
          "blocks": [
            {
              "type": "p",
              "text": "Sie waren eine Weile nicht mehr bei IASHARK. Ihr kostenloses Konto ist weiterhin aktiv, und die vollständige Analyse eines Spiels bleibt jeden Tag kostenlos."
            },
            {
              "type": "cta",
              "label": "Zurück zu IASHARK",
              "link": "home"
            },
            {
              "type": "p",
              "text": "Wenn Ihnen diese E-Mails nicht mehr nützen, melden Sie sich mit dem Link am Ende dieser Nachricht mit einem Klick ab. Ohne Besuch oder Öffnen unserer E-Mails schreiben wir Ihnen ohnehin in 30 Tagen nicht mehr."
            }
          ]
        },
        "pro_weekly_summary": {
          "subject": "Ihre IASHARK-Zusammenfassung: die Spiele des Wochenendes",
          "preheader": "Die Begegnungen des Wochenendes, die IASHARK abdeckt.",
          "title": "Zusammenfassung der Woche",
          "blocks": [
            {
              "type": "p",
              "text": "Hier einige Begegnungen des Wochenendes, die IASHARK abdeckt. Ihre Pro-Tools finden Sie auf der Seite Tools."
            },
            {
              "type": "matches"
            },
            {
              "type": "cta",
              "label": "Tools öffnen",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Sie können diese Zusammenfassung in Mein Konto unter Benachrichtigungen abschalten."
            }
          ]
        }
      }
    },
    "it": {
      "_status": "REVIEW - da far rivedere (giurista + madrelingua) prima dell'attivazione. Nessuna promessa di vincita. La pagina Metodologia non esiste ancora in italiano (link alla pagina inglese).",
      "locale": "it",
      "common": {
        "greeting": "Ciao,",
        "colon": ": ",
        "kickoff_label": "Calcio d'inizio",
        "match_link": "Vedi la partita",
        "rg_title": "Gioco responsabile · 18+",
        "rg_body": "IASHARK pubblica analisi statistiche sul calcio. Non è un sito di scommesse: non accetta puntate, e una probabilità non è mai una certezza. Scommettere comporta rischi (perdita di denaro, dipendenza). Servizio riservato ai maggiori di 18 anni.",
        "rg_help_phone": "Hai bisogno di aiuto? {{helplineName}}: {{helplinePhone}}.",
        "rg_help_nophone": "Hai bisogno di aiuto? {{helplineName}}:",
        "rg_more": "Le nostre risorse sul gioco responsabile",
        "footer_reason_marketing": "Ricevi questa email perché hai accettato di ricevere le analisi gratuite e i consigli d'uso di IASHARK.",
        "footer_reason_welcome": "Email inviata dopo la creazione del tuo account IASHARK.",
        "unsubscribe": "Annulla l'iscrizione con un clic",
        "manage": "Gestisci le email in Il mio account",
        "privacy": "Privacy",
        "legal": "Note legali",
        "sender": "Mittente"
      },
      "campaigns": {
        "welcome": {
          "subject": "Benvenuto su IASHARK: da dove iniziare",
          "preheader": "Come usare il sito, la partita gratuita e la metodologia.",
          "title": "Benvenuto su IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "Il tuo account gratuito IASHARK è pronto. Ecco come usare il sito in pochi minuti."
            },
            {
              "type": "list",
              "ordered": true,
              "items": [
                "Ogni giorno l'analisi completa di una partita è gratuita: la trovi in evidenza nella pagina iniziale.",
                "Nella pagina di una partita leggi le probabilità stimate dal modello, i fattori considerati e i loro limiti.",
                "La pagina Metodologia spiega da dove vengono questi numeri e come leggerli."
              ]
            },
            {
              "type": "p",
              "if": "hasFreeMatch",
              "text": "La partita gratuita del momento:"
            },
            {
              "type": "match",
              "if": "hasFreeMatch"
            },
            {
              "type": "cta",
              "label": "Leggi la metodologia (pagina in inglese)",
              "link": "methodology"
            },
            {
              "type": "link",
              "label": "Vai al mio account",
              "link": "account"
            },
            {
              "type": "p",
              "if": "notOptedIn",
              "text": "Non hai chiesto di ricevere via email le nostre analisi gratuite e i consigli: ti invieremo solo le email relative al tuo account. Puoi cambiare idea in qualsiasi momento in Il mio account, sezione Notifiche."
            }
          ]
        },
        "free_match": {
          "subject": "La partita gratuita del giorno: {{freeMatchHome}} – {{freeMatchAway}}",
          "preheader": "L'analisi completa di questa partita è aperta gratis con il tuo account.",
          "title": "La tua analisi gratuita del giorno",
          "blocks": [
            {
              "type": "p",
              "text": "Ogni giorno IASHARK apre gratis a tutti gli account l'analisi completa di una partita. Ecco quella di oggi:"
            },
            {
              "type": "match"
            },
            {
              "type": "p",
              "text": "Troverai le probabilità stimate, i fattori usati dal modello e i punti di attenzione. Sono stime statistiche: l'esito di una partita resta incerto."
            },
            {
              "type": "cta",
              "label": "Vedi l'analisi gratuita",
              "link": "freeMatch"
            }
          ]
        },
        "pro_features": {
          "subject": "Cosa sblocca IASHARK Pro",
          "preheader": "L'elenco dei contenuti Pro e il loro prezzo, senza giri di parole.",
          "title": "Cosa aggiunge Pro al tuo account gratuito",
          "blocks": [
            {
              "type": "p",
              "text": "Il tuo account gratuito dà accesso all'analisi completa di una partita al giorno, al blog e agli strumenti in prova. Ecco cosa aggiunge Pro:"
            },
            {
              "type": "list",
              "items": [
                "L'analisi completa su tutte le partite",
                "I sei strumenti collegati alle probabilità del modello",
                "Il diario delle decisioni sincronizzato",
                "Il monitoraggio della bankroll collegato all'account"
              ]
            },
            {
              "type": "p",
              "if": "hasProYear",
              "text": "Prezzi sulla versione {{siteVersion}} del sito: {{proWeekPrice}} a settimana, {{proPrice}} al mese o {{proYearPrice}} all'anno. Lo stesso accesso Pro per ogni durata, disdicibile in qualsiasi momento da Il mio account."
            },
            {
              "type": "p",
              "if": "hasNoProYear",
              "text": "Prezzi sulla versione {{siteVersion}} del sito: {{proWeekPrice}} a settimana o {{proPrice}} al mese. Lo stesso accesso Pro per ogni durata, disdicibile in qualsiasi momento da Il mio account."
            },
            {
              "type": "p",
              "if": "hasOnlyProMonth",
              "text": "Prezzo sulla versione {{siteVersion}} del sito: {{proPrice}} al mese, disdicibile in qualsiasi momento da Il mio account."
            },
            {
              "type": "p",
              "text": "Pro dà accesso a più analisi e strumenti; non rende nessuna partita più prevedibile."
            },
            {
              "type": "cta",
              "label": "Vedi i dettagli dell'offerta",
              "link": "pricing"
            },
            {
              "type": "p",
              "text": "Se l'account gratuito ti basta, non devi fare nulla."
            }
          ]
        },
        "inactive_7d": {
          "subject": "Le partite di questo fine settimana su IASHARK",
          "preheader": "Alcune partite del fine settimana seguite da IASHARK.",
          "title": "Ecco le partite di questo fine settimana",
          "blocks": [
            {
              "type": "p",
              "text": "Ecco alcune partite di questo fine settimana seguite da IASHARK:"
            },
            {
              "type": "matches"
            },
            {
              "type": "p",
              "text": "L'analisi completa di una partita resta gratuita ogni giorno con il tuo account."
            },
            {
              "type": "cta",
              "label": "Vedi tutte le partite",
              "link": "home"
            }
          ]
        },
        "inactive_30d": {
          "subject": "Il tuo account IASHARK è ancora attivo",
          "preheader": "L'analisi gratuita del giorno resta disponibile con il tuo account.",
          "title": "Il tuo account è ancora qui",
          "blocks": [
            {
              "type": "p",
              "text": "È da un po' che non torni su IASHARK. Il tuo account gratuito è ancora attivo e l'analisi completa di una partita resta gratuita ogni giorno."
            },
            {
              "type": "cta",
              "label": "Torna su IASHARK",
              "link": "home"
            },
            {
              "type": "p",
              "text": "Se queste email non ti sono più utili, annulla l'iscrizione con un clic dal link in fondo a questo messaggio. Se non visiti il sito e non apri le nostre email, smetteremo comunque di scriverti tra 30 giorni."
            }
          ]
        },
        "pro_weekly_summary": {
          "subject": "Il tuo riepilogo IASHARK: le partite del fine settimana",
          "preheader": "Le partite del fine settimana seguite da IASHARK.",
          "title": "Riepilogo della settimana",
          "blocks": [
            {
              "type": "p",
              "text": "Ecco alcune partite del fine settimana seguite da IASHARK. I tuoi strumenti Pro sono disponibili dalla pagina Strumenti."
            },
            {
              "type": "matches"
            },
            {
              "type": "cta",
              "label": "Apri gli strumenti",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Puoi disattivare questo riepilogo in Il mio account, sezione Notifiche."
            }
          ]
        }
      }
    },
    "pt": {
      "_status": "REVIEW - rever (jurista + falante nativo) antes da ativação. Sem promessa de ganhos. A página Metodologia ainda não existe em português (ligação para a página em inglês).",
      "locale": "pt",
      "common": {
        "greeting": "Olá,",
        "colon": ": ",
        "kickoff_label": "Início do jogo",
        "match_link": "Ver o jogo",
        "rg_title": "Jogo responsável · 18+",
        "rg_body": "O IASHARK publica análises estatísticas de futebol. Não é um site de apostas: não aceita apostas, e uma probabilidade nunca é uma certeza. Apostar envolve riscos (perda de dinheiro, dependência). Serviço reservado a maiores de 18 anos.",
        "rg_help_phone": "Precisa de ajuda? {{helplineName}}: {{helplinePhone}}.",
        "rg_help_nophone": "Precisa de ajuda? {{helplineName}}:",
        "rg_more": "Os nossos recursos de jogo responsável",
        "footer_reason_marketing": "Recebe este email porque aceitou receber as análises gratuitas e as dicas de utilização do IASHARK.",
        "footer_reason_welcome": "Email enviado após a criação da sua conta IASHARK.",
        "unsubscribe": "Cancelar a subscrição com um clique",
        "manage": "Gerir os meus emails em A minha conta",
        "privacy": "Privacidade",
        "legal": "Aviso legal",
        "sender": "Remetente"
      },
      "campaigns": {
        "welcome": {
          "subject": "Bem-vindo ao IASHARK: por onde começar",
          "preheader": "Como usar o site, o jogo gratuito e a metodologia.",
          "title": "Bem-vindo ao IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "A sua conta gratuita IASHARK está criada. Veja como usar o site em poucos minutos."
            },
            {
              "type": "list",
              "ordered": true,
              "items": [
                "Todos os dias, a análise completa de um jogo é gratuita: está em destaque na página inicial.",
                "Na página de um jogo, leia as probabilidades estimadas pelo modelo, os fatores considerados e os seus limites.",
                "A página Metodologia explica de onde vêm estes números e como os ler."
              ]
            },
            {
              "type": "p",
              "if": "hasFreeMatch",
              "text": "O jogo gratuito do momento:"
            },
            {
              "type": "match",
              "if": "hasFreeMatch"
            },
            {
              "type": "cta",
              "label": "Ler a metodologia (página em inglês)",
              "link": "methodology"
            },
            {
              "type": "link",
              "label": "Aceder à minha conta",
              "link": "account"
            },
            {
              "type": "p",
              "if": "notOptedIn",
              "text": "Não pediu para receber as nossas análises gratuitas e dicas por email: só lhe enviaremos emails relacionados com a sua conta. Pode mudar de ideias a qualquer momento em A minha conta, secção Notificações."
            }
          ]
        },
        "free_match": {
          "subject": "O jogo gratuito do dia: {{freeMatchHome}} – {{freeMatchAway}}",
          "preheader": "A análise completa deste jogo está aberta gratuitamente com a sua conta.",
          "title": "A sua análise gratuita do dia",
          "blocks": [
            {
              "type": "p",
              "text": "Todos os dias, o IASHARK abre gratuitamente a todas as contas a análise completa de um jogo. Esta é a de hoje:"
            },
            {
              "type": "match"
            },
            {
              "type": "p",
              "text": "Vai encontrar as probabilidades estimadas, os fatores usados pelo modelo e os pontos de atenção. São estimativas estatísticas: o resultado de um jogo continua incerto."
            },
            {
              "type": "cta",
              "label": "Ver a análise gratuita",
              "link": "freeMatch"
            }
          ]
        },
        "pro_features": {
          "subject": "O que o IASHARK Pro desbloqueia",
          "preheader": "A lista de conteúdos Pro e o seu preço, sem rodeios.",
          "title": "O que o Pro acrescenta à sua conta gratuita",
          "blocks": [
            {
              "type": "p",
              "text": "A sua conta gratuita dá acesso à análise completa de um jogo por dia, ao blog e às ferramentas em modo de descoberta. Isto é o que o Pro acrescenta:"
            },
            {
              "type": "list",
              "items": [
                "A análise completa em todos os jogos",
                "As seis ferramentas ligadas às probabilidades do modelo",
                "O diário de decisões sincronizado",
                "O acompanhamento da bankroll ligado à conta"
              ]
            },
            {
              "type": "p",
              "if": "hasProYear",
              "text": "Preços na versão {{siteVersion}} do site: {{proWeekPrice}} por semana, {{proPrice}} por mês ou {{proYearPrice}} por ano. O mesmo acesso Pro em qualquer duração, cancelável a qualquer momento em A minha conta."
            },
            {
              "type": "p",
              "if": "hasNoProYear",
              "text": "Preços na versão {{siteVersion}} do site: {{proWeekPrice}} por semana ou {{proPrice}} por mês. O mesmo acesso Pro em qualquer duração, cancelável a qualquer momento em A minha conta."
            },
            {
              "type": "p",
              "if": "hasOnlyProMonth",
              "text": "Preço na versão {{siteVersion}} do site: {{proPrice}} por mês, cancelável a qualquer momento em A minha conta."
            },
            {
              "type": "p",
              "text": "O Pro dá acesso a mais análises e ferramentas; não torna nenhum jogo mais previsível."
            },
            {
              "type": "cta",
              "label": "Ver os detalhes da oferta",
              "link": "pricing"
            },
            {
              "type": "p",
              "text": "Se a conta gratuita lhe basta, não tem de fazer nada."
            }
          ]
        },
        "inactive_7d": {
          "subject": "Os jogos deste fim de semana no IASHARK",
          "preheader": "Alguns jogos do fim de semana acompanhados pelo IASHARK.",
          "title": "Estes são os jogos deste fim de semana",
          "blocks": [
            {
              "type": "p",
              "text": "Estes são alguns jogos deste fim de semana acompanhados pelo IASHARK:"
            },
            {
              "type": "matches"
            },
            {
              "type": "p",
              "text": "A análise completa de um jogo continua gratuita todos os dias com a sua conta."
            },
            {
              "type": "cta",
              "label": "Ver todos os jogos",
              "link": "home"
            }
          ]
        },
        "inactive_30d": {
          "subject": "A sua conta IASHARK continua ativa",
          "preheader": "A análise gratuita do dia continua disponível com a sua conta.",
          "title": "A sua conta continua aqui",
          "blocks": [
            {
              "type": "p",
              "text": "Há algum tempo que não volta ao IASHARK. A sua conta gratuita continua ativa e a análise completa de um jogo continua gratuita todos os dias."
            },
            {
              "type": "cta",
              "label": "Voltar ao IASHARK",
              "link": "home"
            },
            {
              "type": "p",
              "text": "Se estes emails já não lhe são úteis, cancele a subscrição com um clique na ligação no fim desta mensagem. Sem visitas nem aberturas dos nossos emails, deixaremos de lhe escrever dentro de 30 dias de qualquer forma."
            }
          ]
        },
        "pro_weekly_summary": {
          "subject": "O seu resumo IASHARK: os jogos do fim de semana",
          "preheader": "Os jogos do fim de semana acompanhados pelo IASHARK.",
          "title": "Resumo da semana",
          "blocks": [
            {
              "type": "p",
              "text": "Estes são alguns jogos do fim de semana acompanhados pelo IASHARK. As suas ferramentas Pro estão disponíveis na página Ferramentas."
            },
            {
              "type": "matches"
            },
            {
              "type": "cta",
              "label": "Abrir as ferramentas",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Pode desativar este resumo em A minha conta, secção Notificações."
            }
          ]
        }
      }
    }
  },
  "markets": {
    "_dirs": {
      "fr": {
        "market": "fr",
        "locale": "fr",
        "htmlLang": "fr",
        "intlLocale": "fr-FR",
        "label": "Français"
      },
      "gb": {
        "market": "gb",
        "locale": "en",
        "htmlLang": "en-GB",
        "intlLocale": "en-GB",
        "label": "English (UK)"
      },
      "za": {
        "market": "za",
        "locale": "en",
        "htmlLang": "en-ZA",
        "intlLocale": "en-ZA",
        "label": "English (South Africa)"
      },
      "en": {
        "market": "fr",
        "locale": "en",
        "htmlLang": "en",
        "intlLocale": "en-GB",
        "label": "English (International)",
        "helpline": "international"
      },
      "mx": {
        "market": "mx",
        "locale": "es-mx",
        "htmlLang": "es-MX",
        "intlLocale": "es-MX",
        "label": "Español (México)"
      },
      "es": {
        "market": "fr",
        "locale": "es",
        "htmlLang": "es",
        "intlLocale": "es-ES",
        "label": "Español",
        "helpline": "international"
      },
      "de": {
        "market": "fr",
        "locale": "de",
        "htmlLang": "de",
        "intlLocale": "de-DE",
        "label": "Deutsch",
        "helpline": "international"
      },
      "it": {
        "market": "fr",
        "locale": "it",
        "htmlLang": "it",
        "intlLocale": "it-IT",
        "label": "Italiano",
        "helpline": "international"
      },
      "pt": {
        "market": "fr",
        "locale": "pt",
        "htmlLang": "pt",
        "intlLocale": "pt-PT",
        "label": "Português",
        "helpline": "international"
      }
    },
    "_helplines": {
      "international": {
        "name": "Gambling Therapy",
        "phone": null,
        "tel": null,
        "url": "https://www.gamblingtherapy.org",
        "display": "gamblingtherapy.org",
        "hours": "free, international (chat, forum)"
      }
    },
    "fr": {
      "currency": "EUR",
      "intlLocale": "fr-FR",
      "priceIntlLocale": null,
      "helpline": {
        "name": "Joueurs Info Service",
        "phone": "09 74 75 13 13",
        "tel": "0974751313",
        "url": "https://www.joueurs-info-service.fr",
        "display": "joueurs-info-service.fr"
      },
      "prices": {
        "pro": {
          "week": {
            "amount": 6.99
          },
          "month": {
            "amount": 19.95
          },
          "year": {
            "amount": 199
          }
        }
      }
    },
    "gb": {
      "currency": "GBP",
      "intlLocale": "en-GB",
      "priceIntlLocale": null,
      "helpline": {
        "name": "National Gambling Helpline (GamCare / BeGambleAware)",
        "phone": "0808 8020 133",
        "tel": "08088020133",
        "url": "https://www.begambleaware.org",
        "display": "begambleaware.org"
      },
      "prices": {
        "pro": {
          "week": {
            "amount": 4.99
          },
          "month": {
            "amount": 14.99
          },
          "year": {
            "amount": 149
          }
        }
      }
    },
    "za": {
      "currency": "ZAR",
      "intlLocale": "en-ZA",
      "priceIntlLocale": null,
      "helpline": {
        "name": "National Responsible Gambling Programme (NRGP)",
        "phone": "0800 006 008",
        "tel": "0800006008",
        "url": "https://www.responsiblegambling.org.za",
        "display": "responsiblegambling.org.za"
      },
      "prices": {
        "pro": {
          "week": {
            "amount": 69
          },
          "month": {
            "amount": 199
          },
          "year": null
        }
      }
    },
    "mx": {
      "currency": "MXN",
      "intlLocale": "es-MX",
      "priceIntlLocale": null,
      "helpline": {
        "name": "Línea de la Vida (CONASAMA)",
        "phone": "800 911 2000",
        "tel": "8009112000",
        "url": "https://www.gob.mx/conasama/articulos/linea-de-la-vida-800-911-2000",
        "display": "gob.mx/conasama",
        "hours": "gratuita, 24/7"
      },
      "prices": {
        "pro": {
          "week": {
            "amount": 69
          },
          "month": {
            "amount": 199
          },
          "year": {
            "amount": 1990
          }
        }
      }
    }
  }
};
export { Render, Lifecycle };
export default Lifecycle;
