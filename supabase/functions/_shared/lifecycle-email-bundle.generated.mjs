// FICHIER GENERE par `node lib/lifecycle-email-build.js` - NE PAS MODIFIER A LA MAIN.
// Sources : lib/email-render.js, lib/match-time.js, lib/free-match.js, lib/lifecycle-email.js, emails/lifecycle/*, config/markets.json
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

return module.exports;
})();
const MatchTime = (function () {
const module = { exports: {} };
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.IasharkMatchTime=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
// Heures de coup d'envoi dans le fuseau du VISITEUR (audit QA 14/09/2026).
//
// data.json ecrit les dates "YYYY-MM-DD HH:MM" en heure de Paris (pipeline
// .github/workflows/update-data.yml). Elles etaient affichees telles quelles :
// un visiteur de Londres, Johannesburg ou Mexico lisait l'heure de Paris sans
// aucune mention de fuseau, et les onglets Aujourd'hui / Demain suivaient le
// jour de Paris.
//
// Ce module convertit une date de Paris en instant reel (changements d'heure
// geres : le decalage de Paris est calcule pour la date elle-meme, jamais
// suppose), puis la reexprime dans le fuseau du navigateur (ou un fuseau
// explicite, pour les tests).
//
// tz : undefined, null ou 'local' = fuseau du navigateur ; sinon un
// identifiant IANA ('America/Mexico_City').

var SOURCE_TZ='Europe/Paris';
var DATE_RE=/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/;
var formatters={};

function zone(tz){ return (tz==null||tz==='local')?undefined:tz; }
function pad(n){ return (n<10?'0':'')+n; }

function partsFormatter(tz){
  var k=zone(tz)||'__local__';
  if(!formatters[k]){
    var o={year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false};
    if(zone(tz))o.timeZone=zone(tz);
    formatters[k]=new Intl.DateTimeFormat('en-US',o);
  }
  return formatters[k];
}
// Heure murale d'un instant dans un fuseau.
function wall(date,tz){
  var r={};
  partsFormatter(tz).formatToParts(date).forEach(function(x){ r[x.type]=x.value; });
  return {y:+r.year,mo:+r.month,d:+r.day,h:(+r.hour)%24,mi:+r.minute,s:+r.second};
}
// Decalage (minutes) d'un fuseau a un instant donne.
function offsetMinutes(date,tz){
  var p=wall(date,tz);
  var asUtc=Date.UTC(p.y,p.mo-1,p.d,p.h,p.mi,p.s);
  return Math.round((asUtc-Math.floor(date.getTime()/1000)*1000)/60000);
}

// "2026-09-14 21:00" (heure de Paris) -> Date (instant reel), ou null.
function parseParis(str){
  var m=DATE_RE.exec(String(str==null?'':str).trim());
  if(!m)return null;
  var y=+m[1],mo=+m[2],d=+m[3],h=m[4]!=null?+m[4]:0,mi=m[5]!=null?+m[5]:0;
  var guess=Date.UTC(y,mo-1,d,h,mi);
  var off=offsetMinutes(new Date(guess),SOURCE_TZ);
  var t=guess-off*60000;
  // Deuxieme passe : le decalage a l'instant corrige peut differer du
  // premier (nuit du changement d'heure).
  var off2=offsetMinutes(new Date(t),SOURCE_TZ);
  if(off2!==off)t=guess-off2*60000;
  return new Date(t);
}

function dayKey(date,tz){ var p=wall(date,tz); return p.y+'-'+pad(p.mo)+'-'+pad(p.d); }
function clockKey(date,tz){ var p=wall(date,tz); return p.y+'-'+pad(p.mo)+'-'+pad(p.d)+' '+pad(p.h)+':'+pad(p.mi); }
function addDays(day,n){
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day||''));
  if(!m)return '';
  var dt=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]+n));
  return dt.getUTCFullYear()+'-'+pad(dt.getUTCMonth()+1)+'-'+pad(dt.getUTCDate());
}

// Horloge du visiteur : {day, tomorrow, now:'YYYY-MM-DD HH:MM', tz}.
// La presence de la cle tz signale a lib/free-match.js que les dates des
// matchs doivent etre converties dans ce fuseau.
function localClock(now,tz){
  now=now||new Date();
  var day=dayKey(now,tz);
  return {day:day,tomorrow:addDays(day,1),now:clockKey(now,tz),tz:zone(tz)||null};
}

function matchDate(m){ return parseParis(m&&typeof m==='object'?m.date:m); }
function matchDay(m,tz){ var d=matchDate(m); return d?dayKey(d,tz):''; }
function matchClock(m,tz){ var d=matchDate(m); return d?clockKey(d,tz):''; }
function matchTimestamp(m){ var d=matchDate(m); return d?d.getTime():Number.POSITIVE_INFINITY; }

// "21:00" dans la langue et le fuseau du visiteur. opts.zone : ajoute le
// nom court du fuseau ("21:00 UTC+1", "20:00 BST").
function formatTime(m,locale,opts){
  var d=matchDate(m);
  if(!d)return '';
  var o={hour:'2-digit',minute:'2-digit'};
  if(opts&&zone(opts.timeZone))o.timeZone=zone(opts.timeZone);
  if(opts&&opts.zone)o.timeZoneName='short';
  try{ return new Intl.DateTimeFormat(locale||undefined,o).format(d); }
  catch(e){ return clockKey(d,opts&&opts.timeZone).slice(11); }
}
// "lun. 14 sept." dans la langue et le fuseau du visiteur.
function formatDate(m,locale,opts){
  var d=matchDate(m);
  if(!d)return '';
  var o={weekday:'short',day:'numeric',month:'short'};
  if(opts&&opts.year)o.year='numeric';
  if(opts&&zone(opts.timeZone))o.timeZone=zone(opts.timeZone);
  try{ return new Intl.DateTimeFormat(locale||undefined,o).format(d); }
  catch(e){ return dayKey(d,opts&&opts.timeZone); }
}

// Ordre stable et deterministe : coup d'envoi, puis competition, equipes, id.
// (Avant : comparateur a deux issues, jamais 0 -> l'ordre des matchs a la
// meme heure changeait d'un rendu a l'autre.)
function txt(v){ return String(v==null?'':v).toLowerCase(); }
function compareMatches(a,b){
  var ta=matchTimestamp(a),tb=matchTimestamp(b);
  if(ta!==tb)return ta<tb?-1:1;
  var keys=[
    [txt(a&&a.league),txt(b&&b.league)],
    [txt(a&&a.home&&a.home.n),txt(b&&b.home&&b.home.n)],
    [txt(a&&a.away&&a.away.n),txt(b&&b.away&&b.away.n)],
    [String(a&&a.id),String(b&&b.id)]
  ];
  for(var i=0;i<keys.length;i++){ if(keys[i][0]!==keys[i][1])return keys[i][0]<keys[i][1]?-1:1; }
  return 0;
}

return {
  SOURCE_TZ:SOURCE_TZ, parseParis:parseParis, dayKey:dayKey, clockKey:clockKey, addDays:addDays,
  localClock:localClock, matchDate:matchDate, matchDay:matchDay, matchClock:matchClock,
  matchTimestamp:matchTimestamp, formatTime:formatTime, formatDate:formatDate, compareMatches:compareMatches
};
});

return module.exports;
})();
const FreeMatch = (function () {
const module = { exports: {} };
const require = function () { return MatchTime; };
(function(root,factory){
  var api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.IasharkFreeMatch=api;
})(typeof window!=='undefined'?window:null,function(){
'use strict';
// SOURCE UNIQUE du "match gratuit du jour".
//
// Avant, deux algorithmes differents repondaient a la meme question :
// pickFreeMatchId() dans match-page.js decidait quel match est gratuit, et
// getChoc() dans index.html decidait quel match mettre en vitrine. Ils ne
// tombaient pas d'accord. Resultat : le bouton "Voir le match gratuit du
// jour" de l'accueil envoyait vers un match que la page match considerait
// comme payant, et le visiteur se prenait le mur d'abonnement apres qu'on
// lui ait promis du gratuit. Les deux pages appellent desormais ce module.

function num(v){ var x=parseFloat(v); return isNaN(x)?null:x; }
// Score de classement du REPLI heuristique (aucun match designe is_free) :
// critere PUBLIC uniquement, identique pour un visiteur et un abonne. Ni conf
// (note sur 10 = probabilite du modele, premium depuis le 15/09/2026) ni edge
// (premium) : un classement fonde sur eux changerait selon l'abonnement et
// trahirait la probabilite par l'ordre. data_quality_score est publie.
function score(m){
  var q=num(m&&m.data_quality_score);
  return q==null?0:q;
}
function parisNow(){
  var f=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',year:'numeric',
    month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})
    .formatToParts(new Date());
  var r={}; f.forEach(function(x){ r[x.type]=x.value; });
  var day=r.year+'-'+r.month+'-'+r.day;
  return { day:day, now:day+' '+r.hour+':'+r.minute };
}
// Heure locale du visiteur (lib/match-time.js). Node : require ; navigateur :
// window.IasharkMatchTime (charge avant ce script). Absent : null, et le
// module retombe sur l'horloge de Paris (comportement historique).
function matchTime(){
  if(typeof window!=='undefined'&&window.IasharkMatchTime)return window.IasharkMatchTime;
  if(typeof require==='function'){ try{ return require('./match-time.js'); }catch(e){} }
  return null;
}
function horlogeParDefaut(){
  var mt=matchTime();
  return mt?mt.localClock():parisNow();
}
// Deux modes, pour rester compatible :
//  - horloge LOCALE (cle tz presente : IasharkMatchTime.localClock(), valeur
//    par defaut) : "aujourd'hui" = jour du visiteur, et le jour/l'heure de
//    chaque match sont convertis de Paris vers son fuseau ;
//  - horloge HISTORIQUE {day, now} sans tz (tests, appelants anciens) :
//    comparaison directe des chaines de Paris, comme avant.
function lecteurs(t){
  var mt=matchTime();
  if(t&&Object.prototype.hasOwnProperty.call(t,'tz')&&mt){
    return {
      jour:function(m){ return mt.matchDay(m,t.tz); },
      cle:function(m){ return mt.matchClock(m,t.tz); },
      local:true, mt:mt
    };
  }
  return {
    jour:function(m){ return String(m&&m.date||'').slice(0,10); },
    cle:function(m){ return String(m&&m.date||''); },
    local:false, mt:mt
  };
}
function meilleur(list){
  if(!list.length)return null;
  return list.reduce(function(b,m){ return score(m)>score(b)?m:b; },list[0]);
}

// Echelle de preference. On cherche d'abord parmi les matchs REELLEMENT
// analyses : la vitrine gratuite ne doit jamais tomber sur un match sans
// marche recommande, qui afficherait "aucun signal, confiance 0 %" au
// premier visiteur. Ce n'est qu'en dernier recours, si aucun match n'a de
// signal, qu'on retombe sur la liste brute plutot que de ne rien montrer.
// Marches pays (13/09/2026) : le pipeline peut designer, en plus de l'offre
// generale (free_markets ["default"]), une offre Liga MX pour le Mexique
// (free_markets ["mx"]) et une offre PSL pour l'Afrique du Sud (["za"]).
// market (3e argument, optionnel) = window.IASHARK_MARKET.code. Sans market,
// ou sans designation pour ce marche, on applique la logique generale
// (designation du jour, puis a venir, puis heuristique).
function pourMarche(m,market){
  return !!(m&&Array.isArray(m.free_markets)&&m.free_markets.indexOf(market)!==-1);
}
function pickFreeMatch(list,horloge,market){
  if(!Array.isArray(list)||!list.length)return null;
  // Le pipeline DESIGNE l'analyse offerte du jour (is_free) et ne publie que
  // celle-la en clair. Quand ce drapeau est present il fait autorite : c'est
  // la seule facon que le site, la page match et la fonction Edge parlent du
  // meme match. L'heuristique en dessous ne sert que de repli, pour les
  // donnees anciennes ou un fichier genere avant cette designation.
  var t=horloge||horlogeParDefaut();
  var L=lecteurs(t);
  var designe=list.filter(function(m){return m&&m.is_free===true;});
  if(designe.length){
    // 18/09/2026 (decision du proprietaire, remplace la regle du 16/09 « jamais
    // un match commence ») : l'analyse offerte DU JOUR le reste jusqu'a minuit
    // (heure du visiteur), meme commencee ou terminee - un visiteur qui arrive
    // a 22 h voit toujours le match offert du jour. A minuit, on passe a celle
    // du nouveau jour. Une designation d'un jour passe n'est jamais offerte, et
    // jamais un match non designe (son analyse n'est pas publiee en clair).
    // Jour de la designation (regle de Clement du 04/10/2026, 20 h : le match offert d'un jour le
    // reste de 00 h a 23 h 59, quoi qu'il arrive) : free_day (pose par le pipeline) quand le match a
    // ete reporte a un autre jour que celui de sa designation ; sinon le jour du match (comme avant).
    var jourDe=function(m){
      var fd=m&&typeof m.free_day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(m.free_day)?m.free_day:null;
      if(fd&&fd!==String(m.date||'').slice(0,10))return fd;
      return L.jour(m);
    };
    designe=designe.filter(function(m){ return jourDe(m)>=t.day; });
    if(!designe.length)return null;
    // Le pipeline designe une analyse offerte PAR JOUR (aujourd'hui et
    // demain). A minuit (heure du visiteur) le site bascule donc tout seul
    // sur celle du nouveau jour, sans attendre le prochain passage du pipeline.
    // Heure locale : les designations de deux jours de Paris peuvent tomber
    // le meme jour local (visiteur de Mexico). On prefere alors celle qui
    // n'a pas encore commence, la plus proche ; ordre stable sinon.
    var premierDuJour=function(src){
      if(!L.local||src.length<2)return src[0];
      var aVenirLoc=src.filter(function(m){ return L.cle(m)>=t.now; }).sort(L.mt.compareMatches);
      return aVenirLoc.length?aVenirLoc[0]:src.slice().sort(L.mt.compareMatches)[src.length-1];
    };
    if(market){
      var duMarche=designe.filter(function(m){ return pourMarche(m,market); });
      var duMarcheDuJour=duMarche.filter(function(m){ return jourDe(m)===t.day; });
      if(duMarcheDuJour.length)return premierDuJour(duMarcheDuJour);
      var duMarcheAVenir=duMarche.filter(function(m){ return jourDe(m)>t.day; })
        .sort(function(a,b){ return String(a.date)<String(b.date)?-1:1; });
      if(duMarcheAVenir.length)return duMarcheAVenir[0];
    }
    // Offre generale : un match designe UNIQUEMENT pour un marche pays
    // (free_markets sans "default") n'est pas l'offre generale. Un match
    // sans free_markets (fichier anterieur a ce champ) reste general.
    var generale=designe.filter(function(m){
      return !Array.isArray(m.free_markets)||m.free_markets.indexOf('default')!==-1;
    });
    if(generale.length)designe=generale;
    var designeDuJour=designe.filter(function(m){ return jourDe(m)===t.day; });
    if(designeDuJour.length)return premierDuJour(designeDuJour);
    var designeAVenir=designe.filter(function(m){ return jourDe(m)>t.day; })
      .sort(function(a,b){ return String(a.date)<String(b.date)?-1:1; });
    if(designeAVenir.length)return designeAVenir[0];
    return designe.slice().sort(function(a,b){ return String(a.date)<String(b.date)?-1:1; })[0];
  }
  var duJour=list.filter(function(m){ return L.jour(m)===t.day; });
  var aVenir=function(src){ return src.filter(function(m){ return L.cle(m)>t.now; }); };
  // has_signal est le drapeau public : le pari lui-meme n'est plus dans le
  // fichier public pour les matchs payants, mais on sait qu'il existe.
  var avecSignal=function(src){ return src.filter(function(m){ return !!(m&&(m.pari_rec||m.has_signal))&&!m.no_signal; }); };

  // 21/10/2026 (regle de Clement du 04/10 : « le match gratuit reste le meme de 00 h a 23 h 59,
  // quoi qu'il arrive ») : sans designation du pipeline, le repli du JOUR garde le meme match toute
  // la journee, meme commence ou termine (avant : seulement les matchs a venir, et le match offert
  // changeait des son coup d'envoi). Les autres jours : a venir seulement, comme avant.
  var echelle=[
    avecSignal(duJour),
    avecSignal(aVenir(duJour)),
    avecSignal(aVenir(list)),
    aVenir(duJour), aVenir(list)
  ];
  for(var i=0;i<echelle.length;i++){
    var gagnant=meilleur(echelle[i]);
    if(gagnant)return gagnant;
  }
  return null;
}
function pickFreeMatchId(list,horloge,market){
  var m=pickFreeMatch(list,horloge,market);
  return m?m.id:null;
}
return { pickFreeMatch:pickFreeMatch, pickFreeMatchId:pickFreeMatchId, score:score, parisNow:parisNow, horlogeParDefaut:horlogeParDefaut };
});

return module.exports;
})();
const Lifecycle = (function () {
const module = { exports: {} };
const require = function (p) { return /free-match/.test(p) ? FreeMatch : /match-time/.test(p) ? MatchTime : Render; };
/* IASHARK — emails de relance / cycle de vie (module PUR : aucun acces reseau,
   fichier, variable d'environnement ; l'horloge est toujours passee en
   argument). Dependances : lib/email-render.js (moteur de gabarit,
   echappement, identite vendeur BLOCKED_DECISION), lib/free-match.js et
   lib/match-time.js (le MEME match offert que le site).

   Consommateurs :
   - tests/email-lifecycle*.test.js, tests/email-relances-paiement.test.js
     (node --test, require) ;
   - supabase/functions/send-lifecycle-emails, trial-reminder et
     email-unsubscribe via le module genere
     supabase/functions/_shared/lifecycle-email-bundle.generated.mjs
     (node lib/lifecycle-email-build.js). Envoi par Brevo (_shared/brevo.ts).

   Sources :
   - gabarit commun emails/lifecycle/layout.html|.txt (meme charte que
     emails/templates/*) ;
   - textes par langue emails/lifecycle/copy.<locale>.json (STATUT : REVIEW) ;
   - pays/devise/prix/aide jeu responsable : config/markets.json (passe en
     argument, jamais recopie ici).

   Regles de selection : miroir EXACT de public.lifecycle_email_candidates
   (derniere version : supabase/migrations/0055_emails_relances_paiement.sql).
   La fonction Edge n'envoie que si les deux sont d'accord. Exception :
   trial_ending (fin d'essai Stripe) est choisi par abonnement, pas par compte
   (decideTrialEnding, fonction trial-reminder). */
(function (root, factory) {
  "use strict";
  var node = typeof module === "object" && module && module.exports && typeof require === "function";
  var api = factory(
    node ? require("./email-render.js") : root.IasharkEmail,
    node ? require("./free-match.js") : root.IasharkFreeMatch,
    node ? require("./match-time.js") : root.IasharkMatchTime
  );
  if (typeof module === "object" && module && module.exports) module.exports = api;
  else root.IasharkLifecycleEmail = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (R, FM, MT) {
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

  // sender : fonction Edge qui choisit et envoie la campagne.
  // footer : raison affichee en bas de l'email (common.footer_reason_<footer>).
  // marketing : consentement obligatoire (sinon : email lie au compte).
  var CAMPAIGNS = {
    welcome: { marketing: false, needs: null, sender: "send-lifecycle-emails", footer: "welcome" },
    free_match: { marketing: true, needs: "free_match", sender: "send-lifecycle-emails", footer: "marketing" },
    pro_features: { marketing: true, needs: "pro_price", sender: "send-lifecycle-emails", footer: "marketing" },
    // 21/10/2026 : paiement commence puis abandonne (1 a 3 jours plus tard, une seule fois).
    checkout_abandoned: { marketing: true, needs: null, sender: "send-lifecycle-emails", footer: "marketing" },
    inactive_7d: { marketing: true, needs: "weekend_matches", sender: "send-lifecycle-emails", footer: "marketing" },
    inactive_30d: { marketing: true, needs: null, sender: "send-lifecycle-emails", footer: "marketing" },
    pro_weekly_summary: { marketing: true, needs: "weekend_matches", sender: "send-lifecycle-emails", footer: "marketing" },
    // 21/10/2026 : fin d'essai Stripe, 2 jours avant (fonction trial-reminder, reutilisee).
    // Email lie a l'abonnement : envoye meme sans consentement marketing.
    trial_ending: { marketing: false, needs: "trial", sender: "trial-reminder", footer: "billing" }
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
    weekendDows: [4, 5, 6],      // jeudi, vendredi, samedi (ISO)
    // Paiement abandonne : de 1 a 3 jours apres le dernier paiement commence,
    // prioritaire sur les autres relances (au moins 1 jour apres le dernier
    // email marketing, au lieu de 3).
    checkoutFromDays: 1, checkoutUntilDays: 3, checkoutMinDaysSinceMarketing: 1,
    // Fin d'essai : fin dans 36 a 60 heures (= « dans 2 jours » pour un passage horaire).
    trialEndingFromHours: 36, trialEndingUntilHours: 60
  };

  // Seul destinataire du mode « test » des fonctions Edge (le patron, decision du
  // 21/10/2026) : jamais une adresse recue dans la requete.
  var TEST_RECIPIENT = "yaramode81@gmail.com";
  // Compte fictif des apercus (aucun compte reel : le lien de desinscription
  // d'un apercu ne desinscrit personne).
  var SAMPLE_USER_ID = "00000000-0000-4000-8000-000000000000";

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
    // Duree vendue mais non payable en ligne (config/markets.json#checkoutOpen,
    // ex. semaine et annee de /gb/ au 19/09/2026) : traitee comme non vendue,
    // jamais annoncee dans un email. checkoutOpen absent = toutes ouvertes.
    var open = Array.isArray(m.checkoutOpen) ? m.checkoutOpen : null;
    var proMinor = function (iv) {
      var pro = m.prices && m.prices.pro;
      if (!pro || (open && open.indexOf(iv) === -1)) return null;
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
      // Dernier paiement commence (clic sur le bouton de paiement, evenement
      // checkout_started) ou retour sur checkout-annule (0055).
      lastCheckoutAt: row.last_checkout_at || null,
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
    var noSales = facts.plan === "pro" || facts.hasSubscription === true || facts.role === "admin";

    // Paiement commence sans abonnement 1 a 3 jours plus tard : une seule fois,
    // avant toute autre relance (la frequence normale de 3 jours le ferait
    // souvent rater) mais jamais moins d'1 jour apres un email marketing.
    var checkout = toDate(facts.lastCheckoutAt);
    if (!noSales && checkout && !has("checkout_abandoned:")) {
      var sinceCheckout = daysBetween(n, checkout);
      var gapOk = !lastSent || daysBetween(n, lastSent) >= RULES.checkoutMinDaysSinceMarketing;
      if (sinceCheckout >= RULES.checkoutFromDays && sinceCheckout < RULES.checkoutUntilDays && gapOk) return out("checkout_abandoned", "");
    }
    if (lastSent && daysBetween(n, lastSent) < RULES.minDaysBetweenMarketing) return out(null, "", "frequency_cap");

    var activity = maxDate(created, facts.lastSignInAt, facts.lastFunnelAt);
    var engagement = maxDate(activity, facts.lastEngagementAt);
    if (daysBetween(n, engagement) > RULES.stopAfterInactiveDays) return out(null, "", "stopped_inactive_60d");

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

  // Horloge de Paris SANS fuseau ({day, now}) : mode historique de
  // lib/free-match.js, le meme que match-data#idOffertRepli (heure de Paris).
  function parisClock(n) {
    var c = MT.localClock(n, "Europe/Paris");
    return { day: c.day, now: c.now };
  }

  // Match offert que le SERVEUR (supabase/functions/match-data#idOffertRepli)
  // reconnait sans designation : aucune designation du jour ou a venir (heure
  // de Paris), puis le repli de lib/free-match.js (meme regle, verifiee par
  // tests/match-data-repli-offert.test.js). null = une designation fait autorite.
  function serverFreeMatchId(list, now) {
    var n = toDate(now);
    if (!Array.isArray(list) || !n) return null;
    var t = parisClock(n);
    var jour = function (m) { return String((m && m.date) || "").slice(0, 10); };
    var jourDesigne = function (m) {
      var fd = m && typeof m.free_day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(m.free_day) ? m.free_day : null;
      return fd && fd !== jour(m) ? fd : jour(m);
    };
    if (list.some(function (m) { return m && m.is_free === true && jourDesigne(m) >= t.day; })) return null;
    // Designations d'un jour passe : ignorees par le serveur (repli).
    var sans = list.map(function (m) { return m && m.is_free === true ? Object.assign({}, m, { is_free: false }) : m; });
    var id = FM.pickFreeMatchId(sans, t);
    return id == null ? null : String(id);
  }

  // Match offert de l'email = celui que montre le SITE au meme moment
  // (lib/free-match.js, appele comme match-page.js et index.html : horloge
  // locale du visiteur, ici le fuseau du marche, et code du marche) :
  // designation du pipeline (is_free), sinon le meme repli. Deux garde-fous
  // propres a l'email :
  // - le serveur doit le reconnaitre (designation, ou repli de match-data),
  //   sinon un compte gratuit cliquerait vers un mur payant ;
  // - pas encore commence (le site le garde offert toute la journee, meme
  //   termine ; un email ne propose jamais un match deja joue : il attend
  //   le match offert du lendemain).
  // Rien de tout cela = null (jamais de match invente).
  function pickFreeMatch(list, now, ctx) {
    var n = toDate(now);
    if (!Array.isArray(list) || !list.length || !n || !ctx) return null;
    var m = FM.pickFreeMatch(list, MT.localClock(n, ctx.timeZone), ctx.market || null);
    if (!m || !isFootball(m)) return null;
    var kickoff = parisDate(m.date);
    if (!kickoff || kickoff.getTime() <= n.getTime()) return null;
    if (m.is_free !== true && String(m.id) !== serverFreeMatchId(list, n)) return null;
    return publicMatch(m, ctx);
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

  // ------------------------------------------------- fin d'essai (trialing)

  // Fenetre de lecture de la base pour un passage (trial-reminder) : abonnements
  // dont la fin d'essai tombe dans [now + 36 h, now + 60 h[.
  function trialWindow(now) {
    var n = toDate(now) || fail("invalid_now", "now obligatoire");
    return {
      fromIso: new Date(n.getTime() + RULES.trialEndingFromHours * 3600000).toISOString(),
      toIso: new Date(n.getTime() + RULES.trialEndingUntilHours * 3600000).toISOString()
    };
  }

  // Ligne public.subscriptions -> rappel du a ce passage ? Essai Stripe en
  // cours (statut trialing), pas d'annulation programmee, aucun rappel deja
  // envoye (trial_reminder_sent_at), fin dans 36 a 60 heures.
  function decideTrialEnding(sub, now) {
    var n = toDate(now) || fail("invalid_now", "now obligatoire");
    var out = function (due, reason) { return { due: due, reason: reason || null }; };
    if (!sub || typeof sub !== "object") return out(false, "invalid_row");
    if (sub.status !== "trialing") return out(false, "not_trialing");
    if (sub.cancel_at_period_end === true) return out(false, "cancel_scheduled");
    if (sub.trial_reminder_sent_at) return out(false, "already_sent");
    var end = toDate(sub.current_period_end);
    if (!end) return out(false, "invalid_end");
    var hours = (end.getTime() - n.getTime()) / 3600000;
    if (hours < RULES.trialEndingFromHours) return out(false, hours <= 0 ? "trial_over" : "too_late");
    if (hours >= RULES.trialEndingUntilHours) return out(false, "too_early");
    return out(true, null);
  }

  var INTERVALS = ["week", "month", "year"];

  function validTrial(t) {
    return !!(t && toDate(t.endsAt) && typeof t.amountMinor === "number" && isFinite(t.amountMinor) && t.amountMinor >= 0
      && typeof t.currency === "string" && /^[A-Za-z]{3}$/.test(t.currency) && INTERVALS.indexOf(t.interval) !== -1);
  }

  // Prix catalogue (config/markets.json) d'une duree dans un marche de
  // facturation (fr, gb, mx, za, us) : repli de trial-reminder quand Stripe
  // n'est pas configure (essais locaux). En production, le montant vient de la
  // prochaine facture Stripe (code promo et taxes compris).
  function catalogAmount(marketsConfig, market, interval) {
    var m = marketsConfig && hasOwn.call(marketsConfig, String(market || "")) && String(market).charAt(0) !== "_" ? marketsConfig[market] : null;
    var pro = m && m.prices && m.prices.pro;
    var e = pro && INTERVALS.indexOf(interval) !== -1 ? pro[interval] : null;
    if (!e || typeof e.amount !== "number" || !isFinite(e.amount) || e.amount <= 0 || !m.currency) return null;
    return { amountMinor: Math.round(e.amount * 100), currency: m.currency };
  }

  // Essai fictif des apercus et du mode test : fin dans 48 heures, prix
  // mensuel du marche de la version du site (l'essai ne porte que sur le mois).
  function sampleTrial(ctx, now) {
    var n = toDate(now) || fail("invalid_now", "now obligatoire");
    if (!ctx || ctx.proPriceMinor == null) return null;
    return { endsAt: new Date(n.getTime() + 48 * 3600000).toISOString(), amountMinor: ctx.proPriceMinor, currency: ctx.currency, interval: "month" };
  }

  // ----------------------------------------------- donnees d'une campagne

  // Donnees d'un email (envoi reel, apercu, test), jamais inventees :
  // { data, reason } ; data null = pas d'email (reason dit pourquoi).
  // publicList : matchs de data-home.json (null = fichier indisponible).
  function campaignData(campaign, publicList, now, ctx, base) {
    if (!hasOwn.call(CAMPAIGNS, campaign)) fail("unknown_campaign", "Campagne inconnue : " + campaign);
    var need = CAMPAIGNS[campaign].needs;
    var data = Object.assign({ marketingOptIn: false, freeMatch: null, weekendMatches: [], trial: null }, base || {});
    if (campaign === "welcome" || need === "free_match" || need === "weekend_matches") {
      if (!Array.isArray(publicList)) {
        if (need) return { data: null, reason: "public_data_unavailable" };
      } else {
        data.freeMatch = pickFreeMatch(publicList, now, ctx);
        if (need === "weekend_matches") data.weekendMatches = weekendMatches(publicList, now, ctx, 8);
      }
    }
    if (need === "free_match" && !data.freeMatch) return { data: null, reason: "no_free_match" };
    if (need === "weekend_matches" && !data.weekendMatches.length) return { data: null, reason: "no_weekend_matches" };
    if (need === "trial" && !validTrial(data.trial)) return { data: null, reason: "no_trial" };
    return { data: data, reason: null };
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
  // pageUrl (facultatif) : la page du site en second lien, comme la relance
  // du 20/10/2026 (supabase/functions/relance-emails).
  function listUnsubscribeHeaders(oneClickUrl, pageUrl) {
    return {
      "List-Unsubscribe": "<" + oneClickUrl + ">" + (pageUrl ? ", <" + pageUrl + ">" : ""),
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click"
    };
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
      subscription: page("compte.html#abonnement"),
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
      if (b.unless && view[b.unless]) return;
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
  // data   = { freeMatch, weekendMatches, marketingOptIn, trial }
  //          trial (fin d'essai) = { endsAt, amountMinor, currency, interval }
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
    // Fin d'essai : date, montant et duree connus, jamais devines.
    if (need === "trial" && !validTrial(data.trial)) fail("missing_trial", "Essai incomplet (fin, montant, devise, duree)");
    var trial = need === "trial" ? data.trial : null;
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
      // Fin d'essai : date et heure dans le fuseau du marche (fuseau affiche :
      // jamais d'ambiguite sur le dernier moment pour annuler).
      trialEndDate: trial ? new Intl.DateTimeFormat(ctx.intlLocale, { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: ctx.timeZone, timeZoneName: "short" }).format(toDate(trial.endsAt)) : null,
      trialAmount: trial ? R.formatMoney(trial.amountMinor, trial.currency, ctx.priceIntlLocale) : null,
      trialPer: trial ? common["per_" + trial.interval] : null,
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
      footerReason: text(common["footer_reason_" + CAMPAIGNS[campaign].footer], view),
      // Signature de Clement (decision du 21/10/2026, comme la relance du 20/10).
      signoff: common.signoff,
      signature: common.signature,
      replyNote: text(c.reply || common.reply, view),
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
    TEST_RECIPIENT: TEST_RECIPIENT,
    SAMPLE_USER_ID: SAMPLE_USER_ID,
    siteContext: siteContext,
    localClock: localClock,
    parisDate: parisDate,
    factsFromRow: factsFromRow,
    decideCampaign: decideCampaign,
    publicMatch: publicMatch,
    pickFreeMatch: pickFreeMatch,
    serverFreeMatchId: serverFreeMatchId,
    weekendMatches: weekendMatches,
    trialWindow: trialWindow,
    decideTrialEnding: decideTrialEnding,
    catalogAmount: catalogAmount,
    sampleTrial: sampleTrial,
    campaignData: campaignData,
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
    "html": "{{! Gabarit commun des emails de relance (lib/lifecycle-email.js). Meme charte que emails/templates/* : CSS inline, bloc <style> reserve au mode sombre et au mobile. Le marqueur LIFECYCLE_BLOCKS recoit le corps (textes emails/lifecycle/copy.<locale>.json). Lien de desinscription en 1 clic, mention 18+ et aide du pays dans CHAQUE email, signature de Clement (21/10/2026). STATUT : REVIEW. }}<!DOCTYPE html>\n<html lang=\"{{htmlLang}}\" xmlns=\"http://www.w3.org/1999/xhtml\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"x-apple-disable-message-reformatting\">\n<meta name=\"format-detection\" content=\"telephone=no, date=no, address=no, email=no\">\n<meta name=\"color-scheme\" content=\"light dark\">\n<meta name=\"supported-color-schemes\" content=\"light dark\">\n<title>{{subject}}</title>\n<style>\n:root { color-scheme: light dark; supported-color-schemes: light dark; }\n@media (prefers-color-scheme: dark) {\n  .bg-page { background-color: #0b1118 !important; }\n  .bg-card { background-color: #131c27 !important; border-color: #263444 !important; }\n  .bg-soft { background-color: #18232f !important; border-color: #2f6f86 !important; }\n  .bg-note { background-color: #131c27 !important; border-color: #263444 !important; }\n  .tx { color: #e9eef4 !important; }\n  .tx-soft { color: #a9b6c4 !important; }\n  .bd { border-color: #263444 !important; }\n  .lnk { color: #62d6ec !important; }\n}\n[data-ogsc] .bg-page { background-color: #0b1118 !important; }\n[data-ogsc] .bg-card { background-color: #131c27 !important; }\n[data-ogsc] .bg-soft { background-color: #18232f !important; }\n[data-ogsc] .bg-note { background-color: #131c27 !important; }\n[data-ogsc] .tx { color: #e9eef4 !important; }\n[data-ogsc] .tx-soft { color: #a9b6c4 !important; }\n[data-ogsc] .lnk { color: #62d6ec !important; }\n@media only screen and (max-width: 620px) {\n  .container { width: 100% !important; }\n  .pad { padding: 20px !important; }\n}\n</style>\n</head>\n<body class=\"bg-page\" style=\"margin:0;padding:0;background-color:#f2f4f7;-webkit-text-size-adjust:100%;\">\n<div style=\"display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:#f2f4f7;\">{{preheader}}</div>\n<table role=\"presentation\" class=\"bg-page\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;background-color:#f2f4f7;border-collapse:collapse;\">\n<tr>\n<td align=\"center\" style=\"padding:24px 12px;\">\n<table role=\"presentation\" class=\"container\" width=\"600\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:600px;max-width:600px;border-collapse:collapse;\">\n<tr>\n<td class=\"tx\" style=\"padding:4px 4px 16px;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:24px;font-weight:bold;letter-spacing:3px;color:#0b1a2a;\">IASHARK</td>\n</tr>\n<tr>\n<td class=\"bg-card pad\" style=\"padding:32px;background-color:#ffffff;border:1px solid #dfe4ea;border-radius:12px;font-family:Arial,Helvetica,sans-serif;\">\n\n<h1 class=\"tx\" style=\"margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:24px;line-height:31px;font-weight:bold;color:#0b1a2a;\">{{title}}</h1>\n<p class=\"tx\" style=\"margin:0 0 14px;font-size:15px;line-height:24px;color:#1f2d3a;\">{{greeting}}</p>\n<!--LIFECYCLE_BLOCKS-->\n\n<p class=\"tx\" style=\"margin:6px 0 4px;font-size:15px;line-height:24px;color:#1f2d3a;\">{{signoff}}<br><strong>{{signature}}</strong></p>\n<p class=\"tx-soft\" style=\"margin:0 0 22px;font-size:13px;line-height:20px;color:#5d6b79;\">{{replyNote}}</p>\n\n<table role=\"presentation\" width=\"100%\" cellpadding=\"0\" cellspacing=\"0\" border=\"0\" style=\"width:100%;border-collapse:collapse;margin:0;\">\n<tr><td class=\"bg-note\" style=\"padding:14px 16px;background-color:#f4f7fa;border:1px solid #dfe4ea;border-radius:8px;font-family:Arial,Helvetica,sans-serif;\">\n<p class=\"tx-soft\" style=\"margin:0 0 6px;font-size:13px;line-height:19px;font-weight:bold;color:#4b5a69;\">{{rgTitle}}</p>\n<p class=\"tx-soft\" style=\"margin:0 0 6px;font-size:13px;line-height:19px;color:#4b5a69;\">{{rgBody}}</p>\n<p class=\"tx-soft\" style=\"margin:0;font-size:13px;line-height:19px;color:#4b5a69;\">{{rgHelp}} <a class=\"lnk\" href=\"{{helplineUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{helplineUrl}}</a> · <a class=\"lnk\" href=\"{{responsibleUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{rgMore}}</a></p>\n</td></tr>\n</table>\n\n</td>\n</tr>\n<tr>\n<td class=\"tx-soft\" style=\"padding:18px 8px 6px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#5d6b79;\">\n{{footerReason}}<br>\n<a class=\"lnk\" href=\"{{unsubscribeUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;font-weight:bold;\">{{unsubscribeLabel}}</a> · <a class=\"lnk\" href=\"{{manageUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{manageLabel}}</a><br>\n{{senderLabel}}{{sep}}IASHARK · {{companyOperatorName}} · {{companyAddress}}<br>\n<a class=\"lnk\" href=\"{{privacyUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{privacyLabel}}</a> · <a class=\"lnk\" href=\"{{legalUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">{{legalLabel}}</a> · <a class=\"lnk\" href=\"{{homeUrl}}\" target=\"_blank\" style=\"color:#0a6d8f;text-decoration:underline;\">iashark.com</a>\n</td>\n</tr>\n</table>\n</td>\n</tr>\n</table>\n</body>\n</html>\n",
    "text": "Subject: {{subject}}\n{{! Version texte du gabarit commun (emails/lifecycle/layout.html) : meme contenu, rien en moins. sep = separateur \"libelle : valeur\" de la langue. }}IASHARK\n\n{{title}}\n\n{{greeting}}\n\n<!--LIFECYCLE_BLOCKS-->\n\n{{signoff}}\n{{signature}}\n{{replyNote}}\n\n{{rgTitle}}\n{{rgBody}}\n{{rgHelp}} {{helplineUrl}}\n{{rgMore}}{{sep}}{{responsibleUrl}}\n\n--\n{{footerReason}}\n{{unsubscribeLabel}}{{sep}}{{unsubscribeUrl}}\n{{manageLabel}}{{sep}}{{manageUrl}}\n{{senderLabel}}{{sep}}IASHARK · {{companyOperatorName}} · {{companyAddress}}\n{{privacyLabel}}{{sep}}{{privacyUrl}}\n{{legalLabel}}{{sep}}{{legalUrl}}\n"
  },
  "copy": {
    "fr": {
      "_status": "REVIEW - textes a faire relire (relecture native) avant activation. Tutoiement, signes Clement, aucune promesse de gain, regles d'ecriture du 21/10/2026.",
      "locale": "fr",
      "common": {
        "greeting": "Bonjour,",
        "colon": " : ",
        "kickoff_label": "Coup d'envoi",
        "match_link": "Voir le match",
        "rg_title": "Jeu responsable · 18+",
        "rg_body": "IASHARK publie des analyses statistiques de football. Ce n'est pas un site de paris. Réservé aux personnes de 18 ans et plus.",
        "rg_help_phone": "Besoin d'aide ? {{helplineName}} : {{helplinePhone}}.",
        "rg_help_nophone": "Besoin d'aide ? {{helplineName}} :",
        "rg_more": "Nos ressources jeu responsable",
        "footer_reason_marketing": "Tu reçois cet e-mail parce que tu as accepté les e-mails d'IASHARK.",
        "footer_reason_welcome": "E-mail envoyé à la création de ton compte IASHARK.",
        "footer_reason_billing": "Cet e-mail concerne ton abonnement IASHARK Pro : il t'est envoyé même si tu ne reçois pas nos autres e-mails.",
        "unsubscribe": "Se désinscrire en 1 clic",
        "manage": "Gérer mes e-mails dans Mon compte",
        "privacy": "Confidentialité",
        "legal": "Mentions légales",
        "sender": "Expéditeur",
        "signoff": "À bientôt,",
        "signature": "Clément, IASHARK",
        "reply": "Une question ? Réponds simplement à cet e-mail, c'est moi qui lis.",
        "per_week": "par semaine",
        "per_month": "par mois",
        "per_year": "par an"
      },
      "campaigns": {
        "welcome": {
          "subject": "{{#hasFreeMatch}}Bienvenue sur IASHARK : ton match offert t'attend{{/hasFreeMatch}}{{^hasFreeMatch}}Bienvenue sur IASHARK : par où commencer{{/hasFreeMatch}}",
          "preheader": "Chaque jour, un match est offert avec son analyse complète.",
          "title": "Bienvenue sur IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "Ton compte gratuit est prêt. Chaque jour, un match est offert à tous les comptes, avec son analyse complète : la chance de chaque issue, le pari retenu avec sa cote, les scores les plus probables et les buteurs."
            },
            {
              "type": "p",
              "text": "Le match offert en ce moment :",
              "if": "hasFreeMatch"
            },
            {
              "type": "match",
              "if": "hasFreeMatch"
            },
            {
              "type": "cta",
              "if": "hasFreeMatch",
              "label": "Voir le match offert",
              "link": "freeMatch"
            },
            {
              "type": "cta",
              "unless": "hasFreeMatch",
              "label": "Voir les matchs du jour",
              "link": "home"
            },
            {
              "type": "p",
              "text": "Tu n'as pas demandé à recevoir les e-mails d'IASHARK : tu ne recevras que ceux liés à ton compte. Tu peux changer d'avis à tout moment dans Mon compte, rubrique Notifications.",
              "if": "notOptedIn"
            }
          ]
        },
        "free_match": {
          "subject": "Le match offert du jour : {{freeMatchHome}} – {{freeMatchAway}}",
          "preheader": "Son analyse complète est ouverte avec ton compte gratuit.",
          "title": "Ton match offert du jour",
          "blocks": [
            {
              "type": "p",
              "text": "Chaque jour, un match est offert à tous les comptes. Le voici :"
            },
            {
              "type": "match"
            },
            {
              "type": "p",
              "text": "Son analyse complète t'attend : la chance de chaque issue, le pari retenu avec sa cote, les scores les plus probables et les buteurs."
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
          "preheader": "Tous les matchs analysés chaque jour, et le prix sans détour.",
          "title": "Pro, c'est tous les matchs",
          "blocks": [
            {
              "type": "p",
              "text": "Avec ton compte gratuit, tu as un match offert par jour. Pro t'ouvre tout le reste :"
            },
            {
              "type": "list",
              "items": [
                "Tous les matchs analysés, chaque jour, au lieu d'un seul",
                "Le pari retenu sur chaque match, avec sa cote",
                "Les 3 buteurs du jour",
                "Les outils Pro : détecteur d'écarts, combiné et journal de tes décisions"
              ]
            },
            {
              "type": "p",
              "text": "Prix sur iashark.com ({{siteVersion}}) : {{proWeekPrice}} par semaine, {{proPrice}} par mois ou {{proYearPrice}} par an. Résiliable à tout moment depuis Mon compte.",
              "if": "hasProYear"
            },
            {
              "type": "p",
              "text": "Prix sur iashark.com ({{siteVersion}}) : {{proWeekPrice}} par semaine ou {{proPrice}} par mois. Résiliable à tout moment depuis Mon compte.",
              "if": "hasNoProYear"
            },
            {
              "type": "p",
              "text": "Prix sur iashark.com ({{siteVersion}}) : {{proPrice}} par mois, résiliable à tout moment depuis Mon compte.",
              "if": "hasOnlyProMonth"
            },
            {
              "type": "cta",
              "label": "Passer à Pro",
              "link": "pricing"
            },
            {
              "type": "p",
              "text": "Si le compte gratuit te suffit, tu n'as rien à faire : ton match offert reste là chaque jour."
            }
          ]
        },
        "checkout_abandoned": {
          "subject": "Ton abonnement Pro n'est pas allé au bout",
          "preheader": "Rien n'a été prélevé. Tu peux reprendre là où tu t'es arrêté.",
          "title": "Il ne manque que le paiement",
          "reply": "Un souci de carte ou une question sur l'offre ? Réponds simplement à cet e-mail : c'est moi qui lis, et je te réponds.",
          "blocks": [
            {
              "type": "p",
              "text": "Tu as commencé à t'abonner à IASHARK Pro, mais le paiement ne s'est pas terminé. Rien n'a été prélevé."
            },
            {
              "type": "p",
              "text": "Avec Pro, tu as chaque jour tous les matchs analysés, pas seulement le match offert : le pari retenu sur chaque match avec sa cote, les buteurs du jour et les outils Pro."
            },
            {
              "type": "cta",
              "label": "Reprendre mon abonnement",
              "link": "pricing"
            }
          ]
        },
        "inactive_7d": {
          "subject": "Les matchs de ce week-end sur IASHARK",
          "preheader": "Les affiches du week-end sont analysées.",
          "title": "Ce week-end sur IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "Les affiches de ce week-end sont analysées :"
            },
            {
              "type": "matches"
            },
            {
              "type": "p",
              "text": "Avec ton compte gratuit, un match reste offert chaque jour, analyse complète comprise."
            },
            {
              "type": "cta",
              "label": "Voir tous les matchs",
              "link": "home"
            }
          ]
        },
        "inactive_30d": {
          "subject": "Ton compte IASHARK est toujours là",
          "preheader": "Un match offert t'attend chaque jour avec ton compte gratuit.",
          "title": "Ton compte t'attend",
          "blocks": [
            {
              "type": "p",
              "text": "Ta dernière visite sur IASHARK remonte à un moment. Ton compte gratuit est toujours actif, et un match t'est offert chaque jour, avec son analyse complète."
            },
            {
              "type": "cta",
              "label": "Revenir sur IASHARK",
              "link": "home"
            },
            {
              "type": "p",
              "text": "Si ces e-mails ne te servent plus, désinscris-toi en un clic avec le lien en bas de ce message. Sans nouvelles de ta part, j'arrêterai de toute façon de t'écrire dans 30 jours."
            }
          ]
        },
        "pro_weekly_summary": {
          "subject": "Ton week-end Pro : les affiches sont analysées",
          "preheader": "Le pari de chaque match du week-end est prêt.",
          "title": "Ton week-end Pro",
          "blocks": [
            {
              "type": "p",
              "text": "Les affiches de ce week-end sont analysées. Dans ton espace Pro : le pari retenu sur chaque match avec sa cote, les buteurs du jour et tes outils."
            },
            {
              "type": "matches"
            },
            {
              "type": "cta",
              "label": "Ouvrir mon espace Pro",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Tu peux couper ce résumé dans Mon compte, rubrique Notifications."
            }
          ]
        },
        "trial_ending": {
          "subject": "Ton essai IASHARK Pro se termine dans 2 jours",
          "preheader": "Ensuite, Pro continue tout seul : {{trialAmount}} {{trialPer}}.",
          "title": "Ton essai Pro se termine bientôt",
          "blocks": [
            {
              "type": "p",
              "text": "Ton essai gratuit d'IASHARK Pro se termine le {{trialEndDate}}."
            },
            {
              "type": "p",
              "text": "Ensuite, ton abonnement Pro continue sans que tu aies rien à faire : {{trialAmount}} {{trialPer}}, prélevés sur ta carte enregistrée."
            },
            {
              "type": "p",
              "text": "D'ici là, profites-en à fond : tous les matchs analysés, le pari retenu sur chaque match avec sa cote, les buteurs du jour et les outils Pro."
            },
            {
              "type": "cta",
              "label": "Ouvrir mon espace Pro",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Si tu préfères arrêter, annule avant cette date dans Mon compte, rubrique Abonnement : rien ne sera prélevé."
            },
            {
              "type": "link",
              "label": "Gérer mon abonnement",
              "link": "subscription"
            }
          ]
        }
      }
    },
    "en": {
      "_status": "REVIEW - textes a faire relire (relecture native) avant activation. Tutoiement, signes Clement, aucune promesse de gain, regles d'ecriture du 21/10/2026.",
      "locale": "en",
      "common": {
        "greeting": "Hi,",
        "colon": ": ",
        "kickoff_label": "Kick-off",
        "match_link": "See the match",
        "rg_title": "Safer gambling · 18+",
        "rg_body": "IASHARK publishes statistical football analysis. We are not a bookmaker and do not take bets. For people aged 18 and over.",
        "rg_help_phone": "Need help? {{helplineName}}: {{helplinePhone}}.",
        "rg_help_nophone": "Need help? {{helplineName}}:",
        "rg_more": "Our safer gambling resources",
        "footer_reason_marketing": "You're receiving this email because you agreed to receive IASHARK emails.",
        "footer_reason_welcome": "Sent when you created your IASHARK account.",
        "footer_reason_billing": "This email is about your IASHARK Pro subscription, so it is sent even if you don't receive our other emails.",
        "unsubscribe": "Unsubscribe in one click",
        "manage": "Manage my emails in My account",
        "privacy": "Privacy",
        "legal": "Legal notice",
        "sender": "Sender",
        "signoff": "Speak soon,",
        "signature": "Clément, IASHARK",
        "reply": "Any question? Just reply to this email, I read every one.",
        "per_week": "per week",
        "per_month": "per month",
        "per_year": "per year"
      },
      "campaigns": {
        "welcome": {
          "subject": "{{#hasFreeMatch}}Welcome to IASHARK: your free match is waiting{{/hasFreeMatch}}{{^hasFreeMatch}}Welcome to IASHARK: where to start{{/hasFreeMatch}}",
          "preheader": "Every day, one match is free, with its full analysis.",
          "title": "Welcome to IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "Your free account is ready. Every day, one match is free for every account, with its full analysis: the chance of each outcome, the pick with its odds, the most likely scores and the scorers."
            },
            {
              "type": "p",
              "text": "The free match right now:",
              "if": "hasFreeMatch"
            },
            {
              "type": "match",
              "if": "hasFreeMatch"
            },
            {
              "type": "cta",
              "if": "hasFreeMatch",
              "label": "See the free match",
              "link": "freeMatch"
            },
            {
              "type": "cta",
              "unless": "hasFreeMatch",
              "label": "See today's matches",
              "link": "home"
            },
            {
              "type": "p",
              "text": "You did not ask to receive IASHARK emails, so you will only get the ones about your account. You can change your mind at any time in My account, under Notifications.",
              "if": "notOptedIn"
            }
          ]
        },
        "free_match": {
          "subject": "Today's free match: {{freeMatchHome}} – {{freeMatchAway}}",
          "preheader": "Its full analysis is open with your free account.",
          "title": "Your free match of the day",
          "blocks": [
            {
              "type": "p",
              "text": "Every day, one match is free for every account. Here it is:"
            },
            {
              "type": "match"
            },
            {
              "type": "p",
              "text": "Its full analysis is waiting for you: the chance of each outcome, the pick with its odds, the most likely scores and the scorers."
            },
            {
              "type": "cta",
              "label": "See the free analysis",
              "link": "freeMatch"
            }
          ]
        },
        "pro_features": {
          "subject": "What IASHARK Pro unlocks",
          "preheader": "Every match analysed, every day, and the price up front.",
          "title": "Pro means every match",
          "blocks": [
            {
              "type": "p",
              "text": "With your free account, you get one free match a day. Pro opens up everything else:"
            },
            {
              "type": "list",
              "items": [
                "Every match analysed, every day, instead of just one",
                "The pick for each match, with its odds",
                "Today's 3 top scorers",
                "The Pro tools: gap detector, accumulator and your decisions journal"
              ]
            },
            {
              "type": "p",
              "text": "Prices on the {{siteVersion}} version of the site: {{proWeekPrice}} per week, {{proPrice}} per month or {{proYearPrice}} per year. Cancel at any time from My account.",
              "if": "hasProYear"
            },
            {
              "type": "p",
              "text": "Prices on the {{siteVersion}} version of the site: {{proWeekPrice}} per week or {{proPrice}} per month. Cancel at any time from My account.",
              "if": "hasNoProYear"
            },
            {
              "type": "p",
              "text": "Price on the {{siteVersion}} version of the site: {{proPrice}} per month, cancel at any time from My account.",
              "if": "hasOnlyProMonth"
            },
            {
              "type": "cta",
              "label": "Go Pro",
              "link": "pricing"
            },
            {
              "type": "p",
              "text": "If the free account is enough for you, there is nothing to do: your free match is there every day."
            }
          ]
        },
        "checkout_abandoned": {
          "subject": "Your Pro subscription didn't go through",
          "preheader": "Nothing was charged. You can pick up where you left off.",
          "title": "Only the payment is missing",
          "reply": "Card trouble or a question about the plan? Just reply to this email: I read every one and I'll get back to you.",
          "blocks": [
            {
              "type": "p",
              "text": "You started subscribing to IASHARK Pro, but the payment wasn't completed. Nothing was charged."
            },
            {
              "type": "p",
              "text": "With Pro, you get every match analysed, every day, not just the free match: the pick for each match with its odds, the scorers of the day and the Pro tools."
            },
            {
              "type": "cta",
              "label": "Resume my subscription",
              "link": "pricing"
            }
          ]
        },
        "inactive_7d": {
          "subject": "This weekend's matches on IASHARK",
          "preheader": "The weekend's big games are analysed.",
          "title": "This weekend on IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "This weekend's big games are analysed:"
            },
            {
              "type": "matches"
            },
            {
              "type": "p",
              "text": "With your free account, one match is still free every day, full analysis included."
            },
            {
              "type": "cta",
              "label": "See all the matches",
              "link": "home"
            }
          ]
        },
        "inactive_30d": {
          "subject": "Your IASHARK account is still here",
          "preheader": "A free match is waiting for you every day with your free account.",
          "title": "Your account is waiting",
          "blocks": [
            {
              "type": "p",
              "text": "It has been a while since your last visit to IASHARK. Your free account is still active, and one match is free for you every day, with its full analysis."
            },
            {
              "type": "cta",
              "label": "Come back to IASHARK",
              "link": "home"
            },
            {
              "type": "p",
              "text": "If these emails are no longer useful to you, unsubscribe in one click with the link at the bottom of this message. If I don't hear from you, I will stop writing to you in 30 days anyway."
            }
          ]
        },
        "pro_weekly_summary": {
          "subject": "Your Pro weekend: the big games are analysed",
          "preheader": "The pick for every weekend match is ready.",
          "title": "Your Pro weekend",
          "blocks": [
            {
              "type": "p",
              "text": "This weekend's big games are analysed. In your Pro space: the pick for each match with its odds, the scorers of the day and your tools."
            },
            {
              "type": "matches"
            },
            {
              "type": "cta",
              "label": "Open my Pro space",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "You can turn off this summary in My account, under Notifications."
            }
          ]
        },
        "trial_ending": {
          "subject": "Your IASHARK Pro trial ends in 2 days",
          "preheader": "After that, Pro carries on by itself: {{trialAmount}} {{trialPer}}.",
          "title": "Your Pro trial ends soon",
          "blocks": [
            {
              "type": "p",
              "text": "Your free IASHARK Pro trial ends on {{trialEndDate}}."
            },
            {
              "type": "p",
              "text": "After that, your Pro subscription carries on with nothing for you to do: {{trialAmount}} {{trialPer}}, charged to your saved card."
            },
            {
              "type": "p",
              "text": "Until then, make the most of it: every match analysed, the pick for each match with its odds, the scorers of the day and the Pro tools."
            },
            {
              "type": "cta",
              "label": "Open my Pro space",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "If you'd rather stop, cancel before that date in My account, under Subscription: nothing will be charged."
            },
            {
              "type": "link",
              "label": "Manage my subscription",
              "link": "subscription"
            }
          ]
        }
      }
    },
    "es": {
      "_status": "REVIEW - textes a faire relire (relecture native) avant activation. Tutoiement, signes Clement, aucune promesse de gain, regles d'ecriture du 21/10/2026.",
      "locale": "es",
      "common": {
        "greeting": "Hola:",
        "colon": ": ",
        "kickoff_label": "Inicio",
        "match_link": "Ver el partido",
        "rg_title": "Juego responsable · 18+",
        "rg_body": "IASHARK publica análisis estadísticos de fútbol. No es una casa de apuestas y no acepta apuestas. Solo para mayores de 18 años.",
        "rg_help_phone": "¿Necesitas ayuda? {{helplineName}}: {{helplinePhone}}.",
        "rg_help_nophone": "¿Necesitas ayuda? {{helplineName}}:",
        "rg_more": "Nuestros recursos de juego responsable",
        "footer_reason_marketing": "Recibes este correo porque aceptaste recibir los correos de IASHARK.",
        "footer_reason_welcome": "Correo enviado al crear tu cuenta IASHARK.",
        "footer_reason_billing": "Este correo se refiere a tu suscripción IASHARK Pro: te llega aunque no recibas nuestros otros correos.",
        "unsubscribe": "Darse de baja con un clic",
        "manage": "Gestionar mis correos en Mi cuenta",
        "privacy": "Privacidad",
        "legal": "Aviso legal",
        "sender": "Remitente",
        "signoff": "Hasta pronto,",
        "signature": "Clément, IASHARK",
        "reply": "¿Alguna pregunta? Responde a este correo, lo leo yo.",
        "per_week": "a la semana",
        "per_month": "al mes",
        "per_year": "al año"
      },
      "campaigns": {
        "welcome": {
          "subject": "{{#hasFreeMatch}}IASHARK: tu partido gratis te espera{{/hasFreeMatch}}{{^hasFreeMatch}}IASHARK: por dónde empezar{{/hasFreeMatch}}",
          "preheader": "Cada día, un partido es gratis, con su análisis completo.",
          "title": "Te damos la bienvenida a IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "Tu cuenta gratuita está lista. Cada día, un partido es gratis para todas las cuentas, con su análisis completo: la probabilidad de cada resultado, la apuesta elegida con su cuota, los marcadores más probables y los goleadores."
            },
            {
              "type": "p",
              "text": "El partido gratis de ahora:",
              "if": "hasFreeMatch"
            },
            {
              "type": "match",
              "if": "hasFreeMatch"
            },
            {
              "type": "cta",
              "if": "hasFreeMatch",
              "label": "Ver el partido gratis",
              "link": "freeMatch"
            },
            {
              "type": "cta",
              "unless": "hasFreeMatch",
              "label": "Ver los partidos del día",
              "link": "home"
            },
            {
              "type": "p",
              "text": "No pediste recibir los correos de IASHARK: solo recibirás los relacionados con tu cuenta. Puedes cambiar de opinión cuando quieras en Mi cuenta, apartado Notificaciones.",
              "if": "notOptedIn"
            }
          ]
        },
        "free_match": {
          "subject": "El partido gratis del día: {{freeMatchHome}} – {{freeMatchAway}}",
          "preheader": "Su análisis completo está abierto con tu cuenta gratuita.",
          "title": "Tu partido gratis del día",
          "blocks": [
            {
              "type": "p",
              "text": "Cada día, un partido es gratis para todas las cuentas. Aquí lo tienes:"
            },
            {
              "type": "match"
            },
            {
              "type": "p",
              "text": "Su análisis completo te espera: la probabilidad de cada resultado, la apuesta elegida con su cuota, los marcadores más probables y los goleadores."
            },
            {
              "type": "cta",
              "label": "Ver el análisis gratis",
              "link": "freeMatch"
            }
          ]
        },
        "pro_features": {
          "subject": "Lo que desbloquea IASHARK Pro",
          "preheader": "Todos los partidos analizados cada día, y el precio sin rodeos.",
          "title": "Pro son todos los partidos",
          "blocks": [
            {
              "type": "p",
              "text": "Con tu cuenta gratuita tienes un partido gratis al día. Pro te abre el resto:"
            },
            {
              "type": "list",
              "items": [
                "Todos los partidos analizados, cada día, en lugar de uno solo",
                "La apuesta elegida en cada partido, con su cuota",
                "Los 3 goleadores del día",
                "Las herramientas Pro: detector de diferencias, combinada y diario de tus decisiones"
              ]
            },
            {
              "type": "p",
              "text": "Precios en iashark.com ({{siteVersion}}): {{proWeekPrice}} a la semana, {{proPrice}} al mes o {{proYearPrice}} al año. Cancelable en cualquier momento desde Mi cuenta.",
              "if": "hasProYear"
            },
            {
              "type": "p",
              "text": "Precios en iashark.com ({{siteVersion}}): {{proWeekPrice}} a la semana o {{proPrice}} al mes. Cancelable en cualquier momento desde Mi cuenta.",
              "if": "hasNoProYear"
            },
            {
              "type": "p",
              "text": "Precio en iashark.com ({{siteVersion}}): {{proPrice}} al mes, cancelable en cualquier momento desde Mi cuenta.",
              "if": "hasOnlyProMonth"
            },
            {
              "type": "cta",
              "label": "Pasar a Pro",
              "link": "pricing"
            },
            {
              "type": "p",
              "text": "Si la cuenta gratuita te basta, no tienes que hacer nada: tu partido gratis sigue ahí cada día."
            }
          ]
        },
        "checkout_abandoned": {
          "subject": "Tu suscripción Pro no llegó a completarse",
          "preheader": "No se te ha cobrado nada. Puedes retomarla donde la dejaste.",
          "title": "Solo falta el pago",
          "reply": "¿Algún problema con la tarjeta o una duda sobre la oferta? Responde a este correo: lo leo yo y te contesto.",
          "blocks": [
            {
              "type": "p",
              "text": "Empezaste a suscribirte a IASHARK Pro, pero el pago no se completó. No se te ha cobrado nada."
            },
            {
              "type": "p",
              "text": "Con Pro tienes cada día todos los partidos analizados, no solo el partido gratis: la apuesta elegida en cada partido con su cuota, los goleadores del día y las herramientas Pro."
            },
            {
              "type": "cta",
              "label": "Retomar mi suscripción",
              "link": "pricing"
            }
          ]
        },
        "inactive_7d": {
          "subject": "Los partidos de este fin de semana en IASHARK",
          "preheader": "Los grandes partidos del fin de semana ya están analizados.",
          "title": "Este fin de semana en IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "Los grandes partidos de este fin de semana ya están analizados:"
            },
            {
              "type": "matches"
            },
            {
              "type": "p",
              "text": "Con tu cuenta gratuita, un partido sigue siendo gratis cada día, con su análisis completo."
            },
            {
              "type": "cta",
              "label": "Ver todos los partidos",
              "link": "home"
            }
          ]
        },
        "inactive_30d": {
          "subject": "Tu cuenta IASHARK sigue aquí",
          "preheader": "Cada día te espera un partido gratis con tu cuenta gratuita.",
          "title": "Tu cuenta te espera",
          "blocks": [
            {
              "type": "p",
              "text": "Hace tiempo que no pasas por IASHARK. Tu cuenta gratuita sigue activa, y cada día tienes un partido gratis, con su análisis completo."
            },
            {
              "type": "cta",
              "label": "Volver a IASHARK",
              "link": "home"
            },
            {
              "type": "p",
              "text": "Si estos correos ya no te sirven, date de baja con un clic con el enlace al final de este mensaje. Si no sé nada de ti, dejaré de escribirte de todos modos dentro de 30 días."
            }
          ]
        },
        "pro_weekly_summary": {
          "subject": "Tu fin de semana Pro: los grandes partidos analizados",
          "preheader": "La apuesta de cada partido del fin de semana está lista.",
          "title": "Tu fin de semana Pro",
          "blocks": [
            {
              "type": "p",
              "text": "Los grandes partidos de este fin de semana ya están analizados. En tu espacio Pro: la apuesta elegida en cada partido con su cuota, los goleadores del día y tus herramientas."
            },
            {
              "type": "matches"
            },
            {
              "type": "cta",
              "label": "Abrir mi espacio Pro",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Puedes desactivar este resumen en Mi cuenta, apartado Notificaciones."
            }
          ]
        },
        "trial_ending": {
          "subject": "Tu prueba de IASHARK Pro termina en 2 días",
          "preheader": "Después, Pro sigue solo: {{trialAmount}} {{trialPer}}.",
          "title": "Tu prueba Pro termina pronto",
          "blocks": [
            {
              "type": "p",
              "text": "Tu prueba gratuita de IASHARK Pro termina el {{trialEndDate}}."
            },
            {
              "type": "p",
              "text": "Después, tu suscripción Pro continúa sin que tengas que hacer nada: {{trialAmount}} {{trialPer}}, con cargo a tu tarjeta registrada."
            },
            {
              "type": "p",
              "text": "Hasta entonces, aprovéchala al máximo: todos los partidos analizados, la apuesta elegida en cada partido con su cuota, los goleadores del día y las herramientas Pro."
            },
            {
              "type": "cta",
              "label": "Abrir mi espacio Pro",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Si prefieres dejarlo, cancela antes de esa fecha en Mi cuenta, apartado Suscripción: no se te cobrará nada."
            },
            {
              "type": "link",
              "label": "Gestionar mi suscripción",
              "link": "subscription"
            }
          ]
        }
      }
    },
    "es-mx": {
      "_status": "REVIEW - textes a faire relire (relecture native) avant activation. Tutoiement, signes Clement, aucune promesse de gain, regles d'ecriture du 21/10/2026.",
      "locale": "es-mx",
      "common": {
        "greeting": "Hola:",
        "colon": ": ",
        "kickoff_label": "Inicio",
        "match_link": "Ver el partido",
        "rg_title": "Juego responsable · 18+",
        "rg_body": "IASHARK ofrece análisis estadísticos de futbol. No es una casa de apuestas y no recibe apuestas. Solo para mayores de 18 años.",
        "rg_help_phone": "¿Necesitas orientación? {{helplineName}}: {{helplinePhone}}.",
        "rg_help_nophone": "¿Necesitas orientación? {{helplineName}}:",
        "rg_more": "Nuestros recursos de juego responsable",
        "footer_reason_marketing": "Recibes este correo porque aceptaste recibir los correos de IASHARK.",
        "footer_reason_welcome": "Correo enviado al crear tu cuenta IASHARK.",
        "footer_reason_billing": "Este correo tiene que ver con tu suscripción IASHARK Pro: te llega aunque no recibas nuestros otros correos.",
        "unsubscribe": "Darte de baja con un clic",
        "manage": "Administrar mis correos en Mi cuenta",
        "privacy": "Aviso de privacidad",
        "legal": "Aviso legal",
        "sender": "Remitente",
        "signoff": "Nos vemos pronto,",
        "signature": "Clément, IASHARK",
        "reply": "¿Alguna pregunta? Responde a este correo, yo lo leo.",
        "per_week": "a la semana",
        "per_month": "al mes",
        "per_year": "al año"
      },
      "campaigns": {
        "welcome": {
          "subject": "{{#hasFreeMatch}}IASHARK: tu partido gratis te espera{{/hasFreeMatch}}{{^hasFreeMatch}}IASHARK: por dónde empezar{{/hasFreeMatch}}",
          "preheader": "Todos los días, un partido es gratis, con su análisis completo.",
          "title": "Te damos la bienvenida a IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "Tu cuenta gratis está lista. Todos los días, un partido es gratis para todas las cuentas, con su análisis completo: la probabilidad de cada resultado, la apuesta elegida con su momio, los marcadores más probables y los goleadores."
            },
            {
              "type": "p",
              "text": "El partido gratis de ahora:",
              "if": "hasFreeMatch"
            },
            {
              "type": "match",
              "if": "hasFreeMatch"
            },
            {
              "type": "cta",
              "if": "hasFreeMatch",
              "label": "Ver el partido gratis",
              "link": "freeMatch"
            },
            {
              "type": "cta",
              "unless": "hasFreeMatch",
              "label": "Ver los partidos del día",
              "link": "home"
            },
            {
              "type": "p",
              "text": "No pediste recibir los correos de IASHARK: solo te llegarán los relacionados con tu cuenta. Puedes cambiar de opinión cuando quieras en Mi cuenta, sección Notificaciones.",
              "if": "notOptedIn"
            }
          ]
        },
        "free_match": {
          "subject": "El partido gratis del día: {{freeMatchHome}} – {{freeMatchAway}}",
          "preheader": "Su análisis completo está abierto con tu cuenta gratis.",
          "title": "Tu partido gratis del día",
          "blocks": [
            {
              "type": "p",
              "text": "Todos los días, un partido es gratis para todas las cuentas. Aquí está:"
            },
            {
              "type": "match"
            },
            {
              "type": "p",
              "text": "Su análisis completo te espera: la probabilidad de cada resultado, la apuesta elegida con su momio, los marcadores más probables y los goleadores."
            },
            {
              "type": "cta",
              "label": "Ver el análisis gratis",
              "link": "freeMatch"
            }
          ]
        },
        "pro_features": {
          "subject": "Lo que desbloquea IASHARK Pro",
          "preheader": "Todos los partidos analizados todos los días, y el precio sin rodeos.",
          "title": "Pro son todos los partidos",
          "blocks": [
            {
              "type": "p",
              "text": "Con tu cuenta gratis tienes un partido gratis al día. Pro te abre el resto:"
            },
            {
              "type": "list",
              "items": [
                "Todos los partidos analizados, todos los días, en lugar de uno solo",
                "La apuesta elegida en cada partido, con su momio",
                "Los 3 goleadores del día",
                "Las herramientas Pro: detector de diferencias, parlay y diario de tus decisiones"
              ]
            },
            {
              "type": "p",
              "text": "Precios en iashark.com ({{siteVersion}}): {{proWeekPrice}} a la semana, {{proPrice}} al mes o {{proYearPrice}} al año. Puedes cancelar cuando quieras desde Mi cuenta.",
              "if": "hasProYear"
            },
            {
              "type": "p",
              "text": "Precios en iashark.com ({{siteVersion}}): {{proWeekPrice}} a la semana o {{proPrice}} al mes. Puedes cancelar cuando quieras desde Mi cuenta.",
              "if": "hasNoProYear"
            },
            {
              "type": "p",
              "text": "Precio en iashark.com ({{siteVersion}}): {{proPrice}} al mes; puedes cancelar cuando quieras desde Mi cuenta.",
              "if": "hasOnlyProMonth"
            },
            {
              "type": "cta",
              "label": "Pasarme a Pro",
              "link": "pricing"
            },
            {
              "type": "p",
              "text": "Si la cuenta gratis te basta, no tienes que hacer nada: tu partido gratis sigue ahí todos los días."
            }
          ]
        },
        "checkout_abandoned": {
          "subject": "Tu suscripción Pro no se completó",
          "preheader": "No se hizo ningún cargo. Puedes retomarla donde la dejaste.",
          "title": "Solo falta el pago",
          "reply": "¿Algún problema con la tarjeta o alguna duda sobre el plan? Responde a este correo: yo lo leo y te contesto.",
          "blocks": [
            {
              "type": "p",
              "text": "Empezaste a suscribirte a IASHARK Pro, pero el pago no se completó. No se hizo ningún cargo."
            },
            {
              "type": "p",
              "text": "Con Pro tienes todos los días todos los partidos analizados, no solo el partido gratis: la apuesta elegida en cada partido con su momio, los goleadores del día y las herramientas Pro."
            },
            {
              "type": "cta",
              "label": "Retomar mi suscripción",
              "link": "pricing"
            }
          ]
        },
        "inactive_7d": {
          "subject": "Los partidos de este fin de semana en IASHARK",
          "preheader": "Los grandes partidos del fin de semana ya están analizados.",
          "title": "Este fin de semana en IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "Los grandes partidos de este fin de semana ya están analizados:"
            },
            {
              "type": "matches"
            },
            {
              "type": "p",
              "text": "Con tu cuenta gratis, un partido sigue siendo gratis todos los días, con su análisis completo."
            },
            {
              "type": "cta",
              "label": "Ver todos los partidos",
              "link": "home"
            }
          ]
        },
        "inactive_30d": {
          "subject": "Tu cuenta IASHARK sigue aquí",
          "preheader": "Todos los días te espera un partido gratis con tu cuenta gratis.",
          "title": "Tu cuenta te espera",
          "blocks": [
            {
              "type": "p",
              "text": "Hace tiempo que no entras a IASHARK. Tu cuenta gratis sigue activa, y todos los días tienes un partido gratis, con su análisis completo."
            },
            {
              "type": "cta",
              "label": "Volver a IASHARK",
              "link": "home"
            },
            {
              "type": "p",
              "text": "Si estos correos ya no te sirven, date de baja con un clic con el enlace al final de este mensaje. Si no sé nada de ti, de todos modos dejaré de escribirte en 30 días."
            }
          ]
        },
        "pro_weekly_summary": {
          "subject": "Tu fin de semana Pro: los grandes partidos analizados",
          "preheader": "La apuesta de cada partido del fin de semana está lista.",
          "title": "Tu fin de semana Pro",
          "blocks": [
            {
              "type": "p",
              "text": "Los grandes partidos de este fin de semana ya están analizados. En tu espacio Pro: la apuesta elegida en cada partido con su momio, los goleadores del día y tus herramientas."
            },
            {
              "type": "matches"
            },
            {
              "type": "cta",
              "label": "Abrir mi espacio Pro",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Puedes desactivar este resumen en Mi cuenta, sección Notificaciones."
            }
          ]
        },
        "trial_ending": {
          "subject": "Tu prueba de IASHARK Pro termina en 2 días",
          "preheader": "Después, Pro sigue solo: {{trialAmount}} {{trialPer}}.",
          "title": "Tu prueba Pro está por terminar",
          "blocks": [
            {
              "type": "p",
              "text": "Tu prueba gratis de IASHARK Pro termina el {{trialEndDate}}."
            },
            {
              "type": "p",
              "text": "Después, tu suscripción Pro continúa sin que tengas que hacer nada: {{trialAmount}} {{trialPer}}, con cargo a tu tarjeta registrada."
            },
            {
              "type": "p",
              "text": "Mientras tanto, aprovéchala al máximo: todos los partidos analizados, la apuesta elegida en cada partido con su momio, los goleadores del día y las herramientas Pro."
            },
            {
              "type": "cta",
              "label": "Abrir mi espacio Pro",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Si prefieres no continuar, cancela antes de esa fecha en Mi cuenta, sección Suscripción: no se hará ningún cargo."
            },
            {
              "type": "link",
              "label": "Administrar mi suscripción",
              "link": "subscription"
            }
          ]
        }
      }
    },
    "de": {
      "_status": "REVIEW - textes a faire relire (relecture native) avant activation. Tutoiement, signes Clement, aucune promesse de gain, regles d'ecriture du 21/10/2026.",
      "locale": "de",
      "common": {
        "greeting": "Hallo,",
        "colon": ": ",
        "kickoff_label": "Anstoß",
        "match_link": "Zum Spiel",
        "rg_title": "Verantwortungsvolles Spielen · 18+",
        "rg_body": "IASHARK veröffentlicht statistische Fußballanalysen. Wir sind kein Wettanbieter und nehmen keine Wetten an. Nur für Personen ab 18 Jahren.",
        "rg_help_phone": "Brauchst du Hilfe? {{helplineName}}: {{helplinePhone}}.",
        "rg_help_nophone": "Brauchst du Hilfe? {{helplineName}}:",
        "rg_more": "Unsere Hinweise zum verantwortungsvollen Spielen",
        "footer_reason_marketing": "Du erhältst diese E-Mail, weil du den E-Mails von IASHARK zugestimmt hast.",
        "footer_reason_welcome": "Gesendet bei der Erstellung deines IASHARK-Kontos.",
        "footer_reason_billing": "Diese E-Mail betrifft dein IASHARK-Pro-Abo und wird auch gesendet, wenn du unsere anderen E-Mails nicht erhältst.",
        "unsubscribe": "Mit einem Klick abmelden",
        "manage": "E-Mails in Mein Konto verwalten",
        "privacy": "Datenschutz",
        "legal": "Impressum",
        "sender": "Absender",
        "signoff": "Bis bald,",
        "signature": "Clément, IASHARK",
        "reply": "Eine Frage? Antworte einfach auf diese E-Mail, ich lese sie selbst.",
        "per_week": "pro Woche",
        "per_month": "pro Monat",
        "per_year": "pro Jahr"
      },
      "campaigns": {
        "welcome": {
          "subject": "{{#hasFreeMatch}}Willkommen bei IASHARK: Dein Gratisspiel wartet{{/hasFreeMatch}}{{^hasFreeMatch}}Willkommen bei IASHARK: So fängst du an{{/hasFreeMatch}}",
          "preheader": "Jeden Tag ist ein Spiel gratis, mit seiner vollständigen Analyse.",
          "title": "Willkommen bei IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "Dein kostenloses Konto ist bereit. Jeden Tag ist ein Spiel für alle Konten gratis, mit seiner vollständigen Analyse: die Chance jedes Ausgangs, der gewählte Tipp mit seiner Quote, die wahrscheinlichsten Ergebnisse und die Torschützen."
            },
            {
              "type": "p",
              "text": "Das aktuelle Gratisspiel:",
              "if": "hasFreeMatch"
            },
            {
              "type": "match",
              "if": "hasFreeMatch"
            },
            {
              "type": "cta",
              "if": "hasFreeMatch",
              "label": "Gratisspiel ansehen",
              "link": "freeMatch"
            },
            {
              "type": "cta",
              "unless": "hasFreeMatch",
              "label": "Spiele des Tages ansehen",
              "link": "home"
            },
            {
              "type": "p",
              "text": "Du hast keine E-Mails von IASHARK angefordert: Du erhältst nur die, die dein Konto betreffen. Du kannst deine Meinung jederzeit in Mein Konto unter Benachrichtigungen ändern.",
              "if": "notOptedIn"
            }
          ]
        },
        "free_match": {
          "subject": "Das Gratisspiel des Tages: {{freeMatchHome}} – {{freeMatchAway}}",
          "preheader": "Seine vollständige Analyse ist mit deinem kostenlosen Konto frei.",
          "title": "Dein Gratisspiel des Tages",
          "blocks": [
            {
              "type": "p",
              "text": "Jeden Tag ist ein Spiel für alle Konten gratis. Hier ist es:"
            },
            {
              "type": "match"
            },
            {
              "type": "p",
              "text": "Seine vollständige Analyse wartet auf dich: die Chance jedes Ausgangs, der gewählte Tipp mit seiner Quote, die wahrscheinlichsten Ergebnisse und die Torschützen."
            },
            {
              "type": "cta",
              "label": "Gratis-Analyse ansehen",
              "link": "freeMatch"
            }
          ]
        },
        "pro_features": {
          "subject": "Was IASHARK Pro freischaltet",
          "preheader": "Alle Spiele analysiert, jeden Tag, und der Preis ohne Umschweife.",
          "title": "Pro heißt: alle Spiele",
          "blocks": [
            {
              "type": "p",
              "text": "Mit deinem kostenlosen Konto hast du ein Gratisspiel pro Tag. Pro öffnet dir alles andere:"
            },
            {
              "type": "list",
              "items": [
                "Alle Spiele analysiert, jeden Tag, statt nur einem",
                "Der gewählte Tipp zu jedem Spiel, mit seiner Quote",
                "Die 3 Torschützen des Tages",
                "Die Pro-Tools: Abweichungs-Detektor, Kombiwette und dein Entscheidungsjournal"
              ]
            },
            {
              "type": "p",
              "text": "Preise auf iashark.com ({{siteVersion}}): {{proWeekPrice}} pro Woche, {{proPrice}} pro Monat oder {{proYearPrice}} pro Jahr. Jederzeit in Mein Konto kündbar.",
              "if": "hasProYear"
            },
            {
              "type": "p",
              "text": "Preise auf iashark.com ({{siteVersion}}): {{proWeekPrice}} pro Woche oder {{proPrice}} pro Monat. Jederzeit in Mein Konto kündbar.",
              "if": "hasNoProYear"
            },
            {
              "type": "p",
              "text": "Preis auf iashark.com ({{siteVersion}}): {{proPrice}} pro Monat, jederzeit in Mein Konto kündbar.",
              "if": "hasOnlyProMonth"
            },
            {
              "type": "cta",
              "label": "Zu Pro wechseln",
              "link": "pricing"
            },
            {
              "type": "p",
              "text": "Wenn dir das kostenlose Konto reicht, musst du nichts tun: Dein Gratisspiel ist jeden Tag da."
            }
          ]
        },
        "checkout_abandoned": {
          "subject": "Dein Pro-Abo ist nicht durchgegangen",
          "preheader": "Es wurde nichts abgebucht. Du kannst dort weitermachen, wo du aufgehört hast.",
          "title": "Es fehlt nur noch die Zahlung",
          "reply": "Probleme mit der Karte oder eine Frage zum Angebot? Antworte einfach auf diese E-Mail: Ich lese sie selbst und melde mich bei dir.",
          "blocks": [
            {
              "type": "p",
              "text": "Du hast mit dem Abschluss von IASHARK Pro begonnen, aber die Zahlung ist nicht durchgegangen. Es wurde nichts abgebucht."
            },
            {
              "type": "p",
              "text": "Mit Pro bekommst du jeden Tag alle Spiele analysiert, nicht nur das Gratisspiel: den gewählten Tipp zu jedem Spiel mit seiner Quote, die Torschützen des Tages und die Pro-Tools."
            },
            {
              "type": "cta",
              "label": "Abo fortsetzen",
              "link": "pricing"
            }
          ]
        },
        "inactive_7d": {
          "subject": "Die Spiele dieses Wochenendes auf IASHARK",
          "preheader": "Die Topspiele des Wochenendes sind analysiert.",
          "title": "Dieses Wochenende auf IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "Die Topspiele dieses Wochenendes sind analysiert:"
            },
            {
              "type": "matches"
            },
            {
              "type": "p",
              "text": "Mit deinem kostenlosen Konto bleibt jeden Tag ein Spiel gratis, mit vollständiger Analyse."
            },
            {
              "type": "cta",
              "label": "Alle Spiele ansehen",
              "link": "home"
            }
          ]
        },
        "inactive_30d": {
          "subject": "Dein IASHARK-Konto ist noch da",
          "preheader": "Jeden Tag wartet ein Gratisspiel auf dich.",
          "title": "Dein Konto wartet auf dich",
          "blocks": [
            {
              "type": "p",
              "text": "Dein letzter Besuch auf IASHARK ist schon eine Weile her. Dein kostenloses Konto ist weiterhin aktiv, und jeden Tag ist ein Spiel für dich gratis, mit seiner vollständigen Analyse."
            },
            {
              "type": "cta",
              "label": "Zurück zu IASHARK",
              "link": "home"
            },
            {
              "type": "p",
              "text": "Wenn dir diese E-Mails nicht mehr nützen, melde dich mit dem Link unten in dieser Nachricht mit einem Klick ab. Ohne Rückmeldung von dir höre ich ohnehin in 30 Tagen auf, dir zu schreiben."
            }
          ]
        },
        "pro_weekly_summary": {
          "subject": "Dein Pro-Wochenende: Die Topspiele sind analysiert",
          "preheader": "Der Tipp zu jedem Spiel des Wochenendes ist bereit.",
          "title": "Dein Pro-Wochenende",
          "blocks": [
            {
              "type": "p",
              "text": "Die Topspiele dieses Wochenendes sind analysiert. In deinem Pro-Bereich: der gewählte Tipp zu jedem Spiel mit seiner Quote, die Torschützen des Tages und deine Tools."
            },
            {
              "type": "matches"
            },
            {
              "type": "cta",
              "label": "Meinen Pro-Bereich öffnen",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Du kannst diese Zusammenfassung in Mein Konto unter Benachrichtigungen abschalten."
            }
          ]
        },
        "trial_ending": {
          "subject": "Dein IASHARK-Pro-Test endet in 2 Tagen",
          "preheader": "Danach läuft Pro einfach weiter: {{trialAmount}} {{trialPer}}.",
          "title": "Dein Pro-Test endet bald",
          "blocks": [
            {
              "type": "p",
              "text": "Dein kostenloser IASHARK-Pro-Test endet am {{trialEndDate}}."
            },
            {
              "type": "p",
              "text": "Danach läuft dein Pro-Abo weiter, ohne dass du etwas tun musst: {{trialAmount}} {{trialPer}}, abgebucht von deiner hinterlegten Karte."
            },
            {
              "type": "p",
              "text": "Bis dahin: Nutze alles voll aus, mit allen analysierten Spielen, dem gewählten Tipp zu jedem Spiel mit seiner Quote, den Torschützen des Tages und den Pro-Tools."
            },
            {
              "type": "cta",
              "label": "Meinen Pro-Bereich öffnen",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Wenn du lieber aufhören möchtest, kündige vor diesem Datum in Mein Konto unter Abonnement: Es wird nichts abgebucht."
            },
            {
              "type": "link",
              "label": "Mein Abo verwalten",
              "link": "subscription"
            }
          ]
        }
      }
    },
    "it": {
      "_status": "REVIEW - textes a faire relire (relecture native) avant activation. Tutoiement, signes Clement, aucune promesse de gain, regles d'ecriture du 21/10/2026.",
      "locale": "it",
      "common": {
        "greeting": "Ciao,",
        "colon": ": ",
        "kickoff_label": "Calcio d'inizio",
        "match_link": "Vedi la partita",
        "rg_title": "Gioco responsabile · 18+",
        "rg_body": "IASHARK pubblica analisi statistiche sul calcio. Non è un sito di scommesse e non accetta giocate. Riservato ai maggiori di 18 anni.",
        "rg_help_phone": "Hai bisogno di aiuto? {{helplineName}}: {{helplinePhone}}.",
        "rg_help_nophone": "Hai bisogno di aiuto? {{helplineName}}:",
        "rg_more": "Le nostre risorse sul gioco responsabile",
        "footer_reason_marketing": "Ricevi questa email perché hai accettato di ricevere le email di IASHARK.",
        "footer_reason_welcome": "Email inviata alla creazione del tuo account IASHARK.",
        "footer_reason_billing": "Questa email riguarda il tuo abbonamento IASHARK Pro: ti arriva anche se non ricevi le nostre altre email.",
        "unsubscribe": "Annulla l'iscrizione con un clic",
        "manage": "Gestisci le email in Il mio account",
        "privacy": "Privacy",
        "legal": "Note legali",
        "sender": "Mittente",
        "signoff": "A presto,",
        "signature": "Clément, IASHARK",
        "reply": "Una domanda? Rispondi a questa email, la leggo io.",
        "per_week": "a settimana",
        "per_month": "al mese",
        "per_year": "all'anno"
      },
      "campaigns": {
        "welcome": {
          "subject": "{{#hasFreeMatch}}IASHARK: la tua partita gratuita ti aspetta{{/hasFreeMatch}}{{^hasFreeMatch}}IASHARK: da dove iniziare{{/hasFreeMatch}}",
          "preheader": "Ogni giorno una partita è gratuita, con la sua analisi completa.",
          "title": "Ti diamo il benvenuto su IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "Il tuo account gratuito è pronto. Ogni giorno una partita è gratuita per tutti gli account, con la sua analisi completa: la probabilità di ogni esito, la scommessa scelta con la sua quota, i risultati più probabili e i marcatori."
            },
            {
              "type": "p",
              "text": "La partita gratuita del momento:",
              "if": "hasFreeMatch"
            },
            {
              "type": "match",
              "if": "hasFreeMatch"
            },
            {
              "type": "cta",
              "if": "hasFreeMatch",
              "label": "Vedi la partita gratuita",
              "link": "freeMatch"
            },
            {
              "type": "cta",
              "unless": "hasFreeMatch",
              "label": "Vedi le partite del giorno",
              "link": "home"
            },
            {
              "type": "p",
              "text": "Non hai chiesto di ricevere le email di IASHARK: riceverai solo quelle legate al tuo account. Puoi cambiare idea in qualsiasi momento in Il mio account, sezione Notifiche.",
              "if": "notOptedIn"
            }
          ]
        },
        "free_match": {
          "subject": "La partita gratuita del giorno: {{freeMatchHome}} – {{freeMatchAway}}",
          "preheader": "La sua analisi completa è aperta con il tuo account gratuito.",
          "title": "La tua partita gratuita del giorno",
          "blocks": [
            {
              "type": "p",
              "text": "Ogni giorno una partita è gratuita per tutti gli account. Eccola:"
            },
            {
              "type": "match"
            },
            {
              "type": "p",
              "text": "La sua analisi completa ti aspetta: la probabilità di ogni esito, la scommessa scelta con la sua quota, i risultati più probabili e i marcatori."
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
          "preheader": "Tutte le partite analizzate ogni giorno, e il prezzo senza giri di parole.",
          "title": "Pro vuol dire tutte le partite",
          "blocks": [
            {
              "type": "p",
              "text": "Con il tuo account gratuito hai una partita gratuita al giorno. Pro ti apre tutto il resto:"
            },
            {
              "type": "list",
              "items": [
                "Tutte le partite analizzate, ogni giorno, invece di una sola",
                "La scommessa scelta su ogni partita, con la sua quota",
                "I 3 marcatori del giorno",
                "Gli strumenti Pro: rilevatore di scarti, multipla e diario delle tue decisioni"
              ]
            },
            {
              "type": "p",
              "text": "Prezzi su iashark.com ({{siteVersion}}): {{proWeekPrice}} a settimana, {{proPrice}} al mese o {{proYearPrice}} all'anno. Disdicibile in qualsiasi momento da Il mio account.",
              "if": "hasProYear"
            },
            {
              "type": "p",
              "text": "Prezzi su iashark.com ({{siteVersion}}): {{proWeekPrice}} a settimana o {{proPrice}} al mese. Disdicibile in qualsiasi momento da Il mio account.",
              "if": "hasNoProYear"
            },
            {
              "type": "p",
              "text": "Prezzo su iashark.com ({{siteVersion}}): {{proPrice}} al mese, disdicibile in qualsiasi momento da Il mio account.",
              "if": "hasOnlyProMonth"
            },
            {
              "type": "cta",
              "label": "Passa a Pro",
              "link": "pricing"
            },
            {
              "type": "p",
              "text": "Se l'account gratuito ti basta, non devi fare nulla: la tua partita gratuita è lì ogni giorno."
            }
          ]
        },
        "checkout_abandoned": {
          "subject": "Il tuo abbonamento Pro non è andato a buon fine",
          "preheader": "Non ti è stato addebitato nulla. Puoi riprendere da dove avevi lasciato.",
          "title": "Manca solo il pagamento",
          "reply": "Un problema con la carta o una domanda sull'offerta? Rispondi a questa email: la leggo io e ti rispondo.",
          "blocks": [
            {
              "type": "p",
              "text": "Hai iniziato ad abbonarti a IASHARK Pro, ma il pagamento non si è concluso. Non ti è stato addebitato nulla."
            },
            {
              "type": "p",
              "text": "Con Pro hai ogni giorno tutte le partite analizzate, non solo la partita gratuita: la scommessa scelta su ogni partita con la sua quota, i marcatori del giorno e gli strumenti Pro."
            },
            {
              "type": "cta",
              "label": "Riprendi il mio abbonamento",
              "link": "pricing"
            }
          ]
        },
        "inactive_7d": {
          "subject": "Le partite di questo weekend su IASHARK",
          "preheader": "I big match del weekend sono analizzati.",
          "title": "Questo weekend su IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "I big match di questo weekend sono analizzati:"
            },
            {
              "type": "matches"
            },
            {
              "type": "p",
              "text": "Con il tuo account gratuito, ogni giorno una partita resta gratuita, con l'analisi completa."
            },
            {
              "type": "cta",
              "label": "Vedi tutte le partite",
              "link": "home"
            }
          ]
        },
        "inactive_30d": {
          "subject": "Il tuo account IASHARK è ancora qui",
          "preheader": "Ogni giorno ti aspetta una partita gratuita con il tuo account.",
          "title": "Il tuo account ti aspetta",
          "blocks": [
            {
              "type": "p",
              "text": "La tua ultima visita su IASHARK risale a un po' di tempo fa. Il tuo account gratuito è ancora attivo, e ogni giorno una partita è gratuita per te, con la sua analisi completa."
            },
            {
              "type": "cta",
              "label": "Torna su IASHARK",
              "link": "home"
            },
            {
              "type": "p",
              "text": "Se queste email non ti servono più, annulla l'iscrizione con un clic dal link in fondo a questo messaggio. Senza notizie da parte tua, smetterò comunque di scriverti tra 30 giorni."
            }
          ]
        },
        "pro_weekly_summary": {
          "subject": "Il tuo weekend Pro: i big match sono analizzati",
          "preheader": "La scommessa di ogni partita del weekend è pronta.",
          "title": "Il tuo weekend Pro",
          "blocks": [
            {
              "type": "p",
              "text": "I big match di questo weekend sono analizzati. Nel tuo spazio Pro: la scommessa scelta su ogni partita con la sua quota, i marcatori del giorno e i tuoi strumenti."
            },
            {
              "type": "matches"
            },
            {
              "type": "cta",
              "label": "Apri il mio spazio Pro",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Puoi disattivare questo riepilogo in Il mio account, sezione Notifiche."
            }
          ]
        },
        "trial_ending": {
          "subject": "La tua prova di IASHARK Pro finisce tra 2 giorni",
          "preheader": "Poi Pro continua da solo: {{trialAmount}} {{trialPer}}.",
          "title": "La tua prova Pro sta per finire",
          "blocks": [
            {
              "type": "p",
              "text": "La tua prova gratuita di IASHARK Pro finisce {{trialEndDate}}."
            },
            {
              "type": "p",
              "text": "Poi il tuo abbonamento Pro continua senza che tu debba fare nulla: {{trialAmount}} {{trialPer}}, addebitati sulla carta registrata."
            },
            {
              "type": "p",
              "text": "Fino ad allora, sfruttalo al massimo: tutte le partite analizzate, la scommessa scelta su ogni partita con la sua quota, i marcatori del giorno e gli strumenti Pro."
            },
            {
              "type": "cta",
              "label": "Apri il mio spazio Pro",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Se preferisci fermarti, annulla prima di quella data in Il mio account, sezione Abbonamento: non ti verrà addebitato nulla."
            },
            {
              "type": "link",
              "label": "Gestisci il mio abbonamento",
              "link": "subscription"
            }
          ]
        }
      }
    },
    "pt": {
      "_status": "REVIEW - textes a faire relire (relecture native) avant activation. Tutoiement, signes Clement, aucune promesse de gain, regles d'ecriture du 21/10/2026.",
      "locale": "pt",
      "common": {
        "greeting": "Olá,",
        "colon": ": ",
        "kickoff_label": "Início do jogo",
        "match_link": "Ver o jogo",
        "rg_title": "Jogo responsável · 18+",
        "rg_body": "O IASHARK publica análises estatísticas de futebol. Não é um site de apostas e não aceita apostas. Reservado a maiores de 18 anos.",
        "rg_help_phone": "Precisas de ajuda? {{helplineName}}: {{helplinePhone}}.",
        "rg_help_nophone": "Precisas de ajuda? {{helplineName}}:",
        "rg_more": "Os nossos recursos de jogo responsável",
        "footer_reason_marketing": "Recebes este email porque aceitaste receber os emails do IASHARK.",
        "footer_reason_welcome": "Email enviado na criação da tua conta IASHARK.",
        "footer_reason_billing": "Este email diz respeito à tua subscrição IASHARK Pro: é enviado mesmo que não recebas os nossos outros emails.",
        "unsubscribe": "Cancelar a subscrição com um clique",
        "manage": "Gerir os meus emails em A minha conta",
        "privacy": "Privacidade",
        "legal": "Aviso legal",
        "sender": "Remetente",
        "signoff": "Até breve,",
        "signature": "Clément, IASHARK",
        "reply": "Uma pergunta? Responde a este email, sou eu que leio.",
        "per_week": "por semana",
        "per_month": "por mês",
        "per_year": "por ano"
      },
      "campaigns": {
        "welcome": {
          "subject": "{{#hasFreeMatch}}IASHARK: o teu jogo oferecido está à tua espera{{/hasFreeMatch}}{{^hasFreeMatch}}IASHARK: por onde começar{{/hasFreeMatch}}",
          "preheader": "Todos os dias, um jogo é oferecido, com a sua análise completa.",
          "title": "Damos-te as boas-vindas ao IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "A tua conta gratuita está pronta. Todos os dias, um jogo é oferecido a todas as contas, com a sua análise completa: a probabilidade de cada resultado, a aposta escolhida com a sua odd, os resultados mais prováveis e os marcadores."
            },
            {
              "type": "p",
              "text": "O jogo oferecido neste momento:",
              "if": "hasFreeMatch"
            },
            {
              "type": "match",
              "if": "hasFreeMatch"
            },
            {
              "type": "cta",
              "if": "hasFreeMatch",
              "label": "Ver o jogo oferecido",
              "link": "freeMatch"
            },
            {
              "type": "cta",
              "unless": "hasFreeMatch",
              "label": "Ver os jogos do dia",
              "link": "home"
            },
            {
              "type": "p",
              "text": "Não pediste para receber os emails do IASHARK: só vais receber os que dizem respeito à tua conta. Podes mudar de ideias a qualquer momento em A minha conta, secção Notificações.",
              "if": "notOptedIn"
            }
          ]
        },
        "free_match": {
          "subject": "O jogo oferecido do dia: {{freeMatchHome}} – {{freeMatchAway}}",
          "preheader": "A sua análise completa está aberta com a tua conta gratuita.",
          "title": "O teu jogo oferecido do dia",
          "blocks": [
            {
              "type": "p",
              "text": "Todos os dias, um jogo é oferecido a todas as contas. Aqui está:"
            },
            {
              "type": "match"
            },
            {
              "type": "p",
              "text": "A sua análise completa está à tua espera: a probabilidade de cada resultado, a aposta escolhida com a sua odd, os resultados mais prováveis e os marcadores."
            },
            {
              "type": "cta",
              "label": "Ver a análise oferecida",
              "link": "freeMatch"
            }
          ]
        },
        "pro_features": {
          "subject": "O que o IASHARK Pro desbloqueia",
          "preheader": "Todos os jogos analisados todos os dias, e o preço sem rodeios.",
          "title": "Pro são todos os jogos",
          "blocks": [
            {
              "type": "p",
              "text": "Com a tua conta gratuita, tens um jogo oferecido por dia. O Pro abre-te tudo o resto:"
            },
            {
              "type": "list",
              "items": [
                "Todos os jogos analisados, todos os dias, em vez de um só",
                "A aposta escolhida em cada jogo, com a sua odd",
                "Os 3 marcadores do dia",
                "As ferramentas Pro: detetor de diferenças, múltipla e diário das tuas decisões"
              ]
            },
            {
              "type": "p",
              "text": "Preços em iashark.com ({{siteVersion}}): {{proWeekPrice}} por semana, {{proPrice}} por mês ou {{proYearPrice}} por ano. Cancelável a qualquer momento em A minha conta.",
              "if": "hasProYear"
            },
            {
              "type": "p",
              "text": "Preços em iashark.com ({{siteVersion}}): {{proWeekPrice}} por semana ou {{proPrice}} por mês. Cancelável a qualquer momento em A minha conta.",
              "if": "hasNoProYear"
            },
            {
              "type": "p",
              "text": "Preço em iashark.com ({{siteVersion}}): {{proPrice}} por mês, cancelável a qualquer momento em A minha conta.",
              "if": "hasOnlyProMonth"
            },
            {
              "type": "cta",
              "label": "Passar a Pro",
              "link": "pricing"
            },
            {
              "type": "p",
              "text": "Se a conta gratuita te basta, não tens de fazer nada: o teu jogo oferecido continua lá todos os dias."
            }
          ]
        },
        "checkout_abandoned": {
          "subject": "A tua subscrição Pro não ficou concluída",
          "preheader": "Nada foi cobrado. Podes retomar onde paraste.",
          "title": "Só falta o pagamento",
          "reply": "Algum problema com o cartão ou uma dúvida sobre a oferta? Responde a este email: sou eu que leio e respondo.",
          "blocks": [
            {
              "type": "p",
              "text": "Começaste a subscrever o IASHARK Pro, mas o pagamento não foi concluído. Nada foi cobrado."
            },
            {
              "type": "p",
              "text": "Com o Pro, tens todos os dias todos os jogos analisados, não só o jogo oferecido: a aposta escolhida em cada jogo com a sua odd, os marcadores do dia e as ferramentas Pro."
            },
            {
              "type": "cta",
              "label": "Retomar a minha subscrição",
              "link": "pricing"
            }
          ]
        },
        "inactive_7d": {
          "subject": "Os jogos deste fim de semana no IASHARK",
          "preheader": "Os grandes jogos do fim de semana estão analisados.",
          "title": "Este fim de semana no IASHARK",
          "blocks": [
            {
              "type": "p",
              "text": "Os grandes jogos deste fim de semana estão analisados:"
            },
            {
              "type": "matches"
            },
            {
              "type": "p",
              "text": "Com a tua conta gratuita, um jogo continua a ser oferecido todos os dias, com a análise completa."
            },
            {
              "type": "cta",
              "label": "Ver todos os jogos",
              "link": "home"
            }
          ]
        },
        "inactive_30d": {
          "subject": "A tua conta IASHARK continua aqui",
          "preheader": "Todos os dias, um jogo oferecido está à tua espera.",
          "title": "A tua conta está à tua espera",
          "blocks": [
            {
              "type": "p",
              "text": "A tua última visita ao IASHARK já foi há algum tempo. A tua conta gratuita continua ativa, e todos os dias tens um jogo oferecido, com a sua análise completa."
            },
            {
              "type": "cta",
              "label": "Voltar ao IASHARK",
              "link": "home"
            },
            {
              "type": "p",
              "text": "Se estes emails já não te servem, cancela a subscrição com um clique no link no fim desta mensagem. Sem notícias tuas, deixo de te escrever de qualquer forma dentro de 30 dias."
            }
          ]
        },
        "pro_weekly_summary": {
          "subject": "O teu fim de semana Pro: os grandes jogos analisados",
          "preheader": "A aposta de cada jogo do fim de semana está pronta.",
          "title": "O teu fim de semana Pro",
          "blocks": [
            {
              "type": "p",
              "text": "Os grandes jogos deste fim de semana estão analisados. No teu espaço Pro: a aposta escolhida em cada jogo com a sua odd, os marcadores do dia e as tuas ferramentas."
            },
            {
              "type": "matches"
            },
            {
              "type": "cta",
              "label": "Abrir o meu espaço Pro",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Podes desativar este resumo em A minha conta, secção Notificações."
            }
          ]
        },
        "trial_ending": {
          "subject": "O teu teste do IASHARK Pro termina dentro de 2 dias",
          "preheader": "Depois, o Pro continua sozinho: {{trialAmount}} {{trialPer}}.",
          "title": "O teu teste Pro está a terminar",
          "blocks": [
            {
              "type": "p",
              "text": "O teu teste gratuito do IASHARK Pro termina no {{trialEndDate}}."
            },
            {
              "type": "p",
              "text": "Depois, a tua subscrição Pro continua sem teres de fazer nada: {{trialAmount}} {{trialPer}}, cobrados no cartão registado."
            },
            {
              "type": "p",
              "text": "Até lá, aproveita ao máximo: todos os jogos analisados, a aposta escolhida em cada jogo com a sua odd, os marcadores do dia e as ferramentas Pro."
            },
            {
              "type": "cta",
              "label": "Abrir o meu espaço Pro",
              "link": "tools"
            },
            {
              "type": "p",
              "text": "Se preferires parar, cancela antes dessa data em A minha conta, secção Subscrição: nada será cobrado."
            },
            {
              "type": "link",
              "label": "Gerir a minha subscrição",
              "link": "subscription"
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
        "market": "us",
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
      },
      "checkoutOpen": [
        "week",
        "month",
        "year"
      ]
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
      },
      "checkoutOpen": [
        "month"
      ]
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
      },
      "checkoutOpen": [
        "week",
        "month"
      ]
    },
    "us": {
      "currency": "USD",
      "intlLocale": "en-US",
      "priceIntlLocale": "en-US",
      "helpline": null,
      "prices": {
        "pro": {
          "week": {
            "amount": 4.99
          },
          "month": {
            "amount": 19.99
          },
          "year": null
        }
      },
      "checkoutOpen": [
        "week",
        "month"
      ]
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
      },
      "checkoutOpen": [
        "week",
        "month",
        "year"
      ]
    }
  }
};
export { Render, Lifecycle, FreeMatch, MatchTime };
export default Lifecycle;
