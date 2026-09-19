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
